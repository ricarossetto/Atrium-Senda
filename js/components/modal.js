export function createModal({ escapeHtml, onModeChange } = {}) {
  let initialized = false;
  let lastFocusedElement = null;
  let previousBodyOverflow = '';

  const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function init() {
    if (initialized) return;
    initialized = true;
    document.getElementById('modalClose')?.addEventListener('click', close);
    document.getElementById('modalCancel')?.addEventListener('click', close);
    document.getElementById('modalBackdrop')?.addEventListener('click', event => {
      if (event.target === document.getElementById('modalBackdrop')) close();
    });
    document.getElementById('modalBackdrop')?.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
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
  }

  function open(mode, title, eyebrow, fields, defaults = {}, topHtml = '') {
    lastFocusedElement = document.activeElement;
    previousBodyOverflow = document.body.style.overflow;
    onModeChange?.({ mode, defaults });
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalEyebrow').textContent = eyebrow;
    const renderField = field => {
      const value = defaults[field.name] ?? field.value ?? '';
      if (field.type === 'textarea') return `<div class="field ${field.full ? 'full' : ''}"><label for="field-${field.name}">${field.label}</label><textarea id="field-${field.name}" name="${field.name}" ${field.required ? 'required' : ''}>${escapeHtml(value)}</textarea>${field.note ? `<small class="field-note">${field.note}</small>` : ''}</div>`;
      if (field.type === 'select') return `<div class="field ${field.full ? 'full' : ''}"><label for="field-${field.name}">${field.label}</label><select id="field-${field.name}" name="${field.name}">${field.options.map(option => `<option value="${escapeHtml(option.value)}" ${String(value) === String(option.value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></div>`;
      const suggestions = Array.isArray(field.suggestions) && field.suggestions.length
        ? `<datalist id="field-${field.name}-suggestions">${field.suggestions.map(option => `<option value="${escapeHtml(option.value ?? option)}">${escapeHtml(option.label || '')}</option>`).join('')}</datalist>`
        : '';
      const list = suggestions ? `list="field-${field.name}-suggestions" autocomplete="off" role="combobox" aria-autocomplete="list"` : '';
      return `<div class="field ${field.full ? 'full' : ''}"><label for="field-${field.name}">${field.label}</label><input id="field-${field.name}" name="${field.name}" type="${field.type || 'text'}" value="${escapeHtml(value)}" ${field.required ? 'required' : ''} ${field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : ''} ${list}>${suggestions}${field.note ? `<small class="field-note">${field.note}</small>` : ''}</div>`;
    };
    const isV2 = document.documentElement.dataset.ui === 'v2';
    const fieldsHtml = mode === 'process' && isV2
      ? renderProcessSections(fields, renderField)
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
    document.querySelector('#modalForm footer .button.gold').textContent = /^(Editar|Detalhes)/.test(title) ? 'Salvar alterações' : 'Salvar';
    document.getElementById('modalBackdrop').dataset.modalMode = mode;
    document.getElementById('modalBackdrop').classList.remove('hidden');
    if (['task', 'agenda', 'contact', 'lead', 'prompt', 'term', 'source', 'datajud', 'configuration', 'feedback'].includes(mode) && isV2) document.getElementById('appShell')?.setAttribute('inert', '');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      const modalFields = document.getElementById('modalFields');
      if (modalFields && (!document.activeElement || !modalFields.contains(document.activeElement))) {
        modalFields.querySelector('input, textarea')?.focus();
      }
    }, 20);
  }

  function close() {
    const backdrop = document.getElementById('modalBackdrop');
    const wasOpen = backdrop && !backdrop.classList.contains('hidden');
    backdrop?.classList.add('hidden');
    backdrop?.removeAttribute('data-modal-mode');
    document.getElementById('appShell')?.removeAttribute('inert');
    onModeChange?.(null);
    document.getElementById('modalForm').reset();
    if (wasOpen) {
      document.body.style.overflow = previousBodyOverflow;
      if (lastFocusedElement?.isConnected && typeof lastFocusedElement.focus === 'function') lastFocusedElement.focus();
    }
  }

  return Object.freeze({ init, open, close });
}

const PROCESS_FIELD_SECTIONS = Object.freeze({
  number: 'Identificação', oldNumber: 'Identificação', nb: 'Identificação', protocol: 'Identificação', caseFolder: 'Identificação',
  client: 'Partes', clientPosition: 'Partes', opposingParty: 'Partes',
  actionGroup: 'Classificação', actionType: 'Classificação', judicialPhase: 'Classificação', risk: 'Classificação', stage: 'Classificação',
  court: 'Órgão e responsabilidade', county: 'Órgão e responsabilidade', courtUnit: 'Órgão e responsabilidade', responsible: 'Órgão e responsabilidade',
  registeredAt: 'Movimentação', lastMovementAt: 'Movimentação', lastMovement: 'Movimentação',
  feeType: 'Honorários', feePercentage: 'Honorários', feeAmount: 'Honorários', feeMonthly: 'Honorários', feeStatus: 'Honorários', feeNotes: 'Honorários',
  requisitionType: 'Requisições', requisitionAmount: 'Requisições', requisitionBank: 'Requisições', requisitionStatus: 'Requisições',
  secrecy: 'Privacidade e acompanhamento', monitoring: 'Privacidade e acompanhamento', notes: 'Privacidade e acompanhamento'
});

function renderProcessSections(fields, renderField) {
  const sections = new Map();
  for (const field of fields) {
    const section = PROCESS_FIELD_SECTIONS[field.name] || 'Outros dados';
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section).push(field);
  }
  return `<div class="process-form-sections">${[...sections.entries()].map(([section, sectionFields]) => `
    <fieldset class="process-form-section">
      <legend>${section}</legend>
      <div class="form-grid">${sectionFields.map(renderField).join('')}</div>
    </fieldset>`).join('')}</div>`;
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
  location: 'Local',
  source: 'Origem',
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
