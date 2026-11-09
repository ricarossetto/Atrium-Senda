import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PJE_VERIFICATION_DIMENSIONS } from './portal-registry.mjs';

const STORE_VERSION = 1;
const RUNTIME_IDS = Object.freeze(['server', 'local_sidecar']);
export const PJE_RUNTIME_STATUSES = Object.freeze(['verified', 'unverified', 'server_unverified', 'degraded', 'blocked']);
const EVIDENCE_KEYS = Object.freeze([
  'sampleCount',
  'expedienteCount',
  'acervoCount',
  'origins',
  'collectorKey',
  'phase',
  'note'
]);

function sanitizeOrigin(value) {
  try {
    return new URL(String(value)).origin;
  } catch {
    return 'invalid-url';
  }
}

export function sanitizePjeEvidence(evidence = {}) {
  const clean = {};
  if (Number.isFinite(Number(evidence.sampleCount))) clean.sampleCount = Math.trunc(Number(evidence.sampleCount));
  if (Number.isFinite(Number(evidence.expedienteCount))) clean.expedienteCount = Math.trunc(Number(evidence.expedienteCount));
  if (Number.isFinite(Number(evidence.acervoCount))) clean.acervoCount = Math.trunc(Number(evidence.acervoCount));
  if (Array.isArray(evidence.origins)) clean.origins = [...new Set(evidence.origins.map(sanitizeOrigin))];
  if (typeof evidence.collectorKey === 'string') clean.collectorKey = evidence.collectorKey.slice(0, 64);
  if (typeof evidence.phase === 'string') clean.phase = evidence.phase.slice(0, 32);
  if (typeof evidence.note === 'string') clean.note = evidence.note.slice(0, 280);
  for (const key of Object.keys(clean)) {
    if (!EVIDENCE_KEYS.includes(key)) delete clean[key];
  }
  return clean;
}

export class PjeVerificationStore {
  constructor({ rootDir } = {}) {
    if (!rootDir) throw new Error('PjeVerificationStore exige rootDir do workspace.');
    this.rootDir = rootDir;
    this.filePath = path.join(rootDir, 'pje', 'verification.json');
  }

  async readState() {
    try {
      const raw = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (raw?.version !== STORE_VERSION || typeof raw.portals !== 'object' || raw.portals === null) {
        return { version: STORE_VERSION, portals: {} };
      }
      return raw;
    } catch {
      return { version: STORE_VERSION, portals: {} };
    }
  }

  async writeState(state) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
    await rename(tmp, this.filePath);
  }

  async record(portalId, runtime, dimension, evidence = {}) {
    if (!portalId) throw new Error('portalId é obrigatório para registrar evidência PJe.');
    if (!RUNTIME_IDS.includes(runtime)) throw new Error(`Runtime PJe inválido: ${runtime}`);
    if (!PJE_VERIFICATION_DIMENSIONS.includes(dimension)) throw new Error(`Dimensão de verificação PJe inválida: ${dimension}`);
    const state = await this.readState();
    const portal = state.portals[portalId] || {};
    const runtimeEntry = portal[runtime] || {};
    runtimeEntry[dimension] = {
      verifiedAt: new Date().toISOString(),
      evidence: sanitizePjeEvidence(evidence)
    };
    portal[runtime] = runtimeEntry;
    state.portals[portalId] = portal;
    await this.writeState(state);
    return runtimeEntry[dimension];
  }

  async get(portalId, runtime) {
    const state = await this.readState();
    return state.portals?.[portalId]?.[runtime] || null;
  }

  async recordRuntimeStatus(portalId, runtime, status, { reason = '' } = {}) {
    if (!portalId) throw new Error('portalId é obrigatório para registrar status PJe.');
    if (!RUNTIME_IDS.includes(runtime)) throw new Error(`Runtime PJe inválido: ${runtime}`);
    if (!PJE_RUNTIME_STATUSES.includes(status)) throw new Error(`Status de runtime PJe inválido: ${status}`);
    const state = await this.readState();
    const portal = state.portals[portalId] || {};
    const runtimeEntry = portal[runtime] || {};
    runtimeEntry.status = {
      status,
      reason: String(reason || '').slice(0, 280),
      at: new Date().toISOString()
    };
    portal[runtime] = runtimeEntry;
    state.portals[portalId] = portal;
    await this.writeState(state);
    return runtimeEntry.status;
  }

  async getRuntimeStatus(portalId, runtime) {
    const entry = await this.get(portalId, runtime);
    return entry?.status || null;
  }

  async isVerified(portalId, runtime, dimension) {
    return Boolean((await this.get(portalId, runtime))?.[dimension]?.verifiedAt);
  }

  async listVerified({ runtime, dimension } = {}) {
    const state = await this.readState();
    const results = [];
    for (const [portalId, runtimes] of Object.entries(state.portals || {})) {
      for (const [runtimeId, dimensions] of Object.entries(runtimes || {})) {
        if (runtime && runtimeId !== runtime) continue;
        for (const [dimensionId, entry] of Object.entries(dimensions || {})) {
          if (dimension && dimensionId !== dimension) continue;
          if (entry?.verifiedAt) results.push({ portalId, runtime: runtimeId, dimension: dimensionId, ...entry });
        }
      }
    }
    return results;
  }
}
