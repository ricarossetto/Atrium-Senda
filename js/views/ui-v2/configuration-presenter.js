import { UI_MODE_CHANGE_EVENT } from './mode.js';

const SECTION_GROUPS = Object.freeze([
  Object.freeze({ label: 'Estrutura', keys: Object.freeze(['taskDefinitions', 'actionGroups', 'actionTypes', 'stages', 'origins']) }),
  Object.freeze({ label: 'Equipe', keys: Object.freeze(['users', 'goals']) }),
  Object.freeze({ label: 'Fluxo', keys: Object.freeze(['inboxSections', 'notificationAssignments']) }),
  Object.freeze({ label: 'Sistema', keys: Object.freeze(['integrations', 'diagnostic', 'backups']) })
]);

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export function createConfigurationAdminPresenter({
  documentRef = globalThis.document,
  onOpenOfficeIdentity = () => {},
  onCloseOfficeIdentity = () => {}
} = {}) {
  let initialized = false;
  let lastFocusedElement = null;
  let previousBodyOverflow = '';

  const byId = id => documentRef?.getElementById(id);
  const isV2 = () => documentRef?.documentElement?.dataset?.ui === 'v2';
  const officeBackdrop = () => byId('officeSetupBackdrop');
  const officeDialog = () => officeBackdrop()?.querySelector('[role="dialog"]');
  const visibleFocusable = () => [...(officeDialog()?.querySelectorAll(FOCUSABLE_SELECTOR) || [])]
    .filter(element => !element.hidden && element.getClientRects().length > 0);

  function identityEntry() {
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.id = 'openOfficeIdentityFromConfiguration';
    button.className = 'configuration-identity-entry';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', 'officeSetupBackdrop');
    button.innerHTML = `
      <span class="configuration-identity-mark" aria-hidden="true">A</span>
      <span><strong>Identidade do Escritório</strong><small>Marca, responsável e sede</small></span>
      <span class="configuration-entry-arrow" aria-hidden="true">→</span>`;
    button.addEventListener('click', () => onOpenOfficeIdentity());
    return button;
  }

  function groupNavigation(activeSection) {
    const navigation = byId('configurationTabs');
    if (!navigation || !isV2()) return false;
    const buttons = new Map(
      [...navigation.querySelectorAll('button[data-config-section]')]
        .map(button => [button.dataset.configSection, button])
    );
    navigation.replaceChildren(identityEntry());
    navigation.setAttribute('role', 'navigation');
    navigation.setAttribute('aria-label', 'Seções administrativas');

    for (const group of SECTION_GROUPS) {
      const container = documentRef.createElement('div');
      container.className = 'configuration-nav-group';
      const heading = documentRef.createElement('p');
      heading.className = 'configuration-nav-heading';
      heading.textContent = group.label;
      container.append(heading);
      for (const key of group.keys) {
        const button = buttons.get(key);
        if (!button) continue;
        button.type = 'button';
        const selected = key === activeSection;
        button.setAttribute('aria-current', selected ? 'page' : 'false');
        button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        container.append(button);
      }
      navigation.append(container);
    }
    return true;
  }

  function handleOfficeKeydown(event) {
    if (!isV2() || officeBackdrop()?.classList.contains('hidden')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onCloseOfficeIdentity();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = visibleFocusable();
    if (!focusable.length) {
      event.preventDefault();
      officeDialog()?.focus();
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
    init() {
      if (initialized) return false;
      initialized = true;
      officeBackdrop()?.addEventListener('keydown', handleOfficeKeydown);
      documentRef?.addEventListener?.(UI_MODE_CHANGE_EVENT, event => {
        if (event.detail?.mode === 'v2') groupNavigation(byId('configurationTabs')?.querySelector('.active')?.dataset.configSection);
      });
      return true;
    },

    sync({ section = 'taskDefinitions' } = {}) {
      if (!isV2()) return false;
      groupNavigation(section);
      const search = byId('configurationSearch');
      search?.setAttribute('aria-label', 'Buscar na configuração ativa');
      const list = byId('configurationList');
      list?.setAttribute('role', 'list');
      list?.setAttribute('aria-label', `Registros de ${byId('configurationHeading')?.textContent || 'configuração'}`);
      return true;
    },

    openOfficeIdentity() {
      if (!isV2()) return false;
      lastFocusedElement = documentRef.activeElement;
      previousBodyOverflow = documentRef.body?.style?.overflow || '';
      byId('appShell')?.setAttribute('inert', '');
      if (documentRef.body) documentRef.body.style.overflow = 'hidden';
      const dialog = officeDialog();
      dialog?.setAttribute('tabindex', '-1');
      const preferred = byId('officeInputName');
      (preferred?.getClientRects().length ? preferred : visibleFocusable()[0] || dialog)?.focus();
      return true;
    },

    closeOfficeIdentity() {
      if (!isV2()) return false;
      byId('appShell')?.removeAttribute('inert');
      if (documentRef.body) documentRef.body.style.overflow = previousBodyOverflow;
      const target = lastFocusedElement;
      lastFocusedElement = null;
      if (target?.isConnected && typeof target.focus === 'function') target.focus();
      return true;
    }
  });
}
