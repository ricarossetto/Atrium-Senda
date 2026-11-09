export const PJE_TJMT_SITUATION_LABELS = Object.freeze([
  'Pendentes de ciência ou de resposta',
  'Apenas pendentes de ciência',
  'Ciência dada pelo destinatário direto ou indireto - pendente de resposta',
  'Ciência dada pelo Judiciário - pendente de resposta',
  'Cujo prazo findou nos últimos 10 dias - sem resposta',
  'Sem prazo',
  'Respondidos nos últimos 10 dias',
  'Apenas pendentes de resposta'
]);

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function parseTjmtSituations(text) {
  const source = normalizeWhitespace(text);
  const results = [];
  for (const label of PJE_TJMT_SITUATION_LABELS) {
    const index = source.indexOf(label);
    if (index < 0) continue;
    const tail = source.slice(index + label.length);
    const match = tail.match(/^\s*(\d{1,5})(?:\s|$)/);
    if (!match) continue;
    results.push({ label, count: Number(match[1]) });
  }
  return results;
}

export const tjmtProfile = Object.freeze({
  id: 'pje-tjmt',
  situationLabels: PJE_TJMT_SITUATION_LABELS,
  parseSituations: parseTjmtSituations
});

export function getPjeProfileForPortal(portal) {
  const id = String(portal?.id || '');
  if (id.startsWith('pje-tjmt')) return tjmtProfile;
  return null;
}
