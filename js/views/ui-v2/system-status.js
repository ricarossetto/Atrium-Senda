import { iconSvg } from './primitives.js';

export const SYSTEM_STATUS_STATES = Object.freeze({
  ready: Object.freeze({ tone: 'neutral', label: 'Pronto', icon: 'ready', detail: 'Dados carregados; salvamento automático ativo.' }),
  syncing: Object.freeze({ tone: 'info', label: 'Sincronizando', icon: 'sync', detail: 'Aguarde a confirmação do servidor.' }),
  saved: Object.freeze({ tone: 'success', label: 'Salvo e sincronizado', icon: 'ready', detail: 'A operação foi confirmada e persistida.' }),
  partial: Object.freeze({ tone: 'warning', label: 'Sincronização parcial', icon: 'warning', detail: 'Parte da operação exige revisão.' }),
  error: Object.freeze({ tone: 'danger', label: 'Alterações não salvas', icon: 'warning', detail: 'A persistência não foi confirmada.' }),
  offline: Object.freeze({ tone: 'warning', label: 'Offline', icon: 'offline', detail: 'A conexão está indisponível; não há confirmação de sincronização.' }),
  conflict: Object.freeze({ tone: 'danger', label: 'Conflito de versão', icon: 'conflict', detail: 'Outra revisão venceu. Aguarde a recuperação segura.' }),
  reauth: Object.freeze({ tone: 'danger', label: 'Reautenticação necessária', icon: 'warning', detail: 'Entre novamente antes de salvar.' })
});

export function createSystemStatusBar({
  documentRef = globalThis.document,
  windowRef = globalThis.window
} = {}) {
  let initialized = false;
  let currentState = 'ready';
  let dismissTimer = null;

  function setState(state, detail) {
    const definition = SYSTEM_STATUS_STATES[state] || SYSTEM_STATUS_STATES.ready;
    currentState = SYSTEM_STATUS_STATES[state] ? state : 'ready';
    const bar = documentRef?.getElementById?.('systemStatusBar');
    if (!bar) return currentState;
    if (dismissTimer) windowRef?.clearTimeout?.(dismissTimer);
    bar.classList.remove('is-transient-hidden');
    bar.dataset.status = currentState;
    bar.dataset.tone = definition.tone;
    const icon = documentRef.getElementById('systemStatusIcon');
    const label = documentRef.getElementById('systemStatusLabel');
    const message = documentRef.getElementById('systemStatusDetail');
    if (icon) icon.innerHTML = iconSvg(definition.icon);
    if (label) label.textContent = definition.label;
    if (message) message.textContent = String(detail || definition.detail);
    if (['ready', 'saved'].includes(currentState)) {
      dismissTimer = windowRef?.setTimeout?.(() => bar.classList.add('is-transient-hidden'), currentState === 'saved' ? 4200 : 2600);
    }
    return currentState;
  }

  function init({ stateStatus } = {}) {
    if (initialized) return false;
    initialized = true;
    windowRef?.addEventListener?.('offline', () => setState('offline'));
    windowRef?.addEventListener?.('online', () => setState('ready', 'Conexão restabelecida; aguardando a próxima confirmação de sincronização.'));
    if (windowRef?.navigator?.onLine === false) setState('offline');
    else if (['RECOVERY_REQUIRED', 'FUTURE_SCHEMA_ERROR'].includes(stateStatus)) {
      setState('error', 'O sistema está em modo de recuperação; a gravação permanece bloqueada.');
    } else setState('ready');
    return true;
  }

  return Object.freeze({
    init,
    setState,
    get currentState() { return currentState; }
  });
}
