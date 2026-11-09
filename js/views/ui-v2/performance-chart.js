const plural = (count, singular, pluralForm) => `${count} ${Number(count) === 1 ? singular : pluralForm}`;
/**
 * ATRIUM — Gráfico de performance (SVG sem dependências)
 *
 * Série cumulativa de pontos por dia: mês atual (até hoje) contra o mês anterior,
 * com linha opcional de meta. Sem animação (compatível com prefers-reduced-motion),
 * com nomes acessíveis por série e tabela alternativa em <details>.
 */
const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 220;
const PLOT = { left: 44, right: 632, top: 12, bottom: 188 };

function niceCeiling(value) {
  if (!Number.isFinite(value) || value <= 0) return 10;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  const rounded = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return rounded * magnitude;
}

function pointList(values, maxValue, shownDays) {
  const span = Math.max(1, shownDays - 1);
  return values.map((value, index) => ({
    x: PLOT.left + (index / span) * (PLOT.right - PLOT.left),
    y: PLOT.bottom - (value / maxValue) * (PLOT.bottom - PLOT.top)
  }));
}

/**
 * Curva monótona (Fritsch–Carlson) passando pelos pontos reais. Como a série é
 * cumulativa, a interpolação não pode "mergulhar" entre dois dias: as tangentes são
 * limitadas para preservar o sentido do acumulado e os patamares ficam retos.
 */
export function smoothPath(points = [], tension = 1) {
  if (!Array.isArray(points) || points.length === 0) return '';
  const fmt = value => Number(value.toFixed(2));
  if (points.length === 1) return `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  const at = index => points[Math.max(0, Math.min(points.length - 1, index))];
  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

  let path = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = at(index - 1);
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = at(index + 2);
    const lowY = Math.min(p1.y, p2.y);
    const highY = Math.max(p1.y, p2.y);
    // Catmull-Rom com controles presos ao trecho: cantos arredondados e nenhum mergulho
    // abaixo/acima dos valores reais da série cumulativa.
    const control1x = clamp(p1.x + ((p2.x - p0.x) / 6) * tension, p1.x, p2.x);
    const control1y = clamp(p1.y + ((p2.y - p0.y) / 6) * tension, lowY, highY);
    const control2x = clamp(p2.x - ((p3.x - p1.x) / 6) * tension, p1.x, p2.x);
    const control2y = clamp(p2.y - ((p3.y - p1.y) / 6) * tension, lowY, highY);
    path += ` C ${fmt(control1x)} ${fmt(control1y)}, ${fmt(control2x)} ${fmt(control2y)}, ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return path;
}

export function renderPerformanceChart({ performance, escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])) } = {}) {
  const current = performance?.current;
  const previous = performance?.previous;
  if (!current || !previous) return '';

  const shownDays = Math.max(2, current.shownDays || current.daysInMonth || 2);
  const monthDays = Math.max(shownDays, previous.daysInMonth || shownDays);
  const ceiling = niceCeiling(Math.max(
    current.pointsCumulative.at(-1) || 0,
    previous.pointsCumulative.at(-1) || 0,
    performance.goal || 0
  ));

  const currentPath = smoothPath(pointList(current.pointsCumulative, ceiling, shownDays));
  const previousPath = smoothPath(pointList(previous.pointsCumulative.slice(0, monthDays), ceiling, monthDays));

  const yTicks = [0, 0.5, 1].map(ratio => {
    const y = PLOT.bottom - ratio * (PLOT.bottom - PLOT.top);
    const label = Math.round(ceiling * ratio).toLocaleString('pt-BR');
    return `<line class="v2-perf-grid" x1="${PLOT.left}" y1="${y.toFixed(1)}" x2="${PLOT.right}" y2="${y.toFixed(1)}"/><text class="v2-perf-tick" x="${PLOT.left - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end">${label}</text>`;
  }).join('');

  const dayTicks = [1, 8, 15, 22, monthDays]
    .filter((day, index, list) => day <= monthDays && list.indexOf(day) === index)
    .map(day => {
      const x = PLOT.left + ((day - 1) / Math.max(1, monthDays - 1)) * (PLOT.right - PLOT.left);
      return `<text class="v2-perf-tick" x="${x.toFixed(1)}" y="${PLOT.bottom + 16}" text-anchor="middle">${day}</text>`;
    }).join('');

  const goalLine = Number.isFinite(performance?.goal) && performance.goal > 0
    ? `<line class="v2-perf-line is-goal" x1="${PLOT.left}" y1="${(PLOT.bottom - (performance.goal / ceiling) * (PLOT.bottom - PLOT.top)).toFixed(1)}" x2="${PLOT.right}" y2="${(PLOT.bottom - (performance.goal / ceiling) * (PLOT.bottom - PLOT.top)).toFixed(1)}"/>`
    : '';

  const lastIndex = Math.max(0, current.pointsCumulative.length - 1);
  const lastValue = current.pointsCumulative[lastIndex] || 0;
  const lastDot = `<circle class="v2-perf-dot is-current" cx="${(PLOT.left + (lastIndex / Math.max(1, shownDays - 1)) * (PLOT.right - PLOT.left)).toFixed(1)}" cy="${(PLOT.bottom - (lastValue / ceiling) * (PLOT.bottom - PLOT.top)).toFixed(1)}" r="3.2"><title>${escapeHtml(`Hoje: ${lastValue.toLocaleString('pt-BR')} pts acumulados no mês atual`)}</title></circle>`;

  const goalLabel = Number.isFinite(performance?.goal) && performance.goal > 0
    ? `meta ${performance.goal.toLocaleString('pt-BR')} pts`
    : 'sem meta definida';
  const summary = `Desempenho em pontos: mês atual acumula ${current.points.toLocaleString('pt-BR')} pts (${plural(current.completed, 'tarefa concluída', 'tarefas concluídas')}); mês anterior fechou com ${previous.points.toLocaleString('pt-BR')} pts (${plural(previous.completed, 'tarefa', 'tarefas')}); ${goalLabel}.`;

  const tableRows = current.pointsDaily.map((value, index) => `<tr><th scope="row">${index + 1}</th><td>${value}</td><td>${current.pointsCumulative[index].toLocaleString('pt-BR')}</td><td>${previous.pointsCumulative[index] ?? '—'}</td></tr>`).join('');

  return `
    <figure class="v2-performance-chart">
      <svg class="v2-performance-svg" viewBox="0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}" role="img" aria-label="${escapeHtml(summary)}" preserveAspectRatio="xMidYMid meet">
        ${yTicks}
        ${goalLine}
        <path class="v2-perf-line is-previous" d="${previousPath}"><title>${escapeHtml('Série: mês anterior (pontos acumulados)')}</title></path>
        <path class="v2-perf-line is-current" d="${currentPath}"><title>${escapeHtml('Série: mês atual (pontos acumulados)')}</title></path>
        ${lastDot}
        ${dayTicks}
      </svg>
      <details class="v2-performance-details">
        <summary>Ver dados em tabela</summary>
        <table>
          <caption>Pontos acumulados por dia do mês</caption>
          <thead><tr><th scope="col">Dia</th><th scope="col">Pontos no dia</th><th scope="col">Mês atual (acumulado)</th><th scope="col">Mês anterior (acumulado)</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
      </details>
    </figure>`;
}
