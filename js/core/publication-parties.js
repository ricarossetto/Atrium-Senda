/**
 * ATRIUM — Partes e advogados por polo na publicação oficial (puro, sem DOM).
 *
 * Lê o texto oficial preservado (DJEN/eproc/PJe) e agrupa cada advogado citado
 * sob o polo que ele representa, conforme declarado pela própria fonte
 * ("AGRAVANTE : NOME" seguido de "ADVOGADO(A) : NOME (OAB UF NNNNN)"). A fonte
 * declara a associação; este módulo apenas a lê — nunca a infere por
 * proximidade de nomes de parte.
 *
 * `officeSideLawyers` devolve os advogados do polo em que o escritório atua,
 * identificado pela inscrição OAB do próprio escritório (termos monitorados e
 * membros). Quando a fonte não permite determinar o polo com segurança,
 * devolve null e o chamador mantém o comportamento anterior.
 */

const PARTY_LABEL_VOCABULARY = [
  'AGRAVANTE', 'AGRAVADO', 'AGRAVADA',
  'RECORRENTE', 'RECORRIDO', 'RECORRIDA',
  'APELANTE', 'APELADO', 'APELADA',
  'EXEQUENTE', 'EXECUTADO', 'EXECUTADA',
  'EMBARGANTE', 'EMBARGADO', 'EMBARGADA',
  'IMPUGNANTE', 'IMPUGNADO', 'IMPUGNADA',
  'IMPETRANTE', 'IMPETRADO', 'IMPETRADA',
  'DENUNCIANTE', 'DENUNCIADO', 'DENUNCIADA',
  'QUERELANTE', 'QUERELADO', 'QUERELADA',
  'RECLAMANTE', 'RECLAMADO', 'RECLAMADA',
  'REQUERENTE', 'REQUERIDO', 'REQUERIDA',
  'LITISCONSORTE', 'INTERESSADO', 'INTERESSADA',
  'POLO ATIVO', 'POLO PASSIVO',
  'AUTOR', 'AUTORA', 'RÉU', 'RÉ', 'TERCEIRO'
].sort((left, right) => right.length - left.length);

const PARTY_LABEL_RE = new RegExp(`\\b(${PARTY_LABEL_VOCABULARY.join('|')})\\s*:`, 'g');
const LAWYER_LABEL_RE = /ADVOGAD[OA](?:\(A\))?S?\s*:/gi;
const REPRESENTATIVE_LABEL_RE = /REPRESENTANTES?\s+(?:DO\s+)?POLO\s+(?:ATIVO|PASSIVO)\s*:/gi;

const LAWYER_ENTRY_RE = /([^(),;:/]{2,180}?)\s*(?:\(\s*OAB\s*\/?\s*([A-Z]{2})\s*(\d{3,6})\s*([A-Z])?\s*\)|-\s*([A-Z]{2})\s*(\d{3,6})\s*(?:\/\s*([A-Z]))?)/g;

const CACHE_LIMIT = 400;
const groupCache = new Map();

const LAWYER_ONLY_LABEL = /^(?:ADVOGAD[OA](?:\(A\))?S?|REPRESENTANTES?(?:\s+(?:DO\s+)?POLO\s+(?:ATIVO|PASSIVO))?)$/i;

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeName(value) {
  return normalizeWhitespace(value)
    .replace(/^[-–—,;:\s]+/, '')
    .replace(/^e\s+/i, '')
    .replace(/\s+/g, ' ')
    .slice(0, 160);
}

export function normalizeOabNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.replace(/^0+(?=\d)/, '').slice(0, 9);
}

export function oabKey(lawyer) {
  const number = normalizeOabNumber(lawyer?.oab);
  if (!number) return '';
  const uf = String(lawyer?.uf || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  return `${uf}:${number}`;
}

function pushLawyer(bucket, seen, rawName, rawUf, rawNumber, rawSuffix) {
  const name = normalizeName(rawName);
  const uf = String(rawUf || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  const suffix = String(rawSuffix || '').trim().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1);
  const number = normalizeOabNumber(`${rawNumber || ''}${suffix}`);
  if (!name && !number) return;
  if (!name || LAWYER_ONLY_LABEL.test(name)) return;
  const key = number ? `${uf}:${number}` : `name:${name.toLocaleLowerCase('pt-BR')}`;
  if (seen.has(key)) return;
  seen.add(key);
  bucket.push({ name, oab: number, uf });
}

function lawyersFromChunk(chunk) {
  const lawyers = [];
  const seen = new Set();
  for (const match of String(chunk || '').matchAll(LAWYER_ENTRY_RE)) {
    pushLawyer(lawyers, seen, match[1], match[2] || match[5], match[3] || match[6], match[4] || match[7]);
  }
  return lawyers;
}

function nextMarkerIndex(text, from) {
  PARTY_LABEL_RE.lastIndex = from;
  LAWYER_LABEL_RE.lastIndex = from;
  REPRESENTATIVE_LABEL_RE.lastIndex = from;
  const candidates = [
    PARTY_LABEL_RE.exec(text)?.index,
    LAWYER_LABEL_RE.exec(text)?.index,
    REPRESENTATIVE_LABEL_RE.exec(text)?.index
  ].filter(index => Number.isInteger(index));
  return candidates.length ? Math.min(...candidates) : text.length;
}

function hashText(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Grupos de advogados por polo, na ordem em que a fonte os declara.
 * Cada grupo: { label, lawyers: [{ name, oab, uf }] }.
 */
export function publicationPartyGroups(text) {
  const normalized = normalizeWhitespace(text);
  if (!normalized || !/ADVOGAD|REPRESENTANTE/i.test(normalized)) return [];

  const cacheKey = `${normalized.length}|${hashText(normalized)}`;
  const cached = groupCache.get(cacheKey);
  if (cached) return cached;

  const groups = [];
  const byLabel = new Map();
  let current = null;

  const markers = [];
  for (const match of normalized.matchAll(PARTY_LABEL_RE)) {
    markers.push({ kind: 'party', index: match.index, label: match[1].toUpperCase(), end: match.index + match[0].length });
  }
  for (const match of normalized.matchAll(LAWYER_LABEL_RE)) {
    markers.push({ kind: 'lawyer', index: match.index, end: match.index + match[0].length });
  }
  for (const match of normalized.matchAll(REPRESENTATIVE_LABEL_RE)) {
    markers.push({ kind: 'lawyer', index: match.index, end: match.index + match[0].length });
  }
  markers.sort((left, right) => left.index - right.index || left.end - right.end);

  for (const marker of markers) {
    if (marker.kind === 'party') {
      const label = marker.label;
      if (!byLabel.has(label)) {
        const group = { label, lawyers: [], seen: new Set() };
        byLabel.set(label, group);
        groups.push(group);
      }
      current = byLabel.get(label);
      continue;
    }
    const chunkStart = marker.end;
    const chunkEnd = nextMarkerIndex(normalized, chunkStart);
    const chunk = normalized.slice(chunkStart, chunkEnd);
    if (!current) {
      current = { label: '', lawyers: [], seen: new Set() };
      groups.push(current);
    }
    for (const lawyer of lawyersFromChunk(chunk)) {
      const key = lawyer.oab ? `${lawyer.uf}:${lawyer.oab}` : `name:${lawyer.name.toLocaleLowerCase('pt-BR')}`;
      if (current.seen.has(key)) continue;
      current.seen.add(key);
      current.lawyers.push(lawyer);
    }
  }

  const result = groups
    .filter(group => group.lawyers.length)
    .map(group => ({ label: group.label, lawyers: group.lawyers }));

  if (groupCache.size >= CACHE_LIMIT) groupCache.clear();
  groupCache.set(cacheKey, result);
  return result;
}

/**
 * Inscrições OAB do escritório: termos monitorados (escopo do usuário) e
 * membros do diretório. Serve apenas para identificar o polo em que o
 * escritório atua.
 */
export function officeOabKeys({ terms = [], users = [] } = {}) {
  const keys = new Set();
  for (const term of Array.isArray(terms) ? terms : []) {
    if (!term || term.active === false) continue;
    const raw = String(term.oabNumber || term.registration || '').replace(/\D/g, '');
    const number = normalizeOabNumber(raw);
    if (!number || number === '0') continue;
    keys.add(`${String(term.oabUf || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2)}:${number}`);
  }
  for (const user of Array.isArray(users) ? users : []) {
    const number = normalizeOabNumber(user?.oab);
    if (!number) continue;
    keys.add(`${String(user.oabUf || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2)}:${number}`);
  }
  return [...keys];
}

function matchesOffice(lawyer, keySet) {
  const number = normalizeOabNumber(lawyer?.oab);
  if (!number) return false;
  const uf = String(lawyer?.uf || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  if (keySet.has(`${uf}:${number}`)) return true;
  return keySet.has(`:${number}`);
}

/**
 * Advogados do polo em que o escritório atua, segundo a própria fonte oficial.
 * Retorna null quando não há como determinar o polo com segurança.
 */
export function officeSideLawyers(item, { oabKeys = [] } = {}) {
  const keySet = new Set((Array.isArray(oabKeys) ? oabKeys : []).filter(Boolean));
  if (!keySet.size) return null;
  const text = item?.text || item?.sourceText || item?.description || '';
  const groups = publicationPartyGroups(text);
  if (!groups.length) return null;
  const ourGroups = groups.filter(group => group.lawyers.some(lawyer => matchesOffice(lawyer, keySet)));
  if (!ourGroups.length) return null;
  const lawyers = [];
  const seen = new Set();
  for (const group of ourGroups) {
    for (const lawyer of group.lawyers) {
      const key = lawyer.oab ? `${lawyer.uf}:${lawyer.oab}` : `name:${lawyer.name.toLocaleLowerCase('pt-BR')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lawyers.push(lawyer);
    }
  }
  return lawyers.length ? lawyers : null;
}

export function formatLawyerNames(lawyers, { max = 6 } = {}) {
  return (Array.isArray(lawyers) ? lawyers : [])
    .map(lawyer => String(lawyer?.name || '').trim())
    .filter(Boolean)
    .slice(0, Math.max(1, max))
    .join(', ');
}
