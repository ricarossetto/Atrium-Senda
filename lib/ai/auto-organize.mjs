/**
 * Organização automática do Atrium IA, autorizada pelo titular do escritório.
 *
 * Faz só o trabalho de arrumação: põe na coluna Prioridade a tarefa com prazo perto, dá
 * responsável à tarefa sem dono e preenche o grupo de ação vazio do processo.
 *
 * Nunca faz: tratar ou descartar publicação, dar ciência, criar ou mudar prazo, concluir tarefa,
 * fundir registro. Cada arrumação acontece uma vez por registro: o que a pessoa mudar depois
 * fica como ela deixou. Puro: sem disco, rede nem relógio implícito.
 */
import { deriveAreaEvidence } from '../jev-beta/area-evidence.mjs';

export const AUTO_ORGANIZE_PRIORITY_WINDOW_DAYS = 3;
export const AUTO_ORGANIZE_GROUP_CONFIDENCE = 0.85;
const INTAKE_COLUMN = 'triagem';
const PRIORITY_COLUMN = 'prioridade';
const DONE_STATUS = 'concluida';

const AREA_GROUP_NAMES = Object.freeze({
  civil: ['Cível', 'Civil'],
  trabalhista: ['Trabalhista'],
  previdenciario: ['Previdenciário'],
  criminal: ['Criminal', 'Penal'],
  tributario: ['Tributário'],
  fazenda: ['Fazenda Pública', 'Administrativo']
});

const clean = value => String(value ?? '').trim();
const digitsOf = value => String(value ?? '').replace(/\D/g, '');

function daysUntil(value, now) {
  const text = clean(value);
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return null;
  const target = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86_400_000);
}

function hasColumn(state, id) {
  const columns = state?.settings?.kanbanColumns;
  if (!Array.isArray(columns) || !columns.length) return true;
  return columns.some(column => column?.id === id);
}

function firstResponsible(process) {
  const text = clean(process?.responsible);
  return text ? clean(text.split(',')[0]) : '';
}

export function planAutoOrganize({ state = {}, members = [], triageEntries = {}, now = new Date() } = {}) {
  const processes = Array.isArray(state.processes) ? state.processes : [];
  const processByDigits = new Map();
  for (const process of processes) {
    const digits = digitsOf(process?.number);
    if (digits && !processByDigits.has(digits)) processByDigits.set(digits, process);
  }
  const activeMembers = (Array.isArray(members) ? members : []).filter(member => member && member.status !== 'inactive' && clean(member.displayName));
  const soleMember = activeMembers.length === 1 ? clean(activeMembers[0].displayName) : '';
  const canPrioritize = hasColumn(state, PRIORITY_COLUMN);

  const taskChanges = [];
  for (const task of Array.isArray(state.tasks) ? state.tasks : []) {
    if (!task?.id || task.active === false || task.absorbedInto || task.status === DONE_STATUS) continue;
    const done = task.autoOrganized && typeof task.autoOrganized === 'object' ? task.autoOrganized : {};
    const change = {};
    if (canPrioritize && !done.statusAt && task.status === INTAKE_COLUMN) {
      const days = [task.fatalDeadline, task.deadline].map(value => daysUntil(value, now)).filter(value => value !== null);
      if (days.some(value => value <= AUTO_ORGANIZE_PRIORITY_WINDOW_DAYS)) change.status = PRIORITY_COLUMN;
    }
    if (!done.responsibleAt && !clean(task.responsible) && !clean(task.assigneeUserId)) {
      const process = processByDigits.get(digitsOf(task.process || task.processNumber));
      const responsible = firstResponsible(process) || soleMember;
      if (responsible) change.responsible = responsible;
    }
    if (Object.keys(change).length) taskChanges.push({ id: task.id, ...change });
  }

  const groupNames = (Array.isArray(state.configuration?.actionGroups) ? state.configuration.actionGroups : [])
    .map(group => clean(group?.name)).filter(Boolean);
  const intimationsByDigits = new Map();
  for (const item of Array.isArray(state.intimations) ? state.intimations : []) {
    const digits = digitsOf(item?.process || item?.processNumber);
    if (!digits || item?.mergedInto) continue;
    if (!intimationsByDigits.has(digits)) intimationsByDigits.set(digits, []);
    intimationsByDigits.get(digits).push(item);
  }
  const processChanges = [];
  for (const process of processes) {
    if (!process?.id || clean(process.actionGroup)) continue;
    const digits = digitsOf(process.number);
    const linked = intimationsByDigits.get(digits) || [];
    let evidence = deriveAreaEvidence({ record: { process: process.number }, process });
    for (const item of linked) {
      if (evidence && evidence.confidence >= AUTO_ORGANIZE_GROUP_CONFIDENCE) break;
      evidence = deriveAreaEvidence({ record: item, process }) || evidence;
      const entry = triageEntries[item.id];
      if (!evidence && entry?.action === 'suggest' && Number(entry.areaConfidence) >= AUTO_ORGANIZE_GROUP_CONFIDENCE) {
        evidence = { area: entry.area, confidence: Number(entry.areaConfidence) };
      }
    }
    if (!evidence || evidence.confidence < AUTO_ORGANIZE_GROUP_CONFIDENCE) continue;
    const name = (AREA_GROUP_NAMES[evidence.area] || []).find(candidate => groupNames.includes(candidate));
    if (name) processChanges.push({ id: process.id, actionGroup: name });
  }
  return { taskChanges, processChanges };
}

export function applyAutoOrganize(state, plan, { actor = 'Atrium IA', nowIso = new Date().toISOString() } = {}) {
  const tasksById = new Map((state.tasks || []).map(task => [String(task?.id), task]));
  let prioritized = 0;
  let assigned = 0;
  for (const change of plan.taskChanges || []) {
    const task = tasksById.get(String(change.id));
    if (!task) continue;
    const done = task.autoOrganized && typeof task.autoOrganized === 'object' ? { ...task.autoOrganized } : {};
    if (change.status) {
      task.status = change.status;
      done.statusAt = nowIso;
      prioritized += 1;
    }
    if (change.responsible) {
      task.responsible = change.responsible;
      done.responsibleAt = nowIso;
      assigned += 1;
    }
    task.autoOrganized = done;
  }
  const processesById = new Map((state.processes || []).map(process => [String(process?.id), process]));
  let grouped = 0;
  for (const change of plan.processChanges || []) {
    const process = processesById.get(String(change.id));
    if (!process || clean(process.actionGroup)) continue;
    process.actionGroup = change.actionGroup;
    process.actionGroupSource = 'atrium-ia';
    grouped += 1;
  }
  const total = prioritized + assigned + grouped;
  if (total) {
    state.audit = [{
      id: `audit-organize-${Date.parse(nowIso) || 0}`,
      at: nowIso,
      action: 'Atrium IA organizou o acervo',
      detail: `Tarefas com prazo perto na coluna Prioridade: ${prioritized}. Tarefas com responsável definido: ${assigned}. Processos com grupo de ação preenchido: ${grouped}.`,
      actor
    }, ...(Array.isArray(state.audit) ? state.audit : [])];
  }
  return { prioritized, assigned, grouped, total };
}
