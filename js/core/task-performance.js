/**
 * ATRIUM — Performance de tarefas (projeção derivada)
 *
 * Agrega `Store.state.tasks` em séries mensais de pontos e contagens para o
 * painel de performance e para os relatórios. Somente leitura: nenhuma mutação,
 * nenhuma persistência paralela e nenhuma inferência de prazo jurídico.
 *
 * Métricas:
 * - pontos e tarefas concluídas agrupados pelo dia de `completedAt`;
 * - acumulado diário do mês atual (até hoje) contra o mês anterior completo;
 * - pendentes/atrasadas pela coluna viva (sem `completedAt`);
 * - alcance da meta = pontos do mês / `goal` (não mostra fração sem meta).
 */
function monthKeyOf(date) {
  return { year: date.getFullYear(), month: date.getMonth() };
}

function previousMonthOf({ year, month }) {
  return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
}

function sameMonth(value, ref) {
  const date = new Date(value);
  return date.getFullYear() === ref.year && date.getMonth() === ref.month;
}

function taskPoints(task) {
  const points = Number(task?.points);
  return Number.isFinite(points) && points > 0 ? points : 0;
}

function accumulate(values) {
  let total = 0;
  return values.map(value => (total += value));
}

function monthSeries(tasks, ref, { lastDay = null } = {}) {
  const daysInMonth = new Date(ref.year, ref.month + 1, 0).getDate();
  const pointsDaily = Array.from({ length: daysInMonth }, () => 0);
  const completedDaily = Array.from({ length: daysInMonth }, () => 0);
  for (const task of tasks) {
    const completedAt = Date.parse(task?.completedAt || '');
    if (!Number.isFinite(completedAt) || !sameMonth(completedAt, ref)) continue;
    const day = new Date(completedAt).getDate() - 1;
    pointsDaily[day] += taskPoints(task);
    completedDaily[day] += 1;
  }
  const limit = lastDay ? Math.min(lastDay, daysInMonth) : daysInMonth;
  return {
    year: ref.year,
    month: ref.month,
    daysInMonth,
    shownDays: limit,
    pointsDaily: pointsDaily.slice(0, limit),
    completedDaily: completedDaily.slice(0, limit),
    pointsCumulative: accumulate(pointsDaily.slice(0, limit)),
    completedCumulative: accumulate(completedDaily.slice(0, limit)),
    points: pointsDaily.slice(0, limit).reduce((total, value) => total + value, 0),
    completed: completedDaily.slice(0, limit).reduce((total, value) => total + value, 0)
  };
}

function variation(currentValue, previousValue) {
  if (!Number.isFinite(previousValue) || previousValue === 0) return null;
  return ((currentValue - previousValue) / previousValue) * 100;
}

export function computeTaskPerformance(tasks = [], { goal = null, now = new Date() } = {}) {
  const list = Array.isArray(tasks) ? tasks : [];
  const finished = [];
  const live = [];
  for (const task of list) {
    if (!task || typeof task !== 'object') continue;
    if (task.active === false) continue;
    const completedAt = Date.parse(task.completedAt || '');
    if (Number.isFinite(completedAt)) { finished.push(task); continue; }
    // Concluída sem carimbo de data (legado) fica fora das séries e dos pendentes.
    if (task.status === 'concluida') continue;
    live.push(task);
  }

  const nowDate = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const currentRef = monthKeyOf(nowDate);
  const previousRef = previousMonthOf(currentRef);

  const current = monthSeries(finished, currentRef, { lastDay: nowDate.getDate() });
  const previous = monthSeries(finished, previousRef);

  const pending = live.length;
  const late = live.filter(task => {
    const deadline = Date.parse(task.deadline || task.fatalDeadline || '');
    return Number.isFinite(deadline) && deadline < nowDate.getTime();
  }).length;

  const goalValue = Number(goal);
  const hasGoal = Number.isFinite(goalValue) && goalValue > 0;

  return Object.freeze({
    current,
    previous,
    pending,
    late,
    goal: hasGoal ? goalValue : null,
    goalRatio: hasGoal ? current.points / goalValue : null,
    variation: Object.freeze({
      completed: variation(current.completed, previous.completed),
      points: variation(current.points, previous.points)
    })
  });
}

/**
 * Relatório de produtividade por período: derivado das tarefas registradas, sem
 * persistência paralela. Duração = conclusão - criação; atraso = conclusão -
 * prazo (datas já informadas; nenhuma inferência jurídica).
 */
const PERIOD_LABELS = Object.freeze({
  'current-month': 'Mês atual',
  'previous-month': 'Mês anterior',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
  'custom': 'Período personalizado'
});

function resolveReportRange(period, now, dateFrom, dateTo) {
  const ref = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const monthStart = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const previousRef = previousMonthOf(monthKeyOf(ref));
  const previousStart = new Date(previousRef.year, previousRef.month, 1);
  const previousEnd = new Date(previousRef.year, previousRef.month + 1, 1).getTime() - 1;
  if (period === 'previous-month') return { start: previousStart.getTime(), end: previousEnd, label: PERIOD_LABELS['previous-month'] };
  if (period === '30d') return { start: ref.getTime() - 30 * 86400000, end: ref.getTime(), label: PERIOD_LABELS['30d'] };
  if (period === '90d') return { start: ref.getTime() - 90 * 86400000, end: ref.getTime(), label: PERIOD_LABELS['90d'] };
  if (period === 'custom') {
    const start = Date.parse(dateFrom || '');
    const endDate = Date.parse(dateTo || '');
    return {
      start: Number.isFinite(start) ? start : monthStart.getTime(),
      end: Number.isFinite(endDate) ? endDate + 86399999 : ref.getTime(),
      label: PERIOD_LABELS.custom
    };
  }
  return { start: monthStart.getTime(), end: ref.getTime(), label: PERIOD_LABELS['current-month'] };
}

function taskTypeOf(task) {
  return String(task?.taskDefinition || task?.type || 'Tarefa').trim() || 'Tarefa';
}

function durationMinutesOf(task) {
  const completedAt = Date.parse(task?.completedAt || '');
  const createdAt = Date.parse(task?.createdAt || '');
  return Number.isFinite(completedAt) && Number.isFinite(createdAt) && completedAt >= createdAt
    ? Math.round((completedAt - createdAt) / 60000)
    : null;
}

function delayDaysOf(task) {
  const completedAt = Date.parse(task?.completedAt || '');
  const deadline = Date.parse(task?.deadline || '');
  return Number.isFinite(completedAt) && Number.isFinite(deadline)
    ? Math.round(((completedAt - deadline) / 86400000) * 10) / 10
    : null;
}

function loggedMinutesOf(task) {
  return Array.isArray(task?.timeLogs)
    ? task.timeLogs.reduce((total, log) => total + (Number(log?.minutes) || 0), 0)
    : 0;
}

function average(values) {
  const valid = values.filter(value => Number.isFinite(value));
  return valid.length ? Math.round(valid.reduce((total, value) => total + value, 0) / valid.length) : null;
}

export function computeProductivityReport(tasks = [], { configuration = {}, now = new Date(), period = 'current-month', responsible = 'all', taskType = 'all', dateFrom = '', dateTo = '' } = {}) {
  const list = Array.isArray(tasks) ? tasks : [];
  const range = resolveReportRange(period, now, dateFrom, dateTo);
  const nowMs = (now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date()).getTime();
  const usersByName = new Map(
    (Array.isArray(configuration.users) ? configuration.users : [])
      .filter(user => user && user.name)
      .map(user => [String(user.name).trim(), { pointsGoal: Number(user.pointsGoal) || 0 }])
  );

  const responsibilityOf = task => String(task?.responsible || '').trim() || 'Sem responsável';
  const matchFilters = task => (responsible === 'all' || responsibilityOf(task) === responsible)
    && (taskType === 'all' || taskTypeOf(task) === taskType);

  const filterOptions = { responsibles: new Set(), taskTypes: new Set() };
  const completions = [];
  const liveByResponsible = new Map();
  let pending = 0;
  let late = 0;
  let timeLoggedMinutes = 0;

  for (const task of list) {
    if (!task || typeof task !== 'object' || task.active === false) continue;
    filterOptions.responsibles.add(responsibilityOf(task));
    filterOptions.taskTypes.add(taskTypeOf(task));
    const completedAt = Date.parse(task.completedAt || '');
    if (!Number.isFinite(completedAt)) {
      if (task.status === 'concluida') continue;
      if (!matchFilters(task)) continue;
      const row = liveByResponsible.get(responsibilityOf(task)) || { pending: 0, late: 0 };
      row.pending += 1;
      const deadline = Date.parse(task.deadline || task.fatalDeadline || '');
      const isLate = Number.isFinite(deadline) && deadline < nowMs;
      if (isLate) row.late += 1;
      liveByResponsible.set(responsibilityOf(task), row);
      pending += 1;
      if (isLate) late += 1;
      continue;
    }
    if (completedAt < range.start || completedAt > range.end || !matchFilters(task)) continue;
    const durationMinutes = durationMinutesOf(task);
    const delayDays = delayDaysOf(task);
    const logged = loggedMinutesOf(task);
    timeLoggedMinutes += logged;
    completions.push({
      id: task.id || '',
      title: String(task.title || '').slice(0, 200),
      client: String(task.client || '').slice(0, 200),
      process: String(task.process || task.processNumber || '').slice(0, 40),
      type: taskTypeOf(task),
      responsible: responsibilityOf(task),
      completedBy: String(task.completedBy || '').slice(0, 120),
      completedAt: task.completedAt,
      points: taskPoints(task),
      durationMinutes,
      delayDays,
      timeLoggedMinutes: logged
    });
  }

  completions.sort((left, right) => String(right.completedAt).localeCompare(String(left.completedAt)));

  const rowsByResponsible = new Map();
  for (const item of completions) {
    const row = rowsByResponsible.get(item.responsible) || {
      responsible: item.responsible,
      completed: 0,
      points: 0,
      durations: [],
      delays: [],
      timeLoggedMinutes: 0
    };
    row.completed += 1;
    row.points += item.points;
    row.timeLoggedMinutes += item.timeLoggedMinutes;
    if (Number.isFinite(item.durationMinutes)) row.durations.push(item.durationMinutes);
    if (Number.isFinite(item.delayDays)) row.delays.push(item.delayDays);
    rowsByResponsible.set(item.responsible, row);
  }
  for (const name of liveByResponsible.keys()) {
    if (!rowsByResponsible.has(name)) {
      rowsByResponsible.set(name, { responsible: name, completed: 0, points: 0, durations: [], delays: [], timeLoggedMinutes: 0 });
    }
  }

  const rows = [...rowsByResponsible.values()].map(row => {
    const goal = usersByName.get(row.responsible)?.pointsGoal ?? null;
    const live = liveByResponsible.get(row.responsible) || { pending: 0, late: 0 };
    return {
      responsible: row.responsible,
      completed: row.completed,
      points: row.points,
      goal: goal && goal > 0 ? goal : null,
      reach: goal && goal > 0 ? row.points / goal : null,
      avgDurationMinutes: average(row.durations),
      avgDelayDays: row.delays.length ? Math.round((row.delays.reduce((total, value) => total + value, 0) / row.delays.length) * 10) / 10 : null,
      timeLoggedMinutes: row.timeLoggedMinutes,
      pending: live.pending,
      late: live.late
    };
  });

  const byType = new Map();
  for (const item of completions) {
    byType.set(item.type, (byType.get(item.type) || 0) + 1);
  }

  const durations = completions.map(item => item.durationMinutes).filter(Number.isFinite);
  const delays = completions.map(item => item.delayDays).filter(Number.isFinite);

  return Object.freeze({
    range: Object.freeze(range),
    filters: Object.freeze({ period, responsible, taskType, dateFrom, dateTo }),
    filterOptions: Object.freeze({
      responsibles: Object.freeze([...filterOptions.responsibles].sort((left, right) => left.localeCompare(right, 'pt-BR'))),
      taskTypes: Object.freeze([...filterOptions.taskTypes].sort((left, right) => left.localeCompare(right, 'pt-BR')))
    }),
    totals: Object.freeze({
      completed: completions.length,
      points: completions.reduce((total, item) => total + item.points, 0),
      pending,
      late,
      timeLoggedMinutes,
      avgDurationMinutes: average(durations),
      avgDelayDays: delays.length ? Math.round((delays.reduce((total, value) => total + value, 0) / delays.length) * 10) / 10 : null
    }),
    rows,
    completions,
    byType: [...byType.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type, 'pt-BR'))
  });
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildProductivityCsv(report) {
  const lines = [];
  lines.push(['Produtividade por responsável'].map(csvCell).join(','));
  lines.push(['Responsável', 'Concluídas', 'Pontos', 'Meta', 'Alcance', 'Tempo médio (min)', 'Atraso médio (dias)', 'Tempo apontado (min)', 'Pendentes', 'Atrasadas'].map(csvCell).join(','));
  for (const row of report.rows) {
    lines.push([
      row.responsible,
      row.completed,
      row.points,
      row.goal ?? '',
      row.reach != null ? `${Math.round(row.reach * 100)}%` : '',
      row.avgDurationMinutes ?? '',
      row.avgDelayDays ?? '',
      row.timeLoggedMinutes,
      row.pending,
      row.late
    ].map(csvCell).join(','));
  }
  lines.push('');
  lines.push(['Conclusões do período'].map(csvCell).join(','));
  lines.push(['Responsável', 'Concluído por', 'Tarefa', 'Tipo', 'Cliente', 'Processo', 'Concluída em', 'Duração (min)', 'Atraso (dias)', 'Pontos'].map(csvCell).join(','));
  for (const item of report.completions) {
    lines.push([
      item.responsible,
      item.completedBy,
      item.title,
      item.type,
      item.client,
      item.process,
      item.completedAt,
      item.durationMinutes ?? '',
      item.delayDays ?? '',
      item.points
    ].map(csvCell).join(','));
  }
  return lines.join('\r\n');
}
