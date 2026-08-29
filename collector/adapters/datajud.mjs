const API_BASE = 'https://api-publica.datajud.cnj.jus.br';
const OFFICIAL_DEFAULT_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
const OFFICIAL_KEY_PAGE = 'https://datajud-wiki.cnj.jus.br/api-publica/acesso/';
const PROCESS_RE = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g;
const STATE_ALIASES = {
  '01': 'tjac', '02': 'tjal', '03': 'tjap', '04': 'tjam', '05': 'tjba', '06': 'tjce', '07': 'tjdft',
  '08': 'tjes', '09': 'tjgo', '10': 'tjma', '11': 'tjmt', '12': 'tjms', '13': 'tjmg', '14': 'tjpa',
  '15': 'tjpb', '16': 'tjpr', '17': 'tjpe', '18': 'tjpi', '19': 'tjrj', '20': 'tjrn', '21': 'tjrs',
  '22': 'tjro', '23': 'tjrr', '24': 'tjsc', '25': 'tjse', '26': 'tjsp', '27': 'tjto'
};

export async function collectDatajud(portal, config, target, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const sleep = options.sleep || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const candidates = Array.isArray(options.processNumbers)
    ? options.processNumbers
    : [...(options.seedProcessNumbers || []), ...processNumbersFrom(target)];
  const numbers = [...new Map(candidates.map(formatProcessNumber).filter(Boolean).map(value => [digits(value), value])).values()]
    .slice(0, Math.min(500, Math.max(1, Number(portal.maxProcessesPerRun || 250))));
  let apiKey = normalizeApiKey(options.apiKey || process.env.DATAJUD_API_KEY) || OFFICIAL_DEFAULT_KEY;
  let refreshedKey = false;
  let found = 0;
  let updated = 0;
  let partial = 0;
  let failed = 0;

  if (!numbers.length) return { queried: 0, found, updated, partial, failed, refreshedKey, complete: true };
  if (!apiKey && allowKeyRefresh(portal)) {
    apiKey = await fetchCurrentPublicKey(fetchImpl, portal).catch(() => OFFICIAL_DEFAULT_KEY);
    refreshedKey = true;
  }
  if (!apiKey) apiKey = OFFICIAL_DEFAULT_KEY;

  for (const number of numbers) {
    const alias = aliasForProcess(number);
    if (!alias) {
      failed += 1;
      continue;
    }
    try {
      let result = await queryProcess({ number, alias, apiKey, portal, fetchImpl, sleep });
      if ((result.status === 401 || result.status === 403) && allowKeyRefresh(portal)) {
        apiKey = await fetchCurrentPublicKey(fetchImpl, portal);
        refreshedKey = true;
        result = await queryProcess({ number, alias, apiKey, portal, fetchImpl, sleep });
      }
      if (result.status === 401 || result.status === 403) throw new Error(`DataJud rejeitou a chave pública (HTTP ${result.status}).`);
      if (!result.ok) throw new Error(`DataJud respondeu HTTP ${result.status}.`);
      const payload = result.payload;
      const shardFailures = Number(payload?._shards?.failed || 0);
      if (shardFailures > 0) partial += 1;
      const hits = Array.isArray(payload?.hits?.hits) ? payload.hits.hits.map(hit => hit?._source).filter(Boolean) : [];
      if (!hits.length) continue;
      const record = newestRecord(hits);
      found += 1;
      if (mergeDatajudRecord(record, number, alias, portal, config, target)) updated += 1;
    } catch {
      failed += 1;
    }
    if (Number(portal.requestSpacingMs || 150) > 0) await sleep(Number(portal.requestSpacingMs || 150));
  }

  return { queried: numbers.length, found, updated, partial, failed, refreshedKey, complete: failed === 0 && partial === 0 };
}

async function queryProcess({ number, alias, apiKey, portal, fetchImpl, sleep }) {
  const url = `${API_BASE}/api_publica_${alias}/_search`;
  const body = JSON.stringify({
    size: 10,
    query: { match: { numeroProcesso: digits(number) } }
  });
  const maxAttempts = Math.min(4, Math.max(1, Number(portal.maxAttempts || 3)));
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetchWithTimeout(fetchImpl, url, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `APIKey ${apiKey}`,
        'User-Agent': 'Keller-Central-Juridica/1.0 (+monitoramento-local)'
      },
      body,
      redirect: 'error'
    }, Number(portal.timeoutMs || 45_000));
    if (response.status === 401 || response.status === 403) return { ok: false, status: response.status };
    if (response.status !== 429 && response.status < 500) {
      return { ok: response.ok, status: response.status, payload: response.ok ? await response.json() : null };
    }
    if (attempt === maxAttempts) return { ok: false, status: response.status };
    const retryAfter = Math.min(15_000, Math.max(500, Number(response.headers.get('retry-after') || 0) * 1000 || attempt * 1_000));
    await sleep(retryAfter);
  }
}

async function fetchCurrentPublicKey(fetchImpl, portal) {
  const requested = new URL(portal.keyPageUrl || process.env.DATAJUD_KEY_URL || OFFICIAL_KEY_PAGE);
  if (requested.protocol !== 'https:' || requested.hostname !== 'datajud-wiki.cnj.jus.br') throw new Error('A atualização da chave DataJud aceita somente a página oficial do CNJ.');
  const response = await fetchWithTimeout(fetchImpl, requested, { headers: { Accept: 'text/html', 'User-Agent': 'Keller-Central-Juridica/1.0 (+monitoramento-local)' }, redirect: 'error' }, 20_000);
  if (!response.ok) throw new Error(`A página oficial da chave DataJud respondeu HTTP ${response.status}.`);
  const html = await response.text();
  const match = html.match(/Authorization\s*:\s*APIKey\s+([A-Za-z0-9_+\/=.-]{20,500})/i)
    || html.match(/APIKey\s+([A-Za-z0-9_+\/=.-]{20,500})/i);
  const key = normalizeApiKey(match?.[1]);
  if (!key) throw new Error('A chave pública não foi localizada na página oficial do DataJud.');
  return key;
}

function mergeDatajudRecord(record, number, alias, portal, config, target) {
  target.processes = Array.isArray(target.processes) ? target.processes : [];
  target.intimations = Array.isArray(target.intimations) ? target.intimations : [];
  target.tasks = Array.isArray(target.tasks) ? target.tasks : [];
  target.contacts = Array.isArray(target.contacts) ? target.contacts : [];
  const normalizedNumber = formatProcessNumber(record.numeroProcesso || number) || number;
  const existing = target.processes.find(item => digits(item.number) === digits(normalizedNumber));
  const movements = [...(Array.isArray(record.movimentos) ? record.movimentos : [])].sort((a, b) => timestamp(b?.dataHora) - timestamp(a?.dataHora));
  const latest = movements[0] || {};
  const latestAt = toIso(latest.dataHora);
  const previousAt = toIso(existing?.lastMovementAt);
  const subject = (Array.isArray(record.assuntos) ? record.assuntos.map(item => item?.nome).filter(Boolean) : []).join(' · ');
  const court = normalizeText([record.tribunal, record.grau, record.orgaoJulgador?.nome].filter(Boolean).join(' · '));
  const movementText = normalizeText(latest.nome || '');
  const now = new Date().toISOString();
  const incomingProcess = {
    id: `${portal.id}:process:${normalizedNumber}`,
    externalId: `${portal.id}:process:${normalizedNumber}`,
    number: normalizedNumber,
    source: portal.name || 'DataJud/CNJ',
    datajudAlias: `api_publica_${alias}`,
    datajudUpdatedAt: toIso(record.dataHoraUltimaAtualizacao || record['@timestamp']),
    collectedAt: now,
    monitoring: 'active',
    ...(court ? { court } : {}),
    ...(normalizeText(record.classe?.nome) ? { actionType: normalizeText(record.classe.nome) } : {}),
    ...(subject ? { subject } : {}),
    ...(movementText && latestAt ? {
      lastMovement: movementText,
      lastMovementAt: latestAt,
      movements: movements.slice(0, 20).map(item => ({ code: String(item.codigo ?? ''), name: normalizeText(item.nome || ''), at: toIso(item.dataHora) }))
    } : {})
  };
  const monitoredTerms = uniqueTerms([...(target.terms || []), ...(config.monitoredTerms || []), config.monitoredTerm].filter(Boolean));
  const polos = Array.isArray(record.dadosBasicos?.polo) ? record.dadosBasicos.polo : (Array.isArray(record.polos) ? record.polos : []);
  const parties = polos.flatMap(polo => {
    const pole = normalizePole(polo.polo || polo.tipoPolo);
    return (Array.isArray(polo.partes) ? polo.partes : []).map(party => {
      const matchedTerms = monitoredTerms.filter(term => partyMatchesTerm(party, term));
      return { party, pole, matchedTerms };
    });
  });
  const representedPoles = [...new Set(parties.filter(item => item.matchedTerms.length).map(item => item.pole).filter(Boolean))];
  const representedPole = representedPoles.length === 1 ? representedPoles[0] : '';
  const relatedTermIds = target.intimations
    .filter(item => digits(item.process) === digits(normalizedNumber))
    .flatMap(item => item.monitoredTermIds || []);
  const matchedTermIds = parties.flatMap(item => item.matchedTerms.map(termIdentity));
  incomingProcess.monitoredTermIds = uniqueStrings([...(existing?.monitoredTermIds || []), ...relatedTermIds, ...matchedTermIds]);

  const discoveredContacts = parties.map(({ party, pole, matchedTerms }) => partyContact(party, {
    alias,
    normalizedNumber,
    now,
    portal,
    contactRole: representedPole
      ? (pole === representedPole ? (matchedTerms.length ? 'cliente' : 'outro') : 'adverso')
      : 'outro',
    monitoredTermIds: representedPole && pole === representedPole
      ? matchedTerms.map(termIdentity)
      : incomingProcess.monitoredTermIds
  })).filter(Boolean);
  const clients = discoveredContacts.filter(contact => contact.contactRole === 'cliente');
  const opponents = discoveredContacts.filter(contact => contact.contactRole === 'adverso');
  if (clients.length === 1) incomingProcess.client = clients[0].name;
  if (opponents.length === 1) {
    incomingProcess.counterpart = opponents[0].name;
    incomingProcess.opposingParty = opponents[0].name;
  }

  const before = JSON.stringify(existing || null);
  const processRecord = mergeExternalProcessRecord(existing, incomingProcess);
  if (existing) Object.assign(existing, processRecord);
  else target.processes.push(processRecord);
  target.contacts = mergeExternalContacts(target.contacts || [], discoveredContacts);

  const isNewMovement = latestAt && (!previousAt || timestamp(latestAt) > timestamp(previousAt));
  const recentEnough = latestAt && Date.now() - timestamp(latestAt) <= Math.max(1, Number(portal.movementLookbackDays || 7)) * 86_400_000;
  if (isNewMovement && recentEnough) {
    const eventId = `datajud:${digits(normalizedNumber)}:${String(latest.codigo || 'mov')}:${latestAt}`;
    const task = {
      id: `task:${eventId}`, externalId: `task:${eventId}`,
      title: 'Revisar nova movimentação no DataJud',
      description: normalizeText([movementText, processRecord.actionType, subject, court].filter(Boolean).join(' · ')),
      status: 'triagem', source: portal.name || 'DataJud/CNJ', client: processRecord.client || '', process: normalizedNumber,
      deadline: '', priority: 'normal',
      responsible: incomingProcess.monitoredTermIds.length === 1
        ? monitoredTerms.find(term => termIdentity(term) === incomingProcess.monitoredTermIds[0])?.shortName
          || monitoredTerms.find(term => termIdentity(term) === incomingProcess.monitoredTermIds[0])?.name
          || 'Advogado(a)'
        : 'Equipe jurídica',
      monitoredTermIds: incomingProcess.monitoredTermIds,
      createdAt: now
    };
    const taskIndex = target.tasks.findIndex(item => (item.externalId || item.id) === task.externalId);
    if (taskIndex >= 0) {
      const currentTask = target.tasks[taskIndex];
      const mergedTask = { ...currentTask };
      for (const [field, value] of Object.entries(task)) {
        if (meaningful(value) && !meaningful(mergedTask[field])) mergedTask[field] = value;
      }
      mergedTask.source = mergeSources(currentTask.source, task.source);
      mergedTask.monitoredTermIds = uniqueStrings([...(currentTask.monitoredTermIds || []), ...task.monitoredTermIds]);
      target.tasks[taskIndex] = mergedTask;
    } else target.tasks.push(task);
  }
  return before !== JSON.stringify(processRecord);
}

export function mergeExternalProcesses(left = [], right = []) {
  const result = (Array.isArray(left) ? left : []).map(record => safeRecord(record));
  for (const record of Array.isArray(right) ? right : []) {
    const incoming = safeRecord(record);
    const identity = processIdentity(incoming);
    const index = identity ? result.findIndex(item => processIdentity(item) === identity) : -1;
    if (index >= 0) result[index] = mergeExternalProcessRecord(result[index], incoming);
    else result.push(mergeExternalProcessRecord(null, incoming));
  }
  return result;
}

export function mergeExternalProcessRecord(existing, incoming) {
  const current = safeRecord(existing || {});
  const external = safeRecord(incoming || {});
  const merged = { ...current };
  const officialFields = new Set(['court', 'actionType', 'subject', 'datajudAlias', 'collectedAt']);
  const currentExternalAt = timestamp(current.datajudUpdatedAt || current.collectedAt);
  const incomingExternalAt = timestamp(external.datajudUpdatedAt || external.collectedAt);
  const currentIsDatajud = /DataJud|CNJ/i.test(String(current.source || '')) || Boolean(current.datajudAlias);

  for (const [field, value] of Object.entries(external)) {
    if (!meaningful(value) || ['lastMovement', 'lastMovementAt', 'movements', 'monitoredTermIds', 'source'].includes(field)) continue;
    if (field === 'id' || field === 'externalId' || field === 'number') {
      if (!meaningful(merged[field])) merged[field] = value;
    } else if (field === 'datajudUpdatedAt') {
      if (!timestamp(merged[field]) || timestamp(value) >= timestamp(merged[field])) merged[field] = value;
    } else if (officialFields.has(field)) {
      if (!meaningful(merged[field]) || (currentIsDatajud && incomingExternalAt && incomingExternalAt >= currentExternalAt)) merged[field] = value;
    } else if (!meaningful(merged[field])) {
      merged[field] = value;
    }
  }

  const canonicalNumber = formatProcessNumber(external.number || current.number);
  if (canonicalNumber) merged.number = canonicalNumber;
  merged.source = mergeSources(current.source, external.source);
  merged.monitoredTermIds = uniqueStrings([...(current.monitoredTermIds || []), ...(external.monitoredTermIds || [])]);
  const currentMovementAt = timestamp(current.lastMovementAt);
  const incomingMovementAt = timestamp(external.lastMovementAt);
  if (incomingMovementAt && (!currentMovementAt || incomingMovementAt > currentMovementAt || (incomingMovementAt === currentMovementAt && !meaningful(current.lastMovement)))) {
    merged.lastMovementAt = external.lastMovementAt;
    if (meaningful(external.lastMovement)) merged.lastMovement = external.lastMovement;
  }
  if (Array.isArray(current.movements) || Array.isArray(external.movements)) merged.movements = mergeMovements(current.movements, external.movements);
  return merged;
}

export function mergeExternalContacts(left = [], right = []) {
  const result = (Array.isArray(left) ? left : []).map(record => safeRecord(record));
  for (const record of Array.isArray(right) ? right : []) {
    const incoming = safeRecord(record);
    const index = contactMatchIndex(result, incoming);
    if (index >= 0) result[index] = mergeExternalContactRecord(result[index], incoming);
    else result.push(mergeExternalContactRecord(null, incoming));
  }
  return result;
}

export function mergeExternalContactRecord(existing, incoming) {
  const current = safeRecord(existing || {});
  const external = safeRecord(incoming || {});
  const merged = { ...current };
  for (const [field, value] of Object.entries(external)) {
    if (!meaningful(value) || ['source', 'relatedProcessNumbers', 'monitoredTermIds', 'contactRole'].includes(field)) continue;
    if (['datajudAlias', 'collectedAt'].includes(field) || !meaningful(merged[field])) merged[field] = value;
  }
  const currentWasExternal = /DataJud/i.test(String(current.source || ''));
  if (!meaningful(current.contactRole) || (currentWasExternal && current.contactRole === 'outro')) {
    merged.contactRole = external.contactRole || current.contactRole || 'outro';
  }
  merged.source = mergeSources(current.source, external.source);
  merged.relatedProcessNumbers = uniqueStrings([...(current.relatedProcessNumbers || []), ...(external.relatedProcessNumbers || [])]);
  merged.monitoredTermIds = uniqueStrings([...(current.monitoredTermIds || []), ...(external.monitoredTermIds || [])]);
  return merged;
}

function partyContact(party, { alias, normalizedNumber, now, portal, contactRole, monitoredTermIds }) {
  const person = party?.pessoa && typeof party.pessoa === 'object' ? party.pessoa : party;
  const name = normalizeText(person?.nome || party?.nome || '');
  if (!name) return null;
  const document = normalizeText(person?.numeroDocumentoPrincipal || party?.numeroDocumentoPrincipal || person?.documento || party?.documento || person?.cpf || person?.cnpj || '');
  const addressData = person?.endereco && typeof person.endereco === 'object' ? person.endereco : {};
  const address = normalizeText(typeof person?.endereco === 'string'
    ? person.endereco
    : [addressData.logradouro, addressData.numero, addressData.complemento].filter(Boolean).join(', '));
  const sourceId = normalizeText(party?.id || person?.id || '');
  const externalId = sourceId
    ? `datajud:party:${sourceId}`
    : document
      ? `datajud:document:${normalizeDocument(document)}`
      : `datajud:${digits(normalizedNumber)}:party:${normalizeIdentity(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
  return {
    id: `contact:${externalId}`,
    externalId,
    name,
    contactRole,
    ...(document ? { document } : {}),
    ...(normalizeText(person?.rg || party?.rg) ? { rg: normalizeText(person?.rg || party?.rg) } : {}),
    ...(normalizeText(person?.celular || party?.celular) ? { mobile: normalizeText(person?.celular || party?.celular) } : {}),
    ...(normalizeText(person?.telefone || party?.telefone) ? { phone: normalizeText(person?.telefone || party?.telefone) } : {}),
    ...(normalizeText(person?.email || party?.email) ? { email: normalizeText(person?.email || party?.email) } : {}),
    ...(normalizeText(person?.cidade || addressData.municipio) ? { city: normalizeText(person?.cidade || addressData.municipio) } : {}),
    ...(normalizeText(person?.uf || person?.estado || addressData.uf) ? { state: normalizeText(person?.uf || person?.estado || addressData.uf) } : {}),
    ...(address ? { address } : {}),
    ...(normalizeText(person?.bairro || addressData.bairro) ? { district: normalizeText(person?.bairro || addressData.bairro) } : {}),
    ...(normalizeText(person?.cep || addressData.cep) ? { zip: normalizeText(person?.cep || addressData.cep) } : {}),
    source: portal.name || 'DataJud/CNJ',
    datajudAlias: `api_publica_${alias}`,
    relatedProcessNumbers: [normalizedNumber],
    monitoredTermIds: uniqueStrings(monitoredTermIds),
    registeredAt: now.slice(0, 10),
    collectedAt: now
  };
}

function partyMatchesTerm(party, term) {
  const lawyers = Array.isArray(party?.advogado) ? party.advogado : (Array.isArray(party?.advogados) ? party.advogados : []);
  const termOab = digits(term?.oabNumber || term?.registration || '');
  const termRegistration = String(term?.registration || '');
  const termUf = normalizeText(term?.oabUf || termRegistration.match(/OAB\s*[\/\-]?\s*([A-Z]{2})/i)?.[1] || '').toUpperCase();
  const termName = normalizeIdentity(term?.name);
  return lawyers.some(lawyer => {
    const lawyerRegistration = String(lawyer?.inscricao || lawyer?.numero || lawyer?.oab || '');
    const lawyerOab = digits(lawyerRegistration);
    const lawyerUf = normalizeText(lawyer?.uf || lawyer?.oabUf || lawyerRegistration.match(/OAB\s*[\/\-]?\s*([A-Z]{2})/i)?.[1] || '').toUpperCase();
    const lawyerName = normalizeIdentity(lawyer?.nome);
    const exactName = termName && lawyerName && termName === lawyerName;
    const exactRegistration = termOab && lawyerOab && termOab === lawyerOab && termUf && lawyerUf && termUf === lawyerUf;
    if (termOab && lawyerOab) {
      if (termOab !== lawyerOab) return false;
      if (termUf && lawyerUf) return termUf === lawyerUf;
      return Boolean(exactName);
    }
    return Boolean(exactName);
  });
}

function contactMatchIndex(records, incoming) {
  const document = normalizeDocument(incoming.document);
  let strongerIdentityAmbiguous = false;
  if (document) {
    const matches = records.map((record, index) => normalizeDocument(record.document) === document ? index : -1).filter(index => index >= 0);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) strongerIdentityAmbiguous = true;
  }
  const externalId = normalizeText(incoming.externalId);
  if (externalId) {
    const matches = records.map((record, index) => normalizeText(record.externalId) === externalId ? index : -1).filter(index => index >= 0);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return -1;
  }
  if (strongerIdentityAmbiguous) return -1;
  const name = normalizeIdentity(incoming.name);
  if (!name) return -1;
  const matches = records.map((record, index) => {
    if (normalizeIdentity(record.name) !== name) return -1;
    const conflictingExternalId = externalId && normalizeText(record.externalId) && normalizeText(record.externalId) !== externalId;
    const conflictingDocument = document && normalizeDocument(record.document) && normalizeDocument(record.document) !== document;
    return conflictingExternalId || conflictingDocument ? -1 : index;
  }).filter(index => index >= 0);
  return matches.length === 1 ? matches[0] : -1;
}

function processIdentity(record) {
  const number = digits(record?.number);
  if (number) return `number:${number}`;
  const externalId = normalizeText(record?.externalId || record?.id);
  return externalId ? `external:${externalId}` : '';
}

function mergeMovements(left, right) {
  const combined = [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])];
  const byIdentity = new Map();
  for (const movement of combined) {
    if (!movement || typeof movement !== 'object') continue;
    const key = `${movement.code || ''}:${toIso(movement.at) || movement.at || ''}:${normalizeText(movement.name)}`;
    if (!byIdentity.has(key)) byIdentity.set(key, safeRecord(movement));
  }
  return [...byIdentity.values()].sort((a, b) => timestamp(b.at) - timestamp(a.at)).slice(0, 20);
}

function safeRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return {};
  return Object.fromEntries(Object.entries(record).filter(([key]) => !['__proto__', 'prototype', 'constructor'].includes(key)));
}

function meaningful(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function uniqueTerms(terms) {
  return [...new Map(terms.map(term => [termIdentity(term), term]).filter(([id]) => id)).values()];
}

function termIdentity(term) {
  if (String(term?.id || '').trim()) return String(term.id).trim();
  const registration = String(term?.registration || '');
  const uf = String(term?.oabUf || registration.match(/OAB\s*[\/\-]?\s*([A-Z]{2})/i)?.[1] || '').toUpperCase();
  const number = digits(term?.oabNumber || registration);
  if (uf && number) return `oab:${uf}:${number}`;
  return normalizeIdentity(term?.name);
}

function normalizePole(value) { return normalizeText(value || '').toUpperCase(); }
function normalizeDocument(value) { return String(value || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase(); }
function normalizeIdentity(value) { return normalizeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }
function uniqueStrings(values) { return [...new Set((Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(Boolean))]; }

function processNumbersFrom(target) {
  const values = [];
  for (const record of [...(target.processes || []), ...(target.intimations || []), ...(target.tasks || [])]) {
    const candidates = [record.number, record.process, record.text, record.description].filter(Boolean).join(' ');
    values.push(...(candidates.match(PROCESS_RE) || []));
  }
  return [...new Map(values.map(value => [digits(value), formatProcessNumber(value)])).values()].filter(Boolean);
}

export function aliasForProcess(value) {
  const valueDigits = digits(value);
  if (valueDigits.length !== 20) return '';
  const justice = valueDigits[13];
  const tribunal = valueDigits.slice(14, 16);
  if (justice === '1') return 'stf';
  if (justice === '2') return tribunal === '00' ? 'cnj' : '';
  if (justice === '3') return tribunal === '00' ? 'stj' : tribunal === '03' ? 'tjdft' : '';
  if (justice === '4') return `trf${Number(tribunal)}`;
  if (justice === '5') return `trt${Number(tribunal)}`;
  if (justice === '6') return `tre-${tribunal}`;
  if (justice === '7') return tribunal === '00' ? 'stm' : `tjm${tribunal}`;
  if (justice === '8') return STATE_ALIASES[tribunal] || '';
  return '';
}

function newestRecord(records) {
  return [...records].sort((a, b) => timestamp(b.dataHoraUltimaAtualizacao || b['@timestamp']) - timestamp(a.dataHoraUltimaAtualizacao || a['@timestamp']))[0];
}

function allowKeyRefresh(portal) { return portal.autoRefreshKey !== false && String(process.env.DATAJUD_AUTO_REFRESH_KEY ?? 'true').toLowerCase() !== 'false'; }
function normalizeApiKey(value) { return String(value || '').replace(/^\s*(?:Authorization\s*:\s*)?APIKey\s+/i, '').trim(); }
function digits(value) { return String(value || '').replace(/\D/g, ''); }
function formatProcessNumber(value) { const d = digits(value); return d.length === 20 ? `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16)}` : ''; }
function normalizeText(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
function mergeSources(left, right) { return [...new Set([...(String(left || '').split(' + ')), right].map(normalizeText).filter(Boolean))].join(' + '); }
function timestamp(value) { const parsed = Date.parse(String(value || '')); return Number.isFinite(parsed) ? parsed : 0; }
function toIso(value) { const parsed = timestamp(value); return parsed ? new Date(parsed).toISOString() : ''; }

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(60_000, Math.max(1_000, timeoutMs)));
  try { return await fetchImpl(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

export const datajudInternals = {
  aliasForProcess,
  formatProcessNumber,
  mergeDatajudRecord,
  normalizeApiKey,
  processNumbersFrom
};
