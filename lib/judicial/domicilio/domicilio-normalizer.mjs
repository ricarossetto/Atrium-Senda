/**
 * ATRIUM — Normalizador do Domicílio Eletrônico (PDPJ)
 *
 * Converte a comunicação oficial do Domicílio Eletrônico para o registro
 * oficial de intimações do ATRIUM (`externalId: domicilio:<numeroComunicacao>`),
 * preservando a reconciliação com DJEN/eproc/PJe pela identidade existente.
 *
 * Contrato (specs/publication-treatment.md):
 * - a data da fonte (`dataComunicacao`) vira `disponibilizadoEm`/`sourceReportedAt`;
 * - prazo declarado pela fonte só entra como `sourceReportedDeadlineAt` +
 *   `sourceReportedDeadlineSource: 'domicilio'` — referência, nunca prazo operativo;
 * - `dataFinalCiencia` vira `noticeDeadlineAt` (referência de ciência), nunca `deadline`;
 * - `deadline`/`fatalDeadline` nunca são inferidos;
 * - ciência no portal é estado da fonte (`domicilioMeta.ciente`), jamais tratamento
 *   no ATRIUM: `treatmentStatus` permanece `untreated` e nada é confirmado em nome do usuário;
 * - somente o que a fonte declara é mapeado (sem inferir cliente, responsável ou prazo).
 */
import { createHash } from 'node:crypto';
import { decodeHtmlEntities } from '../../../collector/adapters/djen.mjs';

export const DOMICILIO_SOURCE_ID = 'domicilio';
export const DOMICILIO_PORTAL_ID = 'domicilio-eletronico';
const MAX_DOCUMENT_LINKS = 10;
const MAX_LAWYERS = 20;

function text(value, max = 300) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function communicationText(value) {
  const raw = String(value ?? '').slice(0, 200_000);
  if (!/<(?:!doctype\s+html|\/?(?:html|head|body|p|div|br|span|table|script|style)\b)/i.test(raw)) return text(raw, 200_000);
  const stripped = raw
    .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, ' ')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ');
  return text(decodeHtmlEntities(stripped), 200_000);
}

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function dateOnly(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})T/);
  return iso ? iso[1] : null;
}

function formatCnj(value) {
  const only = digits(value);
  if (only.length !== 20) return text(value, 80);
  return `${only.slice(0, 7)}-${only.slice(7, 9)}.${only.slice(9, 13)}.${only.slice(13, 14)}.${only.slice(14, 16)}.${only.slice(16)}`;
}

function safeHttpsLinks(values) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const raw = typeof value === 'string' ? value : value?.url || value?.link || '';
    let parsed;
    try { parsed = new URL(String(raw).trim()); } catch { continue; }
    if (parsed.protocol !== 'https:') continue;
    const href = parsed.toString();
    if (seen.has(href)) continue;
    seen.add(href);
    out.push(href);
    if (out.length >= MAX_DOCUMENT_LINKS) break;
  }
  return out;
}

function normalizeLawyers(representantes) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(representantes) ? representantes : []) {
    const nome = text(raw?.nome ?? raw?.nomeAdvogado ?? raw?.representante, 160);
    const oabNumber = digits(raw?.numeroOab ?? raw?.oab ?? raw?.inscricaoOab);
    const uf = text(raw?.ufOab ?? raw?.oabUf ?? raw?.uf, 2).toUpperCase();
    if (!nome && !oabNumber) continue;
    const key = `${nome}|${oabNumber}|${uf}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: nome || null,
      oab: oabNumber || null,
      uf: /^[A-Z]{2}$/.test(uf) ? uf : null
    });
    if (out.length >= MAX_LAWYERS) break;
  }
  return out;
}

function formatLawyersLabel(lawyers) {
  return lawyers
    .map(lawyer => {
      if (lawyer.name && lawyer.oab && lawyer.uf) return `${lawyer.name} (OAB/${lawyer.uf} ${lawyer.oab})`;
      if (lawyer.name) return lawyer.name;
      if (lawyer.oab && lawyer.uf) return `OAB/${lawyer.uf} ${lawyer.oab}`;
      return lawyer.oab || '';
    })
    .filter(Boolean)
    .join(' · ')
    .slice(0, 400);
}

export function domicilioExternalId(raw) {
  const numeroComunicacao = text(raw?.numeroComunicacao ?? raw?.numero ?? raw?.id, 60);
  if (numeroComunicacao) return `${DOMICILIO_SOURCE_ID}:${numeroComunicacao}`;
  // Sem número oficial, usa impressão estável dos campos declarados — nunca aleatória.
  const fingerprint = createHash('sha256')
    .update([raw?.numeroProcesso, raw?.dataComunicacao, raw?.tipoComunicacao, raw?.tipoIntimacao].map(value => String(value ?? '')).join('|'), 'utf8')
    .digest('hex')
    .slice(0, 32);
  return `${DOMICILIO_SOURCE_ID}:fp:${fingerprint}`;
}

export function buildDomicilioText(raw) {
  // Texto integral declarado pela fonte (Central de Comunicações) tem precedência:
  // é o teor completo da intimação, sem resumo.
  const integral = communicationText(raw?.texto);
  if (integral) return integral;
  const partes = [];
  const tribunal = text(raw?.tribunalOrigem, 120);
  const orgao = text(raw?.orgaoLegal ?? raw?.orgaoJulgador, 160);
  const vara = text(raw?.varaJudicial, 160);
  const classe = text(raw?.classe, 120);
  const assunto = text(raw?.assunto, 240);
  const magistrado = text(raw?.magistrado, 160);
  const meioEnvio = text(raw?.meioEnvio, 40);
  if (tribunal) partes.push(`Tribunal: ${tribunal}`);
  if (vara) partes.push(`Vara: ${vara}`);
  if (orgao) partes.push(`Órgão: ${orgao}`);
  if (classe) partes.push(`Classe: ${classe}`);
  if (assunto) partes.push(`Assunto: ${assunto}`);
  if (magistrado) partes.push(`Magistrado: ${magistrado}`);
  if (meioEnvio) partes.push(`Meio de envio: ${meioEnvio}`);
  partes.push('Comunicação capturada do Domicílio Eletrônico (PDPJ/Jus.br). Prazo oficial é o do eproc quando divergir.');
  return partes.join('\n');
}

/**
 * @param {object} raw comunicação da API oficial
 * @param {{ collectedAt?: string|null, portalId?: string }} options
 * @returns {object|null} intimação oficial ou null quando não há identificação mínima
 */
export function normalizeDomicilioComunicacao(raw, { collectedAt = null, portalId = DOMICILIO_PORTAL_ID } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const externalId = domicilioExternalId(raw);
  const processNumber = formatCnj(raw?.numeroProcesso);
  const comunicadoEm = dateOnly(raw?.dataComunicacao);
  const sourceReportedDeadlineAt = dateOnly(raw?.prazo);
  const noticeDeadlineAt = dateOnly(raw?.dataFinalCiencia);
  const tipoComunicacao = text(raw?.tipoComunicacao, 80);
  const tipoIntimacao = text(raw?.tipoIntimacao, 80);
  const lawyers = normalizeLawyers(raw?.representantes);
  const documentLinks = safeHttpsLinks([
    ...(Array.isArray(raw?.linksDocumentos) ? raw.linksDocumentos : []),
    ...(Array.isArray(raw?.linksDocumentosAdicionais) ? raw.linksDocumentosAdicionais : []),
    ...(typeof raw?.link === 'string' ? [raw.link] : [])
  ]);
  const portalHash = text(raw?.hash, 120);
  const textoIntegral = communicationText(raw?.texto);

  return {
    id: externalId,
    externalId,
    type: DOMICILIO_SOURCE_ID,
    source: 'Domicílio Eletrônico (PDPJ)',
    sourcePortal: portalId,
    court: text(raw?.tribunalOrigem, 120) || null,
    process: processNumber,
    processNumber,
    title: tipoComunicacao || 'Comunicação do Domicílio Eletrônico',
    event: tipoComunicacao || tipoIntimacao || 'Comunicação',
    text: textoIntegral
      ? textoIntegral.slice(0, 240) + (textoIntegral.length > 240 ? '\u2026' : '')
      : buildDomicilioText(raw),
    ...(comunicadoEm ? { disponibilizadoEm: comunicadoEm, sourceReportedAt: comunicadoEm } : {}),
    ...(sourceReportedDeadlineAt ? { sourceReportedDeadlineAt, sourceReportedDeadlineSource: DOMICILIO_SOURCE_ID } : {}),
    ...(noticeDeadlineAt ? { noticeDeadlineAt } : {}),
    ...(collectedAt ? { sourceCollectedAt: collectedAt } : {}),
    ...(lawyers.length ? { publicationLawyers: lawyers, lawyers: formatLawyersLabel(lawyers) } : {}),
    ...(documentLinks.length ? { sourceDocuments: documentLinks } : {}),
    ...(portalHash ? { domicilioMeta_hash: portalHash } : {}),
    ...(textoIntegral ? { fullText: textoIntegral, fullTextSource: DOMICILIO_SOURCE_ID } : {}),
    domicilioMeta: {
      tipoComunicacao: tipoComunicacao || null,
      tipoIntimacao: tipoIntimacao || null,
      urgente: raw?.urgente === true,
      tutelaUrgencia: raw?.tutelaUrgencia === true,
      segredoJustica: raw?.segredoJustica === true,
      nivelSigilo: Number.isFinite(Number(raw?.nivelSigilo)) ? Number(raw.nivelSigilo) : null,
      statusFonte: text(raw?.status, 60) || null,
      ciente: raw?.ciente === true,
      dataCiente: dateOnly(raw?.dataCiente),
      meioEnvio: text(raw?.meioEnvio, 40) || null
    },
    status: 'nova',
    unread: true,
    treatmentStatus: 'untreated',
    createdAt: collectedAt || new Date().toISOString(),
    updatedAt: collectedAt || new Date().toISOString()
  };
}

export function normalizeDomicilioBatch(items, options = {}) {
  const intimations = [];
  const skipped = [];
  for (const raw of Array.isArray(items) ? items : []) {
    const normalized = normalizeDomicilioComunicacao(raw, options);
    if (normalized) intimations.push(normalized);
    else skipped.push({ reason: 'invalid-item' });
  }
  return {
    intimations,
    resumo: {
      recebidas: Array.isArray(items) ? items.length : 0,
      normalizadas: intimations.length,
      ignoradas: skipped.length,
      comReferenciaDePrazo: intimations.filter(item => Boolean(item.sourceReportedDeadlineAt)).length,
      comReferenciaDeCiencia: intimations.filter(item => Boolean(item.noticeDeadlineAt)).length,
      urgentes: intimations.filter(item => item.domicilioMeta?.urgente || item.domicilioMeta?.tutelaUrgencia).length
    }
  };
}

/**
 * Minimização para log/auditoria: nenhum nome de parte, advogado ou texto judicial.
 */
export function summarizeDomicilioIntimation(intimation) {
  return {
    externalId: intimation?.externalId || null,
    process: intimation?.process || null,
    data: intimation?.sourceReportedAt || intimation?.disponibilizadoEm || null,
    event: intimation?.event || null,
    hasDeadlineReference: Boolean(intimation?.sourceReportedDeadlineAt),
    hasNoticeReference: Boolean(intimation?.noticeDeadlineAt),
    urgent: Boolean(intimation?.domicilioMeta?.urgente || intimation?.domicilioMeta?.tutelaUrgencia)
  };
}
