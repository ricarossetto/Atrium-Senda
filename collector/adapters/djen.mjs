const DEFAULT_ENDPOINT = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';
const PROCESS_DIGITS_RE = /\b\d{20}\b/;

export async function collectDjen(portal, config, target, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const sleep = options.sleep || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const registration = config.monitoredTerm?.registration || 'OAB/RS 135294';
  const uf = String(portal.ufOab || config.monitoredTerm?.oabUf || registration.match(/OAB\s*[\/\-]?\s*([A-Z]{2})/i)?.[1] || registration.match(/([A-Z]{2})/i)?.[1] || 'RS').toUpperCase();
  const rawNumber = String(portal.numeroOab || config.monitoredTerm?.oabNumber || registration).replace(/\D/g, '');
  if (!rawNumber || !/^[A-Z]{2}$/.test(uf)) throw new Error('O número ou a UF da OAB do monitoramento DJEN é inválido.');

  const number = rawNumber;
  const endpoint = new URL(portal.url || DEFAULT_ENDPOINT);
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'comunicaapi.pje.jus.br') {
    throw new Error('O monitoramento DJEN aceita somente o endpoint oficial do CNJ.');
  }

  const { start, end } = saoPauloDateWindow(Number(portal.lookbackDays || 2));
  const result = await fetchPages({ endpoint, variant: number, uf, start, end, portal, fetchImpl, sleep });

  const unique = [...new Map(result.items.map(item => [String(item.id), item])).values()];
  for (const item of unique) appendDjenItem(item, portal, config, target);
  return { records: unique.length, announced: result.count, complete: result.complete, start, end };
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

    let response;
    try {
      response = await fetchWithTimeout(fetchImpl, url, Number(portal.timeoutMs || 20_000));
    } catch (err) {
      if (pageRetries < 2) {
        pageRetries += 1;
        await sleep(1500 * pageRetries);
        pagina -= 1;
        continue;
      }
      throw err;
    }

    if (response.status === 429) {
      if (pageRetries < 3) {
        pageRetries += 1;
        await sleep(2000 * pageRetries);
        pagina -= 1;
        continue;
      }
      throw new Error(`DJEN limitou requisições (HTTP 429). Tente novamente em instantes.`);
    }

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
    await sleep(Number(portal.requestSpacingMs || 400));
  }

  return { items, count: count || 0, complete: items.length >= (count || 0) };
}

export function decodeHtmlEntities(value) {
  if (!value) return '';
  const ENTITY_MAP = {
    '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'",
    '&ccedil;': 'ç', '&Ccedil;': 'Ç',
    '&aacute;': 'á', '&Aacute;': 'Á', '&eacute;': 'é', '&Eacute;': 'É', '&iacute;': 'í', '&Iacute;': 'Í', '&oacute;': 'ó', '&Oacute;': 'Ó', '&uacute;': 'ú', '&Uacute;': 'Ú',
    '&agrave;': 'à', '&Agrave;': 'À', '&egrave;': 'è', '&Egrave;': 'È', '&igrave;': 'ì', '&Igrave;': 'Ì', '&ograve;': 'ò', '&Ograve;': 'Ò', '&ugrave;': 'ù', '&Ugrave;': 'Ù',
    '&atilde;': 'ã', '&Atilde;': 'Ã', '&otilde;': 'õ', '&Otilde;': 'Õ', '&ntilde;': 'ñ', '&Ntilde;': 'Ñ',
    '&acirc;': 'â', '&Acirc;': 'Â', '&ecirc;': 'ê', '&Ecirc;': 'Ê', '&icirc;': 'î', '&Icirc;': 'Î', '&ocirc;': 'ô', '&Ocirc;': 'Ô', '&ucirc;': 'û', '&Ucirc;': 'Û',
    '&auml;': 'ä', '&Auml;': 'Ä', '&euml;': 'ë', '&Euml;': 'Ë', '&iuml;': 'ï', '&Iuml;': 'Ï', '&ouml;': 'ö', '&Ouml;': 'Ö', '&uuml;': 'ü', '&Uuml;': 'Ü',
    '&ordf;': 'ª', '&ordm;': 'º', '&deg;': '°', '&sect;': '§', '&copy;': '©', '&reg;': '®', '&trade;': '™',
    '&ndash;': '–', '&mdash;': '—', '&lsquo;': '‘', '&rsquo;': '’', '&ldquo;': '“', '&rdquo;': '”', '&bull;': '•', '&hellip;': '…'
  };

  let text = String(value);
  for (const [entity, char] of Object.entries(ENTITY_MAP)) {
    text = text.replaceAll(entity, char);
    text = text.replaceAll(entity.toUpperCase(), char);
  }
  text = text.replace(/&#(\d+);/g, (_, dec) => {
    try { return String.fromCodePoint(Number(dec)); } catch { return _; }
  });
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return _; }
  });
  return text;
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
  const term = `${config.monitoredTerm?.name || 'Advogado(a) Titular'} · ${config.monitoredTerm?.registration || 'OAB/RS 135294'}`;
  const now = new Date().toISOString();

  target.intimations.push({
    id: externalId,
    externalId,
    source: portal.name || 'DJEN/CNJ',
    type: 'djen',
    title: decodeHtmlEntities(title),
    text: decodeHtmlEntities(text),
    description: decodeHtmlEntities(description),
    court: decodeHtmlEntities(court),
    process,
    client: decodeHtmlEntities(recipients),
    publishedAt,
    term,
    status: 'nova',
    unread: true,
    createdAt: now,
    certificateUrl: safeCertificateUrl(item.hash),
    officialLink: safeOfficialLink(item.link || item.url)
  });
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
  const stripped = String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return normalizeText(decodeHtmlEntities(stripped));
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
