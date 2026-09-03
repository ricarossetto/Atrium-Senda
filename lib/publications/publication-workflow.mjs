const ACTION_TYPES = new Set(['appointment', 'deadline', 'note', 'link']);
const ALLOWED_PUBLICATION_STATUSES = new Set(['untreated', 'in_review', 'treated']);

export function applyPublicationWorkAction(state, publicationId, input, { actorName, nowIso } = {}) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) throw badRequest('Estado canônico inválido.');
  const id = boundedText(input?.id, 160, 'ID da providência').trim();
  if (!/^[A-Za-z0-9._:-]+$/.test(id)) throw badRequest('ID da providência inválido.');
  const type = boundedText(input?.type, 40, 'Tipo da providência').trim();
  if (!ACTION_TYPES.has(type)) throw badRequest('Tipo de providência inválido.');
  const actor = boundedText(actorName || 'Usuário autenticado', 100, 'Responsável').trim();
  const timestamp = validTimestamp(nowIso) || new Date().toISOString();

  state.intimations = Array.isArray(state.intimations) ? state.intimations : [];
  state.tasks = Array.isArray(state.tasks) ? state.tasks : [];
  state.agenda = Array.isArray(state.agenda) ? state.agenda : [];
  state.processes = Array.isArray(state.processes) ? state.processes : [];
  state.audit = Array.isArray(state.audit) ? state.audit : [];
  const publication = state.intimations.find(item => item && (item.id === publicationId || item.externalId === publicationId));
  if (!publication) throw notFound('Publicação não encontrada no acervo.');
  const status = publication.treatmentStatus || 'untreated';
  if (status === 'discarded') throw conflict('Publicação descartada não pode originar providência.');
  if (!ALLOWED_PUBLICATION_STATUSES.has(status)) throw conflict(`Status de tratamento inválido: "${status}".`);

  publication.linkedWorkActions = Array.isArray(publication.linkedWorkActions) ? publication.linkedWorkActions : [];
  const existing = publication.linkedWorkActions.find(item => item?.id === id);
  if (existing) return { idempotent: true, publication, relation: existing, ...resolveExistingEntity(state, existing) };

  const process = resolveProcess(state.processes, input?.processId, input?.processNumber || publication.process);
  let entity;
  let collection = '';
  let entityType = '';

  if (type === 'appointment') {
    const title = requiredText(input?.title, 500, 'Título do compromisso');
    const date = requiredDate(input?.date, 'Data do compromisso');
    entity = {
      id: `agenda-${id}`,
      title,
      date,
      time: optionalTime(input?.time),
      type: 'compromisso',
      status: 'agendado',
      notes: boundedText(input?.notes, 10_000, 'Observações'),
      source: 'Publicação',
      publicationId: publication.id || publicationId,
      intimationId: publication.id || publicationId,
      sourceIntimationId: publication.id || publicationId,
      processId: process?.id || publication.processId || '',
      process: process?.number || publication.process || '',
      client: confirmedClient(process, publication),
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: actor
    };
    assertEntityIdAvailable(state.agenda, entity.id, 'compromisso');
    state.agenda.unshift(entity);
    collection = 'agenda';
    entityType = 'agenda';
  } else if (type === 'deadline') {
    const title = requiredText(input?.title, 500, 'Título do prazo');
    const deadline = requiredDate(input?.deadline, 'Data do prazo');
    const fatalDeadline = input?.fatalDeadline ? requiredDate(input.fatalDeadline, 'Prazo fatal') : '';
    entity = {
      id: `task-${id}`,
      title,
      description: boundedText(input?.notes, 100_000, 'Orientações'),
      source: 'Publicação',
      publicationId: publication.id || publicationId,
      intimationId: publication.id || publicationId,
      sourceIntimationId: publication.id || publicationId,
      processId: process?.id || publication.processId || '',
      process: process?.number || publication.process || '',
      client: confirmedClient(process, publication),
      deadline,
      fatalDeadline,
      date: deadline,
      responsible: actor,
      responsibles: [actor],
      status: 'triagem',
      priority: 'normal',
      points: 0,
      timeLogs: [],
      history: [{ at: timestamp, action: 'Prazo cadastrado manualmente a partir de publicação', actor }],
      humanConfirmedAt: timestamp,
      humanConfirmedBy: actor,
      createdAt: timestamp,
      updatedAt: timestamp,
      actionType: '',
      protocol: ''
    };
    assertEntityIdAvailable(state.tasks, entity.id, 'prazo');
    state.tasks.unshift(entity);
    collection = 'tasks';
    entityType = 'task';
  } else if (type === 'note') {
    const text = requiredText(input?.notes, 20_000, 'Nota interna');
    publication.workNotes = Array.isArray(publication.workNotes) ? publication.workNotes : [];
    entity = { id: `note-${id}`, text, createdAt: timestamp, createdBy: actor, source: 'Publicação' };
    publication.workNotes.unshift(entity);
    entityType = 'note';
  } else {
    if (!process) throw badRequest('Selecione um processo canônico para vincular.');
    publication.processId = process.id;
    publication.process = process.number || publication.process || '';
    if (process.contactId && process.client) publication.client = process.client;
    entity = process;
    collection = 'processes';
    entityType = 'process';
  }

  const relation = {
    id,
    type,
    entityType,
    entityId: entity.id,
    processId: process?.id || publication.processId || '',
    createdAt: timestamp,
    createdBy: actor
  };
  publication.linkedWorkActions.push(relation);
  if (status === 'untreated') {
    publication.treatmentStatus = 'in_review';
    publication.treatmentStartedAt = timestamp;
    publication.treatmentStartedBy = actor;
  }
  publication.updatedAt = timestamp;
  state.audit.unshift({
    id: `audit-publication-work-${id}`,
    at: timestamp,
    action: auditAction(type),
    detail: `${publication.id || publicationId} · ${publication.process || 'sem processo vinculado'}`.slice(0, 500),
    actor
  });
  state.audit = state.audit.slice(0, 1000);
  return { idempotent: false, publication, relation, entity, collection };
}

function resolveProcess(processes, processId, processNumber) {
  const id = String(processId || '').trim();
  if (id) return processes.find(item => String(item?.id || '') === id) || null;
  const number = digits(processNumber);
  return number ? processes.find(item => digits(item?.number) === number) || null : null;
}
function confirmedClient(process, publication) {
  if (process?.contactId && process?.client) return process.client;
  if (publication?.contactId && publication?.client) return String(publication.client).trim();
  return '';
}
function resolveExistingEntity(state, relation) {
  const collection = relation.entityType === 'task' ? 'tasks' : relation.entityType === 'agenda' ? 'agenda' : relation.entityType === 'process' ? 'processes' : '';
  if (collection) return { collection, entity: state[collection].find(item => item?.id === relation.entityId) || null };
  if (relation.entityType === 'note') return { collection: '', entity: state.intimations.flatMap(item => item?.workNotes || []).find(item => item?.id === relation.entityId) || null };
  return { collection: '', entity: null };
}
function assertEntityIdAvailable(collection, id, label) {
  if (collection.some(item => item?.id === id)) throw conflict(`O ID do ${label} já está em uso.`);
}
function auditAction(type) {
  return ({ appointment: 'Compromisso criado a partir de publicação', deadline: 'Prazo cadastrado a partir de publicação', note: 'Nota adicionada à publicação', link: 'Processo vinculado à publicação' })[type];
}
function boundedText(value, max, label) {
  const text = value === undefined || value === null ? '' : String(value);
  if (text.length > max) throw badRequest(`${label} excede o tamanho permitido.`);
  return text;
}
function requiredText(value, max, label) {
  const text = boundedText(value, max, label).trim();
  if (!text) throw badRequest(`${label} obrigatório.`);
  return text;
}
function requiredDate(value, label) {
  const text = boundedText(value, 10, label).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const parsed = match ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))) : null;
  if (!parsed
    || parsed.getUTCFullYear() !== Number(match[1])
    || parsed.getUTCMonth() !== Number(match[2]) - 1
    || parsed.getUTCDate() !== Number(match[3])) throw badRequest(`${label} inválida.`);
  return text;
}
function optionalTime(value) {
  const text = boundedText(value, 5, 'Horário').trim();
  if (text && !/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw badRequest('Horário inválido.');
  return text;
}
function validTimestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
}
function digits(value) { return String(value || '').replace(/\D/g, ''); }
function badRequest(message) { return Object.assign(new Error(message), { statusCode: 400 }); }
function notFound(message) { return Object.assign(new Error(message), { statusCode: 404 }); }
function conflict(message) { return Object.assign(new Error(message), { statusCode: 409 }); }
