import { normalizeDocumentRecord, toDocumentMetadata } from './metadata.mjs';
import { manifestIsReprocessable } from './manifest.mjs';
import { cleanCnj } from '../../judicial/omni/contracts.mjs';

export const INDEX_KINDS = Object.freeze({
  DOCUMENT: 'document',
  MANIFEST: 'manifest'
});

export function normalizeCnjKey(cnj) {
  const digits = cleanCnj(cnj);
  return digits.length === 20 ? digits : String(cnj ?? '');
}

export class DocumentIndex {
  #store;

  constructor({ store } = {}) {
    if (!store?.put || !store?.get || !store?.list) {
      throw new TypeError('BetaStore obrigatório para o índice documental beta.');
    }
    this.#store = store;
  }

  indexDocument(record, { lookup = null } = {}) {
    const normalized = normalizeDocumentRecord(record);
    const cnjKey = normalizeCnjKey(normalized.cnj);
    const id = `doc:${cnjKey}:${normalized.sourceId}`;
    const result = this.#store.put(INDEX_KINDS.DOCUMENT, id, toDocumentMetadata(normalized), { lookup: lookup ?? cnjKey });
    return { id, ...result };
  }

  getDocument(cnj, sourceId) {
    return this.#store.get(INDEX_KINDS.DOCUMENT, `doc:${normalizeCnjKey(cnj)}:${sourceId}`);
  }

  listDocuments(cnj, { limit = 200 } = {}) {
    return this.#store.list(INDEX_KINDS.DOCUMENT, { lookup: normalizeCnjKey(cnj), limit });
  }

  indexManifest(manifest) {
    if (!manifestIsReprocessable(manifest)) {
      throw new Error('Manifesto inválido para indexação beta.');
    }
    const cnjKey = normalizeCnjKey(manifest.cnj);
    const id = `manifest:${cnjKey}:${manifest.provider ?? 'unknown'}`;
    return { id, ...this.#store.put(INDEX_KINDS.MANIFEST, id, manifest, { lookup: cnjKey }) };
  }

  getManifest(cnj, provider = 'unknown') {
    return this.#store.get(INDEX_KINDS.MANIFEST, `manifest:${normalizeCnjKey(cnj)}:${provider}`);
  }

  listManifests(cnj, { limit = 20 } = {}) {
    return this.#store.list(INDEX_KINDS.MANIFEST, { lookup: normalizeCnjKey(cnj), limit });
  }
}
