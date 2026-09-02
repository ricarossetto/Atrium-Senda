const CPF_WEIGHTS = Object.freeze([
  Object.freeze([10, 9, 8, 7, 6, 5, 4, 3, 2]),
  Object.freeze([11, 10, 9, 8, 7, 6, 5, 4, 3, 2])
]);

const CNPJ_WEIGHTS = Object.freeze([
  Object.freeze([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]),
  Object.freeze([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
]);

export function normalizeCpf(value) {
  return String(value ?? '').replace(/\D/g, '');
}

export function isValidCpf(value) {
  const normalized = normalizeCpf(value);
  if (!/^\d{11}$/.test(normalized) || /^(\d)\1{10}$/.test(normalized)) return false;
  const digits = [...normalized].map(Number);
  const first = cpfDigit(digits.slice(0, 9), CPF_WEIGHTS[0]);
  const second = cpfDigit([...digits.slice(0, 9), first], CPF_WEIGHTS[1]);
  return digits[9] === first && digits[10] === second;
}

export function formatCpf(value) {
  const normalized = normalizeCpf(value);
  if (normalized.length !== 11) return normalized;
  return normalized.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
}

export function normalizeCnpj(value) {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidCnpj(value) {
  const normalized = normalizeCnpj(value);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(normalized)) return false;
  if (/^(.)\1{13}$/.test(normalized)) return false;
  const base = normalized.slice(0, 12);
  const first = cnpjDigit(base, CNPJ_WEIGHTS[0]);
  const second = cnpjDigit(`${base}${first}`, CNPJ_WEIGHTS[1]);
  return normalized.slice(12) === `${first}${second}`;
}

export function formatCnpj(value) {
  const normalized = normalizeCnpj(value);
  if (normalized.length !== 14) return normalized;
  return normalized.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5');
}

export function classifyBrazilianDocument(value) {
  const raw = String(value ?? '').trim();
  const cnpj = normalizeCnpj(raw);
  if (cnpj.length === 14) return { type: 'cnpj', normalized: cnpj, formatted: formatCnpj(cnpj), valid: isValidCnpj(cnpj) };
  const cpf = normalizeCpf(raw);
  if (cpf.length === 11) return { type: 'cpf', normalized: cpf, formatted: formatCpf(cpf), valid: isValidCpf(cpf) };
  return { type: 'unknown', normalized: cnpj, formatted: raw, valid: false };
}

function cpfDigit(digits, weights) {
  const remainder = digits.reduce((total, digit, index) => total + digit * weights[index], 0) % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function cnpjDigit(value, weights) {
  const remainder = [...value].reduce((total, character, index) => total + (character.charCodeAt(0) - 48) * weights[index], 0) % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}
