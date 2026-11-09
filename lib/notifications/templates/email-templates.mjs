export function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const DEFAULT_BASE_URL = 'http://127.0.0.1:4173';
const FOOTER = 'Acompanhamento não substitui fontes oficiais. Não constitui ciência judicial.';
const COLORS = { paper: '#FAFAF8', ink: '#252A2E', muted: '#737B80', secondary: '#555D63', gold: '#A7894D', border: '#D2D6D5', background: '#F3F4F2' };
const CTA_STYLE = 'display:inline-block;background:#596C7A;color:#FFFFFF;text-decoration:none;font:600 14px/20px Arial,Inter,sans-serif;padding:12px 20px;border:1px solid #596C7A;border-radius:6px;';
const MAX_ITEMS = 8;
import { decodeHtmlEntities, stripHtmlToText } from '../../text/html-entities.mjs';

const MAX_FULL_TEXT_CHARS = 50000;

/**
 * Converte o teor oficial em texto legível: o Domicílio Eletrônico entrega HTML, e o
 * e-mail não deve exibir tags. Remove scripts/estilos, quebra blocos em linhas e
 * decodifica entidades.
 */
export function htmlToText(value) {
  return stripHtmlToText(value);
}

/** Só converte quando a fonte entrega documento HTML (Domicílio), não texto com tags soltas. */
export function readablePublicationText(value, fullTextSource = '') {
  const raw = String(value ?? '');
  if (!raw.trim()) return '';
  const isHtmlDocument = /^\s*(?:<!doctype\s+html|<html[\s>])/i.test(raw);
  const fromDomicilio = String(fullTextSource || '').toLowerCase() === 'domicilio';
  // Texto simples pode citar "<b>" literalmente; só reduzimos HTML quando a fonte
  // entrega um documento (Domicílio) ou o próprio teor se declara HTML.
  return isHtmlDocument || fromDomicilio ? htmlToText(raw) : decodeHtmlEntities(raw).trim();
}

function truncateText(str, maxLength = 240) {
  const clean = String(str ?? '').trim().replace(/\s+/g, ' ');
  return clean.length <= maxLength ? clean : `${clean.slice(0, maxLength).trim()}...`;
}

function collapsibleFullText(text, summary = 'Ler a íntegra da publicação') {
  const clean = String(text ?? '').trim();
  if (!clean) return { html: '', text: '' };
  const escaped = escapeHtml(clean).replace(/\r\n?/g, '\n').replace(/\n/g, '<br>');
  return {
    html: `<details style="margin-top:8px;"><summary style="min-height:44px;box-sizing:border-box;padding:13px 0;color:#40515D;font-size:13px;font-weight:700;cursor:pointer;">${escapeHtml(summary)}</summary><div style="margin-top:4px;padding:12px 14px;background:#FFFFFF;border:1px solid ${COLORS.border};border-radius:4px;font-size:13px;color:${COLORS.secondary};line-height:1.6;word-break:break-word;">${escaped}</div></details>`,
    text: `${summary}:\n${clean}`
  };
}

function sanitizeHeaderValue(value) {
  return String(value ?? '').replace(/[\r\n]/g, ' ').trim();
}

function safeUrl(value) {
  const raw = String(value ?? '').trim();
  if (/[\u0000-\u0020\u007f]/.test(raw)) return '';
  try {
    const url = new URL(raw);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}

function trustedBase(value) {
  const candidate = safeUrl(value || process.env.ATRIUM_BASE_URL || DEFAULT_BASE_URL);
  return candidate ? new URL(candidate).origin : DEFAULT_BASE_URL;
}

function formatDateBr(input, fallback = 'Não informada') {
  if (!input) return fallback;
  const str = String(input).trim();
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  const date = new Date(str);
  return Number.isNaN(date.getTime()) ? str : date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatTimeBr(input) {
  if (!input) return '';
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

function sourceLabel(value, allowUnknown = true) {
  const raw = String(value || '').trim();
  const normalized = raw.toLowerCase();
  const eproc = normalized.match(/^(?:eproc-)?(tj[a-z]{2}|tjm[a-z]{2}|trf\d|jf[a-z]{2})-eproc-(1g|2g)$/);
  if (eproc) return `eproc · ${eproc[1].toUpperCase()} · ${eproc[2] === '1g' ? '1º' : '2º'} grau`;
  const pje = normalized.match(/^pje-(tj[a-z]{2}|tjm[a-z]{2}|trf\d|trt\d+|tse|tst|cnj)(?:-(1g|2g|pjecor))?$/);
  if (pje) return ['PJe', pje[1].toUpperCase(), pje[2] === 'pjecor' ? 'Corregedoria' : pje[2] ? `${pje[2] === '1g' ? '1º' : '2º'} grau` : ''].filter(Boolean).join(' · ');
  const known = { djen: 'DJEN', datajud: 'DataJud', pje: 'PJe', eproc: 'eproc', domicilio: 'Domicílio Eletrônico', inpi: 'INPI', rpi: 'RPI' };
  return known[normalized] || (/^(?:tj[a-z]{2}|tjm[a-z]{2}|trf\d|trt\d+|jf[a-z]{2}|cnj|tse|tst)$/i.test(raw) ? raw.toUpperCase() : !allowUnknown || /^(?:eproc|pje|domicilio)-|^[a-z0-9]+-(?:eproc|pje)-/i.test(raw) ? 'Fonte judicial' : raw);
}

function isRestricted(item) {
  return Boolean(item.restricted || item.segredoJustica || item.isSecret || item.secrecy);
}

function paragraph(text, style = '') {
  return `<p style="margin:0 0 8px;${style}">${escapeHtml(text)}</p>`;
}

export function itemRow(title, lines = [], link = '', excerpt = '', extra = null, linkLabel = 'Ver no ATRIUM') {
  const details = lines.filter(Boolean);
  return {
    html: `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;table-layout:fixed;border-collapse:collapse;"><tr><td class="email-item" style="padding:12px 0;border-bottom:1px solid ${COLORS.border};overflow-wrap:anywhere;word-break:break-word;">
      ${paragraph(title, `font-weight:700;color:${COLORS.ink};`)}
      ${details.map(line => paragraph(line, `font-size:13px;color:${COLORS.secondary};`)).join('')}
      ${excerpt ? paragraph(excerpt) : ''}
      ${extra?.html || ''}
      ${link ? `<a href="${escapeHtml(link)}" style="display:inline-block;padding:12px 0;color:#40515D;text-decoration:underline;font-size:13px;">${escapeHtml(linkLabel)}</a>` : ''}
    </td></tr></table>`,
    text: [title, ...details, excerpt, extra?.text, link ? `${linkLabel}: ${link}` : ''].filter(Boolean).join('\n')
  };
}

function renderContainer(contentHtml, { baseUrl, judicial = true } = {}) {
  const resolvedBase = String(baseUrl || process.env.ATRIUM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const logoUrl = `${resolvedBase}/assets/icons/atrium-logo-email.png`;
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light"><title>ATRIUM</title>
<style> a:focus-visible { outline:2px solid #4C5E6B;outline-offset:3px; } @media(max-width:480px) { .email-padding { padding:20px !important; } .email-outer { padding:12px 8px !important; } } </style></head>
<body style="margin:0;padding:0;background:${COLORS.background};color:${COLORS.ink};font:14px/1.55 Arial,Inter,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;"><tr><td class="email-outer" align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" class="email-card" style="width:100%;max-width:600px;table-layout:fixed;border-collapse:collapse;background:${COLORS.paper};border:1px solid ${COLORS.border};">
<tr><td class="email-header email-padding" bgcolor="${COLORS.paper}" style="padding:24px 32px;border-bottom:2px solid ${COLORS.gold};background:${COLORS.paper};"><img src="${escapeHtml(logoUrl)}" width="240" height="60" alt="ATRIUM" style="display:block;width:240px;max-width:100%;height:auto;border:0;color:${COLORS.ink};font:700 24px Georgia,serif;"></td></tr>
<tr><td class="email-body email-padding" style="padding:24px 32px;overflow-wrap:anywhere;word-break:break-word;color:${COLORS.ink};font:14px/1.55 Arial,Inter,sans-serif;">${contentHtml}</td></tr>
<tr><td class="email-footer email-padding" style="padding:16px 32px;border-top:1px solid ${COLORS.border};font:12px/1.5 Arial,Inter,sans-serif;color:${COLORS.secondary};">${judicial ? paragraph(FOOTER) : ''}<p style="margin:0;">Mensagem automática do ATRIUM. Não responda a este e-mail.</p></td></tr>
</table></td></tr></table></body></html>`;
}

function cta(url, label = 'Ver no ATRIUM') {
  return `<p style="margin:24px 0 0;"><a class="btn-cta" href="${escapeHtml(url)}" style="${CTA_STYLE}">${escapeHtml(label)}</a></p>`;
}

function heading(title) {
  return `<h1 style="margin:0 0 8px;color:${COLORS.ink};font:400 26px/1.25 Georgia,'Playfair Display',serif;">${escapeHtml(title)}</h1>`;
}

function publicationRow(pub, baseUrl) {
  const processNum = pub.process || pub.number || pub.processNumber || 'Processo sem número';
  const source = sourceLabel(pub.source || '');
  const court = pub.court || pub.tribunal || '';
  const provenance = [source, court && !source.includes(court) ? court : '', pub.county || pub.courtUnit || pub.vara || pub.unit || ''].filter(Boolean).join(' · ');
  if (pub.scope === 'private' || pub.privateOwnerUserId || pub.captureSuppressed || isRestricted(pub)) return itemRow(processNum, [provenance, 'Publicação com acesso restrito. Consulte o conteúdo diretamente no ATRIUM.']);
  const published = formatDateBr(pub.publishedAt || pub.dataPublicacao);
  const available = formatDateBr(pub.disponibilizadoEm || pub.dataDisponibilizacao, published);
  const bodyText = readablePublicationText(pub.text || pub.sourceText || pub.ln || pub.fullText || pub.description || pub.excerpt || '', pub.fullTextSource);
  const canonicalFull = readablePublicationText(pub.ln || pub.fullText || '', pub.fullTextSource);
  const fullText = (canonicalFull && canonicalFull.length >= bodyText.length ? canonicalFull : bodyText);
  const excerpt = truncateText(bodyText || 'Sem conteúdo adicional.');
  const hasProcess = Boolean(String(pub.process || pub.number || pub.processNumber || '').trim());
  const allowFullText = pub.allowFullText !== false;
  const usingCanonicalFullText = Boolean(String(pub.ln || pub.fullText || '').trim());
  const fullTextTooLong = fullText.length > MAX_FULL_TEXT_CHARS;
  const fullBlock = hasProcess && allowFullText && !fullTextTooLong && fullText.length > excerpt.length
    ? collapsibleFullText(fullText, usingCanonicalFullText ? 'Ver mais — íntegra da publicação' : 'Ver mais — texto completo da publicação')
    : null;
  const fullTextNote = hasProcess && allowFullText && fullTextTooLong
    ? { html: paragraph('A íntegra é extensa; use "Ver mais no ATRIUM" para ler o texto completo.', `font-size:13px;color:${COLORS.secondary};margin-top:8px;`), text: 'A íntegra é extensa; use Ver mais no ATRIUM para ler o texto completo.' }
    : null;
  const publicationUrl = `${trustedBase(baseUrl)}/trabalho/publicacoes${pub.id ? `?publication=${encodeURIComponent(String(pub.id))}` : ''}`;
  return itemRow(processNum, [
    provenance,
    `Disponibilização: ${available} · Publicação: ${published}`,
    pub.actionClass || pub.classe || pub.tipo,
    pub.term ? `Termo monitorado: ${pub.term}` : '',
    [pub.client || pub.clientName, pub.opposingParty].filter(Boolean).length ? `Partes: ${[pub.client || pub.clientName, pub.opposingParty].filter(Boolean).join(' vs ')}` : '',
    pub.lawyers ? `Advogados: ${pub.lawyers}` : '',
    pub.deadline ? `Prazo registrado: ${formatDateBr(pub.deadline)}` : '',
    pub.fatalDeadline ? `Prazo fatal registrado: ${formatDateBr(pub.fatalDeadline)}` : '',
    pub.sourceReportedDeadlineAt ? `Referência da fonte${pub.sourceReportedDeadlineSource ? ` (${sourceLabel(pub.sourceReportedDeadlineSource)})` : ''}: ${formatDateBr(pub.sourceReportedDeadlineAt)}` : ''
  ], publicationUrl, excerpt, fullBlock || fullTextNote, 'Ver mais no ATRIUM');
}

function movementRow(movement, baseUrl) {
  return itemRow(movement.process || movement.processNumber || 'Processo sem número', [
    sourceLabel(movement.source || 'Andamento'),
    `Data: ${formatDateBr(movement.date)}`,
    !isRestricted(movement) && movement.client ? `Cliente: ${movement.client}` : ''
  ], isRestricted(movement) ? '' : `${trustedBase(baseUrl)}/#processes`, isRestricted(movement) ? 'Movimentação em processo com acesso restrito. Consulte o ATRIUM.' : truncateText(movement.description || 'Movimentação registrada.'));
}

function agendaRow(item) {
  if (isRestricted(item)) return itemRow('Compromisso com acesso restrito', ['Consulte a pauta e os detalhes no ATRIUM.']);
  return itemRow(item.title || item.type || 'Compromisso', [
    [item.date || item.datetime ? formatDateBr(item.date || item.datetime) : '', item.time || formatTimeBr(item.datetime), item.type].filter(Boolean).join(' · '),
    item.process || item.processNumber ? `Processo: ${item.process || item.processNumber}` : '',
    item.client ? `Cliente: ${item.client}` : '',
    sourceLabel(item.court || item.courtUnit)
  ]);
}

function deadlineRow(item) {
  if (isRestricted(item)) return itemRow('Prazo em processo com acesso restrito', ['Consulte os detalhes no ATRIUM.']);
  return itemRow(item.title || 'Prazo', [
    `${item.fatal === true || item.fatalDeadline ? 'PRAZO FATAL registrado' : 'Prazo registrado'}: ${formatDateBr(item.fatalDeadline || item.deadline || item.date)}`,
    item.process ? `Processo: ${item.process}` : '',
    item.client ? `Cliente: ${item.client}` : ''
  ]);
}

function syncFailureRow(payload) {
  const failures = Array.isArray(payload.failures) ? payload.failures : [];
  const sources = [...new Set(failures.map(failure => sourceLabel(failure.portal || failure.name, false)).filter(Boolean))];
  return itemRow('Sincronização requer atenção', [sources.join(' · '), 'Uma ou mais fontes não puderam ser consultadas. Confira o estado das integrações no ATRIUM.']);
}

function certificateRow(payload) {
  return itemRow('Certificado A1 próximo do vencimento', [`Data de expiração: ${formatDateBr(payload.notAfter)}`, 'Confira o certificado e providencie a renovação nas configurações.']);
}

export function renderPublicationDigest({ publications = [], movements = [], hearings = [], events = [], bulletin = null, digestContext = null, syncCompletedAt = new Date(), baseUrl } = {}) {
  const title = ({ 8: 'Resumo da manhã', 14: 'Resumo da tarde', 20: 'Resumo da noite' })[bulletin?.slot] || 'Resumo do dia';
  const clock = new Date(syncCompletedAt);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(String(bulletin?.day || '')) ? bulletin.day : Number.isNaN(clock.getTime()) ? '' : clock.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const dateLabel = day ? formatDateBr(day).slice(0, 5) : 'Data não informada';
  const context = bulletin?.includeFullContext === false ? bulletin.noticeChanges?.changed || digestContext : digestContext;
  const sections = [];
  const add = (label, items, renderer) => {
    if (!Array.isArray(items) || !items.length) return;
    const rows = items.slice(0, MAX_ITEMS).map(renderer);
    const overflow = items.length > MAX_ITEMS ? `Exibindo ${MAX_ITEMS} de ${items.length}. Veja os demais no ATRIUM.` : '';
    sections.push({ label, total: items.length, html: `<h2 style="margin:24px 0 4px;font:700 15px/1.4 Arial,Inter,sans-serif;color:${COLORS.ink};">${escapeHtml(label)} <span style="font-weight:400;color:${COLORS.secondary};">(${items.length})</span></h2>${rows.map(row => row.html).join('')}${overflow ? paragraph(overflow, `font-size:12px;color:${COLORS.secondary};margin-top:8px;`) : ''}`, text: `${label.toUpperCase()} (${items.length})\n${rows.map(row => row.text).join('\n\n')}${overflow ? `\n${overflow}` : ''}` });
  };
  const payloads = type => events.filter(event => event.event_type === type).map(event => event.payload || {});
  add('Prazos a vencer', context?.deadlines, deadlineRow);
  add('Alertas de prazo', payloads('DEADLINE_CRITICAL'), deadlineRow);
  add('Audiências e compromissos de hoje', context?.agendaToday, agendaRow);
  add('Audiências e compromissos de amanhã', context?.agendaTomorrow, agendaRow);
  add('Novas audiências', hearings.length ? hearings : payloads('HEARING_NEW'), agendaRow);
  add('Publicações judiciais', publications.length ? publications : payloads('PUBLICATION_NEW'), item => publicationRow(item, baseUrl));
  add('Movimentações processuais', movements.length ? movements : payloads('MOVEMENT_NEW'), item => movementRow(item, baseUrl));
  add('Integrações que requerem atenção', payloads('SYNC_FAILED'), syncFailureRow);
  add('Certificados A1', payloads('A1_CERT_EXPIRING'), certificateRow);
  if (bulletin?.includeFullContext === false) {
    for (const [key, label] of [['deadlines', 'Prazos retirados deste resumo'], ['agendaToday', 'Compromissos retirados da agenda de hoje'], ['agendaTomorrow', 'Compromissos retirados da agenda de amanhã']]) {
      add(label, bulletin.noticeChanges?.removed?.[key], item => itemRow(isRestricted(item) ? 'Registro com acesso restrito' : item.title || 'Registro', ['Não consta mais neste recorte. Confira o estado atual no ATRIUM.']));
    }
  }
  const sectionTotal = label => sections.find(section => section.label === label)?.total || 0;
  const countLabel = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`;
  const summaryBits = [
    [sectionTotal('Publicações judiciais'), 'publicação', 'publicações'],
    [sectionTotal('Prazos a vencer') + sectionTotal('Alertas de prazo'), 'prazo', 'prazos'],
    [sectionTotal('Audiências e compromissos de hoje'), 'compromisso hoje', 'compromissos hoje'],
    [sectionTotal('Audiências e compromissos de amanhã'), 'compromisso amanhã', 'compromissos amanhã'],
    [sectionTotal('Novas audiências'), 'nova audiência', 'novas audiências'],
    [sectionTotal('Movimentações processuais'), 'movimentação', 'movimentações']
  ].filter(([count]) => count > 0).map(([count, singular, plural]) => countLabel(count, singular, plural));
  const summaryText = summaryBits.length ? `Em resumo: ${summaryBits.join(', ')}.` : '';
  const subjectSuffix = summaryBits.slice(0, 2).join(', ');
  const subject = sanitizeHeaderValue(`ATRIUM | ${title} — ${dateLabel}${subjectSuffix ? ` — ${subjectSuffix}` : ''}`);
  const prepared = formatTimeBr(syncCompletedAt);
  const timestamp = prepared ? `Resumo preparado às ${prepared} (Brasília).` : 'Horário de preparação não informado.';
  const contextLabel = bulletin?.includeFullContext === false ? 'Novidades e alterações desde o resumo anterior.' : 'Agenda, prazos registrados e novidades do escritório.';
  const empty = 'Nenhuma novidade ou alteração informada para este resumo.';
  const directUrl = trustedBase(baseUrl);
  const content = `${heading(title)}${paragraph(`${formatDateBr(day)} · ${timestamp}`, `font-size:12px;color:${COLORS.secondary};`)}${paragraph(contextLabel)}${summaryText ? paragraph(summaryText, `font-size:13px;font-weight:600;color:${COLORS.ink};margin:0 0 12px;`) : ''}${sections.length ? '' : paragraph(empty)}${sections.map(section => section.html).join('')}${cta(directUrl)}`;
  return { subject, html: renderContainer(content, { baseUrl }), text: [`ATRIUM | ${title}`, `${formatDateBr(day)} · ${timestamp}`, contextLabel, summaryText, sections.length ? '' : empty, ...sections.map(section => section.text), `Ver no ATRIUM: ${directUrl}`, FOOTER].filter(Boolean).join('\n\n') };
}

export function renderSinglePublication({ publication = {}, baseUrl } = {}) {
  return renderPublicationDigest({ publications: [publication], baseUrl });
}

export function transactional(title, subject, rows, directUrl, { baseUrl, judicial = true, label = 'Ver no ATRIUM', intro = '', after = null } = {}) {
  const content = `${heading(title)}${intro ? paragraph(intro) : ''}${rows.map(row => row.html).join('')}${cta(directUrl, label)}${after?.html || ''}`;
  return { subject: sanitizeHeaderValue(subject), html: renderContainer(content, { baseUrl, judicial }), text: [title, intro, ...rows.map(row => row.text), `${label}: ${directUrl}`, judicial ? FOOTER : 'Mensagem automática do ATRIUM. Não responda a este e-mail.', after?.text || ''].filter(Boolean).join('\n\n') };
}

export function renderDeadlineCritical({ task = {}, hoursRemaining = 48, baseUrl } = {}) {
  const row = deadlineRow(task);
  const hours = Number(hoursRemaining);
  if (Number.isFinite(hours) && hours >= 0) {
    row.html += paragraph(`~${Math.round(hours)} horas restantes`, `font-size:13px;color:${COLORS.secondary};margin-top:8px;`);
    row.text += `\n~${Math.round(hours)} horas restantes`;
  }
  return transactional('Prazo crítico registrado', `ATRIUM | Prazo crítico em ${task.process || task.title || 'processo'}`, [row], `${trustedBase(baseUrl)}/#tasks`, { baseUrl, intro: 'Confira a obrigação cadastrada e sua data registrada no ATRIUM.' });
}

export function renderHearingNew({ hearing = {}, baseUrl } = {}) {
  return transactional('Nova audiência registrada', `ATRIUM | Nova audiência designada — ${hearing.process || hearing.title || ''}`, [agendaRow(hearing)], `${trustedBase(baseUrl)}/#agenda`, { baseUrl });
}

export function renderSyncFailed({ failures = [], timestamp = new Date(), baseUrl } = {}) {
  const time = formatTimeBr(timestamp);
  return transactional('Aviso de sincronização judicial', 'ATRIUM | Sincronização requer atenção', [syncFailureRow({ failures })], `${trustedBase(baseUrl)}/#configuration`, { baseUrl, intro: time ? `Aviso preparado às ${time} (Brasília).` : '' });
}

export function renderA1CertExpiring({ holder = 'Advogado Titular', documentMasked = '***.***.***-**', notAfter = null, milestoneDays = 30, baseUrl } = {}) {
  const days = Number.isFinite(Number(milestoneDays)) && Number(milestoneDays) >= 0 ? Math.round(Number(milestoneDays)) : 30;
  return transactional('Vencimento de certificado A1', `ATRIUM | Certificado Digital A1 vence em ${days} dia(s)`, [itemRow(holder, [`Documento: ${documentMasked}`, `Data de expiração: ${formatDateBr(notAfter)} (${days} dia(s) restante(s))`, 'Providencie a renovação e atualize o certificado nas configurações.'])], `${trustedBase(baseUrl)}/#configuration`, { baseUrl, label: 'Gerenciar certificado A1' });
}

export function renderTaskCompletionDigest({ items = [], date = new Date(), baseUrl } = {}) {
  const visible = (Array.isArray(items) ? items : []).slice(0, 20);
  const rows = visible.map(item => itemRow(
    item.title || 'Tarefa concluída',
    [
      item.actor ? `Concluída por ${item.actor}` : '',
      item.completedAt ? `Concluída em ${formatDateBr(item.completedAt)}${formatTimeBr(item.completedAt) ? ` às ${formatTimeBr(item.completedAt)}` : ''}` : '',
      item.process ? `Processo: ${item.process}` : '',
      item.client ? `Cliente: ${item.client}` : ''
    ],
    `${trustedBase(baseUrl)}/#tasks`
  ));
  const overflow = Math.max(0, (Array.isArray(items) ? items.length : 0) - visible.length);
  if (overflow > 0) rows.push(itemRow(`Mais ${overflow} tarefa(s) concluída(s)`, ['Abra o histórico de tarefas para consultar o restante.']));
  return transactional(
    'Tarefas concluídas',
    `ATRIUM | Tarefas concluídas — ${formatDateBr(date)}`,
    rows,
    `${trustedBase(baseUrl)}/#tasks`,
    { baseUrl, judicial: false, intro: 'Confirmação das tarefas concluídas no escritório desde o último resumo.' }
  );
}

export function renderTestEmail({ recipient, baseUrl } = {}) {
  const date = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  return transactional('Teste do sistema de notificações', 'ATRIUM | Teste do sistema de notificações', [itemRow('Envio de teste solicitado no painel', [`Destinatário: ${recipient || ''}`, `Data e hora: ${date} (Brasília)`, 'Nenhuma informação judicial ou dado restrito foi incluído nesta mensagem.'])], trustedBase(baseUrl), { baseUrl, judicial: false });
}

export function renderPasswordReset({ displayName = '', resetUrl = '', expiresMinutes = 30, baseUrl } = {}) {
  const candidate = safeUrl(resetUrl);
  const url = candidate && new URL(candidate).origin === trustedBase(baseUrl) ? candidate : '';
  const minutes = Number.isFinite(Number(expiresMinutes)) && Number(expiresMinutes) > 0 ? Math.round(Number(expiresMinutes)) : 30;
  const title = 'Redefinição de senha';
  const lines = [displayName ? `Olá, ${displayName}.` : 'Olá.', 'Recebemos uma solicitação para redefinir a senha da sua conta no ATRIUM.', `Este link é pessoal, funciona uma única vez e expira em ${minutes} minutos.`, 'Se não foi você, ignore este e-mail. Nenhuma alteração será feita e sua senha atual continua válida.', 'Use preferencialmente o link mais recente: pedir um novo link substitui e invalida os anteriores.', 'O ATRIUM nunca envia senhas por e-mail nem permite recuperar a senha anterior. A proteção em duas etapas, quando ativa, continua exigida no próximo acesso.'];
  const content = `${heading(title)}${lines.slice(0, 3).map(line => paragraph(line)).join('')}${url ? cta(url, 'Criar nova senha') : paragraph('Link indisponível. Solicite uma nova redefinição no ATRIUM.')}${lines.slice(3).map(line => paragraph(line, 'margin-top:16px;')).join('')}${url ? paragraph(`Se o botão não funcionar, copie este endereço no navegador: ${url}`, `font-size:12px;color:${COLORS.secondary};`) : ''}`;
  return { subject: 'ATRIUM | Redefinição de senha solicitada', html: renderContainer(content, { baseUrl, judicial: false }), text: [title, ...lines, url || 'Link indisponível. Solicite uma nova redefinição no ATRIUM.', 'Mensagem automática do ATRIUM. Não responda a este e-mail.'].join('\n\n') };
}
