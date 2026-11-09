import { sanitizeRecord } from '../state-sanitize.mjs';

export class CalculationRecordError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CalculationRecordError';
  }
}

export const CALCULATION_TYPES = Object.freeze(['civel', 'trabalhista', 'previdenciario']);
export const MAX_CALCULATIONS = 200;
export const MAX_RECORD_CHARACTERS = 150_000;
export const MAX_RESULT_CHARACTERS = 120_000;
const MAX_ID_CHARACTERS = 80;
const MAX_TITULO_CHARACTERS = 160;
const MAX_ACTOR_CHARACTERS = 120;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateCalculationRecord(record) {
  if (!isPlainObject(record)) throw new CalculationRecordError('Cálculo salvo deve ser um objeto.');
  if (typeof record.id !== 'string' || !record.id.trim() || record.id.length > MAX_ID_CHARACTERS) {
    throw new CalculationRecordError('Cálculo salvo exige id válido.');
  }
  if (!CALCULATION_TYPES.includes(record.tipo)) {
    throw new CalculationRecordError(`Tipo de cálculo inválido: ${record.tipo}.`);
  }
  if (record.titulo !== undefined && (typeof record.titulo !== 'string' || record.titulo.length > MAX_TITULO_CHARACTERS)) {
    throw new CalculationRecordError('Título do cálculo salvo é inválido.');
  }
  if (!isPlainObject(record.entrada)) throw new CalculationRecordError('Cálculo salvo exige entrada.');
  if (!isPlainObject(record.resultado)) throw new CalculationRecordError('Cálculo salvo exige resultado.');
  if (record.createdAt !== undefined && typeof record.createdAt !== 'string') {
    throw new CalculationRecordError('Data de criação do cálculo salvo é inválida.');
  }
  if (record.createdBy !== undefined && (typeof record.createdBy !== 'string' || record.createdBy.length > MAX_ACTOR_CHARACTERS)) {
    throw new CalculationRecordError('Autor do cálculo salvo é inválido.');
  }
  if (JSON.stringify(record).length > MAX_RECORD_CHARACTERS) {
    throw new CalculationRecordError('Cálculo salvo excede o limite de armazenamento.');
  }
  return true;
}

export function compactResultado(resultado, cap = MAX_RESULT_CHARACTERS) {
  if (!isPlainObject(resultado)) throw new CalculationRecordError('Resultado do cálculo deve ser um objeto.');
  const clean = sanitizeRecord(resultado);
  if (JSON.stringify(clean).length <= cap) return clean;
  let compactado = false;
  if (Array.isArray(clean.memoria)) {
    clean.memoria = clean.memoria.map(entry => {
      if (!isPlainObject(entry) || !Array.isArray(entry.meses)) return entry;
      compactado = true;
      const { meses, ...rest } = entry;
      return { ...rest, memoriaMensalRemovida: true };
    });
  }
  if (JSON.stringify(clean).length > cap) {
    throw new CalculationRecordError('Resultado do cálculo excede o limite mesmo com a memória mensal resumida.');
  }
  return compactado ? { ...clean, memoriaCompactada: true } : clean;
}

export function sanitizeCalculationRecord(record) {
  if (!isPlainObject(record)) return null;
  try {
    validateCalculationRecord(sanitizeRecord(record));
  } catch (error) {
    return null;
  }
  const clean = sanitizeRecord(record);
  return {
    id: String(clean.id).trim().slice(0, MAX_ID_CHARACTERS),
    tipo: clean.tipo,
    titulo: typeof clean.titulo === 'string' ? clean.titulo.slice(0, MAX_TITULO_CHARACTERS) : 'Cálculo',
    entrada: clean.entrada,
    resultado: clean.resultado,
    createdAt: typeof clean.createdAt === 'string' ? clean.createdAt : null,
    createdBy: typeof clean.createdBy === 'string' ? clean.createdBy.slice(0, MAX_ACTOR_CHARACTERS) : null,
    schemaVersion: 1
  };
}

export function sanitizeCalculations(list, max = MAX_CALCULATIONS) {
  if (!Array.isArray(list)) return [];
  const byId = new Map();
  for (const raw of list) {
    const clean = sanitizeCalculationRecord(raw);
    if (!clean) continue;
    byId.delete(clean.id);
    byId.set(clean.id, clean);
    if (byId.size > max) {
      const oldest = byId.keys().next().value;
      byId.delete(oldest);
    }
  }
  return [...byId.values()];
}

export function summarizeCalculation(record) {
  if (!isPlainObject(record)) throw new CalculationRecordError('Cálculo salvo inválido.');
  const resumo = isPlainObject(record.resultado?.resumo) ? record.resultado.resumo : {};
  const valor = resumo.total ?? resumo.liquido ?? resumo.rmi ?? null;
  return {
    id: record.id,
    tipo: record.tipo,
    titulo: record.titulo || 'Cálculo',
    createdAt: record.createdAt || null,
    createdBy: record.createdBy || null,
    valor,
    referencia: record.resultado?.atualizacaoAte || record.resultado?.ultimaCompetencia || record.resultado?.desligamento || null,
    memoriaCompactada: record.resultado?.memoriaCompactada === true
  };
}
