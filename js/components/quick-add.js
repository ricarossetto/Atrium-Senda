export function createQuickAdd({ documentRef = globalThis.document, onSelect } = {}) {
  let initialized = false;
  let open = false;
  let activeIndex = -1;

  const byId = id => documentRef.getElementById(id);
  const getButton = () => byId('quickAddButton');
  const getMenu = () => byId('quickAddMenu');
  const getItems = () => [...(getMenu()?.querySelectorAll('[data-quick-add]') || [])];

  function applyActive() {
    getItems().forEach((item, index) => {
      item.classList.toggle('is-active', index === activeIndex);
    });
  }

  function close({ restoreFocus = true } = {}) {
    const button = getButton();
    const menu = getMenu();
    if (!open || !button || !menu) return;
    open = false;
    activeIndex = -1;
    menu.hidden = true;
    menu.classList.add('hidden');
    button.setAttribute('aria-expanded', 'false');
    applyActive();
    if (restoreFocus) button.focus?.();
  }

  function openMenu() {
    const button = getButton();
    const menu = getMenu();
    if (!button || !menu) return;
    open = true;
    menu.hidden = false;
    menu.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
    activeIndex = 0;
    applyActive();
    getItems()[0]?.focus?.();
  }

  function toggle() {
    if (open) close();
    else openMenu();
  }

  function focusIndex(index) {
    const items = getItems();
    if (!items.length) return;
    activeIndex = Math.max(0, Math.min(index, items.length - 1));
    applyActive();
    items[activeIndex]?.focus?.();
  }

  function select(index) {
    const item = getItems()[index];
    if (!item) return;
    const action = item.dataset.quickAdd;
    close();
    onSelect?.(action, item);
  }

  function init() {
    if (initialized) return false;
    const button = getButton();
    const menu = getMenu();
    if (!button || !menu) return false;
    initialized = true;
    menu.hidden = true;
    menu.classList.add('hidden');
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-controls', 'quickAddMenu');
    button.setAttribute('aria-expanded', 'false');
    getItems().forEach(item => {
      item.tabIndex = -1;
      item.setAttribute('role', 'menuitem');
    });
    button.addEventListener('click', toggle);
    button.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown') return;
      event.preventDefault();
      openMenu();
    });
    menu.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusIndex(activeIndex + 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusIndex(activeIndex - 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        focusIndex(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        focusIndex(getItems().length - 1);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'Tab') {
        close();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        select(activeIndex);
      }
    });
    menu.addEventListener('click', event => {
      const item = event.target.closest('[data-quick-add]');
      if (!item) return;
      select(getItems().indexOf(item));
    });
    documentRef.addEventListener('click', event => {
      if (open && !event.target?.closest?.('#quickAdd')) close({ restoreFocus: false });
    });
    return true;
  }

  return Object.freeze({ init, open: openMenu, close, isOpen: () => open });
}
