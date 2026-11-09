import { HOW_TO } from '../../core/setup-how-to.js?v=3.0.1';
/**
 * ATRIUM — bloco "Comece por aqui" do painel.
 *
 * Só apresenta o que falta, a partir do estado oficial: não cria dado, não abre prazo,
 * não dispara coleta. Cada passo leva à tela responsável. Ocultar vale para este navegador.
 */
export const FIRST_STEPS_HIDDEN_KEY = 'atrium_first_steps_hidden';

export function hasMonitoredOab(terms = []) {
  return (Array.isArray(terms) ? terms : []).some(term => {
    if (!term || term.active === false) return false;
    const registration = String(term.registration || '');
    return Boolean(term.oabNumber || /OAB\s*\/?\s*[A-Z]{2}\s*\d{3,}/i.test(registration)) && !/000000/.test(registration);
  });
}

export function computeFirstSteps(state = {}, status = {}) {
  const hasCertificate = state.settings?.hasA1Certificate;
  const certificateSteps = hasCertificate === true ? [
    {
      id: 'certificate',
      done: status.certificateValid === true,
      title: 'Envie o certificado',
      detail: 'O arquivo e a senha ficam cifrados no cofre do escritório.',
      how: HOW_TO.certificate,
      actions: [{ action: 'judicial', label: 'Enviar certificado' }]
    },
    {
      id: 'totp',
      done: status.totpLinked === true,
      title: 'Vincule o QR Code de cada tribunal',
      detail: 'É o que deixa a coleta do eproc e do PJe rodar sem você digitar códigos.',
      how: HOW_TO.totp,
      actions: [{ action: 'totp', label: 'Vincular QR Code' }]
    }
  ] : [];
  return [
    {
      id: 'oab',
      done: hasMonitoredOab(state.terms),
      title: 'Informe sua OAB',
      detail: 'É por ela que o ATRIUM encontra suas publicações no DJEN.',
      how: HOW_TO.oab,
      actions: [{ view: 'monitoring', label: 'Informar OAB' }]
    },
    {
      id: 'mfa',
      done: status.mfaEnabled === true,
      title: 'Proteja sua conta com duas etapas',
      detail: 'Além da senha, o login pede um código do celular.',
      how: HOW_TO.mfa,
      actions: [{ action: 'mfa', label: 'Ativar proteção' }]
    },
    {
      id: 'a1',
      done: hasCertificate !== undefined,
      title: 'Você tem certificado digital A1?',
      detail: 'É o arquivo .PFX ou .P12. Com ele, o ATRIUM também consulta eproc e PJe. Sem ele, DJEN e DataJud continuam funcionando.',
      actions: [{ choice: 'yes', label: 'Tenho' }, { choice: 'no', label: 'Não tenho' }]
    },
    ...certificateSteps,
    {
      id: 'processes',
      done: (state.processes || []).length > 0,
      title: 'Traga seus processos',
      detail: 'Importe uma planilha ou cadastre um processo.',
      how: HOW_TO.spreadsheet,
      actions: [{ view: 'importer', label: 'Importar planilha' }, { view: 'processes', label: 'Cadastrar processo' }]
    },
    {
      id: 'tasks',
      done: (state.tasks || []).length > 0,
      title: 'Crie a primeira tarefa',
      detail: 'Organize o que o escritório precisa fazer.',
      actions: [{ view: 'kanban', label: 'Ver tarefas' }]
    }
  ];
}

function readHidden(storage) {
  try {
    return storage?.getItem?.(FIRST_STEPS_HIDDEN_KEY) === 'true';
  } catch {
    return false;
  }
}

export function renderFirstSteps({ documentRef, state, status = {}, canManage = false, storage = null, escapeHtml, onAction = () => {} }) {
  const container = documentRef?.getElementById?.('v2FirstSteps');
  if (!container) return null;
  const steps = computeFirstSteps(state, status);
  const pending = steps.filter(step => !step.done).length;
  const visible = canManage && pending > 0 && !readHidden(storage);
  container.hidden = !visible;
  if (!visible) {
    container.innerHTML = '';
    return { visible: false, pending };
  }
  container.innerHTML = `
    <header class="v2-first-steps-head">
      <div>
        <p class="v2-kicker">Comece por aqui</p>
        <h3>Deixe o escritório pronto para usar</h3>
      </div>
      <div class="v2-first-steps-tools">
        <span class="v2-first-steps-count">${steps.length - pending} de ${steps.length} concluídos</span>
        <button type="button" class="button ghost" data-first-steps-hide>Ocultar</button>
      </div>
    </header>
    <ol class="v2-first-steps-list">
      ${steps.map((step, index) => `<li class="v2-first-step${step.done ? ' is-done' : ''}" data-first-step="${escapeHtml(step.id)}">
        <span class="v2-first-step-mark" aria-hidden="true">${step.done ? '<svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.0.1#atrium-icon-check"></use></svg>' : index + 1}</span>
        <div class="v2-first-step-copy">
          <strong>${escapeHtml(step.title)}${step.done ? '<span class="sr-only"> (concluído)</span>' : ''}</strong>
          <small>${escapeHtml(step.detail)}</small>
          ${!step.done && step.how ? `<details class="v2-first-step-how"><summary>Como fazer</summary><ol>${step.how.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol></details>` : ''}
        </div>
        ${step.done ? '' : `<div class="v2-first-step-actions">${step.actions.map(action => (action.view ? `<button type="button" class="button ghost" data-view-link="${escapeHtml(action.view)}">${escapeHtml(action.label)}</button>` : `<button type="button" class="button ghost" data-setup-action="${escapeHtml(action.action || `a1-${action.choice}`)}">${escapeHtml(action.label)}</button>`)).join('')}</div>`}
      </li>`).join('')}
    </ol>`;
  (container.querySelectorAll?.('[data-setup-action]') || []).forEach(button => button.addEventListener('click', () => onAction(button.dataset.setupAction)));
  container.querySelector('[data-first-steps-hide]')?.addEventListener('click', () => {
    try {
      storage?.setItem?.(FIRST_STEPS_HIDDEN_KEY, 'true');
    } catch {
      // Sem armazenamento local o bloco some só nesta tela e volta na próxima visita.
    }
    container.hidden = true;
    container.innerHTML = '';
  });
  return { visible: true, pending };
}
