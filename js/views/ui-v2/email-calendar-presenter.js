import { iconSvg } from './icons.js?v=3.4.0';
import { installPanelSizeToggle, resetPanelSize } from '../../components/panel-size.js?v=3.4.0';

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
  mailPreferences: Object.freeze({ backdropId: 'mailPreferencesBackdrop', closeId: 'mailPreferencesClose', focusId: 'mailPrefPublication' }),
  externalCalendar: Object.freeze({ backdropId: 'calendarConfigBackdrop', fallbackBackdropId: 'googleCalendarBackdrop', closeId: 'calendarConfigClose', fallbackCloseId: 'googleCalendarClose', focusId: 'calendarInputUrl' }),
  googleCalendar: Object.freeze({ backdropId: 'googleCalendarBackdrop', closeId: 'googleCalendarClose', focusId: 'googleCalendarPrimary' })
});

export function createEmailCalendarPresenter({ documentRef = globalThis.document } = {}) {
  let initialized = false;
  const returnFocusTargets = new Map();
  const isV2 = () => documentRef?.documentElement?.dataset?.ui === 'v2';
  const surfaceFor = key => SURFACES[key] || null;
  const backdropFor = key => {
    const surface = surfaceFor(key);
    if (!surface) return null;
    return documentRef?.getElementById(surface.backdropId)
      || (surface.fallbackBackdropId ? documentRef?.getElementById(surface.fallbackBackdropId) : null);
  };
  const closeIdFor = key => {
    const surface = surfaceFor(key);
    if (!surface) return '';
    if (documentRef?.getElementById(surface.closeId)) return surface.closeId;
    return surface.fallbackCloseId || surface.closeId;
  };
  const dialogFor = key => backdropFor(key)?.querySelector('[role="dialog"]');
  const visibleFocusable = key => [...(dialogFor(key)?.querySelectorAll(FOCUSABLE_SELECTOR) || [])]
    .filter(element => !element.hidden && element.getClientRects().length > 0);

  function handleKeydown(key, event) {
    if (!isV2()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      const closeId = closeIdFor(key);
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
    const exceptBackdrop = backdropFor(exceptKey);
    return Object.keys(SURFACES).some(key => {
      if (key === exceptKey) return false;
      const backdrop = backdropFor(key);
      return backdrop && backdrop !== exceptBackdrop && !backdrop.classList.contains('hidden');
    });
  }

  return Object.freeze({
    icon(name) {
      return isV2() ? iconSvg(name) : '';
    },

    init() {
      if (initialized) return false;
      initialized = true;
      const boundBackdrops = new Set();
      for (const key of Object.keys(SURFACES)) {
        const backdrop = backdropFor(key);
        if (!backdrop || boundBackdrops.has(backdrop)) continue;
        boundBackdrops.add(backdrop);
        backdrop.addEventListener('keydown', event => handleKeydown(key, event));
        installPanelSizeToggle(dialogFor(key));
      }
      return true;
    },

    open(key) {
      if (!isV2()) return;
      const surface = surfaceFor(key);
      const backdrop = backdropFor(key);
      const dialog = dialogFor(key);
      if (!surface || !backdrop || !dialog) return;
      const existingTargetKey = Object.keys(SURFACES).find(otherKey => backdropFor(otherKey) === backdrop && returnFocusTargets.has(otherKey));
      if (!backdrop.contains(documentRef.activeElement) && !existingTargetKey) {
        returnFocusTargets.set(key, documentRef.activeElement);
      }
      documentRef.getElementById('appShell')?.setAttribute('inert', '');
      dialog.setAttribute('tabindex', '-1');
      const preferred = documentRef.getElementById(surface.focusId);
      const canFocusPreferred = preferred && !preferred.disabled && preferred.getClientRects().length > 0;
      (canFocusPreferred ? preferred : visibleFocusable(key)[0] || dialog).focus();
    },

    close(key) {
      if (!isV2()) return;
      resetPanelSize(dialogFor(key));
      const backdrop = backdropFor(key);
      if (!anotherSurfaceIsOpen(key)) documentRef.getElementById('appShell')?.removeAttribute('inert');
      let target = returnFocusTargets.get(key);
      returnFocusTargets.delete(key);
      if (!target) {
        for (const otherKey of Object.keys(SURFACES)) {
          if (backdropFor(otherKey) === backdrop && returnFocusTargets.has(otherKey)) {
            target = returnFocusTargets.get(otherKey);
            returnFocusTargets.delete(otherKey);
            break;
          }
        }
      }
      if (target?.isConnected && typeof target.focus === 'function') target.focus();
    }
  });
}
