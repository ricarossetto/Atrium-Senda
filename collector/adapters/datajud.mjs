const API_BASE = 'https://api-publica.datajud.cnj.jus.br';
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
  const numbers = [...new Map([
    ...processNumbersFrom(target),
    ...(options.seedProcessNumbers || []).map(formatProcessNumber).filter(Boolean)
  ].map(value => [digits(value), value])).values()].slice(0, Math.min(500, Math.max(1, Number(portal.maxProcessesPerRun || 250))));
  let apiKey = normalizeApiKey(options.apiKey || process.env.DATAJUD_API_KEY);
  let refreshedKey = false;
  let found = 0;
  let updated = 0;
  let partial = 0;
  let failed = 0;

  if (!numbers.length) return { queried: 0, found, updated, partial, failed, refreshedKey, complete: true };
  if (!apiKey && allowKeyRefresh(portal)) {
    apiKey = await fetchCurrentPublicKey(fetchImpl, portal);
    refreshedKey = true;
  }
  if (!apiKey) throw new Error('A chave pública do DataJud não está configurada e não pôde ser obtida da página oficial.');

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
  const normalizedNumber = formatProcessNumber(record.numeroProcesso || number) || number;
  const existing = target.processes.find(item => digits(item.number) === digits(normalizedNumber));
  const movements = [...(Array.isArray(record.movimentos) ? record.movimentos : [])].sort((a, b) => timestamp(b?.dataHora) - timestamp(a?.dataHora));
  const latest = movements[0] || {};
  const latestAt = toIso(latest.dataHora || record.dataHoraUltimaAtualizacao || record['@timestamp']);
  const previousAt = toIso(existing?.lastMovementAt);
  const subject = (Array.isArray(record.assuntos) ? record.assuntos.map(item => item?.nome).filter(Boolean) : []).join(' · ');
  const court = normalizeText([record.tribunal, record.grau, record.orgaoJulgador?.nome].filter(Boolean).join(' · ')) || alias.toUpperCase();
  const movementText = normalizeText(latest.nome || existing?.lastMovement || 'Movimentação consultada no DataJud');
  const now = new Date().toISOString();
  const processRecord = existing || {
    id: `${portal.id}:process:${normalizedNumber}`,
    externalId: `${portal.id}:process:${normalizedNumber}`,
    number: normalizedNumber,
    client: '',
    secrecy: false,
    monitoring: 'active'
  };
  processRecord.number = normalizedNumber;
  processRecord.court = court;
  processRecord.actionType = normalizeText(record.classe?.nome || processRecord.actionType || '');
  processRecord.subject = subject || processRecord.subject || '';
  processRecord.lastMovement = movementText;
  processRecord.lastMovementAt = latestAt || previousAt || now.slice(0, 10);
  processRecord.source = mergeSources(processRecord.source, portal.name || 'DataJud/CNJ');
  processRecord.datajudAlias = `api_publica_${alias}`;
  processRecord.datajudUpdatedAt = toIso(record.dataHoraUltimaAtualizacao || record['@timestamp']) || now;
  processRecord.collectedAt = now;
  processRecord.movements = movements.slice(0, 20).map(item => ({ code: String(item.codigo ?? ''), name: normalizeText(item.nome || ''), at: toIso(item.dataHora) }));
  if (!existing) target.processes.push(processRecord);

  const isNewMovement = latestAt && (!previousAt || timestamp(latestAt) > timestamp(previousAt));
  const recentEnough = latestAt && Date.now() - timestamp(latestAt) <= Math.max(1, Number(portal.movementLookbackDays || 7)) * 86_400_000;
  if (isNewMovement && recentEnough) {
    const eventId = `datajud:${digits(normalizedNumber)}:${String(latest.codigo || 'mov')}:${latestAt}`;
    target.tasks.push({
      id: `task:${eventId}`, externalId: `task:${eventId}`,
      title: 'Revisar nova movimentação no DataJud',
      description: normalizeText([movementText, processRecord.actionType, subject, court].filter(Boolean).join(' · ')),
      status: 'triagem', source: portal.name || 'DataJud/CNJ', client: processRecord.client || '', process: normalizedNumber,
      deadline: '', priority: 'normal', responsible: config.monitoredTerm?.shortName || 'Ricardo', createdAt: now
    });
  }
  return !previousAt || timestamp(processRecord.lastMovementAt) > timestamp(previousAt);
}

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

export const datajudInternals = { aliasForProcess, formatProcessNumber, normalizeApiKey, processNumbersFrom };
