import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const JEV_BETA_STORE_FILE = 'jev-beta-v1.json';
const MAX_ENTRIES = 200;

function resolveStorePath(directory) {
  if (!directory || typeof directory !== 'string' || directory.trim() === '') {
    const error = new Error('Diretório isolado obrigatório para o storage do beta Jev.');
    error.code = 'INVALID_DIR';
    throw error;
  }
  const trimmed = directory.trim();
  if (/(^|\/)(data\/system|app-state\.json|runtime\.json)(\/|$)/.test(trimmed.replace(/\\/g, '/'))) {
    const error = new Error('Diretório oficial bloqueado para o beta Jev.');
    error.code = 'BLOCKED_DIR';
    throw error;
  }
  return path.join(trimmed, JEV_BETA_STORE_FILE);
}

export async function openJevBetaStore(directory) {
  const file = resolveStorePath(directory);
  await mkdir(path.dirname(file), { recursive: true });
  async function readAll() {
    try {
      const raw = await readFile(file, 'utf8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed.entries) ? parsed.entries : [];
    } catch {
      return [];
    }
  }
  async function appendSuggestion(entry) {
    const entries = await readAll();
    const sanitized = {
      schema: String(entry?.schema || ''),
      action: String(entry?.action || ''),
      confidence: Number(entry?.confidence || 0),
      suggestion: entry?.suggestion && typeof entry.suggestion === 'object' ? entry.suggestion : {},
      reason: String(entry?.reason || ''),
      verificationState: String(entry?.verificationState || 'UNVERIFIED'),
      collectedAt: String(entry?.collectedAt || new Date().toISOString()),
      payloadHash: String(entry?.payloadHash || '')
    };
    const next = [...entries, sanitized].slice(-MAX_ENTRIES);
    await writeFile(file, JSON.stringify({ version: 1, entries: next }, null, 2), 'utf8');
    return { stored: next.length, file };
  }
  return { file, readAll, appendSuggestion };
}
