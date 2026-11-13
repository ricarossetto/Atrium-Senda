import { iconSvg } from '../views/ui-v2/primitives.js?v=3.1.0';

const GROUPS = Object.freeze({
  process: { label: 'Processos', icon: 'process', classic: 'PROC', target: 'process' },
  contact: { label: 'Contatos', icon: 'contact', classic: 'CONT', target: 'contact' },
  lead: { label: 'Atendimentos / CRM', icon: 'leads', classic: 'CRM', target: 'lead' },
  publication: { label: 'Publicações e DJEN', icon: 'publication', classic: 'PUB', target: 'intimation' },
  task: { label: 'Tarefas e Prazos', icon: 'task', classic: 'TAR', target: 'task' },
  document: { label: 'Documentos e OCR', icon: 'documents', classic: 'DOC', target: 'document' },
  appointment: { label: 'Agenda', icon: 'agenda', classic: 'AG', target: 'agenda' },
  note: { label: 'Notas internas', icon: 'publications', classic: 'NT', target: 'intimation' },
  movement: { label: 'Movimentações judiciais', icon: 'process', classic: 'MOV', target: 'process' },
  financial: { label: 'Financeiro jurídico', icon: 'financial', classic: 'R$', target: 'financial' },
  prompt: { label: 'Prompts jurídicos', icon: 'prompts', classic: 'PR', target: 'prompt' },
  audit: { label: 'Auditoria', icon: 'audit', classic: 'AUD', target: 'audit' }
});

export const LOCAL_GROUP_LIMIT = 10;

// Limita o primeiro paint local por grupo sem alterar o merge final:
// o badge segue exibindo o total real de correspondências.
export function capGroups(results) {
  const shown = [];
  const seen = new Map();
  const totals = new Map();
  for (const result of results || []) {
    const type = result?.entityType;
    if (!type) continue;
    totals.set(type, (totals.get(type) || 0) + 1);
    if ((seen.get(type) || 0) < LOCAL_GROUP_LIMIT) {
      seen.set(type, (seen.get(type) || 0) + 1);
      shown.push(result);
    }
  }
  return { shown, totals };
}

export function createGlobalSearch({
  getState,
  normalizeText,
  escapeHtml,
  formatDate,
  searchContent,
  onSelect,
  inputId = 'globalSearch',
  resultsId = 'searchPaletteResults',
  paletteId = 'globalSearchPalette',
  containerSelector = '.global-search-container',
  optionIdPrefix = 'global-search-option-',
  localResultsProvider = null,
  maxResults = 30,
  minQueryLength = 2,
  listAllOnEmpty = false,
  openOnFocus = false,
  shortcuts = true,
  resultsLabel = 'Resultados da busca global'
} = {}) {
  let initialized = false;
  let debounceTimer = null;
  let activeIndex = -1;
  let requestSequence = 0;

  function init() {
    if (initialized) return;
    initialized = true;
    const input = document.getElementById(inputId);
    const results = document.getElementById(resultsId);

    input?.setAttribute('role', 'combobox');
    input?.setAttribute('aria-autocomplete', 'list');
    input?.setAttribute('aria-controls', resultsId);
    input?.setAttribute('aria-expanded', 'false');
    results?.setAttribute('role', 'listbox');
    results?.setAttribute('aria-label', resultsLabel);

    const mobilePlaceholder = input?.dataset?.placeholderMobile;
    const desktopPlaceholder = input?.placeholder;
    if (input && mobilePlaceholder && desktopPlaceholder && typeof globalThis.matchMedia === 'function') {
      const compact = globalThis.matchMedia('(max-width: 767px)');
      const applyPlaceholder = () => { input.placeholder = compact.matches ? mobilePlaceholder : desktopPlaceholder; };
      applyPlaceholder();
      compact.addEventListener?.('change', applyPlaceholder);
    }

    input?.addEventListener('input', event => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { void perform(event.target.value); }, 180);
    });
    input?.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!document.getElementById(paletteId)?.classList.contains('hidden')) {
          event.preventDefault();
          moveActive(event.key === 'ArrowDown' ? 1 : -1);
        }
      } else if (event.key === 'Enter') {
        const item = getItems()[activeIndex];
        if (item) {
          event.preventDefault();
          selectItem(item);
        }
      } else if (event.key === 'Escape') {
        close();
        input.blur();
      }
    });
    results?.addEventListener('click', event => {
      const item = event.target.closest('.search-palette-item');
      if (item) selectItem(item);
    });
    results?.addEventListener('mousemove', event => {
      const item = event.target.closest('.search-palette-item');
      if (item) setActive(getItems().indexOf(item));
    });
    if (openOnFocus) input?.addEventListener('focus', () => { void perform(input.value); });
    if (shortcuts) document.addEventListener('keydown', event => {
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
      if (!event.target.closest(containerSelector)) close();
    });
  }

  function close() {
    requestSequence += 1;
    document.getElementById(paletteId)?.classList.add('hidden');
    const input = document.getElementById(inputId);
    input?.setAttribute('aria-expanded', 'false');
    input?.setAttribute('aria-busy', 'false');
    input?.removeAttribute('aria-activedescendant');
    setActive(-1);
  }

  function getItems() {
    return [...(document.getElementById(resultsId)?.querySelectorAll('.search-palette-item') || [])];
  }

  function setActive(index) {
    const items = getItems();
    activeIndex = items.length && index >= 0 ? Math.min(index, items.length - 1) : -1;
    items.forEach((item, itemIndex) => {
      const selected = itemIndex === activeIndex;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    const input = document.getElementById(inputId);
    if (activeIndex >= 0) {
      input?.setAttribute('aria-activedescendant', items[activeIndex].id);
      items[activeIndex].scrollIntoView?.({ block: 'nearest' });
    } else input?.removeAttribute('aria-activedescendant');
  }

  function moveActive(direction) {
    const items = getItems();
    if (!items.length) return;
    const nextIndex = activeIndex < 0
      ? (direction > 0 ? 0 : items.length - 1)
      : (activeIndex + direction + items.length) % items.length;
    setActive(nextIndex);
  }

  function selectItem(item) {
    const input = document.getElementById(inputId);
    const selection = { target: item.dataset.searchTarget, id: item.dataset.searchId };
    close();
    if (input) input.value = '';
    onSelect?.(selection);
  }

  function prepareResults(previousSelection = '') {
    const input = document.getElementById(inputId);
    const items = getItems();
    items.forEach((item, index) => {
      item.id = `${optionIdPrefix}${index}`;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');
      item.setAttribute('tabindex', '-1');
    });
    activeIndex = -1;
    input?.setAttribute('aria-expanded', 'true');
    input?.removeAttribute('aria-activedescendant');
    if (previousSelection) {
      const nextIndex = items.findIndex(item => `${item.dataset.searchTarget}:${item.dataset.searchId}` === previousSelection);
      if (nextIndex >= 0) setActive(nextIndex);
    }
  }

  function localResults(state, query) {
    const needle = normalizeText(query);
    const processes = state.processes || [];
    // Índice O(n) por chamada: processFor roda por registro vinculado e o
    // find por registro é O(m) — mesma semântica de first-match, com String().
    const processById = new Map();
    const processByNumber = new Map();
    for (const process of processes) {
      if (!process) continue;
      const id = String(process.id || '');
      if (id && !processById.has(id)) processById.set(id, process);
      const number = String(process.number || process.protocol || '').replace(/\D/g, '');
      if (number && !processByNumber.has(number)) processByNumber.set(number, process);
    }
    const processFor = record => {
      const processId = record?.processId || (record?.ownerType === 'process' ? record.ownerId : '');
      const byId = processId ? processById.get(String(processId)) : null;
      const processNumber = String(record?.process || record?.processNumber || '').replace(/\D/g, '');
      return byId || (processNumber ? processByNumber.get(processNumber) || null : null);
    };
    const processContext = record => {
      const process = processFor(record);
      return process ? `${process.number || ''} · ${process.client || 'Cliente não vinculado'}` : '';
    };
    const matches = (collection, entityType, target, title, context, haystack, matchedField) => (collection || [])
      .filter(item => normalizeText(haystack(item)).includes(needle))
      .map(item => ({
        entityType,
        target,
        id: item.id,
        title: title(item),
        context: context(item),
        snippet: context(item),
        matchedField,
        relevance: 0
      }));
    return [
      ...matches(processes, 'process', 'process', item => item.number || 'Processo S/N', item => `${item.client || 'Cliente'} · ${item.court || 'Tribunal'}`, item => `${item.number} ${String(item.number || '').replace(/\D/g, '')} ${item.client} ${item.court} ${item.actionType} ${(item.movements || []).map(movement => movement.description || movement.text || movement.name).join(' ')}`, 'Registro processual'),
      ...matches(state.contacts, 'contact', 'contact', item => item.name || 'Contato', item => item.document || item.cpf || item.cnpj || item.email || item.phone || 'Sem documento', item => `${item.name} ${item.document} ${item.cpf} ${item.cnpj} ${item.cpfCnpj} ${String(item.document || item.cpf || item.cnpj || item.cpfCnpj || '').replace(/\D/g, '')} ${item.email} ${item.phone}`, 'Cadastro do contato'),
      ...matches(state.leads, 'lead', 'lead', item => item.client || 'Atendimento', item => item.serviceType || item.status || 'CRM jurídico', item => `${item.client} ${item.serviceType} ${item.status} ${item.origin} ${item.responsible} ${item.notes}`, 'Atendimento / CRM'),
      ...matches((state.tasks || []).filter(item => item && item.active !== false), 'task', 'task', item => item.title || 'Tarefa', item => processContext(item) || item.client || item.process || `Prazo: ${formatDate(item.deadline)}`, item => `${item.title} ${item.description} ${item.client} ${item.process} ${item.responsible} ${processContext(item)}`, 'Tarefa'),
      ...matches(state.intimations, 'publication', 'intimation', item => item.title || 'Publicação', item => processContext(item) || item.process || item.court || 'DataJud', item => `${item.title} ${item.text} ${item.client} ${item.process} ${item.court} ${processContext(item)}`, 'Publicação'),
      ...matches((state.documents || []).filter(item => !item.deletedAt), 'document', 'document', item => item.name || item.originalName || 'Documento', item => `${processContext(item)} · ${item.documentType || 'Documento'} · ${item.documentDate || ''}`, item => `${item.name} ${item.originalName} ${item.documentType} ${item.documentDate} ${item.metadata?.origin} ${(item.metadata?.tags || []).join(' ')} ${item.metadata?.summary} ${item.metadata?.context} ${(item.metadata?.entities || []).map(entity => `${entity?.type || ''} ${entity?.label || ''} ${entity?.identifier || ''}`).join(' ')} ${processContext(item)}`, 'Metadata documental'),
      ...matches(state.agenda, 'appointment', 'agenda', item => item.title || 'Compromisso', item => processContext(item) || item.client || item.date || 'Agenda', item => `${item.title} ${item.notes} ${item.description} ${item.date} ${item.time} ${processContext(item)}`, 'Agenda'),
      ...(state.intimations || []).flatMap(publication => (publication.workNotes || []).filter(note => normalizeText(`${note.text} ${publication.title} ${processContext(publication)}`).includes(needle)).map(note => ({ entityType: 'note', target: 'intimation', id: publication.id, title: 'Nota interna da publicação', context: `${processContext(publication)} · ${publication.title || ''}`, snippet: note.text || '', matchedField: 'Nota interna', relevance: 0 }))),
      ...processes.flatMap(process => (process.movements || []).filter(movement => normalizeText(`${movement.description} ${movement.text} ${movement.name} ${process.number} ${process.client}`).includes(needle)).map(movement => ({ entityType: 'movement', target: 'process', id: process.id, title: movement.description || movement.text || movement.name || 'Movimentação processual', context: `${process.number || ''} · ${process.client || ''}`, snippet: movement.detail || movement.complement || '', matchedField: 'Movimentação judicial', relevance: 0 }))),
      ...processes.flatMap(process => (process.expenses || []).filter(expense => normalizeText(`${expense.description} ${expense.title} ${expense.status} ${expense.amount} ${process.number} ${process.client}`).includes(needle)).map(expense => ({ entityType: 'financial', target: 'financial', id: process.id, title: expense.description || expense.title || 'Despesa processual', context: `${process.number || ''} · ${process.client || ''}`, snippet: String(expense.amount || ''), matchedField: 'Lançamento financeiro', relevance: 0 }))),
      ...processes.flatMap(process => (process.feeInstallments || []).filter(installment => normalizeText(`${installment.description} ${installment.status} ${installment.amount} ${installment.dueDate} ${process.number} ${process.client}`).includes(needle)).map(installment => ({ entityType: 'financial', target: 'financial', id: process.id, title: installment.description || 'Parcela de honorários', context: `${process.number || ''} · ${process.client || ''}`, snippet: `${installment.amount || ''} · ${installment.dueDate || ''}`, matchedField: 'Parcela de honorários', relevance: 0 }))),
      ...processes.flatMap(process => (process.receipts || []).filter(receipt => normalizeText(`${receipt.description} ${receipt.status} ${receipt.amount} ${receipt.date} ${process.number} ${process.client}`).includes(needle)).map(receipt => ({ entityType: 'financial', target: 'financial', id: process.id, title: receipt.description || 'Recebimento de honorários', context: `${process.number || ''} · ${process.client || ''}`, snippet: `${receipt.amount || ''} · ${receipt.date || ''}`, matchedField: 'Recebimento de honorários', relevance: 0 }))),
      ...matches(processes.filter(process => ['feeType', 'feePercentage', 'feeAmount', 'feeMonthly', 'feeStatus', 'requisitionType', 'requisitionAmount', 'requisitionStatus'].some(key => process[key] !== undefined && process[key] !== null && String(process[key]).trim() !== '')), 'financial', 'financial', () => 'Honorários e requisições do processo', item => `${item.number || ''} · ${item.client || ''}`, item => `${item.number} ${item.client} ${item.feeType} ${item.feePercentage} ${item.feeAmount} ${item.feeMonthly} ${item.feeStatus} ${item.requisitionType} ${item.requisitionAmount} ${item.requisitionStatus}`, 'Honorários e financeiro'),
      ...matches(state.customPrompts, 'prompt', 'prompt', item => item.title || 'Prompt jurídico', item => `${item.category || ''} · ${item.type || ''}`, item => `${item.title} ${item.description} ${(item.tags || []).join(' ')} ${item.prompt}`, 'Prompt jurídico'),
      ...matches(state.audit, 'audit', 'audit', item => item.action || 'Registro de auditoria', item => `${item.actor || 'Sistema'} · ${formatDate(item.at)}`, item => `${item.action} ${item.actor}`, 'Auditoria')
    ];
  }

  function mergeResults(remote, local) {
    const merged = new Map();
    for (const result of [...remote, ...local]) {
      if (!GROUPS[result?.entityType] || !result?.id || !result?.title) continue;
      const key = `${result.entityType}:${result.id}`;
      if (!merged.has(key)) merged.set(key, result);
    }
    return [...merged.values()].sort((left, right) => Number(right.relevance || 0) - Number(left.relevance || 0)).slice(0, maxResults);
  }

  function highlighted(value, query) {
    const text = String(value || '');
    const tokens = [...new Set(String(query || '').trim().split(/\s+/).filter(token => token.length >= 2))];
    if (!tokens.length) return escapeHtml(text);
    const escapedTokens = tokens.map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const matcher = new RegExp(`(${escapedTokens.join('|')})`, 'gi');
    let cursor = 0;
    let html = '';
    for (const match of text.matchAll(matcher)) {
      html += escapeHtml(text.slice(cursor, match.index));
      html += `<mark>${escapeHtml(match[0])}</mark>`;
      cursor = match.index + match[0].length;
    }
    return html + escapeHtml(text.slice(cursor));
  }

  function renderResults(results, query, totals = null) {
    const palette = document.getElementById(paletteId);
    const resultsEl = document.getElementById(resultsId);
    if (!palette || !resultsEl) return;
    const activeItem = getItems()[activeIndex] || resultsEl.querySelector('.search-palette-item.active');
    const previousSelection = activeItem
      ? `${activeItem.dataset.searchTarget}:${activeItem.dataset.searchId}`
      : '';
    if (!results.length) {
      resultsEl.innerHTML = query
        ? `<div class="search-palette-empty">Nenhum resultado localizado para <strong>"${escapeHtml(query)}"</strong>.</div>`
        : '<div class="search-palette-empty">Nenhum registro localizado.</div>';
      palette.classList.remove('hidden');
      prepareResults(previousSelection);
      return;
    }
    const groups = [];
    for (const [entityType, config] of Object.entries(GROUPS)) {
      const groupResults = results.filter(result => result.entityType === entityType);
      if (!groupResults.length) continue;
      groups.push(renderGroup(config.label, groupResults, totals?.get(entityType), result => {
        const detail = result.snippet && result.snippet !== result.context
          ? `${result.context ? `${result.context} · ` : ''}${result.snippet}`
          : result.context || result.snippet || '';
        return `
          <div class="search-palette-item" data-search-target="${escapeHtml(config.target)}" data-search-id="${escapeHtml(result.id)}">
            <span class="search-palette-icon" aria-hidden="true"><span class="classic-search-icon">${escapeHtml(config.classic)}</span><span class="v2-search-icon">${iconSvg(config.icon)}</span></span>
            <div class="search-palette-info"><strong>${highlighted(result.title, query)}</strong><small>${highlighted(detail, query)}</small></div>
            <span class="search-palette-badge">${escapeHtml(result.matchedField || config.label)}</span>
          </div>`;
      }));
    }
    resultsEl.innerHTML = groups.join('');
    palette.classList.remove('hidden');
    prepareResults(previousSelection);
  }

  async function perform(query) {
    const trimmed = String(query || '').trim();
    const palette = document.getElementById(paletteId);
    const resultsEl = document.getElementById(resultsId);
    const input = document.getElementById(inputId);
    if (!palette || !resultsEl) return [];
    const requestId = ++requestSequence;
    const tooShort = trimmed ? trimmed.length < minQueryLength : !listAllOnEmpty;
    if (tooShort) {
      palette.classList.add('hidden');
      resultsEl.innerHTML = '';
      input?.setAttribute('aria-expanded', 'false');
      input?.setAttribute('aria-busy', 'false');
      setActive(-1);
      return [];
    }

    const local = typeof localResultsProvider === 'function'
      ? localResultsProvider(getState() || {}, trimmed)
      : localResults(getState() || {}, trimmed);
    const { shown, totals } = capGroups(local);
    renderResults(shown, trimmed, totals);
    if (typeof searchContent !== 'function') return local;
    input?.setAttribute('aria-busy', 'true');
    try {
      const remote = await searchContent(trimmed, 24);
      if (requestId !== requestSequence) return [];
      const merged = mergeResults(remote, local);
      renderResults(merged, trimmed);
      return merged;
    } catch {
      return local;
    } finally {
      if (requestId === requestSequence) input?.setAttribute('aria-busy', 'false');
    }
  }

  function renderGroup(title, items, total, renderItem) {
    const totalLabel = Number.isFinite(Number(total)) ? Number(total).toLocaleString('pt-BR') : null;
    const badge = totalLabel !== null && Number(total) > items.length
      ? `${items.length} de ${totalLabel}`
      : `${totalLabel ?? items.length}`;
    return `
      <div class="search-palette-group">
        <div class="search-palette-group-title"><span>${escapeHtml(title)} (${badge})</span></div>
        ${items.map(renderItem).join('')}
      </div>`;
  }

  return Object.freeze({ init, close, perform, moveActive });
}
