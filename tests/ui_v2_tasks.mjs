import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TASK_COLUMNS } from '../js/features/tasks.js';
import { renderTaskCard } from '../js/views/ui-v2/tasks-presenter.js';
import { prepareUiV2Page, prepareUiV2TasksFixture, startUiV2Session } from './ui_v2_helpers.mjs';

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const unitCard = renderTaskCard({
  task: {
    id: 'task-unit', title: 'Tarefa <sintética>', description: 'Descrição & segura', source: 'DJEN', status: 'triagem',
    priority: 'urgente', points: 25, client: 'Cliente Unitário', process: '5000000-00.2026.8.21.0001',
    deadline: '2026-08-20', fatalDeadline: '2026-08-30', responsible: 'Advogada Unitária', timeLogs: [{ minutes: 65 }]
  },
  columns: TASK_COLUMNS,
  activeTaskId: null,
  elapsedLabel: '00:00:00',
  sourceLabel: 'DJEN',
  escapeHtml,
  formatDate: String,
  formatMinutes: minutes => `${minutes}m`,
  totalTimeMinutes: logs => logs.reduce((total, log) => total + Number(log.minutes || 0), 0),
  daysUntil: () => -1,
  initials: () => 'AU'
});
for (const expected of ['task-unit', 'Tarefa &lt;sintética&gt;', 'Descrição &amp; segura', 'Urgente', '25 pts', 'Prazo fatal', '65m apontados', 'Mover para']) {
  assert.ok(unitCard.includes(expected), `Card unitário deve preservar: ${expected}`);
}

const conflictCard = renderTaskCard({
  task: {
    id: 'task-conflict', title: 'Prazo eproc — Manifestação', description: 'Conferir prazo da fonte', source: 'eproc',
    status: 'triagem', priority: 'normal', points: 10, process: '5000000-00.2026.8.21.0001',
    deadline: '2026-10-02', sourceReportedDeadlineAt: '2026-09-20',
    deadlineConflict: { source: 'eproc', sourceValue: '2026-09-20', humanValue: '2026-10-02', mode: 'auto' },
    timeLogs: []
  },
  columns: TASK_COLUMNS,
  activeTaskId: null,
  elapsedLabel: '00:00:00',
  sourceLabel: 'eproc',
  escapeHtml,
  formatDate: String,
  formatMinutes: minutes => `${minutes}m`,
  totalTimeMinutes: logs => logs.reduce((total, log) => total + Number(log.minutes || 0), 0),
  daysUntil: () => 5,
  initials: () => 'AU'
});
assert.ok(conflictCard.includes('task-date-source-conflict'), 'Card deve sinalizar divergência de prazo com a fonte oficial.');
assert.ok(conflictCard.includes('eproc declarou 2026-09-20'), 'Card deve declarar a data informada pela fonte.');
assert.ok(conflictCard.includes('data digitada por pessoa, não alterada'), 'Card deve explicar que a data da tarefa prevalece e não foi alterada.');

const triageCard = renderTaskCard({
  task: {
    id: 'task-triage', title: 'Audiência de instrução', description: 'Preparar documentos', source: 'SISTEMA JURÍDICO',
    status: 'andamento', priority: 'normal', points: 10, process: '5000000-00.2026.8.21.0001', timeLogs: []
  },
  columns: TASK_COLUMNS,
  activeTaskId: null,
  elapsedLabel: '00:00:00',
  sourceLabel: 'SISTEMA JURÍDICO',
  escapeHtml,
  formatDate: String,
  formatMinutes: minutes => `${minutes}m`,
  totalTimeMinutes: () => 0,
  daysUntil: () => 5,
  initials: () => 'AU',
  triage: { category: 'audiencia', urgency: 'normal', confidence: 0.7, action: 'review' }
});
assert.ok(triageCard.includes('task-triage-line'), 'Card deve exibir a linha de selos assistivos.');
assert.ok(triageCard.includes('Audiência'), 'Card deve exibir a categoria sugerida.');
assert.ok(triageCard.includes('Nada foi alterado'), 'Card deve declarar que a sugestão não alterou nada.');

const presenterSource = readFileSync(new URL('../js/views/ui-v2/tasks-presenter.js', import.meta.url), 'utf8');
const featureSource = readFileSync(new URL('../js/features/tasks.js', import.meta.url), 'utf8');
assert.doesNotMatch(presenterSource, /\bStore\b|\bfetch\s*\(|\.save\s*\(|\.flush\s*\(|\.audit\s*\(|setInterval|clearInterval|\/api\//, 'Presenter não pode possuir domínio, persistência, rede ou timer.');
assert.equal((featureSource.match(/createTasksFeature\(/g) || []).length, 1, 'A feature funcional oficial deve permanecer única.');
assert.doesNotMatch(featureSource, /createTasksV2Feature/);
assert.deepEqual(TASK_COLUMNS.map(column => column.id), ['triagem', 'prioridade', 'andamento', 'aguardando', 'revisao', 'concluida']);

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1440, height: 900 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light', probe: true });
    await prepareUiV2TasksFixture(page);
    const requests = [];
    page.on('request', request => requests.push({ method: request.method(), url: request.url() }));

    const columns = page.locator('#kanbanBoard .kanban-column');
    assert.equal(await columns.count(), 6);
    assert.deepEqual(await columns.evaluateAll(items => items.map(item => item.dataset.column)), TASK_COLUMNS.map(column => column.id));
    assert.equal(await page.locator('#taskResultCount').textContent(), '6 tarefas');
    assert.equal(await page.locator('#kanbanBoard [data-task-id]').count(), 6, 'Deve existir uma única árvore com seis registros sintéticos.');

    const overdue = await page.locator('[data-task-id="ui-v2-task-overdue"]').textContent();
    for (const expected of ['Revisar contestação sintética', 'Cliente Sintética Tarefas', '5004321-12.2026.8.21.0001', 'Urgente', 'Atrasada']) {
      assert.ok(overdue.includes(expected), `Card atrasado deve mostrar: ${expected}`);
    }
    const fatal = await page.locator('[data-task-id="ui-v2-task-fatal"]').textContent();
    for (const expected of ['Prazo fatal', '03/09/2026', '1h15m apontados']) assert.ok(fatal.includes(expected));
    assert.equal(requests.filter(request => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)).length, 0, 'Renderização V2 não pode criar request de mutação.');

    const moveSelect = page.locator('[data-task-id="ui-v2-task-overdue"] [data-task-move]');
    await moveSelect.selectOption('andamento');
    await page.locator('#toastRegion .toast.success', { hasText: 'Tarefa movimentada com sucesso.' }).waitFor();
    await page.locator('[data-column="andamento"] [data-task-id="ui-v2-task-overdue"]').waitFor();
    const moved = await page.evaluate(() => window.Atrium.Store.state.tasks.find(task => task.id === 'ui-v2-task-overdue'));
    assert.equal(moved.status, 'andamento');
    assert.equal(await page.evaluate(() => window.Atrium.Store.state.audit.some(item => item.action === 'Tarefa movimentada')), true);
    assert.match(await page.locator('#taskBoardLive').textContent(), /movida para Em andamento/);

    const rollback = await page.evaluate(async () => {
      const { App, Store } = window.Atrium;
      const task = Store.state.tasks.find(item => item.id === 'ui-v2-task-waiting');
      const auditLength = Store.state.audit.length;
      const originalFlush = Store.flush;
      Store.flush = async () => false;
      const result = await App.moveTask(task.id, 'revisao');
      Store.flush = originalFlush;
      return { result, status: task.status, auditLength, finalAuditLength: Store.state.audit.length };
    });
    assert.deepEqual(rollback, { result: null, status: 'aguardando', auditLength: rollback.auditLength, finalAuditLength: rollback.auditLength });
    assert.match(await page.locator('#taskBoardLive').textContent(), /voltou para a etapa anterior/);

    await page.waitForTimeout(400);
    const mutationCountBeforeTimer = requests.filter(request => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)).length;
    await page.locator('[data-timesheet-start="ui-v2-task-active"]').click();
    assert.equal(await page.locator('#kanbanBoard .timesheet-live').count(), 1);
    await page.waitForTimeout(1100);
    assert.match(await page.locator('.timesheet-live').textContent(), /00:00:0[1-9]/);
    assert.equal(requests.filter(request => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)).length, mutationCountBeforeTimer, 'Tick do cronômetro não pode gerar rede.');
    await page.locator('[data-timesheet-stop="ui-v2-task-active"]').dispatchEvent('click');
    assert.equal(await page.locator('#kanbanBoard .timesheet-live').count(), 0);
    const timerState = await page.evaluate(() => ({ active: window.Atrium.App.activeTimeSheetTaskId, interval: window.Atrium.App.timeSheetInterval }));
    assert.deepEqual(timerState, { active: null, interval: null });

    await page.evaluate(() => {
      const intim = window.Atrium.Store.state.intimations.find(item => item.id === 'ui-v2-task-publication-source');
      intim.text = 'ÍNTEGRA ORIGINAL SINTÉTICA\nSegundo parágrafo preservado na íntegra.';
    });
    await page.locator('[data-task-id="ui-v2-task-publication"] [data-task-open]').click();
    await page.locator('#modalBackdrop[data-modal-mode="task"]:not(.hidden)').waitFor();
    const intimationBody = await page.locator('#taskIntimationBody').textContent();
    assert.ok(intimationBody.includes('ÍNTEGRA ORIGINAL SINTÉTICA'), 'Cartão deve exibir o texto original da publicação, não o resumo do sistema.');
    assert.ok(intimationBody.includes('Segundo parágrafo preservado'), 'Quebras do texto original devem ser preservadas.');
    const intimationMeta = await page.locator('.task-intimation-meta').textContent();
    assert.ok(intimationMeta.includes('Publicação sintética vinculada'), 'Meta deve identificar a publicação como na aba Publicações.');
    assert.ok(intimationMeta.includes('DJEN'), 'Meta deve declarar a origem.');
    const names = await page.locator('#modalForm [name]').evaluateAll(elements => elements.map(element => element.name));
    assert.deepEqual(names, ['title', 'taskDefinition', 'description', 'process', 'processId', 'client', 'contactId', 'actionType', 'protocol', 'fatalDeadline', 'deadline', 'date', 'time', 'responsible', 'assigneeUserId', 'responsibles', 'status', 'priority', 'points', 'addMinutes', 'timeDescription']);
    assert.equal(await page.locator('.task-form-section').count(), 5);
    assert.equal(await page.locator('#field-deadline').inputValue(), '', 'Texto de 15 dias não pode inferir prazo.');
    assert.equal(await page.locator('#field-fatalDeadline').inputValue(), '');

    assert.equal(await page.locator('#field-taskDefinition').getAttribute('role'), 'combobox');
    assert.equal(await page.locator('#field-taskDefinition').getAttribute('aria-expanded'), 'false');
    assert.ok(await page.locator('#field-taskDefinition-listbox [data-combobox-group]').count() > 0, 'Seletor de modelo deve agrupar por área.');

    await page.fill('#field-taskDefinition', 'Execução');
    await page.locator('#field-taskDefinition-listbox:not(.hidden)').waitFor();
    const areaFilter = await page.locator('#field-taskDefinition-listbox [data-combobox-option]:visible')
      .evaluateAll(options => options.map(option => option.closest('[data-combobox-group]')?.getAttribute('aria-label')));
    assert.ok(areaFilter.length > 0 && areaFilter.every(area => area === 'Execução'), `Busca deve filtrar por área: ${areaFilter.join(', ')}.`);

    await page.fill('#field-taskDefinition', 'TAREFA INEXISTENTE W1');
    const createOption = page.locator('#field-taskDefinition-listbox [data-combobox-create]:not(.hidden)');
    await createOption.waitFor();
    assert.match(await createOption.textContent(), /Criar tarefa «TAREFA INEXISTENTE W1»/);
    await createOption.click();
    await page.locator('#modalFields [data-task-model-create]:not(.hidden)').waitFor();
    assert.equal(await page.locator('#newTaskModelName').inputValue(), 'TAREFA INEXISTENTE W1');
    await page.fill('#newTaskModelName', 'TAREFA SINTÉTICA W1');
    await page.selectOption('#newTaskModelArea', 'Cível');
    await page.selectOption('#newTaskModelDifficulty', 'alta');
    await page.fill('#newTaskModelMinutes', '45');
    await page.fill('#newTaskModelPoints', '55');
    await page.locator('[data-task-model-save]').click();
    await page.locator('#toastRegion .toast.success', { hasText: 'criado e aplicado à tarefa' }).waitFor();
    const createdModel = await page.evaluate(() => window.Atrium.Store.state.configuration.taskDefinitions.find(item => item.name === 'TAREFA SINTÉTICA W1'));
    assert.deepEqual(
      createdModel && { area: createdModel.area, difficulty: createdModel.difficulty, estimatedMinutes: createdModel.estimatedMinutes, points: createdModel.points },
      { area: 'Cível', difficulty: 'alta', estimatedMinutes: 45, points: 55 },
      'Modelo criado no formulário deve persistir no catálogo de referência.'
    );
    assert.equal(await page.locator('#field-taskDefinition').inputValue(), 'TAREFA SINTÉTICA W1');
    assert.equal(await page.locator('#field-title').inputValue(), 'TAREFA SINTÉTICA W1');
    assert.equal(await page.locator('#field-points').inputValue(), '55');
    assert.equal(await page.locator('[data-task-model-create]').evaluate(element => element.classList.contains('hidden')), true);

    await page.fill('#field-taskDefinition', 'MODELO FALHA W1');
    await page.locator('#field-taskDefinition-listbox [data-combobox-create]:not(.hidden)').click();
    await page.locator('#modalFields [data-task-model-create]:not(.hidden)').waitFor();
    await page.fill('#newTaskModelName', 'MODELO FALHA W1');
    await page.evaluate(() => {
      window.__w1OriginalFlush = window.Atrium.Store.flush;
      window.Atrium.Store.flush = async () => false;
    });
    await page.locator('[data-task-model-save]').click();
    await page.locator('#toastRegion .toast.error', { hasText: 'Não foi possível salvar o modelo de tarefa' }).waitFor();
    const failedModel = await page.evaluate(() => ({
      persisted: window.Atrium.Store.state.configuration.taskDefinitions.some(item => item.name === 'MODELO FALHA W1'),
      panelHidden: document.querySelector('[data-task-model-create]').classList.contains('hidden'),
      audits: window.Atrium.Store.state.audit.filter(entry => String(entry.detail || '').includes('MODELO FALHA W1')).length
    }));
    await page.evaluate(() => { window.Atrium.Store.flush = window.__w1OriginalFlush; });
    assert.deepEqual(failedModel, { persisted: false, panelHidden: false, audits: 0 }, 'Falha de persistência deve reverter o modelo e manter o sub-form aberto.');

    const alignment = await page.evaluate(() => {
      const top = id => document.getElementById(id)?.getBoundingClientRect().top;
      return { fatal: top('field-fatalDeadline'), internal: top('field-deadline'), date: top('field-date'), time: top('field-time') };
    });
    assert.ok(Math.abs(alignment.fatal - alignment.internal) <= 2, `Prazo fatal e prazo interno devem alinhar: ${alignment.fatal} × ${alignment.internal}.`);
    assert.ok(Math.abs(alignment.date - alignment.time) <= 2, `Data e horário devem alinhar: ${alignment.date} × ${alignment.time}.`);
    const publicationEditor = await page.evaluate(() => {
      const textarea = document.getElementById('field-description');
      const contrastRatio = element => {
        const parse = value => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
        const luminance = value => {
          const channels = parse(value).map(channel => {
            const normalized = channel / 255;
            return normalized <= .04045 ? normalized / 12.92 : ((normalized + .055) / 1.055) ** 2.4;
          });
          return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
        };
        const style = getComputedStyle(element);
        const foreground = luminance(style.color);
        const background = luminance(style.backgroundColor);
        return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
      };
      return {
        textareaHeight: textarea.getBoundingClientRect().height,
        textareaFitsContent: textarea.scrollHeight <= textarea.clientHeight + 2,
        copyContrast: contrastRatio(document.getElementById('btnCopyTaskIntimation')),
        aiContrast: contrastRatio(document.getElementById('btnAiAnalyzeTask'))
      };
    });
    assert.ok(publicationEditor.textareaHeight >= 148, `A descrição deve abrir expandida: ${publicationEditor.textareaHeight}px.`);
    assert.equal(publicationEditor.textareaFitsContent, true, 'A descrição inicial deve caber sem barra de rolagem interna.');
    assert.ok(publicationEditor.copyContrast >= 4.5, `Contraste de Copiar texto insuficiente: ${publicationEditor.copyContrast}.`);
    assert.ok(publicationEditor.aiContrast >= 4.5, `Contraste de Analisar com IA insuficiente: ${publicationEditor.aiContrast}.`);
    await page.fill('#field-title', 'Publicação vinculada editada na V2');
    await page.locator('#modalForm button[type="submit"]').click();
    await page.locator('#modalBackdrop.hidden').waitFor({ state: 'attached' });
    const preserved = await page.evaluate(() => {
      const item = window.Atrium.Store.state.tasks.find(task => task.id === 'ui-v2-task-publication');
      return { id: item.id, intimationId: item.intimationId, sourceIntimationId: item.sourceIntimationId, deadline: item.deadline, fatalDeadline: item.fatalDeadline };
    });
    assert.deepEqual(preserved, {
      id: 'ui-v2-task-publication', intimationId: 'ui-v2-task-publication-source', sourceIntimationId: 'ui-v2-task-publication-source', deadline: '', fatalDeadline: ''
    });

    await page.locator('[data-task-id="ui-v2-task-complete"] [data-task-open]').click();
    await page.locator('#btnDirectReopenTask').click();
    await page.locator('[data-column="triagem"] [data-task-id="ui-v2-task-complete"]').waitFor();
    const reopened = await page.evaluate(() => window.Atrium.Store.state.tasks.find(task => task.id === 'ui-v2-task-complete'));
    assert.equal(reopened.status, 'triagem');
    assert.equal(Object.hasOwn(reopened, 'completedAt'), false);

    const runtime = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(element => element.id);
      return { duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index), activeTimer: window.Atrium.App.activeTimeSheetTaskId };
    });
    assert.deepEqual(runtime.duplicateIds, []);
    assert.equal(runtime.activeTimer, null);
    assert.deepEqual(pageErrors, [], `Pageerrors: ${pageErrors.join(' | ')}`);

    assert.equal(await page.locator('#uiModeControl, [data-ui-mode]').count(), 0, 'Tarefas estáveis não podem expor retorno ao Classic.');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.ui), 'v2');
    assert.equal(await page.locator('.v2-task-heading').isVisible(), true);
  } finally {
    await context.close();
  }
} finally {
  await session.stop();
}

console.log('[V3] Tarefas repetidas: painel com grupo real, alerta de risco antes do POST e console limpo...');
{
  const DUPLICATE_SEED = {
    tasks: [
      {
        id: 'dup-v2-a1', externalId: 'dup-v2-a1', title: 'Protocolar contestação (prazo do eproc)', process: '5313106-50.2026.8.21.7000',
        client: 'Cliente Sintético A', responsible: 'Advogada Teste UI V2', status: 'prioridade', priority: 'importante',
        deadline: '2026-10-08', deadlineSource: 'eproc', sourceReportedDeadlineAt: '2026-10-08',
        intimationId: 'src-dup-a', sourceIntimationId: 'src-dup-a', createdAt: '2026-09-20T10:00:00.000Z', history: [], timeLogs: []
      },
      {
        id: 'dup-v2-a2', externalId: 'dup-v2-a2', title: 'Protocolar contestação (suspensão comunicada)', process: '5313106-50.2026.8.21.7000',
        client: 'Cliente Sintético A', responsible: 'Advogada Teste UI V2', status: 'triagem', priority: 'normal',
        deadline: '2026-10-15', intimationId: 'src-dup-a', sourceIntimationId: 'src-dup-a',
        createdAt: '2026-09-22T10:00:00.000Z', history: [], timeLogs: []
      },
      {
        id: 'dup-v2-b1', externalId: 'dup-v2-b1', title: 'Acompanhar intimação de despacho', process: '5008438-17.2023.8.21.0016',
        client: 'Cliente Sintético B', responsible: 'Advogado Teste UI V2 Dois', status: 'andamento', priority: 'normal',
        deadline: '', intimationId: 'src-dup-b', sourceIntimationId: 'src-dup-b',
        createdAt: '2026-09-18T10:00:00.000Z', history: [], timeLogs: []
      },
      {
        id: 'dup-v2-b2', externalId: 'dup-v2-b2', title: 'Cumprir despacho e juntar procuração', process: '5008438-17.2023.8.21.0016',
        client: 'Cliente Sintético B', responsible: 'Advogado Teste UI V2 Dois', status: 'triagem', priority: 'normal',
        deadline: '2026-10-02', intimationId: 'src-dup-b', sourceIntimationId: 'src-dup-b',
        createdAt: '2026-09-19T10:00:00.000Z', history: [], timeLogs: []
      }
    ],
    intimations: [
      {
        id: 'src-dup-a', externalId: 'src-dup-a', title: 'Intimação eproc — contestação', process: '5313106-50.2026.8.21.7000',
        source: 'eproc', treatmentStatus: 'in_review', sourceReportedDeadlineAt: '2026-10-08', linkedTaskIds: ['dup-v2-a1', 'dup-v2-a2']
      },
      {
        id: 'src-dup-b', externalId: 'src-dup-b', title: 'Despacho djen — juntada', process: '5008438-17.2023.8.21.0016',
        source: 'DJEN', treatmentStatus: 'in_review', linkedTaskIds: ['dup-v2-b1', 'dup-v2-b2']
      }
    ]
  };

  const session = await startUiV2Session({ viewport: { width: 1250, height: 900 } });
  let context = null;
  try {
    context = await session.createContext({ viewport: { width: 1250, height: 900 } });
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light' });
    const persisted = await page.evaluate(async seed => {
      const { Store } = window.Atrium;
      Store.state.tasks = seed.tasks;
      Store.state.intimations = seed.intimations;
      return (await Store.flush()) === true;
    }, DUPLICATE_SEED);
    assert.equal(persisted, true, 'o seed sintético das tarefas repetidas precisa persistir para o painel ler do servidor');

    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('#view-dashboard.active').waitFor();
    await page.evaluate(() => {
      window.Atrium.App.switchView('kanban');
      document.getElementById('taskKanbanViewButton')?.click();
    });
    // Os painéis de análise ficam recolhidos atrás do botão discreto.
    await page.locator('#taskAnalysisToggle').click();
    await page.locator('#taskDuplicatePanel:not([hidden])').waitFor({ timeout: 10000 });
    const painel = await page.locator('#taskDuplicatePanel').innerText();
    assert.match(painel, /Tarefas repetidas \(2\)/, 'o painel precisa listar os dois grupos de tarefas repetidas');
    assert.match(painel, /5313106-50\.2026\.8\.21\.7000/, 'o grupo mostra o CNJ formatado');
    assert.match(painel, /5008438-17\.2023\.8\.21\.0016/, 'o segundo grupo também é visível');
    assert.match(painel, /MESMA PUBLICAÇÃO/, 'a origem comum (mesma publicação) é declarada');
    const membroSemPrazo = await page.locator('.task-duplicate-member', { hasText: 'Acompanhar intimação' }).innerText();
    assert.match(membroSemPrazo, /sem prazo/, 'tarefa sem prazo é declarada como tal');
    assert.doesNotMatch(membroSemPrazo, /prazo digitado por pessoa/, 'tarefa sem prazo não pode afirmar prazo digitado por pessoa');
    const membroComPrazoHumano = await page.locator('.task-duplicate-member', { hasText: 'Cumprir despacho' }).innerText();
    assert.match(membroComPrazoHumano, /prazo digitado por pessoa/, 'prazo sem origem na fonte continua marcado como digitado por pessoa');

    await page.locator('[data-task-duplicate-merge]').first().click();
    await page.locator('#riskConfirmAcknowledge').waitFor({ timeout: 10000 });
    const alertaPasso1 = await page.locator('.risk-confirm-modal').innerText();
    assert.match(alertaPasso1, /Você tem certeza que deseja unificar as tarefas repetidas\?/, 'a consolidação passa pelo alerta de risco padrão do Atrium');
    assert.equal(await page.locator('#riskConfirmSkip').count(), 0, 'o "não perguntar novamente" só aparece depois do reconhecimento');
    assert.equal(
      await page.evaluate(() => window.Atrium.Store.state.tasks.filter(task => task.absorbedInto).length),
      0,
      'abrir o alerta não absorve nada — o POST só sai depois da confirmação'
    );

    await page.locator('#riskConfirmAcknowledge').click();
    await page.locator('#riskConfirmAccept').waitFor({ timeout: 10000 });
    const alertaPasso2 = await page.locator('.risk-confirm-modal').innerText();
    assert.match(alertaPasso2, /2 tarefas repetidas do grupo serão unificadas em uma só/, 'a contagem do grupo é declarada no alerta');
    assert.match(alertaPasso2, /unificação pode ser desfeita/, 'a nota fala da absorção de tarefas');
    assert.doesNotMatch(alertaPasso2, /fusão de publicações/, 'o alerta de tarefas não pode falar da fusão de publicações');
    assert.equal(await page.locator('#riskConfirmSkip').count(), 1, 'o passo final oferece "não perguntar novamente"');
    const larguraFechar = await page
      .locator('.risk-confirm-modal header .icon-button')
      .evaluate(element => Math.round(element.getBoundingClientRect().width));
    assert.ok(larguraFechar >= 40, `o botão de fechar precisa manter o alvo de toque (${larguraFechar}px)`);

    await page.locator('[data-risk-action="cancel"]').first().click();
    await page.locator('.risk-confirm-modal').waitFor({ state: 'detached' });
    assert.equal(
      await page.evaluate(() => window.Atrium.Store.state.tasks.filter(task => task.absorbedInto).length),
      0,
      'cancelar o alerta não absorve nenhuma tarefa'
    );

    // Consolidação de verdade: absorve o primeiro grupo e exige que o painel RECARREGUE — sem
    // isso o grupo já absorvido continuava na tela e o clique seguinte caía em "nada-a-absorver".
    await page.locator('[data-task-duplicate-merge]').first().click();
    await page.locator('#riskConfirmAcknowledge').waitFor({ timeout: 10000 });
    await page.locator('#riskConfirmAcknowledge').click();
    await page.locator('#riskConfirmAccept').click();
    await page.locator('.risk-confirm-modal').waitFor({ state: 'detached' });
    await page.locator('#taskDuplicatePanel', { hasText: 'Tarefas repetidas (1)' }).waitFor({ timeout: 10000 });
    const painelDepois = await page.locator('#taskDuplicatePanel').innerText();
    assert.doesNotMatch(painelDepois, /5313106-50\.2026\.8\.21\.7000/, 'o grupo absorvido sai da conferência sozinho');
    assert.match(painelDepois, /5008438-17\.2023\.8\.21\.0016/, 'o outro grupo permanece para decisão');
    const absorvidas = await page.evaluate(() => window.Atrium.Store.state.tasks.filter(task => task.absorbedInto).length);
    assert.equal(absorvidas, 1, 'a consolidação absorve exatamente uma tarefa do grupo escolhido');
    assert.match(await page.locator('#taskDuplicatePanel').innerText(), /Unificada por engano|unificada por engano/, 'a absorção oferece o desfazer');
    assert.deepEqual(pageErrors, [], `Pageerrors: ${pageErrors.join(' | ')}`);
  } finally {
    if (context) await context.close().catch(() => {});
    await session.stop();
  }
}

console.log('✓ Tarefas V2 aprovada: uma feature, seis estados, movimento/rollback, timer, formulário e vínculo com publicação preservados.');
