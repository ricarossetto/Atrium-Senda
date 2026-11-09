/**
 * ATRIUM Sovereign Judicial Connectivity — Eproc Case Details & Cover Parser
 *
 * Generic, zero-DOM-dependency HTML parser for process cover, metadata,
 * access keys, and parties across the eproc family.
 */
import { extractProcessSecrecy } from './process-secrecy.mjs';

const CNJ_REGEX = /\b(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})\b/;

function cleanText(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts the process access key (Chave de Acesso / Chave do Processo)
 */
export function extractEprocAccessKey(html) {
  if (!html || typeof html !== 'string') return '';

  // 1. Input with value attribute: <input ... name="...ChaveProcesso..." or "...ChaveDocumento..." value="ABC123XYZ" ...>
  const inputMatch = html.match(/<input[^>]+(?:id|name)=[\"'][^\"']*(?:ChaveProcesso|ChaveDocumento|ChaveAcesso|Chave)[^\"']*[\"'][^>]+value=[\"']([a-zA-Z0-9]{6,32})[\"']/i)
    || html.match(/<input[^>]+value=[\"']([a-zA-Z0-9]{6,32})[\"'][^>]+(?:id|name)=[\"'][^\"']*(?:ChaveProcesso|ChaveDocumento|ChaveAcesso|Chave)[^\"']*[\"']/i);
  if (inputMatch) return inputMatch[1].trim();

  // 2. Direct span or div contents: <span id="spnChaveProcesso">987654321012</span>
  const spanMatch = html.match(/<(?:span|div)[^>]+(?:id|name|class)=[\"'][^\"']*(?:ChaveProcesso|ChaveDocumento|ChaveAcesso)[^\"']*[\"'][^>]*>([a-zA-Z0-9]{6,32})<\//i);
  if (spanMatch) return spanMatch[1].trim();

  // 3. Data attributes: data-chave="..."
  const dataMatch = html.match(/data-(?:chave|key)=[\"']([a-zA-Z0-9]{6,32})[\"']/i);
  if (dataMatch) return dataMatch[1].trim();

  // 4. Javascript function call: buscarChaveProcesso('...') or onclick="...('123456')..."
  const fnMatch = html.match(/(?:buscar|consultar)?ChaveProcesso\s*\(\s*[\"']([a-zA-Z0-9]{6,32})[\"']\s*\)/i);
  if (fnMatch) return fnMatch[1].trim();

  // 5. Text pattern: Chave do Processo: 123456789
  const textMatch = html.match(/(?:chave\s*(?:do\s+processo|de\s+acesso|de\s+consulta)?|chave)[\s:eé=]+([a-zA-Z0-9]{6,32})/i);
  if (textMatch && !/^(?:processo|acesso|chave)$/i.test(textMatch[1])) {
    return textMatch[1].trim();
  }

  return '';
}

/**
 * Parses process cover metadata from eproc process details page
 */
export function parseEprocCaseDetails(html) {
  if (!html || typeof html !== 'string') return null;

  const cnjMatch = html.match(CNJ_REGEX);
  const number = cnjMatch ? cnjMatch[1] : '';
  const cnj = number.replace(/\D/g, '');

  const getById = (id) => {
    const m = html.match(new RegExp(`id=["']${id}["'][^>]*>([\\s\\S]*?)<`, 'i'));
    return m ? cleanText(m[1]) : '';
  };

  const findField = (labelPattern) => {
    // 1. Label followed by value inside same element or text line: e.g. <div>Classe: Procedimento Comum Cível</div>
    const containerRegex = new RegExp(`(?:${labelPattern})[:\\s]+([a-zA-Z0-9À-ÿªº°][^<\\r\\n]+?)(?:<|\\r|\\n|$)`, 'i');
    const m = html.match(containerRegex);
    if (m) return cleanText(m[1]);

    // 2. Label inside a cell/tag followed by next cell/tag value: e.g. <td>Classe:</td><td>Procedimento Comum</td>
    const nextTagRegex = new RegExp(`(?:${labelPattern})[:\\s]*<\\/[a-z0-9]+>\\s*<[a-z0-9]+[^>]*>([\\s\\S]*?)<\\/`, 'i');
    const mNext = html.match(nextTagRegex);
    if (mNext) return cleanText(mNext[1]);

    return '';
  };

  const actionClass = getById('txtClasse')
    || (html.match(/aria-description=["']Classe da ação:["'][^>]*>([\s\S]*?)<\//i)?.[1] ? cleanText(html.match(/aria-description=["']Classe da ação:["'][^>]*>([\s\S]*?)<\//i)[1]) : '')
    || findField('Classe da ação|Classe');
  const competence = getById('txtCompetencia') || findField('Competência');
  const distributionDate = getById('txtAutuacao') || findField('Data de autuação|Data da autuação|Data autuação|Data de distribuição|Distribuição:');
  const judicialUnit = getById('txtOrgaoJulgador') || findField('Órgão Julgador|Juízo|Unidade Judiciária|Vara:');
  const judge = getById('txtMagistrado') || findField('Juiz\\(a\\)|Magistrado');
  const status = getById('txtSituacao') || findField('Situação|Fase') || 'ATIVO';

  // Valor da causa
  let caseValue = '';
  const valMatch = html.match(/Valor\s*(?:da)?\s*Causa[:\s]*[\r\n\s]*(?:<[^>]*>)?(R\$\s*[\d.,]+|[\d.,]+)/i);
  if (valMatch) {
    caseValue = cleanText(valMatch[1]);
  } else {
    caseValue = findField('Valor da Causa');
  }

  // Segredo de justiça: nível do PROCESSO (nunca rótulos de documentos/anexos).
  const processSecrecy = extractProcessSecrecy(html);

  // Chave de acesso
  const accessKey = extractEprocAccessKey(html);

  return {
    number,
    cnj,
    actionClass,
    competence,
    distributionDate,
    judicialUnit,
    judge,
    status,
    caseValue,
    secrecyLevel: processSecrecy.level,
    secrecyExplicit: processSecrecy.explicit,
    accessKey
  };
}

/**
 * Extracts parties and representatives from eproc process details table
 */
export function parseEprocParties(html) {
  if (!html || typeof html !== 'string') return [];
  const parties = [];

  // 1. Targeted check for tblPartesERepresentantes (eproc 1G and 2G standard)
  const tblPartesMatch = html.match(/<table[^>]+id=["']tblPartesERepresentantes["'][^>]*>([\s\S]*?)<\/table>/i);
  if (tblPartesMatch) {
    const tableHtml = tblPartesMatch[1];
    const trMatches = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
    for (const tr of trMatches) {
      const rowHtml = tr[1];
      if (rowHtml.includes('<th')) continue;
      const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]);
      if (cells.length < 2) continue;

      const parseSide = (sideHtml, defaultPole) => {
        const cleanSide = cleanText(sideHtml.replace(/<style[\s\S]*?<\/style>/gi, ''));
        if (!cleanSide) return;

        const docMatch = cleanSide.match(/\b(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/);
        const partyDoc = docMatch ? docMatch[0] : null;

        const lawyerMatches = [...cleanSide.matchAll(/([A-ZÀ-ÿ\s]+)\s+([A-Z]{2}\d{1,8})\s+Tipo de Usu[aá]rio:\s*ADVOGADO/gi)];

        let mainName = cleanSide.split(/(?:\(\s*[\d\.\-\/]+\s*\)|Tipo de Usu[aá]rio)/)[0].trim();
        mainName = mainName.replace(/^[^\wÀ-ÿ]+/, '').trim();

        parties.push({
          role: defaultPole === 'ACTIVE' ? 'AUTOR' : 'RÉU',
          name: mainName,
          pole: defaultPole,
          documentNumber: partyDoc,
          oab: null
        });

        for (const lm of lawyerMatches) {
          parties.push({
            role: 'ADVOGADO',
            name: lm[1].trim(),
            pole: 'ATTORNEY',
            documentNumber: null,
            oab: lm[2].replace(/\s+/g, '')
          });
        }
      };

      parseSide(cells[0], 'ACTIVE');
      parseSide(cells[1], 'PASSIVE');
    }

    if (parties.length > 0) return parties;
  }

  // 2. Generic fallback for other eproc variations
  const blockMatches = html.match(/<table[^>]*class=[\"'][^\"']*infraTable[^\"']*[\"'][^>]*>[\s\S]*?<\/table>/gi)
    || html.match(/<table[^>]*>[\s\S]*?<\/table>/gi)
    || [];

  for (const table of blockMatches) {
    if (!/Partes|Polo|Autor|Réu|Exequente|Executado/i.test(table)) continue;

    const trMatches = table.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    for (const tr of trMatches) {
      if (tr.includes('<th') && !tr.includes('<td')) continue;
      const cells = (tr.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || []).map(cleanText);
      if (cells.length < 2) continue;

      const roleRaw = cells[0] || '';
      const nameRaw = cells[1] || '';
      if (!nameRaw || /Nenhum|Não informado/i.test(nameRaw)) continue;

      let pole = 'OTHER';
      if (/Autor|Exequente|Requerente|Embargante|Impetrante|Apelante/i.test(roleRaw)) pole = 'ACTIVE';
      else if (/Réu|Executado|Requerido|Embargado|Impetrado|Apelado/i.test(roleRaw)) pole = 'PASSIVE';
      else if (/Advogado|Procurador/i.test(roleRaw)) pole = 'ATTORNEY';

      const cpfCnpjMatch = nameRaw.match(/\b(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/);
      const oabMatch = nameRaw.match(/OAB[\/:\s]+([A-Z]{2})[\s\.\/-]*(\d{1,8})/i)
        || (cells[2] && cells[2].match(/OAB[\/:\s]+([A-Z]{2})[\s\.\/-]*(\d{1,8})/i));

      parties.push({
        role: roleRaw,
        name: cleanText(nameRaw.replace(/\b(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})\b/, '')),
        pole,
        documentNumber: cpfCnpjMatch ? cpfCnpjMatch[0] : null,
        oab: oabMatch ? `${oabMatch[1].toUpperCase()}${oabMatch[2]}` : null
      });
    }
  }

  return parties;
}
