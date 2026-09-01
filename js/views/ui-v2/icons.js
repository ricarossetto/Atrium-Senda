const ICON_SPRITE_PATH = 'assets/icons/atrium-ui-icons.svg';

export const ATRIUM_ICON_NAMES = Object.freeze([
  'dashboard', 'processes', 'publications', 'tasks', 'agenda', 'contacts', 'leads',
  'financial', 'documents', 'assistant', 'prompts', 'monitoring', 'integrations',
  'configuration', 'importer', 'audit', 'links', 'menu', 'sidebar-collapse', 'search',
  'sync', 'notification', 'theme-light', 'theme-dark', 'close', 'add', 'edit', 'delete',
  'download', 'upload', 'external-link', 'filter', 'more', 'chevron-left',
  'chevron-right', 'chevron-down', 'check', 'warning', 'info', 'copy', 'send',
  'reopen', 'court', 'certificate', 'security', 'deadline', 'office', 'email',
  'disconnected', 'conflict'
]);

const ICON_NAME_SET = new Set(ATRIUM_ICON_NAMES);

function escapeAttribute(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function iconHref(name) {
  const normalizedName = ICON_NAME_SET.has(name) ? name : 'info';
  return `${ICON_SPRITE_PATH}#atrium-icon-${normalizedName}`;
}

export function iconSvg(name, { className = 'atrium-icon', label = '' } = {}) {
  const accessibility = label
    ? `role="img" aria-label="${escapeAttribute(label)}"`
    : 'aria-hidden="true"';
  return `<svg class="${escapeAttribute(className)}" ${accessibility} focusable="false"><use href="${iconHref(name)}"></use></svg>`;
}
