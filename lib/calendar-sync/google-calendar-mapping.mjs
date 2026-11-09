// Tradução entre registros do ATRIUM e eventos do Google Agenda. Módulo puro.
import { createHash } from 'node:crypto';
import { materializeCollection } from '../../js/core/recurrence.js';

export const TIME_ZONE = 'America/Sao_Paulo';
export const PERSONAL_SOURCE = 'Agenda pessoal';
export const WINDOW_PAST_DAYS = 30;
export const WINDOW_FUTURE_DAYS = 365;

// Tudo depois desta linha é contexto do ATRIUM e não volta para o registro.
const CONTEXT_MARKER = '— ATRIUM —';
const EDITABLE_SOURCES = new Set(['', 'interna', PERSONAL_SOURCE.toLocaleLowerCase('pt-BR')]);
const EXTERNAL_SOURCE = 'agenda externa';
const TASK_NOTE = 'Prazo mantido pelo ATRIUM. Alterar aqui não muda o prazo.';
const CLOSED_TASK_STATUS = new Set(['concluida', 'cancelada']);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

export function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function civilDate(value) {
  const raw = String(value || '').slice(0, 10);
  return DATE_RE.test(raw) ? raw : '';
}

function cleanTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return '';
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function oneHourLater(date, time) {
  const [hour, minute] = time.split(':').map(Number);
  const next = hour + 1;
  return next >= 24
    ? { endDate: addDays(date, 1), endTime: `${String(next - 24).padStart(2, '0')}:${String(minute).padStart(2, '0')}` }
    : { endDate: '', endTime: `${String(next).padStart(2, '0')}:${String(minute).padStart(2, '0')}` };
}

const plainText = value => String(value ?? '').trim();

// O título na agenda diz de quem é: cliente e, sem cliente, o processo.
function titleContext(record) {
  return plainText(record.client) || plainText(record.process);
}

function withContext(title, record) {
  const context = titleContext(record);
  if (!context || title.toLocaleLowerCase('pt-BR').includes(context.toLocaleLowerCase('pt-BR'))) return title;
  return `${title} · ${context}`;
}

function withoutContext(summary, record) {
  const suffix = ` · ${titleContext(record)}`;
  return titleContext(record) && summary.endsWith(suffix) ? summary.slice(0, -suffix.length).trim() : summary;
}

function contextLines(record) {
  return [
    record.client ? `Cliente: ${plainText(record.client)}` : '',
    record.process ? `Processo: ${plainText(record.process)}` : ''
  ].filter(Boolean).join('\n');
}

/** Campos comparáveis de um compromisso, como devem aparecer no Google. */
export function agendaFields(record, { privacy = 'full', origin = 'atrium' } = {}) {
  const reduced = privacy === 'reduced' && origin !== 'google';
  const date = civilDate(record.date);
  const time = cleanTime(record.time);
  let endDate = civilDate(record.endDate);
  if (endDate && endDate <= date) endDate = '';
  let endTime = time ? cleanTime(record.endTime) : '';
  if (time && !endTime) ({ endDate, endTime } = oneHourLater(date, time));
  else if (time && !endDate && endTime <= time) endDate = addDays(date, 1);
  return {
    summary: reduced ? 'Compromisso' : (origin === 'google' ? plainText(record.title) : withContext(plainText(record.title), record)),
    description: reduced ? '' : plainText(record.description ?? record.notes),
    location: reduced ? '' : plainText(record.location),
    allDay: !time,
    date,
    endDate,
    time,
    endTime,
    footer: reduced ? '' : contextLines(record),
    colorId: '',
    transparent: false
  };
}

// Título que já começa com "Prazo" não ganha outro "Prazo:" na frente.
function taskSummary(label, title) {
  if (new RegExp(`^${label}\\b`, 'i').test(title)) return title;
  if (label === 'Prazo' && /^prazo\b/i.test(title)) return title;
  return `${label}: ${title}`;
}

/** Prazo vira evento de dia inteiro e não bloqueia horário na agenda pessoal. */
export function taskFields(task, { privacy = 'full' } = {}) {
  const fatal = Boolean(task.fatalDeadline);
  const label = fatal ? 'Prazo fatal' : 'Prazo';
  const reduced = privacy === 'reduced';
  return {
    summary: reduced ? label : withContext(taskSummary(label, plainText(task.title)), task),
    description: '',
    location: '',
    allDay: true,
    date: civilDate(task.fatalDeadline || task.deadline),
    endDate: '',
    time: '',
    endTime: '',
    footer: [reduced ? '' : contextLines(task), TASK_NOTE].filter(Boolean).join('\n'),
    colorId: fatal ? '11' : '',
    transparent: true
  };
}

/** O que o Google consegue devolver. Contexto e cor ficam de fora da comparação de entrada. */
export function comparable(fields) {
  return JSON.stringify([fields.summary, fields.description, fields.location, Boolean(fields.allDay), fields.date, fields.endDate, fields.time, fields.endTime]);
}

export function outboundSignature(fields) {
  return `${comparable(fields)}|${fields.footer}|${fields.colorId}|${fields.transparent}`;
}

function partsInZone(iso) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date(iso)).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function descriptionText(value) {
  const text = String(value || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return text.split(CONTEXT_MARKER)[0].trim();
}

/** Lê um evento do Google nos mesmos campos de `agendaFields`. Sem data válida, devolve null. */
export function fieldsFromEvent(event) {
  const start = event?.start || {};
  const end = event?.end || {};
  const base = { summary: plainText(event?.summary), description: descriptionText(event?.description), location: plainText(event?.location), footer: '', colorId: '', transparent: false };
  if (start.date) {
    const date = civilDate(start.date);
    if (!date) return null;
    const last = end.date ? addDays(civilDate(end.date), -1) : date;
    return { ...base, allDay: true, date, endDate: last > date ? last : '', time: '', endTime: '' };
  }
  if (!start.dateTime || Number.isNaN(Date.parse(start.dateTime))) return null;
  const from = partsInZone(start.dateTime);
  const to = end.dateTime && !Number.isNaN(Date.parse(end.dateTime)) ? partsInZone(end.dateTime) : null;
  return { ...base, allDay: false, date: from.date, endDate: to && to.date !== from.date ? to.date : '', time: from.time, endTime: to?.time || '' };
}

export function eventBody(fields, { key = '', locked = false, origin = 'atrium' } = {}) {
  const description = [fields.description, fields.footer ? `${CONTEXT_MARKER}\n${fields.footer}` : ''].filter(Boolean).join('\n\n');
  const lastDay = fields.endDate || fields.date;
  const body = {
    summary: fields.summary,
    description,
    location: fields.location,
    start: fields.allDay ? { date: fields.date } : { dateTime: `${fields.date}T${fields.time}:00`, timeZone: TIME_ZONE },
    end: fields.allDay ? { date: addDays(lastDay, 1) } : { dateTime: `${lastDay}T${fields.endTime}:00`, timeZone: TIME_ZONE }
  };
  if (origin === 'atrium') {
    body.status = 'confirmed';
    body.transparency = fields.transparent ? 'transparent' : 'opaque';
    if (fields.colorId) body.colorId = fields.colorId;
    body.extendedProperties = { private: { atriumKey: key, atriumLocked: locked ? 'true' : 'false' } };
  }
  return body;
}

/** Id previsível: repetir o envio depois de uma falha nunca duplica o evento. */
export function eventIdFor(userId, key) {
  return `atr${createHash('sha256').update(`${userId}|${key}`).digest('hex').slice(0, 40)}`;
}

export function privateRecordId(userId, googleEventId) {
  return `agenda-google-${createHash('sha256').update(`${userId}|${googleEventId}`).digest('hex').slice(0, 32)}`;
}

/** Só compromisso comum aceita mudança vinda de fora; o que vem de tribunal ou série não. */
export function isLockedAgenda(record) {
  if (record?.recurrence || record?.seriesId) return true;
  return !EDITABLE_SOURCES.has(String(record?.source || '').trim().toLocaleLowerCase('pt-BR'));
}

function isFromExternalLink(record) {
  return String(record?.source || '').trim().toLocaleLowerCase('pt-BR') === EXTERNAL_SOURCE
    || String(record?.externalId || '').startsWith('external-calendar:');
}

function taskIsOpen(task) {
  return Boolean(task) && task.active !== false && !task.absorbedInto && !task.completedAt && !task.discardedAt
    && !CLOSED_TASK_STATUS.has(String(task.status || '')) && Boolean(civilDate(task.fatalDeadline || task.deadline));
}

function taskBelongsTo(task, user) {
  const ids = [user?.id, user?.username].filter(Boolean).map(String);
  const assignee = String(task.assigneeUserId || '');
  if (!assignee && !(Array.isArray(task.followerUserIds) && task.followerUserIds.length)) return true;
  return ids.includes(assignee) || (task.followerUserIds || []).map(String).some(id => ids.includes(id));
}

/**
 * Tudo que esta pessoa deve ver na agenda pessoal, a partir do estado já projetado pela
 * autoridade de acesso. A janela limita só o que é criado; o resto serve para saber o que
 * continua existindo.
 */
export function desiredItems(state, { user, privacy = 'full', taskScope = 'all', today }) {
  const items = new Map();
  const windowFrom = addDays(today, -WINDOW_PAST_DAYS);
  const windowTo = addDays(today, WINDOW_FUTURE_DAYS);
  const add = item => items.set(item.key, { ...item, inWindow: item.fields.date >= windowFrom && item.fields.date <= windowTo });

  const agenda = (Array.isArray(state?.agenda) ? state.agenda : []).filter(record => record && !record.completed && !record.completedAt && record.active !== false);
  for (const record of materializeCollection(agenda, { from: windowFrom, to: windowTo })) {
    if (!record?.id || !civilDate(record.date)) continue;
    // O que veio de outra agenda por link já existe lá: reenviar só duplicaria.
    if (isFromExternalLink(record)) continue;
    const origin = record.source === PERSONAL_SOURCE && record.scope === 'private' ? 'google' : 'atrium';
    add({
      key: `agenda:${record.id}`,
      kind: 'agenda',
      recordId: record.id,
      origin,
      locked: isLockedAgenda(record),
      fields: agendaFields(record, { privacy, origin })
    });
  }
  for (const task of Array.isArray(state?.tasks) ? state.tasks : []) {
    if (!task?.id || !taskIsOpen(task)) continue;
    if (taskScope === 'mine' && !taskBelongsTo(task, user)) continue;
    add({ key: `task:${task.id}`, kind: 'task', recordId: task.id, origin: 'atrium', locked: true, fields: taskFields(task, { privacy }) });
  }
  return items;
}

/** Campos do registro que mudam quando o evento mudou no Google. */
export function recordPatchFromEvent(incoming, previous, { privacy = 'full', origin = 'atrium', record = {} } = {}) {
  const reduced = privacy === 'reduced' && origin !== 'google';
  const patch = {};
  if (!reduced && incoming.summary !== previous?.summary) patch.title = (origin === 'google' ? incoming.summary : withoutContext(incoming.summary, record)) || 'Compromisso';
  if (!reduced && incoming.description !== previous?.description) patch.description = incoming.description;
  if (!reduced && incoming.location !== previous?.location) patch.location = incoming.location;
  if (incoming.date !== previous?.date) patch.date = incoming.date;
  if (incoming.time !== previous?.time) patch.time = incoming.time;
  if (incoming.endDate !== previous?.endDate) patch.endDate = incoming.endDate;
  if (incoming.endTime !== previous?.endTime) patch.endTime = incoming.endTime;
  return patch;
}

export const validTime = value => TIME_RE.test(String(value || ''));
