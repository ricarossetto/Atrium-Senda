/**
 * ATRIUM — Alerta interno de risco para ações em lote do Atrium IA.
 *
 * Padrão de segurança pedido pelo escritório para qualquer movimentação em lote que muda o
 * acervo (fusões em massa, tratamentos em lote, correções em série): a pessoa vê a consequência
 * em linguagem clara, precisa **declarar que entendeu o risco** e só então confirma — com a
 * opção de não ser perguntada de novo.
 *
 * Dois passos, de propósito:
 * 1. "Compreendo os riscos e desejo continuar" (ou "Não, vou revisar manualmente");
 * 2. com o risco reconhecido, aparece o "Não perguntar novamente" e o botão final da ação.
 *
 * O texto é fixo (contrato) e o componente é puro na renderização; o `createRiskConfirm` monta
 * o overlay no documento, cuida de foco/escape e persiste a preferência de não perguntar.
 */
import { iconSvg } from '../views/ui-v2/icons.js?v=3.0.1';

export const RISK_CONFIRM_COPY = Object.freeze({
  title: 'Você tem certeza que deseja confirmar todas as sugestões do Atrium IA?',
  acknowledge: 'Compreendo os riscos e desejo continuar',
  cancel: 'Não, vou revisar manualmente',
  skip: 'Não perguntar novamente',
  confirmAll: 'Confirmar todas as sugestões'
});

export const RISK_CONFIRM_NOTE = 'Cada item fica registrado na auditoria com o seu nome, e a fusão de publicações é reversível (o registro absorvido continua acessível). Nada é apagado.';

/**
 * Render puro do diálogo. `step` é 'ack' (reconhecer o risco) ou 'confirm' (decisão final).
 */
export function renderRiskConfirm({ options = {}, step = 'ack', skipChecked = false, escapeHtml = String } = {}) {
  const copy = { ...RISK_CONFIRM_COPY, ...(options.copy || {}) };
  const count = Number(options.count) || 0;
  const details = Array.isArray(options.details) ? options.details.filter(Boolean) : [];
  const countLabel = count > 0
    ? `<strong>${escapeHtml(String(count))}</strong> ${escapeHtml(options.countLabel || (count === 1 ? 'item será afetado' : 'itens serão afetados'))}`
    : '';
  const detailsHtml = details.length
    ? `<ul class="risk-confirm-list">${details.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '';
  const acknowledge = step === 'confirm'
    ? `<div class="risk-confirm-skip field">
        <label class="risk-confirm-skip-label">
          <input type="checkbox" id="riskConfirmSkip" ${skipChecked ? 'checked' : ''}>
          <span>${escapeHtml(copy.skip)}</span>
        </label>
      </div>
      <footer>
        <button type="button" class="button ghost" data-risk-action="cancel">${escapeHtml(copy.cancel)}</button>
        <button type="button" class="button gold" data-risk-action="confirm" id="riskConfirmAccept">${escapeHtml(copy.confirmAll)}</button>
      </footer>`
    : `<footer>
        <button type="button" class="button ghost" data-risk-action="cancel" id="riskConfirmCancel">${escapeHtml(copy.cancel)}</button>
        <button type="button" class="button gold" data-risk-action="acknowledge" id="riskConfirmAcknowledge">${escapeHtml(copy.acknowledge)}</button>
      </footer>`;
  return `<div class="modal-backdrop risk-confirm-backdrop" id="riskConfirmBackdrop">
    <section class="modal risk-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="riskConfirmTitle" aria-describedby="riskConfirmDescription">
      <header>
        <div>
          <p class="eyebrow">Confirme a ação</p>
          <h2 id="riskConfirmTitle">${escapeHtml(copy.title)}</h2>
        </div>
        <button type="button" class="icon-button" data-risk-action="cancel" aria-label="Fechar confirmação">${iconSvg('close')}</button>
      </header>
      <div class="modal-body">
        <p id="riskConfirmDescription">${escapeHtml(options.message || 'Esta ação será aplicada de uma vez. Depois de confirmar, cada item pode ser revisto individualmente pela auditoria.')}</p>
        ${countLabel ? `<p class="risk-confirm-count">${countLabel}</p>` : ''}
        ${detailsHtml}
        <p class="risk-confirm-note">${escapeHtml(options.note || RISK_CONFIRM_NOTE)}</p>
      </div>
      ${acknowledge}
    </section>
  </div>`;
}

/**
 * Monta o diálogo e devolve `Promise<boolean>`: `true` quando a pessoa confirma a ação em lote,
 * `false` quando cancela (ou fecha com Escape). Com "não perguntar novamente" gravado, resolve
 * `true` direto — a autorização já foi dada para aquele escritório/navegador.
 */
export function createRiskConfirm({
  documentRef = globalThis.document,
  storageKey = 'atrium:ai:bulk-confirm-skip',
  escapeHtml = String
} = {}) {
  const readSkip = () => {
    try { return documentRef?.defaultView?.localStorage?.getItem(storageKey) === 'true'; } catch { return false; }
  };
  const writeSkip = value => {
    try {
      if (value) documentRef?.defaultView?.localStorage?.setItem(storageKey, 'true');
      else documentRef?.defaultView?.localStorage?.removeItem(storageKey);
    } catch { /* preferência opcional */ }
  };

  return Object.freeze({
    isSkipEnabled: readSkip,
    resetSkip() { writeSkip(false); },
    open(options = {}) {
      if (readSkip()) return Promise.resolve(true);
      return new Promise(resolve => {
        const host = documentRef.createElement('div');
        host.className = 'risk-confirm-host';
        documentRef.body.appendChild(host);
        let step = 'ack';
        let finished = false;

        const close = confirmed => {
          if (finished) return;
          finished = true;
          if (confirmed && step === 'confirm') {
            const skip = Boolean(host.querySelector('#riskConfirmSkip')?.checked);
            writeSkip(skip);
          }
          documentRef.removeEventListener('keydown', onKeydown, true);
          host.remove();
          resolve(confirmed);
        };

        const onKeydown = event => {
          if (event.key === 'Escape') {
            event.preventDefault();
            close(false);
          }
        };

        const paint = () => {
          host.innerHTML = renderRiskConfirm({
            options,
            step,
            skipChecked: readSkip(),
            escapeHtml
          });
          const backdrop = host.querySelector('#riskConfirmBackdrop');
          backdrop?.addEventListener('click', event => {
            if (event.target === backdrop) close(false);
          });
          host.querySelectorAll('[data-risk-action]').forEach(button => {
            button.addEventListener('click', () => {
              const action = button.dataset.riskAction;
              if (action === 'cancel') { close(false); return; }
              if (action === 'acknowledge') { step = 'confirm'; paint(); return; }
              if (action === 'confirm') close(true);
            });
          });
          (host.querySelector('#riskConfirmCancel')
            || host.querySelector('#riskConfirmCancelTop')
            || host.querySelector('[data-risk-action="confirm"]')
            || host.querySelector('[data-risk-action="acknowledge"]'))?.focus();
        };

        documentRef.addEventListener('keydown', onKeydown, true);
        paint();
      });
    }
  });
}
