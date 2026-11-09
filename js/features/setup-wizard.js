/**
 * ATRIUM — Wizard de primeiros passos do escritório.
 *
 * Apresentação pura: monta o passo a passo e devolve as respostas via `onComplete`.
 * Não conhece Store, fetch, RBAC nem prazos — quem persiste é o portal (settings oficial).
 * Cada pergunta que muda configuração aponta para o painel responsável (Integrações,
 * Configurações); o wizard nunca altera portais, certificado ou permissões por conta própria.
 */

import { CNJ_SEGMENTS, CNJ_TRIBUNALS } from '../core/cnj.js?v=3.0.1';
const plural = (count, singular, pluralForm) => `${count} ${Number(count) === 1 ? singular : pluralForm}`;

const courtOptions = Object.entries(CNJ_TRIBUNALS).map(([segment, tribunal]) => ({
  value: tribunal.court.toLowerCase(),
  label: `${tribunal.court} · ${tribunal.name}`,
  short: tribunal.court,
  group: CNJ_SEGMENTS[segment.split('.')[0]].name
}));
const normalizeSearch = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const steps = [
  {
    id: 'welcome',
    eyebrow: 'Boas-vindas',
    title: 'Vamos deixar o ATRIUM com a cara do escritório',
    description: 'Quatro perguntas rápidas sobre o escritório. Você pode deixar para depois.'
  },
  {
    id: 'courts',
    eyebrow: 'Tribunais e órgãos',
    title: 'Quais tribunais e órgãos você acompanha?',
    description: 'Registra seus interesses, sem ativar consultas ou integrações. A cobertura disponível é definida em Integrações → Conexões com tribunais.',
    type: 'multi',
    options: courtOptions
  },
  {
    id: 'team',
    eyebrow: 'Equipe',
    title: 'Quantas pessoas usam o ATRIUM hoje?',
    description: 'Registra o tamanho da equipe. Convites e permissões são definidos em Configurações.',
    type: 'choice',
    options: [
      { value: '1', label: 'Só eu' },
      { value: '2-5', label: '2 a 5 pessoas' },
      { value: '6-15', label: '6 a 15 pessoas' },
      { value: '15+', label: 'Mais de 15' }
    ]
  },
  {
    id: 'volume',
    eyebrow: 'Volume',
    title: 'Qual o volume médio de processos ativos?',
    description: 'Registra o volume informado, sem alterar a frequência das consultas ou o painel.',
    type: 'choice',
    options: [
      { value: 'ate-50', label: 'Até 50' },
      { value: '50-200', label: '50 a 200' },
      { value: '200-1000', label: '200 a 1.000' },
      { value: '1000+', label: 'Mais de 1.000' }
    ]
  },
  {
    id: 'ai',
    eyebrow: 'Inteligência',
    title: 'Quer a rotina assistida por IA?',
    description: 'A classificação assistida sugere e organiza; quem revisa e confirma é sempre você.',
    type: 'choice',
    options: [
      { value: 'sim', label: 'Sim, quero avaliar a IA' },
      { value: 'depois', label: 'Ver depois' }
    ]
  },
  {
    id: 'done',
    eyebrow: 'Revisão',
    title: 'Confira as respostas antes de salvar',
    description: 'Você pode refazer este passo a passo quando quiser, em Configurações.',
    readOnly: true
  }
];

export function createSetupWizardFeature({
  documentRef = globalThis.document,
  escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])),
  iconSvg = () => '',
  onComplete = async () => false,
  onOpenPanel = async () => false,
  onDismiss = () => {}
} = {}) {
  const byId = id => documentRef.getElementById(id);
  const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let initialized = false;
  let opened = false;
  let busy = false;
  let index = 0;
  let lastFocusedElement = null;
  let previousBodyOverflow = '';
  let previousShellInert = null;
  let shell = null;
  let operation = 0;
  const answers = { courts: [], team: '', volume: '', ai: '' };
  const copyAnswers = () => ({ ...answers, courts: [...answers.courts] });

  function showFeedback(message = '') {
    const feedback = byId('setupWizardFeedback');
    if (!feedback) return;
    feedback.textContent = message;
    feedback.hidden = !message;
    feedback.classList.toggle('hidden', !message);
    feedback.setAttribute('role', 'alert');
  }

  function updateControls() {
    const backdrop = byId('setupWizardBackdrop');
    backdrop?.querySelectorAll('button, input').forEach(control => { control.disabled = busy; });
    const back = byId('setupWizardBack');
    if (back) back.disabled = busy || index === 0;
    const next = byId('setupWizardNext');
    if (next) next.disabled = busy || !canAdvance(steps[index]);
    backdrop?.querySelector('[role="dialog"]')?.setAttribute('aria-busy', String(busy));
  }

  async function confirm(panel = null) {
    if (!opened || busy) return false;
    syncAnswersFromDom();
    const currentOperation = ++operation;
    const focused = documentRef.activeElement;
    busy = true;
    showFeedback();
    updateControls();
    byId('setupWizardBackdrop')?.querySelector('[role="dialog"]')?.focus();
    try {
      const confirmed = panel
        ? await onOpenPanel(panel, copyAnswers())
        : await onComplete(copyAnswers());
      if (confirmed !== true && opened && operation === currentOperation) {
        showFeedback('Não foi possível confirmar o salvamento. Suas escolhas foram mantidas. Tente novamente.');
      }
      return confirmed === true;
    } catch {
      if (opened && operation === currentOperation) showFeedback('Não foi possível concluir agora. Suas escolhas foram mantidas. Tente novamente.');
      return false;
    } finally {
      if (operation === currentOperation) {
        busy = false;
        updateControls();
        if (opened && focused?.isConnected && !focused.disabled) focused.focus();
      }
    }
  }

  function close() {
    if (!opened) return false;
    opened = false;
    operation += 1;
    busy = false;
    byId('setupWizardBackdrop')?.classList.add('hidden');
    documentRef.body.style.overflow = previousBodyOverflow;
    if (shell) {
      if (previousShellInert === null) shell.removeAttribute('inert');
      else shell.setAttribute('inert', previousShellInert);
    }
    updateControls();
    if (lastFocusedElement?.isConnected) lastFocusedElement.focus?.();
    return true;
  }

  function dismiss() {
    if (!opened || busy) return false;
    if (!close()) return false;
    onDismiss?.();
    return true;
  }

  const canAdvance = step => {
    if (step.type === 'multi') return true;
    if (step.type === 'choice') return Boolean(answers[step.id]);
    return true;
  };

  function renderProgress() {
    const progress = byId('setupWizardProgress');
    if (!progress) return;
    progress.innerHTML = steps.map((step, position) => `<li class="setup-wizard-dot${position === index ? ' is-current' : ''}${position < index ? ' is-done' : ''}" ${position === index ? 'aria-current="step"' : ''}><span>${position + 1}</span></li>`).join('');
  }

  function setCourtsOpen(open) {
    if (busy) return;
    const region = byId('setupWizardCourts');
    if (!region) return;
    region.hidden = !open;
    byId('setupWizardCourtsToggle')?.setAttribute('aria-expanded', String(open));
    byId(open ? 'setupWizardCourtSearch' : 'setupWizardCourtsToggle')?.focus();
  }

  function renderCourtSelection() {
    const selection = byId('setupWizardCourtSelection');
    if (!selection) return;
    const labels = answers.courts.slice(0, 3).map(value => courtOptions.find(option => option.value === value)?.short || value);
    selection.innerHTML = `<span class="setup-wizard-court-count">${plural(answers.courts.length, 'selecionado', 'selecionados')}</span>${labels.map(label => `<span class="setup-wizard-court-chip">${escapeHtml(label)}</span>`).join('')}${answers.courts.length > 3 ? `<span>+${answers.courts.length - 3}</span>` : ''}`;
  }

  function renderCourts() {
    const options = [...courtOptions, ...answers.courts.filter(value => !courtOptions.some(option => option.value === value)).map(value => ({ value, label: value, group: 'Seleções salvas fora do catálogo' }))];
    const groups = Map.groupBy(options, option => option.group);
    return `<div class="setup-wizard-court-picker">
      <button type="button" class="button ghost" id="setupWizardCourtsToggle" aria-expanded="false" aria-controls="setupWizardCourts">${iconSvg('processes')}Selecionar tribunais e órgãos</button>
      <div id="setupWizardCourtSelection" class="setup-wizard-court-selection" role="status" aria-live="polite"></div>
      <section id="setupWizardCourts" class="setup-wizard-courts" aria-label="Tribunais e órgãos" hidden>
        <div class="setup-wizard-court-actions">
          <button type="button" class="button ghost" id="setupWizardCourtsClear">Limpar seleção</button>
          <button type="button" class="button ghost" id="setupWizardCourtsClose">Fechar seleção</button>
        </div>
        <label class="setup-wizard-court-search" for="setupWizardCourtSearch">Buscar por sigla, nome ou grupo
          <input type="search" id="setupWizardCourtSearch" autocomplete="off" aria-controls="setupWizardCourtGroups">
        </label>
        <p id="setupWizardCourtResults" class="setup-wizard-court-results" role="status"></p>
        <div id="setupWizardCourtGroups">${[...groups].map(([group, items]) => `<fieldset class="setup-wizard-court-group"><legend>${escapeHtml(group)}</legend>${items.map(option => `<label class="setup-wizard-option" data-wizard-court-row><input type="checkbox" data-wizard-option value="${escapeHtml(option.value)}"${answers.courts.includes(option.value) ? ' checked' : ''}><span>${escapeHtml(option.label)}</span></label>`).join('')}</fieldset>`).join('')}</div>
      </section>
    </div>`;
  }

  function filterCourts() {
    const query = normalizeSearch(byId('setupWizardCourtSearch')?.value || '');
    let visible = 0;
    byId('setupWizardCourtGroups')?.querySelectorAll('fieldset').forEach(group => {
      let matches = 0;
      group.querySelectorAll('[data-wizard-court-row]').forEach(row => {
        row.hidden = !normalizeSearch(`${group.querySelector('legend').textContent} ${row.textContent}`).includes(query);
        if (!row.hidden) matches++;
      });
      group.hidden = matches === 0;
      visible += matches;
    });
    const results = byId('setupWizardCourtResults');
    if (results) results.textContent = visible ? `${plural(visible, 'resultado', 'resultados')}` : 'Nenhum tribunal ou órgão encontrado. Suas seleções foram mantidas.';
  }

  function renderStep() {
    const container = byId('setupWizardSteps');
    const step = steps[index];
    if (!container || !step) return;
    let control = '';
    if (step.type === 'multi') {
      control = renderCourts();
    } else if (step.type === 'choice') {
      control = `<div class="setup-wizard-options" role="radiogroup" aria-label="${escapeHtml(step.title)}">${step.options.map(option => {
        const checked = answers[step.id] === option.value;
        return `<label class="setup-wizard-option"><input type="radio" name="setupWizard_${step.id}" data-wizard-option value="${escapeHtml(option.value)}"${checked ? ' checked' : ''}><span>${escapeHtml(option.label)}</span></label>`;
      }).join('')}</div>`;
    } else if (step.id === 'done') {
      control = `<div class="setup-wizard-summary" id="setupWizardSummary"></div>`;
    }
    container.innerHTML = `<div class="setup-wizard-step">
      <p class="eyebrow">${escapeHtml(step.eyebrow)}</p>
      <h3>${escapeHtml(step.title)}</h3>
      <p class="setup-wizard-desc">${escapeHtml(step.description)}</p>
      ${control}
    </div>`;
    const back = byId('setupWizardBack');
    if (back) back.disabled = index === 0;
    const next = byId('setupWizardNext');
    if (next) {
      next.textContent = index === steps.length - 1 ? 'Ir para o painel' : 'Continuar';
      next.disabled = !canAdvance(step);
    }
    if (step.id === 'courts') { renderCourtSelection(); filterCourts(); }
    if (step.id === 'done') renderSummary();
    renderProgress();
    updateControls();
  }

  function renderSummary() {
    const summary = byId('setupWizardSummary');
    if (!summary) return;
    const courtsLabels = (answers.courts || []).map(value => (steps.find(s => s.id === 'courts')?.options || []).find(o => o.value === value)?.label || value);
    const team = (steps.find(s => s.id === 'team')?.options || []).find(o => o.value === answers.team)?.label || 'Não informado';
    const volume = (steps.find(s => s.id === 'volume')?.options || []).find(o => o.value === answers.volume)?.label || 'Não informado';
    const ai = (steps.find(s => s.id === 'ai')?.options || []).find(o => o.value === answers.ai)?.label || 'Ver depois';
    summary.innerHTML = `
      <div class="setup-wizard-summary-row"><span>Tribunais e órgãos</span><strong>${escapeHtml(courtsLabels.join(', ') || 'A definir')}</strong></div>
      <div class="setup-wizard-summary-row"><span>Equipe</span><strong>${escapeHtml(team)}</strong></div>
      <div class="setup-wizard-summary-row"><span>Processos ativos</span><strong>${escapeHtml(volume)}</strong></div>
      <div class="setup-wizard-summary-row"><span>Assistência por IA</span><strong>${escapeHtml(ai)}</strong></div>
      <div class="setup-wizard-links">
        <button type="button" class="button ghost" data-wizard-panel="integrations">${iconSvg('integrations')}Abrir conexões com tribunais</button>
        <button type="button" class="button ghost" data-wizard-panel="configuration">${iconSvg('configuration')}Abrir Configurações</button>
      </div>`;
  }

  function syncAnswersFromDom() {
    const step = steps[index];
    if (!step?.type) return;
    const inputs = [...(byId('setupWizardSteps')?.querySelectorAll('[data-wizard-option]') || [])];
    if (step.type === 'choice') answers[step.id] = inputs.find(input => input.checked)?.value || '';
  }

  function init() {
    if (initialized) return true;
    const backdrop = byId('setupWizardBackdrop');
    if (!backdrop || !byId('setupWizardSteps')) return false;
    initialized = true;
    backdrop.querySelector('[role="dialog"]')?.setAttribute('tabindex', '-1');
    byId('setupWizardSteps').addEventListener('change', event => {
      if (!opened || busy) return;
      const input = event.target;
      if (steps[index].id === 'courts' && input.matches('[data-wizard-option]')) {
        if (input.checked && !answers.courts.includes(input.value)) answers.courts.push(input.value);
        else if (!input.checked) answers.courts = answers.courts.filter(value => value !== input.value);
        renderCourtSelection();
      } else syncAnswersFromDom();
      updateControls();
    });
    byId('setupWizardSteps').addEventListener('input', event => {
      if (opened && !busy && event.target.id === 'setupWizardCourtSearch') filterCourts();
    });
    byId('setupWizardSteps').addEventListener('click', event => {
      if (!opened || busy) return;
      const action = event.target.closest('button')?.id;
      if (action === 'setupWizardCourtsToggle') setCourtsOpen(byId('setupWizardCourts').hidden);
      if (action === 'setupWizardCourtsClose') setCourtsOpen(false);
      if (action === 'setupWizardCourtsClear') {
        answers.courts = [];
        byId('setupWizardCourts').querySelectorAll('[data-wizard-option]').forEach(input => { input.checked = false; });
        renderCourtSelection();
      }
      const panel = event.target.closest('[data-wizard-panel]');
      if (panel && ['integrations', 'configuration'].includes(panel.dataset.wizardPanel)) void confirm(panel.dataset.wizardPanel);
    });
    byId('setupWizardNext')?.addEventListener('click', () => {
      if (!opened || busy) return;
      syncAnswersFromDom();
      if (!canAdvance(steps[index])) return;
      if (index === steps.length - 1) { void confirm(); return; }
      index += 1;
      renderStep();
      byId('setupWizardSteps')?.querySelector('#setupWizardCourtsToggle, [data-wizard-option]')?.focus();
    });
    byId('setupWizardBack')?.addEventListener('click', () => {
      if (!opened || busy || index === 0) return;
      syncAnswersFromDom();
      index -= 1;
      renderStep();
    });
    const skip = byId('setupWizardSkip');
    skip?.setAttribute('aria-label', 'Deixar configuração inicial para depois');
    skip?.addEventListener('click', dismiss);
    backdrop.addEventListener('keydown', event => {
      if (!opened) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (byId('setupWizardCourts') && !byId('setupWizardCourts').hidden) setCourtsOpen(false);
        else dismiss();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = backdrop.querySelector('[role="dialog"]');
      const focusable = [...(dialog?.querySelectorAll(focusableSelector) || [])]
        .filter(element => element.getClientRects().length > 0 && !element.closest('[inert]'));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (documentRef.activeElement === first || !focusable.includes(documentRef.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (documentRef.activeElement === last || !focusable.includes(documentRef.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    });
    return true;
  }

  return Object.freeze({
    init,
    open(profile = {}) {
      const backdrop = byId('setupWizardBackdrop');
      if (!backdrop || busy || !init()) return false;
      if (!opened) {
        lastFocusedElement = documentRef.activeElement;
        previousBodyOverflow = documentRef.body.style.overflow;
        shell = byId('appShell');
        previousShellInert = shell?.getAttribute('inert') ?? null;
        shell?.setAttribute('inert', '');
      }
      const source = profile?.workspaceProfile ?? profile ?? {};
      answers.courts = Array.isArray(source.courts) ? [...new Set(source.courts.filter(value => typeof value === 'string'))] : [];
      for (const [field, canonical] of [['team', 'teamSize'], ['volume', 'processVolume'], ['ai', 'aiInterest']]) {
        const value = source[canonical] ?? source[field] ?? '';
        answers[field] = steps.find(step => step.id === field)?.options.some(option => option.value === value) ? value : '';
      }
      index = 0;
      opened = true;
      showFeedback();
      backdrop.classList.remove('hidden');
      documentRef.body.style.overflow = 'hidden';
      renderStep();
      byId('setupWizardNext')?.focus();
      return true;
    },
    close,
    isOpen: () => opened,
    answers: copyAnswers,
    steps: steps.map(step => step.id)
  });
}
