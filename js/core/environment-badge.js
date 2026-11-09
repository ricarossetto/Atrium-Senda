// Selo de ambiente experimental do MEGA BETA.
// Consulta /api/health (fonte server-side) e exibe a identificação apenas quando
// ATRIUM_ENV=beta. Não lê nem exibe segredos: o health público retorna ambiente,
// build e o estado efetivo das flags declaradas.

const BADGE_ID = 'atriumEnvironmentBadge';
const HEALTH_PATH = '/api/health';

function apiBaseUrl() {
  const configured = globalThis.ATRIUM_CONFIG?.apiBaseUrl;
  return typeof configured === 'string' ? configured.replace(/\/$/, '') : '';
}

function buildBadge(status) {
  const badge = document.createElement('div');
  badge.id = BADGE_ID;
  badge.className = 'atrium-env-badge';
  badge.setAttribute('role', 'status');
  badge.setAttribute('aria-label', 'Ambiente experimental beta');

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('class', 'atrium-icon atrium-env-badge__icon');
  icon.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', 'assets/icons/atrium-ui-icons.svg?v=3.0.1#atrium-icon-info');
  icon.append(use);

  const label = document.createElement('span');
  label.className = 'atrium-env-badge__label';
  label.textContent = 'BETA — AMBIENTE EXPERIMENTAL';

  const meta = document.createElement('span');
  meta.className = 'atrium-env-badge__meta';
  const buildId = String(status.buildId || status.commitSha || '').slice(0, 7);
  meta.textContent = [status.appVersion, buildId].filter(Boolean).join(' · ');

  badge.append(icon, label, meta);
  return badge;
}

async function renderEnvironmentBadge() {
  if (document.getElementById(BADGE_ID)) return;
  try {
    const response = await fetch(`${apiBaseUrl()}${HEALTH_PATH}`, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin'
    });
    if (!response.ok) return;
    const status = await response.json().catch(() => null);
    if (!status || status.betaMode !== true || status.environment !== 'beta') return;
    if (document.getElementById(BADGE_ID)) return;
    document.body.append(buildBadge(status));
  } catch {
    // Health indisponível não bloqueia o portal.
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { void renderEnvironmentBadge(); }, { once: true });
} else {
  void renderEnvironmentBadge();
}
