import { parseDec, toFixedString } from './decimal.mjs';
import { plural } from '../plural.mjs';
import { partsFromIso } from './calendar.mjs';

export class HtmImportCivelError extends Error {
  constructor(message) {
    super(message);
    this.name = 'HtmImportCivelError';
  }
}

function stripTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeBrDateToIso(text) {
  const m = /\b(\d{2})\/(\d{2})\/(\d{4})\b/.exec(text);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  try {
    partsFromIso(iso);
    return iso;
  } catch {
    return null;
  }
}

function extractMoneyCandidate(text) {
  const m = /-?(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/.exec(text);
  if (!m) return null;
  try {
    const normalized = m[1].replace(/\./g, '').replace(',', '.');
    const dec = parseDec(normalized);
    const absDec = dec < 0n ? -dec : dec;
    if (absDec <= 0n) return null;
    return toFixedString(absDec, 2);
  } catch {
    return null;
  }
}

/**
 * Audita e repara arquivos .htm/.html salvos de planilhas legadas (incluindo links
 * http:// quebrados em arquivos anteriores a 01/06/2023) e extrai itens tabulares
 * com data e valor para reimportação limpa na planilha cível do ATRIUM.
 */
export function auditLegacyHtmSheet(rawHtml) {
  if (typeof rawHtml !== 'string' || !rawHtml.trim()) {
    throw new HtmImportCivelError('Informe o conteúdo HTML da planilha para análise.');
  }
  const avisos = [];
  const httpMatches = rawHtml.match(/http:\/\//gi) || [];
  const detectedHttpLegacyUrls = httpMatches.length;
  const affectedByPre2023SslBug = detectedHttpLegacyUrls > 0;

  if (affectedByPre2023SslBug) {
    avisos.push(
      `Detectadas ${detectedHttpLegacyUrls} ${plural(detectedHttpLegacyUrls, 'referência', 'referências')} "http://" legadas (arquivos salvos antes de 01/06/2023). O HTML reparado converte automaticamente para "https://".`
    );
  }

  const charsetMatch = /charset=([a-zA-Z0-9_-]+)/i.exec(rawHtml);
  const detectedCharsetHint = charsetMatch ? charsetMatch[1].toLowerCase() : null;
  if (rawHtml.includes('Ã¡') || rawHtml.includes('Ã§') || rawHtml.includes('Ã©')) {
    avisos.push('Possível divergência de acentuação (UTF-8 vs ISO-8859-1) detectada; confira as descrições antes de usar.');
  }

  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(rawHtml);
  const pageTitle = titleMatch ? stripTags(titleMatch[1]) : 'Planilha importada';

  const summaryRows = [];
  const extractedItems = [];
  const trRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(rawHtml)) !== null) {
    const rowHtml = trMatch[1];
    const cells = [];
    const cellRegex = /<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      const cleaned = stripTags(cellMatch[1]);
      if (cleaned) cells.push(cleaned);
    }

    if (cells.length === 2 && cells[0].length <= 80 && cells[1].length <= 80) {
      summaryRows.push({ rotulo: cells[0], valor: cells[1] });
    }

    if (cells.length >= 3) {
      const joined = cells.join(' | ');
      const isoDate = normalizeBrDateToIso(joined);
      const amount = extractMoneyCandidate(joined);
      if (isoDate && amount) {
        const isTotalLine = /\b(total|subtotal|consolidado|l[ií]quido)\b/i.test(cells[0]);
        if (!isTotalLine) {
          const isCusta = /custa|despesa/i.test(joined);
          const isAmort = /amortiza|pagamento|abati|cr[eé]dito|desconto/i.test(joined);
          const descricao = cells.find(c => !normalizeBrDateToIso(c) && !extractMoneyCandidate(c))
            || `Parcela ${extractedItems.length + 1}`;
          extractedItems.push({
            id: `htm-${extractedItems.length + 1}`,
            especie: isCusta ? 'custas' : isAmort ? 'amortizacao' : 'debito',
            descricao: descricao.slice(0, 120),
            data: isoDate,
            valor: amount,
            jurosDe: isoDate
          });
        }
      }
    }
  }

  if (extractedItems.length === 0) {
    avisos.push('Nenhuma linha de parcela com Data (DD/MM/AAAA) e Valor (0,00) reconhecida automaticamente nas tabelas deste HTML.');
  }

  const repairedHtml = affectedByPre2023SslBug ? rawHtml.replace(/http:\/\//gi, 'https://') : rawHtml;

  return {
    modalidade: 'auditoria_htm',
    pageTitle,
    detectedCharsetHint,
    detectedHttpLegacyUrls,
    affectedByPre2023SslBug,
    summaryRows: summaryRows.slice(0, 25),
    extractedItems,
    avisos,
    repairedHtml
  };
}
