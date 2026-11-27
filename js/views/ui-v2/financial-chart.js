import { plural } from '../../core/plural.js?v=3.4.0';

export const CATEGORY_LABELS = Object.freeze({
  parcela: 'Honorários',
  recebimento: 'Recebimentos',
  despesa: 'Despesas',
  rpv: 'RPV / Alvarás',
  honorarios: 'Honorários contratuais',
  outros: 'Outros'
});

const MONTH_LABELS = Object.freeze(['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']);
const PLOT = Object.freeze({ width: 536, height: 224, left: 82, right: 482, top: 20, bottom: 182 });
const DONUT = Object.freeze({ size: 216, center: 108, radius: 80, stroke: 22, gap: 3 });

export function parseDate(value) {
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

export function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key) {
  const [year, month] = String(key).split('-').map(Number);
  return `${MONTH_LABELS[month - 1] || month}/${String(year).slice(-2)}`;
}

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dayShortLabel(key) {
  const parts = String(key).split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}` : String(key);
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

function donutCenterMoney(value, formatCurrency, hideValues = false) {
  if (hideValues) return formatCurrency(value);
  return Math.abs(Number(value) || 0) >= 100_000 ? compactCurrency(value) : formatCurrency(value);
}

export function amountOf(record) {
  const value = record?.gross ?? record?.feeAmount ?? 0;
  return Math.max(0, Number(value) || 0);
}

export function categoryKey(record) {
  const kind = String(record?.kind || '').trim();
  return CATEGORY_LABELS[kind] ? kind : 'outros';
}

function formatDeltaPct(current, previous) {
  if (!previous || previous <= 0) return null;
  const ratio = (current - previous) / previous;
  const pct = Math.round(ratio * 100);
  return {
    text: `${pct >= 0 ? '+' : '−'}${Math.abs(pct)}%`,
    negative: pct < 0
  };
}

function buildBarSeries(datedRecords) {
  const byMonth = new Map();
  const byDay = new Map();

  for (const { date, record } of datedRecords) {
    const amount = amountOf(record);
    const isExpense = record.kind === 'despesa';

    const mKey = monthKey(date);
    const mSlot = byMonth.get(mKey) || { key: mKey, label: monthLabel(mKey), fullLabel: monthLabel(mKey), revenue: 0, expense: 0 };
    if (isExpense) mSlot.expense += amount; else mSlot.revenue += amount;
    byMonth.set(mKey, mSlot);

    const dKey = dayKey(date);
    const dSlot = byDay.get(dKey) || { key: dKey, label: dayShortLabel(dKey), fullLabel: dayShortLabel(dKey), revenue: 0, expense: 0 };
    if (isExpense) dSlot.expense += amount; else dSlot.revenue += amount;
    byDay.set(dKey, dSlot);
  }

  const allMonths = [...byMonth.values()].sort((left, right) => left.key.localeCompare(right.key));
  const allDays = [...byDay.values()].sort((left, right) => left.key.localeCompare(right.key));

  return {
    week: {
      key: 'week',
      title: 'Últimos dias com movimento',
      points: allDays.slice(-7)
    },
    month: {
      key: 'month',
      title: 'Últimos meses',
      points: allMonths.slice(-6)
    },
    year: {
      key: 'year',
      title: 'Últimos 12 meses',
      points: allMonths.slice(-12)
    }
  };
}

function renderBarPlotSvg({ points, escapeHtml, formatCurrency, hideValues = false }) {
  const maxValue = niceCeiling(Math.max(...points.flatMap(point => [point.revenue, point.expense]), 1));
  const plotWidth = PLOT.right - PLOT.left;
  const plotHeight = PLOT.bottom - PLOT.top;
  const groupWidth = plotWidth / Math.max(1, points.length);
  const barWidth = Math.min(26, Math.max(8, groupWidth / 3.2));

  const yTicks = [0, 0.5, 1].map(ratio => {
    const y = PLOT.bottom - ratio * plotHeight;
    return `<line class="financial-chart-grid-line" x1="${PLOT.left}" y1="${y.toFixed(1)}" x2="${PLOT.right}" y2="${y.toFixed(1)}"/><text class="financial-chart-tick" x="${PLOT.left - 8}" y="${(y + 4).toFixed(1)}" text-anchor="end">${escapeHtml(hideValues ? '' : compactCurrency(maxValue * ratio))}</text>`;
  }).join('');

  const revenueSum = points.reduce((sum, point) => sum + point.revenue, 0);
  const expenseSum = points.reduce((sum, point) => sum + point.expense, 0);
  const avgBasis = revenueSum > 0 ? revenueSum / points.length : expenseSum / points.length;
  const avgY = PLOT.bottom - (avgBasis / maxValue) * plotHeight;
  const badgeY = Math.max(4, Math.min(PLOT.bottom - 20, avgY - 10));
  const avgLine = avgBasis > 0
    ? `<g class="financial-chart-avg-group" aria-hidden="true">
        <line class="financial-chart-avg-line" x1="${PLOT.left}" y1="${avgY.toFixed(1)}" x2="${PLOT.right}" y2="${avgY.toFixed(1)}"/>
        <rect class="financial-chart-avg-badge" x="${(PLOT.right + 4).toFixed(1)}" y="${badgeY.toFixed(1)}" width="48" height="20" rx="6"/>
        <text class="financial-chart-avg-text" x="${(PLOT.right + 28).toFixed(1)}" y="${(badgeY + 13.5).toFixed(1)}" text-anchor="middle">Média</text>
      </g>`
    : '';

  const bars = points.map((point, index) => {
    const xStart = PLOT.left + groupWidth * index;
    const center = xStart + groupWidth / 2;
    const revenueHeight = (point.revenue / maxValue) * plotHeight;
    const expenseHeight = (point.expense / maxValue) * plotHeight;
    const isLast = index === points.length - 1;
    const label = `${point.fullLabel}: ${formatCurrency(point.revenue)} em receitas e ${formatCurrency(point.expense)} em despesas`;
    return `<g class="financial-chart-month${isLast ? ' is-latest' : ''}" data-bar-idx="${index}" tabindex="${isLast ? '0' : '-1'}" role="button" aria-label="${escapeHtml(label)}">
      <rect class="financial-chart-hit" x="${xStart.toFixed(1)}" y="${PLOT.top}" width="${groupWidth.toFixed(1)}" height="${(PLOT.bottom - PLOT.top + 22).toFixed(1)}" fill="transparent"/>
      <rect class="financial-chart-bar is-revenue" x="${(center - barWidth - 2).toFixed(1)}" y="${(PLOT.bottom - revenueHeight).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${revenueHeight.toFixed(1)}" rx="4"><title>${escapeHtml(`${point.label}: ${formatCurrency(point.revenue)} em receitas`)}</title></rect>
      <rect class="financial-chart-bar is-expense" x="${(center + 2).toFixed(1)}" y="${(PLOT.bottom - expenseHeight).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${expenseHeight.toFixed(1)}" rx="4"><title>${escapeHtml(`${point.label}: ${formatCurrency(point.expense)} em despesas`)}</title></rect>
      <text class="financial-chart-tick financial-chart-x-label" x="${center.toFixed(1)}" y="${PLOT.bottom + 18}" text-anchor="middle">${escapeHtml(point.label)}</text>
    </g>`;
  }).join('');

  const summary = `Receitas e despesas por vencimento em ${points.length} ${plural(points.length, 'período', 'períodos')}: ${points.map(point => `${point.label} com ${formatCurrency(point.revenue)} de receitas e ${formatCurrency(point.expense)} de despesas`).join('; ')}.`;
  return `<svg class="financial-chart-svg" viewBox="0 0 ${PLOT.width} ${PLOT.height}" role="img" aria-label="${escapeHtml(summary)}" preserveAspectRatio="xMidYMid meet">
    ${yTicks}
    ${bars}
    ${avgLine}
  </svg>`;
}

function renderBarChart({ series, escapeHtml, formatCurrency, hideValues = false }) {
  const months = series.month.points;
  if (!months.length) {
    return '<p class="financial-chart-empty">Sem datas de vencimento no período selecionado.</p>';
  }

  const totalRevenue = months.reduce((sum, point) => sum + point.revenue, 0);
  const totalExpense = months.reduce((sum, point) => sum + point.expense, 0);
  const latest = months.at(-1);
  const prev = months.length >= 2 ? months.at(-2) : null;
  const delta = prev && latest ? formatDeltaPct(latest.revenue || latest.expense, prev.revenue || prev.expense) : null;
  const payload = JSON.stringify({
    active: 'month',
    series: {
      week: series.week,
      month: series.month,
      year: series.year
    }
  });

  const rows = months.map(point => `<tr><th scope="row">${escapeHtml(point.label)}</th><td>${escapeHtml(formatCurrency(point.revenue))}</td><td>${escapeHtml(formatCurrency(point.expense))}</td></tr>`).join('');
  return `
    <div class="financial-bars-interactive" data-financial-bars="${escapeHtml(payload)}">
      <div class="financial-bars-head">
        <div class="financial-bars-readout" aria-live="polite">
          <div class="financial-bars-meta">
            <small data-bars-label>${escapeHtml(totalRevenue > 0 ? 'Receitas no recorte' : 'Despesas no recorte')}</small>
            <span class="financial-bars-delta${delta?.negative ? ' is-negative' : ''}" data-bars-delta>${delta ? escapeHtml(`${delta.text} vs anterior`) : ''}</span>
          </div>
          <strong class="financial-bars-total" data-bars-total>${escapeHtml(formatCurrency(totalRevenue > 0 ? totalRevenue : totalExpense))}</strong>
        </div>
        <div class="financial-bars-seg" role="group" aria-label="Granularidade do gráfico">
          <button type="button" data-bars-period="week" aria-pressed="false" aria-label="Semana">S</button>
          <button type="button" data-bars-period="month" aria-pressed="true" aria-label="Mês">M</button>
          <button type="button" data-bars-period="year" aria-pressed="false" aria-label="Ano">A</button>
        </div>
      </div>
      <div class="financial-chart-legend" aria-hidden="true"><span class="financial-chart-swatch is-revenue"></span>Receitas<span class="financial-chart-swatch is-expense"></span>Despesas<span class="financial-chart-swatch is-average"></span>Média</div>
      <div class="financial-bars-stage" data-bars-stage>
        ${renderBarPlotSvg({ points: months, escapeHtml, formatCurrency, hideValues })}
        <div class="financial-bars-tip" data-bars-tip aria-hidden="true"></div>
      </div>
    </div>
    <details class="financial-chart-details">
      <summary>Ver dados em tabela</summary>
      <table><caption>Receitas e despesas por vencimento</caption><thead><tr><th scope="col">Mês</th><th scope="col">Receitas</th><th scope="col">Despesas</th></tr></thead><tbody>${rows}</tbody></table>
    </details>`;
}

function renderDonut({ categories, escapeHtml, formatCurrency, hideValues = false }) {
  const total = categories.reduce((sum, category) => sum + category.amount, 0);
  if (!categories.length || total <= 0) {
    return '<p class="financial-chart-empty">Sem valores categorizados no período selecionado.</p>';
  }
  const circumference = 2 * Math.PI * DONUT.radius;
  let offset = 0;
  const segments = categories.map((category, index) => {
    const rawLength = (category.amount / total) * circumference;
    const visibleLength = Math.max(0, rawLength - DONUT.gap);
    const segment = `<circle class="financial-chart-donut-segment is-${escapeHtml(category.key)}" data-donut-idx="${index}" cx="${DONUT.center}" cy="${DONUT.center}" r="${DONUT.radius}" fill="none" stroke-width="${DONUT.stroke}" stroke-dasharray="${visibleLength.toFixed(2)} ${circumference.toFixed(2)}" stroke-dashoffset="${(-offset - DONUT.gap / 2).toFixed(2)}" transform="rotate(-90 ${DONUT.center} ${DONUT.center})"><title>${escapeHtml(`${category.label}: ${formatCurrency(category.amount)} (${Math.round(category.amount / total * 100)}%)`)}</title></circle>`;
    offset += rawLength;
    return segment;
  }).join('');

  const legend = categories.map((category, index) => {
    const share = Math.round((category.amount / total) * 100);
    return `<li><button type="button" class="financial-donut-item" data-donut-idx="${index}" aria-pressed="true" aria-label="${escapeHtml(`${category.label} ${formatCurrency(category.amount)}, incluída`)}"><span class="financial-chart-swatch is-${escapeHtml(category.key)}" aria-hidden="true"></span><span class="financial-donut-item-name">${escapeHtml(category.label)}</span><strong>${escapeHtml(formatCurrency(category.amount))}</strong><small>${share}%</small></button></li>`;
  }).join('');

  const rows = categories.map(category => `<tr><th scope="row">${escapeHtml(category.label)}</th><td>${escapeHtml(formatCurrency(category.amount))}</td><td>${Math.round(category.amount / total * 100)}%</td></tr>`).join('');
  const summary = `Distribuição por categoria: ${categories.map(category => `${category.label} com ${formatCurrency(category.amount)}`).join('; ')}.`;
  const payload = JSON.stringify(categories);

  return `
    <div class="financial-chart-donut-wrap is-interactive" data-financial-donut="${escapeHtml(payload)}">
      <div class="financial-donut-visual">
        <svg class="financial-chart-donut" viewBox="0 0 ${DONUT.size} ${DONUT.size}" role="img" aria-label="${escapeHtml(summary)}">
          <circle class="financial-donut-track" cx="${DONUT.center}" cy="${DONUT.center}" r="${DONUT.radius}" fill="none" stroke-width="${DONUT.stroke}"/>
          ${segments}
        </svg>
        <div class="financial-donut-center" aria-live="polite">
          <small data-donut-label>Total</small>
          <strong data-donut-value>${escapeHtml(donutCenterMoney(total, formatCurrency, hideValues))}</strong>
          <span data-donut-sub>${categories.length} ${plural(categories.length, 'categoria', 'categorias')}</span>
        </div>
      </div>
      <ul class="financial-chart-donut-legend" role="list">${legend}</ul>
    </div>
    <details class="financial-chart-details">
      <summary>Ver dados em tabela</summary>
      <table><caption>Distribuição por categoria</caption><thead><tr><th scope="col">Categoria</th><th scope="col">Valor</th><th scope="col">Participação</th></tr></thead><tbody>${rows}</tbody></table>
    </details>`;
}

export function renderFinancialChart({
  records = [],
  escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])),
  formatCurrency = value => String(value ?? ''),
  hideValues = false,
  forecast = '',
  insights = ''
} = {}) {
  const list = (Array.isArray(records) ? records : []).filter(record => {
    const kind = String(record?.kind || '');
    const status = String(record?.status || '').toLowerCase();
    return !(kind === 'recebimento' && status === 'estornado') && !(kind === 'despesa' && status === 'reembolsado');
  });

  const categories = [...list.reduce((map, record) => {
    const key = categoryKey(record);
    const current = map.get(key) || { key, label: CATEGORY_LABELS[key], amount: 0 };
    current.amount += amountOf(record);
    map.set(key, current);
    return map;
  }, new Map()).values()].filter(category => category.amount > 0).sort((left, right) => right.amount - left.amount);

  const datedRecords = [];
  for (const record of list) {
    const date = parseDate(record?.date);
    if (!date || !['parcela', 'recebimento', 'despesa'].includes(String(record?.kind || ''))) continue;
    datedRecords.push({ date, record });
  }
  const series = buildBarSeries(datedRecords);

  return `<section class="financial-chart-surface" aria-labelledby="financialChartHeading">
    <header class="financial-chart-header"><div><p>Leitura financeira</p><h3 id="financialChartHeading">Fluxo, distribuição e previsão</h3></div><small>Os gráficos seguem o filtro; clique nas barras ou categorias para inspecionar</small></header>
    <div class="financial-chart-grid${!series.month.points.length && !categories.length ? ' is-empty' : ''}">
      <figure class="financial-chart-card"><figcaption>Receitas × despesas por vencimento</figcaption>${renderBarChart({ series, escapeHtml, formatCurrency, hideValues })}</figure>
      <figure class="financial-chart-card"><figcaption>Distribuição por categoria</figcaption>${renderDonut({ categories, escapeHtml, formatCurrency, hideValues })}</figure>
      ${forecast}
    </div>
    ${insights ? `<div class="financial-insights-grid">${insights}</div>` : ''}
  </section>`;
}

/**
 * Conecta interatividade estilo Lucian (#095 barras com média e S/M/A + #097 rosca com destaque
 * e alternância de categorias) sobre o markup já renderizado no `#financialChart`.
 * Leitura pura: nunca grava estado nem dispara requests.
 */
export function mountFinancialCharts(root, {
  escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])),
  formatCurrency = value => String(value ?? ''),
  hideValues = false
} = {}) {
  if (!root || typeof root.querySelector !== 'function') return;
  const win = root.ownerDocument?.defaultView || globalThis;
  const reducedMotion = Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);

  const donutRoot = root.querySelector('[data-financial-donut]');
  if (donutRoot && !donutRoot.dataset.mounted) {
    donutRoot.dataset.mounted = '1';
    try {
      const categories = JSON.parse(donutRoot.dataset.financialDonut || '[]');
      if (Array.isArray(categories) && categories.length) {
        const svg = donutRoot.querySelector('svg.financial-chart-donut');
        const center = donutRoot.querySelector('.financial-donut-center');
        const labelEl = donutRoot.querySelector('[data-donut-label]');
        const valueEl = donutRoot.querySelector('[data-donut-value]');
        const subEl = donutRoot.querySelector('[data-donut-sub]');
        const legendEl = donutRoot.querySelector('.financial-chart-donut-legend');
        const segs = [...donutRoot.querySelectorAll('.financial-chart-donut-segment')];
        const items = [...donutRoot.querySelectorAll('.financial-donut-item')];
        const C = 2 * Math.PI * DONUT.radius;
        const activeFlags = categories.map(() => true);
        const fullTotal = categories.reduce((sum, item) => sum + item.amount, 0);
        let fractions = categories.map(item => (fullTotal > 0 ? item.amount / fullTotal : 0));
        let focusedIdx = -1;
        let rafId = 0;

        const currentTotal = () => categories.reduce((sum, item, idx) => sum + (activeFlags[idx] ? item.amount : 0), 0);

        const paint = () => {
          let acc = 0;
          segs.forEach((circle, idx) => {
            const len = fractions[idx] * C;
            const vis = Math.max(0, len - DONUT.gap);
            circle.setAttribute('stroke-dasharray', `${vis.toFixed(2)} ${C.toFixed(2)}`);
            circle.setAttribute('stroke-dashoffset', (-acc - DONUT.gap / 2).toFixed(2));
            const mid = ((acc + len / 2) / C) * Math.PI * 2 - Math.PI / 2;
            const shift = idx === focusedIdx && activeFlags[idx] ? 6 : 0;
            circle.style.transform = shift ? `translate(${(Math.cos(mid) * shift).toFixed(2)}px, ${(Math.sin(mid) * shift).toFixed(2)}px)` : '';
            acc += len;
          });
        };

        const updateCenter = () => {
          if (center) {
            center.classList.remove('is-swap');
            void center.offsetWidth;
            center.classList.add('is-swap');
          }
          const total = currentTotal();
          if (focusedIdx >= 0 && activeFlags[focusedIdx]) {
            const item = categories[focusedIdx];
            if (labelEl) labelEl.textContent = item.label;
            if (valueEl) valueEl.textContent = donutCenterMoney(item.amount, formatCurrency, hideValues);
            if (subEl) subEl.textContent = total > 0 ? `${Math.round((item.amount / total) * 100)}% do total` : '';
          } else {
            const count = activeFlags.filter(Boolean).length;
            if (labelEl) labelEl.textContent = count === categories.length ? 'Total' : `${count} ${plural(count, 'ativa', 'ativas')}`;
            if (valueEl) valueEl.textContent = donutCenterMoney(total, formatCurrency, hideValues);
            if (subEl) subEl.textContent = count === categories.length ? `${categories.length} ${plural(categories.length, 'categoria', 'categorias')}` : `de ${donutCenterMoney(fullTotal, formatCurrency, hideValues)}`;
          }
        };

        const morph = () => {
          win.cancelAnimationFrame?.(rafId);
          const total = currentTotal();
          const target = categories.map((item, idx) => (activeFlags[idx] && total > 0 ? item.amount / total : 0));
          if (reducedMotion || typeof win.requestAnimationFrame !== 'function') {
            fractions = target;
            paint();
            return;
          }
          const from = fractions.slice();
          const start = win.performance?.now?.() ?? Date.now();
          const duration = 420;
          const step = now => {
            if (!donutRoot.isConnected) return;
            const progress = Math.min(1, (now - start) / duration);
            const eased = progress < 0.5 ? 4 * progress * progress * progress : 1 - ((-2 * progress + 2) ** 3) / 2;
            fractions = from.map((val, idx) => val + (target[idx] - val) * eased);
            paint();
            if (progress < 1) rafId = win.requestAnimationFrame(step);
          };
          rafId = win.requestAnimationFrame(step);
        };

        const focusSlice = idx => {
          if (idx === focusedIdx) return;
          focusedIdx = idx;
          donutRoot.classList.toggle('has-focus', idx >= 0 && activeFlags[idx]);
          segs.forEach((circle, k) => circle.classList.toggle('is-focused', k === idx && activeFlags[k]));
          items.forEach((button, k) => button.classList.toggle('is-focused', k === idx));
          paint();
          updateCenter();
        };

        const toggleSlice = idx => {
          if (activeFlags[idx] && activeFlags.filter(Boolean).length === 1) {
            items[idx]?.animate?.([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 260 });
            return;
          }
          activeFlags[idx] = !activeFlags[idx];
          const item = categories[idx];
          items[idx]?.setAttribute('aria-pressed', String(activeFlags[idx]));
          items[idx]?.setAttribute('aria-label', `${item.label} ${formatCurrency(item.amount)}, ${activeFlags[idx] ? 'incluída' : 'fora da conta'}`);
          const total = currentTotal();
          items.forEach((button, k) => {
            const pctEl = button.querySelector('small');
            if (pctEl) pctEl.textContent = activeFlags[k] && total > 0 ? `${Math.round((categories[k].amount / total) * 100)}%` : '—';
          });
          morph();
          focusedIdx = -2;
          focusSlice(activeFlags[idx] ? idx : -1);
        };

        segs.forEach((circle, idx) => {
          circle.addEventListener('pointerenter', () => focusSlice(idx));
          circle.addEventListener('click', () => toggleSlice(idx));
        });
        items.forEach((button, idx) => {
          button.addEventListener('pointerenter', () => focusSlice(idx));
          button.addEventListener('focus', () => focusSlice(idx));
          button.addEventListener('click', () => toggleSlice(idx));
        });
        svg?.addEventListener('pointerleave', () => focusSlice(-1));
        legendEl?.addEventListener('pointerleave', () => {
          if (!legendEl.contains(root.ownerDocument?.activeElement)) focusSlice(-1);
        });
        legendEl?.addEventListener('focusout', event => {
          if (!legendEl.contains(event.relatedTarget)) focusSlice(-1);
        });
      }
    } catch {}
  }

  const barsRoot = root.querySelector('[data-financial-bars]');
  if (barsRoot && !barsRoot.dataset.mounted) {
    barsRoot.dataset.mounted = '1';
    try {
      const payload = JSON.parse(barsRoot.dataset.financialBars || '{}');
      const series = payload.series || {};
      const labelEl = barsRoot.querySelector('[data-bars-label]');
      const totalEl = barsRoot.querySelector('[data-bars-total]');
      const deltaEl = barsRoot.querySelector('[data-bars-delta]');
      const stageEl = barsRoot.querySelector('[data-bars-stage]');
      const tipEl = barsRoot.querySelector('[data-bars-tip]');
      const periodButtons = [...barsRoot.querySelectorAll('[data-bars-period]')];
      let period = payload.active || 'month';
      let activeIdx = -1;
      let pinnedIdx = -1;

      const currentPoints = () => (Array.isArray(series[period]?.points) ? series[period].points : []);

      const updateReadout = () => {
        const points = currentPoints();
        const idx = activeIdx >= 0 ? activeIdx : pinnedIdx;
        if (idx >= 0 && points[idx]) {
          const point = points[idx];
          const prev = idx > 0 ? points[idx - 1] : null;
          const primary = point.revenue > 0 || point.expense === 0 ? point.revenue : point.expense;
          const prevPrimary = prev ? (point.revenue > 0 || point.expense === 0 ? prev.revenue : prev.expense) : 0;
          const delta = formatDeltaPct(primary, prevPrimary);
          if (labelEl) labelEl.textContent = `${point.fullLabel} · ${point.revenue > 0 || point.expense === 0 ? 'Receitas' : 'Despesas'}`;
          if (totalEl) totalEl.textContent = formatCurrency(primary);
          if (deltaEl) {
            deltaEl.textContent = delta ? `${delta.text} vs anterior` : '';
            deltaEl.classList.toggle('is-negative', Boolean(delta?.negative));
          }
          return;
        }
        const totalRevenue = points.reduce((sum, item) => sum + item.revenue, 0);
        const totalExpense = points.reduce((sum, item) => sum + item.expense, 0);
        const latest = points.at(-1);
        const prev = points.length >= 2 ? points.at(-2) : null;
        const delta = prev && latest ? formatDeltaPct(latest.revenue || latest.expense, prev.revenue || prev.expense) : null;
        if (labelEl) labelEl.textContent = totalRevenue > 0 ? 'Receitas no recorte' : 'Despesas no recorte';
        if (totalEl) totalEl.textContent = formatCurrency(totalRevenue > 0 ? totalRevenue : totalExpense);
        if (deltaEl) {
          deltaEl.textContent = delta ? `${delta.text} vs anterior` : '';
          deltaEl.classList.toggle('is-negative', Boolean(delta?.negative));
        }
      };

      const showBar = idx => {
        activeIdx = idx;
        const points = currentPoints();
        const shown = idx >= 0 ? idx : pinnedIdx;
        const groups = [...barsRoot.querySelectorAll('.financial-chart-month')];
        barsRoot.classList.toggle('has-focus', shown >= 0);
        groups.forEach((group, k) => {
          group.classList.toggle('is-focused', k === shown);
          group.classList.toggle('is-pinned', k === pinnedIdx);
        });
        if (tipEl) {
          if (shown >= 0 && points[shown] && groups[shown] && stageEl) {
            const point = points[shown];
            tipEl.textContent = `${point.label} · Rec. ${formatCurrency(point.revenue)} · Desp. ${formatCurrency(point.expense)}`;
            const stageRect = stageEl.getBoundingClientRect();
            const groupRect = groups[shown].getBoundingClientRect();
            const tipWidth = tipEl.offsetWidth || 180;
            const centerX = groupRect.left - stageRect.left + groupRect.width / 2;
            const clampedX = Math.max(0, Math.min(Math.max(0, stageRect.width - tipWidth), centerX - tipWidth / 2));
            tipEl.style.transform = `translate(${clampedX.toFixed(1)}px, 4px)`;
          }
          tipEl.classList.toggle('is-visible', shown >= 0);
        }
        updateReadout();
      };

      const bindStage = () => {
        const groups = [...barsRoot.querySelectorAll('.financial-chart-month')];
        groups.forEach((group, idx) => {
          group.addEventListener('pointerenter', () => showBar(idx));
          group.addEventListener('focus', () => showBar(idx));
          group.addEventListener('click', () => {
            pinnedIdx = pinnedIdx === idx ? -1 : idx;
            showBar(pinnedIdx >= 0 ? idx : -1);
          });
          group.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              pinnedIdx = pinnedIdx === idx ? -1 : idx;
              showBar(pinnedIdx >= 0 ? idx : -1);
              return;
            }
            const total = groups.length;
            const target = event.key === 'ArrowRight' ? Math.min(total - 1, idx + 1)
              : event.key === 'ArrowLeft' ? Math.max(0, idx - 1)
              : event.key === 'Home' ? 0
              : event.key === 'End' ? total - 1 : -1;
            if (target < 0) return;
            event.preventDefault();
            groups.forEach((g, k) => g.setAttribute('tabindex', k === target ? '0' : '-1'));
            groups[target].focus();
            showBar(target);
          });
        });
        const svg = stageEl?.querySelector('svg.financial-chart-svg');
        svg?.addEventListener('pointerleave', () => showBar(-1));
        svg?.addEventListener('focusout', event => {
          if (!svg.contains(event.relatedTarget)) showBar(-1);
        });
      };

      periodButtons.forEach(button => {
        button.addEventListener('click', () => {
          const nextPeriod = button.dataset.barsPeriod;
          if (!nextPeriod || nextPeriod === period || !series[nextPeriod]?.points?.length) return;
          period = nextPeriod;
          activeIdx = -1;
          pinnedIdx = -1;
          periodButtons.forEach(item => item.setAttribute('aria-pressed', String(item.dataset.barsPeriod === period)));
          if (stageEl) {
            const oldSvg = stageEl.querySelector('svg.financial-chart-svg');
            if (oldSvg) {
              const holder = root.ownerDocument.createElement('div');
              holder.innerHTML = renderBarPlotSvg({ points: currentPoints(), escapeHtml, formatCurrency, hideValues });
              const freshSvg = holder.firstElementChild;
              if (freshSvg) oldSvg.replaceWith(freshSvg);
            }
          }
          bindStage();
          showBar(-1);
        });
      });

      bindStage();
    } catch {}
  }
}
