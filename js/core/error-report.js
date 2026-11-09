/**
 * ATRIUM — Relato de erro (frontend)
 *
 * Espelha a regra do servidor para gerar o mesmo código determinístico (SHA-256
 * dos campos redigidos) e a mesma prévia exibida ao usuário antes do envio.
 * O servidor reaplica a redação e o código como autoridade; se o navegador não
 * oferecer Web Crypto, o código é provisório até a confirmação do servidor.
 */

const MAX_SCOPE = 120;
const MAX_MESSAGE = 1_200;
const MAX_DETAILS = 4_000;

const REDACTIONS = [
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[e-mail removido]'],
  [/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[CPF removido]'],
  [/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, '[CNPJ removido]'],
  [/\b(?:\+?55\s*)?\(?\d{2}\)?\s*9?\d{4}[-\s]?\d{4}\b/g, '[telefone removido]'],
  [/\b(?:bearer|token|api[_-]?key|senha|password|secret|cookie)\s*[:=]\s*\S+/gi, '$1: [removido]'],
  [/\b[A-Za-z0-9_-]{40,}\b/g, '[credencial removida]'],
  [/\b\d{20}\b/g, '[número com 20 dígitos removido]']
];

function fnvDigest(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0').toUpperCase();
}

async function sha256Digest(value) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const bytes = new TextEncoder().encode(value);
  const digest = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest).slice(0, 4)].map(byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function redactErrorReportText(value, { max = MAX_DETAILS } = {}) {
  let text = String(value ?? '').replace(/\r\n?/g, '\n').trim();
  for (const [pattern, replacement] of REDACTIONS) text = text.replace(pattern, replacement);
  return text.slice(0, max);
}

export async function buildErrorReportCode({ scope = '', message = '', details = '', date = new Date() } = {}) {
  const basis = [String(scope), String(message), String(details)].join('\u0000');
  const day = date.toISOString().slice(0, 10).replace(/-/g, '');
  const digest = await sha256Digest(basis);
  if (digest) return { code: `ATR-${day}-${digest}`, provisional: false };
  return { code: `ATR-${day}-${fnvDigest(basis)}`, provisional: true };
}

export async function buildErrorReportPayload(input = {}) {
  const scope = redactErrorReportText(input.scope, { max: MAX_SCOPE }).replace(/\s+/g, ' ') || 'ATRIUM';
  const message = redactErrorReportText(input.message, { max: MAX_MESSAGE });
  const details = redactErrorReportText(input.details, { max: MAX_DETAILS });
  const { code, provisional } = await buildErrorReportCode({ scope, message, details, date: input.date });
  return { code, provisional, scope, message, details };
}
