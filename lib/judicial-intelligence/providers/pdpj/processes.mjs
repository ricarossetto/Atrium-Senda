import { assertJi, JI_ERROR_CODES } from '../../core/errors.mjs';
import { cleanCnj, formatCnj } from '../../../judicial/omni/contracts.mjs';

export const PDPJ_QUERY_TYPES = Object.freeze(['cnj', 'oab', 'documento', 'nome']);

const OAB_PATTERN = /^(?:oab\s*[\/-]?\s*)?([A-Za-z]{2})?\s*(\d{3,7})$/i;
const CNJ_DIGITS = /^\d{20}$/;
const CPF_DIGITS = /^\d{11}$/;
const CNPJ_DIGITS = /^\d{14}$/;

export function detectPdpjQueryType(value) {
  if (value && typeof value === 'object') {
    if (value.cnj) return 'cnj';
    if (value.oab) return 'oab';
    if (value.documento || value.cpf || value.cnpj) return 'documento';
    if (value.nome) return 'nome';
    return null;
  }
  const text = String(value || '').trim();
  if (!text) return null;
  const digits = text.replace(/\D/g, '');
  if (CNJ_DIGITS.test(digits) && /[-./]/.test(text)) return 'cnj';
  if (CNJ_DIGITS.test(digits)) return 'cnj';
  if (CPF_DIGITS.test(digits) || CNPJ_DIGITS.test(digits)) return 'documento';
  if (OAB_PATTERN.test(text)) return 'oab';
  if (/[A-Za-zÀ-ÿ]{3,}/.test(text)) return 'nome';
  return null;
}

export function buildProcessQuery(input) {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const type = input.type || detectPdpjQueryType(input);
    assertJi(type, JI_ERROR_CODES.INVALID_ARGUMENT, 'Consulta PDPJ sem tipo reconhecível.');
    if (type === 'cnj') return { type, params: { numeroProcesso: cleanCnj(input.cnj ?? input.value) } };
    if (type === 'oab') {
      return {
        type,
        params: {
          numeroOab: String(input.oab ?? input.numeroOab ?? '').replace(/\D/g, ''),
          ufOab: input.uf ? String(input.uf).toUpperCase() : undefined
        }
      };
    }
    if (type === 'documento') {
      return { type, params: { documento: String(input.documento ?? input.cpf ?? input.cnpj ?? '').replace(/\D/g, '') } };
    }
    return { type, params: { nomeParte: String(input.nome ?? input.value ?? '').trim() } };
  }

  const type = detectPdpjQueryType(input);
  assertJi(type, JI_ERROR_CODES.INVALID_ARGUMENT, 'Consulta PDPJ não reconhecida; use CNJ, OAB, CPF/CNPJ ou nome.');
  const text = String(input).trim();
  if (type === 'cnj') return { type, params: { numeroProcesso: cleanCnj(text) } };
  if (type === 'oab') {
    const match = text.match(OAB_PATTERN);
    return { type, params: { numeroOab: match[2], ufOab: match[1] ? match[1].toUpperCase() : undefined } };
  }
  if (type === 'documento') return { type, params: { documento: text.replace(/\D/g, '') } };
  return { type, params: { nomeParte: text } };
}

export function normalizeCnj(value) {
  const digits = cleanCnj(value);
  return formatCnj(digits);
}
