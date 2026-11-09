/**
 * ATRIUM — densidade padrão derivada do plano do escritório.
 *
 * `basic` e `pro` são a MESMA aplicação (mesmo Store, backend, rotas, RBAC e prazos):
 * muda apenas a superfície. O plano define a densidade PADRÃO; uma preferência local
 * explícita (Configurações → Experimental) sempre vence. Isto nunca é permissão.
 */
export function resolveDensityFromPlan(plan, storedPreference, hostname) {
  const stored = String(storedPreference || '').trim().toLowerCase();
  if (stored === 'basic' || stored === 'pro') return stored;
  const host = String(hostname || '').toLowerCase();
  if (host === 'basic.atrium.adv.br' || host.endsWith('.basic.atrium.adv.br')) return 'basic';
  if (!['atrium.adv.br', 'localhost', '127.0.0.1'].includes(host)) return 'pro';
  return String(plan || '').trim().toLowerCase() === 'basic' ? 'basic' : 'pro';
}
