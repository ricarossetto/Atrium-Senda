export function createGlobalSearch({ getState, normalizeText, escapeHtml, formatDate, onSelect } = {}) {
  let initialized = false;
  let debounceTimer = null;

  function init() {
    if (initialized) return;
    initialized = true;
    const input = document.getElementById('globalSearch');
    const results = document.getElementById('searchPaletteResults');

    input?.addEventListener('input', event => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => perform(event.target.value), 180);
    });
    input?.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        close();
        input.blur();
      }
    });
    results?.addEventListener('click', event => {
      const item = event.target.closest('.search-palette-item');
      if (!item) return;
      close();
      if (input) input.value = '';
      onSelect?.({ target: item.dataset.searchTarget, id: item.dataset.searchId });
    });
    document.addEventListener('keydown', event => {
      const shortcut = ((event.key === 'k' || event.key === 'K') && (event.ctrlKey || event.metaKey))
        || (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName));
      if (shortcut) {
        event.preventDefault();
        input?.focus();
        input?.select();
      } else if (event.key === 'Escape' && event.target !== input) {
        close();
        input?.blur();
      }
    });
    document.addEventListener('click', event => {
      if (!event.target.closest('.global-search-container')) close();
    });
  }

  function close() {
    document.getElementById('globalSearchPalette')?.classList.add('hidden');
  }

  function perform(query) {
    const trimmed = String(query || '').trim();
    const palette = document.getElementById('globalSearchPalette');
    const resultsEl = document.getElementById('searchPaletteResults');
    if (!palette || !resultsEl) return;

    if (!trimmed || trimmed.length < 2) {
      palette.classList.add('hidden');
      resultsEl.innerHTML = '';
      return;
    }

    const state = getState();
    const needle = normalizeText(trimmed);
    const processes = (state.processes || []).filter(item =>
      normalizeText(`${item.number} ${item.client} ${item.court} ${item.actionType}`).includes(needle)
    ).slice(0, 4);
    const contacts = (state.contacts || []).filter(item =>
      normalizeText(`${item.name} ${item.document} ${item.email} ${item.phone}`).includes(needle)
    ).slice(0, 4);
    const tasks = (state.tasks || []).filter(item =>
      normalizeText(`${item.title} ${item.client} ${item.process} ${item.responsible}`).includes(needle)
    ).slice(0, 4);
    const intimations = (state.intimations || []).filter(item =>
      normalizeText(`${item.title} ${item.client} ${item.process} ${item.court}`).includes(needle)
    ).slice(0, 4);

    if (processes.length + contacts.length + tasks.length + intimations.length === 0) {
      resultsEl.innerHTML = `<div class="search-palette-empty">Nenhum resultado localizado para <strong>"${escapeHtml(trimmed)}"</strong>.</div>`;
      palette.classList.remove('hidden');
      return;
    }

    const groups = [];
    if (processes.length > 0) groups.push(renderGroup('Processos', processes, process => `
      <div class="search-palette-item" data-search-target="process" data-search-id="${escapeHtml(process.id)}">
        <span class="search-palette-icon">⚖️</span>
        <div class="search-palette-info"><strong>${escapeHtml(process.number || 'Processo S/N')}</strong><small>${escapeHtml(process.client || 'Cliente')} · ${escapeHtml(process.court || 'Tribunal')}</small></div>
        <span class="search-palette-badge">${escapeHtml(process.actionType || 'Ação')}</span>
      </div>`));
    if (contacts.length > 0) groups.push(renderGroup('Contatos', contacts, contact => `
      <div class="search-palette-item" data-search-target="contact" data-search-id="${escapeHtml(contact.id)}">
        <span class="search-palette-icon">👤</span>
        <div class="search-palette-info"><strong>${escapeHtml(contact.name || 'Contato')}</strong><small>${escapeHtml(contact.document || contact.email || contact.phone || 'Sem documento')}</small></div>
        <span class="search-palette-badge">${escapeHtml(contact.role || 'Cliente')}</span>
      </div>`));
    if (tasks.length > 0) groups.push(renderGroup('Tarefas &amp; Prazos', tasks, task => `
      <div class="search-palette-item" data-search-target="task" data-search-id="${escapeHtml(task.id)}">
        <span class="search-palette-icon">📋</span>
        <div class="search-palette-info"><strong>${escapeHtml(task.title || 'Tarefa')}</strong><small>${escapeHtml(task.client || task.process || 'Prazo: ' + formatDate(task.deadline))}</small></div>
        <span class="search-palette-badge">${escapeHtml(task.status || 'Pendente')}</span>
      </div>`));
    if (intimations.length > 0) groups.push(renderGroup('Publicações &amp; DJEN', intimations, intimation => `
      <div class="search-palette-item" data-search-target="intimation" data-search-id="${escapeHtml(intimation.id)}">
        <span class="search-palette-icon">📬</span>
        <div class="search-palette-info"><strong>${escapeHtml(intimation.title || 'Publicação')}</strong><small>${escapeHtml(intimation.process || intimation.court || 'DataJud')}</small></div>
        <span class="search-palette-badge">${escapeHtml(intimation.category || 'Intimação')}</span>
      </div>`));

    resultsEl.innerHTML = groups.join('');
    palette.classList.remove('hidden');
  }

  function renderGroup(title, items, renderItem) {
    return `
      <div class="search-palette-group">
        <div class="search-palette-group-title"><span>${title} (${items.length})</span></div>
        ${items.map(renderItem).join('')}
      </div>`;
  }

  return Object.freeze({ init, close, perform });
}
