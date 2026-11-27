/**
 * ATRIUM — Estado durável da captura do Domicílio Eletrônico (por workspace)
 *
 * Guarda apenas metadados de janela (datas e contagens): nunca conteúdo judicial,
 * nomes de parte ou advogado. A escrita é atômica (temp + rename) e o arquivo é
 * criado com modo 0600 no diretório do workspace.
 *
 * Regra de janela (decisão do operador): 7 dias na primeira captura por workspace
 * (limite da API oficial por consulta) e 2 dias nos ciclos seguintes.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export const DOMICILIO_SYNC_FILE = 'domicilio-sync.json';
export const DOMICILIO_FIRST_CAPTURE_DAYS = 7;
export const DOMICILIO_ROUTINE_CAPTURE_DAYS = 2;

export function domicilioSyncFileName(identityId = '') {
  const id = String(identityId || '').trim();
  if (!id || id === 'office-primary') return DOMICILIO_SYNC_FILE;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    throw new TypeError('Identificador de identidade inválido para o marcador do Domicílio.');
  }
  return `domicilio-sync.${id}.json`;
}

function isoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError('Data inválida para a janela do Domicílio.');
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

export function emptyDomicilioSyncState() {
  return { version: 1, firstCapturedAt: null, lastCapturedAt: null, lastDataInicio: null, lastDataFim: null, captures: 0, lastRecebidas: 0, lastNormalizadas: 0 };
}

export function normalizeDomicilioSyncState(raw) {
  const base = emptyDomicilioSyncState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  return {
    version: 1,
    firstCapturedAt: typeof raw.firstCapturedAt === 'string' ? raw.firstCapturedAt.slice(0, 32) : null,
    lastCapturedAt: typeof raw.lastCapturedAt === 'string' ? raw.lastCapturedAt.slice(0, 32) : null,
    lastDataInicio: typeof raw.lastDataInicio === 'string' ? raw.lastDataInicio.slice(0, 10) : null,
    lastDataFim: typeof raw.lastDataFim === 'string' ? raw.lastDataFim.slice(0, 10) : null,
    captures: Number.isFinite(Number(raw.captures)) ? Math.max(0, Math.trunc(Number(raw.captures))) : 0,
    lastRecebidas: Number.isFinite(Number(raw.lastRecebidas)) ? Math.max(0, Math.trunc(Number(raw.lastRecebidas))) : 0,
    lastNormalizadas: Number.isFinite(Number(raw.lastNormalizadas)) ? Math.max(0, Math.trunc(Number(raw.lastNormalizadas))) : 0
  };
}

export async function readDomicilioSyncState(dataDirectory, { identityId = '' } = {}) {
  const file = path.join(dataDirectory, domicilioSyncFileName(identityId));
  if (!existsSync(file)) return emptyDomicilioSyncState();
  try {
    return normalizeDomicilioSyncState(JSON.parse(await readFile(file, 'utf8')));
  } catch {
    // Arquivo corrompido não pode travar a captura: recomeça como primeira captura.
    return emptyDomicilioSyncState();
  }
}

export async function writeDomicilioSyncState(dataDirectory, state, { identityId = '' } = {}) {
  const normalized = normalizeDomicilioSyncState(state);
  await mkdir(dataDirectory, { recursive: true });
  const file = path.join(dataDirectory, domicilioSyncFileName(identityId));
  const temporary = `${file}.${process.pid}.${Date.now()}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(normalized, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rename(temporary, file);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
  return normalized;
}

/**
 * Janela do próximo ciclo: 7 dias quando o workspace nunca capturou, 2 dias depois.
 */
export function computeDomicilioWindow(state, { now = new Date() } = {}) {
  const normalized = normalizeDomicilioSyncState(state);
  const primeiraCaptura = !normalized.firstCapturedAt;
  const days = primeiraCaptura ? DOMICILIO_FIRST_CAPTURE_DAYS : DOMICILIO_ROUTINE_CAPTURE_DAYS;
  const dataFim = isoDate(now);
  const start = new Date(`${dataFim}T12:00:00Z`).getTime() - (days - 1) * 86_400_000;
  return {
    dataInicio: new Date(start).toISOString().slice(0, 10),
    dataFim,
    days,
    primeiraCaptura
  };
}

/**
 * Marca o ciclo como capturado (idempotente por janela: repetir a mesma janela não
 * duplica contagem nem move `firstCapturedAt`).
 */
export async function markDomicilioCaptured(dataDirectory, { now = new Date(), window = null, recebidas = 0, normalizadas = 0, identityId = '' } = {}) {
  const current = await readDomicilioSyncState(dataDirectory, { identityId });
  const at = new Date(now).toISOString();
  const dataInicio = window?.dataInicio || current.lastDataInicio || null;
  const dataFim = window?.dataFim || isoDate(now);
  const repeated = current.lastDataInicio === dataInicio && current.lastDataFim === dataFim;
  const next = {
    version: 1,
    firstCapturedAt: current.firstCapturedAt || at,
    lastCapturedAt: at,
    lastDataInicio: dataInicio,
    lastDataFim: dataFim,
    captures: current.captures + (repeated ? 0 : 1),
    lastRecebidas: Math.max(0, Math.trunc(Number(recebidas) || 0)),
    lastNormalizadas: Math.max(0, Math.trunc(Number(normalizadas) || 0))
  };
  return await writeDomicilioSyncState(dataDirectory, next, { identityId });
}
