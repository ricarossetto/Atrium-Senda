/**
 * ATRIUM — Relato de erro com código próprio e envio opcional ao suporte
 *
 * Módulo puro: gera o código determinístico do incidente, redige dados
 * sensíveis (e-mail, CPF/CNPJ, telefone, tokens, chaves, cookies) e normaliza
 * o payload do relato. O servidor reaplica a redação como autoridade — o
 * cliente nunca decide o que sai daqui.
 *
 * O código é derivado de escopo + mensagem + detalhes: o mesmo problema gera o
 * mesmo código (dedupe e contagem no suporte) e nunca contém dado pessoal.
 */

import { createHash } from 'node:crypto';

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

export function redactErrorReportText(value, { max = MAX_DETAILS } = {}) {
  let text = String(value ?? '').replace(/\r\n?/g, '\n').trim();
  for (const [pattern, replacement] of REDACTIONS) text = text.replace(pattern, replacement);
  return text.slice(0, max);
}

export function buildErrorReportCode({ scope = '', message = '', details = '' } = {}) {
  const basis = [String(scope), String(message), String(details)].join('\u0000');
  const digest = createHash('sha256').update(basis, 'utf8').digest('hex').slice(0, 8).toUpperCase();
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `ATR-${day}-${digest}`;
}

export function normalizeErrorReport(input = {}, { now = () => new Date().toISOString() } = {}) {
  const scope = redactErrorReportText(input.scope, { max: MAX_SCOPE }).replace(/\s+/g, ' ');
  const message = redactErrorReportText(input.message, { max: MAX_MESSAGE });
  const details = redactErrorReportText(input.details, { max: MAX_DETAILS });
  if (!message) {
    throw Object.assign(new Error('Informe a mensagem do erro para gerar o relato.'), { statusCode: 400 });
  }
  return {
    code: buildErrorReportCode({ scope, message, details }),
    scope: scope || 'ATRIUM',
    message,
    details,
    createdAt: now(),
    appVersion: redactErrorReportText(input.appVersion, { max: 40 })
  };
}
