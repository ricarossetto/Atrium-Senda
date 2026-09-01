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

export function createUiV2Shell({
  documentRef = globalThis.document,
  windowRef = globalThis.window
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
    applyMode(mode);
    return true;
  }

  return Object.freeze({ init, applyMode, toggleNavigation, closeNavigation, handleKeydown });
}
