import { iconSvg } from './icons.js';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

const SURFACES = Object.freeze({
  emailConfig: Object.freeze({ backdropId: 'emailConfigBackdrop', closeId: 'emailConfigClose', focusId: 'emailHostInput' }),
  emailTest: Object.freeze({ backdropId: 'emailTestBackdrop', closeId: 'emailTestClose', focusId: 'emailTestRecipientInput' }),
  emailReceiver: Object.freeze({ backdropId: 'emailReceiverModalBackdrop', closeId: 'emailReceiverModalClose', focusId: 'receiverTypeInternal' }),
  externalCalendar: Object.freeze({ backdropId: 'calendarConfigBackdrop', closeId: 'calendarConfigClose', focusId: 'calendarInputUrl' })
});

export function createEmailCalendarPresenter({ documentRef = globalThis.document } = {}) {
  let initialized = false;
  const returnFocusTargets = new Map();
  const isV2 = () => documentRef?.documentElement?.dataset?.ui === 'v2';
  const surfaceFor = key => SURFACES[key] || null;
  const backdropFor = key => {
    const surface = surfaceFor(key);
    return surface ? documentRef?.getElementById(surface.backdropId) : null;
  };
  const dialogFor = key => backdropFor(key)?.querySelector('[role="dialog"]');
  const visibleFocusable = key => [...(dialogFor(key)?.querySelectorAll(FOCUSABLE_SELECTOR) || [])]
    .filter(element => !element.hidden && element.getClientRects().length > 0);

  function handleKeydown(key, event) {
    if (!isV2()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      const closeId = surfaceFor(key)?.closeId;
      if (closeId) documentRef.getElementById(closeId)?.click();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = visibleFocusable(key);
    if (!focusable.length) {
      event.preventDefault();
      dialogFor(key)?.focus();
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

  function anotherSurfaceIsOpen(exceptKey) {
    return Object.keys(SURFACES).some(key => key !== exceptKey && !backdropFor(key)?.classList.contains('hidden'));
  }

  return Object.freeze({
    icon(name) {
      return isV2() ? iconSvg(name) : '';
    },

    init() {
      if (initialized) return false;
      initialized = true;
      for (const key of Object.keys(SURFACES)) {
        backdropFor(key)?.addEventListener('keydown', event => handleKeydown(key, event));
      }
      return true;
    },

    open(key) {
      if (!isV2()) return;
      const surface = surfaceFor(key);
      const backdrop = backdropFor(key);
      const dialog = dialogFor(key);
      if (!surface || !backdrop || !dialog) return;
      if (!backdrop.contains(documentRef.activeElement)) returnFocusTargets.set(key, documentRef.activeElement);
      documentRef.getElementById('appShell')?.setAttribute('inert', '');
      dialog.setAttribute('tabindex', '-1');
      const preferred = documentRef.getElementById(surface.focusId);
      (preferred?.getClientRects().length ? preferred : visibleFocusable(key)[0] || dialog).focus();
    },

    close(key) {
      if (!isV2()) return;
      if (!anotherSurfaceIsOpen(key)) documentRef.getElementById('appShell')?.removeAttribute('inert');
      const target = returnFocusTargets.get(key);
      returnFocusTargets.delete(key);
      if (target?.isConnected && typeof target.focus === 'function') target.focus();
    }
  });
}
