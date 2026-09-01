import { iconSvg } from './icons.js';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export function createJudicialIntegrationsPresenter({ documentRef = globalThis.document } = {}) {
  let initialized = false;
  let returnFocusTarget = null;

  const getBackdrop = () => documentRef.getElementById('judicialSetupBackdrop');
  const getDialog = () => getBackdrop()?.querySelector('[role="dialog"]');
  const visibleFocusable = () => [...(getDialog()?.querySelectorAll(FOCUSABLE_SELECTOR) || [])]
    .filter(element => !element.hidden && element.getClientRects().length > 0);

  function handleKeydown(event) {
    if (event.key !== 'Tab') return;
    const focusable = visibleFocusable();
    if (!focusable.length) {
      event.preventDefault();
      getDialog()?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && documentRef.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && documentRef.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return Object.freeze({
    icon(name) {
      return documentRef?.documentElement?.dataset?.ui === 'v2' ? iconSvg(name) : '';
    },

    init() {
      if (initialized) return false;
      initialized = true;
      getBackdrop()?.addEventListener('keydown', handleKeydown);
      return true;
    },

    open() {
      const backdrop = getBackdrop();
      const dialog = getDialog();
      if (!backdrop || !dialog) return;
      if (!backdrop.contains(documentRef.activeElement)) returnFocusTarget = documentRef.activeElement;
      documentRef.getElementById('appShell')?.setAttribute('inert', '');
      dialog.setAttribute('tabindex', '-1');
      (documentRef.getElementById('judicialSetupClose') || dialog).focus();
    },

    close() {
      documentRef.getElementById('appShell')?.removeAttribute('inert');
      const target = returnFocusTarget;
      returnFocusTarget = null;
      if (target?.isConnected && typeof target.focus === 'function') target.focus();
    }
  });
}
