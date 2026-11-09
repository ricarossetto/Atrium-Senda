import { Store, isoDate, uid } from '../core/store.js?v=3.0.0';
import { requestAuthUsers } from '../core/auth-users-request.js?v=3.0.0';
import { resolveTaskAssignees, matchMemberByName, memberIdOf, memberKeys } from '../core/task-assignees.js?v=3.0.0';
import { findProcessForRecord, userInvolvedInProcess } from '../core/office-involvement.js?v=3.0.0';
import { isAvatarDataUrl, memberAvatarHtml } from '../core/member-avatar.js?v=3.0.0';
import { resolveIntimationId, findIntimationRecord } from '../core/publication-scope.js?v=3.0.0';
import { formatCnj } from '../core/cnj.js?v=3.0.0';
import { refreshTaskTriage, taskTriageBadge } from '../core/task-triage.js?v=3.0.0';
import { KANBAN_COLUMN_LIMIT, createTasksV2Presenter } from '../views/ui-v2/tasks-presenter.js?v=3.0.0';
import { transitionPageContent, focusPageControl } from '../views/ui-v2/page-transition.js?v=3.0.0';
import { iconSvg } from '../views/ui-v2/icons.js?v=3.0.0';
import { createRiskConfirm } from '../components/risk-confirm.js?v=3.0.0';
import { refreshCompletionNotifications } from '../core/notification-inbox.js?v=3.0.0';
import { renderOfficeInvolved, taskInvolvedPeople, teamForPeople, teamForTask } from '../core/office-involved.js?v=3.0.0';
import { getOfficeDirectory, officeDirectoryLoaded, refreshOfficeDirectory } from '../core/office-directory.js?v=3.0.0';
import { officeOabKeys } from '../core/publication-parties.js?v=3.0.0';

const pluralize = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`;

export const TASK_COLUMNS = Object.freeze([
  { id: 'triagem', title: 'Entrada e triagem', color: '#c9a84c' },
  { id: 'prioridade', title: 'Prioridade', color: '#e5a84b' },
  { id: 'andamento', title: 'Em andamento', color: '#6f9fd8' },
  { id: 'aguardando', title: 'Aguardando', color: '#a887c7' },
  { id: 'revisao', title: 'Revisão', color: '#d68a67' },
  { id: 'concluida', title: 'Concluída', color: '#40b879' }
]);

export const TASK_LIST_PAGE_SIZES = Object.freeze([25, 100, 500, 1000]);
export const TASK_LIST_DEFAULT_PAGE_SIZE = 25;

function taskListTotalPages(total, size) {
  const safeSize = TASK_LIST_PAGE_SIZES.includes(size) ? size : TASK_LIST_DEFAULT_PAGE_SIZE;
  return Math.max(1, Math.ceil((Number(total) || 0) / safeSize));
}

const NEUTRAL_TASK_SOURCE_LABELS = new Map([
  ['interna', 'INTERNA'],
  ['manual', 'MANUAL'],
  ['demonstração', 'DEMONSTRAÇÃO'],
  ['demonstracao', 'DEMONSTRAÇÃO'],
  ['djen', 'DJEN'],
  ['datajud', 'DATAJUD'],
  ['publicação', 'PUBLICAÇÃO'],
  ['publicacao', 'PUBLICAÇÃO'],
  ['sistema jurídico', 'SISTEMA JURÍDICO']
]);

const taskSourceLabel = source => {
  const normalized = String(source || 'Interna').trim().toLocaleLowerCase('pt-BR');
  return NEUTRAL_TASK_SOURCE_LABELS.get(normalized) || 'SISTEMA JURÍDICO';
};

export function createTasksFeature({
  store = Store,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  navigatorRef = globalThis.navigator,
  escapeHtml,
  formatDate,
  formatMinutes,
  totalTimeMinutes,
  daysUntil,
  decodeHtmlEntities,
  initials,
  isTerminalStatus,
  getCurrentUserName,
  openModal,
  closeModal,
  showToast,
  onRenderAll,
  onAnalyzeWithAi,
  onOpenProcess,
  onTaskCompleted,
  now = () => Date.now()
} = {}) {
  let initialized = false;
  let activeTimeSheetTaskId = null;
  let timeSheetStartedAt = null;
  let timeSheetInterval = null;
  let tasksPresenter;
  let kanbanColumnsDraft = [];
  let taskViewMode = 'list';
  let taskListQuery = '';
  let taskListFilter = 'active';
  let taskListSort = 'deadline';
  let taskMineOnly = false;
  // Filtro organizacional "apenas meus itens": apresentação, não fronteira de
  // segurança. Colaboradores começam com o recorte ligado; a escolha persiste.
  const readMineOnlyPreference = () => {
    try {
      const stored = windowRef?.localStorage?.getItem('atrium:tasks:mineOnly');
      if (stored === '1') return true;
      if (stored === '0') return false;
    } catch { /* armazenamento indisponível: usa o padrão por papel */ }
    return windowRef?.KellerAuth?.currentUser?.role === 'collaborator';
  };
  const resolveMe = () => {
    const currentUser = windowRef?.KellerAuth?.currentUser || {};
    const directory = getTeamDirectory();
    return matchMemberByName(directory, currentUser.username)
      || matchMemberByName(directory, currentUser.displayName)
      || { username: currentUser.username, displayName: currentUser.displayName, email: currentUser.email };
  };
  const taskVisibleToMe = task => {
    if (!taskMineOnly) return true;
    const me = resolveMe();
    if (!me?.username && !me?.displayName) return true;
    const keys = memberKeys(me);
    const ownIds = [task.assigneeUserId, ...(Array.isArray(task.followerUserIds) ? task.followerUserIds : [])]
      .map(value => String(value || '').trim()).filter(Boolean);
    if (ownIds.some(id => keys.has(id))) return true;
    const ownNames = [task.responsible, ...(Array.isArray(task.responsibles) ? task.responsibles : String(task.responsibles || '').split(/[,;]/))]
      .map(value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim())
      .filter(Boolean);
    if (ownNames.some(name => keys.has(name))) return true;
    const process = findProcessForRecord(task, store.state.processes);
    return process ? userInvolvedInProcess(process, me, getOfficeDirectory().teams || []) : false;
  }
  let taskListPage = 1;
  let taskListPageSize = TASK_LIST_DEFAULT_PAGE_SIZE;
  let lastListTotal = 0;
  // Painéis informativos recolhidos: abrir/fechar é estado de sessão (memória), sem Store,
  // revision ou request — a gestão das tarefas é o corpo da view, não os painéis.
  let taskAnalysisOpen = false;

  const byId = id => documentRef?.getElementById(id);
  const canonicalIntimationId = value => (value ? resolveIntimationId(store.state.intimations, value) : '');
  // Diretório de integrantes para delegação: cache curto, falha silenciosa.
  // O backend é a autoridade; aqui só orientamos a escolha e o espelho local.
  let teamDirectory = [];
  let teamDirectoryAt = 0;
  const getTeamDirectory = () => teamDirectory;
  const refreshTeamDirectory = async (force = false) => {
    if (!force && Date.now() - teamDirectoryAt < 60000 && teamDirectory.length) return teamDirectory;
    try {
      const response = windowRef?.KellerAuth?.secureFetch ? await requestAuthUsers(windowRef.KellerAuth.secureFetch, { force }) : null;
      if (!response?.ok) return teamDirectory;
      const data = await response.json();
      const users = Array.isArray(data?.users) ? data.users : [];
      teamDirectory = users.filter(user => user && user.status !== 'inactive');
      teamDirectoryAt = Date.now();
    } catch {
      // Mantém o último diretório conhecido; delegação por texto segue válida.
    }
    return teamDirectory;
  };
  const teamMemberOptions = () => getTeamDirectory().map(member => ({
    id: String(member.id || member.username || ''),
    value: String(member.displayName || member.username || ''),
    label: [member.role === 'admin' ? 'Administrador' : member.role === 'master_admin' ? 'Mestre' : 'Colaborador', member.email].filter(Boolean).join(' · '),
    avatar: isAvatarDataUrl(member.avatar) ? member.avatar : ''
  })).filter(option => option.id && option.value);
  // Resolve o integrante do cartão: id oficial primeiro, nome como fallback; nunca inventa vínculo.
  const resolveMemberFor = task => {
    const directory = getTeamDirectory();
    const id = String(task?.assigneeUserId || '').trim();
    if (id) {
      const byId = directory.find(member => String(member.id || '') === id || String(member.username || '') === id);
      if (byId) return byId;
    }
    return matchMemberByName(directory, task?.responsible) || null;
  };
  const isV2 = () => documentRef?.documentElement?.dataset?.ui === 'v2' && windowRef?.localStorage?.getItem?.('atrium:ui:mode') !== 'classic';
  const safeEscape = value => {
    const text = String(value ?? '');
    return typeof escapeHtml === 'function'
      ? escapeHtml(text)
      : text.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  };
  const COLUMN_COLOR_PATTERN = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|var\(--[a-zA-Z0-9-]+\))$/;
  const safeColumnColor = value => {
    const color = String(value ?? '').trim();
    return COLUMN_COLOR_PATTERN.test(color) ? color : '#c9a84c';
  };
  const officeTaskAreaData = () => globalThis.OFFICE_DEFAULT_DATA || {};
  const resolveTaskArea = definition => {
    const resolver = officeTaskAreaData().resolveTaskArea;
    if (typeof resolver === 'function') return resolver(definition);
    return String(definition?.area || definition?.phase || '').trim() || 'Geral';
  };
  const taskAreaOptions = () => {
    const canonical = officeTaskAreaData().taskAreas;
    const areas = Array.isArray(canonical) ? [...canonical] : [];
    (store.state.configuration?.actionGroups || []).forEach(item => {
      const name = String(typeof item === 'string' ? item : item?.name || '').trim();
      if (name) areas.push(name);
    });
    return [...new Set(areas)];
  };
  const buildTaskModelOptions = definitions => {
    const order = new Map((officeTaskAreaData().taskAreas || []).map((area, index) => [area, index]));
    return (definitions || [])
      .map(definition => ({ definition, area: resolveTaskArea(definition) }))
      .sort((left, right) => (order.get(left.area) ?? order.size) - (order.get(right.area) ?? order.size)
        || String(left.definition?.name || '').localeCompare(String(right.definition?.name || ''), 'pt-BR'))
      .map(({ definition, area }) => ({
        value: String(definition?.name || ''),
        label: `${area} · ${Number(definition?.points) || 0} pts`,
        group: area
      }))
      .filter(option => option.value);
  };
  const getColumns = () => {
    const saved = store.state.settings?.kanbanColumns;
    if (!Array.isArray(saved) || saved.length < 2) return TASK_COLUMNS.map(column => ({ ...column }));
    const normalized = saved.filter(column => column && column.id && String(column.title || '').trim()).map((column, index) => ({
      id: String(column.id),
      title: String(column.title).trim().slice(0, 48),
      color: String(column.color || TASK_COLUMNS[index % TASK_COLUMNS.length].color)
    }));
    return normalized.some(column => column.id === 'triagem') && normalized.some(column => column.id === 'concluida')
      ? normalized
      : TASK_COLUMNS.map(column => ({ ...column }));
  };
  const getPresenter = () => {
    tasksPresenter ||= createTasksV2Presenter({
      documentRef,
      escapeHtml,
      formatDate,
      formatMinutes,
      totalTimeMinutes,
      daysUntil,
      initials,
      memberFor: resolveMemberFor
    });
    return tasksPresenter;
  };

    // ---------------------------------------------------------------------------
  // Tarefas repetidas: o Atrium IA aponta o grupo, a pessoa escolhe o que fica.
  // A absorção é reversível e auditada; nada é absorvido sozinho quando a fonte diverge.
  // ---------------------------------------------------------------------------
  let taskDuplicateGroups = [];
  let taskDuplicateLoaded = false;
  let taskDuplicateLoading = false;
  let taskDuplicateRunning = false;
  let taskDuplicateLastUndo = [];
  let riskConfirmRunner = null;
  let completeConfirmRunner = null;
  let deleteRunner = null;
  const deleteConfirmRunner = () => {
    deleteRunner ||= createRiskConfirm({ documentRef, escapeHtml, storageKey: 'atrium:tasks:delete-skip' });
    return deleteRunner;
  };

  // Alerta de risco compartilhado (mesmo componente da fusão de publicações): a consolidação
  // absorve tarefas em lote, então exige o reconhecimento explícito antes do POST. A
  // preferência de "não perguntar novamente" é própria desta ação (não herda a das duplicatas
  // de publicação nem a silencia).
  const getRiskConfirm = () => {
    riskConfirmRunner ||= createRiskConfirm({
      documentRef,
      escapeHtml,
      storageKey: 'atrium:ai:tasks-consolidate-skip'
    });
    return riskConfirmRunner;
  };

  async function fetchTaskDuplicateGroups() {
    try {
      const response = await windowRef.KellerAuth.secureFetch('/api/tasks/duplicate-groups', { headers: { Accept: 'application/json' } });
      if (!response.ok) return [];
      const data = await response.json().catch(() => ({}));
      return Array.isArray(data.groups) ? data.groups : [];
    } catch { return []; }
  }

  // Os três painéis informativos (tarefas repetidas, sugestão do Atrium IA e carteira) ficam
  // recolhidos atrás de um botão discreto logo abaixo da toolbar: a gestão das tarefas é o corpo
  // da view. A região só aparece quando algum painel tem conteúdo, e abrir/fechar não toca o
  // Store nem a persistência — é preferência de apresentação da sessão.
  function analysisRegion() {
    const view = byId('view-kanban');
    if (!view) return null;
    let region = byId('taskAnalysis');
    if (region) return region;
    region = documentRef.createElement('section');
    region.id = 'taskAnalysis';
    region.className = 'task-analysis';
    region.hidden = true;
    region.innerHTML = `<button type="button" class="task-analysis-toggle" id="taskAnalysisToggle" aria-expanded="false" aria-controls="taskAnalysisBody">${iconSvg('chevron-right')}<span>Análises e conferência</span></button>
      <div class="task-analysis-body hidden" id="taskAnalysisBody"></div>`;
    // Ordem fixa da view: toolbar -> faixa do Atrium IA -> disclosure -> conteúdo.
    const bar = byId('taskAiPanel');
    const toolbar = view.querySelector('.section-toolbar');
    if (bar) bar.insertAdjacentElement('afterend', region);
    else if (toolbar) toolbar.insertAdjacentElement('afterend', region);
    else view.insertBefore(region, view.firstChild);
    region.addEventListener('click', event => {
      if (!event.target.closest('#taskAnalysisToggle')) return;
      taskAnalysisOpen = !taskAnalysisOpen;
      syncTaskAnalysis();
    });
    return region;
  }

  function analysisPanelHost(id, className) {
    let host = byId(id);
    if (host) return host;
    const body = analysisRegion()?.querySelector('#taskAnalysisBody');
    if (!body) return null;
    host = documentRef.createElement('section');
    host.id = id;
    host.className = className;
    host.hidden = true;
    body.appendChild(host);
    return host;
  }

  function syncTaskAnalysis() {
    const region = byId('taskAnalysis');
    if (!region) return;
    const body = byId('taskAnalysisBody');
    // Ordem fixa estável mesmo com as cargas assíncronas chegando fora de ordem.
    for (const id of ['taskDuplicatePanel', 'taskAiDuplicatePanel', 'taskInsightsPanel']) {
      const host = byId(id);
      if (host && body && host.parentElement !== body) body.appendChild(host);
    }
    const hosts = ['taskDuplicatePanel', 'taskAiDuplicatePanel', 'taskInsightsPanel'].map(byId).filter(Boolean);
    const hasContent = hosts.some(host => !host.hidden && String(host.innerHTML || '').trim());
    if (!hasContent) taskAnalysisOpen = false;
    region.hidden = !hasContent;
    body?.classList.toggle('hidden', !taskAnalysisOpen);
    byId('taskAnalysisToggle')?.setAttribute('aria-expanded', String(Boolean(hasContent && taskAnalysisOpen)));
  }

  // Atrium IA no quadro: faixa compacta sempre visível (mesma família do painel da leitura das
  // publicações) com o estado das leituras assistivas e as ações — os painéis completos continuam
  // recolhidos em "Análises e conferência". Só aparece quando o classificador está ligado.
  function renderTaskAiPanelSafely() {
    try { renderTaskAiPanel(); } catch (error) {
      console.error('[tarefas] painel do Atrium IA falhou ao renderizar:', error);
    }
  }

  function renderTaskAiPanel() {
    const view = byId('view-kanban');
    if (!view) return;
    let host = byId('taskAiPanel');
    if (!host) {
      host = documentRef.createElement('section');
      host.id = 'taskAiPanel';
      host.className = 'ai-classifier-panel task-ai-panel';
      host.setAttribute('role', 'status');
      host.setAttribute('aria-label', 'Atrium IA');
      // O trilho da leitura assistiva fica no tooltip (o texto corrido saiu da faixa por pedido do
      // operador: espaço curto, linguagem direta).
      host.title = 'Leitura assistiva: compara tarefas do mesmo processo (iguais ou só com prazo diferente) e aponta atraso provável. Não cria prazo, não atribui e não decide.';
      host.hidden = true;
      // Ordem fixa da view: toolbar -> faixa do Atrium IA -> disclosure -> conteúdo.
      const region = byId('taskAnalysis');
      const toolbar = view.querySelector('.section-toolbar');
      if (region) region.insertAdjacentElement('beforebegin', host);
      else if (toolbar) toolbar.insertAdjacentElement('afterend', host);
      else view.insertBefore(host, view.firstChild);
    }
    if (!taskAiDuplicate.enabled && !taskRisk.enabled) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    const pendentes = Number(taskAiDuplicate.pending) || 0;
    const absorvidas = Number(taskAiDuplicate.absorbedTotal) || 0;
    const semAnalise = Number(taskRisk.pending) || 0;
    const correcoes = taskInsights.consistency.fixes.length;
    const chips = [
      `<span class="act-chip">${pendentes
        ? `${pendentes} ${pendentes === 1 ? 'tarefa repetida' : 'tarefas repetidas'} para conferir`
        : taskAiDuplicate.truncated ? 'Conferência parcial de tarefas' : 'Sem tarefas repetidas para conferir'}${absorvidas ? ` · ${absorvidas} ${absorvidas === 1 ? 'unificada' : 'unificadas'}` : ''}</span>`,
      `<span class="act-chip">Atraso provável: ${semAnalise
        ? `${semAnalise} ${semAnalise === 1 ? 'tarefa ainda sem leitura' : 'tarefas ainda sem leitura'}`
        : 'nenhuma tarefa apontada'}</span>`,
      correcoes ? `<span class="act-chip">${correcoes} ${correcoes === 1 ? 'correção para conferir' : 'correções para conferir'}</span>` : ''
    ].filter(Boolean).join('');
    const classificar = pendentes > 0
      ? `<button type="button" class="button ghost" data-task-ai-triage>${iconSvg('assistant')}<span>Conferir tarefas repetidas (${pendentes})</span></button>`
      : '';
    // Linha única: estado das leituras + controles + ações (menos altura, menos ruído).
    host.innerHTML = `${iconSvg('assistant')}
      <div class="ai-classifier-panel-body">
        <strong>Atrium IA</strong>
        <div class="task-ai-row">
          <div class="ai-classifier-chips">${chips}</div>
          <label class="task-risk-filter"><select id="taskRiskFilter" aria-label="Filtrar por atraso provável">
            <option value="all"${taskRiskFilter === 'all' ? ' selected' : ''}>Todos</option>
            <option value="alto"${taskRiskFilter === 'alto' ? ' selected' : ''}>Atraso provável alto</option>
            <option value="medio"${taskRiskFilter === 'medio' ? ' selected' : ''}>Atraso provável médio</option>
            <option value="sem-sugestao"${taskRiskFilter === 'sem-sugestao' ? ' selected' : ''}>Sem leitura</option>
          </select></label>
          <button type="button" class="button ghost" id="taskRiskAnalyzeButton" title="O Atrium IA lê a situação e o prazo que a tarefa já tem e aponta atraso provável. Não cria, não altera e não estima prazo.">
            ${iconSvg('search')}<span>Ver tarefas que podem atrasar</span>
          </button>
          ${classificar}
        </div>
      </div>`;
    host.onclick = evento => {
      if (evento.target?.closest?.('[data-task-ai-triage]')) { void runTaskAiDuplicateTriage(host.querySelector('[data-task-ai-triage]')); return; }
      if (evento.target?.closest?.('#taskRiskAnalyzeButton')) { void runTaskRiskAnalysis(byId('taskRiskAnalyzeButton')); }
    };
    host.onchange = evento => {
      if (!evento.target?.closest?.('#taskRiskFilter')) return;
      taskRiskFilter = evento.target.value || 'all';
      // O filtro vale para as duas superfícies: o kanban redesenha a lista junto.
      feature.renderKanban();
    };
    host.hidden = false;
  }

  function renderDuplicatePanelSafely() {
    try { renderDuplicatePanel(); } catch (error) {
      // O painel é acessório e não derruba a aba — mas falha silenciosa é bug de contrato: sem
      // este registro, um erro de render deixava a conferência invisível sem nenhum sinal.
      console.error('[tarefas] painel de tarefas repetidas falhou ao renderizar:', error);
    }
  }

  function renderDuplicatePanel() {
    const host = analysisPanelHost('taskDuplicatePanel', 'card task-duplicate-panel');
    if (!host) return;
    if (!taskDuplicateGroups.length) {
      host.hidden = true;
      host.innerHTML = '';
      syncTaskAnalysis();
      return;
    }
    const desfazer = taskDuplicateLastUndo.length
      ? `<div class="task-duplicate-undo"><span>${pluralize(taskDuplicateLastUndo.length, 'tarefa unificada', 'tarefas unificadas')} agora.</span>
          <button type="button" class="text-button" data-task-duplicate-undo>Tarefa unificada por engano? Desfazer</button></div>`
      : '';
    const grupos = taskDuplicateGroups.map(grupo => {
      const membros = grupo.members.map((membro, indice) => {
        const escolhida = String(membro.id) === String(grupo.suggestedKeeperId) || (!grupo.suggestedKeeperId && indice === 0);
        const pendencias = [
          membro.deadline ? `prazo ${safeEscape(formatDate(membro.deadline))}` : 'sem prazo',
          membro.actLabel && !/^\d{2}\/\d{2}\/\d{4}/.test(String(membro.actLabel).trim()) ? safeEscape(membro.actLabel) : '',
          membro.responsible ? safeEscape(membro.responsible) : '',
          // O selo de origem só vale quando existe prazo: dizer "prazo digitado por pessoa" numa
          // tarefa sem prazo afirmava um fato falso na conferência.
          membro.deadline
            ? (membro.humanOwned ? 'prazo digitado por pessoa' : (membro.deadlineSource === 'fonte' ? 'prazo da fonte' : ''))
            : ''
        ].filter(Boolean).join(' · ');
        return `<label class="task-duplicate-member">
          <input type="radio" name="task-duplicate-${safeEscape(grupo.key)}" value="${safeEscape(membro.id)}" ${escolhida ? 'checked' : ''}>
          <span class="task-duplicate-member-body">
            <strong>${safeEscape(membro.title || 'Tarefa sem título')}</strong>
            <small>${pendencias || 'sem detalhes adicionais'}${membro.fatalDeadline ? ` · prazo fatal ${safeEscape(formatDate(membro.fatalDeadline))}` : ''}</small>
          </span>
        </label>`;
      }).join('');
      const tipoPorClasse = {
        identica: 'MESMA TAREFA',
        'prazo-diferente': 'MESMA TAREFA, PRAZO DIFERENTE',
        'mesma-tarefa': 'MESMA TAREFA, CONTEÚDO DIFERENTE',
        'mesmo-ato': 'MESMO ATO',
        'mesma-publicacao': 'MESMA PUBLICAÇÃO'
      };
      const tipo = tipoPorClasse[grupo.classification] || 'TAREFAS REPETIDAS';
      const atos = Array.isArray(grupo.actLabels)
        ? grupo.actLabels.filter(rotulo => rotulo && !/^\d{2}\/\d{2}\/\d{4}/.test(String(rotulo).trim()))
        : [];
      const rotulos = atos.length > 1 ? ` · atos: ${atos.map(safeEscape).join(' / ')}` : '';
      const contexto = [grupo.actionType, grupo.actionGroup, grupo.client ? `Cliente: ${grupo.client}` : '', grupo.opposingParty ? `Parte contrária: ${grupo.opposingParty}` : '', grupo.courtUnit]
        .filter(Boolean).map(safeEscape).join(' · ');
      return `<article class="task-duplicate-group" data-task-duplicate-group="${safeEscape(grupo.key)}">
        <header>
          <strong>${safeEscape(formatCnj(grupo.processKey))}</strong>
          <span class="task-duplicate-chip">${tipo}</span>
          <span class="task-duplicate-count">${grupo.members.length} tarefas</span>
        </header>
        <p class="task-duplicate-hint">Escolha a tarefa que fica. As outras são unificadas nela (dá para desfazer, e tudo fica na auditoria)${rotulos}.</p>
        ${contexto ? '<p class="task-duplicate-context">' + contexto + '</p>' : ''}
        <div class="task-duplicate-members">${membros}</div>
        <footer>
          <button type="button" class="button gold" data-task-duplicate-merge="${safeEscape(grupo.key)}">Manter esta e unificar as outras</button>
        </footer>
      </article>`;
    }).join('');
    host.innerHTML = `<div class="card-heading">
        <div>
          <p class="eyebrow">Conferência assistiva</p>
          <h3>Tarefas repetidas (${taskDuplicateGroups.length})</h3>
          <p class="task-duplicate-subtitle">Tarefas do mesmo processo comparadas lado a lado: iguais, só com prazo diferente ou do mesmo ato — a fusão continua manual.</p>
        </div>
      </div>
      <div class="task-duplicate-list">${grupos}</div>
      ${desfazer}`;
    // O clique precisa estar ligado: sem delegar aqui, o botão do grupo não fazia nada.
    host.onclick = evento => {
      const botaoFusao = evento.target?.closest?.('[data-task-duplicate-merge]');
      if (botaoFusao) {
        void consolidateDuplicateGroup(botaoFusao.getAttribute('data-task-duplicate-merge'));
        return;
      }
      if (evento.target?.closest?.('[data-task-duplicate-undo]')) {
        const primeiro = taskDuplicateLastUndo[0];
        if (primeiro) void undoTaskConsolidation(primeiro.id);
      }
    };
    host.hidden = false;
    syncTaskAnalysis();
  }

  async function loadTaskDuplicateGroups(force = false) {
    // O guard da mutação não pode barrar esta recarga: a consolidação chama a recarga *enquanto*
    // `taskDuplicateRunning` está ligado, e o early-return daqui deixava na tela o grupo já
    // absorvido — o próximo clique caía em "nada-a-absorver". O freio correto é a busca em voo.
    if (taskDuplicateLoading) return;
    if (taskDuplicateLoaded && !force) return;
    taskDuplicateLoading = true;
    taskDuplicateLoaded = true;
    try {
      taskDuplicateGroups = await fetchTaskDuplicateGroups();
      renderDuplicatePanelSafely();
    } finally {
      taskDuplicateLoading = false;
    }
  }

  // A recusa do servidor precisa chegar em texto humano: o código interno (`nada-a-absorver`)
  // não explica nada para quem opera, e a lista precisa recarregar logo depois.
  function consolidationRefusalMessage(data) {
    const reason = String(data?.reason || '').trim();
    if (reason === 'nada-a-absorver') {
      return 'Nada foi unificado: as tarefas deste grupo já estavam unificadas ou encerradas. A lista foi atualizada.';
    }
    if (reason === 'keeper-indisponivel') {
      return 'A tarefa escolhida para ficar não está mais disponível. A lista foi atualizada.';
    }
    return String(data?.message || data?.error || 'Não foi possível unificar este grupo agora.');
  }

  // A absorção precisa valer no estado local, não só no painel: sem isso o kanban continuava
  // mostrando a tarefa absorvida como ativa (e o próximo flush devolveria o estado antigo).
  // Quando o servidor devolve os registros como ficaram gravados, o espelho usa exatamente esses
  // objetos — reconstruir só com `absorbedInto`/`active` apagava `absorbedBy`, `absorbReason` e o
  // histórico no primeiro flush (a absorção autônoma deixava de ser anunciada e o desfazer sumia).
  function applyTaskAbsorptionLocally(absorbedIds = [], undoEntries = [], revision = '', serverTasks = null) {
    const registros = Array.isArray(serverTasks) ? serverTasks.filter(task => task && task.id) : [];
    if (registros.length) {
      for (const registro of registros) {
        if (typeof store.upsert === 'function') store.upsert('tasks', registro);
        else {
          const existente = store.state.tasks.find(task => String(task.id) === String(registro.id));
          if (existente) Object.assign(existente, registro);
          else store.state.tasks.unshift(registro);
        }
      }
      adoptServerRevision(revision);
      return;
    }
    const ids = new Set((Array.isArray(absorbedIds) ? absorbedIds : []).map(id => String(id)));
    const keepers = new Map((Array.isArray(undoEntries) ? undoEntries : [])
      .map(entry => [String(entry?.id || ''), String(entry?.absorbedInto || '')]));
    const at = new Date().toISOString();
    for (const task of Array.isArray(store.state?.tasks) ? store.state.tasks : []) {
      const id = String(task?.id || '');
      if (!ids.has(id) || !task) continue;
      task.absorbedInto = keepers.get(id) || task.absorbedInto || '';
      task.absorbedAt = task.absorbedAt || at;
      task.active = false;
    }
    adoptServerRevision(revision);
  }

  function applyTaskReturnLocally(absorbedId, revision = '') {
    const alvo = String(absorbedId || '');
    for (const task of Array.isArray(store.state?.tasks) ? store.state.tasks : []) {
      if (!task || String(task.id || '') !== alvo) continue;
      delete task.absorbedInto;
      delete task.absorbedAt;
      task.active = true;
    }
    adoptServerRevision(revision);
  }

  function adoptServerRevision(revision) {
    if (!revision) return;
    store.revision = revision;
    // `store.js` não entra na cadeia versionada: numa máquina com cópia antiga em cache o método
    // pode não existir, então a adoção tem o mesmo efeito pelo caminho direto.
    if (typeof store.adoptServerRevision === 'function') store.adoptServerRevision(revision);
    else if (typeof store.persistenceFingerprint === 'function') store.persistedFingerprint = store.persistenceFingerprint();
  }

  async function consolidateDuplicateGroup(key) {
    if (taskDuplicateRunning) return;
    const grupo = taskDuplicateGroups.find(item => String(item.key) === String(key));
    const host = byId('taskDuplicatePanel');
    if (!grupo || !host) return;
    const escolhido = host.querySelector(`input[name="task-duplicate-${key}"]:checked`);
    const keeperId = String(escolhido?.value || grupo.suggestedKeeperId || '').trim();
    const loserIds = grupo.members.map(membro => String(membro.id)).filter(id => id && id !== keeperId);
    if (!keeperId || loserIds.length === 0) {
      showToast?.('Escolha a tarefa que fica antes de unificar as repetidas.', 'warning');
      return;
    }
    // Absorção em lote passa pelo alerta de risco padrão do Atrium (dois passos, com contagem e
    // itens legíveis) — a decisão continua humana e o motivo fica registrado na auditoria.
    const autorizado = await getRiskConfirm().open({
      count: grupo.members.length,
      countLabel: 'tarefas repetidas do grupo serão unificadas em uma só',
      message: 'O Atrium IA apontou tarefas repetidas do mesmo processo e da mesma origem (publicação ou ato). Ao continuar, a tarefa escolhida fica e as demais são unificadas nela. Dá para desfazer, e tudo fica na auditoria.',
      note: 'Cada tarefa fica registrada na auditoria com o seu nome, e a unificação pode ser desfeita com um clique. Nada é apagado.',
      details: grupo.members
        .slice(0, 5)
        .map(membro => [
          membro.title || 'Tarefa sem título',
          membro.deadline ? `prazo ${formatDate(membro.deadline)}` : 'sem prazo',
          membro.responsible || ''
        ].filter(Boolean).join(' · '))
        .concat(grupo.members.length > 5 ? [`… e mais ${grupo.members.length - 5}`] : []),
      copy: {
        title: 'Você tem certeza que deseja unificar as tarefas repetidas?',
        acknowledge: 'Compreendo os riscos e desejo continuar',
        cancel: 'Não, vou revisar manualmente',
        skip: 'Não perguntar novamente',
        confirmAll: 'Unificar tarefas repetidas'
      }
    });
    if (!autorizado) {
      showToast?.('Nada foi unificado. A revisão continua manual.', 'info');
      return;
    }
    taskDuplicateRunning = true;
    try {
      const response = await windowRef.KellerAuth.secureFetch('/api/tasks/consolidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ keeperId, loserIds })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast?.(consolidationRefusalMessage(data), 'warning');
        taskDuplicateLastUndo = [];
        // O grupo vencido sai da tela: sem esta recarga o botão do grupo já absorvido continuava
        // clicável e o operador só recebia a recusa.
        await loadTaskDuplicateGroups(true);
        return;
      }
      taskDuplicateLastUndo = Array.isArray(data.undo) ? data.undo : [];
      applyTaskAbsorptionLocally(data.absorbed, taskDuplicateLastUndo, data.revision, data.tasks);
      showToast?.(data.message || 'Tarefas repetidas unificadas.', 'success');
      onRenderAll?.();
      await loadTaskDuplicateGroups(true);
    } catch (error) {
      showToast?.('Não foi possível unificar este grupo agora.', 'error');
    } finally {
      taskDuplicateRunning = false;
    }
  }

  async function undoTaskConsolidation(absorbedId) {
    if (!absorbedId) return;
    try {
      const response = await windowRef.KellerAuth.secureFetch('/api/tasks/consolidate/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ absorbedId })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast?.(data.message || data.error || 'Não foi possível desfazer a unificação.', 'warning');
        return;
      }
      taskDuplicateLastUndo = taskDuplicateLastUndo.filter(item => String(item.id) !== String(absorbedId));
      applyTaskReturnLocally(absorbedId, data.revision);
      showToast?.(data.message || 'A unificação foi desfeita.', 'success');
      onRenderAll?.();
      await loadTaskDuplicateGroups(true);
    } catch { showToast?.('Não foi possível desfazer a unificação.', 'error'); }
  }


  // ---------------------------------------------------------------------------
  // Sugestão do Atrium IA: o JEV dá o veredito dos pares que a chave determinística não agrupa
  // ("mesmo ato descrito de outra forma"). A autonomia só absorve sozinha com veredito `mesma`,
  // confiança ≥ 0,90 e a absorvida sendo projeção intocada da fonte — o que não absorve sai com o
  // motivo declarado, e o dono é sempre a declaração de fonte mais recente, nunca o modelo.
  // ---------------------------------------------------------------------------
  let taskAiDuplicate = { enabled: false, pending: 0, threshold: 0.9, pairs: [], absorbed: [] };
  let taskAiDuplicateLoaded = false;
  let taskAiDuplicateLoading = false;
  let taskAiDuplicateRunning = false;
  // Risco de estouro: leitura assistiva do prazo que a tarefa JÁ tem (selo + filtro). Nada aqui
  // cria, altera ou infere prazo — a sugestão só prioriza o que existe.
  let taskRisk = { enabled: false, pending: 0, suggestions: {} };
  let taskRiskLoaded = false;
  let taskRiskLoading = false;
  let taskRiskRunning = false;
  let taskRiskFilter = 'all';

  const TASK_AI_BLOCK_REASONS = Object.freeze({
    'prazo-humano': 'tem prazo digitado por pessoa — a decisão é sua',
    'prazo-fatal-humano': 'tem prazo fatal definido por pessoa — a decisão é sua',
    'curadoria-humana': 'tem curadoria humana (responsável, notas, prioridade ou tempo apontado)',
    'dono-com-curadoria': 'a tarefa que ficaria tem curadoria humana',
    'sem-prazo-da-fonte': 'não é projeção de prazo da fonte',
    'abaixo-do-limiar': 'confiança abaixo de 0,90 — confira antes de unificar',
    'evento-distinto': 'são providências diferentes deste processo',
    incerto: 'não deu para decidir com segurança',
    'teto-da-execucao': 'no limite desta rodada — a próxima verificação retoma',
    'tarefa-ausente': 'as tarefas mudaram desde a classificação',
    'par-invalido': 'o par mudou desde a classificação'
  });

  const taskAiVerdictLabel = verdict => {
    if (verdict === 'mesma') return 'MESMO ATO';
    if (verdict === 'diferente') return 'PROVIDÊNCIAS DIFERENTES';
    if (verdict === 'incerto') return 'SEM CERTEZA';
    return 'AGUARDANDO CLASSIFICAÇÃO';
  };

  // O motor devolve códigos estáveis (`SUGGEST_ONLY`, `LOW_CONFIDENCE_REVIEW`,
  // `INSUFFICIENT_EVIDENCE`); quem opera lê linguagem, não código interno.
  const TASK_AI_MODEL_REASONS = Object.freeze({
    SUGGEST_ONLY: 'o Atrium IA concluiu a leitura das duas tarefas',
    LOW_CONFIDENCE_REVIEW: 'a confiança da leitura ficou baixa e pede conferência',
    INSUFFICIENT_EVIDENCE: 'o texto das tarefas não trouxe evidência suficiente para decidir'
  });

  const taskAiReasonLabel = value => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return TASK_AI_MODEL_REASONS[raw] || raw;
  };

  async function fetchTaskAiDuplicates() {
    try {
      const response = await windowRef.KellerAuth.secureFetch('/api/ai-classifier/task-duplicate-candidates', { headers: { Accept: 'application/json' } });
      if (!response.ok) return null;
      return await response.json().catch(() => null);
    } catch { return null; }
  }

  function renderAiDuplicatePanelSafely() {
    try { renderAiDuplicatePanel(); } catch (error) {
      console.error('[tarefas] painel da sugestão do Atrium IA falhou ao renderizar:', error);
    }
  }

  function aiDuplicateEmptyState() {
    return `<p class="task-duplicate-hint">Nenhum par do mesmo processo fora da chave exata agora. Tarefas do mesmo processo com a mesma publicação continuam na conferência acima.</p>`;
  }

  function aiDuplicatePairMarkup(par) {
    const confianca = Number(par.confidence) || 0;
    const motivo = String(par.blockedBy || '').trim();
    const nota = motivo
      ? `<p class="task-ai-duplicate-note">${safeEscape(TASK_AI_BLOCK_REASONS[motivo] || 'não entra na absorção automática')}</p>`
      : (par.verdict === 'mesma'
        ? '<p class="task-ai-duplicate-note is-auto">o Atrium IA unifica este par na próxima verificação (dá para desfazer).</p>'
        : '');
    const confiancaTexto = par.verdict ? `confiança ${confianca.toFixed(2).replace('.', ',')}` : 'sem veredito ainda';
    // Só o par com veredito `mesma` tem dono e absorvida; sem isso as duas leituras são apenas duas
    // tarefas do processo — dizer "ABSORVIDA" nelas afirmaria um estado que não existe.
    const comPlano = par.verdict === 'mesma' && Boolean(par.suggestedKeeperId) && Boolean(par.absorbedId);
    const acao = comPlano
      ? `<button type="button" class="button gold" data-task-ai-duplicate-absorb="${safeEscape(par.key)}">Unificar esta duplicata</button>`
      : '';
    const atos = [par.aActLabel, par.bActLabel].filter(Boolean).map(safeEscape).join(' / ');
    const papel = id => (String(id) === String(par.suggestedKeeperId) ? 'Fica' : (String(id) === String(par.absorbedId) ? 'Unificada' : 'Tarefa'));
    const ladoA = comPlano ? papel(par.aId) : 'Tarefa A';
    const ladoB = comPlano ? papel(par.bId) : 'Tarefa B';
    return `<article class="task-ai-duplicate-pair" data-task-ai-duplicate-pair="${safeEscape(par.key)}">
      <header>
        <strong>${safeEscape(formatCnj(par.processKey))}</strong>
        <span class="task-duplicate-chip">${taskAiVerdictLabel(par.verdict)}</span>
        <span class="task-ai-duplicate-count">${safeEscape(confiancaTexto)}</span>
      </header>
      <div class="task-ai-duplicate-sides">
        <p class="task-ai-duplicate-side"><span>${ladoA}</span><strong>${safeEscape(par.aTitle || 'Tarefa sem título')}</strong></p>
        <p class="task-ai-duplicate-side"><span>${ladoB}</span><strong>${safeEscape(par.bTitle || 'Tarefa sem título')}</strong></p>
      </div>
      ${atos ? `<p class="task-duplicate-context">atos: ${atos}</p>` : ''}
      ${par.reason ? `<p class="task-ai-duplicate-reason">${safeEscape(taskAiReasonLabel(par.reason))}</p>` : ''}
      ${nota}
      ${acao ? `<footer>${acao}</footer>` : ''}
    </article>`;
  }

  function renderAiDuplicatePanel() {
    const host = analysisPanelHost('taskAiDuplicatePanel', 'card task-duplicate-panel task-ai-duplicate-panel');
    if (!host) return;
    if (!taskAiDuplicate.enabled) {
      host.hidden = true;
      host.innerHTML = '';
      syncTaskAnalysis();
      return;
    }
    const pares = Array.isArray(taskAiDuplicate.pairs) ? taskAiDuplicate.pairs : [];
    const absorvidas = Array.isArray(taskAiDuplicate.absorbed) ? taskAiDuplicate.absorbed : [];
    const pendentes = Number(taskAiDuplicate.pending) || 0;
    const botaoClassificar = pendentes > 0
      ? `<button type="button" class="button" data-task-ai-duplicate-run>Classificar agora (${pendentes})</button>`
      : '';
    const lista = pares.length
      ? `<div class="task-ai-duplicate-list">${pares.map(aiDuplicatePairMarkup).join('')}</div>`
      : aiDuplicateEmptyState();
    const absorvidasBloco = absorvidas.length
      ? `<div class="task-ai-duplicate-absorbed">
          <h4>Unificadas automaticamente (${Number(taskAiDuplicate.absorbedTotal) || absorvidas.length})</h4>
          <ul>${absorvidas.map(item => `<li>
            <span class="task-ai-duplicate-absorbed-body">
              <strong>${safeEscape(item.title || 'Tarefa sem título')}</strong>
              <small>unificada em ${safeEscape(item.keeperTitle || item.keeperId)}${item.confidence ? ` · confiança ${Number(item.confidence).toFixed(2).replace('.', ',')}` : ''}${item.note ? ` · ${safeEscape(item.note)}` : ''}</small>
            </span>
            <button type="button" class="text-button" data-task-ai-duplicate-undo="${safeEscape(item.id)}">Desfazer</button>
          </li>`).join('')}</ul>
          ${Number(taskAiDuplicate.absorbedTotal) > absorvidas.length ? `<p class="task-ai-duplicate-note">Mostrando as ${absorvidas.length} mais recentes de ${Number(taskAiDuplicate.absorbedTotal)} — o histórico completo fica na auditoria.</p>` : ''}
        </div>`
      : '';
    host.innerHTML = `<div class="card-heading">
        <div>
          <p class="eyebrow">Sugestão do Atrium IA</p>
          <h3>Mesmo ato descrito de outra forma (${pares.length})</h3>
          <p class="task-duplicate-subtitle">Pares do mesmo processo que a chave exata não agrupa. O Atrium IA unifica sozinho só quando é o mesmo ato, com confiança de 0,90 ou mais, e a tarefa copiada da fonte não teve nenhum ajuste.</p>
        </div>
        ${botaoClassificar}
      </div>
      ${taskAiDuplicate.truncated ? '<p class="task-duplicate-hint" role="status">A análise está limitada a uma parte das tarefas; podem existir outros pares.</p>' : ''}
      ${lista}
      ${absorvidasBloco}`;
    host.onclick = evento => {
      const classificar = evento.target?.closest?.('[data-task-ai-duplicate-run]');
      if (classificar) { void runTaskAiDuplicateTriage(classificar); return; }
      const absorver = evento.target?.closest?.('[data-task-ai-duplicate-absorb]');
      if (absorver) { void absorbTaskAiDuplicatePair(absorver.getAttribute('data-task-ai-duplicate-absorb'), absorver); return; }
      const desfazer = evento.target?.closest?.('[data-task-ai-duplicate-undo]');
      if (desfazer) { void undoTaskConsolidation(desfazer.getAttribute('data-task-ai-duplicate-undo')); }
    };
    host.hidden = false;
    syncTaskAnalysis();
  }

  async function loadTaskAiDuplicates(force = false) {
    if (taskAiDuplicateLoading) return;
    if (taskAiDuplicateLoaded && !force) return;
    taskAiDuplicateLoading = true;
    taskAiDuplicateLoaded = true;
    try {
      const data = await fetchTaskAiDuplicates();
      taskAiDuplicate = {
        enabled: data?.enabled === true,
        pending: Number(data?.pending) || 0,
        threshold: Number(data?.threshold) || 0.9,
        truncated: data?.truncated === true,
        pairs: Array.isArray(data?.pairs) ? data.pairs : [],
        absorbed: Array.isArray(data?.absorbed) ? data.absorbed : [],
        absorbedTotal: Number(data?.absorbedTotal) || (Array.isArray(data?.absorbed) ? data.absorbed.length : 0)
      };
      renderAiDuplicatePanelSafely();
      renderTaskAiPanelSafely();
    } finally {
      taskAiDuplicateLoading = false;
    }
  }

  function taskAiTriageSummary(data) {
    const absorvidas = Array.isArray(data?.absorbed) ? data.absorbed.length : 0;
    const classificados = Number(data?.classified) || 0;
    const pendentes = Number(data?.pending) || 0;
    const falhas = Number(data?.failed) || 0;
    // Falha do classificador nunca pode ser lida como "não há nada para revisar": a mensagem
    // declara quantos pares não foram lidos e o que fazer (achado do crítico de 2026-09-30).
    if (falhas > 0 && classificados === 0) {
      return `O classificador falhou agora em ${pluralize(falhas, 'par', 'pares')} — nada foi unificado. Tente de novo em instantes.`;
    }
    if (falhas > 0) {
      return `${pluralize(classificados, 'par classificado', 'pares classificados')} e ${pluralize(falhas, 'falha', 'falhas')} do classificador — ${pluralize(pendentes, 'ainda pendente', 'ainda pendentes')}.`;
    }
    if (absorvidas > 0) {
      return `${pluralize(classificados, 'par classificado', 'pares classificados')} e ${pluralize(absorvidas, 'unificado automaticamente', 'unificados automaticamente')} (reversível, com registro na auditoria).`;
    }
    if (classificados > 0) return `${pluralize(classificados, 'par classificado', 'pares classificados')} — nenhum entrou na absorção automática (o motivo está na lista).`;
    return pendentes > 0 ? 'Nada novo para classificar agora.' : 'Nenhum par pendente de classificação.';
  }

  async function runTaskAiDuplicateTriage(botao) {
    if (taskAiDuplicateRunning) return;
    taskAiDuplicateRunning = true;
    if (botao) botao.disabled = true;
    try {
      const response = await windowRef.KellerAuth.secureFetch('/api/ai-classifier/triage-task-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast?.(String(data?.message || data?.error || 'Não foi possível classificar os pares agora.'), 'warning');
        return;
      }
      const absorvidas = Array.isArray(data.absorbed) ? data.absorbed : [];
      if (absorvidas.length) {
        applyTaskAbsorptionLocally(
          absorvidas.map(item => item.absorbedId),
          absorvidas.map(item => ({ id: item.absorbedId, absorbedInto: item.keeperId })),
          data.revision,
          data.tasks
        );
        onRenderAll?.();
      }
      showToast?.(taskAiTriageSummary(data), absorvidas.length ? 'success' : (Number(data.failed) > 0 ? 'warning' : 'info'));
      await loadTaskAiDuplicates(true);
      await loadTaskDuplicateGroups(true);
    } catch {
      showToast?.('Não foi possível classificar os pares agora.', 'error');
    } finally {
      taskAiDuplicateRunning = false;
      if (botao?.isConnected) botao.disabled = false;
    }
  }

  async function absorbTaskAiDuplicatePair(key, botao) {
    if (taskAiDuplicateRunning) return;
    const par = (Array.isArray(taskAiDuplicate.pairs) ? taskAiDuplicate.pairs : []).find(item => String(item.key) === String(key));
    if (!par || !par.suggestedKeeperId || !par.absorbedId) {
      showToast?.('Este par mudou desde a classificação. A lista foi atualizada.', 'warning');
      await loadTaskAiDuplicates(true);
      return;
    }
    taskAiDuplicateRunning = true;
    if (botao) botao.disabled = true;
    try {
      // Mesmo alerta de risco das tarefas repetidas: a decisão é humana e o "não perguntar
      // novamente" é a preferência do próprio escritório para esta família de ação.
      const autorizado = await getRiskConfirm().open({
        count: 1,
        countLabel: 'tarefa será absorvida pela principal do par sugerido',
        message: 'O Atrium IA identificou o mesmo ato descrito de duas formas neste processo. Ao continuar, a tarefa indicada é absorvida pela que fica — a absorção é reversível e fica na auditoria.',
        note: 'A tarefa absorvida volta ao fluxo com um clique. Nada é apagado e nenhum prazo é alterado.',
        details: [`${par.aTitle || 'Tarefa sem título'} × ${par.bTitle || 'Tarefa sem título'}`],
        copy: {
          title: 'Você tem certeza que deseja unificar esta duplicata?',
          acknowledge: 'Compreendo os riscos e desejo continuar',
          cancel: 'Não, vou revisar manualmente',
          skip: 'Não perguntar novamente',
          confirmAll: 'Absorver duplicata'
        }
      });
      if (!autorizado) {
        showToast?.('Nada foi unificado. A revisão continua manual.', 'info');
        return;
      }
      const response = await windowRef.KellerAuth.secureFetch('/api/tasks/consolidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ keeperId: par.suggestedKeeperId, loserIds: [par.absorbedId] })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast?.(consolidationRefusalMessage(data), 'warning');
        await loadTaskAiDuplicates(true);
        await loadTaskDuplicateGroups(true);
        return;
      }
      taskDuplicateLastUndo = Array.isArray(data.undo) ? data.undo : [];
      applyTaskAbsorptionLocally(data.absorbed, taskDuplicateLastUndo, data.revision);
      showToast?.(data.message || 'Duplicata absorvida.', 'success');
      onRenderAll?.();
      await loadTaskAiDuplicates(true);
      await loadTaskDuplicateGroups(true);
    } catch {
      showToast?.('Não foi possível unificar esta duplicata agora.', 'error');
    } finally {
      taskAiDuplicateRunning = false;
      if (botao?.isConnected) botao.disabled = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Risco de estouro: selo + filtro a partir da leitura assistiva. O filtro também aceita
  // "sem análise ainda" para o operador ver o que ainda não passou pelo classificador.
  // ---------------------------------------------------------------------------
  async function fetchTaskRisks() {
    try {
      const response = await windowRef.KellerAuth.secureFetch('/api/ai-classifier/task-risks', { headers: { Accept: 'application/json' } });
      if (!response.ok) return null;
      return await response.json().catch(() => null);
    } catch { return null; }
  }

  function taskRiskOf(id) {
    return taskRisk.suggestions?.[String(id || '')] || null;
  }

  function taskRiskMatches(task) {
    if (taskRiskFilter === 'all') return true;
    const risco = taskRiskOf(task?.id);
    if (taskRiskFilter === 'sem-sugestao') return !String(risco?.risk || '');
    return String(risco?.risk || '') === taskRiskFilter;
  }

  async function loadTaskRisks(force = false) {
    if (taskRiskLoading) return;
    if (taskRiskLoaded && !force) return;
    taskRiskLoading = true;
    taskRiskLoaded = true;
    try {
      const data = await fetchTaskRisks();
      taskRisk = {
        enabled: data?.enabled === true,
        pending: Number(data?.pending) || 0,
        suggestions: data?.suggestions && typeof data.suggestions === 'object' ? data.suggestions : {}
      };
      renderTaskAiPanelSafely();
    } finally {
      taskRiskLoading = false;
    }
  }

  async function runTaskRiskAnalysis(botao) {
    if (taskRiskRunning) return;
    taskRiskRunning = true;
    if (botao) botao.disabled = true;
    try {
      const response = await windowRef.KellerAuth.secureFetch('/api/ai-classifier/triage-task-risks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast?.(String(data?.message || data?.error || 'Não foi possível analisar os riscos agora.'), 'warning');
        return;
      }
      const classificados = Number(data.classified) || 0;
      const falhas = Number(data.failed) || 0;
      if (falhas > 0 && classificados === 0) {
        showToast?.(`O classificador falhou agora em ${pluralize(falhas, 'tarefa', 'tarefas')} — nada foi alterado. Tente de novo em instantes.`, 'warning');
        return;
      }
      showToast?.(
        `${pluralize(classificados, 'tarefa analisada', 'tarefas analisadas')}${falhas ? ` e ${pluralize(falhas, 'falha', 'falhas')}` : ''} — o selo de risco aparece na lista e no Kanban; o prazo não foi alterado.`,
        falhas ? 'warning' : 'info'
      );
      await loadTaskRisks(true);
      onRenderAll?.();
    } catch {
      showToast?.('Não foi possível analisar os riscos agora.', 'error');
    } finally {
      taskRiskRunning = false;
      if (botao?.isConnected) botao.disabled = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Carteira e consistência (determinístico, sem modelo): resumo em linguagem, incoerências com
  // evidência (correção aditiva + desfazer) e sugestão de responsável — que nunca atribui.
  // ---------------------------------------------------------------------------
  let taskInsights = { consistency: { fixes: [], suggestions: [] }, portfolio: { lines: [] }, assignment: { suggestions: [] } };
  let taskInsightsLoaded = false;
  let taskInsightsLoading = false;
  let taskInsightsRunning = false;

  const TASK_CONSISTENCY_FIELD_LABELS = Object.freeze({
    completedAt: 'data de conclusão',
    responsible: 'responsável',
    absorbedInto: 'principal da absorção',
    status: 'situação'
  });

  async function fetchTaskInsights() {
    try {
      const response = await windowRef.KellerAuth.secureFetch('/api/ai-classifier/task-insights', { headers: { Accept: 'application/json' } });
      if (!response.ok) return null;
      return await response.json().catch(() => null);
    } catch { return null; }
  }

  async function loadTaskInsights(force = false) {
    if (taskInsightsLoading) return;
    if (taskInsightsLoaded && !force) return;
    taskInsightsLoading = true;
    taskInsightsLoaded = true;
    try {
      const data = await fetchTaskInsights();
      taskInsights = {
        consistency: {
          fixes: Array.isArray(data?.consistency?.fixes) ? data.consistency.fixes : [],
          suggestions: Array.isArray(data?.consistency?.suggestions) ? data.consistency.suggestions : []
        },
        portfolio: { lines: Array.isArray(data?.portfolio?.lines) ? data.portfolio.lines : [] },
        assignment: { suggestions: Array.isArray(data?.assignment?.suggestions) ? data.assignment.suggestions : [] }
      };
      renderInsightsPanelSafely();
      renderTaskAiPanelSafely();
    } finally {
      taskInsightsLoading = false;
    }
  }

  function renderInsightsPanelSafely() {
    try { renderInsightsPanel(); } catch (error) {
      console.error('[tarefas] painel de carteira falhou ao renderizar:', error);
    }
  }

  function renderInsightsPanel() {
    const host = analysisPanelHost('taskInsightsPanel', 'card task-insights-panel');
    if (!host) return;
    const fixes = taskInsights.consistency.fixes;
    const suggestions = taskInsights.consistency.suggestions;
    const portfolio = taskInsights.portfolio.lines;
    const assignment = taskInsights.assignment.suggestions;
    if (!fixes.length && !suggestions.length && !portfolio.length && !assignment.length) {
      host.hidden = true;
      host.innerHTML = '';
      syncTaskAnalysis();
      return;
    }
    // Os controles de risco (filtro e "Analisar riscos") vivem na faixa do Atrium IA, sempre
    // visível; aqui fica só o que é leitura determinística do acervo.
    const resumo = portfolio.length
      ? `<div class="task-insights-section"><h4>Resumo da carteira</h4><ul class="task-insights-lines">${portfolio.map(linha => `<li>${safeEscape(linha)}</li>`).join('')}</ul></div>`
      : '';
    const consistencia = (fixes.length || suggestions.length)
      ? `<div class="task-insights-section">
          <h4>Consistência cadastral${fixes.length ? ` — ${pluralize(fixes.length, 'correção com evidência', 'correções com evidência')}` : ''}</h4>
          ${fixes.length ? `<ul class="task-insights-list">${fixes.map(item => `<li data-task-consistency-fix="${safeEscape(item.taskId)}">
            <span class="task-insights-item"><strong>${safeEscape(item.title || item.taskId)}</strong><small>${safeEscape(TASK_CONSISTENCY_FIELD_LABELS[item.field] || item.field)} em branco · ${safeEscape(item.evidence)}</small></span>
          </li>`).join('')}</ul>
          <footer class="task-insights-actions">
            <button type="button" class="button gold" data-task-consistency-apply>Corrigir com evidência (${fixes.length})</button>
            <button type="button" class="text-button" data-task-consistency-undo>Desfazer correções</button>
          </footer>`
          : '<p class="task-insights-note">Nenhuma correção automática com evidência inequívoca agora.</p>'}
          ${suggestions.length ? `<details class="task-insights-suggestions"><summary>${suggestions.length === 1 ? '1 ponto para conferência humana (não é corrigido sozinho)' : `${suggestions.length} pontos para conferência humana (não são corrigidos sozinhos)`}</summary><ul class="task-insights-list">${suggestions.map(item => `<li><span class="task-insights-item"><strong>${safeEscape(item.title || item.taskId)}</strong><small>${safeEscape(TASK_CONSISTENCY_FIELD_LABELS[item.field] || item.field)}: ${safeEscape(item.current || 'vazio')} · ${safeEscape(item.evidence)}</small></span></li>`).join('')}</ul></details>` : ''}
        </div>`
      : '';
    const responsavel = assignment.length
      ? `<div class="task-insights-section"><h4>Sugestão de responsável (não atribui)</h4><ul class="task-insights-list">${assignment.slice(0, 5).map(item => `<li><span class="task-insights-item"><strong>${safeEscape(item.name)}</strong><small>confiança ${Number(item.confidence || 0).toFixed(2).replace('.', ',')} · ${safeEscape(item.basis)}</small></span></li>`).join('')}</ul></div>`
      : '';
    host.innerHTML = `<div class="card-heading"><div><p class="eyebrow">Carteira e consistência</p><h3>Panorama das tarefas</h3><p class="task-duplicate-subtitle">Leitura determinística do acervo — informa e prioriza o que já existe; não cria prazo, não atribui e não decide.</p></div></div>
      ${resumo}
      ${consistencia}
      ${responsavel}`;
    host.onclick = evento => {
      if (evento.target?.closest?.('[data-task-consistency-apply]')) { void applyConsistencyFixes(); return; }
      if (evento.target?.closest?.('[data-task-consistency-undo]')) { void undoConsistencyFixes(); }
    };
    host.hidden = false;
    syncTaskAnalysis();
  }

  async function applyConsistencyFixes() {
    if (taskInsightsRunning) return;
    const fixes = taskInsights.consistency.fixes;
    if (!fixes.length) return;
    const autorizado = await getRiskConfirm().open({
      count: fixes.length,
      countLabel: fixes.length === 1 ? 'campo estrutural será preenchido com evidência' : 'campos estruturais serão preenchidos com evidência',
      message: 'A correção preenche apenas campo em branco (nunca sobrescreve valor existente), com a evidência declarada, fica na auditoria e pode ser desfeita.',
      note: 'Nada de prazo, responsável ou conteúdo jurídico é alterado: são só campos estruturais em branco.',
      details: fixes.slice(0, 5).map(item => `${item.title || item.taskId} · ${TASK_CONSISTENCY_FIELD_LABELS[item.field] || item.field}`),
      copy: {
        title: 'Você tem certeza que deseja corrigir as inconsistências?',
        acknowledge: 'Compreendo os riscos e desejo continuar',
        cancel: 'Não, vou revisar manualmente',
        skip: 'Não perguntar novamente',
        confirmAll: 'Corrigir com evidência'
      }
    });
    if (!autorizado) {
      showToast?.('Nada foi corrigido.', 'info');
      return;
    }
    taskInsightsRunning = true;
    try {
      const response = await windowRef.KellerAuth.secureFetch('/api/tasks/consistency/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast?.(String(data?.message || data?.error || 'Não foi possível corrigir agora.'), 'warning');
        return;
      }
      for (const registro of Array.isArray(data.tasks) ? data.tasks : []) {
        if (typeof store.upsert === 'function') store.upsert('tasks', registro);
      }
      adoptServerRevision(data.revision);
      showToast?.(String(data.message || 'Consistência corrigida.'), data.applied?.length ? 'success' : 'info');
      onRenderAll?.();
      await loadTaskInsights(true);
    } catch {
      showToast?.('Não foi possível corrigir agora.', 'error');
    } finally {
      taskInsightsRunning = false;
    }
  }

  async function undoConsistencyFixes() {
    if (taskInsightsRunning) return;
    taskInsightsRunning = true;
    try {
      const response = await windowRef.KellerAuth.secureFetch('/api/tasks/consistency/undo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showToast?.(String(data?.message || data?.error || 'Não foi possível desfazer agora.'), 'warning');
        return;
      }
      for (const registro of Array.isArray(data.tasks) ? data.tasks : []) {
        if (typeof store.upsert === 'function') store.upsert('tasks', registro);
      }
      // O merge do upsert não apaga campo: o desfazer aplica os valores que o servidor restaurou
      // (campo vazio significa "o campo não existia antes").
      for (const registro of Array.isArray(data.restored) ? data.restored : []) {
        const tarefa = (Array.isArray(store.state.tasks) ? store.state.tasks : [])
          .find(task => task && String(task.id) === String(registro?.taskId));
        if (!tarefa || !registro?.field) continue;
        if (registro.restored === '' || registro.restored === undefined || registro.restored === null) delete tarefa[registro.field];
        else tarefa[registro.field] = registro.restored;
      }
      adoptServerRevision(data.revision);
      showToast?.(String(data.message || 'Correção desfeita.'), 'info');
      onRenderAll?.();
      await loadTaskInsights(true);
    } catch {
      showToast?.('Não foi possível desfazer agora.', 'error');
    } finally {
      taskInsightsRunning = false;
    }
  }

  const feature = {
    get initialized() { return initialized; },
    get activeTimeSheetTaskId() { return activeTimeSheetTaskId; },
    get timeSheetStartedAt() { return timeSheetStartedAt; },
    get timeSheetInterval() { return timeSheetInterval; },

    init() {
      if (initialized) return false;
      initialized = true;
      taskViewMode = 'list';
      void this.refreshTaskTriageSuggestions();
      byId('newTaskButton')?.addEventListener('click', () => this.openTaskModal());
      byId('editKanbanColumnsButton')?.addEventListener('click', () => this.openColumnsEditor());
      byId('taskListViewButton')?.addEventListener('click', () => this.setTaskViewMode('list'));
      byId('taskKanbanViewButton')?.addEventListener('click', () => this.setTaskViewMode('kanban'));
      byId('taskListSummary')?.addEventListener('click', event => {
        const card = event.target.closest('[data-task-summary-filter]');
        if (!card) return;
        const filter = card.dataset.taskSummaryFilter;
        if (filter) {
          taskListFilter = filter;
          const statusFilterSelect = byId('taskListStatusFilter');
          if (statusFilterSelect) statusFilterSelect.value = filter;
          this.renderTaskList({ resetPage: true });
        }
      });
      byId('taskListSearch')?.addEventListener('input', event => {
        taskListQuery = event.target.value || '';
        this.renderTaskList({ resetPage: true });
      });
      byId('taskListStatusFilter')?.addEventListener('change', event => {
        taskListFilter = event.target.value || 'active';
        this.renderTaskList({ resetPage: true });
      });
      byId('taskListSort')?.addEventListener('change', event => {
        taskListSort = event.target.value || 'deadline';
        this.renderTaskList({ resetPage: true });
      });
      taskMineOnly = readMineOnlyPreference();
      const mineOnlyBox = byId('taskListMineOnly');
      if (mineOnlyBox) {
        mineOnlyBox.checked = taskMineOnly;
        mineOnlyBox.addEventListener('change', event => {
          taskMineOnly = event.target.checked === true;
          try { windowRef?.localStorage?.setItem('atrium:tasks:mineOnly', taskMineOnly ? '1' : '0'); } catch { /* preferência de apresentação: falha silenciosa */ }
          this.renderTaskList({ resetPage: true });
          this.renderKanban();
        });
      }
      // O filtro de risco e o botão "Analisar riscos" vivem no painel de carteira (delegação lá).
      byId('taskListPanel')?.addEventListener('click', event => this.handleTaskPaginationClick(event));
      byId('taskList')?.addEventListener('click', event => {
        const openButton = event.target.closest('[data-task-list-open]');
        if (openButton) {
          const task = store.state.tasks.find(item => String(item.id) === String(openButton.dataset.taskListOpen));
          if (task) this.openTaskModal(task);
          return;
        }
        const startButton = event.target.closest('[data-task-list-timesheet-start]');
        if (startButton) { this.startTimeSheet(startButton.dataset.taskListTimesheetStart); return; }
        if (event.target.closest('[data-task-list-timesheet-stop]')) this.stopTimeSheet();
      });
      byId('taskBulkAssignButton')?.addEventListener('click', async () => {
        const assigned = await this.assignUnownedTasks(byId('taskBulkAssignSelect')?.value);
        if (!assigned) return;
        showToast?.(`${assigned} ${assigned === 1 ? 'tarefa atribuída' : 'tarefas atribuídas'}.`, 'success');
        this.renderTaskList();
        this.renderKanban();
      });
      byId('taskFiltersToggle')?.addEventListener('click', event => {
        const expanded = byId('view-kanban')?.classList.toggle('filters-expanded') === true;
        event.currentTarget.setAttribute('aria-expanded', String(expanded));
      });
      byId('taskList')?.addEventListener('change', async event => {
        const checkbox = event.target.closest('[data-task-complete]');
        if (checkbox) {
          event.stopPropagation();
          const taskId = checkbox.dataset.taskComplete;
          const task = store.state.tasks.find(item => String(item.id) === String(taskId));
          if (!task) return;
          await this.toggleTaskDone(task, checkbox);
          return;
        }
        const select = event.target.closest('[data-task-list-move]');
        if (!select) return;
        const task = store.state.tasks.find(item => String(item.id) === String(select.dataset.taskListMove));
        const previous = task?.status;
        if (!task || previous === select.value) return;
        select.disabled = true;
        const moved = await this.moveTask(task.id, select.value);
        if (!moved && select.isConnected) {
          select.disabled = false;
          select.value = previous;
        }
      });
      byId('kanbanColumnsClose')?.addEventListener('click', () => this.closeColumnsEditor());
      byId('kanbanColumnsCancel')?.addEventListener('click', () => this.closeColumnsEditor());
      byId('kanbanColumnAdd')?.addEventListener('click', () => {
        const index = kanbanColumnsDraft.length;
        kanbanColumnsDraft.push({ id: uid('kanban'), title: `Nova etapa ${index + 1}`, color: TASK_COLUMNS[index % TASK_COLUMNS.length].color });
        this.renderColumnsEditor();
      });
      byId('kanbanColumnsList')?.addEventListener('click', event => {
        const removeButton = event.target.closest('[data-remove-kanban-column]');
        if (!removeButton || removeButton.disabled) return;
        kanbanColumnsDraft = kanbanColumnsDraft.filter(column => column.id !== removeButton.dataset.removeKanbanColumn);
        this.renderColumnsEditor();
      });
      byId('kanbanColumnsList')?.addEventListener('input', event => {
        const input = event.target.closest('[data-kanban-column-title]');
        const column = input && kanbanColumnsDraft.find(item => item.id === input.dataset.kanbanColumnTitle);
        if (column) column.title = input.value;
      });
      byId('kanbanColumnsForm')?.addEventListener('submit', event => this.saveColumns(event));
      this.applyTaskViewMode();
      return true;
    },

    openColumnsEditor() {
      kanbanColumnsDraft = getColumns().map(column => ({ ...column }));
      this.renderColumnsEditor();
      byId('kanbanColumnsBackdrop')?.classList.remove('hidden');
      documentRef.body?.classList.add('kanban-columns-open');
      queueMicrotask(() => byId('kanbanColumnsList')?.querySelector('input')?.focus());
    },

    closeColumnsEditor() {
      byId('kanbanColumnsBackdrop')?.classList.add('hidden');
      documentRef.body?.classList.remove('kanban-columns-open');
      byId('editKanbanColumnsButton')?.focus();
    },

    renderColumnsEditor() {
      const list = byId('kanbanColumnsList');
      if (!list) return;
      list.innerHTML = kanbanColumnsDraft.map((column, index) => {
        const taskCount = store.state.tasks.filter(task => task.active !== false && task.status === column.id).length;
        const structural = column.id === 'triagem' || column.id === 'concluida';
        const removable = !structural && taskCount === 0 && kanbanColumnsDraft.length > 2;
        const reason = structural ? 'Etapa estrutural' : taskCount ? `${taskCount} tarefa${taskCount === 1 ? '' : 's'} nesta coluna` : 'Remover coluna';
        return `<div class="kanban-column-editor-row" data-column-editor-id="${escapeHtml(column.id)}"><span class="kanban-column-editor-index">${index + 1}</span><i style="--column-editor-color:${escapeHtml(column.color)}"></i><label><span>Nome da coluna</span><input data-kanban-column-title="${escapeHtml(column.id)}" maxlength="48" required value="${escapeHtml(column.title)}"></label><span class="kanban-column-editor-count">${taskCount} tarefa${taskCount === 1 ? '' : 's'}</span><button class="icon-button" type="button" data-remove-kanban-column="${escapeHtml(column.id)}" aria-label="${escapeHtml(reason)}" title="${escapeHtml(reason)}" ${removable ? '' : 'disabled'}>${iconSvg('close')}</button></div>`;
      }).join('');
    },

    async saveColumns(event) {
      event.preventDefault();
      const columns = kanbanColumnsDraft.map(column => ({ ...column, title: String(column.title || '').trim() }));
      const normalizedTitles = columns.map(column => column.title.toLocaleLowerCase('pt-BR'));
      if (columns.some(column => !column.title) || new Set(normalizedTitles).size !== normalizedTitles.length) {
        showToast?.('Use nomes preenchidos e diferentes para cada coluna.', 'warning');
        return false;
      }
      const previousState = JSON.parse(JSON.stringify(store.state));
      store.state.settings ||= {};
      store.state.settings.kanbanColumns = columns;
      store.audit('Colunas do Kanban atualizadas', `${columns.length} etapas configuradas.`);
      if (!await store.flush()) {
        store.state = previousState;
        showToast?.('Não foi possível salvar as colunas do Kanban.', 'error');
        return false;
      }
      this.closeColumnsEditor();
      this.renderKanban();
      showToast?.('Colunas do Kanban atualizadas.', 'success');
      return true;
    },

    memberFor(task) { return resolveMemberFor(task); },

    // Atualiza só o avatar do responsável quando o diretório chega, sem trocar o board/cards.
    refreshMemberAvatars() {
      documentRef.querySelectorAll?.('[data-task-owner], [data-task-owner-tag]').forEach(element => {
        const taskId = element.dataset.taskOwner || element.dataset.taskOwnerTag;
        const task = (store.state.tasks || []).find(item => String(item.id) === String(taskId));
        if (!task) return;
        const avatar = memberAvatarHtml(resolveMemberFor(task) || { displayName: task.responsible }, escapeHtml);
        element.innerHTML = element.hasAttribute('data-task-owner-tag')
          ? `${avatar} ${escapeHtml(task.responsible || 'Responsável não informado')}`
          : `${avatar}<span>${escapeHtml(task.responsible || 'Responsável não informado')}</span>`;
      });
    },

    setTaskViewMode(mode) {
      if (!['list', 'kanban'].includes(mode)) return false;
      taskViewMode = mode;
      try { windowRef?.localStorage?.setItem('atrium:tasks:view', mode); } catch {}
      if (mode === 'list') this.renderTaskList();
      this.applyTaskViewMode();
      return true;
    },

    applyTaskViewMode() {
      if (!isV2()) {
        byId('kanbanBoard')?.classList.remove('hidden');
        byId('taskListPanel')?.classList.add('hidden');
        return;
      }
      const listMode = taskViewMode === 'list';
      byId('view-kanban')?.setAttribute('data-task-view', taskViewMode);
      byId('taskViewSwitch')?.setAttribute('data-active-mode', taskViewMode);
      byId('taskListPanel')?.classList.toggle('hidden', !listMode);
      byId('kanbanBoard')?.classList.toggle('hidden', listMode);
      byId('taskBoardInstructions')?.classList.toggle('hidden', listMode);
      for (const button of documentRef.querySelectorAll('[data-task-view-mode]')) {
        const active = button.dataset.taskViewMode === taskViewMode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      }
    },

    getTaskListRecords() {
      const needle = String(taskListQuery || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
      const records = (store.state.tasks || []).filter(task => {
        if (task.active === false) return false;
        // Filtro de risco de estouro (sugestão do Atrium IA): só recorta a fila visível.
        if (!taskRiskMatches(task)) return false;
        if (!taskVisibleToMe(task)) return false;
        const deadline = task.fatalDeadline || task.deadline;
        const terminal = isTerminalStatus(task.status);
        if (taskListFilter === 'active' && terminal) return false;
        if (taskListFilter === 'completed' && !terminal) return false;
        if (taskListFilter === 'overdue' && (!deadline || daysUntil(deadline) >= 0 || terminal)) return false;
        if (taskListFilter === 'week') {
          if (terminal || !deadline) return false;
          const dist = daysUntil(deadline);
          if (dist < 0 || dist > 7) return false;
        }
        if (!needle) return true;
        return String([task.title, task.description, task.client, task.process, task.actionType, task.responsible, task.status].filter(Boolean).join(' '))
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').includes(needle);
      });
      const priorityRank = { urgente: 0, importante: 1, normal: 2 };
      return records.slice().sort((left, right) => {
        if (taskListSort === 'title') return String(left.title || '').localeCompare(String(right.title || ''), 'pt-BR');
        if (taskListSort === 'priority') return (priorityRank[left.priority] ?? 3) - (priorityRank[right.priority] ?? 3) || String(left.title || '').localeCompare(String(right.title || ''), 'pt-BR');
        if (taskListSort === 'updated') return (Date.parse(right.updatedAt || right.createdAt || 0) || 0) - (Date.parse(left.updatedAt || left.createdAt || 0) || 0);
        const leftDeadline = left.fatalDeadline || left.deadline || '9999-12-31';
        const rightDeadline = right.fatalDeadline || right.deadline || '9999-12-31';
        return leftDeadline.localeCompare(rightDeadline) || String(left.title || '').localeCompare(String(right.title || ''), 'pt-BR');
      });
    },

    /**
     * Selos assistivos da tarefa (categoria/urgência). Somente leitura do derivado:
     * nenhuma sugestão move etapa, cria prazo ou altera a tarefa.
     */
    async refreshTaskTriageSuggestions() {
      await refreshTaskTriage();
      this.renderKanban();
      return true;
    },

    renderTaskList({ resetPage = false } = {}) {
      if (!isV2()) return;
      // Avatar do responsável: pré-carrega o diretório e re-renderiza uma vez quando ele chega.
      if (!teamDirectoryAt) {
        void refreshTeamDirectory().then(directory => { if (directory.length) this.refreshMemberAvatars(); });
      }
      if (!officeDirectoryLoaded()) {
        void refreshOfficeDirectory().then(directory => { if (directory.users.length || directory.teams.length) this.renderTaskList(); });
      }
      if (resetPage) taskListPage = 1;
      const filtered = this.getTaskListRecords();
      lastListTotal = filtered.length;
      const totalPages = taskListTotalPages(filtered.length, taskListPageSize);
      if (taskListPage > totalPages) taskListPage = totalPages;
      if (taskListPage < 1) taskListPage = 1;
      const start = (taskListPage - 1) * taskListPageSize;
      const pageRecords = filtered.slice(start, start + taskListPageSize);
      const pagination = { page: taskListPage, pageSize: taskListPageSize, total: filtered.length, totalPages };
      const involvedFor = task => {
        const processList = store.state.processes || [];
        const people = taskInvolvedPeople(task, getTeamDirectory(), processList, store.state.intimations || [], officeOabKeys({ terms: store.state.terms || [], users: getTeamDirectory() }));
        const team = teamForTask(task, getOfficeDirectory().teams, processList) || teamForPeople(getOfficeDirectory().teams, people);
        return renderOfficeInvolved({ people, team, escapeHtml: safeEscape, iconSvg }) || '<span class="office-involved office-involved-empty">Sem responsável</span>';
      };
      getPresenter().renderList({
        container: byId('taskList'),
        summary: byId('taskListSummary'),
        tasks: pageRecords,
        allTasks: (store.state.tasks || []).filter(task => task.active !== false),
        columns: getColumns(),
        activeTaskId: activeTimeSheetTaskId,
        elapsedLabel: this.formatElapsedTimer(),
        sourceLabel: taskSourceLabel,
        processes: store.state.processes || [],
        contacts: store.state.contacts || [],
        activeFilter: taskListFilter,
        triageLookup: task => taskTriageBadge(task?.id),
        riskLookup: task => taskRiskOf(task?.id),
        involvedLookup: involvedFor
      });
      this.renderTaskPagination(pagination);
      this.renderBulkAssign();
      return pageRecords;
    },

    renderBulkAssign() {
      const box = byId('taskBulkAssign');
      if (!box) return;
      const members = getTeamDirectory().filter(member => member?.status !== 'inactive' && member?.displayName);
      const unowned = this.getTaskListRecords().filter(task => !String(task.responsible || '').trim() && !task.assigneeUserId).length;
      box.hidden = !unowned || members.length < 2;
      if (box.hidden) return;
      byId('taskBulkAssignLabel').textContent = `${unowned} ${unowned === 1 ? 'tarefa sem responsável' : 'tarefas sem responsável'}`;
      const select = byId('taskBulkAssignSelect');
      const current = select.value;
      select.innerHTML = members.map(member => `<option value="${escapeHtml(member.displayName)}">${escapeHtml(member.displayName)}</option>`).join('');
      if (current) select.value = current;
    },

    get taskListPage() { return taskListPage; },
    get taskListPageSize() { return taskListPageSize; },
    get taskListPagination() {
      return {
        page: taskListPage,
        pageSize: taskListPageSize,
        total: lastListTotal,
        totalPages: taskListTotalPages(lastListTotal, taskListPageSize)
      };
    },

    setTaskListPageSize(value) {
      const size = Number(value);
      if (!TASK_LIST_PAGE_SIZES.includes(size) || size === taskListPageSize) return taskListPageSize;
      taskListPageSize = size;
      taskListPage = 1;
      this.renderTaskList();
      return taskListPageSize;
    },

    setTaskListPage(value) {
      const pages = taskListTotalPages(lastListTotal, taskListPageSize);
      let next = taskListPage;
      if (value === 'first') next = 1;
      else if (value === 'prev') next = taskListPage - 1;
      else if (value === 'next') next = taskListPage + 1;
      else if (value === 'last') next = pages;
      else if (Number.isFinite(Number(value))) next = Math.trunc(Number(value));
      taskListPage = Math.max(1, Math.min(pages, next || 1));
      this.renderTaskList();
      return taskListPage;
    },

    renderTaskPagination(pagination) {
      const list = byId('taskList');
      if (!list) return false;
      let container = byId('taskListPagination');
      if (!container) {
        container = documentRef.createElement?.('div');
        if (!container) return false;
        container.id = 'taskListPagination';
        container.className = 'task-pagination-slot';
        list.parentElement?.appendChild(container);
      }
      container.innerHTML = getPresenter().renderTaskPagination({ pagination, escapeHtml: safeEscape });
      return true;
    },

    async handleTaskPaginationClick(event) {
      const sizeTarget = event.target.closest?.('[data-task-page-size]');
      if (sizeTarget) {
        const size = Number(sizeTarget.dataset.taskPageSize);
        if (!TASK_LIST_PAGE_SIZES.includes(size) || size === taskListPageSize) return true;
        taskListPageSize = size;
        taskListPage = 1;
        this.renderTaskList();
        queueMicrotask(() => {
          documentRef.querySelector?.(`#taskListPanel [data-task-page-size="${size}"]`)?.focus({ preventScroll: true });
        });
        return true;
      }
      const pageTarget = event.target.closest?.('[data-task-page]');
      if (!pageTarget) return false;
      const pages = taskListTotalPages(lastListTotal, taskListPageSize);
      const action = pageTarget.dataset.taskPage;
      let next = taskListPage;
      if (action === 'first') next = 1;
      else if (action === 'prev') next = taskListPage - 1;
      else if (action === 'next') next = taskListPage + 1;
      else if (action === 'last') next = pages;
      else if (Number.isFinite(Number(action))) next = Math.trunc(Number(action));
      next = Math.max(1, Math.min(pages, next || 1));
      if (next === taskListPage) return true;
      const direction = Math.sign(next - taskListPage);
      taskListPage = next;
      await transitionPageContent(documentRef, { v2: '#taskList' }, direction,
        () => this.renderTaskList());
      focusPageControl(documentRef, '#taskListPanel', 'data-task-page', action, direction > 0 ? 'prev' : 'next');
      return true;
    },

    renderKanban() {
      if (!teamDirectoryAt) {
        void refreshTeamDirectory().then(directory => { if (directory.length) this.refreshMemberAvatars(); });
      }
      if (!officeDirectoryLoaded()) {
        void refreshOfficeDirectory().then(() => this.renderKanban());
      }
      const involvedFor = task => {
        const processList = store.state.processes || [];
        const people = taskInvolvedPeople(task, getTeamDirectory(), processList, store.state.intimations || [], officeOabKeys({ terms: store.state.terms || [], users: getTeamDirectory() }));
        const team = teamForTask(task, getOfficeDirectory().teams, processList) || teamForPeople(getOfficeDirectory().teams, people);
        return renderOfficeInvolved({ people, team, escapeHtml: safeEscape, iconSvg }) || '<span class="office-involved office-involved-empty">Sem responsável</span>';
      };
      void loadTaskDuplicateGroups();
      void loadTaskAiDuplicates();
      void loadTaskRisks();
      void loadTaskInsights();
      renderTaskAiPanelSafely();
      const board = byId('kanbanBoard');
      if (!board) return;
      if (isV2()) {
        getPresenter().render({
          board,
          tasks: store.state.tasks.filter(task => task.active !== false && taskRiskMatches(task) && taskVisibleToMe(task)),
          columns: getColumns(),
          activeTaskId: activeTimeSheetTaskId,
          elapsedLabel: this.formatElapsedTimer(),
          sourceLabel: taskSourceLabel,
          processes: store.state.processes || [],
          contacts: store.state.contacts || [],
          triageLookup: task => taskTriageBadge(task?.id),
          riskLookup: task => taskRiskOf(task?.id),
          involvedLookup: involvedFor
        });
        this.renderTaskList();
        this.applyTaskViewMode();
      } else {
        board.classList.remove('hidden');
        byId('taskListPanel')?.classList.add('hidden');
        board.innerHTML = getColumns().map(column => {
          const tasks = store.state.tasks.filter(task => task.active !== false && task.status === column.id && taskVisibleToMe(task));
          const shown = tasks.slice(0, KANBAN_COLUMN_LIMIT);
          const hidden = tasks.length - shown.length;
          return `<section class="kanban-column" data-column="${safeEscape(column.id)}"><header class="column-header"><div class="column-title"><i class="column-dot" style="background:${safeColumnColor(column.color)}"></i>${escapeHtml(column.title)}<span class="column-count">${tasks.length}</span></div><span>···</span></header><div class="column-cards">${shown.length ? shown.map(task => this.renderCard(task)).join('') : '<div class="empty-column">Arraste tarefas para cá</div>'}${hidden > 0 ? `<div class="kanban-column-more" role="note">Mostrando ${shown.length} de ${tasks.length} — refine na lista</div>` : ''}</div></section>`;
        }).join('');
      }
      board.querySelectorAll('.task-card').forEach(card => {
        card.addEventListener('dragstart', () => { card.classList.add('dragging'); card.dataset.dragging = 'true'; });
        card.addEventListener('dragend', () => { card.classList.remove('dragging'); delete card.dataset.dragging; });
        card.addEventListener('click', event => {
          if (event.target.closest('.timesheet-btn, [data-task-move], [data-task-complete], .task-card-checkbox-label')) return;
          const task = store.state.tasks.find(item => item.id === card.dataset.taskId);
          if (task) this.openTaskModal(task);
        });
      });
      board.querySelectorAll('[data-task-complete]').forEach(checkbox => {
        checkbox.addEventListener('click', event => event.stopPropagation());
        checkbox.addEventListener('change', async event => {
          event.stopPropagation();
          const taskId = checkbox.dataset.taskComplete;
          const task = store.state.tasks.find(item => String(item.id) === String(taskId));
          if (!task) return;
          await this.toggleTaskDone(task, checkbox);
        });
      });
      board.querySelectorAll('[data-task-open]').forEach(button => {
        button.addEventListener('click', event => {
          event.stopPropagation();
          const task = store.state.tasks.find(item => item.id === button.dataset.taskOpen);
          if (task) this.openTaskModal(task);
        });
      });
      board.querySelectorAll('[data-task-move]').forEach(select => {
        select.addEventListener('click', event => event.stopPropagation());
        select.addEventListener('change', async event => {
          event.stopPropagation();
          const task = store.state.tasks.find(item => item.id === select.dataset.taskMove);
          const previous = task?.status;
          if (!task || previous === select.value) return;
          select.disabled = true;
          const moved = await this.moveTask(task.id, select.value);
          if (!moved && select.isConnected) {
            select.disabled = false;
            select.value = previous;
          }
        });
      });
      board.querySelectorAll('[data-timesheet-start]').forEach(button => {
        button.addEventListener('click', event => {
          event.stopPropagation();
          this.startTimeSheet(button.dataset.timesheetStart);
        });
      });
      board.querySelectorAll('[data-timesheet-stop]').forEach(button => {
        button.addEventListener('click', event => {
          event.stopPropagation();
          this.stopTimeSheet();
        });
      });
      board.querySelectorAll('.kanban-column').forEach(column => {
        column.addEventListener('dragover', event => { event.preventDefault(); column.classList.add('drag-over'); });
        column.addEventListener('dragleave', () => column.classList.remove('drag-over'));
        column.addEventListener('drop', event => {
          event.preventDefault();
          column.classList.remove('drag-over');
          const dragged = board.querySelector('.task-card[data-dragging="true"]');
          if (dragged) void this.moveTask(dragged.dataset.taskId, column.dataset.column);
        });
      });
    },

    renderCard(task) {
      const overdue = daysUntil(task.deadline) < 0 && task.status !== 'concluida';
      const timeMins = totalTimeMinutes(task.timeLogs);
      const timeBadge = timeMins > 0 ? `<span class="task-timelog" title="Tempo total registrado no TimeSheet">${iconSvg('deadline')} ${formatMinutes(timeMins)}</span>` : '';
      const isTimerRunning = activeTimeSheetTaskId === task.id;
      const timerButton = isTimerRunning
        ? `<button type="button" class="timesheet-btn active timesheet-live" data-timesheet-stop="${escapeHtml(task.id)}" title="Clique para pausar e salvar apontamento no TimeSheet">${iconSvg('check')} ${this.formatElapsedTimer()}</button>`
        : `<button type="button" class="timesheet-btn" data-timesheet-start="${escapeHtml(task.id)}" title="Iniciar cronômetro de TimeSheet">${iconSvg('deadline')} Iniciar</button>`;

      const points = Number(task.points) || (task.priority === 'urgente' ? 25 : 10);
      return `<article class="task-card ${isTimerRunning ? 'timer-active' : ''}" draggable="true" data-task-id="${escapeHtml(task.id)}">
        <div class="task-top">
          <span class="task-source">${escapeHtml(taskSourceLabel(task.source))}</span>
          <span class="task-badges">
            <b class="task-points" title="Pontuação da tarefa">${iconSvg('tasks')} ${points} pts</b>
            ${timeBadge}
            ${task.priority === 'urgente' ? '<span class="task-priority" title="Urgente">!</span>' : ''}
          </span>
        </div>
        <h4>${escapeHtml(task.title)}</h4>
        <p>${escapeHtml(task.description || 'Sem descrição')}</p>
        <div class="task-tags">
          ${task.client ? `<span>${escapeHtml(task.client)}</span>` : ''}
          ${task.process ? `<span>${escapeHtml(task.process)}</span>` : ''}
        </div>
        ${task.fatalDeadline ? `<div class="fatal-date">Prazo fatal: ${formatDate(task.fatalDeadline)}</div>` : ''}
        <footer class="task-footer">
          <div class="task-footer-left">
            <span class="task-date ${overdue ? 'overdue' : ''}">${overdue ? 'Atrasada · ' : ''}${formatDate(task.deadline)}</span>
            ${timerButton}
          </div>
          <span class="task-avatar">${escapeHtml(initials(task.responsible || 'Advogado(a)'))}</span>
        </footer>
      </article>`;
    },

    startTimeSheet(taskId) {
      if (activeTimeSheetTaskId === taskId) return;
      this.stopTimeSheet();
      activeTimeSheetTaskId = taskId;
      timeSheetStartedAt = now();
      windowRef.clearInterval(timeSheetInterval);
      timeSheetInterval = windowRef.setInterval(() => {
        const elapsed = this.formatElapsedTimer();
        documentRef.querySelectorAll(`.timesheet-live[data-timesheet-stop="${activeTimeSheetTaskId}"], .task-list-timesheet-live[data-task-list-timesheet-stop="${activeTimeSheetTaskId}"]`)
          .forEach(liveButton => { liveButton.innerHTML = `${iconSvg('check')} ${elapsed}`; });
      }, 1000);
      this.renderKanban();
      showToast?.('Cronômetro TimeSheet iniciado na tarefa!', 'success');
    },

    stopTimeSheet() {
      if (!activeTimeSheetTaskId) return;
      const elapsedMs = now() - timeSheetStartedAt;
      const minutes = Math.max(1, Math.round(elapsedMs / 60000));
      const task = store.state.tasks.find(item => item.id === activeTimeSheetTaskId);
      if (task) {
        if (!Array.isArray(task.timeLogs)) task.timeLogs = [];
        task.timeLogs.push({
          id: uid('tlog'),
          minutes,
          date: isoDate(),
          author: getCurrentUserName?.() || 'Advogado',
          description: 'Apontamento via Cronômetro TimeSheet'
        });
        task.timeSpentMinutes = (task.timeSpentMinutes || 0) + minutes;
        store.audit('TimeSheet registrado', `${task.title}: +${minutes} min`);
        store.save();
      }
      windowRef.clearInterval(timeSheetInterval);
      activeTimeSheetTaskId = null;
      timeSheetStartedAt = null;
      timeSheetInterval = null;
      this.renderKanban();
      showToast?.(`TimeSheet: ${minutes} min adicionados à tarefa.`, 'success');
    },

    formatElapsedTimer() {
      if (!timeSheetStartedAt) return '00:00:00';
      const seconds = Math.floor((now() - timeSheetStartedAt) / 1000);
      const hours = String(Math.floor(seconds / 3600)).padStart(2, '0');
      const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
      const remainingSeconds = String(seconds % 60).padStart(2, '0');
      return `${hours}:${minutes}:${remainingSeconds}`;
    },

    async moveTask(taskId, status) {
      const task = store.state.tasks.find(item => item.id === taskId);
      if (!task || task.status === status) return null;
      const previous = task.status;
      const previousCompletedAt = task.completedAt;
      const previousCompletedBy = task.completedBy;
      task.status = status;
      if (status === 'concluida') {
        task.completedAt = new Date().toISOString();
        task.completedBy = getCurrentUserName?.() || 'Advogado(a)';
      } else {
        delete task.completedAt;
        delete task.completedBy;
      }
      task.updatedAt = new Date().toISOString();
      const undoTreatment = status === 'concluida' ? onTaskCompleted?.(task, previous) : null;
      const audit = store.audit('Tarefa movimentada', `${task.title}: ${previous} → ${status}`);
      if (!await store.flush()) {
        undoTreatment?.();
        task.status = previous;
        if (previousCompletedAt) task.completedAt = previousCompletedAt; else delete task.completedAt;
        if (previousCompletedBy) task.completedBy = previousCompletedBy; else delete task.completedBy;
        store.state.audit = store.state.audit.filter(entry => entry.id !== audit?.id);
        onRenderAll?.();
        showToast?.('Não foi possível salvar a movimentação. Tente novamente.', 'error');
        if (isV2()) getPresenter().announce('A movimentação não foi salva. A tarefa voltou para a etapa anterior.');
        return null;
      }
      onRenderAll?.();
      if (status === 'concluida') void refreshCompletionNotifications();
      showToast?.('Tarefa movimentada com sucesso.', 'success');
      if (isV2()) getPresenter().announce(`${task.title} movida para ${getColumns().find(column => column.id === status)?.title || status}.`);
      return task;
    },

    /**
     * A caixa da linha conclui de verdade: tarefa ligada a publicação ou com prazo pede
     * confirmação, porque concluir encerra a triagem da publicação; as demais podem ser desfeitas.
     */
    async toggleTaskDone(task, checkbox) {
      const isDone = task.status === 'concluida';
      const previousStatus = task.status;
      const restore = () => {
        checkbox.disabled = false;
        checkbox.checked = isDone;
      };
      checkbox.disabled = true;
      const linkedPublication = Boolean(task.intimationId || task.publicationId || task.sourceIntimationId);
      const deadline = task.fatalDeadline || task.deadline;
      if (!isDone && (linkedPublication || deadline)) {
        completeConfirmRunner ||= createRiskConfirm({ documentRef, escapeHtml, storageKey: 'atrium:tasks:complete-skip' });
        const details = [
          linkedPublication ? 'A publicação vinculada será marcada como tratada.' : '',
          deadline ? `O prazo de ${formatDate(deadline)} sai da lista de tarefas abertas.` : ''
        ].filter(Boolean);
        const confirmed = await completeConfirmRunner.open({
          copy: {
            title: 'Concluir esta tarefa?',
            acknowledge: 'Sim, quero concluir',
            cancel: 'Não concluir',
            skip: 'Não perguntar novamente',
            confirmAll: 'Concluir tarefa'
          },
          note: 'A conclusão fica registrada na auditoria com o seu nome.',
          details
        });
        if (!confirmed) {
          restore();
          return false;
        }
      }
      const moved = await this.moveTask(task.id, isDone ? 'triagem' : 'concluida');
      if (!moved) {
        restore();
        return false;
      }
      const canUndo = !isDone && !linkedPublication;
      showToast?.(isDone ? 'Tarefa reaberta.' : 'Tarefa concluída.', 'success', canUndo ? {
        label: 'Desfazer',
        onClick: async () => {
          if (await this.moveTask(task.id, previousStatus)) {
            this.renderTaskList();
            this.renderKanban();
          }
        }
      } : null);
      this.renderTaskList();
      this.renderKanban();
      return true;
    },

    /** Exclusão recuperável: a tarefa sai das listas, mas fica no acervo e na auditoria. */
    async deleteTask(taskId) {
      const task = store.state.tasks.find(item => item.id === taskId);
      if (!task) return false;
      task.active = false;
      task.deletedAt = new Date().toISOString();
      task.deletedBy = getCurrentUserName?.() || 'Advogado(a)';
      const audit = store.audit('Tarefa excluída', task.title);
      if (await store.flush()) return true;
      task.active = true;
      delete task.deletedAt;
      delete task.deletedBy;
      store.state.audit = store.state.audit.filter(entry => entry.id !== audit?.id);
      showToast?.('Não foi possível excluir a tarefa. Tente novamente.', 'error');
      return false;
    },

    async restoreTask(taskId) {
      const task = store.state.tasks.find(item => item.id === taskId);
      if (!task) return false;
      task.active = true;
      delete task.deletedAt;
      delete task.deletedBy;
      store.audit('Tarefa restaurada', task.title);
      return store.flush();
    },

    /** Dá responsável, de uma vez, às tarefas sem dono que estão no filtro atual. */
    async assignUnownedTasks(displayName) {
      const name = String(displayName || '').trim();
      const unowned = this.getTaskListRecords().filter(task => !String(task.responsible || '').trim() && !task.assigneeUserId);
      if (!name || !unowned.length) return 0;
      unowned.forEach(task => { task.responsible = name; });
      store.audit('Tarefas atribuídas em lote', `${unowned.length} tarefa(s) para ${name}`);
      if (await store.flush()) return unowned.length;
      unowned.forEach(task => { task.responsible = ''; });
      showToast?.('Não foi possível atribuir as tarefas. Tente novamente.', 'error');
      return 0;
    },

    async completeTask(taskId) {
      const task = store.state.tasks.find(item => item.id === taskId);
      if (!task) return null;
      const previousStatus = task.status;
      const previousCompletedAt = task.completedAt;
      const previousCompletedBy = task.completedBy;
      task.status = 'concluida';
      task.completedAt = new Date().toISOString();
      task.completedBy = getCurrentUserName?.() || 'Advogado(a)';
      const undoTreatment = onTaskCompleted?.(task, previousStatus) ?? null;
      const audit = store.audit('Tarefa concluída', task.title);
      if (!await store.flush()) {
        undoTreatment?.();
        task.status = previousStatus;
        if (previousCompletedAt) task.completedAt = previousCompletedAt; else delete task.completedAt;
        if (previousCompletedBy) task.completedBy = previousCompletedBy; else delete task.completedBy;
        store.state.audit = store.state.audit.filter(entry => entry.id !== audit?.id);
        showToast?.('Não foi possível concluir a tarefa. Tente novamente.', 'error');
        return null;
      }
      void refreshCompletionNotifications();
      return task;
    },

    async reopenTask(taskId) {
      const task = store.state.tasks.find(item => item.id === taskId);
      if (!task) return null;
      const previousStatus = task.status;
      const previousCompletedAt = task.completedAt;
      const previousCompletedBy = task.completedBy;
      task.status = 'triagem';
      delete task.completedAt;
      delete task.completedBy;
      const audit = store.audit('Tarefa reaberta', task.title);
      if (!await store.flush()) {
        task.status = previousStatus;
        if (previousCompletedAt) task.completedAt = previousCompletedAt;
        if (previousCompletedBy) task.completedBy = previousCompletedBy;
        store.state.audit = store.state.audit.filter(entry => entry.id !== audit?.id);
        showToast?.('Não foi possível reabrir a tarefa. Tente novamente.', 'error');
        return null;
      }
      return task;
    },

    openTaskModal(defaults = {}) {
      void refreshTeamDirectory();
      const directory = getTeamDirectory();
      if (!defaults.assigneeUserId && defaults.responsible) {
        const matched = matchMemberByName(directory, defaults.responsible);
        if (matched) defaults = { ...defaults, assigneeUserId: memberIdOf(matched) };
      }
      defaults = {
        ...defaults,
        intimationId: canonicalIntimationId(defaults.intimationId) || defaults.intimationId,
        sourceIntimationId: canonicalIntimationId(defaults.intimationId) || canonicalIntimationId(defaults.sourceIntimationId) || null,
      };
      const definitions = store.state.configuration?.taskDefinitions || [];
      const processes = store.state.processes || [];
      const contacts = store.state.contacts || [];
      const totalTime = totalTimeMinutes(defaults.timeLogs);
      const timeNote = totalTime > 0 ? `Tempo total acumulado nesta tarefa: ${formatMinutes(totalTime)}.` : '';
      const cleanDescription = decodeHtmlEntities(defaults.description || defaults.text || '');
      const cleanTitle = decodeHtmlEntities(defaults.title || '');
      const hasPublicationContext = Boolean(defaults.intimationId || defaults.sourceIntimationId || /djen|datajud|publica/i.test(String(defaults.source || '')));

      const rawProcessNumber = String(defaults.process || defaults.processNumber || '').trim();
      const cleanProcessDigits = rawProcessNumber.replace(/\D/g, '');
      const linkedProcess = processes.find(p =>
        (defaults.processId && String(p.id) === String(defaults.processId)) ||
        (rawProcessNumber && String(p.number || p.protocol || '').trim() === rawProcessNumber) ||
        (cleanProcessDigits && String(p.number || '').replace(/\D/g, '') === cleanProcessDigits)
      );

      let completionBarHtml = '';
      if (defaults.id) {
        const isDone = isTerminalStatus(defaults.status);
        completionBarHtml = isV2() ? `
        <div class="task-completion-bar">
          <div><span>Situação da tarefa</span><strong class="task-completion-state ${isDone ? 'is-complete' : 'is-active'}">${isDone ? 'Concluída' : 'Em andamento'}</strong></div>
          <div class="task-completion-actions">
            ${linkedProcess ? `<button type="button" class="button ghost task-process-quick-link" id="btnOpenTaskProcess" title="Acessar processo judicial">${iconSvg('processes')} Acessar processo</button>` : ''}
            ${!isDone ? `<button type="button" class="button gold" id="btnDirectCompleteTask">${iconSvg('check')}Marcar como concluída</button>` : `<button type="button" class="button ghost" id="btnDirectReopenTask">${iconSvg('reopen')}Reabrir tarefa</button>`}
            ${defaults.id ? `<button type="button" class="button ghost is-danger" id="btnDeleteTask">${iconSvg('delete')}Excluir tarefa</button>` : ''}
          </div>
        </div>` : `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding:10px 14px; background:var(--panel-soft); border-radius:10px; border:1px solid var(--line);">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:12px; color:var(--muted); font-weight:600;">Situação da Tarefa:</span>
            <span class="status-chip ${isDone ? 'connected' : 'warning'}">${isDone ? 'Concluída' : 'Em andamento'}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            ${linkedProcess ? `<button type="button" class="button ghost" id="btnOpenTaskProcess" style="padding:6px 12px; font-size:12px;">${iconSvg('processes')} Acessar processo</button>` : ''}
            ${!isDone ? `<button type="button" class="button gold" id="btnDirectCompleteTask" style="padding:6px 14px; font-size:12px; font-weight:600;">${iconSvg('check')}Marcar como Concluída</button>` : `<button type="button" class="button ghost" id="btnDirectReopenTask" style="padding:6px 14px; font-size:12px;">${iconSvg('reopen')}Reabrir Tarefa</button>`}
          </div>
        </div>`;
      }

      let linkedProcessBannerHtml = '';
      if (linkedProcess && isV2()) {
        const processDetails = [linkedProcess.client, linkedProcess.actionType || linkedProcess.subject, linkedProcess.court || linkedProcess.county].filter(Boolean).join(' · ');
        linkedProcessBannerHtml = `
        <div class="task-linked-process-banner">
          <div class="task-linked-process-info">
            <span class="task-linked-process-eyebrow">${iconSvg('processes')} Processo vinculado</span>
            <strong>${escapeHtml(linkedProcess.number || linkedProcess.protocol || 'Processo')}</strong>
            <small>${escapeHtml(processDetails || 'Processo cadastrado no acervo')}</small>
          </div>
          <button type="button" class="button ghost task-btn-open-process" id="btnOpenTaskProcessBanner">${iconSvg('processes')} Acessar processo</button>
        </div>`;
      }

      // Texto original da publicação vinculada (igual à aba Publicações).
      // Tarefa automática mostra a íntegra preservada, não o resumo do sistema;
      // tarefa manual sem vínculo mantém o comportamento anterior.
      const linkedIntimation = findIntimationRecord(store.state.intimations, defaults.intimationId)
        || findIntimationRecord(store.state.intimations, defaults.sourceIntimationId)
        || null;
      const originalPublicationText = linkedIntimation
        ? String(linkedIntimation.text || linkedIntimation.sourceText || linkedIntimation.description || '').trim()
        : '';
      const intimationDisplayText = originalPublicationText || cleanDescription;
      const intimationMeta = linkedIntimation && originalPublicationText
        ? [linkedIntimation.title, linkedIntimation.court, linkedIntimation.publishedAt ? formatDate(linkedIntimation.publishedAt) : '', linkedIntimation.source].filter(Boolean).map(part => safeEscape(String(part))).join(' · ')
        : '';

      let topHtml = `${completionBarHtml}${linkedProcessBannerHtml}`;
      if (intimationDisplayText && (!isV2() || hasPublicationContext || originalPublicationText)) {
        topHtml += `
          <div class="task-intimation-card ${isV2() ? 'is-v2' : ''}">
          <div class="task-intimation-header">
            <div class="task-intimation-title">
              ${iconSvg('publications')}
              <span>Publicação / Texto da Intimação</span>
            </div>
            <div class="task-intimation-actions">
              <button type="button" class="task-btn-action" id="btnCopyTaskIntimation">Copiar texto</button>
              <button type="button" class="task-btn-action" id="btnAiAnalyzeTask">${iconSvg('assistant')}Analisar com IA</button>
            </div>
          </div>
          ${intimationMeta ? `<p class="task-intimation-meta">${intimationMeta}</p>` : ''}
          <div class="task-intimation-body" id="taskIntimationBody">${escapeHtml(intimationDisplayText)}</div>
        </div>`;
      }

      openModal?.('task', defaults.id ? 'Editar tarefa' : 'Nova tarefa', 'Fluxo interno', [
        { name: 'title', label: 'Título da tarefa', required: true, full: true, placeholder: 'Ex: Manifestação sobre despacho do DJEN' },
        {
          name: 'taskDefinition',
          label: 'Modelo de tarefa',
          type: 'model-combobox',
          placeholder: 'Pesquisar modelo por nome ou área',
          options: buildTaskModelOptions(definitions),
          emptyLabel: 'Nenhum modelo localizado para esta busca.',
          createAction: { id: 'create-task-model', label: 'Criar tarefa' },
          inlineCreate: true,
          note: 'Busque por nome ou área. Se o modelo não existir, use "Criar tarefa" para adicioná-lo ao catálogo.'
        },
        {
          name: 'process',
          label: 'Número do processo',
          type: 'combobox',
          identityName: 'processId',
          placeholder: 'Pesquisar número, cliente, ação ou tribunal',
          suggestions: processes.map(process => ({
            id: process.id,
            value: process.number || process.protocol || process.client || 'Processo sem número',
            label: [process.client, process.actionType || process.subject, process.court || process.county].filter(Boolean).join(' · ') || 'Processo cadastrado'
          }))
        },
        {
          name: 'client',
          label: 'Cliente',
          type: 'combobox',
          identityName: 'contactId',
          placeholder: 'Pesquisar nome, documento, telefone, e-mail ou cidade',
          suggestions: contacts.map(contact => ({
            id: contact.id,
            value: contact.name || 'Contato sem nome',
            label: [contact.contactRole === 'cliente' ? 'Cliente' : (contact.contactRole || 'Contato'), contact.document, contact.mobile || contact.phone, contact.email, contact.city].filter(Boolean).join(' · ')
          }))
        },
        { name: 'fatalDeadline', label: 'Prazo fatal', type: 'date', note: 'Último dia para praticar o ato. Só você define esta data.' },
        { name: 'deadline', label: 'Prazo da tarefa', type: 'date', note: 'Quando a tarefa precisa estar pronta.' },
        { name: 'date', label: 'Data da atividade', type: 'date', note: 'Quando vai ser feita. Aparece na agenda.' },
        { name: 'time', label: 'Horário', type: 'time' },
        {
          name: 'responsible',
          label: 'Responsável principal',
          type: 'combobox',
          identityName: 'assigneeUserId',
          value: defaults.responsible || getCurrentUserName?.() || 'Advogado(a)',
          placeholder: 'Escolha um integrante ou digite um nome avulso',
          suggestions: teamMemberOptions(),
          note: 'Escolha um integrante para vincular a delegação. Texto avulso segue válido sem vínculo.'
        },
        { name: 'responsibles', label: 'Seguidores (nomes por vírgula)', placeholder: 'Separe os nomes por vírgula', note: 'Nomes de integrantes viram seguidores vinculados.' },
        { name: 'status', label: 'Coluna (Quadro Kanban)', type: 'select', options: getColumns().map(column => ({ value: column.id, label: column.title })) },
        { name: 'priority', label: 'Prioridade', type: 'select', options: [{value:'normal',label:'Normal'},{value:'importante',label:'Importante'},{value:'urgente',label:'Urgente'}] },
        { name: 'points', label: 'Pontuação', type: 'number', value: defaults.points || 0 },
        { name: 'addMinutes', label: 'Apontar tempo (minutos)', type: 'number', placeholder: 'Ex: 45', note: timeNote },
        { name: 'timeDescription', label: 'Atividade no apontamento', placeholder: 'Ex: Elaboração de minuta recursal' },
        { name: 'description', label: 'Comentário interno / orientações', type: 'textarea', full: true, note: 'Nunca registre senha, QR code ou segredo do certificado neste campo.' },
        { name: 'actionType', label: 'Tipo de ação' },
        { name: 'protocol', label: 'Protocolo / Local' }
      ], {
        status: 'triagem',
        priority: 'normal',
        source: 'Interna',
        ...defaults,
        title: cleanTitle,
        description: cleanDescription,
        taskDefinition: defaults.taskDefinition || (definitions.some(item => item.name === cleanTitle) ? cleanTitle : ''),
        responsibles: Array.isArray(defaults.responsibles) ? defaults.responsibles.join(', ') : (defaults.responsibles || '')
      }, topHtml);

      const processField = byId('field-process')?.closest('[data-modal-combobox-field]');
      processField?.addEventListener('atrium:combobox-select', event => {
        const process = processes.find(item => String(item.id) === String(event.detail?.identity));
        if (!process) return;
        const linkedContact = contacts.find(contact => String(contact.id) === String(process.contactId))
          || contacts.find(contact => String(contact.name || '').trim().toLocaleLowerCase('pt-BR') === String(process.client || '').trim().toLocaleLowerCase('pt-BR'));
        const clientInput = byId('field-client');
        const clientIdentity = clientInput?.closest('[data-modal-combobox-field]')?.querySelector('[data-combobox-identity]');
        const actionTypeInput = byId('field-actionType');
        if (clientInput) clientInput.value = linkedContact?.name || process.client || '';
        if (clientIdentity) clientIdentity.value = linkedContact?.id || process.contactId || '';
        if (actionTypeInput) actionTypeInput.value = process.actionType || process.subject || '';
      });

      byId('btnDirectCompleteTask')?.addEventListener('click', async () => {
        const task = await this.completeTask(defaults.id);
        if (!task) return;
        closeModal?.();
        onRenderAll?.();
        showToast?.('Tarefa concluída e removida do painel ativo!', 'success');
      });

      byId('btnDeleteTask')?.addEventListener('click', async () => {
        const task = store.state.tasks.find(item => item.id === defaults.id);
        if (!task) return;
        const confirmed = await deleteConfirmRunner().open({
          copy: { title: 'Excluir esta tarefa?', acknowledge: 'Sim, quero excluir', cancel: 'Não excluir', skip: 'Não perguntar novamente', confirmAll: 'Excluir tarefa' },
          note: 'A exclusão fica registrada na auditoria e pode ser desfeita logo em seguida.',
          details: [task.deadline || task.fatalDeadline ? 'O prazo desta tarefa sai das listas e da agenda.' : ''].filter(Boolean)
        });
        if (!confirmed) return;
        if (!await this.deleteTask(task.id)) return;
        closeModal?.();
        onRenderAll?.();
        showToast?.('Tarefa excluída.', 'success', {
          label: 'Desfazer',
          onClick: async () => {
            if (await this.restoreTask(task.id)) onRenderAll?.();
          }
        });
      });

      byId('btnDirectReopenTask')?.addEventListener('click', async () => {
        const task = await this.reopenTask(defaults.id);
        if (!task) return;
        closeModal?.();
        onRenderAll?.();
        showToast?.('Tarefa reaberta no fluxo!', 'success');
      });

      const modelField = byId('field-taskDefinition')?.closest('[data-model-combobox-field]');
      modelField?.addEventListener('atrium:combobox-select', event => {
        if (event.detail?.action === 'create-task-model') {
          this.renderTaskModelCreatePanel(modelField, event.detail.query || byId('field-taskDefinition')?.value || '');
          return;
        }
        if (event.detail?.name && event.detail.name !== 'taskDefinition') return;
        const definition = (store.state.configuration?.taskDefinitions || [])
          .find(item => String(item?.name || '') === String(event.detail?.value || ''));
        this.applyTaskDefinitionToForm(definition);
      });

      const descriptionField = byId('field-description');
      const resizeDescriptionField = () => {
        if (!descriptionField) return;
        descriptionField.style.height = 'auto';
        descriptionField.style.height = `${Math.max(148, descriptionField.scrollHeight + 2)}px`;
      };
      resizeDescriptionField();
      descriptionField?.addEventListener('input', resizeDescriptionField);

      byId('btnCopyTaskIntimation')?.addEventListener('click', async () => {
        try {
          await navigatorRef.clipboard.writeText(byId('taskIntimationBody')?.innerText || intimationDisplayText);
          showToast?.('Texto da intimação copiado com sucesso!', 'success');
        } catch {
          showToast?.('Não foi possível copiar o texto.', 'error');
        }
      });

      byId('btnAiAnalyzeTask')?.addEventListener('click', () => {
        closeModal?.();
        onAnalyzeWithAi?.(byId('taskIntimationBody')?.innerText || intimationDisplayText);
      });

      const handleOpenLinkedProcess = () => {
        if (!linkedProcess) return;
        closeModal?.();
        onOpenProcess?.(linkedProcess);
      };
      byId('btnOpenTaskProcess')?.addEventListener('click', handleOpenLinkedProcess);
      byId('btnOpenTaskProcessBanner')?.addEventListener('click', handleOpenLinkedProcess);
    },

    applyTaskDefinitionToForm(definition) {
      if (!definition) return false;
      const modelInput = byId('field-taskDefinition');
      const titleInput = byId('field-title');
      const pointsInput = byId('field-points');
      if (modelInput) modelInput.value = String(definition.name || '');
      if (titleInput) titleInput.value = String(definition.name || '');
      if (pointsInput) pointsInput.value = Number(definition.points) || 0;
      return true;
    },

    renderTaskModelCreatePanel(field, query) {
      const container = field?.querySelector('[data-task-model-create]');
      if (!container) return false;
      const name = String(query || '').trim().slice(0, 120);
      const current = (store.state.configuration?.taskDefinitions || [])
        .find(item => String(item?.name || '') === name);
      const areas = taskAreaOptions();
      const defaultArea = resolveTaskArea(current);
      const areaOptions = areas
        .map(area => `<option value="${safeEscape(area)}" ${area === defaultArea ? 'selected' : ''}>${safeEscape(area)}</option>`)
        .join('');
      container.innerHTML = `
        <div class="task-model-create-head">
          <strong>Adicionar tarefa ao catálogo</strong>
          <span>${safeEscape(name)}</span>
        </div>
        <div class="form-grid">
          <div class="field full">
            <label for="newTaskModelName">Nome da tarefa</label>
            <input id="newTaskModelName" type="text" maxlength="120" value="${safeEscape(name)}" placeholder="Ex: Elaborar petição intermediária">
          </div>
          <div class="field">
            <label for="newTaskModelArea">Área</label>
            <select id="newTaskModelArea">${areaOptions}</select>
          </div>
          <div class="field">
            <label for="newTaskModelDifficulty">Dificuldade</label>
            <select id="newTaskModelDifficulty">
              <option value="baixa">Baixa</option>
              <option value="normal" selected>Normal</option>
              <option value="alta">Alta</option>
            </select>
          </div>
          <div class="field">
            <label for="newTaskModelMinutes">Tempo exigido (minutos)</label>
            <input id="newTaskModelMinutes" type="number" min="0" step="5" value="30">
          </div>
          <div class="field">
            <label for="newTaskModelPoints">Pontuação</label>
            <input id="newTaskModelPoints" type="number" min="0" step="5" value="10">
          </div>
          <div class="field full task-model-create-actions">
            <button type="button" class="button ghost" data-task-model-cancel>Cancelar</button>
            <button type="button" class="button gold" data-task-model-save>${iconSvg('check')}Adicionar tarefa</button>
          </div>
        </div>`;
      container.classList.remove('hidden');
      container.querySelector('[data-task-model-cancel]')?.addEventListener('click', () => {
        container.classList.add('hidden');
        byId('field-taskDefinition')?.focus();
      });
      container.querySelector('[data-task-model-save]')?.addEventListener('click', () => { void this.saveTaskModelDefinition(container, field); });
      const nameInput = container.querySelector('#newTaskModelName');
      nameInput?.focus();
      nameInput?.select?.();
      return true;
    },

    async saveTaskModelDefinition(container, field) {
      const name = String(container?.querySelector('#newTaskModelName')?.value || '').trim().slice(0, 120);
      if (!name) {
        showToast?.('Informe o nome da tarefa-modelo.', 'warning');
        return false;
      }
      if (!Array.isArray(store.state.configuration?.taskDefinitions)) store.state.configuration.taskDefinitions = [];
      const definitions = store.state.configuration.taskDefinitions;
      const normalizeName = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      if (definitions.some(item => normalizeName(item?.name) === normalizeName(name))) {
        showToast?.('Já existe um modelo de tarefa com este nome.', 'warning');
        return false;
      }
      const record = {
        name,
        area: String(container?.querySelector('#newTaskModelArea')?.value || '').trim().slice(0, 48) || 'Geral',
        difficulty: String(container?.querySelector('#newTaskModelDifficulty')?.value || 'normal'),
        estimatedMinutes: Number(container?.querySelector('#newTaskModelMinutes')?.value) || 0,
        points: Number(container?.querySelector('#newTaskModelPoints')?.value) || 0
      };
      definitions.push(record);
      const audit = store.audit('Configuração adicionada', `taskDefinitions · ${record.name}`);
      store.save();
      const persisted = typeof store.flush === 'function' ? await store.flush() : true;
      if (persisted === false) {
        const index = definitions.indexOf(record);
        if (index >= 0) definitions.splice(index, 1);
        if (Array.isArray(store.state.audit) && audit?.id) store.state.audit = store.state.audit.filter(entry => entry.id !== audit.id);
        showToast?.('Não foi possível salvar o modelo de tarefa. Tente novamente.', 'error');
        return false;
      }
      container?.classList.add('hidden');
      this.applyTaskDefinitionToForm(record);
      byId('field-taskDefinition')?.focus();
      showToast?.(`Modelo "${record.name}" criado e aplicado à tarefa.`, 'success');
      return true;
    },

    buildTask(data, defaults = {}) {
      const taskData = { ...data };
      const history = Array.isArray(defaults.history) ? [...defaults.history] : [];
      const currentActor = getCurrentUserName?.() || 'Advogado(a)';
      history.push({ at: new Date().toISOString(), action: defaults.id ? 'Tarefa atualizada' : 'Tarefa atribuída', actor: currentActor });
      const timeLogs = Array.isArray(defaults.timeLogs) ? [...defaults.timeLogs] : [];
      const addMinutes = Number(taskData.addMinutes);
      if (addMinutes > 0) {
        timeLogs.push({ id: uid('time'), date: isoDate(), minutes: addMinutes, description: taskData.timeDescription || 'Trabalho realizado', actor: currentActor });
        history.push({ at: new Date().toISOString(), action: `Apontamento de tempo: ${formatMinutes(addMinutes)}`, actor: currentActor });
      }
      delete taskData.addMinutes;
      delete taskData.timeDescription;
      const responsibleList = [taskData.responsible, ...String(taskData.responsibles || '').split(/[,;]/)].map(item => item.trim()).filter(Boolean);
      const delegation = resolveTaskAssignees(
        { ...defaults, ...taskData },
        getTeamDirectory()
      );
      const previousAssignee = String(defaults.assigneeUserId || '').trim() || null;
      if (defaults.id && delegation.assigneeUserId !== previousAssignee) {
        const previousLabel = String(defaults.responsible || 'sem responsável').slice(0, 80);
        const nextLabel = String(taskData.responsible || 'sem responsável').slice(0, 80);
        history.push({ at: new Date().toISOString(), action: `Responsável alterado de ${previousLabel} para ${nextLabel}`, actor: currentActor });
      }
      return {
        id: defaults.id || defaults._transactionTaskId || uid('task'),
        createdAt: defaults.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: defaults.source || 'Interna',
        intimationId: canonicalIntimationId(defaults.intimationId) || null,
        sourceIntimationId: canonicalIntimationId(defaults.intimationId) || canonicalIntimationId(defaults.sourceIntimationId) || null,
        ...taskData,
        deadlineSource: String(taskData.deadlineSource || defaults.deadlineSource || ''),
        sourceReportedDeadlineAt: String(taskData.sourceReportedDeadlineAt || defaults.sourceReportedDeadlineAt || ''),
        sourceReportedDeadlineSource: String(taskData.sourceReportedDeadlineSource || defaults.sourceReportedDeadlineSource || ''),
        points: Number(taskData.points) || 0,
        completedAt: taskData.status === 'concluida' ? (defaults.completedAt || new Date().toISOString()) : undefined,
        completedBy: taskData.status === 'concluida' ? (defaults.completedBy || currentActor) : undefined,
        responsibles: [...new Set(responsibleList)],
        assigneeUserId: delegation.assigneeUserId,
        followerUserIds: delegation.followerUserIds,
        history,
        timeLogs
      };
    },

    saveTask(data, defaults = {}) {
      const addMinutes = Number(data.addMinutes);
      const record = this.buildTask(data, defaults);
      store.upsert('tasks', record);
      store.audit(defaults.id ? 'Tarefa atualizada' : 'Tarefa atribuída', `${record.title}${record.process ? ` · ${record.process}` : ''}${record.points ? ` · ${record.points} pontos` : ''}${addMinutes > 0 ? ` · ${formatMinutes(addMinutes)} apontados` : ''}`);
      return record;
    },

    upsertExternalTask(record, externalKey = 'id') {
      const identity = record?.externalId || record?.[externalKey] || record?.id;
      const existing = store.state.tasks.find(item => (item.externalId || item[externalKey] || item.id) === identity);
      if (!existing) return store.upsert('tasks', record, externalKey);
      const protectedFields = new Set(['id', 'status', 'deadline', 'fatalDeadline', 'priority', 'responsible', 'responsibles', 'assigneeUserId', 'followerUserIds', 'completedAt', 'timeLogs', 'timeSpentMinutes', 'history', 'notes']);
      // Prazo declarado pela fonte acompanha a publicação; prazo digitado por pessoa
      // (ou já divergente da fonte) nunca é sobrescrito por atualização externa.
      const incomingDeadline = String(record?.deadline || '').trim();
      const incomingSourceDeadline = String(record?.sourceReportedDeadlineAt || '').trim();
      const localDeadline = String(existing.deadline || '').trim();
      const localSourceDeadline = String(existing.sourceReportedDeadlineAt || '').trim();
      const incomingDeadlineFromSource = Boolean(incomingDeadline) && incomingDeadline === incomingSourceDeadline;
      const localDeadlineIsHuman = Boolean(localDeadline) && localDeadline !== localSourceDeadline;
      const merged = { ...existing };
      for (const [field, value] of Object.entries(record || {})) {
        if (field === 'deadlineConflict') {
          if (value && typeof value === 'object') merged.deadlineConflict = value;
          else if (value === null) delete merged.deadlineConflict;
          continue;
        }
        if (protectedFields.has(field)) {
          if (field === 'deadline' && incomingDeadlineFromSource && !localDeadlineIsHuman) merged.deadline = value;
          continue;
        }
        if (value !== '' && value !== null && value !== undefined) merged[field] = value;
      }
      store.upsert('tasks', merged, 'id');
      return merged;
    },

    removeTasksWhere(predicate) {
      store.state.tasks = store.state.tasks.filter(task => !predicate(task));
    }
  };

  return feature;
}
