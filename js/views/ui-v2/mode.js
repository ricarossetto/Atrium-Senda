export const UI_MODE_KEY = 'atrium:ui:mode';
export const UI_MODE_CHANGE_EVENT = 'atrium:ui-mode-change';
export const UI_MODES = Object.freeze(['classic', 'v2']);

export function resolveUiMode() {
  return 'v2';
}

export function createUiMode({
  documentRef = globalThis.document,
  storage = globalThis.localStorage,
  onChange
} = {}) {
  let initialized = false;
  let currentMode = resolveUiMode(storage);

  function syncControls() {
    documentRef?.querySelectorAll?.('[data-ui-mode]').forEach(button => {
      const selected = button.dataset.uiMode === currentMode;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    const control = documentRef?.getElementById?.('uiModeControl');
    control?.setAttribute('data-current-mode', currentMode);
  }

  function announceChange(previousMode) {
    const EventConstructor = documentRef?.defaultView?.CustomEvent || globalThis.CustomEvent;
    if (typeof EventConstructor === 'function') {
      documentRef.dispatchEvent(new EventConstructor(UI_MODE_CHANGE_EVENT, {
        detail: Object.freeze({ mode: currentMode, previousMode })
      }));
    }
    onChange?.(currentMode, previousMode);
  }

  function setMode(mode, { announce = true } = {}) {
    if (!UI_MODES.includes(mode)) return false;
    const previousMode = currentMode;
    currentMode = mode;
    documentRef?.documentElement?.setAttribute('data-ui', mode);
    try { storage?.setItem?.(UI_MODE_KEY, mode); } catch { /* apresentação continua ativa na sessão */ }
    syncControls();
    if (announce && previousMode !== currentMode) announceChange(previousMode);
    return true;
  }

  function init() {
    if (initialized) return false;
    initialized = true;
    currentMode = resolveUiMode(storage);
    setMode(currentMode, { announce: false });
    documentRef?.getElementById?.('uiModeControl')?.addEventListener('click', event => {
      const button = event.target.closest('[data-ui-mode]');
      if (button) setMode(button.dataset.uiMode);
    });
    return true;
  }

  return Object.freeze({
    init,
    setMode,
    get currentMode() { return currentMode; }
  });
}
