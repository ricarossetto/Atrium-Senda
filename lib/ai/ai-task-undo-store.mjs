/**
 * Registro de desfazer das tarefas criadas pela sugestão do Atrium IA.
 *
 * Fica fora do estado gravável pelo cliente. O navegador não consegue fabricar,
 * alterar nem apagar este registro; só o servidor escreve e lê. Grava apenas
 * identificadores, datas e hashes, sem o texto da publicação.
 */
import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_ENTRIES = 2000;
const WRITE_TAILS = new Map();

function withFileLock(file, operation) {
  const previous = WRITE_TAILS.get(file) || Promise.resolve();
  const next = previous.then(operation, operation);
  WRITE_TAILS.set(file, next.catch(() => {}));
  return next;
}

export function createAiTaskUndoStore({ file, encrypt = null, decrypt = null } = {}) {
  if (!file) throw new TypeError('createAiTaskUndoStore: file é obrigatório.');
  const stateFile = path.resolve(file);

  const withWriteLock = operation => withFileLock(stateFile, operation);

  // Entrada legada gravada antes da cifra: na primeira escrita, ela é selada.
  const sealEntry = (id, entry) => {
    if (!entry || typeof entry !== 'object' || entry.encrypted) return entry;
    if (typeof encrypt !== 'function') return entry;
    return {
      taskId: id,
      createdAt: String(entry.createdAt || ''),
      encrypted: encrypt(JSON.stringify({ ...entry, taskId: id }))
    };
  };

  const readAll = async () => {
    try {
      const parsed = JSON.parse(await readFile(stateFile, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || !parsed.entries || typeof parsed.entries !== 'object') {
        throw Object.assign(new Error('Registro de desfazer inválido.'), { code: 'STORE_CORRUPT' });
      }
      return { version: 1, entries: parsed.entries };
    } catch (error) {
      if (error?.code === 'ENOENT') return { version: 1, entries: {} };
      throw error;
    }
  };

  const writeAll = async data => {
    await mkdir(path.dirname(stateFile), { recursive: true });
    const temporary = `${stateFile}.tmp-${process.pid}-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
    await chmod(temporary, 0o600).catch(() => {});
    await rename(temporary, stateFile);
    await chmod(stateFile, 0o600).catch(() => {});
  };

  return {
    async get(taskId) {
      const id = String(taskId || '').trim();
      if (!id) return null;
      const data = await readAll();
      const entry = data.entries[id];
      if (!entry) return null;
      if (entry.encrypted) {
        if (typeof decrypt !== 'function') {
          throw Object.assign(new Error('Registro de desfazer ilegível.'), { code: 'STORE_CORRUPT' });
        }
        try {
          const payload = JSON.parse(decrypt(entry.encrypted));
          return { ...payload, taskId: id };
        } catch {
          throw Object.assign(new Error('Registro de desfazer ilegível.'), { code: 'STORE_CORRUPT' });
        }
      }
      return entry;
    },

    async set(taskId, record) {
      const id = String(taskId || '').trim();
      if (!id || !record || typeof record !== 'object') throw new TypeError('Registro de desfazer inválido.');
      return withWriteLock(async () => {
        const data = await readAll();
        for (const [key, value] of Object.entries(data.entries)) {
          data.entries[key] = sealEntry(key, value);
        }
        data.entries[id] = typeof encrypt === 'function'
          ? {
              taskId: id,
              createdAt: String(record.createdAt || ''),
              encrypted: encrypt(JSON.stringify({ ...record, taskId: id }))
            }
          : { ...record, taskId: id };
        const ids = Object.keys(data.entries);
        if (ids.length > MAX_ENTRIES) {
          ids.sort((left, right) => String(data.entries[left].createdAt || '').localeCompare(String(data.entries[right].createdAt || '')));
          for (const stale of ids.slice(0, ids.length - MAX_ENTRIES)) delete data.entries[stale];
        }
        await writeAll(data);
      });
    },

    async remove(taskId) {
      const id = String(taskId || '').trim();
      if (!id) return false;
      return withWriteLock(async () => {
        const data = await readAll();
        if (!data.entries[id]) return false;
        for (const [key, value] of Object.entries(data.entries)) {
          data.entries[key] = sealEntry(key, value);
        }
        delete data.entries[id];
        await writeAll(data);
        return true;
      });
    }
  };
}
