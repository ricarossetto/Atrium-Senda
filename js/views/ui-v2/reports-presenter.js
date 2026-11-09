const plural = (count, singular, pluralForm) => `${count} ${Number(count) === 1 ? singular : pluralForm}`;
/**
 * ATRIUM — Presenter da aba Relatórios (produtividade de tarefas)
 *
 * Renderização pura sobre o relatório derivado de `computeProductivityReport`.
 * Sem rede, sem Store e sem mutação: o controlador (js/features/reports.js)
 * fornece dados já resolvidos.
 */
function escape(value, escapeHtml) {
  return escapeHtml(String(value ?? ''));
}

function durationLabel(minutes, formatMinutes) {
  return Number.isFinite(minutes) && minutes > 0 ? formatMinutes(minutes) : '—';
}

function delayLabel(days) {
  return Number.isFinite(days) ? `${days.toLocaleString('pt-BR')} d` : '—';
}

function reachLabel(reach) {
  return Number.isFinite(reach) ? `${Math.round(reach * 100)}%` : '—';
}

function sortButton(sort, key, label, escapeHtml) {
  const active = sort.key === key;
  const direction = active && sort.dir === 'asc' ? 'ascendente' : 'descendente';
  const symbol = active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕';
  return `<button type="button" class="reports-sort" data-report-sort="${escape(key, escapeHtml)}" aria-pressed="${active}" aria-label="Ordenar por ${escape(label, escapeHtml)}, direção ${direction}">${escape(label, escapeHtml)}<span class="sort-indicator" aria-hidden="true">${symbol}</span></button>`;
}

function option(value, label, selected, escapeHtml) {
  return `<option value="${escape(value, escapeHtml)}"${selected ? ' selected' : ''}>${escape(label, escapeHtml)}</option>`;
}

function filterSelect(name, label, entries, selected, escapeHtml) {
  const options = [option('all', `Todos (${label})`, selected === 'all', escapeHtml)]
    .concat(entries.map(entry => option(entry, entry, selected === entry, escapeHtml)));
  return `<label class="reports-filter"><span>${escape(label, escapeHtml)}</span><select data-report-filter="${escape(name, escapeHtml)}">${options.join('')}</select></label>`;
}

export function renderReportsWorkspace({ report, sort = { key: 'points', dir: 'desc' }, escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])), formatDate = value => String(value ?? ''), formatMinutes = value => String(value ?? '') } = {}) {
  const { totals, rows, completions, byType, filters, filterOptions, range } = report;
  const sortedRows = [...rows].sort((left, right) => {
    const direction = sort.dir === 'asc' ? 1 : -1;
    if (sort.key === 'responsible') return left.responsible.localeCompare(right.responsible, 'pt-BR') * direction;
    const key = sort.key === 'completed' ? 'completed' : 'points';
    return ((left[key] || 0) - (right[key] || 0)) * direction || left.responsible.localeCompare(right.responsible, 'pt-BR');
  });

  const kpis = [
    ['Concluídas', totals.completed],
    ['Pontos', totals.points.toLocaleString('pt-BR')],
    ['Tempo médio', durationLabel(totals.avgDurationMinutes, formatMinutes)],
    ['Atraso médio', delayLabel(totals.avgDelayDays)],
    ['Tempo apontado', formatMinutes(totals.timeLoggedMinutes) || '0m'],
    ['Pendentes', `${totals.pending} (${totals.late} em atraso)`]
  ].map(([label, value]) => `<div class="reports-kpi"><span>${escape(label, escapeHtml)}</span><strong>${escape(value, escapeHtml)}</strong></div>`).join('');

  const responsibleRows = sortedRows.map(row => `
    <tr>
      <td>${escape(row.responsible, escapeHtml)}</td>
      <td class="reports-number">${row.completed}</td>
      <td class="reports-number">${row.points.toLocaleString('pt-BR')}</td>
      <td class="reports-number">${row.goal != null ? row.goal.toLocaleString('pt-BR') : '—'}</td>
      <td class="reports-number">${escape(reachLabel(row.reach), escapeHtml)}</td>
      <td class="reports-number">${escape(durationLabel(row.avgDurationMinutes, formatMinutes), escapeHtml)}</td>
      <td class="reports-number">${escape(delayLabel(row.avgDelayDays), escapeHtml)}</td>
      <td class="reports-number">${escape(formatMinutes(row.timeLoggedMinutes) || '0m', escapeHtml)}</td>
      <td class="reports-number">${row.pending}</td>
      <td class="reports-number">${row.late}</td>
    </tr>`).join('') || '';

  const completionRows = completions.slice(0, 200).map(item => `
    <tr>
      <td>${escape(item.responsible, escapeHtml)}</td>
      <td>${escape(item.completedBy || '—', escapeHtml)}</td>
      <td>${escape(item.title, escapeHtml)}</td>
      <td>${escape(item.type, escapeHtml)}</td>
      <td>${escape(item.client || '—', escapeHtml)}</td>
      <td>${escape(item.process || '—', escapeHtml)}</td>
      <td>${escape(formatDate(item.completedAt), escapeHtml)}</td>
      <td class="reports-number">${escape(durationLabel(item.durationMinutes, formatMinutes), escapeHtml)}</td>
      <td class="reports-number">${escape(delayLabel(item.delayDays), escapeHtml)}</td>
      <td class="reports-number">${item.points}</td>
    </tr>`).join('') || '';

  const typeRows = byType.map(entry => `<li><span>${escape(entry.type, escapeHtml)}</span><strong>${entry.count}</strong></li>`).join('')
    || '';

  const sortHeader = (key, label) => `<th scope="col">${sortButton(sort, key, label, escapeHtml)}</th>`;

  return `
    <div class="reports-toolbar">
      <label class="reports-filter"><span>Período</span>
        <select data-report-filter="period">
          ${option('current-month', 'Mês atual', filters.period === 'current-month', escapeHtml)}
          ${option('previous-month', 'Mês anterior', filters.period === 'previous-month', escapeHtml)}
          ${option('30d', 'Últimos 30 dias', filters.period === '30d', escapeHtml)}
          ${option('90d', 'Últimos 90 dias', filters.period === '90d', escapeHtml)}
          ${option('custom', 'Personalizado', filters.period === 'custom', escapeHtml)}
        </select>
      </label>
      ${filters.period === 'custom' ? `
      <label class="reports-filter"><span>De</span><input type="date" data-report-filter="dateFrom" value="${escape(filters.dateFrom, escapeHtml)}"></label>
      <label class="reports-filter"><span>Até</span><input type="date" data-report-filter="dateTo" value="${escape(filters.dateTo, escapeHtml)}"></label>` : ''}
      ${filterSelect('responsible', 'responsável', filterOptions.responsibles, filters.responsible, escapeHtml)}
      ${filterSelect('taskType', 'tipo de atividade', filterOptions.taskTypes, filters.taskType, escapeHtml)}
      <button type="button" class="button ghost" data-report-export><svg class="atrium-icon btn-svg" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.0#atrium-icon-download"></use></svg><span>Exportar CSV</span></button>
    </div>

    <div class="reports-kpis" role="group" aria-label="Resumo do período">${kpis}</div>
    <p class="reports-range">${escape(range.label, escapeHtml)} · ${escape(formatDate(new Date(range.start).toISOString()), escapeHtml)} — ${escape(formatDate(new Date(range.end).toISOString()), escapeHtml)}</p>

    <section class="reports-block" aria-labelledby="reportsResponsibleHeading">
      <header class="reports-block-head"><h3 id="reportsResponsibleHeading">Produtividade por responsável</h3><span>${plural(rows.length, 'pessoa', 'pessoas')}</span></header>
      <div class="reports-table-wrap">
        <table class="reports-table">
          <thead><tr>
            ${sortHeader('responsible', 'Responsável')}
            ${sortHeader('completed', 'Concluídas')}
            ${sortHeader('points', 'Pontos')}
            <th scope="col">Meta</th><th scope="col">Alcance</th>
            <th scope="col">Tempo médio</th><th scope="col">Atraso médio</th><th scope="col">Tempo apontado</th>
            <th scope="col">Pendentes</th><th scope="col">Atrasadas</th>
          </tr></thead>
          <tbody>${responsibleRows || '<tr><td colspan="10">Sem movimentação de tarefas neste filtro.</td></tr>'}</tbody>
        </table>
      </div>
    </section>

    <section class="reports-block" aria-labelledby="reportsCompletionsHeading">
      <header class="reports-block-head"><h3 id="reportsCompletionsHeading">Quem fez o que</h3><span>${plural(completions.length, 'conclusão', 'conclusões')}${completions.length > 200 ? ' · exibindo 200' : ''}</span></header>
      <div class="reports-table-wrap">
        <table class="reports-table">
          <thead><tr>
            <th scope="col">Responsável</th><th scope="col">Concluído por</th><th scope="col">Tarefa</th><th scope="col">Tipo</th>
            <th scope="col">Cliente</th><th scope="col">Processo</th><th scope="col">Concluída em</th>
            <th scope="col">Duração</th><th scope="col">Atraso</th><th scope="col">Pontos</th>
          </tr></thead>
          <tbody>${completionRows || '<tr><td colspan="10">Nenhuma tarefa concluída neste período.</td></tr>'}</tbody>
        </table>
      </div>
    </section>

    <section class="reports-block" aria-labelledby="reportsTypesHeading">
      <header class="reports-block-head"><h3 id="reportsTypesHeading">Atividades concluídas por tipo</h3></header>
      ${typeRows ? `<ol class="reports-ranking">${typeRows}</ol>` : '<p class="reports-empty">Sem atividades concluídas no período.</p>'}
    </section>

    <p class="reports-note">Calculado a partir das tarefas registradas. Duração: da criação à conclusão. Atraso: do prazo informado à conclusão. Nenhum prazo jurídico é calculado aqui.</p>`;
}
