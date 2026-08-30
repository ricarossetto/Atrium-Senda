const ICONS = Object.freeze({
  ready: '<path d="M5 12.5l4 4L19 6.5"/>',
  sync: '<path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 9a7 7 0 0 1 11.7-2L20 12M4 12l2.2 5a7 7 0 0 0 11.7-2"/>',
  warning: '<path d="M12 3l9 17H3L12 3z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  offline: '<path d="M2 8.8A15 15 0 0 1 22 8.8"/><path d="M5 12.5a10 10 0 0 1 14 0"/><path d="M8.5 16a5 5 0 0 1 7 0"/><path d="M3 3l18 18"/>',
  conflict: '<path d="M8 7h11l-3-3"/><path d="M16 17H5l3 3"/><path d="M19 7v4M5 17v-4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  process: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 10h18"/>',
  contact: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  task: '<path d="M9 5h10M9 12h10M9 19h10"/><path d="M4 5h.01M4 12h.01M4 19h.01"/>',
  publication: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.5 14.5A8 8 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>'
});

function escapeText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function iconSvg(name, { className = 'v2-local-icon', label = '' } = {}) {
  const icon = ICONS[name] || ICONS.ready;
  const accessibility = label
    ? `role="img" aria-label="${escapeText(label)}"`
    : 'aria-hidden="true"';
  return `<svg class="${escapeText(className)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${accessibility}>${icon}</svg>`;
}

export function statusBadge({ label, tone = 'neutral', icon = 'ready' } = {}) {
  return `<span class="v2-status-badge is-${escapeText(tone)}">${iconSvg(icon)}<span>${escapeText(label)}</span></span>`;
}

export function inlineAlert({ title, message, tone = 'info' } = {}) {
  return `<section class="v2-inline-alert is-${escapeText(tone)}" role="status"><strong>${escapeText(title)}</strong><p>${escapeText(message)}</p></section>`;
}

export function emptyState({ title, message } = {}) {
  return `<div class="v2-empty-state"><strong>${escapeText(title)}</strong><p>${escapeText(message)}</p></div>`;
}

export function loadingState({ label = 'Carregando…' } = {}) {
  return `<div class="v2-loading-state" role="status" aria-busy="true">${iconSvg('sync')}<span>${escapeText(label)}</span></div>`;
}

export function errorState({ title = 'Não foi possível carregar', message = '' } = {}) {
  return `<div class="v2-error-state" role="alert">${iconSvg('warning')}<strong>${escapeText(title)}</strong><p>${escapeText(message)}</p></div>`;
}
