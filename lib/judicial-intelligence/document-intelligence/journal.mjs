import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { JudicialIntelligenceError, JI_ERROR_CODES } from '../core/errors.mjs';

export const JOURNAL_STATUS = Object.freeze({
  DOWNLOADED: 'DOWNLOADED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
  DUPLICATE: 'DUPLICATE'
});

export class AcquisitionJournal {
  #filePath;
  #entries = [];
  #loaded = false;

  constructor({ filePath } = {}) {
    if (!filePath) throw new TypeError('filePath obrigatório para o journal de aquisição.');
    this.#filePath = filePath;
  }

  filePath() {
    return this.#filePath;
  }

  async load() {
    try {
      const content = await readFile(this.#filePath, 'utf8');
      this.#entries = content
        .split(/\r?\n/)
        .filter(Boolean)
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      this.#entries = [];
    }
    this.#loaded = true;
    return this.#entries.length;
  }

  get entries() {
    return [...this.#entries];
  }

  completedSourceIds() {
    return new Set(
      this.#entries
        .filter(entry => entry.status === JOURNAL_STATUS.DOWNLOADED || entry.status === JOURNAL_STATUS.DUPLICATE)
        .map(entry => String(entry.sourceId))
    );
  }

  failedSourceIds() {
    return new Set(
      this.#entries
        .filter(entry => entry.status === JOURNAL_STATUS.FAILED)
        .map(entry => String(entry.sourceId))
    );
  }

  lastAttempt(sourceId) {
    const normalized = String(sourceId);
    for (let index = this.#entries.length - 1; index >= 0; index -= 1) {
      if (String(this.#entries[index].sourceId) === normalized) return this.#entries[index];
    }
    return null;
  }

  async record(entry) {
    if (!entry || !entry.sourceId || !entry.status) {
      throw new JudicialIntelligenceError(JI_ERROR_CODES.INVALID_ARGUMENT, 'Journal exige sourceId e status.');
    }
    const record = {
      sourceId: String(entry.sourceId),
      status: entry.status,
      checksum: entry.checksum ?? null,
      size: Number.isFinite(Number(entry.size)) ? Number(entry.size) : null,
      attempts: Number.isFinite(Number(entry.attempts)) ? Number(entry.attempts) : 0,
      errorClass: entry.errorClass ?? null,
      at: entry.at ?? new Date().toISOString()
    };
    await mkdir(path.dirname(this.#filePath), { recursive: true });
    await appendFile(this.#filePath, `${JSON.stringify(record)}\n`, 'utf8');
    this.#entries.push(record);
    return record;
  }
}

export async function withRetry(operation, { attempts = 3, onAttempt = null, shouldRetry = () => true } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt += 1) {
    try {
      return { value: await operation(attempt), attempts: attempt };
    } catch (error) {
      lastError = error;
      if (onAttempt) onAttempt({ attempt, error });
      if (attempt >= attempts || shouldRetry(error) === false) break;
    }
  }
  const wrapped = new JudicialIntelligenceError(
    lastError?.code ?? JI_ERROR_CODES.INTERNAL,
    lastError?.message ?? 'Falha isolada de documento após tentativas.',
    { retryable: true, cause: lastError }
  );
  wrapped.attempts = attempts;
  throw wrapped;
}
