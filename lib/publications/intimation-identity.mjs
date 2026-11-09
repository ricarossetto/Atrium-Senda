/**
 * ATRIUM — Identidade oficial de intimações para auditoria de duplicados.
 *
 * Módulo puro (sem dependências do servidor, sem persistência, sem I/O).
 * Base da fusão eproc×DJEN e intra-fonte: descreve chaves determinísticas para
 * detectar pares candidatos sem nunca fundir automaticamente por aproximação.
 *
 * Contrato:
 * - eligible: somente registros com externalId iniciando em `djen:`, `eproc:` ou
 *   `domicilio:` (além dos legados `intimation:djen:`/`intimation:eproc:`/
 *   `intimation:domicilio:`); registros manuais (sem externalId) nunca são elegíveis.
 * - matchable: eligible com strong ou fallback calculável (CNJ 20 dígitos + data
 *   oficial + evento/texto). Somente matchable participa de agrupamento.
 *   Registros inelegíveis têm strong/fallback nulos.
 * - strong = sha256(`${cnj}|${dataISO}|${normalize(evento||título)}`), exige evento.
 * - fullTextKey = `${cnj}|${dataISO}|${texto normalizado integral}`, exige texto
 *   (text || sourceText || description). É chave de auto-fusão: só texto normalizado
 *   idêntico do começo ao fim conta.
 * - fallback = sha256(`${cnj}|${dataISO}|${160 primeiros chars do texto normalizado}`),
 *   exige texto. Chave FRACA: identifica candidatura humana, nunca auto-fusão.
 * - dataISO: `publishedAt` (DJEN) ou `sourceReportedAt || (sourceCollectedAt|createdAt|firstSeenAt).slice(0,10)`
 *   (eproc/domicilio); fallback geral na mesma ordem para fontes desconhecidas.
 * - groupDuplicateCandidates: componentes conexos por igualdade EXATA de strong/fullTextKey
 *   (auto-fusão segura), grupos com >= 2 membros. Igualdade apenas de `fallback`
 *   (preenchimento de 160 chars, união transitiva) NÃO funde: vira `fallbackCandidates`
 *   (autoSafe: false) para revisão. A tolerância de ±1 dia (DATE_TOLERANCE_DAYS) gera apenas
 *   `nearDateCandidates` (autoSafe: false) quando o evento ou o texto conferem; divergência
 *   de evento/texto não vira candidato e nada é fundido automaticamente.
 */
import { createHash } from 'node:crypto';

export const DATE_TOLERANCE_DAYS = 1;
const TEXT_KEY_MAX_CHARS = 160;
const ELIGIBLE_PREFIXES = Object.freeze([
  { prefix: 'djen:', source: 'djen' },
  { prefix: 'eproc:', source: 'eproc' },
  { prefix: 'domicilio:', source: 'domicilio' },
  { prefix: 'pje:', source: 'pje' },
  { prefix: 'intimation:eproc:', source: 'eproc' },
  { prefix: 'intimation:djen:', source: 'djen' },
  { prefix: 'intimation:domicilio:', source: 'domicilio' },
  { prefix: 'intimation:pje:', source: 'pje' }
]);

export function normalizeIdentityText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ºª°]/g, ' ')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function computeIntimationIdentity(intimation) {
  const record = intimation && typeof intimation === 'object' ? intimation : {};
  const externalId = String(record.externalId || record.id || '').trim();
  const prefix = ELIGIBLE_PREFIXES.find(candidate => externalId.startsWith(candidate.prefix)) || null;
  const source = prefix ? prefix.source : '';
  const cnj = digits(record.process || record.processNumber || record.numeroProcesso || record.cnj || '');
  const dataISO = resolveDataISO(record, source);
  const eventKey = normalizeIdentityText(record.event || record.title || '');
  const normalizedText = normalizeIdentityText(record.text || record.sourceText || record.description || '');
  const textKey = normalizedText.slice(0, TEXT_KEY_MAX_CHARS);
  const eligible = Boolean(source);
  const strong = eligible && cnj.length === 20 && dataISO && eventKey ? hashKey(cnj, dataISO, eventKey) : null;
  const fullTextKey = eligible && cnj.length === 20 && dataISO && normalizedText
    ? `${cnj}|${dataISO}|${normalizedText}`
    : null;
  const fallback = eligible && cnj.length === 20 && dataISO && textKey ? hashKey(cnj, dataISO, textKey) : null;
  return {
    externalId,
    source,
    cnj,
    dataISO,
    eventKey,
    textKey,
    fullTextKey,
    strong,
    fallback,
    eligible,
    matchable: Boolean(strong || fallback)
  };
}

/**
 * Identidades calculadas uma única vez por registro e reutilizáveis pelo motor de fusão.
 * O resolver é seguro contra registros ausentes (recalcula sob demanda).
 */
export function createIntimationIdentityResolver(records) {
  const cache = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    if (record && typeof record === 'object' && !Array.isArray(record) && !cache.has(record)) {
      cache.set(record, computeIntimationIdentity(record));
    }
  }
  return record => cache.get(record) || computeIntimationIdentity(record);
}

export function groupDuplicateCandidates(intimations) {
  const records = Array.isArray(intimations) ? intimations : [];
  const identities = records.map(record => computeIntimationIdentity(record));
  const items = identities
    .map((identity, index) => ({ index, identity }))
    .filter(item => item.identity.eligible && item.identity.matchable);

  const parent = items.map((_, position) => position);
  const find = position => {
    let root = position;
    while (parent[root] !== root) root = parent[root];
    let cursor = position;
    while (parent[cursor] !== cursor) {
      const next = parent[cursor];
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB);
  };
  // Auto-fusão estrita: apenas chave forte ou texto normalizado integral idêntico.
  // `fallback` (160 chars) permanece chave de candidatura humana, nunca de fusão.
  for (const key of ['strong', 'fullTextKey']) {
    const firstByKey = new Map();
    items.forEach((item, position) => {
      const value = item.identity[key];
      if (!value) return;
      if (firstByKey.has(value)) union(position, firstByKey.get(value));
      else firstByKey.set(value, position);
    });
  }

  const roots = items.map((_, position) => find(position));
  const components = new Map();
  items.forEach((item, position) => {
    const root = roots[position];
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(position);
  });

  const groups = [...components.values()]
    .filter(positions => positions.length >= 2)
    .map(positions => buildGroup(positions, items))
    .sort((a, b) => a.members[0].index - b.members[0].index)
    .map((group, position) => ({ ...group, id: `dup-${position + 1}` }));

  const sourceMatrix = { 'djen×djen': 0, 'djen×eproc': 0, 'eproc×eproc': 0 };
  const pairs = [];
  for (const group of groups) {
    for (let i = 0; i < group.members.length; i += 1) {
      for (let j = i + 1; j < group.members.length; j += 1) {
        const a = group.members[i];
        const b = group.members[j];
        const pairType = pairTypeOf(a.source, b.source);
        sourceMatrix[pairType] = (sourceMatrix[pairType] || 0) + 1;
        pairs.push({
          group: group.id,
          a: a.index,
          b: b.index,
          pairType,
          exact: pairExactRelation(a, b)
        });
      }
    }
  }

  // Candidatos por ±1 dia: agrupados por CNJ e por data oficial (Map), comparando apenas
  // datas adjacentes. Evita o confronto O(n²) de todo o acervo a cada flush.
  const nearDateCandidates = [];
  const dateBucketsByCnj = new Map();
  items.forEach((item, position) => {
    const cnj = item.identity.cnj;
    if (!cnj) return;
    let buckets = dateBucketsByCnj.get(cnj);
    if (!buckets) { buckets = new Map(); dateBucketsByCnj.set(cnj, buckets); }
    const date = item.identity.dataISO;
    if (!date) return;
    const bucket = buckets.get(date);
    if (bucket) bucket.push(position);
    else buckets.set(date, [position]);
  });
  for (const buckets of dateBucketsByCnj.values()) {
    for (const [date, positions] of buckets) {
      const nextDate = addDaysISO(date, 1);
      const nextPositions = nextDate ? buckets.get(nextDate) : null;
      if (!nextPositions) continue;
      for (const positionA of positions) {
        const a = items[positionA].identity;
        for (const positionB of nextPositions) {
          if (roots[positionA] === roots[positionB]) continue;
          const b = items[positionB].identity;
          const eventMatch = Boolean(a.eventKey) && a.eventKey === b.eventKey;
          const textMatch = Boolean(a.textKey) && a.textKey === b.textKey;
          if (!eventMatch && !textMatch) continue;
          nearDateCandidates.push({
            a: memberSummary(items[positionA]),
            b: memberSummary(items[positionB]),
            dayGap: DATE_TOLERANCE_DAYS,
            matchedBy: eventMatch && textMatch ? 'event+text' : eventMatch ? 'event' : 'text',
            autoSafe: false
          });
        }
      }
    }
  }

  // Igualdade apenas de prefixo (fallback) não funde; fica como candidatura explícita.
  const fallbackCandidates = [];
  const firstByFallback = new Map();
  items.forEach((item, position) => {
    const value = item.identity.fallback;
    if (!value) return;
    const first = firstByFallback.get(value);
    if (first === undefined) firstByFallback.set(value, position);
    else if (roots[first] !== roots[position]) {
      fallbackCandidates.push({
        a: memberSummary(items[first]),
        b: memberSummary(items[position]),
        matchedBy: 'fallback',
        autoSafe: false
      });
    }
  });

  return {
    groups,
    pairs,
    sourceMatrix,
    nearDateCandidates,
    fallbackCandidates,
    stats: {
      total: records.length,
      eligible: identities.filter(identity => identity.eligible).length,
      matchable: items.length,
      grouped: groups.reduce((count, group) => count + group.members.length, 0),
      groups: groups.length,
      strongGroups: groups.filter(group => group.strongKeys.length > 0).length,
      fallbackGroups: groups.filter(group => group.fallbackKeys.length > 0).length,
      exactPairs: pairs.length,
      nearDateCandidates: nearDateCandidates.length,
      fallbackCandidates: fallbackCandidates.length
    }
  };
}

function buildGroup(positions, items) {
  const members = positions.map(position => memberSummary(items[position])).sort((a, b) => a.index - b.index);
  const sources = [...new Set(members.map(member => member.source).filter(Boolean))].sort();
  return {
    members,
    sources,
    sourcePair: sources.length === 1 ? `${sources[0]}×${sources[0]}` : pairTypeOf(sources[0] || '', sources[1] || ''),
    strongKeys: sharedKeys(members, 'strong'),
    fallbackKeys: sharedKeys(members, 'fallback')
  };
}

function memberSummary(item) {
  return {
    index: item.index,
    externalId: item.identity.externalId,
    source: item.identity.source,
    cnj: item.identity.cnj,
    dataISO: item.identity.dataISO,
    strong: item.identity.strong,
    fallback: item.identity.fallback
  };
}

function sharedKeys(members, field) {
  const counts = new Map();
  for (const member of members) {
    const value = member[field];
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count >= 2).map(([key]) => key).sort();
}

function pairExactRelation(a, b) {
  const strong = Boolean(a.strong && a.strong === b.strong);
  const fallback = Boolean(a.fallback && a.fallback === b.fallback);
  if (strong && fallback) return 'strong+fallback';
  if (strong) return 'strong';
  if (fallback) return 'fallback';
  return 'transitive';
}

function pairTypeOf(sourceA, sourceB) {
  return [sourceA, sourceB].sort().join('×');
}

function resolveDataISO(record, source) {
  // A data de identidade é a data da fonte (disponibilização no DJEN); a publicação
  // derivada (1º dia útil seguinte) fica fora da chave para não reabrir duplicatas.
  const availableAt = dateOnly(record.disponibilizadoEm);
  const publishedAt = dateOnly(record.publishedAt);
  const sourceReportedAt = dateOnly(record.sourceReportedAt);
  const collected = dateOnly(record.sourceCollectedAt) || dateOnly(record.createdAt) || dateOnly(record.firstSeenAt);
  if (source === 'djen') return availableAt || publishedAt || sourceReportedAt || collected;
  if (source === 'eproc') return sourceReportedAt || publishedAt || collected;
  // Domicílio Eletrônico: a data oficial é a da comunicação informada pela fonte.
  if (source === 'domicilio') return sourceReportedAt || publishedAt || collected;
  // PJe: a data oficial é a informada na listagem do portal (nunca a de coleta).
  if (source === 'pje') return sourceReportedAt || publishedAt || collected;
  return publishedAt || sourceReportedAt || collected;
}

function dateOnly(value) {
  const raw = String(value || '').trim();
  if (raw.length < 10) return null;
  const candidate = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null;
  const parsed = new Date(`${candidate}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === candidate ? candidate : null;
}

function addDaysISO(date, days) {
  const parsed = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
}

function hashKey(...parts) {
  return createHash('sha256').update(parts.join('|'), 'utf8').digest('hex');
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}
