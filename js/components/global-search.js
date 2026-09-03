import { iconSvg } from '../views/ui-v2/primitives.js';

const GROUPS = Object.freeze({
  process: { label: 'Processos', icon: 'process', classic: '⚖️', target: 'process' },
  contact: { label: 'Contatos', icon: 'contact', classic: '👤', target: 'contact' },
  lead: { label: 'Atendimentos / CRM', icon: 'leads', classic: 'CRM', target: 'lead' },
  publication: { label: 'Publicações & DJEN', icon: 'publication', classic: '📬', target: 'intimation' },
  task: { label: 'Tarefas & Prazos', icon: 'task', classic: '📋', target: 'task' },
  document: { label: 'Documentos & OCR', icon: 'documents', classic: 'DOC', target: 'document' },
  appointment: { label: 'Agenda', icon: 'agenda', classic: 'AG', target: 'agenda' },
  note: { label: 'Notas internas', icon: 'publications', classic: 'NT', target: 'intimation' },
  movement: { label: 'Movimentações judiciais', icon: 'process', classic: 'MOV', target: 'process' },
  financial: { label: 'Financeiro jurídico', icon: 'financial', classic: 'R$', target: 'financial' },
  prompt: { label: 'Prompts jurídicos', icon: 'prompts', classic: 'PR', target: 'prompt' },
  audit: { label: 'Auditoria', icon: 'audit', classic: 'AUD', target: 'audit' }
});

export function createGlobalSearch({ getState, normalizeText, escapeHtml, formatDate, searchContent, onSelect } = {}) {
  let initialized = false;
  let debounceTimer = null;
  let activeIndex = -1;
  let requestSequence = 0;

  function init() {
    if (initialized) return;
    initialized = true;
    const input = document.getElementById('globalSearch');
    const results = document.getElementById('searchPaletteResults');

    input?.setAttribute('role', 'combobox');
    input?.setAttribute('aria-autocomplete', 'list');
    input?.setAttribute('aria-controls', 'searchPaletteResults');
    input?.setAttribute('aria-expanded', 'false');
    results?.setAttribute('role', 'listbox');
    results?.setAttribute('aria-label', 'Resultados da busca global');

    input?.addEventListener('input', event => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { void perform(event.target.value); }, 180);
    });
    input?.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (!document.getElementById('globalSearchPalette')?.classList.contains('hidden')) {
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
    requestSequence += 1;
    document.getElementById('globalSearchPalette')?.classList.add('hidden');
    const input = document.getElementById('globalSearch');
    input?.setAttribute('aria-expanded', 'false');
    input?.setAttribute('aria-busy', 'false');
    input?.removeAttribute('aria-activedescendant');
    setActive(-1);
  }

  function getItems() {
    return [...(document.getElementById('searchPaletteResults')?.querySelectorAll('.search-palette-item') || [])];
  }

  function setActive(index) {
    const items = getItems();
    activeIndex = items.length && index >= 0 ? Math.min(index, items.length - 1) : -1;
    items.forEach((item, itemIndex) => {
      const selected = itemIndex === activeIndex;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-selected', selected ? 'true' : 'false');
    });
    const input = document.getElementById('globalSearch');
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
    const input = document.getElementById('globalSearch');
    const selection = { target: item.dataset.searchTarget, id: item.dataset.searchId };
    close();
    if (input) input.value = '';
    onSelect?.(selection);
  }

  function prepareResults() {
    const input = document.getElementById('globalSearch');
    const items = getItems();
    items.forEach((item, index) => {
      item.id = `global-search-option-${index}`;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', 'false');
      item.setAttribute('tabindex', '-1');
    });
    activeIndex = -1;
    input?.setAttribute('aria-expanded', 'true');
    input?.removeAttribute('aria-activedescendant');
  }

  function localResults(state, query) {
    const needle = normalizeText(query);
    const processes = state.processes || [];
    const processFor = record => {
      const processId = record?.processId || (record?.ownerType === 'process' ? record.ownerId : '');
      const byId = processId ? processes.find(process => String(process.id || '') === String(processId)) : null;
      const processNumber = String(record?.process || record?.processNumber || '').replace(/\D/g, '');
      return byId || (processNumber ? processes.find(process => String(process.number || process.protocol || '').replace(/\D/g, '') === processNumber) : null);
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
      ...matches(state.tasks, 'task', 'task', item => item.title || 'Tarefa', item => processContext(item) || item.client || item.process || `Prazo: ${formatDate(item.deadline)}`, item => `${item.title} ${item.description} ${item.client} ${item.process} ${item.responsible} ${processContext(item)}`, 'Tarefa'),
      ...matches(state.intimations, 'publication', 'intimation', item => item.title || 'Publicação', item => processContext(item) || item.process || item.court || 'DataJud', item => `${item.title} ${item.text} ${item.client} ${item.process} ${item.court} ${processContext(item)}`, 'Publicação'),
      ...matches((state.documents || []).filter(item => !item.deletedAt), 'document', 'document', item => item.name || item.originalName || 'Documento', item => `${processContext(item)} · ${item.documentType || 'Documento'} · ${item.documentDate || ''}`, item => `${item.name} ${item.originalName} ${item.documentType} ${item.documentDate} ${item.metadata?.origin} ${(item.metadata?.tags || []).join(' ')} ${item.metadata?.summary} ${item.metadata?.context} ${(item.metadata?.entities || []).map(entity => `${entity?.type || ''} ${entity?.label || ''} ${entity?.identifier || ''}`).join(' ')} ${processContext(item)}`, 'Metadata documental'),
      ...matches(state.agenda, 'appointment', 'agenda', item => item.title || 'Compromisso', item => processContext(item) || item.client || item.date || 'Agenda', item => `${item.title} ${item.notes} ${item.description} ${item.date} ${item.time} ${processContext(item)}`, 'Agenda'),
      ...(state.intimations || []).flatMap(publication => (publication.workNotes || []).filter(note => normalizeText(`${note.text} ${publication.title} ${processContext(publication)}`).includes(needle)).map(note => ({ entityType: 'note', target: 'intimation', id: publication.id, title: 'Nota interna da publicação', context: `${processContext(publication)} · ${publication.title || ''}`, snippet: note.text || '', matchedField: 'Nota interna', relevance: 0 }))),
      ...processes.flatMap(process => (process.movements || []).filter(movement => normalizeText(`${movement.description} ${movement.text} ${movement.name} ${process.number} ${process.client}`).includes(needle)).map(movement => ({ entityType: 'movement', target: 'process', id: process.id, title: movement.description || movement.text || movement.name || 'Movimentação processual', context: `${process.number || ''} · ${process.client || ''}`, snippet: movement.detail || movement.complement || '', matchedField: 'Movimentação judicial', relevance: 0 }))),
      ...processes.flatMap(process => (process.expenses || []).filter(expense => normalizeText(`${expense.description} ${expense.title} ${expense.status} ${expense.amount} ${process.number} ${process.client}`).includes(needle)).map(expense => ({ entityType: 'financial', target: 'financial', id: process.id, title: expense.description || expense.title || 'Despesa processual', context: `${process.number || ''} · ${process.client || ''}`, snippet: String(expense.amount || ''), matchedField: 'Lançamento financeiro', relevance: 0 }))),
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
    return [...merged.values()].sort((left, right) => Number(right.relevance || 0) - Number(left.relevance || 0)).slice(0, 30);
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

  function renderResults(results, query) {
    const palette = document.getElementById('globalSearchPalette');
    const resultsEl = document.getElementById('searchPaletteResults');
    if (!palette || !resultsEl) return;
    if (!results.length) {
      resultsEl.innerHTML = `<div class="search-palette-empty">Nenhum resultado localizado para <strong>"${escapeHtml(query)}"</strong>.</div>`;
      palette.classList.remove('hidden');
      prepareResults();
      return;
    }
    const groups = [];
    for (const [entityType, config] of Object.entries(GROUPS)) {
      const groupResults = results.filter(result => result.entityType === entityType);
      if (!groupResults.length) continue;
      groups.push(renderGroup(config.label, groupResults, result => {
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
    prepareResults();
  }

  async function perform(query) {
    const trimmed = String(query || '').trim();
    const palette = document.getElementById('globalSearchPalette');
    const resultsEl = document.getElementById('searchPaletteResults');
    const input = document.getElementById('globalSearch');
    if (!palette || !resultsEl) return [];
    const requestId = ++requestSequence;
    if (!trimmed || trimmed.length < 2) {
      palette.classList.add('hidden');
      resultsEl.innerHTML = '';
      input?.setAttribute('aria-expanded', 'false');
      input?.setAttribute('aria-busy', 'false');
      setActive(-1);
      return [];
    }

    const local = localResults(getState() || {}, trimmed);
    renderResults(local, trimmed);
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

  function renderGroup(title, items, renderItem) {
    return `
      <div class="search-palette-group">
        <div class="search-palette-group-title"><span>${escapeHtml(title)} (${items.length})</span></div>
        ${items.map(renderItem).join('')}
      </div>`;
  }

  return Object.freeze({ init, close, perform, moveActive });
}
