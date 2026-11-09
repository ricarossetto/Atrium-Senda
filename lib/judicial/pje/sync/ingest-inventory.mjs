import { mergePjeCommunicationsIntoState } from './judicial-communications.mjs';
import { mergeProjectedPjeIntimations, projectPjeCommunicationsToIntimations } from './project-intimations.mjs';
import { applySourceDeadlineSync, planSourceDeadlineSync, taskDeadlineOwnership } from '../../../publications/source-deadline-sync.mjs';

import { pjeTaskTitle, LEGACY_PJE_BUCKET_TITLE_RE } from '../../source-task-label.mjs';
function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function parseBrazilianDate(value) {
  const match = String(value || '').match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

function upsertPjeDeadlineTask(tasks, intimation, { deadlineMode = 'auto', now, counters }) {
  const sourceDeadline = String(intimation?.sourceReportedDeadlineAt || '').trim();
  if (!sourceDeadline) return;
  const externalId = String(intimation.externalId || intimation.id || '').trim();
  if (!externalId) return;
  const intimationId = String(intimation.id || externalId);
  const processNumber = String(intimation.processNumber || intimation.process || '').trim();
  const taskId = `task:pje-panel:${externalId}`;
  let index = tasks.findIndex(task => task
    && (task.id === taskId || String(task.sourceIntimationId || '') === intimationId));
  // Não reúna expedientes diferentes apenas por coincidência de processo e prazo.
  // Uma republicação só reaproveita a tarefa quando a identidade do ato é a mesma.
  const auto = String(deadlineMode || 'auto') !== 'manual';
  const generatedTitle = pjeTaskTitle({ auto, summary: intimation.description || intimation.text || '', fallback: intimation.event || intimation.title || '' });
  if (index === -1) {
    tasks.push({
      id: taskId,
      externalId: taskId,
      intimationId,
      sourceIntimationId: intimationId,
      title: generatedTitle,
      generatedTitle,
      description: `${intimation.description || intimation.text || 'Comunicação coletada no PJe.'} Prazo informado pelo PJe: ${sourceDeadline}.`,
      status: 'triagem',
      source: 'pje',
      sourcePortalId: intimation.portalId || '',
      process: processNumber,
      client: '',
      deadline: auto ? sourceDeadline : '',
      deadlineSource: auto ? 'pje' : null,
      sourceReportedDeadlineAt: sourceDeadline,
      priority: 'normal',
      responsible: '',
      createdAt: now,
      updatedAt: now
    });
    counters.tasksCreated += 1;
    return;
  }
  const task = tasks[index];
  // Tarefa concluída é decisão humana: não ressuscita nem reescreve prazo.
  if (String(task.status || '') === 'concluida') {
    counters.tasksUnchanged += 1;
    return;
  }
  const previousSource = String(task.sourceReportedDeadlineAt || '').trim();
  const humanOwned = taskDeadlineOwnership(task) === 'human';
  let changed = false;
  if (!task.intimationId) { task.intimationId = intimationId; changed = true; }
  if (!task.sourceIntimationId) { task.sourceIntimationId = intimationId; changed = true; }
  if (!task.process && processNumber) { task.process = processNumber; changed = true; }
  if (previousSource !== sourceDeadline) {
    task.sourceReportedDeadlineAt = sourceDeadline;
    changed = true;
  }
  if (auto) {
    const current = String(task.deadline || '').trim();
    if (humanOwned && current !== sourceDeadline) {
      const conflict = task.deadlineConflict;
      if (!conflict
        || String(conflict.sourceValue || '') !== sourceDeadline
        || String(conflict.humanValue || '') !== current) {
        task.deadlineConflict = {
          source: 'pje',
          sourceValue: sourceDeadline,
          humanValue: current,
          previousSourceValue: previousSource,
          at: now,
          mode: 'auto'
        };
        changed = true;
      }
    } else if (current !== sourceDeadline) {
      task.deadline = sourceDeadline;
      task.deadlineSource = 'pje';
      changed = true;
    }
  }
  const currentTitle = String(task.title || '').trim();
  const titleManaged = task.generatedTitle
    ? currentTitle === String(task.generatedTitle).trim()
    : LEGACY_PJE_BUCKET_TITLE_RE.test(currentTitle);
  if (titleManaged && currentTitle !== generatedTitle) {
    task.title = generatedTitle;
    task.generatedTitle = generatedTitle;
    changed = true;
  }
  if (changed) {
    task.updatedAt = now;
    counters.tasksUpdated += 1;
  } else {
    counters.tasksUnchanged += 1;
  }
}

export function mergePjeInventoryIntoState(state, inventory, { now = new Date().toISOString(), workspaceId = '' } = {}) {
  const portalId = inventory.portalId;
  const portalName = inventory.portalName || portalId;
  const counters = {
    processesCreated: 0,
    processesUpdated: 0,
    processesUnchanged: 0,
    tasksCreated: 0,
    tasksUpdated: 0,
    tasksUnchanged: 0
  };

  const processes = Array.isArray(state?.processes) ? [...state.processes] : [];
  const byNumber = new Map();
  processes.forEach((process, index) => {
    if (process?.number) byNumber.set(process.number, index);
  });

  const incoming = [];
  for (const section of ['acervo', 'expedientes']) {
    for (const record of inventory[section]?.processes || []) {
      if (!record?.processNumber || incoming.some(item => item.processNumber === record.processNumber)) continue;
      incoming.push(record);
    }
  }

  for (const record of incoming) {
    const patch = {
      source: portalName,
      sourcePortalId: portalId,
      lastMovement: record.summary || '',
      lastMovementAt: parseBrazilianDate(record.lastDate),
      pjeCollectedAt: inventory.collectedAt || now
    };
    const existingIndex = byNumber.get(record.processNumber);
    if (existingIndex === undefined) {
      const created = {
        id: `pje:${portalId}:${record.processNumber}`,
        number: record.processNumber,
        client: '',
        court: record.court || portalName,
        monitoring: 'active',
        secrecy: false,
        ...patch
      };
      byNumber.set(record.processNumber, processes.length);
      processes.push(created);
      counters.processesCreated += 1;
      continue;
    }
    const existing = processes[existingIndex];
    const changed = patch.lastMovement !== (existing.lastMovement || '')
      || patch.lastMovementAt !== (existing.lastMovementAt || '')
      || (existing.sourcePortalId || '') !== portalId;
    if (!changed) {
      counters.processesUnchanged += 1;
      continue;
    }
    const merged = {
      ...existing,
      lastMovement: patch.lastMovement,
      lastMovementAt: patch.lastMovementAt,
      source: existing.source || portalName,
      sourcePortalId: portalId,
      pjeCollectedAt: patch.pjeCollectedAt
    };
    if (!merged.client) merged.client = existing.client || '';
    processes[existingIndex] = merged;
    counters.processesUpdated += 1;
  }

  const tasks = Array.isArray(state?.tasks) ? [...state.tasks] : [];
  const taskById = new Map();
  tasks.forEach((task, index) => {
    if (task?.id) taskById.set(task.id, index);
  });

  for (const situation of inventory.expedientes?.situations || []) {
    if (!situation?.label || !Number(situation.count)) continue;
    const id = `pje:${portalId}:situacao:${slugify(situation.label)}`;
    const title = `PJe · ${portalName}: ${situation.label}`;
          const description = `${situation.count} expediente(s) aguardando conferência no painel PJe (${inventory.collectedAt || now}). Prazos informados pela fonte são aplicados automaticamente ao registro correspondente.`;
    const existingIndex = taskById.get(id);
    if (existingIndex === undefined) {
      tasks.push({
        id,
        title,
        description,
        status: 'triagem',
        source: portalName,
        sourcePortalId: portalId,
        process: '',
        client: '',
        deadline: '',
        priority: 'normal',
        responsible: '',
        pjeSituation: { label: situation.label, count: situation.count },
        createdAt: now,
        updatedAt: now
      });
      counters.tasksCreated += 1;
      continue;
    }
    const existing = tasks[existingIndex];
    if (existing.pjeSituation?.count === situation.count && existing.title === title) {
      counters.tasksUnchanged += 1;
      continue;
    }
    tasks[existingIndex] = {
      ...existing,
      title,
      description,
      pjeSituation: { label: situation.label, count: situation.count },
      updatedAt: now
    };
    counters.tasksUpdated += 1;
  }

  const authoritativeExpedientes = ['loaded', 'empty_confirmed'].includes(inventory?.expedientes?.state);
  const communications = mergePjeCommunicationsIntoState({ ...(state || {}), processes, tasks }, inventory, { workspaceId, now, authoritativeExpedientes });

  // Projeção oficial para Publicações: as comunicações PJe persistidas passam a
  // compor state.intimations pelo mesmo upsert de fonte externa (campos protegidos
  // preservados). Sem segundo Store e sem caminho paralelo de persistência.
  const projected = projectPjeCommunicationsToIntimations(communications.state, { now });
  const intimationMerge = mergeProjectedPjeIntimations(communications.state?.intimations, projected);
  const previous = new Map((state?.intimations || []).map(item => [item?.externalId || item?.id, item]));
  const projectedIds = new Set(projected.map(item => item.externalId));
  const autoDeadline = state?.settings?.deadlineMode !== 'manual';
  const intimations = intimationMerge.intimations.map(item => {
    if (!projectedIds.has(item?.externalId || item?.id) || !item.sourceReportedDeadlineAt) return item;
    const old = previous.get(item.externalId || item.id);
    const oldDeadline = old?.deadline || '';
    const oldSource = old?.sourceReportedDeadlineAt || '';
    const fromPje = old?.deadlineSource === 'pje' && oldDeadline === oldSource;
    const result = { ...item };
    if (oldSource && oldSource !== item.sourceReportedDeadlineAt) {
      result.sourceReportedDeadlinePrevious = oldSource;
      result.sourceDeadlineChangedAt = now;
    }
    if (autoDeadline && (!oldDeadline || fromPje)) {
      result.deadline = item.sourceReportedDeadlineAt;
      result.deadlineSource = 'pje';
    }
    return result;
  });
  const next = { ...communications.state, intimations, tasks: communications.state.tasks.map(task => ({ ...task })) };
  for (const item of intimations) {
    if (!projectedIds.has(item?.externalId || item?.id)) continue;
    upsertPjeDeadlineTask(next.tasks, item, {
      deadlineMode: state?.settings?.deadlineMode,
      now,
      counters
    });
  }
  const deadlineSync = applySourceDeadlineSync(next, planSourceDeadlineSync({
    tasks: next.tasks,
    intimations: intimations.filter(item => projectedIds.has(item?.externalId || item?.id)),
    deadlineMode: state?.settings?.deadlineMode
  }), { actor: 'Sincronização PJe', nowIso: now });
  if (deadlineSync.auditEntries.length) next.audit = [...deadlineSync.auditEntries, ...(Array.isArray(next.audit) ? next.audit : [])].slice(0, 1000);

  return {
    state: next,
    counters: { ...counters, ...communications.counters, ...intimationMerge.counters }
  };
}
