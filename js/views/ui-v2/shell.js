const NAVIGATION_GROUPS = Object.freeze({
  dashboard: 'overview',
  processes: 'work',
  inbox: 'work',
  kanban: 'work',
  agenda: 'work',
  contacts: 'management',
  leads: 'management',
  documents: 'management',
  financial: 'management',
  calculations: 'management',
  reports: 'management',
  assistant: 'management',
  integrations: 'system',
  configuration: 'system'
});

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const SYSTEM_ORDER = Object.freeze(['integrations', 'configuration']);
const BASIC_SYSTEM_ORDER = Object.freeze(['integrations', 'configuration']);
const BASIC_SECONDARY_VIEWS = Object.freeze(new Set(['financial', 'reports', 'documents', 'assistant', 'prompts', 'links', 'leads']));
const WORK_ORDER = Object.freeze(['kanban', 'inbox', 'agenda', 'processes']);
const MANAGEMENT_ORDER = Object.freeze(['contacts', 'leads', 'documents', 'financial', 'calculations', 'reports', 'assistant']);

export function createUiV2Shell({
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  getNotifications = () => [],
  onNotificationsOpen,
  onNotificationSelect
} = {}) {
  let initialized = false;
  let navigationTrigger = null;
  let previousBodyOverflow = '';
  let mobileChromeScrollTop = 0;
  let mobileChromeDirection = 0;
  let mobileChromeFrame = 0;
  let mobileChromeViewportWidth = 0;
  let mobileChromeViewportHeight = 0;
  const originalNavPlacements = new Map();
  const originalUtilityPlacements = new Map();

  function rememberPlacement(map, element) {
    if (!element || map.has(element)) return;
    map.set(element, { parent: element.parentElement, index: [...element.parentElement.children].indexOf(element) });
  }

  function restorePlacements(map) {
    const byParent = new Map();
    map.forEach((placement, element) => {
      if (!byParent.has(placement.parent)) byParent.set(placement.parent, []);
      byParent.get(placement.parent).push({ element, index: placement.index });
    });
    byParent.forEach((items, parent) => items
      .sort((a, b) => a.index - b.index)
      .forEach(({ element, index }) => parent.insertBefore(element, parent.children[index] || null)));
  }

  function isBasicDensity() {
    return documentRef?.documentElement?.dataset?.uiDensity === 'basic';
  }

  function isBasicFilteredView(view) {
    return isBasicDensity() && BASIC_SECONDARY_VIEWS.has(String(view || ''));
  }

  /**
   * Grupo cujos itens todos foram filtrados pelo Basic: sai da navegacao junto
   * do seu titulo, para nao deixar cabecalho nem toggle orfaos.
   */
  function isBasicEmptyGroup(group) {
    if (!isBasicDensity()) return false;
    const views = Object.entries(NAVIGATION_GROUPS)
      .filter(([, target]) => target === group)
      .map(([view]) => view);
    return views.length > 0 && views.every(view => BASIC_SECONDARY_VIEWS.has(view));
  }

  function applyBasicGroupVisibility() {
    for (const group of ['management']) {
      const nav = documentRef?.querySelector?.(`[data-v2-nav-group="${group}"]`);
      const toggle = documentRef?.querySelector?.(`[data-v2-nav-toggle="${group}"]`);
      if (!nav || !toggle) continue;
      const hideGroup = isBasicEmptyGroup(group);
      nav.hidden = hideGroup;
      toggle.style.display = hideGroup ? 'none' : '';
      toggle.setAttribute('aria-expanded', hideGroup ? 'false' : 'true');
      toggle.classList.toggle('is-collapsed', hideGroup);
    }
  }

  function organizeNavigation(mode) {
    const navItems = [...(documentRef?.querySelectorAll?.('.nav-item[data-view]') || [])];
    navItems.forEach(item => rememberPlacement(originalNavPlacements, item));
    const utilityButtons = ['tourButton', 'quickDocGenButton'].map(id => documentRef?.getElementById?.(id)).filter(Boolean);
    utilityButtons.forEach(button => rememberPlacement(originalUtilityPlacements, button));

    if (mode === 'v2') {
      const basic = isBasicDensity();
      navItems.forEach(item => {
        const group = NAVIGATION_GROUPS[item.dataset.view];
        if (!group || isBasicFilteredView(item.dataset.view)) return;
        documentRef?.querySelector?.(`[data-v2-nav-group="${group}"]`)?.appendChild(item);
      });
      for (const [group, order] of [['work', WORK_ORDER], ['management', MANAGEMENT_ORDER], ['system', basic ? BASIC_SYSTEM_ORDER : SYSTEM_ORDER]]) {
        const nav = documentRef?.querySelector?.(`[data-v2-nav-group="${group}"]`);
        order.forEach(view => {
          const item = nav?.querySelector?.(`[data-view="${view}"]`);
          if (item) nav.appendChild(item);
        });
      }
      const panel = documentRef?.getElementById?.('v2UtilitiesMenuPanel');
      utilityButtons.forEach(button => panel?.appendChild(button));
    } else {
      restorePlacements(originalNavPlacements);
      restorePlacements(originalUtilityPlacements);
    }
    applyBasicGroupVisibility();
  }

  function isV2Mobile() {
    return documentRef?.documentElement?.dataset?.ui === 'v2' && Number(windowRef?.innerWidth || 0) <= 860;
  }

  function mobileChromeBlocked() {
    const rawActive = documentRef.activeElement;
    // Overlays sintéticos de retorno tátil iOS (.ios-haptic-hit) nunca são foco de teclado nem campo digitável.
    const active = rawActive?.classList?.contains?.('ios-haptic-hit') ? null : rawActive;
    return documentRef.getElementById('sidebar')?.classList.contains('open')
      || !documentRef.getElementById('notificationPanel')?.classList.contains('hidden')
      || documentRef.getElementById('v2UtilitiesMenu')?.hasAttribute('open')
      || Boolean(documentRef.querySelector('.modal-backdrop:not(.hidden), .eproc-sync-modal-backdrop:not(.hidden), .contacts-inspector.is-open, .process-inspector.is-open'))
      || Boolean(active?.closest?.('.topbar, #v2MobileNav'))
      || Boolean(active?.matches?.('input, textarea, select, [contenteditable="true"]'));
  }

  function readScrollState() {
    const doc = documentRef?.documentElement;
    const maxScroll = Math.max(0, (doc?.scrollHeight || 0) - (windowRef?.innerHeight || 0));
    const rawY = typeof windowRef?.scrollY === 'number'
      ? windowRef.scrollY
      : (typeof windowRef?.pageYOffset === 'number' ? windowRef.pageYOffset : (doc?.scrollTop || 0));
    const y = Math.min(maxScroll, Math.max(0, rawY));
    return { y, maxScroll };
  }

  function setMobileChrome(state) {
    const root = documentRef.documentElement;
    const actions = documentRef.querySelector('.topbar-actions');
    const nav = documentRef.getElementById('v2MobileNav');
    if (!isV2Mobile() || documentRef.getElementById('appShell')?.classList.contains('hidden')) {
      root.removeAttribute('data-v2-mobile-chrome');
      nav?.classList.remove('is-hidden');
      actions?.removeAttribute('inert');
      nav?.removeAttribute('inert');
      return;
    }
    if (root.dataset.v2MobileChrome === state) return;
    const hidden = state === 'reading';
    root.dataset.v2MobileChrome = state;
    nav?.classList.toggle('is-hidden', hidden);
    if (actions) actions.inert = hidden;
    if (nav) nav.inert = hidden;
  }

  function resetMobileChrome() {
    mobileChromeViewportWidth = Number(windowRef?.innerWidth || 0);
    mobileChromeViewportHeight = Number(windowRef?.innerHeight || 0);
    mobileChromeScrollTop = readScrollState().y;
    mobileChromeDirection = 0;
    setMobileChrome('expanded');
  }

  function updateMobileChrome() {
    mobileChromeFrame = 0;
    const nextWidth = Number(windowRef?.innerWidth || 0);
    const nextHeight = Number(windowRef?.innerHeight || 0);
    const { y, maxScroll } = readScrollState();
    if (!isV2Mobile() || documentRef.getElementById('appShell')?.classList.contains('hidden')) {
      resetMobileChrome();
      return;
    }
    // No iOS Safari, o recolhimento da barra em pílula altera `innerHeight` com largura estável e pode
    // reduzir `maxScroll` durante a descida; reancora o scroll sem reabrir as barras por 1 frame.
    if (Math.abs(nextWidth - mobileChromeViewportWidth) < 2 && Math.abs(nextHeight - mobileChromeViewportHeight) >= 2) {
      mobileChromeViewportHeight = nextHeight;
      mobileChromeScrollTop = y;
      mobileChromeDirection = 0;
      if (maxScroll <= 40 || y <= 24 || mobileChromeBlocked()) resetMobileChrome();
      return;
    }
    const dy = y - mobileChromeScrollTop;
    mobileChromeScrollTop = y;
    if (maxScroll <= 40 || y <= 24 || mobileChromeBlocked()) {
      resetMobileChrome();
      return;
    }
    if (Math.abs(dy) < 1) return;
    if (Math.sign(dy) !== Math.sign(mobileChromeDirection)) mobileChromeDirection = 0;
    mobileChromeDirection += dy;
    if (mobileChromeDirection >= 18) {
      setMobileChrome('reading');
      mobileChromeDirection = 0;
    } else if (mobileChromeDirection <= -24) {
      setMobileChrome('expanded');
      mobileChromeDirection = 0;
    }
  }

  function initMobileChrome() {
    resetMobileChrome();
    windowRef.addEventListener('scroll', () => {
      if (!mobileChromeFrame) mobileChromeFrame = windowRef.requestAnimationFrame(updateMobileChrome);
    }, { passive: true });
    documentRef.addEventListener('gesturestart', event => {
      if (isV2Mobile()) event.preventDefault();
    }, { passive: false });
    documentRef.addEventListener('focusin', () => {
      if (mobileChromeBlocked()) resetMobileChrome();
    });
    documentRef.addEventListener('keydown', event => {
      // `event.key` pode vir ausente (eventos sintéticos, IME e extensões); sem a guarda o
      // throw derrubava a view com o relatório de erro na cara do usuário a cada tecla.
      const key = String(event?.key || '');
      if (key === 'Tab' || key.startsWith('Arrow') || ['Home', 'End', 'PageUp', 'PageDown'].includes(key)) resetMobileChrome();
    });
    documentRef.addEventListener('click', event => {
      if (event.target.closest('.topbar, #v2MobileNav, [data-view-link], [data-view], .modal-backdrop')) {
        resetMobileChrome();
        // Toque/clique de ponteiro na dock inferior não deve manter foco residual bloqueando o recolhimento no scroll.
        if (event.detail > 0 && event.target.closest('#v2MobileNav [data-view-link]')) {
          const active = documentRef.activeElement;
          if (active?.closest?.('#v2MobileNav')) active.blur?.();
        }
      }
    });
    documentRef.getElementById('v2UtilitiesMenu')?.addEventListener('toggle', () => {
      if (mobileChromeBlocked()) resetMobileChrome();
    });
    if (typeof windowRef.MutationObserver === 'function') {
      const observer = new windowRef.MutationObserver(() => {
        if (isV2Mobile() && mobileChromeBlocked()) resetMobileChrome();
      });
      for (const overlay of documentRef.querySelectorAll('.modal-backdrop, .eproc-sync-modal-backdrop')) {
        observer.observe(overlay, { attributes: true, attributeFilter: ['class', 'hidden'] });
      }
    }
    let resizeChromeFrame = 0;
    const handleChromeResize = () => {
      resizeChromeFrame = 0;
      const nextWidth = Number(windowRef?.innerWidth || 0);
      const nextHeight = Number(windowRef?.innerHeight || 0);
      const widthChanged = Math.abs(nextWidth - mobileChromeViewportWidth) >= 2;
      mobileChromeViewportWidth = nextWidth;
      mobileChromeViewportHeight = nextHeight;
      if (!isV2Mobile() || widthChanged) {
        resetMobileChrome();
        return;
      }
      // Resize apenas de altura (barra do Safari recolhendo/expandindo durante o scroll) mantém o estado atual.
      const { y, maxScroll } = readScrollState();
      mobileChromeScrollTop = y;
      mobileChromeDirection = 0;
      if (maxScroll <= 40 || y <= 24 || mobileChromeBlocked()) {
        setMobileChrome('expanded');
      }
    };
    windowRef.addEventListener('resize', () => {
      if (resizeChromeFrame) return;
      resizeChromeFrame = typeof windowRef.requestAnimationFrame === 'function'
        ? windowRef.requestAnimationFrame(handleChromeResize)
        : (handleChromeResize(), 0);
    }, { passive: true });
  }

  function applyNavGroupState(button, nav, collapsed) {
    const hidden = collapsed || isBasicEmptyGroup(button?.dataset?.v2NavToggle);
    button.setAttribute('aria-expanded', hidden ? 'false' : 'true');
    button.classList.toggle('is-collapsed', hidden);
    nav.hidden = hidden;
  }

  /**
   * Grupos recolhíveis do menu V2: estado apenas em memória (o shell não cria
   * persistência de apresentação) e o padrão é sempre todos expandidos.
   */
  function initNavGroupToggles() {
    for (const button of documentRef?.querySelectorAll?.('[data-v2-nav-toggle]') || []) {
      const group = button.dataset.v2NavToggle;
      const nav = documentRef?.getElementById?.(button.getAttribute('aria-controls') || '')
        || documentRef?.querySelector?.(`[data-v2-nav-group="${group}"]`);
      if (!nav) continue;
      applyNavGroupState(button, nav, false);
      button.addEventListener('click', () => {
        applyNavGroupState(button, nav, !nav.hidden);
      });
    }
  }

  function setNavigationState(open) {
    const sidebar = documentRef?.getElementById?.('sidebar');
    const menuButton = documentRef?.getElementById?.('menuToggle');
    const main = documentRef?.querySelector?.('.main-content');
    if (!sidebar) return;
    sidebar.classList.toggle('open', open);
    menuButton?.setAttribute('aria-expanded', open ? 'true' : 'false');
    documentRef?.getElementById?.('v2MobileMore')?.setAttribute('aria-expanded', open ? 'true' : 'false');
    documentRef.documentElement.toggleAttribute('data-v2-nav-open', open && isV2Mobile());
    if (main && isV2Mobile()) main.inert = open;
    if (open && isV2Mobile()) {
      resetMobileChrome();
      previousBodyOverflow = documentRef.body.style.overflow;
      documentRef.body.style.overflow = 'hidden';
      sidebar.querySelector(FOCUSABLE)?.focus();
    } else {
      if (main) main.inert = false;
      documentRef.body.style.overflow = previousBodyOverflow;
    }
  }

  function toggleNavigation(trigger) {
    navigationTrigger = trigger || documentRef?.getElementById?.('menuToggle');
    const sidebar = documentRef?.getElementById?.('sidebar');
    if (!sidebar) return;
    setNavigationState(!sidebar.classList.contains('open'));
  }

  function closeNavigation({ restoreFocus = true } = {}) {
    const wasOpen = documentRef?.getElementById?.('sidebar')?.classList.contains('open');
    setNavigationState(false);
    if (wasOpen && restoreFocus && navigationTrigger?.isConnected) navigationTrigger.focus();
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      const utilitiesMenu = documentRef?.getElementById?.('v2UtilitiesMenu');
      if (utilitiesMenu?.hasAttribute('open')) {
        event.preventDefault();
        utilitiesMenu.removeAttribute('open');
        utilitiesMenu.querySelector('summary')?.focus();
        return true;
      }
    }
    if (!isV2Mobile() || !documentRef?.getElementById?.('sidebar')?.classList.contains('open')) return false;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeNavigation();
      return true;
    }
    if (event.key !== 'Tab') return false;
    const focusable = [...documentRef.getElementById('sidebar').querySelectorAll(FOCUSABLE)]
      .filter(element => !element.hasAttribute('disabled') && element.getClientRects().length > 0);
    if (!focusable.length) return false;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && documentRef.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && documentRef.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
    return event.defaultPrevented;
  }

  function syncMobileNavigation(view) {
    resetMobileChrome();
    const nav = documentRef?.getElementById?.('v2MobileNav');
    if (!nav) return;
    const primaryViews = ['dashboard', 'kanban', 'inbox', 'agenda'];
    for (const button of nav.querySelectorAll('button')) {
      const active = button.dataset.viewLink === view || (button.id === 'v2MobileMore' && !primaryViews.includes(view));
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  }

  function fitViewTitle() {
    const title = documentRef?.getElementById?.('viewTitle');
    if (!title) return false;
    if (title.style.fontSize) title.style.removeProperty('font-size');
    if (!isV2Mobile()) return true;
    const base = Number.parseFloat(windowRef?.getComputedStyle?.(title)?.fontSize) || 18;
    let size = base;
    while (size > 12 && title.scrollWidth > title.clientWidth + 1) {
      size -= 1;
      title.style.fontSize = `${size}px`;
    }
    return title.scrollWidth <= title.clientWidth + 1;
  }

  function applyMode(mode) {
    closeNavigation({ restoreFocus: false });
    organizeNavigation(mode);
    documentRef?.getElementById?.('v2UtilitiesMenu')?.removeAttribute('open');
    fitViewTitle();
    resetMobileChrome();
  }

  function init(mode = documentRef?.documentElement?.dataset?.ui || 'classic') {
    if (initialized) return false;
    initialized = true;
    documentRef?.querySelector?.('.skip-link')?.addEventListener('click', event => {
      const main = documentRef.getElementById('appMain');
      if (!main) return;
      // <base href="/"> faz href="#appMain" sair da rota interna e carregar
      // o documento raiz. O atalho deve mover o foco sem reiniciar a aplicação.
      event.preventDefault();
      main.focus({ preventScroll: true });
      main.scrollIntoView?.({ block: 'start', behavior: 'instant' });
    });
    documentRef?.getElementById?.('sidebarScrim')?.addEventListener('click', () => closeNavigation());
    documentRef?.getElementById?.('v2MobileMore')?.addEventListener('click', event => toggleNavigation(event.currentTarget));
    documentRef?.querySelector?.('.sidebar-office')?.addEventListener('click', () => closeNavigation({ restoreFocus: false }));
    documentRef?.getElementById?.('v2UtilitiesMenuPanel')?.addEventListener('click', () => {
      documentRef.getElementById('v2UtilitiesMenu')?.removeAttribute('open');
    });
    const notificationButton = documentRef?.getElementById?.('notificationButton');
    const notificationPanel = documentRef?.getElementById?.('notificationPanel');
    const closeNotifications = ({ restoreFocus = true } = {}) => {
      const wasOpen = !notificationPanel?.classList.contains('hidden');
      notificationPanel?.classList.add('hidden');
      notificationButton?.setAttribute('aria-expanded', 'false');
      if (wasOpen && restoreFocus) notificationButton?.focus();
    };
    const renderNotifications = () => {
      const body = documentRef?.getElementById?.('notificationPanelBody');
      if (!body) return;
      const items = getNotifications().slice(0, 8);
      body.innerHTML = items.length ? items.map(item => `<button type="button" data-notification-target="${escapeAttribute(item.target)}" data-notification-id="${escapeAttribute(item.id)}"><strong>${escapeText(item.title)}</strong><span>${escapeText(item.detail)}</span></button>`).join('') : '<div class="notification-empty"><strong>Tudo acompanhado</strong><p>Não há publicações pendentes nem tarefas atrasadas neste momento.</p></div>';
    };
    notificationButton?.addEventListener('click', () => {
      const open = notificationPanel?.classList.contains('hidden');
      if (open) {
        onNotificationsOpen?.();
        renderNotifications();
        notificationPanel?.classList.remove('hidden');
        notificationButton.setAttribute('aria-expanded', 'true');
        notificationPanel?.querySelector(FOCUSABLE)?.focus();
        resetMobileChrome();
      } else closeNotifications();
    });
    documentRef?.getElementById?.('notificationPanelClose')?.addEventListener('click', () => closeNotifications());
    notificationPanel?.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); closeNotifications(); }
    });
    notificationPanel?.addEventListener('click', event => {
      const item = event.target.closest('[data-notification-target]');
      if (item) onNotificationSelect?.({ target: item.dataset.notificationTarget, id: item.dataset.notificationId });
      if (event.target.closest('[data-view-link]')) closeNotifications({ restoreFocus: false });
      if (item) closeNotifications({ restoreFocus: false });
    });
    documentRef?.addEventListener?.('click', event => {
      if (!notificationPanel?.classList.contains('hidden') && !event.target.closest('.notification-center')) closeNotifications({ restoreFocus: false });
      const utilitiesMenu = documentRef?.getElementById?.('v2UtilitiesMenu');
      if (utilitiesMenu?.hasAttribute('open') && !event.target.closest('#v2UtilitiesMenu')) utilitiesMenu.removeAttribute('open');
    });
    applyMode(mode);
    initMobileChrome();
    initNavGroupToggles();
    const viewTitle = documentRef?.getElementById?.('viewTitle');
    if (viewTitle && typeof windowRef?.MutationObserver === 'function') {
      new windowRef.MutationObserver(() => fitViewTitle()).observe(viewTitle, { childList: true, characterData: true, subtree: true });
    }
    let resizeTitleFrame = 0;
    windowRef?.addEventListener?.('resize', () => {
      if (resizeTitleFrame) return;
      resizeTitleFrame = typeof windowRef.requestAnimationFrame === 'function'
        ? windowRef.requestAnimationFrame(() => { resizeTitleFrame = 0; fitViewTitle(); })
        : (fitViewTitle(), 0);
    }, { passive: true });
    documentRef?.fonts?.ready?.then?.(() => fitViewTitle()).catch?.(() => {});
    return true;
  }

  return Object.freeze({ init, applyMode, toggleNavigation, closeNavigation, handleKeydown, syncMobileNavigation, fitViewTitle });
}

function escapeText(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#96;'
  })[character]);
}

function escapeAttribute(value) {
  return escapeText(value);
}
