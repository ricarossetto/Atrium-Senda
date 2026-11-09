/**
 * Consultas do escritório sobre o estado oficial. Puro: sem disco, rede nem relógio implícito.
 * Nada aqui grava ou decide acesso; quem chama já filtrou o estado pela sessão.
 */
const ACCESS_ACTIONS = /^(?:Membro|Equipe|Papel|Convite|Acesso|Permiss|Processo atribu|Atribui|Responsável|Desligamento|Titularidade)/i;

export function accessAuditPage(state, { page = 1, pageSize = 50 } = {}) {
  const size = Math.min(Math.max(Number(pageSize) || 50, 1), 200);
  const events = (Array.isArray(state?.audit) ? state.audit : []).filter(entry => ACCESS_ACTIONS.test(String(entry?.action || '')));
  const totalPages = Math.max(Math.ceil(events.length / size), 1);
  const current = Math.min(Math.max(Number(page) || 1, 1), totalPages);
  return {
    page: current,
    pageSize: size,
    total: events.length,
    totalPages,
    events: events.slice((current - 1) * size, current * size)
  };
}

/** Processos que ainda apontam para equipe apagada antes da regra de exclusão. */
export function orphanTeamAssignments(state, teams = []) {
  const known = new Set((Array.isArray(teams) ? teams : []).map(team => String(team?.id)));
  const orphans = [];
  for (const process of Array.isArray(state?.processes) ? state.processes : []) {
    const missing = (Array.isArray(process?.assignedTeamIds) ? process.assignedTeamIds : [])
      .map(String)
      .filter(id => !known.has(id));
    if (missing.length) orphans.push({ processId: process.id, teamIds: missing });
  }
  return orphans;
}

const money = value => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function processFeeAmount(process) {
  if (process?.feeType === 'mensal') return money(process.feeMonthly);
  return money(process?.feeAmount);
}

/** Carteira consolidada por responsável, para o sócio. Só soma o que está cadastrado. */
export function financePortfolio(state) {
  const groups = new Map();
  for (const process of Array.isArray(state?.processes) ? state.processes : []) {
    const amount = processFeeAmount(process);
    const requisition = money(process?.requisitionAmount);
    if (!amount && !requisition) continue;
    const responsible = String(process?.responsible || '').split(',')[0].trim() || 'Sem responsável';
    const group = groups.get(responsible) || { responsible, processes: 0, fees: 0, requisitions: 0 };
    group.processes += 1;
    group.fees += amount;
    group.requisitions += requisition;
    groups.set(responsible, group);
  }
  const rows = [...groups.values()].sort((left, right) => right.fees - left.fees);
  return {
    rows,
    totals: rows.reduce((sum, row) => ({
      processes: sum.processes + row.processes,
      fees: sum.fees + row.fees,
      requisitions: sum.requisitions + row.requisitions
    }), { processes: 0, fees: 0, requisitions: 0 })
  };
}

/** Contadores do painel calculados sobre o estado já projetado para a sessão. */
export function officeStats(state, { now = new Date() } = {}) {
  const today = now.toISOString().slice(0, 10);
  const open = (Array.isArray(state?.tasks) ? state.tasks : [])
    .filter(task => task && task.active !== false && !task.absorbedInto && task.status !== 'concluida');
  const dueDate = task => String(task.fatalDeadline || task.deadline || '').slice(0, 10);
  return {
    processes: (Array.isArray(state?.processes) ? state.processes : []).length,
    openTasks: open.length,
    overdueTasks: open.filter(task => dueDate(task) && dueDate(task) < today).length,
    untreatedPublications: (Array.isArray(state?.intimations) ? state.intimations : [])
      .filter(item => item && !item.mergedInto && String(item.treatmentStatus || 'untreated') === 'untreated').length
  };
}

const PROCESS_FINANCE_FIELDS = Object.freeze([
  'feeType', 'feePercentage', 'feeAmount', 'feeMonthly', 'feeStatus', 'feeNotes',
  'requisitionType', 'requisitionAmount', 'requisitionBank', 'requisitionStatus'
]);

/** Sem `finance.write`, os campos financeiros do processo voltam à versão oficial. */
export function restoreProcessFinanceFields(processes, currentProcesses) {
  if (!Array.isArray(processes)) return { processes, changed: false };
  const currentById = new Map((Array.isArray(currentProcesses) ? currentProcesses : []).map(process => [String(process?.id), process]));
  let changed = false;
  for (const process of processes) {
    if (!process || typeof process !== 'object') continue;
    const previous = currentById.get(String(process.id));
    for (const field of PROCESS_FINANCE_FIELDS) {
      const before = previous ? previous[field] : undefined;
      if (JSON.stringify(process[field]) === JSON.stringify(before)) continue;
      changed = true;
      if (before === undefined) delete process[field];
      else process[field] = before;
    }
  }
  return { processes, changed };
}

function clean(value) {
  return String(value ?? '').trim();
}

/**
 * Atualiza os termos de um escopo sem tocar nos demais. O dono do termo privado vem da
 * sessão, nunca do corpo: ninguém cria monitoramento em nome de outra pessoa.
 */
export function mergeScopedTerms(currentTerms, incoming, { scope, ownerId = '' } = {}) {
  const list = Array.isArray(currentTerms) ? currentTerms : [];
  const inScope = term => (scope === 'private'
    ? term?.scope === 'private' && String(term?.privateOwnerUserId || term?.ownerUserId || '') === ownerId
    : term?.scope !== 'private');
  const existingById = new Map(list.filter(inScope).map(term => [String(term.id), term]));
  const next = [];
  for (const raw of Array.isArray(incoming) ? incoming : []) {
    const number = clean(raw?.oabNumber).replace(/\D/g, '');
    const uf = clean(raw?.oabUf).toUpperCase();
    if (number.length < 3 || !/^[A-Z]{2}$/.test(uf)) {
      throw Object.assign(new Error('Informe o número e a seccional de cada OAB.'), { statusCode: 400 });
    }
    const id = clean(raw?.id) || `term-${scope}-${uf}-${number}`;
    next.push({
      ...(existingById.get(id) || {}),
      id,
      name: clean(raw?.name) || existingById.get(id)?.name || `OAB/${uf} ${number}`,
      oabNumber: number,
      oabUf: uf,
      registration: `OAB/${uf} ${number}`,
      active: raw?.active !== false,
      scope,
      ...(scope === 'private' ? { privateOwnerUserId: ownerId, ownerUserId: ownerId } : {})
    });
  }
  return [...list.filter(term => !inScope(term)), ...next];
}
