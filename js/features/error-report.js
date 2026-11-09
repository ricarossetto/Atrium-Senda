import { buildErrorReportPayload, redactErrorReportText } from '../core/error-report.js?v=3.0.2';

/**
 * ATRIUM — Relato de erro com código próprio e envio opcional ao suporte.
 *
 * O overlay segue o mesmo contrato dos modais do sistema (Escape, trap de Tab,
 * clique no backdrop, foco inicial e restauração ao gatilho). O envio é sempre
 * explícito: a prévia mostra exatamente o payload redigido que será enviado.
 */

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function createErrorReportFeature({
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  secureFetch = (...args) => windowRef?.KellerAuth?.secureFetch(...args),
  escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])),
  showToast = () => {},
  now = () => new Date()
} = {}) {
  let initialized = false;
  let current = null;
  let lastFocusedElement = null;
  let previousBodyOverflow = '';
  let previousRootOverflow = '';
  let sending = false;
  const byId = id => documentRef?.getElementById(id);

  const setStatus = (message, tone = '') => {
    const status = byId('errorReportStatus');
    if (!status) return;
    status.textContent = message || '';
    if (tone) status.dataset.tone = tone;
    else delete status.dataset.tone;
  };

  const close = ({ restoreFocus = true } = {}) => {
    const backdrop = byId('errorReportBackdrop');
    if (!backdrop || backdrop.classList.contains('hidden')) return false;
    backdrop.classList.add('hidden');
    documentRef.documentElement.style.overflow = previousRootOverflow;
    documentRef.body.style.overflow = previousBodyOverflow;
    documentRef.getElementById('appShell')?.removeAttribute('inert');
    current = null;
    if (restoreFocus && lastFocusedElement?.isConnected && typeof lastFocusedElement.focus === 'function') lastFocusedElement.focus();
    return true;
  };

  const trapFocus = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const modal = documentRef.querySelector?.('#errorReportBackdrop .modal');
    const focusable = [...(modal?.querySelectorAll(FOCUSABLE) || [])].filter(element => element.getClientRects().length > 0);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && documentRef.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && documentRef.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const render = payload => {
    const when = now();
    if (byId('errorReportCode')) byId('errorReportCode').textContent = payload.code;
    if (byId('errorReportScope')) byId('errorReportScope').textContent = payload.scope;
    if (byId('errorReportMessage')) byId('errorReportMessage').textContent = payload.message;
    if (byId('errorReportWhen')) byId('errorReportWhen').textContent = when.toLocaleString('pt-BR');
    if (byId('errorReportDetails')) byId('errorReportDetails').textContent = payload.details || 'Sem detalhes técnicos adicionais.';
    if (byId('errorReportCodeHint')) {
      byId('errorReportCodeHint').textContent = payload.provisional
        ? 'Código provisório; o servidor confirma o código definitivo no envio.'
        : 'Use este código ao falar com o suporte.';
    }
    setStatus('');
  };

  const feature = {
    get isOpen() { return Boolean(current) && !byId('errorReportBackdrop')?.classList.contains('hidden'); },

    init() {
      if (initialized) return false;
      initialized = true;
      byId('errorReportClose')?.addEventListener('click', () => close());
      byId('errorReportDismiss')?.addEventListener('click', () => close());
      byId('errorReportCopy')?.addEventListener('click', () => feature.copyCode());
      byId('errorReportSend')?.addEventListener('click', () => { void feature.send(); });
      byId('errorReportBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('errorReportBackdrop')) close();
      });
      byId('errorReportBackdrop')?.addEventListener('keydown', trapFocus);
      return true;
    },

    async open({ scope = 'ATRIUM', message = '', details = '' } = {}) {
      feature.init();
      const backdrop = byId('errorReportBackdrop');
      if (!backdrop) return false;
      if (!String(message || '').trim()) return false;
      // Não interrompe outro overlay aberto: o erro continua registrado no console
      // e pode ser reportado pelo ponto de origem (ex.: painel de sincronização).
      const otherOverlay = documentRef.querySelector?.('.modal-backdrop:not(.hidden), .eproc-sync-modal-backdrop:not(.hidden)');
      if (otherOverlay && !feature.isOpen) {
        console.warn('[ATRIUM] Erro registrado enquanto outro overlay estava aberto:', scope, message);
        return false;
      }
      const payload = await buildErrorReportPayload({ scope, message, details, date: now() });
      current = payload;
      render(payload);
      if (!feature.isOpen) {
        lastFocusedElement = documentRef.activeElement;
        previousBodyOverflow = documentRef.body.style.overflow;
        previousRootOverflow = documentRef.documentElement.style.overflow;
      }
      backdrop.classList.remove('hidden');
      documentRef.documentElement.style.overflow = 'hidden';
      documentRef.body.style.overflow = 'hidden';
      documentRef.getElementById('appShell')?.setAttribute('inert', '');
      byId('errorReportClose')?.focus?.();
      return true;
    },

    close,

    async copyCode() {
      const code = byId('errorReportCode')?.textContent?.trim() || current?.code || '';
      if (!code) return false;
      try {
        await windowRef?.navigator?.clipboard?.writeText(code);
        setStatus('Código copiado para a área de transferência.', 'success');
        showToast('Código do erro copiado.', 'success');
        return true;
      } catch {
        byId('errorReportCode')?.focus?.();
        setStatus('Não foi possível copiar automaticamente; o código está selecionável acima.', 'warning');
        return false;
      }
    },

    async send() {
      if (sending || !current) return false;
      sending = true;
      const sendButton = byId('errorReportSend');
      if (sendButton) sendButton.disabled = true;
      setStatus('Enviando o relato ao suporte da plataforma…');
      try {
        const response = await secureFetch('/api/system/error-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ scope: current.scope, message: current.message, details: current.details })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Não foi possível registrar o relato agora.');
        if (data.code && byId('errorReportCode')) byId('errorReportCode').textContent = data.code;
        const tone = data.emailStatus === 'sent' ? 'success' : data.emailStatus === 'not_configured' ? 'warning' : 'error';
        setStatus(data.message || 'Relato registrado.', tone);
        showToast(data.message || 'Relato registrado.', tone === 'success' ? 'success' : 'warning');
        return true;
      } catch (error) {
        setStatus(error?.message || 'Falha ao enviar o relato.', 'error');
        showToast(error?.message || 'Falha ao enviar o relato.', 'error');
        return false;
      } finally {
        sending = false;
        if (sendButton) sendButton.disabled = false;
      }
    },

    // Prévia usada por testes e por integrações que precisam do código sem abrir o overlay.
    async preview(input = {}) {
      return buildErrorReportPayload({ scope: input.scope, message: input.message, details: redactErrorReportText(input.details, { max: 4000 }), date: now() });
    }
  };

  return feature;
}
