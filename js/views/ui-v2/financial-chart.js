const CATEGORY_LABELS = Object.freeze({
  parcela: 'Honorários',
  recebimento: 'Recebimentos',
  despesa: 'Despesas',
  rpv: 'RPV / Alvarás',
  honorarios: 'Honorários contratuais',
  outros: 'Outros'
});

const MONTH_LABELS = Object.freeze(['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']);
const PLOT = Object.freeze({ width: 640, height: 220, left: 52, right: 628, top: 18, bottom: 176 });
const DONUT = Object.freeze({ size: 128, radius: 46, stroke: 18 });

function parseDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const [year, month, day] = raw.slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  if (/^\d{2}\/\d{2}\/\d{4}/.test(raw)) {
    const [day, month, year] = raw.slice(0, 10).split('/').map(Number);
    return new Date(year, month - 1, day);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key) {
  const [year, month] = String(key).split('-').map(Number);
  return `${MONTH_LABELS[month - 1] || month}/${String(year).slice(-2)}`;
}

function niceCeiling(value) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const scaled = value / magnitude;
  const rounded = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return rounded * magnitude;
}

function compactCurrency(value) {
  const amount = Number(value) || 0;
  if (amount >= 1_000_000) return `R$ ${(amount / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (amount >= 1_000) return `R$ ${(amount / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `R$ ${Math.round(amount).toLocaleString('pt-BR')}`;
}

function amountOf(record) {
  const value = record?.gross ?? record?.feeAmount ?? 0;
  return Math.max(0, Number(value) || 0);
}

function categoryKey(record) {
  const kind = String(record?.kind || '').trim();
  return CATEGORY_LABELS[kind] ? kind : 'outros';
}

function renderBarChart({ months, escapeHtml, formatCurrency }) {
  if (!months.length) {
    return '<p class="financial-chart-empty">Sem datas de vencimento no período selecionado.</p>';
  }
  const maxValue = niceCeiling(Math.max(...months.flatMap(month => [month.revenue, month.expense]), 1));
  const plotWidth = PLOT.right - PLOT.left;
  const plotHeight = PLOT.bottom - PLOT.top;
  const groupWidth = plotWidth / months.length;
  const barWidth = Math.min(26, groupWidth / 3);
  const yTicks = [0, 0.5, 1].map(ratio => {
    const y = PLOT.bottom - ratio * plotHeight;
    return `<line class="financial-chart-grid" x1="${PLOT.left}" y1="${y.toFixed(1)}" x2="${PLOT.right}" y2="${y.toFixed(1)}"/><text class="financial-chart-tick" x="${PLOT.left - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end">${escapeHtml(compactCurrency(maxValue * ratio))}</text>`;
  }).join('');
  const bars = months.map((month, index) => {
    const center = PLOT.left + groupWidth * index + groupWidth / 2;
    const revenueHeight = (month.revenue / maxValue) * plotHeight;
    const expenseHeight = (month.expense / maxValue) * plotHeight;
    return `<g class="financial-chart-month">
      <rect class="financial-chart-bar is-revenue" x="${(center - barWidth - 2).toFixed(1)}" y="${(PLOT.bottom - revenueHeight).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${revenueHeight.toFixed(1)}"><title>${escapeHtml(`${monthLabel(month.key)}: ${formatCurrency(month.revenue)} em receitas`)}</title></rect>
      <rect class="financial-chart-bar is-expense" x="${(center + 2).toFixed(1)}" y="${(PLOT.bottom - expenseHeight).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${expenseHeight.toFixed(1)}"><title>${escapeHtml(`${monthLabel(month.key)}: ${formatCurrency(month.expense)} em despesas`)}</title></rect>
      <text class="financial-chart-tick" x="${center.toFixed(1)}" y="${PLOT.bottom + 18}" text-anchor="middle">${escapeHtml(monthLabel(month.key))}</text>
    </g>`;
  }).join('');
  const summary = `Receitas e despesas por vencimento em ${months.length} mês(es): ${months.map(month => `${monthLabel(month.key)} com ${formatCurrency(month.revenue)} de receitas e ${formatCurrency(month.expense)} de despesas`).join('; ')}.`;
  const rows = months.map(month => `<tr><th scope="row">${escapeHtml(monthLabel(month.key))}</th><td>${escapeHtml(formatCurrency(month.revenue))}</td><td>${escapeHtml(formatCurrency(month.expense))}</td></tr>`).join('');
  return `
    <div class="financial-chart-legend" aria-hidden="true"><span class="financial-chart-swatch is-revenue"></span>Receitas<span class="financial-chart-swatch is-expense"></span>Despesas</div>
    <svg class="financial-chart-svg" viewBox="0 0 ${PLOT.width} ${PLOT.height}" role="img" aria-label="${escapeHtml(summary)}" preserveAspectRatio="xMidYMid meet">
      ${yTicks}
      ${bars}
    </svg>
    <details class="financial-chart-details">
      <summary>Ver dados em tabela</summary>
      <table><caption>Receitas e despesas por vencimento</caption><thead><tr><th scope="col">Mês</th><th scope="col">Receitas</th><th scope="col">Despesas</th></tr></thead><tbody>${rows}</tbody></table>
    </details>`;
}

function renderDonut({ categories, escapeHtml, formatCurrency }) {
  const total = categories.reduce((sum, category) => sum + category.amount, 0);
  if (!categories.length || total <= 0) {
    return '<p class="financial-chart-empty">Sem valores categorizados no período selecionado.</p>';
  }
  const circumference = 2 * Math.PI * DONUT.radius;
  let offset = 0;
  const segments = categories.map(category => {
    const length = (category.amount / total) * circumference;
    const segment = `<circle class="financial-chart-donut-segment is-${escapeHtml(category.key)}" cx="${DONUT.size / 2}" cy="${DONUT.size / 2}" r="${DONUT.radius}" fill="none" stroke-width="${DONUT.stroke}" stroke-dasharray="${length.toFixed(2)} ${(circumference - length).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${DONUT.size / 2} ${DONUT.size / 2})"><title>${escapeHtml(`${category.label}: ${formatCurrency(category.amount)} (${Math.round(category.amount / total * 100)}%)`)}</title></circle>`;
    offset += length;
    return segment;
  }).join('');
  const legend = categories.map(category => `<li><span class="financial-chart-swatch is-${escapeHtml(category.key)}"></span><span>${escapeHtml(category.label)}</span><strong>${escapeHtml(formatCurrency(category.amount))}</strong><small>${Math.round(category.amount / total * 100)}%</small></li>`).join('');
  const rows = categories.map(category => `<tr><th scope="row">${escapeHtml(category.label)}</th><td>${escapeHtml(formatCurrency(category.amount))}</td><td>${Math.round(category.amount / total * 100)}%</td></tr>`).join('');
  const summary = `Distribuição por categoria: ${categories.map(category => `${category.label} com ${formatCurrency(category.amount)}`).join('; ')}.`;
  return `
    <div class="financial-chart-donut-wrap">
      <svg class="financial-chart-donut" viewBox="0 0 ${DONUT.size} ${DONUT.size}" role="img" aria-label="${escapeHtml(summary)}">${segments}</svg>
      <ul class="financial-chart-donut-legend">${legend}</ul>
    </div>
    <details class="financial-chart-details">
      <summary>Ver dados em tabela</summary>
      <table><caption>Distribuição por categoria</caption><thead><tr><th scope="col">Categoria</th><th scope="col">Valor</th><th scope="col">Participação</th></tr></thead><tbody>${rows}</tbody></table>
    </details>`;
}

export function renderFinancialChart({ records = [], escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])), formatCurrency = value => String(value ?? '') } = {}) {
  const list = Array.isArray(records) ? records : [];
  const categories = [...list.reduce((map, record) => {
    const key = categoryKey(record);
    const current = map.get(key) || { key, label: CATEGORY_LABELS[key], amount: 0 };
    current.amount += amountOf(record);
    map.set(key, current);
    return map;
  }, new Map()).values()].filter(category => category.amount > 0).sort((left, right) => right.amount - left.amount);

  const byMonth = new Map();
  for (const record of list) {
    const date = parseDate(record?.date);
    if (!date || !['parcela', 'recebimento', 'despesa'].includes(String(record?.kind || ''))) continue;
    const key = monthKey(date);
    const current = byMonth.get(key) || { key, revenue: 0, expense: 0 };
    if (record.kind === 'despesa') current.expense += amountOf(record);
    else current.revenue += amountOf(record);
    byMonth.set(key, current);
  }
  const months = [...byMonth.values()].sort((left, right) => left.key.localeCompare(right.key)).slice(-6);

  return `<section class="financial-chart-surface" aria-labelledby="financialChartHeading">
    <header class="financial-chart-header"><div><p>Leitura financeira</p><h3 id="financialChartHeading">Fluxo e distribuição</h3></div><small>Só lançamentos do período selecionado</small></header>
    <div class="financial-chart-grid">
      <figure class="financial-chart-card"><figcaption>Receitas × despesas por vencimento</figcaption>${renderBarChart({ months, escapeHtml, formatCurrency })}</figure>
      <figure class="financial-chart-card"><figcaption>Distribuição por categoria</figcaption>${renderDonut({ categories, escapeHtml, formatCurrency })}</figure>
    </div>
  </section>`;
}
