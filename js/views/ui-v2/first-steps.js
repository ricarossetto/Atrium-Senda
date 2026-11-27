import { HOW_TO } from '../../core/setup-how-to.js?v=3.4.0';
/**
 * ATRIUM — bloco "Comece por aqui" do painel.
 *
 * Só apresenta o que falta, a partir do estado oficial: não cria dado, não abre prazo,
 * não dispara coleta. Cada passo leva à tela responsável. Ocultar fica gravado no perfil do
 * usuário no servidor (`onHide`) e vale em qualquer navegador; a cópia local é só atalho.
 */
export const FIRST_STEPS_HIDDEN_KEY = 'atrium_first_steps_hidden';

/** Chave local por conta e escritório, para evitar que um usuário oculte o bloco para outro no mesmo navegador. */
export function firstStepsHiddenUserKey(user) {
  const identity = user?.id || user?.username || '';
  if (!identity) return '';
  return `${FIRST_STEPS_HIDDEN_KEY}:${user?.workspaceId || ''}:${identity}`;
}

export function hasMonitoredOab(terms = []) {
  return (Array.isArray(terms) ? terms : []).some(term => {
    if (!term || term.active === false) return false;
    const registration = String(term.registration || '');
    return Boolean(term.oabNumber || /OAB\s*\/?\s*[A-Z]{2}\s*\d{3,}/i.test(registration)) && !/000000/.test(registration);
  });
}

const countPublications = list => (Array.isArray(list) ? list.filter(item => item && item.active !== false).length : 0);

/**
 * Passo "Veja suas publicações": é o primeiro momento de valor do escritório novo.
 * `firstSync` só existe na sessão em que a primeira busca da OAB foi disparada
 * ({ status: 'running' | 'done' | 'failed', message }). Nada aqui inventa resultado:
 * sem publicação, diz que a busca não trouxe nada e oferece outro caminho.
 */
function publicationsStep(state, firstSync, hasOab) {
  const count = countPublications(state.intimations);
  const step = { id: 'publications', done: count > 0, title: 'Veja suas publicações', actions: [{ view: 'inbox', label: 'Ver publicações' }] };
  if (count > 0) return { ...step, detail: count === 1 ? '1 publicação encontrada.' : `${count} publicações encontradas.` };
  if (firstSync?.status === 'running') {
    return { ...step, title: 'Buscando suas publicações', detail: 'A primeira busca no DJEN pela sua OAB está em andamento. Pode levar alguns minutos; você pode seguir usando o sistema.', actions: [], busy: true };
  }
  if (firstSync?.status === 'failed') {
    return { ...step, detail: `A primeira busca não terminou${firstSync.message ? `: ${firstSync.message}` : '.'} Tente de novo pelo botão Sincronizar.`, actions: [{ view: 'monitoring', label: 'Ver fontes monitoradas' }] };
  }
  if (!hasOab) {
    return { ...step, detail: 'Depois de informar a OAB, as publicações dos últimos 60 dias aparecem aqui.', actions: [] };
  }
  return {
    ...step,
    detail: 'A busca pela sua OAB não trouxe publicações nos últimos 60 dias. Isso é comum para quem tem poucas intimações recentes. Acompanhe um processo pelo número ou traga sua carteira no passo seguinte.',
    actions: [{ view: 'monitoring', label: 'Acompanhar um processo' }]
  };
}

export function computeFirstSteps(state = {}, status = {}, firstSync = null) {
  const hasCertificate = state.settings?.hasA1Certificate;
  const hasOab = hasMonitoredOab(state.terms);
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
  // Ordem por valor: primeiro o que mostra o próprio trabalho do escritório na tela
  // (OAB, publicações, processos, tarefa); depois proteção e certificado.
  return [
    {
      id: 'oab',
      done: hasOab,
      title: 'Informe sua OAB',
      detail: 'É por ela que o ATRIUM encontra suas publicações no DJEN.',
      how: HOW_TO.oab,
      actions: [{ view: 'monitoring', label: 'Informar OAB' }]
    },
    publicationsStep(state, firstSync, hasOab),
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
      detail: 'Pode nascer de uma publicação, com responsável e data, ou do quadro de tarefas.',
      actions: [{ view: 'kanban', label: 'Ver tarefas' }]
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
    ...certificateSteps
  ];
}

function readHidden(storage, key = FIRST_STEPS_HIDDEN_KEY) {
  try {
    return storage?.getItem?.(key) === 'true';
  } catch {
    return false;
  }
}

export function renderFirstSteps({ documentRef, state, status = {}, firstSync = null, canManage = false, hiddenForUser = false, userKey = '', storage = null, escapeHtml, onAction = () => {}, onHide = () => {} }) {
  const container = documentRef?.getElementById?.('v2FirstSteps');
  if (!container) return null;
  const steps = computeFirstSteps(state, status, firstSync);
  const pending = steps.filter(step => !step.done).length;
  const storageKey = userKey || FIRST_STEPS_HIDDEN_KEY;
  const hiddenLocally = readHidden(storage, storageKey);
  // Só marcação vinculada ao usuário sobe para o perfil; chave global nunca contamina outra conta.
  if (userKey && hiddenLocally && !hiddenForUser && canManage) onHide?.();
  const visible = canManage && pending > 0 && !hiddenForUser && !hiddenLocally;
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
      ${steps.map((step, index) => `<li class="v2-first-step${step.done ? ' is-done' : ''}${step.busy ? ' is-busy' : ''}" data-first-step="${escapeHtml(step.id)}"${step.busy ? ' aria-busy="true"' : ''}>
        <span class="v2-first-step-mark" aria-hidden="true">${step.done ? '<svg class="atrium-icon" aria-hidden="true" focusable="false"><use href="assets/icons/atrium-ui-icons.svg?v=3.4.0#atrium-icon-check"></use></svg>' : index + 1}</span>
        <div class="v2-first-step-copy">
          <strong>${escapeHtml(step.title)}</strong>${step.done ? '<span class="sr-only v2-first-step-status"> (concluído)</span>' : ''}
          <small>${escapeHtml(step.detail)}</small>
          ${!step.done && step.how ? `<details class="v2-first-step-how"><summary>Como fazer</summary><ol>${step.how.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol></details>` : ''}
        </div>
        ${step.done || !step.actions.length ? '' : `<div class="v2-first-step-actions">${step.actions.map(action => (action.view ? `<button type="button" class="button ghost" data-view-link="${escapeHtml(action.view)}">${escapeHtml(action.label)}</button>` : `<button type="button" class="button ghost" data-setup-action="${escapeHtml(action.action || `a1-${action.choice}`)}">${escapeHtml(action.label)}</button>`)).join('')}</div>`}
      </li>`).join('')}
    </ol>`;
  (container.querySelectorAll?.('[data-setup-action]') || []).forEach(button => button.addEventListener('click', () => onAction(button.dataset.setupAction)));
  container.querySelector('[data-first-steps-hide]')?.addEventListener('click', () => {
    try {
      storage?.setItem?.(storageKey, 'true');
    } catch {
      // Sem armazenamento local, vale a marcação gravada no servidor.
    }
    onHide?.();
    container.hidden = true;
    container.innerHTML = '';
  });
  return { visible: true, pending };
}
