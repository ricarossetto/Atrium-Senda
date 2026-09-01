import { iconSvg as atriumIconSvg } from './icons.js';

function escapeText(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function iconSvg(name, { className = 'v2-local-icon', label = '' } = {}) {
  const aliases = { ready: 'check', offline: 'disconnected', process: 'processes', contact: 'contacts', task: 'tasks', publication: 'publications', sun: 'theme-light', moon: 'theme-dark' };
  return atriumIconSvg(aliases[name] || name, { className, label });
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
