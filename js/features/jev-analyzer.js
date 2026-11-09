import { Store } from '../core/store.js?v=3.0.0';
import { renderOperationalAnalysis } from '../views/ui-v2/operational-analysis.js?v=3.0.0';

export function createJevAnalyzerFeature({ store = Store, documentRef = globalThis.document, getAuth = () => globalThis.KellerAuth, renderPanel = renderOperationalAnalysis } = {}) {
  let busy = false;
  let error = '';
  let result = null;
  let kind = 'publications';
  let windowDays = 30;
  let denied = false;
  let identity = null;
  let discardConfirmation = null;
  const allowed = () => {
    const auth = getAuth();
    return auth?.authenticated === true && ['admin', 'master_admin'].includes(auth.currentUser?.role);
  };
  const sessionKey = () => {
    const auth = getAuth();
    const user = auth?.currentUser;
    return JSON.stringify([auth?.authenticated, user?.username, user?.id, user?.workspaceId, auth?.currentWorkspace?.id, user?.role]);
  };
  const host = () => documentRef?.getElementById('operationalAnalysis');
  const render = () => {
    if (!host()) return;
    if (identity !== sessionKey()) { result = null; error = ''; denied = false; discardConfirmation = null; identity = sessionKey(); }
    if (!allowed()) { result = null; error = ''; discardConfirmation = null; }
    const active = documentRef.activeElement?.dataset?.analysisAction;
    host().innerHTML = renderPanel({ allowed: allowed() && !denied, busy, error, result, kind, windowDays, refreshPending: store.canonicalRefreshPending, dirty: store.canonicalRefreshPending && store.persistenceFingerprint() !== store.persistedFingerprint, discardConfirmation: Boolean(discardConfirmation), sourceRevision: store.canonicalRefreshSourceRevision });
    if (active) host().querySelector(`[data-analysis-action="${active}"]`)?.focus();
  };
  async function request(path, options, key) {
    const response = await getAuth().secureFetch(path, options);
    if (key !== sessionKey() || !allowed()) throw Object.assign(new Error(), { status: 403 });
    if (!response.ok) throw Object.assign(new Error(), { status: response.status });
    const payload = await response.json();
    if (key !== sessionKey() || !allowed()) throw Object.assign(new Error(), { status: 403 });
    if (payload.ok !== true || payload.schema !== 'atrium-operational-analysis/1' || typeof payload.sourceRevision !== 'string' || !payload.data || !payload.coverage || !payload.pagination || payload.requiresHumanReview !== true) throw new Error();
    return payload;
  }
  async function run(action) {
    if (busy || !allowed() || denied) { render(); return false; }
    const key = sessionKey();
    if (action === 'discard') {
      if (!store.canonicalRefreshPending) return false;
      discardConfirmation = { expectedFingerprint: store.persistenceFingerprint(), expectedRevision: store.revision, key };
      error = '';
      render();
      host()?.querySelector('[data-analysis-action="cancel-discard"]')?.focus();
      return false;
    }
    if (action === 'cancel-discard') {
      discardConfirmation = null;
      render();
      host()?.querySelector('[data-analysis-action="discard"]')?.focus();
      return false;
    }
    const confirmation = discardConfirmation;
    if (action === 'confirm-discard' && (!confirmation || confirmation.key !== key)) return false;
    discardConfirmation = null;
    const canApply = () => key === sessionKey() && allowed();
    busy = true;
    error = '';
    if (action !== 'next') result = null;
    render();
    try {
      if (action === 'refresh' || action === 'confirm-discard') {
        if (await store.refreshCanonicalState({ ...(action === 'confirm-discard' ? { ...confirmation, discardConfirmed: true } : {}), canApply }) !== true) throw Object.assign(new Error(), { reason: 'reload' });
        result = null;
      } else if (action === 'plan' || action === 'native') {
        const outcome = await store.canonicalMutation(async expectedRevision => {
          if (typeof expectedRevision !== 'string' || !expectedRevision || key !== sessionKey() || !allowed()) throw new Error();
          const payload = await request('/api/jev/action-plan', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ expectedRevision, advisory: action === 'native', windowDays })
          }, key);
          if (typeof payload.revision !== 'string' || payload.refreshCanonicalState !== true) throw new Error();
          return payload;
        }, { canApply });
        result = outcome.result || null;
        if (outcome.ok !== true) throw Object.assign(new Error(), { reason: outcome.reason });
      } else {
        const params = new URLSearchParams({ windowDays: String(windowDays), limit: '20' });
        if (action === 'next') {
          if (!result?.pagination?.nextCursor) return false;
          params.set('cursor', result.pagination.nextCursor);
        }
        result = await request(`/api/jev/analysis/${kind}?${params}`, { headers: { Accept: 'application/json' } }, key);
      }
      return true;
    } catch (failure) {
      if (failure.status === 401 || failure.status === 403) { denied = true; result = null; }
      else if (failure.status === 409) { result = null; error = 'Conflito de revisão ou página expirada (409). Recarregue a análise; para o plano, atualize o estado consolidado antes de tentar novamente.'; }
      else if (failure.reason === 'reload') error = 'Recarga não confirmada: conexão, sessão ou dados locais mudaram. Suas edições permanecem no navegador e o salvamento continua bloqueado. Confira os dados e confirme novamente somente se aceitar o descarte.';
      else if (failure.reason === 'refresh') error = 'A auditoria pode ter sido gravada, mas a atualização oficial não foi confirmada. Edições locais preservadas e salvamento bloqueado. Mantenha esta aba aberta para conferi-las ou use o descarte confirmado abaixo. Não repita o plano.';
      else if (failure.reason) error = 'Salvamento pendente ou não confirmado. O plano não foi enviado. Resolva a persistência antes de tentar novamente.';
      else error = 'Não foi possível confirmar a análise. Verifique a conexão e tente novamente. Se solicitou um plano, atualize o estado consolidado antes de repetir: a auditoria pode já ter sido gravada.';
      return false;
    } finally {
      busy = false;
      if (key !== sessionKey() || !allowed()) result = null;
      render();
      host()?.querySelector(`[data-analysis-action="${action === 'confirm-discard' ? (store.canonicalRefreshPending ? 'discard' : 'plan') : action}"]`)?.focus();
    }
  }
  function mount() {
    const container = host();
    if (!container) return false;
    if (!container.dataset.analysisBound) {
      container.dataset.analysisBound = 'true';
      container.addEventListener('click', event => {
        const action = event.target.closest('[data-analysis-action]')?.dataset.analysisAction;
        if (['read', 'next', 'plan', 'native', 'refresh', 'discard', 'confirm-discard', 'cancel-discard'].includes(action)) void run(action);
      });
      container.addEventListener('keydown', event => {
        if (event.key === 'Escape' && discardConfirmation && !busy) {
          event.preventDefault();
          void run('cancel-discard');
        }
      });
      container.addEventListener('change', event => {
        if (busy) return;
        if (event.target.matches('[data-analysis-kind]') && ['publications', 'tasks', 'productivity', 'risks'].includes(event.target.value)) kind = event.target.value;
        else if (event.target.matches('[data-analysis-window]') && ['30', '90'].includes(event.target.value)) windowDays = Number(event.target.value);
        else return;
        result = null;
        error = '';
        const control = event.target.hasAttribute('data-analysis-kind') ? '[data-analysis-kind]' : '[data-analysis-window]';
        render();
        container.querySelector(control)?.focus();
      });
    }
    render();
    return true;
  }
  return { mount, render, run };
}
