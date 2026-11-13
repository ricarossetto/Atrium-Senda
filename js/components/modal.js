// Campo de data só aceita aaaa-mm-dd: data com hora abria em branco e salvar apagava o valor.
export function dateInputValue(value) {
  const text = String(value ?? '').trim();
  if (!text || /^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  const pad = number => String(number).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

import { installPanelSizeToggle, resetPanelSize, syncPanelSizeControl } from './panel-size.js?v=3.1.0';
import { attachFieldSuggest, enhanceSelect } from './field-suggest.js?v=3.1.0';
import { fieldContextRule } from '../core/field-context.js?v=3.1.0';

const SELF_MANAGED_TYPES = new Set(['combobox', 'model-combobox', 'textarea', 'select', 'password', 'date', 'time', 'number', 'email', 'tel', 'url', 'checkbox', 'file', 'hidden']);
// Menu curto se escolhe de olho; a partir daqui, digitar é mais rápido que rolar.
const SEARCHABLE_SELECT_MIN_OPTIONS = 6;

function installFieldContext(root, fields, getFieldOptions) {
  for (const field of fields) {
    const input = root.querySelector(`[id="field-${CSS.escape(field.name)}"]`);
    if (!input) continue;
    if (input.tagName === 'SELECT') {
      if (input.options.length >= SEARCHABLE_SELECT_MIN_OPTIONS) enhanceSelect(input);
      continue;
    }
    if (input.tagName !== 'INPUT' || SELF_MANAGED_TYPES.has(field.type)) continue;
    const own = Array.isArray(field.suggestions) && field.suggestions.length ? field.suggestions : null;
    const rule = fieldContextRule(field.name);
    if (!own && !rule) continue;
    attachFieldSuggest(input, {
      multiple: Boolean(rule?.multiple),
      getOptions: () => own || getFieldOptions?.(field.name) || []
    });
  }
}

// Modos apresentados como painel lateral: recebem o controle de tamanho. Modais
// centrados e o fluxo de reautenticação permanecem exatamente como estão.
const LATERAL_MODAL_MODES = Object.freeze([
  'task', 'agenda', 'contact', 'lead', 'prompt', 'term', 'source', 'datajud',
  'configuration', 'feedback', 'publicationWorkAction'
]);

export function createModal({ escapeHtml, onModeChange, getFieldOptions, onFieldContextOpen } = {}) {
  let initialized = false;
  let lastFocusedElement = null;
  let previousBodyOverflow = '';
  let initialFormSnapshot = '';
  let discardDialog = null;

  const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function init() {
    if (initialized) return;
    initialized = true;
    document.getElementById('modalClose')?.addEventListener('click', requestClose);
    document.getElementById('modalCancel')?.addEventListener('click', requestClose);
    document.getElementById('modalBackdrop')?.addEventListener('click', event => {
      if (event.target === document.getElementById('modalBackdrop')) requestClose();
    });
    document.getElementById('modalBackdrop')?.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        requestClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const modal = document.querySelector('#modalBackdrop .modal');
      const focusable = [...(modal?.querySelectorAll(focusableSelector) || [])]
        .filter(element => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    document.addEventListener('click', event => {
      document.querySelectorAll('[data-model-combobox-field]').forEach(field => {
        if (!field.contains(event.target)) closeModelCombobox(field);
      });
    });
    installPanelSizeToggle(modalPanel());
  }

  function modalPanel() {
    return document.querySelector('#modalBackdrop .modal');
  }

  function syncSizeControl(mode) {
    const button = document.getElementById('modalSizeToggle');
    if (!button) return;
    const lateral = LATERAL_MODAL_MODES.includes(mode);
    button.hidden = !lateral;
    if (!lateral) resetPanelSize(modalPanel());
    else syncPanelSizeControl(modalPanel());
  }

  function open(mode, title, eyebrow, fields, defaults = {}, topHtml = '') {
    lastFocusedElement = document.activeElement;
    previousBodyOverflow = document.body.style.overflow;
    onModeChange?.({ mode, defaults });
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalEyebrow').textContent = eyebrow;
    const renderField = field => {
      const value = defaults[field.name] ?? field.value ?? '';
      if (field.type === 'date') field = { ...field, value: dateInputValue(field.value) };
      const inputType = ['text', 'password', 'email', 'tel', 'number', 'date', 'time', 'url', 'search'].includes(field.type) ? field.type : 'text';
      if (field.type === 'combobox') {
        const identityName = field.identityName || `${field.name}Id`;
        const identityValue = defaults[identityName] ?? '';
        const listId = `field-${escapeHtml(field.name)}-listbox`;
        const options = (field.suggestions || []).map((option, index) => `<button type="button" role="option" id="${listId}-option-${index}" data-combobox-option data-value="${escapeHtml(option.value ?? '')}" data-identity="${escapeHtml(option.id ?? '')}" aria-selected="${String(option.id ?? '') === String(identityValue)}"${option.avatar ? ' class="has-avatar"' : ''}>${option.avatar ? `<img class="modal-combobox-avatar" src="${escapeHtml(option.avatar)}" alt="">` : ''}<strong>${escapeHtml(option.value ?? '')}</strong>${option.label ? `<small>${escapeHtml(option.label)}</small>` : ''}</button>`).join('');
        return `<div class="field ${field.full ? 'full' : ''}" data-modal-combobox-field><label for="field-${escapeHtml(field.name)}">${escapeHtml(field.label)}</label><div class="modal-combobox"><input id="field-${escapeHtml(field.name)}" name="${escapeHtml(field.name)}" type="text" value="${escapeHtml(value)}" ${field.required ? 'required' : ''} ${field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : ''} role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${listId}" data-modal-combobox><input type="hidden" name="${escapeHtml(identityName)}" value="${escapeHtml(identityValue)}" data-combobox-identity><div class="modal-combobox-listbox hidden" id="${listId}" role="listbox">${options || '<p>Nenhum contato cadastrado.</p>'}</div></div>${field.note ? `<small class="field-note">${escapeHtml(field.note)}</small>` : ''}</div>`;
      }
      if (field.type === 'model-combobox') {
        const listId = `field-${escapeHtml(field.name)}-listbox`;
        const groups = [];
        for (const option of (field.options || [])) {
          const label = String(option.group || '');
          let group = groups.find(item => item.label === label);
          if (!group) { group = { label, options: [] }; groups.push(group); }
          group.options.push(option);
        }
        let optionIndex = 0;
        const groupsHtml = groups.map(group => `<div class="modal-combobox-group" role="group" aria-label="${escapeHtml(group.label || field.label)}" data-combobox-group>${group.label ? `<p class="modal-combobox-group-title">${escapeHtml(group.label)}</p>` : ''}${group.options.map(option => {
          const id = `${listId}-option-${optionIndex++}`;
          return `<button type="button" role="option" id="${id}" data-combobox-option data-value="${escapeHtml(option.value ?? '')}" aria-selected="false"><strong>${escapeHtml(option.value ?? '')}</strong>${option.label ? `<small>${escapeHtml(option.label)}</small>` : ''}</button>`;
        }).join('')}</div>`).join('');
        const emptyHtml = `<p class="modal-combobox-empty hidden" data-combobox-empty>${escapeHtml(field.emptyLabel || 'Nenhum item cadastrado.')}</p>`;
        const createAction = field.createAction ? `<button type="button" role="option" id="${listId}-create" class="modal-combobox-create hidden" data-combobox-create data-combobox-action="${escapeHtml(field.createAction.id || 'create')}"><strong>${escapeHtml(field.createAction.label || 'Criar')} «<span data-combobox-create-term></span>»</strong></button>` : '';
        return `<div class="field ${field.full ? 'full' : ''}" data-modal-combobox-field data-model-combobox-field><label for="field-${escapeHtml(field.name)}">${escapeHtml(field.label)}</label><div class="modal-combobox"><input id="field-${escapeHtml(field.name)}" name="${escapeHtml(field.name)}" type="text" value="${escapeHtml(value)}" ${field.required ? 'required' : ''} ${field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : ''} role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${listId}" data-modal-combobox><div class="modal-combobox-listbox hidden" id="${listId}" role="listbox" aria-label="${escapeHtml(field.label)}">${groupsHtml || emptyHtml}${createAction}</div></div>${field.note ? `<small class="field-note">${escapeHtml(field.note)}</small>` : ''}${field.inlineCreate ? '<div class="task-model-create hidden" data-task-model-create></div>' : ''}</div>`;
      }
      if (field.type === 'textarea') return `<div class="field ${field.full ? 'full' : ''}"><label for="field-${escapeHtml(field.name)}">${escapeHtml(field.label)}</label><textarea id="field-${escapeHtml(field.name)}" name="${escapeHtml(field.name)}" ${field.required ? 'required' : ''}>${escapeHtml(value)}</textarea>${field.note ? `<small class="field-note">${escapeHtml(field.note)}</small>` : ''}</div>`;
      if (field.type === 'select') return `<div class="field ${field.full ? 'full' : ''}"><label for="field-${escapeHtml(field.name)}">${escapeHtml(field.label)}</label><select id="field-${escapeHtml(field.name)}" name="${escapeHtml(field.name)}" ${field.required ? 'required' : ''}>${field.options.map(option => `<option value="${escapeHtml(option.value)}" ${String(value) === String(option.value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></div>`;
      const suggestions = '';
      const list = '';
      return `<div class="field ${field.full ? 'full' : ''}"><label for="field-${escapeHtml(field.name)}">${escapeHtml(field.label)}</label><input id="field-${escapeHtml(field.name)}" name="${escapeHtml(field.name)}" type="${inputType}" value="${escapeHtml(value)}" ${field.required ? 'required' : ''} ${field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : ''} ${list}>${suggestions}${field.note ? `<small class="field-note">${escapeHtml(field.note)}</small>` : ''}</div>`;
    };
    const isV2 = document.documentElement.dataset.ui === 'v2';
    const fieldsHtml = mode === 'process' && isV2
      ? renderProcessSections(fields, renderField, Boolean(defaults.id))
      : mode === 'task' && isV2
        ? renderTaskSections(fields, renderField)
        : mode === 'agenda' && isV2
          ? renderAgendaSections(fields, renderField)
        : mode === 'contact' && isV2
          ? renderContactSections(fields, renderField)
        : mode === 'lead' && isV2
          ? renderLeadSections(fields, renderField)
        : mode === 'prompt' && isV2
          ? renderPromptSections(fields, renderField)
        : ['term', 'source', 'datajud'].includes(mode) && isV2
          ? renderMonitoringSections(mode, fields, renderField)
      : `<div class="form-grid">${fields.map(renderField).join('')}</div>`;
    document.getElementById('modalFields').innerHTML = `${topHtml}${fieldsHtml}`;
    installModalComboboxes(document.getElementById('modalFields'));
    onFieldContextOpen?.();
    installFieldContext(document.getElementById('modalFields'), fields, getFieldOptions);
    document.querySelector('#modalForm footer .button.gold').textContent = /^(Editar|Detalhes)/.test(title) ? 'Salvar alterações' : 'Salvar';
    document.getElementById('modalBackdrop').dataset.modalMode = mode;
    document.getElementById('modalBackdrop').classList.remove('hidden');
    syncSizeControl(mode);
    initialFormSnapshot = formSnapshot();
    if (['task', 'agenda', 'contact', 'lead', 'prompt', 'term', 'source', 'datajud', 'configuration', 'feedback', 'publicationWorkAction', 'processMovement', 'reauth'].includes(mode) && isV2) document.getElementById('appShell')?.setAttribute('inert', '');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      const modalFields = document.getElementById('modalFields');
      if (modalFields && (!document.activeElement || !modalFields.contains(document.activeElement))) {
        modalFields.querySelector('input:not([type="password"]):not([type="hidden"]), textarea')?.focus();
      }
    }, 20);
  }

  function formSnapshot() {
    const form = document.getElementById('modalForm');
    if (!form) return '';
    return JSON.stringify([...form.querySelectorAll('input, textarea, select, [contenteditable="true"]')].map(element => ({
      name: element.name || element.id || '',
      value: element.isContentEditable ? element.textContent : element.value,
      checked: 'checked' in element ? element.checked : undefined
    })));
  }

  function hasUnsavedChanges() {
    return Boolean(initialFormSnapshot && initialFormSnapshot !== formSnapshot());
  }

  function requestClose() {
    const backdrop = document.getElementById('modalBackdrop');
    if (!backdrop || backdrop.classList.contains('hidden')) return false;
    if (hasUnsavedChanges()) {
      if (discardDialog) return false;
      const focused = document.activeElement;
      discardDialog = document.createElement('dialog');
      discardDialog.className = 'unsaved-changes-dialog';
      discardDialog.setAttribute('aria-labelledby', 'unsavedChangesTitle');
      discardDialog.setAttribute('aria-describedby', 'unsavedChangesDescription');
      discardDialog.innerHTML = '<h2 id="unsavedChangesTitle">Descartar alterações?</h2><p id="unsavedChangesDescription">Há alterações não salvas. Se você sair agora, elas serão perdidas.</p><div class="unsaved-changes-actions"><button type="button" class="button ghost" data-keep-editing autofocus>Continuar editando</button><button type="button" class="button gold" data-discard-changes>Descartar alterações</button></div>';
      const dismiss = () => {
        discardDialog?.close();
        discardDialog?.remove();
        discardDialog = null;
        focused?.focus();
      };
      discardDialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
      discardDialog.addEventListener('keydown', event => event.stopPropagation());
      discardDialog.querySelector('[data-keep-editing]').addEventListener('click', dismiss);
      discardDialog.querySelector('[data-discard-changes]').addEventListener('click', () => { dismiss(); close(); });
      document.body.appendChild(discardDialog);
      discardDialog.showModal();
      return false;
    }
    close();
    return true;
  }

  function close() {
    discardDialog?.close();
    discardDialog?.remove();
    discardDialog = null;
    const backdrop = document.getElementById('modalBackdrop');
    const wasOpen = backdrop && !backdrop.classList.contains('hidden');
    backdrop?.classList.add('hidden');
    backdrop?.removeAttribute('data-modal-mode');
    resetPanelSize(modalPanel());
    document.getElementById('appShell')?.removeAttribute('inert');
    onModeChange?.(null);
    document.getElementById('modalForm').reset();
    initialFormSnapshot = '';
    if (wasOpen) {
      document.body.style.overflow = previousBodyOverflow;
      if (lastFocusedElement?.isConnected && typeof lastFocusedElement.focus === 'function') lastFocusedElement.focus();
    }
  }

  return Object.freeze({ init, open, close, requestClose, hasUnsavedChanges });
}

export function installModalComboboxes(root) {
  root?.querySelectorAll('[data-modal-combobox-field]').forEach(field => {
    if (field.hasAttribute('data-model-combobox-field')) {
      installModelCombobox(field);
      return;
    }
    const input = field.querySelector('[data-modal-combobox]');
    const identity = field.querySelector('[data-combobox-identity]');
    const listbox = field.querySelector('[role="listbox"]');
    const options = [...field.querySelectorAll('[data-combobox-option]')];
    if (!input || !identity || !listbox) return;
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const setOpen = open => {
      listbox.classList.toggle('hidden', !open);
      input.setAttribute('aria-expanded', String(open));
    };
    const filter = () => {
      const query = normalize(input.value);
      let visible = 0;
      options.forEach(option => {
        const match = !query || normalize(option.textContent).includes(query);
        option.classList.toggle('hidden', !match);
        if (match) visible++;
      });
      setOpen(Boolean(options.length && visible));
    };
    const choose = option => {
      input.value = option.dataset.value || '';
      identity.value = option.dataset.identity || '';
      options.forEach(item => item.setAttribute('aria-selected', String(item === option)));
      setOpen(false);
      field.dispatchEvent(new CustomEvent('atrium:combobox-select', {
        bubbles: true,
        detail: {
          name: input.name || '',
          value: input.value,
          identity: identity.value
        }
      }));
      input.focus();
    };
    // Opening is intentional: automatic modal focus must not reopen suggestions.
    input.addEventListener('click', filter);
    input.addEventListener('input', () => { identity.value = ''; filter(); });
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape' && input.getAttribute('aria-expanded') === 'true') { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
      if (event.key === 'Enter' && input.getAttribute('aria-expanded') === 'true') {
        event.preventDefault();
        const first = options.find(option => !option.classList.contains('hidden'));
        if (first) choose(first);
        return;
      }
      if (event.key !== 'ArrowDown') return;
      filter();
      const first = options.find(option => !option.classList.contains('hidden'));
      if (first) { event.preventDefault(); first.focus(); }
    });
    options.forEach((option, index) => {
      option.addEventListener('mousedown', event => event.preventDefault());
      option.addEventListener('click', () => choose(option));
      option.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(option); return; }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); input.focus(); return; }
        if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
        event.preventDefault();
        const visible = options.filter(item => !item.classList.contains('hidden'));
        const current = visible.indexOf(option);
        visible[(current + (event.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length]?.focus();
      });
    });
    field.addEventListener('focusout', event => {
      if (!field.contains(event.relatedTarget)) setOpen(false);
    });
  });
}

function closeModelCombobox(field) {
  const input = field?.querySelector('[data-modal-combobox]');
  const listbox = field?.querySelector('[role="listbox"]');
  listbox?.classList.add('hidden');
  input?.setAttribute('aria-expanded', 'false');
  input?.removeAttribute('aria-activedescendant');
  field?.querySelectorAll('.active').forEach(item => item.classList.remove('active'));
}

function installModelCombobox(field) {
  const input = field.querySelector('[data-modal-combobox]');
  const listbox = field.querySelector('[role="listbox"]');
  if (!input || !listbox) return;
  const createOption = field.querySelector('[data-combobox-create]');
  const emptyNotice = field.querySelector('[data-combobox-empty]');
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  let activeIndex = -1;
  const allOptions = () => [...listbox.querySelectorAll('[data-combobox-option]')];
  const visibleOptions = () => allOptions().filter(option => !option.classList.contains('hidden'));
  const items = () => {
    const list = visibleOptions();
    if (createOption && !createOption.classList.contains('hidden')) list.push(createOption);
    return list;
  };
  function setActive(index) {
    const list = items();
    activeIndex = index >= 0 && list.length ? Math.min(index, list.length - 1) : -1;
    list.forEach((item, itemIndex) => {
      const selected = itemIndex === activeIndex;
      item.classList.toggle('active', selected);
      if (item.hasAttribute('data-combobox-option')) item.setAttribute('aria-selected', String(selected));
    });
    if (activeIndex >= 0) {
      input.setAttribute('aria-activedescendant', list[activeIndex].id);
      list[activeIndex].scrollIntoView?.({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }
  function setOpen(open) {
    listbox.classList.toggle('hidden', !open);
    input.setAttribute('aria-expanded', String(open));
    if (!open) setActive(-1);
  }
  function moveActive(direction) {
    const list = items();
    if (!list.length) return;
    const nextIndex = activeIndex < 0
      ? (direction > 0 ? 0 : list.length - 1)
      : (activeIndex + direction + list.length) % list.length;
    setActive(nextIndex);
  }
  function filter() {
    const query = normalize(input.value);
    let visible = 0;
    for (const option of allOptions()) {
      const match = !query || normalize(option.textContent).includes(query);
      option.classList.toggle('hidden', !match);
      if (match) visible++;
    }
    for (const group of listbox.querySelectorAll('[data-combobox-group]')) {
      group.classList.toggle('hidden', !group.querySelector('[data-combobox-option]:not(.hidden)'));
    }
    const showCreate = Boolean(createOption && query && visible === 0);
    createOption?.classList.toggle('hidden', !showCreate);
    if (createOption && showCreate) {
      const term = createOption.querySelector('[data-combobox-create-term]');
      if (term) term.textContent = String(input.value).trim();
    }
    emptyNotice?.classList.toggle('hidden', visible > 0 || showCreate);
    setActive(-1);
    setOpen(Boolean(visible || showCreate));
  }
  function choose(item) {
    if (!item) return;
    if (item.hasAttribute('data-combobox-action')) {
      const detail = { name: input.name || '', value: input.value, identity: '', action: item.getAttribute('data-combobox-action'), query: String(input.value).trim() };
      setOpen(false);
      field.dispatchEvent(new CustomEvent('atrium:combobox-select', { bubbles: true, detail }));
      return;
    }
    input.value = item.getAttribute('data-value') || '';
    setOpen(false);
    field.dispatchEvent(new CustomEvent('atrium:combobox-select', {
      bubbles: true,
      detail: { name: input.name || '', value: input.value, identity: '' }
    }));
    input.focus();
  }
  // Opening is intentional: automatic modal focus must not reopen suggestions.
  input.addEventListener('click', filter);
  input.addEventListener('input', () => { setActive(-1); filter(); });
  input.addEventListener('keydown', event => {
    const open = input.getAttribute('aria-expanded') === 'true';
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!open) filter();
      event.preventDefault();
      moveActive(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Enter' && open) {
      const list = items();
      if (!list.length) return;
      event.preventDefault();
      choose(list[activeIndex >= 0 ? activeIndex : 0]);
    }
  });
  listbox.addEventListener('mousedown', event => event.preventDefault());
  listbox.addEventListener('click', event => {
    const item = event.target.closest('[data-combobox-option], [data-combobox-create]');
    if (item && listbox.contains(item)) choose(item);
  });
  field.addEventListener('focusout', event => {
    if (!field.contains(event.relatedTarget)) setOpen(false);
  });
}

const PROCESS_FIELD_SECTIONS = Object.freeze({
  number: 'Essencial', oldNumber: 'Identificação', originNumbers: 'Identificação', nb: 'Identificação', protocol: 'Identificação', caseFolder: 'Identificação',
  client: 'Essencial', clientPosition: 'Essencial', opposingParty: 'Essencial',
  actionGroup: 'Classificação', actionType: 'Essencial', judicialPhase: 'Classificação', risk: 'Classificação', stage: 'Classificação',
  court: 'Órgão e responsabilidade', county: 'Órgão e responsabilidade', courtUnit: 'Órgão e responsabilidade', responsible: 'Órgão e responsabilidade',
  registeredAt: 'Movimentação', lastMovementAt: 'Movimentação', lastMovement: 'Movimentação',
  feeType: 'Honorários', feePercentage: 'Honorários', feeAmount: 'Honorários', feeMonthly: 'Honorários', feeStatus: 'Honorários', feeNotes: 'Honorários',
  requisitionType: 'Requisições', requisitionAmount: 'Requisições', requisitionBank: 'Requisições', requisitionStatus: 'Requisições',
  secrecy: 'Privacidade e acompanhamento', monitoring: 'Privacidade e acompanhamento', notes: 'Privacidade e acompanhamento'
});

function renderProcessSections(fields, renderField, editing = false) {
  const sections = new Map();
  for (const field of fields) {
    const section = PROCESS_FIELD_SECTIONS[field.name] || 'Outros dados';
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section).push(field);
  }
  const renderSection = ([section, sectionFields]) => `
    <fieldset class="process-form-section">
      <legend>${section}</legend>
      <div class="form-grid">${sectionFields.map(renderField).join('')}</div>
    </fieldset>`;
  const essential = sections.get('Essencial') || [];
  sections.delete('Essencial');
  return `<div class="process-form-sections">${essential.length ? renderSection(['Essencial', essential]) : ''}
    <details class="process-form-more"${editing ? ' open' : ''}><summary class="button ghost">Mais dados do processo</summary>
      <div class="process-form-sections">${[...sections.entries()].map(renderSection).join('')}</div>
    </details></div>`;
}

const TASK_FIELD_SECTIONS = Object.freeze({
  title: 'Identificação', taskDefinition: 'Identificação', description: 'Identificação',
  process: 'Vínculos', client: 'Vínculos', actionType: 'Vínculos', protocol: 'Vínculos',
  fatalDeadline: 'Prazos e agenda', deadline: 'Prazos e agenda', date: 'Prazos e agenda', time: 'Prazos e agenda',
  responsible: 'Responsabilidade', responsibles: 'Responsabilidade', status: 'Responsabilidade', priority: 'Responsabilidade', points: 'Responsabilidade',
  addMinutes: 'Tempo apontado', timeDescription: 'Tempo apontado'
});

function renderTaskSections(fields, renderField) {
  const sections = new Map();
  for (const field of fields) {
    const section = TASK_FIELD_SECTIONS[field.name] || 'Outros dados';
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section).push(field);
  }
  return `<div class="task-form-sections">${[...sections.entries()].map(([section, sectionFields]) => `
    <fieldset class="task-form-section">
      <legend>${section}</legend>
      <div class="form-grid">${sectionFields.map(renderField).join('')}</div>
    </fieldset>`).join('')}</div>`;
}

const AGENDA_FIELD_SECTIONS = Object.freeze({
  title: 'Identificação',
  date: 'Quando', time: 'Quando',
  client: 'Vínculos', process: 'Vínculos',
  location: 'Local e origem',
  source: 'Local e origem',
  description: 'Observações'
});

function renderAgendaSections(fields, renderField) {
  const sections = new Map();
  for (const field of fields) {
    const section = AGENDA_FIELD_SECTIONS[field.name] || 'Outros dados';
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section).push(field);
  }
  return `<div class="agenda-form-sections">${[...sections.entries()].map(([section, sectionFields]) => `
    <fieldset class="agenda-form-section">
      <legend>${section}</legend>
      <div class="form-grid">${sectionFields.map(renderField).join('')}</div>
    </fieldset>`).join('')}</div>`;
}

const CONTACT_FIELD_SECTIONS = Object.freeze({
  name: 'Identificação', contactRole: 'Identificação', document: 'Identificação', rg: 'Identificação',
  birthDate: 'Identificação', profession: 'Identificação', maritalStatus: 'Identificação',
  mobile: 'Contato', phone: 'Contato', email: 'Contato',
  address: 'Endereço', district: 'Endereço', city: 'Endereço', state: 'Endereço', zip: 'Endereço',
  leadOrigin: 'Relacionamento', origin: 'Relacionamento',
  notes: 'Anotações'
});

const CONTACT_SECTION_ORDER = Object.freeze(['Identificação', 'Contato', 'Endereço', 'Relacionamento', 'Anotações']);

function renderContactSections(fields, renderField) {
  const sections = new Map(CONTACT_SECTION_ORDER.map(section => [section, []]));
  for (const field of fields) {
    const section = CONTACT_FIELD_SECTIONS[field.name] || 'Anotações';
    sections.get(section).push(field);
  }
  return `<div class="contact-form-sections">${[...sections.entries()].filter(([, sectionFields]) => sectionFields.length).map(([section, sectionFields]) => `
    <fieldset class="contact-form-section">
      <legend>${section}</legend>
      <div class="form-grid">${sectionFields.map(renderField).join('')}</div>
    </fieldset>`).join('')}</div>`;
}

const LEAD_FIELD_SECTIONS = Object.freeze({
  client: 'Interessado', serviceType: 'Demanda jurídica',
  status: 'Andamento', responsible: 'Andamento',
  origin: 'Origem', estimatedFee: 'Estimativa', notes: 'Relato'
});

const LEAD_SECTION_ORDER = Object.freeze(['Interessado', 'Demanda jurídica', 'Andamento', 'Origem', 'Estimativa', 'Relato']);

function renderLeadSections(fields, renderField) {
  const sections = new Map(LEAD_SECTION_ORDER.map(section => [section, []]));
  for (const field of fields) {
    const section = LEAD_FIELD_SECTIONS[field.name] || 'Relato';
    sections.get(section).push(field);
  }
  return `<div class="lead-form-sections">${[...sections.entries()].filter(([, sectionFields]) => sectionFields.length).map(([section, sectionFields]) => `
    <fieldset class="lead-form-section">
      <legend>${section}</legend>
      <div class="form-grid">${sectionFields.map(renderField).join('')}</div>
    </fieldset>`).join('')}</div>`;
}

const PROMPT_FIELD_SECTIONS = Object.freeze({
  title: 'Identidade', category: 'Identidade', type: 'Identidade',
  tags: 'Descobribilidade', description: 'Descobribilidade',
  prompt: 'Instrução'
});

const PROMPT_SECTION_ORDER = Object.freeze(['Identidade', 'Descobribilidade', 'Instrução']);

function renderPromptSections(fields, renderField) {
  const sections = new Map(PROMPT_SECTION_ORDER.map(section => [section, []]));
  for (const field of fields) {
    const section = PROMPT_FIELD_SECTIONS[field.name] || 'Instrução';
    sections.get(section).push(field);
  }
  return `<div class="prompt-form-sections">${[...sections.entries()].filter(([, sectionFields]) => sectionFields.length).map(([section, sectionFields]) => `
    <fieldset class="prompt-form-section">
      <legend>${section}</legend>
      <div class="form-grid">${sectionFields.map(renderField).join('')}</div>
    </fieldset>`).join('')}</div>`;
}

const MONITORING_SECTION_ORDER = Object.freeze({
  term: Object.freeze(['Identidade', 'OAB', 'Documento']),
  source: Object.freeze(['Fonte', 'Estado', 'Detalhes']),
  datajud: Object.freeze(['Acesso', 'Comportamento', 'Abrangência'])
});

const MONITORING_FIELD_SECTIONS = Object.freeze({
  term: Object.freeze({ name: 'Identidade', type: 'Identidade', oabNumber: 'OAB', oabUf: 'OAB', document: 'Documento' }),
  source: Object.freeze({ name: 'Fonte', short: 'Fonte', method: 'Fonte', status: 'Estado', detail: 'Detalhes' }),
  datajud: Object.freeze({ apiKey: 'Acesso', autoSync: 'Comportamento', tribunals: 'Abrangência' })
});

function renderMonitoringSections(mode, fields, renderField) {
  const order = MONITORING_SECTION_ORDER[mode];
  const mapping = MONITORING_FIELD_SECTIONS[mode];
  const sections = new Map(order.map(section => [section, []]));
  for (const field of fields) sections.get(mapping[field.name] || order.at(-1)).push(field);
  return `<div class="monitoring-form-sections" data-monitoring-form="${mode}">${[...sections.entries()].filter(([, sectionFields]) => sectionFields.length).map(([section, sectionFields]) => `
    <fieldset class="monitoring-form-section">
      <legend>${section}</legend>
      <div class="form-grid">${sectionFields.map(renderField).join('')}</div>
    </fieldset>`).join('')}</div>`;
}
