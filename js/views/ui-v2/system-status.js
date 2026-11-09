import { iconSvg } from './primitives.js?v=3.0.1';

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
  let activeVisualPercent = 0;
  let activateHandler = null;
  let statusOwner = null;

  function isMobileViewport() {
    return Boolean(windowRef?.matchMedia?.('(max-width: 767px)')?.matches);
  }

  function setBarHidden(hidden) {
    const bar = documentRef?.getElementById?.('systemStatusBar');
    if (!bar) return;
    bar.classList.toggle('is-transient-hidden', hidden);
    if (hidden) bar.setAttribute('aria-hidden', 'true');
    else bar.removeAttribute('aria-hidden');
  }

  function setInteractive(handler) {
    const bar = documentRef?.getElementById?.('systemStatusBar');
    activateHandler = typeof handler === 'function' ? handler : null;
    if (!activateHandler && statusOwner === 'eproc') statusOwner = null;
    if (!bar) return;
    const interactive = Boolean(activateHandler);
    bar.classList.toggle('is-interactive', interactive);
    if (interactive) {
      bar.setAttribute('tabindex', '0');
      bar.setAttribute('role', 'button');
      bar.setAttribute('aria-label', 'Abrir acompanhamento da sincronização eproc');
      bar.setAttribute('aria-controls', 'eprocSyncModalBackdrop');
    } else {
      bar.removeAttribute('tabindex');
      bar.setAttribute('role', 'status');
      bar.removeAttribute('aria-label');
      bar.removeAttribute('aria-controls');
    }
  }

  function setState(state, detail, percent = null, options = {}) {
    if (statusOwner && options.owner !== statusOwner && options.owner !== null) {
      if (options.clearOwner) {
        statusOwner = null;
        setInteractive(null);
      } else if (!['offline', 'conflict', 'reauth', 'error'].includes(state)) {
        return currentState;
      } else {
        statusOwner = null;
        setInteractive(null);
      }
    }
    if (options.owner === null || options.clearOwner) {
      statusOwner = null;
      setInteractive(null);
    }
    const definition = SYSTEM_STATUS_STATES[state] || SYSTEM_STATUS_STATES.ready;
    const wasSyncing = currentState === 'syncing';
    currentState = SYSTEM_STATUS_STATES[state] ? state : 'ready';
    const bar = documentRef?.getElementById?.('systemStatusBar');
    if (!bar) return currentState;
    if (options.owner !== undefined) statusOwner = options.owner;
    if (options.onActivate !== undefined) setInteractive(options.onActivate);
    if (dismissTimer) windowRef?.clearTimeout?.(dismissTimer);
    setBarHidden(false);
    bar.dataset.status = currentState;
    bar.dataset.tone = definition.tone;
    const icon = documentRef.getElementById('systemStatusIcon');
    const label = documentRef.getElementById('systemStatusLabel');
    const percentEl = documentRef.getElementById('systemStatusPercent');
    const message = documentRef.getElementById('systemStatusDetail');
    const progressTrack = documentRef?.getElementById?.('systemStatusProgressTrack');
    const progressFill = documentRef?.getElementById?.('systemStatusProgressFill');

    const isSyncing = currentState === 'syncing';

    if (icon) {
      const iconKey = definition.icon;
      const iconClass = isSyncing ? 'v2-local-icon is-running' : 'v2-local-icon';
      if (icon.dataset?.statusIcon !== iconKey || !icon.firstElementChild) {
        icon.innerHTML = iconSvg(iconKey, { className: iconClass });
        if (icon.dataset) icon.dataset.statusIcon = iconKey;
      }
    }

    const isDeterminate = isSyncing && options.determinate !== false && typeof percent === 'number' && Number.isFinite(percent);

    if (isSyncing) {
      if (isDeterminate) {
        const raw = Math.min(100, Math.max(0, Math.round(percent)));
        activeVisualPercent = raw;
        if (percentEl) {
          percentEl.classList.remove('hidden');
          percentEl.textContent = `${activeVisualPercent}%`;
          if (label) label.textContent = definition.label;
        } else if (label) {
          label.textContent = `${definition.label} (${activeVisualPercent}%)`;
        }
      } else {
        if (!wasSyncing) activeVisualPercent = 0;
        if (percentEl) {
          percentEl.classList.add('hidden');
          percentEl.textContent = '';
        }
        if (label) label.textContent = definition.label;
      }
    } else {
      activeVisualPercent = 0;
      if (percentEl) {
        percentEl.classList.add('hidden');
        percentEl.textContent = '';
      }
      if (label) {
        label.textContent = definition.label;
      }
    }

    if (message) message.textContent = String(detail || definition.detail);

    if (progressTrack && progressFill) {
      if (isSyncing) {
        progressTrack.classList.remove('hidden');
        progressTrack.removeAttribute?.('aria-hidden');
        progressTrack.setAttribute?.('role', 'progressbar');
        progressTrack.setAttribute?.('aria-label', 'Progresso da sincronização');

        if (isDeterminate) {
          progressTrack.classList.remove('is-indeterminate');
          progressTrack.setAttribute?.('aria-valuemin', '0');
          progressTrack.setAttribute?.('aria-valuemax', '100');
          progressTrack.setAttribute?.('aria-valuenow', String(activeVisualPercent));
          progressFill.style.width = `${activeVisualPercent}%`;
        } else {
          progressTrack.classList.add('is-indeterminate');
          progressTrack.removeAttribute?.('aria-valuenow');
          progressTrack.removeAttribute?.('aria-valuemin');
          progressTrack.removeAttribute?.('aria-valuemax');
          progressFill.style.width = '';
        }
      } else {
        progressTrack.classList.remove('is-indeterminate');
        progressTrack.classList.add('hidden');
        progressTrack.setAttribute?.('aria-hidden', 'true');
        progressTrack.removeAttribute?.('aria-valuenow');
        progressFill.style.width = '0%';
      }
    }

    if (currentState === 'ready') {
      // O estado neutro não diz nada novo: a barra só aparece quando há o que informar.
      setBarHidden(true);
    } else if (currentState === 'saved') {
      dismissTimer = windowRef?.setTimeout?.(() => {
        if (isMobileViewport()) {
          setBarHidden(true);
          currentState = 'ready';
          statusOwner = null;
        } else {
          setState('ready');
        }
      }, 2200);
    } else if (['error', 'partial'].includes(currentState)) {
      dismissTimer = windowRef?.setTimeout?.(() => {
        if (isMobileViewport()) {
          setBarHidden(true);
          currentState = 'ready';
          statusOwner = null;
        } else {
          setState('ready');
        }
      }, 8000);
    }
    return currentState;
  }

  function init({ stateStatus } = {}) {
    if (initialized) return false;
    initialized = true;
    const bar = documentRef?.getElementById?.('systemStatusBar');
    bar?.addEventListener?.('click', () => {
      if (activateHandler) {
        activateHandler();
      } else if (['error', 'partial'].includes(currentState)) {
        setBarHidden(true);
        currentState = 'ready';
        statusOwner = null;
      }
    });
    bar?.addEventListener?.('keydown', event => {
      if (!['Enter', ' '].includes(event.key)) return;
      if (activateHandler) {
        event.preventDefault();
        activateHandler();
      } else if (['error', 'partial'].includes(currentState)) {
        event.preventDefault();
        setBarHidden(true);
        currentState = 'ready';
        statusOwner = null;
      }
    });
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
    setInteractive,
    get currentState() { return currentState; }
  });
}
