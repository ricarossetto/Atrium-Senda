const DEFAULT_ENDPOINT = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';
const OAB_SUFFIXES = ['', '-O', '-A', '-N', '-B', '-S', '-E'];
const PROCESS_DIGITS_RE = /\b\d{20}\b/;

export async function collectDjen(portal, config, target, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const sleep = options.sleep || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const registration = config.monitoredTerm?.registration || 'OAB/RS 135294';
  const uf = String(portal.ufOab || registration.match(/OAB\s*\/\s*([A-Z]{2})/i)?.[1] || 'RS').toUpperCase();
  const number = String(portal.numeroOab || registration).replace(/\D/g, '');
  if (!number || !/^[A-Z]{2}$/.test(uf)) throw new Error('O número ou a UF da OAB do monitoramento DJEN é inválido.');

  const endpoint = new URL(portal.url || DEFAULT_ENDPOINT);
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'comunicaapi.pje.jus.br') {
    throw new Error('O monitoramento DJEN aceita somente o endpoint oficial do CNJ.');
  }

  const { start, end } = saoPauloDateWindow(Number(portal.lookbackDays || 2));
  const variants = portal.queryOabVariants === false ? [number] : OAB_SUFFIXES.map(suffix => `${number}${suffix}`);
  const records = [];
  let announced = 0;
  let complete = true;

  for (const variant of variants) {
    const result = await fetchPages({ endpoint, variant, uf, start, end, portal, fetchImpl, sleep });
    records.push(...result.items);
    announced += result.count;
    complete &&= result.complete;
    if (variant !== variants.at(-1)) await sleep(Number(portal.requestSpacingMs || 500));
  }

  const unique = [...new Map(records.map(item => [String(item.id), item])).values()];
  for (const item of unique) appendDjenItem(item, portal, config, target);
  return { records: unique.length, announced, complete, start, end };
}

async function fetchPages({ endpoint, variant, uf, start, end, portal, fetchImpl, sleep }) {
  const items = [];
  const pageSize = Math.min(50, Math.max(1, Number(portal.pageSize || 50)));
  const maxPages = Math.min(200, Math.max(1, Number(portal.maxPages || 40)));
  let count = null;
  let pageRetries = 0;

  for (let pagina = 1; pagina <= maxPages; pagina += 1) {
    const url = new URL(endpoint);
    url.search = new URLSearchParams({
      numeroOab: variant,
      ufOab: uf,
      dataDisponibilizacaoInicio: start,
      dataDisponibilizacaoFim: end,
      pagina: String(pagina),
      itensPorPagina: String(pageSize)
    }).toString();

    const response = await fetchWithTimeout(fetchImpl, url, Number(portal.timeoutMs || 20_000));
    if (!response.ok) throw new Error(`DJEN respondeu HTTP ${response.status} para OAB ${variant}/${uf}.`);
    const payload = await response.json();
    if (count === null) count = Number(payload.count || 0);
    const pageItems = Array.isArray(payload.items) ? payload.items.filter(validDjenItem) : [];

    if (!pageItems.length) {
      if (items.length >= count) break;
      if (pageRetries >= 2) return { items, count, complete: false };
      pageRetries += 1;
      pagina -= 1;
      await sleep(750 * pageRetries);
      continue;
    }

    pageRetries = 0;
    items.push(...pageItems);
    if (items.length >= count) break;
    await sleep(Number(portal.requestSpacingMs || 500));
  }

  return { items, count: count || 0, complete: items.length >= (count || 0) };
}

function appendDjenItem(item, portal, config, target) {
  const rawNumber = String(item.numeroprocessocommascara || item.numeroProcesso || item.numero_processo || '');
  const process = formatProcessNumber(rawNumber);
  const externalId = `djen:${item.id}`;
  const canceledReason = normalizeText(item.motivo_cancelamento || item.motivoCancelamento || '');
  const text = htmlToText(item.texto || '').slice(0, 20_000);
  const recipients = Array.isArray(item.destinatarios)
    ? item.destinatarios.map(value => normalizeText(value?.nome)).filter(Boolean).join(' · ')
    : '';
  const publishedAt = String(item.data_disponibilizacao || item.dataDisponibilizacao || '').slice(0, 10);
  const communicationType = normalizeText(item.tipoComunicacao || 'Publicação judicial');
  const documentType = normalizeText(item.tipoDocumento || '');
  const court = normalizeText([item.siglaTribunal, item.nomeOrgao].filter(Boolean).join(' · ')) || 'DJEN/CNJ';
  const title = canceledReason ? `${communicationType} cancelada` : [communicationType, documentType].filter(Boolean).join(' · ');
  const description = normalizeText([item.nomeClasse, recipients, text, canceledReason && `Cancelamento: ${canceledReason}`].filter(Boolean).join(' · '));
  const term = `${config.monitoredTerm?.name || 'Ricardo De Luca Rossetto'} · ${config.monitoredTerm?.registration || 'OAB/RS 135294'}`;
  const now = new Date().toISOString();

  target.intimations.push({
    id: externalId,
    externalId,
    source: portal.name || 'DJEN/CNJ',
    status: canceledReason ? 'cancelada' : 'nova',
    unread: !canceledReason,
    title,
    process,
    client: recipients,
    court,
    publishedAt,
    text: description,
    term,
    createdAt: now,
    publicationStatus: normalizeText(item.status || ''),
    canceledReason,
    certificateUrl: safeCertificateUrl(item.hash),
    officialLink: safeOfficialLink(item.link)
  });

  if (!canceledReason) {
    target.tasks.push({
      id: `task:${externalId}`,
      externalId: `task:${externalId}`,
      title: `Analisar ${communicationType} no DJEN`,
      description,
      status: 'triagem',
      source: portal.name || 'DJEN/CNJ',
      client: recipients,
      process,
      deadline: '',
      priority: 'importante',
      responsible: 'Ricardo',
      createdAt: now
    });
  }
}

function validDjenItem(item) {
  return item && item.id !== undefined && String(item.numero_processo || item.numeroProcesso || '').replace(/\D/g, '').match(PROCESS_DIGITS_RE);
}

function safeCertificateUrl(hash) {
  const value = String(hash || '');
  return /^[A-Za-z0-9_-]{10,200}$/.test(value) ? `${DEFAULT_ENDPOINT}/${value}/certidao` : '';
}

function safeOfficialLink(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && /(^|\.)jus\.br$/i.test(url.hostname) ? url.href : '';
  } catch { return ''; }
}

function formatProcessNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length !== 20) return '';
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`;
}

function htmlToText(value) {
  return normalizeText(String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'"));
}

function normalizeText(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }

function saoPauloDateWindow(days) {
  const safeDays = Math.min(30, Math.max(1, Number.isFinite(days) ? Math.trunc(days) : 2));
  const end = dateInSaoPaulo(new Date());
  const startDate = new Date(`${end}T12:00:00-03:00`);
  startDate.setDate(startDate.getDate() - (safeDays - 1));
  return { start: dateInSaoPaulo(startDate), end };
}

function dateInSaoPaulo(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

async function fetchWithTimeout(fetchImpl, url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(60_000, Math.max(1_000, timeoutMs)));
  try {
    return await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Keller-Central-Juridica/1.0 (+monitoramento-local)' },
      redirect: 'error',
      signal: controller.signal
    });
  } finally { clearTimeout(timer); }
}

export const djenInternals = { formatProcessNumber, htmlToText, safeOfficialLink, saoPauloDateWindow, validDjenItem };
