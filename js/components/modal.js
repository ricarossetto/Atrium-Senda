export function createModal({ escapeHtml, onModeChange } = {}) {
  let initialized = false;
  let lastFocusedElement = null;
  let previousBodyOverflow = '';

  const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
    document.getElementById('modalFields').innerHTML = `${topHtml}<div class="form-grid">${fields.map(field => {
      const value = defaults[field.name] ?? field.value ?? '';
      if (field.type === 'textarea') return `<div class="field ${field.full ? 'full' : ''}"><label for="field-${field.name}">${field.label}</label><textarea id="field-${field.name}" name="${field.name}" ${field.required ? 'required' : ''}>${escapeHtml(value)}</textarea>${field.note ? `<small class="field-note">${field.note}</small>` : ''}</div>`;
      if (field.type === 'select') return `<div class="field ${field.full ? 'full' : ''}"><label for="field-${field.name}">${field.label}</label><select id="field-${field.name}" name="${field.name}">${field.options.map(option => `<option value="${escapeHtml(option.value)}" ${String(value) === String(option.value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select></div>`;
      return `<div class="field ${field.full ? 'full' : ''}"><label for="field-${field.name}">${field.label}</label><input id="field-${field.name}" name="${field.name}" type="${field.type || 'text'}" value="${escapeHtml(value)}" ${field.required ? 'required' : ''} ${field.placeholder ? `placeholder="${escapeHtml(field.placeholder)}"` : ''}>${field.note ? `<small class="field-note">${field.note}</small>` : ''}</div>`;
    }).join('')}</div>`;
    document.querySelector('#modalForm footer .button.gold').textContent = /^(Editar|Detalhes)/.test(title) ? 'Salvar alterações' : 'Salvar';
    document.getElementById('modalBackdrop').classList.remove('hidden');
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
    onModeChange?.(null);
    document.getElementById('modalForm').reset();
    if (wasOpen) {
      document.body.style.overflow = previousBodyOverflow;
      if (lastFocusedElement?.isConnected && typeof lastFocusedElement.focus === 'function') lastFocusedElement.focus();
    }
  }

  return Object.freeze({ init, open, close });
}
