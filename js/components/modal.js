export function createModal({ escapeHtml, onModeChange } = {}) {
  let initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;
    document.getElementById('modalClose')?.addEventListener('click', close);
    document.getElementById('modalCancel')?.addEventListener('click', close);
    document.getElementById('modalBackdrop')?.addEventListener('click', event => {
      if (event.target === document.getElementById('modalBackdrop')) close();
    });
  }

  function open(mode, title, eyebrow, fields, defaults = {}, topHtml = '') {
    onModeChange?.({ mode, defaults });
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalEyebrow').textContent = eyebrow;
    document.getElementById('modalFields').innerHTML = `${topHtml}<div class="form-grid">${fields.map(field => {
      const value = defaults[field.name] ?? field.value ?? '';
      if (field.type === 'textarea') return `<div class="field ${field.full ? 'full' : ''}"><label for="field-${field.name}">${field.label}</label><textarea id="field-${field.name}" name="${field.name}" ${field.required ? 'required' : ''}>${escapeHtml(value)}</textarea>${field.note ? `<small class="field-note">${field.note}</small>` : ''}</div>`;
      if (field.type === 'select') return `<div class="field ${field.full ? 'full' : ''}"><label for="field-${field.name}">${field.label}</label><select id="field-${field.name}" name="${field.name}">${field.options.map(option => `<option value="${escapeHtml(option.value)}" ${String(value) === String(option.value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></div>`;
      return `<div class="field ${field.full ? 'full' : ''}"><label for="field-${field.name}">${field.label}</label><input id="field-${field.name}" name="${field.name}" type="${field.type || 'text'}" value="${escapeHtml(value)}" ${field.required ? 'required' : ''} ${field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : ''}>${field.note ? `<small class="field-note">${field.note}</small>` : ''}</div>`;
    }).join('')}</div>`;
    document.querySelector('#modalForm footer .button.gold').textContent = /^(Editar|Detalhes)/.test(title) ? 'Salvar alterações' : 'Salvar';
    document.getElementById('modalBackdrop').classList.remove('hidden');
    setTimeout(() => {
      const modalFields = document.getElementById('modalFields');
      if (modalFields && (!document.activeElement || !modalFields.contains(document.activeElement))) {
        modalFields.querySelector('input, textarea')?.focus();
      }
    }, 20);
  }

  function close() {
    document.getElementById('modalBackdrop').classList.add('hidden');
    onModeChange?.(null);
    document.getElementById('modalForm').reset();
  }

  return Object.freeze({ init, open, close });
}
