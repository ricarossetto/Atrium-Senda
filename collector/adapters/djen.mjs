import { mergeExternalContacts, mergeExternalProcesses } from './datajud.mjs';

const DEFAULT_ENDPOINT = 'https://comunicaapi.pje.jus.br/api/v1/comunicacao';
const PROCESS_DIGITS_RE = /\b\d{20}\b/;

export async function collectDjen(portal, config, target, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const sleep = options.sleep || (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const registration = config.monitoredTerm?.registration || '';
  const uf = String(portal.ufOab || config.monitoredTerm?.oabUf || registration.match(/OAB\s*[\/\-]?\s*([A-Z]{2})/i)?.[1] || '').toUpperCase();
  const rawNumber = String(portal.numeroOab || config.monitoredTerm?.oabNumber || registration).replace(/\D/g, '');
  if (!rawNumber || !/^[A-Z]{2}$/.test(uf)) throw new Error('O número ou a UF da OAB do monitoramento DJEN é inválido.');

  const number = rawNumber;
  const endpoint = new URL(portal.url || DEFAULT_ENDPOINT);
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'comunicaapi.pje.jus.br') {
    throw new Error('O monitoramento DJEN aceita somente o endpoint oficial do CNJ.');
  }

  const cutoff = portal.cutoffDate || options.cutoffDate || null;
  const { start, end } = saoPauloDateWindow(Number(portal.lookbackDays || 2), cutoff);
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
  const recipientRecords = Array.isArray(item.destinatarios) ? item.destinatarios.filter(value => normalizeText(value?.nome)) : [];
  const recipients = recipientRecords.map(value => normalizeText(value?.nome)).join(' · ');
  const publishedAt = String(item.data_disponibilizacao || item.dataDisponibilizacao || '').slice(0, 10);
  const communicationType = normalizeText(item.tipoComunicacao || 'Publicação judicial');
  const documentType = normalizeText(item.tipoDocumento || '');
  const court = normalizeText([item.siglaTribunal, item.nomeOrgao].filter(Boolean).join(' · ')) || 'DJEN/CNJ';
  const title = canceledReason ? `${communicationType} cancelada` : [communicationType, documentType].filter(Boolean).join(' · ');
  const description = normalizeText([item.nomeClasse, recipients, text, canceledReason && `Cancelamento: ${canceledReason}`].filter(Boolean).join(' · '));
  const term = `${config.monitoredTerm?.name || 'Advogado(a) Titular'} · ${config.monitoredTerm?.registration || 'OAB/UF 000000'}`;
  const monitoredTermId = termIdentity(config.monitoredTerm);
  const now = new Date().toISOString();
  const monitoredTerms = [...(config.monitoredTerms || []), config.monitoredTerm].filter(Boolean);
  const matchedTerms = monitoredTerms.filter(termItem => publicationMatchesTerm(item, termItem));
  const recipientPoles = new Set(recipientRecords.map(recipient => normalizePole(recipient.polo)).filter(Boolean));
  const singleRepresentedPole = matchedTerms.length > 0 && recipientPoles.size === 1;

  const discoveredContacts = recipientRecords.map((recipient, index) => {
    const name = normalizeText(recipient.nome);
    const selfParty = monitoredTerms.some(termItem => normalizeIdentity(termItem.name) === normalizeIdentity(name));
    const role = singleRepresentedPole && !selfParty ? 'cliente' : 'outro';
    const slug = normalizeIdentity(name).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || String(index + 1);
    const localIdentity = `djen:${process.replace(/\D/g, '') || item.id}:recipient:${slug}`;
    return {
      id: `contact:${localIdentity}`,
      name,
      contactRole: role,
      source: portal.name || 'DJEN/CNJ',
      relatedProcessNumbers: process ? [process] : [],
      monitoredTermIds: matchedTerms.map(termIdentity).filter(Boolean),
      relationshipProvenance: {
        status: role === 'cliente' ? 'inferred-from-authoritative-source' : 'requires-human-confirmation',
        reason: selfParty ? 'monitored-professional-is-party' : role === 'cliente' ? 'djen-monitored-oab-single-recipient-pole' : 'djen-multiple-recipient-poles',
        source: portal.name || 'DJEN/CNJ',
        collectedAt: now
      },
      registeredAt: publishedAt || now.slice(0, 10),
      collectedAt: now
    };
  });
  target.contacts = mergeExternalContacts(target.contacts || [], discoveredContacts);
  if (process) {
    const representedContacts = discoveredContacts.filter(contact => contact.contactRole === 'cliente');
    const canonicalClient = representedContacts.length === 1
      ? target.contacts.find(contact => normalizeIdentity(contact.name) === normalizeIdentity(representedContacts[0].name)
        && (contact.relatedProcessNumbers || []).some(number => number.replace(/\D/g, '') === process.replace(/\D/g, '')))
      : null;
    target.processes = mergeExternalProcesses(target.processes || [], [{
      id: `djen:process:${process.replace(/\D/g, '')}`,
      externalId: `djen:process:${process.replace(/\D/g, '')}`,
      number: process,
      source: portal.name || 'DJEN/CNJ',
      monitoring: 'active',
      ...(court ? { court } : {}),
      ...(normalizeText(item.nomeClasse) ? { actionType: normalizeText(item.nomeClasse) } : {}),
      ...(publishedAt ? { registeredAt: publishedAt, latestPublicationAt: publishedAt } : {}),
      ...(title ? { latestPublicationTitle: decodeHtmlEntities(title) } : {}),
      monitoredTermIds: uniqueStrings([monitoredTermId, ...matchedTerms.map(termIdentity)]),
      ...(canonicalClient?.id ? { client: canonicalClient.name, contactId: canonicalClient.id } : {})
    }]);
  }

  const incoming = {
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
    monitoredTermIds: monitoredTermId ? [monitoredTermId] : [],
    status: 'nova',
    unread: true,
    createdAt: now,
    certificateUrl: safeCertificateUrl(item.hash),
    officialLink: safeOfficialLink(item.link || item.url)
  };
  const existing = target.intimations.find(record => (record.externalId || record.id) === externalId);
  if (!existing) {
    target.intimations.push(incoming);
    return;
  }

  for (const field of ['source', 'type', 'title', 'text', 'description', 'court', 'process', 'client', 'publishedAt', 'certificateUrl', 'officialLink']) {
    if (incoming[field] !== '' && incoming[field] !== null && incoming[field] !== undefined) existing[field] = incoming[field];
  }
  existing.monitoredTermIds = [...new Set([...(existing.monitoredTermIds || []), ...incoming.monitoredTermIds].filter(Boolean))];
  existing.term ||= term;
}

function termIdentity(term) {
  if (!term || typeof term !== 'object') return '';
  if (String(term.id || '').trim()) return String(term.id).trim();
  const registration = String(term.registration || '');
  const uf = String(term.oabUf || registration.match(/OAB\s*[\/\-]?\s*([A-Z]{2})/i)?.[1] || '').toUpperCase();
  const number = String(term.oabNumber || registration).replace(/\D/g, '');
  if (uf && number) return `oab:${uf}:${number}`;
  return normalizeText(term.name || '').toLocaleLowerCase('pt-BR');
}

function publicationMatchesTerm(item, term) {
  const termOab = String(term?.oabNumber || term?.registration || '').replace(/\D/g, '');
  const registration = String(term?.registration || '');
  const termUf = normalizeText(term?.oabUf || registration.match(/OAB\s*[\/\-]?\s*([A-Z]{2})/i)?.[1] || '').toUpperCase();
  const termName = normalizeIdentity(term?.name);
  const links = Array.isArray(item?.destinatarioadvogados) ? item.destinatarioadvogados : [];
  return links.some(link => {
    const lawyer = link?.advogado && typeof link.advogado === 'object' ? link.advogado : link;
    const lawyerOab = String(lawyer?.numero_oab || lawyer?.numeroOab || lawyer?.oab || '').replace(/\D/g, '');
    const lawyerUf = normalizeText(lawyer?.uf_oab || lawyer?.ufOab || lawyer?.uf || '').toUpperCase();
    const lawyerName = normalizeIdentity(lawyer?.nome);
    if (termOab && lawyerOab) return termOab === lawyerOab && (!termUf || !lawyerUf || termUf === lawyerUf);
    return Boolean(termName && lawyerName && termName === lawyerName);
  });
}

function normalizeIdentity(value) {
  return normalizeText(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

function normalizePole(value) {
  const pole = normalizeText(value).toUpperCase();
  return pole === 'A' || pole === 'AT' || pole === 'ATIVO' ? 'active'
    : pole === 'P' || pole === 'PA' || pole === 'PASSIVO' ? 'passive'
      : pole || '';
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value || '').trim()).filter(Boolean))];
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

function saoPauloDateWindow(days, cutoffDate) {
  const end = dateInSaoPaulo(new Date());
  if (cutoffDate && typeof cutoffDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) {
    return { start: cutoffDate > end ? end : cutoffDate, end };
  }
  const safeDays = Math.min(30, Math.max(1, Number.isFinite(days) ? Math.trunc(days) : 2));
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

export const djenInternals = { formatProcessNumber, htmlToText, safeOfficialLink, saoPauloDateWindow, termIdentity, validDjenItem };
