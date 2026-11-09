export const EMBEDDING_DEFAULTS = Object.freeze({
  provider: 'gemini',
  model: 'text-embedding-004',
  batchSize: 16,
  maxChars: 2000
});

export function createGeminiEmbedder({
  apiKey = null,
  model = EMBEDDING_DEFAULTS.model,
  fetchImpl = globalThis.fetch,
  baseUrl = 'https://generativelanguage.googleapis.com/v1beta',
  batchSize = EMBEDDING_DEFAULTS.batchSize
} = {}) {
  if (!apiKey) return null;
  return {
    id: `gemini:${model}`,
    async embed(texts = []) {
      const vectors = [];
      const items = texts.map(text => String(text ?? '').slice(0, EMBEDDING_DEFAULTS.maxChars));
      for (let index = 0; index < items.length; index += batchSize) {
        const batch = items.slice(index, index + batchSize);
        const response = await fetchImpl(`${baseUrl}/models/${model}:batchEmbedContents?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            requests: batch.map(text => ({
              model: `models/${model}`,
              content: { parts: [{ text }] }
            }))
          })
        });
        if (!response.ok) {
          throw Object.assign(new Error(`Embedding respondeu ${response.status}.`), { code: 'UNAVAILABLE', status: response.status });
        }
        const payload = await response.json();
        for (const entry of payload.embeddings ?? []) {
          vectors.push(entry.values ?? entry.embedding?.values ?? []);
        }
      }
      return vectors;
    }
  };
}

export function createFakeEmbedder({ dimensions = 16 } = {}) {
  return {
    id: 'fake',
    async embed(texts = []) {
      return texts.map(text => {
        const vector = new Array(dimensions).fill(0);
        for (const token of String(text ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\W+/)) {
          if (!token) continue;
          let hash = 0;
          for (let index = 0; index < token.length; index += 1) {
            hash = (hash * 31 + token.charCodeAt(index)) % 100000;
          }
          vector[hash % dimensions] += 1;
        }
        return vector;
      });
    }
  };
}
