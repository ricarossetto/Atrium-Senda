/**
 * Retorno tátil leve e silencioso (sem áudio sintetizado).
 * - iPhone/iPad (Safari 18–26.4): alterna um `<input type="checkbox" switch>` oculto na borda esquerda
 *   para acionar o Taptic Engine nativo sem interferir na barra superior do Safari 26.
 * - iPhone/iPad (Safari 26.5+): aplica automaticamente overlay transparente `<input type="checkbox" switch>`
 *   sobre os principais alvos de toque mobile e o atributo `switch` nos checkboxes acionáveis, garantindo
 *   disparo real no toque físico direto. Zero nós extras em desktop ou Android.
 * - Android: usa `navigator.vibrate`.
 * Ligado por padrão; respeita `prefers-reduced-motion: reduce` e a preferência local `atrium:haptics`.
 */

export const HAPTICS_PREF_KEY = 'atrium:haptics';

const SWITCH_ID = '__atrium_haptic_switch';
const COALESCE_MS = 24;
const TICK_THROTTLE_MS = 28;

const IOS_DIRECT_TARGETS = [
  '#v2MobileNav button',
  '#quickAddButton',
  '#themeToggleButton',
  '#notificationButton',
  '#syncButton',
  '#menuToggle',
  '#newFinancialEntryButton',
  '#view-financial .filter-tabs button',
  '.financial-view-switch button',
  '.financial-period-chip',
  '.financial-bars-seg button',
  '.financial-upcoming-horizons button',
  '.financial-donut-item',
  '.pub-quick-actions button',
  '[data-treatment-action]',
  '#configHapticsToggle',
  '#configHapticsTest'
].join(', ');

const SELECT_CLICK_SELECTOR = [
  '#v2MobileNav button',
  '.nav-item[data-view]',
  '[data-view-link]',
  '.filter-tabs button',
  '[role="tab"]',
  '[data-theme-toggle]',
  '.financial-view-switch button',
  '.financial-period-chip',
  '.financial-bars-seg button',
  '.financial-upcoming-horizons button',
  '.financial-donut-item',
  '.financial-period-tile[data-fin-flow]'
].join(', ');

const MEDIUM_CLICK_SELECTOR = [
  '#quickAddButton',
  '#syncButton',
  '.toolbar-actions .button.gold',
  '.v2-button.is-primary',
  '.pub-quick-actions button',
  '[data-treatment-action]'
].join(', ');

let switchInputEl = null;
let switchLabelEl = null;
let lastFireAt = 0;
let lastTickAt = 0;
let runtimeInstalled = false;
let iosObserver = null;
let forwardingDirectTap = false;
const prefListeners = new Set();

function safeWindow(win) {
  return win ?? (typeof globalThis.window !== 'undefined' ? globalThis.window : undefined);
}

function safeDocument(doc) {
  return doc ?? (typeof globalThis.document !== 'undefined' ? globalThis.document : undefined);
}

function safeNavigator(nav) {
  return nav ?? (typeof globalThis.navigator !== 'undefined' ? globalThis.navigator : undefined);
}

/** Detecta iPhone, iPad e iPod (incluindo iPadOS com UA MacIntel + tela sensível ao toque). */
export function isIosTouchDevice(nav) {
  const target = safeNavigator(nav);
  if (!target) return false;
  const ua = String(target.userAgent || '');
  if (/iPhone|iPod|iPad/i.test(ua)) return true;
  return target.platform === 'MacIntel' && Number(target.maxTouchPoints || 0) > 1;
}

/** Retorna se a preferência do usuário neste aparelho está ligada (padrão: ligada). */
export function isHapticsPrefEnabled(win) {
  const target = safeWindow(win);
  if (!target) return false;
  try {
    return target.localStorage?.getItem(HAPTICS_PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

/** Confere se o retorno tátil pode disparar (preferência ligada e sem movimento reduzido). */
export function isHapticsEnabled(win) {
  const target = safeWindow(win);
  if (!target) return false;
  try {
    if (target.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return false;
    return target.localStorage?.getItem(HAPTICS_PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setHapticsEnabled(enabled, win) {
  const target = safeWindow(win);
  const value = enabled ? '1' : '0';
  try {
    target?.localStorage?.setItem(HAPTICS_PREF_KEY, value);
  } catch {}
  notifyHapticsPrefChange();
  return Boolean(enabled);
}

export function subscribeHapticsPref(listener) {
  if (typeof listener !== 'function') return () => {};
  prefListeners.add(listener);
  return () => prefListeners.delete(listener);
}

export function notifyHapticsPrefChange() {
  for (const listener of prefListeners) {
    try { listener(); } catch {}
  }
}

function ensureIosSwitch(doc) {
  const targetDoc = safeDocument(doc);
  if (!targetDoc || !targetDoc.body) return null;
  if (switchLabelEl && switchInputEl && targetDoc.body.contains(switchLabelEl) && targetDoc.body.contains(switchInputEl)) {
    return switchLabelEl;
  }
  const existing = targetDoc.getElementById?.(SWITCH_ID);
  if (existing) existing.parentElement?.remove?.();

  const label = targetDoc.createElement('label');
  label.htmlFor = SWITCH_ID;
  label.setAttribute('aria-hidden', 'true');
  // Posicionado no meio da borda esquerda para ficar fora da amostra superior do Safari 26.
  label.style.cssText = 'position:fixed;left:0;top:50%;width:1px;height:1px;opacity:0.001;pointer-events:none;z-index:-1;margin:0;padding:0;overflow:hidden';

  const input = targetDoc.createElement('input');
  input.id = SWITCH_ID;
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  input.style.cssText = 'position:fixed;left:0;top:50%;width:1px;height:1px;opacity:0.001;pointer-events:none;margin:0;padding:0';

  label.appendChild(input);
  targetDoc.body.appendChild(label);
  switchLabelEl = label;
  switchInputEl = input;
  return label;
}

function pulseIos(doc) {
  ensureIosSwitch(doc)?.click?.();
}

function fire(pattern, { force = false, throttleMs = COALESCE_MS, win, doc, nav } = {}) {
  if (!isHapticsEnabled(win)) return false;
  try {
    const now = Date.now();
    if (!force && now - lastFireAt < throttleMs) return false;
    lastFireAt = now;

    const targetNav = safeNavigator(nav);
    if (targetNav && 'vibrate' in targetNav && typeof targetNav.vibrate === 'function') {
      targetNav.vibrate(pattern);
      return true;
    }

    if (!isIosTouchDevice(targetNav)) return false;

    if (Array.isArray(pattern)) {
      pulseIos(doc);
      let offset = 0;
      for (let i = 0; i + 2 < pattern.length; i += 2) {
        offset += (pattern[i] ?? 0) + (pattern[i + 1] ?? 0);
        if (offset > 240) break;
        setTimeout(() => {
          if (isHapticsEnabled(win)) pulseIos(doc);
        }, offset);
      }
      return true;
    }

    pulseIos(doc);
    return true;
  } catch {
    return false;
  }
}

/** Pulso tátil padrão (ms ou padrão de pulsos). */
export function haptic(pattern = 8, options = {}) {
  return fire(pattern, { ...options, force: Array.isArray(pattern) || Boolean(options.force) });
}

/** Micro-pulso com limite de cadência (~35 Hz) para interações repetidas. */
export function hapticTick(options = {}) {
  const now = Date.now();
  if (now - lastTickAt < TICK_THROTTLE_MS) return false;
  lastTickAt = now;
  return fire(4, { ...options, throttleMs: TICK_THROTTLE_MS });
}

/** Clique leve de seleção (abas, filtros, períodos, navegação). */
export function hapticSelect(options = {}) {
  return fire(6, options);
}

/** Toque firme ao abrir ou acionar comando principal. */
export function hapticMedium(options = {}) {
  return fire(12, options);
}

/** Duas batidas: confirmação ou conclusão. */
export function hapticSuccess(options = {}) {
  return fire([10, 55, 14], { ...options, force: true });
}

/** Três batidas curtas: erro ou bloqueio. */
export function hapticError(options = {}) {
  return fire([18, 45, 18, 45, 22], { ...options, force: true });
}

function classifyWrapVariant(button) {
  if (button.closest?.('#v2MobileNav')) return 'is-bnav';
  if (button.id === 'newFinancialEntryButton') return 'is-block is-span-full';
  if (button.classList?.contains('financial-donut-item')) return 'is-block';
  if (button.closest?.('.financial-view-switch, #financialFilters')) return 'is-block';
  return '';
}

function wrapButtonForIosDirect(button, doc) {
  if (!button || button.disabled || !button.parentElement) return false;
  if (button.parentElement.classList?.contains('ios-haptic-wrap')) return false;
  const variant = classifyWrapVariant(button);
  const wrap = doc.createElement('span');
  wrap.className = ['ios-haptic-wrap', variant].filter(Boolean).join(' ');
  wrap.dataset.iosHapticAuto = '1';

  const hit = doc.createElement('input');
  hit.type = 'checkbox';
  hit.setAttribute('switch', '');
  hit.setAttribute('aria-hidden', 'true');
  hit.tabIndex = -1;
  hit.className = 'ios-haptic-hit';
  hit.addEventListener('change', () => {
    // No iOS Safari, o overlay sintético <input switch> não pode reter foco após o toque:
    // se ficar como activeElement dentro da dock/topbar, mobileChromeBlocked() impede o
    // recolhimento da barra inferior ao rolar a tela.
    hit.blur?.();
    if (button.disabled) return;
    forwardingDirectTap = true;
    try {
      if (button.type === 'submit' && button.form?.requestSubmit) {
        button.form.requestSubmit(button);
      } else {
        button.click();
      }
    } finally {
      forwardingDirectTap = false;
      if (doc.activeElement === hit || (button.closest?.('#v2MobileNav') && doc.activeElement === button)) {
        doc.activeElement?.blur?.();
      }
    }
  });

  button.parentElement.insertBefore(wrap, button);
  wrap.appendChild(button);
  wrap.appendChild(hit);
  return true;
}

function unwrapAllIosDirect(doc) {
  for (const wrap of [...(doc.querySelectorAll?.('.ios-haptic-wrap[data-ios-haptic-auto="1"]') || [])]) {
    const control = wrap.querySelector(':scope > button, :scope > a');
    if (control && wrap.parentElement) {
      wrap.parentElement.insertBefore(control, wrap);
    }
    wrap.remove();
  }
  for (const checkbox of [...(doc.querySelectorAll?.('.financial-upcoming-in[data-ios-switch-auto="1"]') || [])]) {
    checkbox.removeAttribute('switch');
    delete checkbox.dataset.iosSwitchAuto;
  }
}

function scanIosDirectTargets(root, doc) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  for (const button of root.querySelectorAll(IOS_DIRECT_TARGETS)) {
    wrapButtonForIosDirect(button, doc);
  }
  for (const checkbox of root.querySelectorAll('.financial-upcoming-in')) {
    if (!checkbox.hasAttribute('switch')) {
      checkbox.setAttribute('switch', '');
      checkbox.dataset.iosSwitchAuto = '1';
    }
  }
}

function syncConfigControls(doc, win) {
  const toggle = doc?.getElementById?.('configHapticsToggle');
  const testButton = doc?.getElementById?.('configHapticsTest');
  const stateText = doc?.getElementById?.('configHapticsStateText');
  const reducedNote = doc?.getElementById?.('configHapticsReducedNote');
  if (!toggle) return;
  const prefOn = isHapticsPrefEnabled(win);
  const reduced = Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  toggle.setAttribute('aria-checked', prefOn ? 'true' : 'false');
  if (stateText) stateText.textContent = prefOn ? 'Ligado' : 'Desligado';
  if (testButton) testButton.hidden = !prefOn;
  if (reducedNote) reducedNote.hidden = !reduced;
}

/**
 * Inicializa o retorno tátil global do ATRIUM (idempotente):
 * - conecta os controles discretos em Configurações (`#configHapticsToggle` / `#configHapticsTest`);
 * - aplica delegação de clique e checkboxes no shell;
 * - no iOS com retorno tátil ligado, instala overlays de toque direto para Safari 26.5+.
 */
export function installHapticsRuntime({ documentRef = safeDocument(), windowRef = safeWindow(), navigatorRef = safeNavigator() } = {}) {
  if (runtimeInstalled || !documentRef || !windowRef) return false;
  runtimeInstalled = true;

  const syncDirectMode = () => {
    const active = isIosTouchDevice(navigatorRef) && isHapticsEnabled(windowRef);
    if (documentRef.documentElement) {
      if (active) documentRef.documentElement.dataset.iosHaptics = '1';
      else delete documentRef.documentElement.dataset.iosHaptics;
    }
    if (active) {
      scanIosDirectTargets(documentRef, documentRef);
      if (!iosObserver && typeof windowRef.MutationObserver === 'function' && documentRef.body) {
        let scheduled = false;
        iosObserver = new windowRef.MutationObserver(() => {
          if (scheduled) return;
          scheduled = true;
          const run = () => {
            scheduled = false;
            if (isIosTouchDevice(navigatorRef) && isHapticsEnabled(windowRef)) {
              scanIosDirectTargets(documentRef, documentRef);
            }
          };
          if (typeof windowRef.requestAnimationFrame === 'function') windowRef.requestAnimationFrame(run);
          else setTimeout(run, 16);
        });
        iosObserver.observe(documentRef.body, { childList: true, subtree: true });
      }
    } else {
      iosObserver?.disconnect();
      iosObserver = null;
      unwrapAllIosDirect(documentRef);
    }
    syncConfigControls(documentRef, windowRef);
  };

  documentRef.getElementById?.('configHapticsToggle')?.addEventListener('click', () => {
    const next = !isHapticsPrefEnabled(windowRef);
    setHapticsEnabled(next, windowRef);
    if (next && !forwardingDirectTap) hapticSuccess({ win: windowRef, doc: documentRef, nav: navigatorRef });
  });

  documentRef.getElementById?.('configHapticsTest')?.addEventListener('click', () => {
    if (!forwardingDirectTap) hapticSuccess({ win: windowRef, doc: documentRef, nav: navigatorRef });
  });

  documentRef.addEventListener('click', event => {
    if (forwardingDirectTap || !isHapticsEnabled(windowRef)) return;
    const target = event.target;
    if (!target || typeof target.closest !== 'function') return;
    if (target.id === SWITCH_ID || target.closest('#configHapticsToggle, #configHapticsTest, .ios-haptic-hit')) return;
    if (target.closest(MEDIUM_CLICK_SELECTOR)) {
      hapticMedium({ win: windowRef, doc: documentRef, nav: navigatorRef });
      return;
    }
    if (target.closest(SELECT_CLICK_SELECTOR)) {
      hapticSelect({ win: windowRef, doc: documentRef, nav: navigatorRef });
    }
  }, { passive: true });

  documentRef.addEventListener('change', event => {
    if (forwardingDirectTap || !isHapticsEnabled(windowRef)) return;
    const target = event.target;
    if (!target || target.type !== 'checkbox' || target.id === SWITCH_ID || target.classList?.contains('ios-haptic-hit')) return;
    // No iOS 26.5+, um checkbox com `switch` já disparou o motor nativo no toque direto.
    if (isIosTouchDevice(navigatorRef) && target.hasAttribute('switch')) return;
    if (target.matches?.('.financial-upcoming-in, [data-complete-task-id]')) {
      if (target.checked) hapticSuccess({ win: windowRef, doc: documentRef, nav: navigatorRef });
      else hapticSelect({ win: windowRef, doc: documentRef, nav: navigatorRef });
    }
  }, { passive: true });

  subscribeHapticsPref(syncDirectMode);
  windowRef.addEventListener?.('storage', event => {
    if (!event.key || event.key === HAPTICS_PREF_KEY) syncDirectMode();
  });
  windowRef.matchMedia?.('(prefers-reduced-motion: reduce)')?.addEventListener?.('change', syncDirectMode);

  syncDirectMode();
  return true;
}

/** Limpa referências internas entre testes unitários. */
export function resetHapticsForTest(doc) {
  const targetDoc = safeDocument(doc);
  if (targetDoc) unwrapAllIosDirect(targetDoc);
  iosObserver?.disconnect();
  iosObserver = null;
  switchInputEl = null;
  switchLabelEl = null;
  lastFireAt = 0;
  lastTickAt = 0;
  runtimeInstalled = false;
  forwardingDirectTap = false;
  prefListeners.clear();
}
