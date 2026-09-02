const NAVIGATION_GROUPS = Object.freeze({
  dashboard: 'overview',
  processes: 'work',
  inbox: 'work',
  kanban: 'work',
  agenda: 'work',
  contacts: 'relationship',
  leads: 'relationship',
  financial: 'management',
  documents: 'management',
  assistant: 'intelligence',
  prompts: 'intelligence',
  monitoring: 'system',
  integrations: 'system',
  configuration: 'system',
  importer: 'system',
  audit: 'system',
  links: 'system'
});

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const SYSTEM_ORDER = Object.freeze(['monitoring', 'links', 'importer', 'integrations', 'audit', 'configuration']);

export function createUiV2Shell({
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  getNotifications = () => [],
  onNotificationSelect
} = {}) {
  let initialized = false;
  let navigationTrigger = null;
  let previousBodyOverflow = '';
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

  function organizeNavigation(mode) {
    const navItems = [...(documentRef?.querySelectorAll?.('.nav-item[data-view]') || [])];
    navItems.forEach(item => rememberPlacement(originalNavPlacements, item));
    const utilityButtons = ['tourButton', 'quickDocGenButton'].map(id => documentRef?.getElementById?.(id)).filter(Boolean);
    utilityButtons.forEach(button => rememberPlacement(originalUtilityPlacements, button));

    if (mode === 'v2') {
      navItems.forEach(item => {
        const group = NAVIGATION_GROUPS[item.dataset.view];
        documentRef?.querySelector?.(`[data-v2-nav-group="${group}"]`)?.appendChild(item);
      });
      const systemNav = documentRef?.querySelector?.('[data-v2-nav-group="system"]');
      SYSTEM_ORDER.forEach(view => {
        const item = systemNav?.querySelector?.(`[data-view="${view}"]`);
        if (item) systemNav.appendChild(item);
      });
      const panel = documentRef?.getElementById?.('v2UtilitiesMenuPanel');
      utilityButtons.forEach(button => panel?.appendChild(button));
    } else {
      restorePlacements(originalNavPlacements);
      restorePlacements(originalUtilityPlacements);
    }
  }

  function isV2Mobile() {
    return documentRef?.documentElement?.dataset?.ui === 'v2' && Number(windowRef?.innerWidth || 0) <= 860;
  }

  function setNavigationState(open) {
    const sidebar = documentRef?.getElementById?.('sidebar');
    const menuButton = documentRef?.getElementById?.('menuToggle');
    const main = documentRef?.querySelector?.('.main-content');
    if (!sidebar) return;
    sidebar.classList.toggle('open', open);
    menuButton?.setAttribute('aria-expanded', open ? 'true' : 'false');
    documentRef.documentElement.toggleAttribute('data-v2-nav-open', open && isV2Mobile());
    if (main && isV2Mobile()) main.inert = open;
    if (open && isV2Mobile()) {
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

  function applyMode(mode) {
    closeNavigation({ restoreFocus: false });
    organizeNavigation(mode);
    documentRef?.getElementById?.('v2UtilitiesMenu')?.removeAttribute('open');
  }

  function init(mode = documentRef?.documentElement?.dataset?.ui || 'classic') {
    if (initialized) return false;
    initialized = true;
    documentRef?.getElementById?.('sidebarScrim')?.addEventListener('click', () => closeNavigation());
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
        renderNotifications();
        notificationPanel?.classList.remove('hidden');
        notificationButton.setAttribute('aria-expanded', 'true');
        notificationPanel?.querySelector(FOCUSABLE)?.focus();
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
    });
    applyMode(mode);
    return true;
  }

  return Object.freeze({ init, applyMode, toggleNavigation, closeNavigation, handleKeydown });
}

function escapeText(value) {
  const element = globalThis.document?.createElement?.('span');
  if (!element) return String(value || '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  element.textContent = String(value || '');
  return element.innerHTML;
}

function escapeAttribute(value) {
  return escapeText(value).replace(/`/g, '&#96;');
}
