import { Store, isoDate, uid } from '../core/store.js?v=3.0.2';
import { createAttemptKey } from '../core/attempt-key.js?v=3.0.2';
import {
  activeIntimations,
  findIntimationRecord,
  isActiveIntimation,
  isMergedIntimation,
  resolveIntimationId
} from '../core/publication-scope.js?v=3.0.2';
import {
  createPublicationsV2Presenter,
  renderDuplicateReviewPanel,
  renderProvidenceDeadlineNote,
  renderPublicationDetail,
  renderPublicationEmpty,
  renderPublicationRow
} from '../views/ui-v2/publications-presenter.js?v=3.0.2';
import { iconSvg } from '../views/ui-v2/icons.js?v=3.0.2';
import { publicationReadableText } from '../core/html-text.js?v=3.0.2';
import { buildPublicationBrief, isHumanDeadlineSource, publicationTodayReason } from '../core/publication-brief.js?v=3.0.2';
import { sanitizeRichHtml } from '../core/html-safety.js?v=3.0.2';
import { installModalComboboxes } from '../components/modal.js?v=3.0.2';
import { createRiskConfirm } from '../components/risk-confirm.js?v=3.0.2';
import { publicationLawyersList } from '../core/publication-lawyers.js?v=3.0.2';
import { officeOabKeys, officeSideLawyers } from '../core/publication-parties.js?v=3.0.2';
import { renderOfficeInvolved, publicationInvolvedPeople, teamForPeople, teamForTask } from '../core/office-involved.js?v=3.0.2';
import { getOfficeDirectory, officeDirectoryLoaded, refreshOfficeDirectory } from '../core/office-directory.js?v=3.0.2';
import { matchMemberByName } from '../core/task-assignees.js?v=3.0.2';
import { recordInvolvesMember } from '../core/office-involvement.js?v=3.0.2';

// A nova tentativa do mesmo envio, depois de uma queda de rede, não manda outro e-mail.
const emailAttempt = createAttemptKey();

export { activeIntimations, findIntimationRecord, isActiveIntimation, isMergedIntimation, resolveIntimationId };

const pluralize = (count, singular, plural) => `${count} ${count === 1 ? singular : plural}`;

export const ACT_RULES = [
  { regex: /\b(embargos?\s+de\s+declara[cç][aã]o|embargos?\s+declarat[oó]rios?)\b/i, category: 'Embargos de Declaração', priority: 'importante', label: 'Embargos', css: 'embargos' },
  { regex: /\b(audi[eê]nc\w*|sess[aã]o\s+de\s+julgamento|designad\w*.{0,30}audi\w*)\b/i, category: 'Audiência', priority: 'urgente', label: 'Audiência', css: 'audiencia' },
  { regex: /\b(apelac\w*|agravo\s+de\s+instrumento|recurso\s+inominado|recurso\s+especial|recurso\s+extraordin[aá]rio|recurso\s+ordin[aá]rio|recurs\w*|\brecorrer\b|\brecorreu\b|\brecorre\b)\b/i, category: 'Recurso', priority: 'importante', label: 'Recurso', css: 'recurso' },
  { regex: /\b(contesta\w*|contest[eo]\w*|defes\w*|defend\w*|apresentar\s+defesa)\b/i, category: 'Contestação', priority: 'importante', label: 'Contestação', css: 'contestacao' },
  { regex: /\b(cumprimento\s+de\s+senten[cç]\w*|pague|pagamento.{0,30}volunt\w*|multa.{0,30}10%|execu\w*)\b/i, category: 'Cumprimento de Sentença', priority: 'urgente', label: 'Cumprimento', css: 'cumprimento' },
  { regex: /\b(manifest\w*|impugn\w*|r[eé]plic\w*|especifica\w*|contrarraz\w*)\b/i, category: 'Manifestação', priority: 'normal', label: 'Manifestação', css: 'manifestacao' },
  { regex: /\b(edital|recupera[cç][aã]o\s+judicial|fal[eê]ncia|concedo\s+o\s+prazo)\b/i, category: 'Edital / Geral', priority: 'normal', label: 'Edital', css: 'recurso' },
  { regex: /\b(senten[cç]\w*|ac[oó]rd[aã]o)\b/i, category: 'Sentença / Acórdão', priority: 'importante', label: 'Sentença', css: 'recurso' },
  { regex: /\b(decis\w*)\b/i, category: 'Decisão Interlocutória', priority: 'normal', label: 'Decisão', css: 'recurso' },
  { regex: /\b(inpi|revista\s+da\s+propriedade\s+industrial|rpi\b|marcas?|deferimento\s+do\s+pedido|indeferimento\s+do\s+pedido|concess[aã]o\s+de\s+registro|oposi\w*)\b/i, category: 'INPI / RPI', priority: 'normal', label: 'INPI / RPI', css: 'rotina' },
  { regex: /\b(despach\w*|ato\s+ordinat[oó]rio)\b/i, category: 'Despacho', priority: 'normal', label: 'Despacho', css: 'rotina' }
];

export function classifyIntimationAct(text = '', title = '', type = '') {
  const combined = `${title} ${type} ${text}`;
  for (const rule of ACT_RULES) {
    if (rule.regex.test(combined)) return rule;
  }
  return { category: 'Publicação', priority: 'normal', label: 'Publicação', css: 'rotina' };
}

export function parsePublicationLocalDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [year, month, day] = str.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  if (/^\d{2}\/\d{2}\/\d{4}/.test(str)) {
    const [day, month, year] = str.slice(0, 10).split('/').map(Number);
    return new Date(year, month - 1, day);
  }
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(str)) {
    const [day, month, shortYear] = str.split('/').map(Number);
    return new Date(2000 + shortYear, month - 1, day);
  }
  const date = new Date(str);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatPublicationIsoDate(value) {
  const d = parsePublicationLocalDate(value);
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatPublicationAge(dateValue, now = new Date()) {
  const date = parsePublicationLocalDate(dateValue);
  if (!date) return 'Data não informada';
  const publicationDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const currentDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((currentDay - publicationDay) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return `Em ${Math.abs(diffDays)} dia${Math.abs(diffDays) === 1 ? '' : 's'}`;
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Há 1 dia';
  return `Há ${diffDays} dias`;
}

function isDateToday(dateValue, now = new Date()) {
  const date = parsePublicationLocalDate(dateValue);
  if (!date) return false;
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

export function filterPublications(items, {
  filter = 'untreated',
  sort = 'date-desc',
  cutoff = 'all',
  mineOnly = false,
  me = null,
  processes = [],
  teams = [],
  aiSuggestions = new Map(),
  countOnly = false,
  now = new Date()
} = {}) {
  const todayStr = isoDate(0, now);
  const filtered = (Array.isArray(items) ? items : []).filter(item => {
    if (!isActiveIntimation(item)) return false;
    if (mineOnly && (!me || !recordInvolvesMember(item, processes, me, teams))) return false;
    const pubDate = formatPublicationIsoDate(item.publishedAt);
    if (cutoff === '2days' && pubDate && pubDate < isoDate(-1, now)) return false;
    if (cutoff === 'today' && pubDate && pubDate < todayStr) return false;
    if (cutoff === '7days' && pubDate) {
      if (pubDate < isoDate(-7, now)) return false;
    }
    if (cutoff === '30days' && pubDate) {
      if (pubDate < isoDate(-30, now)) return false;
    }

    const treatmentStatus = item.treatmentStatus || 'untreated';
    if (filter === 'today') {
      if (treatmentStatus !== 'untreated' && treatmentStatus !== 'in_review') return false;
      const suggestion = aiSuggestions instanceof Map
        ? aiSuggestions.get(String(item.id))
        : aiSuggestions?.[String(item.id)];
      return Boolean(publicationTodayReason(item, { classifier: suggestion || null, now }));
    }
    if (filter === 'untreated' || filter === 'pendentes') return treatmentStatus === 'untreated';
    if (filter === 'in_review') return treatmentStatus === 'in_review';
    if (filter === 'treated') return treatmentStatus === 'treated';
    if (filter === 'discarded') return treatmentStatus === 'discarded';
    if (filter === 'all') return true;
    if (filter === 'urgente') return Boolean(item.urgent || item.priority === 'urgente');
    if (filter === 'importante') return Boolean(item.important);
    if (filter === 'prazo-fatal') return Boolean(item.fatalDeadline);
    if (filter === 'triagem') return item.status === 'triagem' || treatmentStatus === 'in_review';
    if (filter === 'prazo') return item.status === 'prazo' || treatmentStatus === 'treated';
    return item.status === filter;
  });

  if (countOnly) return filtered;

  filtered.sort((a, b) => {
    if (sort === 'priority-urgent') {
      const urgentA = (a.urgent || a.priority === 'urgente') ? 1 : 0;
      const urgentB = (b.urgent || b.priority === 'urgente') ? 1 : 0;
      if (urgentA !== urgentB) return urgentB - urgentA;
      const importantA = a.important ? 1 : 0;
      const importantB = b.important ? 1 : 0;
      if (importantA !== importantB) return importantB - importantA;
      if ((a.treatmentStatus || 'untreated') === 'untreated' && (b.treatmentStatus || 'untreated') === 'untreated') {
        return new Date(a.publishedAt || 0) - new Date(b.publishedAt || 0);
      }
      return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
    }
    if (sort === 'priority-important') {
      const importantA = a.important ? 1 : 0;
      const importantB = b.important ? 1 : 0;
      if (importantA !== importantB) return importantB - importantA;
      const timeB = parsePublicationLocalDate(b.publishedAt)?.getTime() || (b.publishedAt ? new Date(b.publishedAt).getTime() : 0) || 0;
      const timeA = parsePublicationLocalDate(a.publishedAt)?.getTime() || (a.publishedAt ? new Date(a.publishedAt).getTime() : 0) || 0;
      if (timeB !== timeA) return timeB - timeA;
      return String(b.id || '').localeCompare(String(a.id || ''));
    }
    if (sort === 'date-asc') {
      const timeA = parsePublicationLocalDate(a.publishedAt)?.getTime() || (a.publishedAt ? new Date(a.publishedAt).getTime() : 0) || 0;
      const timeB = parsePublicationLocalDate(b.publishedAt)?.getTime() || (b.publishedAt ? new Date(b.publishedAt).getTime() : 0) || 0;
      if (timeA !== timeB) return timeA - timeB;
      const createdA = new Date(a.createdAt || 0).getTime() || 0;
      const createdB = new Date(b.createdAt || 0).getTime() || 0;
      if (createdA !== createdB) return createdA - createdB;
      return String(a.id || '').localeCompare(String(b.id || ''));
    }
    if (sort === 'date-desc') {
      const timeB = parsePublicationLocalDate(b.publishedAt)?.getTime() || (b.publishedAt ? new Date(b.publishedAt).getTime() : 0) || 0;
      const timeA = parsePublicationLocalDate(a.publishedAt)?.getTime() || (a.publishedAt ? new Date(a.publishedAt).getTime() : 0) || 0;
      if (timeB !== timeA) return timeB - timeA;
      const createdB = new Date(b.createdAt || 0).getTime() || 0;
      const createdA = new Date(a.createdAt || 0).getTime() || 0;
      if (createdB !== createdA) return createdB - createdA;
      return String(b.id || '').localeCompare(String(a.id || ''));
    }
    if (sort === 'process') return String(a.process || '').localeCompare(String(b.process || ''));
    const timeB = parsePublicationLocalDate(b.publishedAt)?.getTime() || (b.publishedAt ? new Date(b.publishedAt).getTime() : 0) || 0;
    const timeA = parsePublicationLocalDate(a.publishedAt)?.getTime() || (a.publishedAt ? new Date(a.publishedAt).getTime() : 0) || 0;
    if (timeB !== timeA) return timeB - timeA;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });

  return filtered;
}

const ADDITIVE_INTIMATION_FIELDS = ['client', 'clientName', 'contactId', 'text'];

function hasIntimationMergeValue(value) {
  return value !== undefined && value !== null && value !== '';
}

export function publicationTaskDeadline(item, { deadlineMode = 'auto' } = {}) {
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  const domicilioSource = String(item?.sourceReportedDeadlineSource || '').toLowerCase() === 'domicilio'
    || String(item?.deadlineSource || '').toLowerCase() === 'domicilio';
  const humanDeadline = isHumanDeadlineSource(item?.deadlineSource) && isoDate.test(String(item?.deadline || '').trim())
    ? item.deadline
    : '';
  const sourceDeadline = !domicilioSource && isoDate.test(String(item?.sourceReportedDeadlineAt || '').trim())
    ? item.sourceReportedDeadlineAt
    : '';
  if (deadlineMode === 'manual') return { deadline: '', deadlineSource: '' };
  const deadline = humanDeadline || sourceDeadline;
  return {
    deadline,
    deadlineSource: deadline
      ? (humanDeadline ? 'manual' : String(item?.sourceReportedDeadlineSource || item?.deadlineSource || ''))
      : ''
  };
}

export function createPublicationsFeature({
  store = Store,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  navigatorRef = globalThis.navigator,
  escapeHtml,
  formatDate,
  formatDateTime,
  showToast,
  openModal,
  onOpenTask,
  onOpenAgenda,
  onOpenProcess,
  onOpenContact,
  onOpenAssistant,
  onOpenIntimation,
  onImportJson,
  onRenderGlobalMetrics,
  onSyncAppState
}) {
  let initialized = false;
  let duplicateReview = { enabled: false, pairs: [], loaded: false };
  // Motivo da recusa por par (`pair.key`): só vive enquanto o par continua na conferência.
  // Recusa definitiva (par já fundido) sai da lista; conflito de teor permanece marcado.
  let duplicateReviewRefusals = new Map();
  let duplicateReviewRunning = false;
  let duplicateBulkRunning = false;
  let duplicateMergeCandidate = '';
  let riskConfirmRunner = null;
  // Do prazo à providência: sugestão vigente do painel (por publicação) e o desfazer da última
  // criação feita nesta sessão. Nada aqui grava sozinho — a confirmação é humana.
  let providenceSuggestion = null;
  let providenceUndo = null;
  let providenceRunning = false;
  let providenceRiskRunner = null;
  let detailActionsExpanded = false;
  let providencePlaybook = null;
  let providencePlaybookLoadedFor = '';
  // Contagem de prazo vigente (por publicação): informativa na tela e aplicada como prazo da
  // tarefa quando a pessoa confirma a providência — data humana, nunca inferida (a IA não
  // participa da decisão; o cálculo usa a data e os dias que a pessoa informou).
  let conferenceResult = null; // { intimationId, date, label, summary }
  // O modelo da providência precisa existir no catálogo de referência: o servidor recusa nome fora
  // dele (422). O estado do botão segue o campo em tempo real e a confirmação envia o nome
  // oficial da opção — nunca o texto solto digitado.
  const normalizeProvidenceModel = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const providenceModelChoice = shell => {
    const field = shell?.querySelector('[data-providence-definition]');
    if (!field) return { canonical: '', typed: '' };
    const typed = String(field.value || '').trim();
    const query = normalizeProvidenceModel(typed);
    const options = [...(field.closest('[data-model-combobox-field]')?.querySelectorAll('[data-combobox-option]') || [])];
    const match = options.find(option => normalizeProvidenceModel(option.getAttribute('data-value')) === query);
    return { canonical: match ? String(match.getAttribute('data-value') || '') : '', typed };
  };
  const syncProvidenceApplyState = shell => {
    if (!shell) return;
    const button = shell.querySelector('[data-detail-action="apply-providence"]');
    if (!button) return;
    const { canonical } = providenceModelChoice(shell);
    button.disabled = !canonical;
    if (canonical) button.removeAttribute('title');
    else button.title = 'Escolha o modelo do catálogo';
    const warning = shell.querySelector('[data-providence-model-warning]');
    if (warning) warning.hidden = Boolean(canonical);
  };
  let selectedIntimation = null;
  let inboxFilter = null;
  let inboxFilterExplicit = false;
  let inboxFilterMode = null;
  let inboxSort = 'date-desc';
  const INBOX_CUTOFF_VALUES = ['today', '2days', '7days', '30days', 'all'];
  const INBOX_CUTOFF_STORAGE_KEY = 'atrium:publications:cutoff';
  const readStoredInboxCutoff = () => {
    try {
      const stored = String(windowRef?.localStorage?.getItem(INBOX_CUTOFF_STORAGE_KEY) || '');
      return INBOX_CUTOFF_VALUES.includes(stored) ? stored : '';
    } catch { return ''; }
  };
  const persistInboxCutoff = value => {
    try { windowRef?.localStorage?.setItem(INBOX_CUTOFF_STORAGE_KEY, value); } catch { /* preferência opcional */ }
  };
  let inboxCutoff = readStoredInboxCutoff() || 'all';
  const INBOX_MINE_STORAGE_KEY = 'atrium:publications:mineOnly';
  const readStoredInboxMineOnly = () => {
    try {
      const stored = String(windowRef?.localStorage?.getItem(INBOX_MINE_STORAGE_KEY) || '');
      if (stored === '1') return true;
      if (stored === '0') return false;
    } catch { /* armazenamento indisponível: usa o padrão por papel */ }
    return windowRef?.KellerAuth?.currentUser?.role === 'collaborator';
  };
  const persistInboxMineOnly = value => {
    try { windowRef?.localStorage?.setItem(INBOX_MINE_STORAGE_KEY, value ? '1' : '0'); } catch { /* preferência opcional */ }
  };
  let inboxMineOnly = readStoredInboxMineOnly();
  const resolveInboxMe = () => {
    const currentUser = windowRef?.KellerAuth?.currentUser || {};
    const directory = getOfficeDirectory().users || [];
    return matchMemberByName(directory, currentUser.username)
      || matchMemberByName(directory, currentUser.displayName)
      || currentUser;
  };
  // Renderização incremental: listas longas (acervo DJEN) não montam milhares de
  // linhas de uma vez; o limite reinicia quando o recorte muda e cresce sob ação.
  const INBOX_PAGE_SIZE = 80;
  let inboxVisibleLimit = INBOX_PAGE_SIZE;
  let inboxListSignature = '';
  let currentEmailBulletin = null;
  let publicationsPresenter;
  // Escritas de tratamento saem em fila única: cada POST lê store.revision só
  // depois que a resposta anterior foi adotada. Conflito 409 genuíno continua
  // visível; o que some é o autoconflito de cliques em sequência.
  let treatmentRequestChain = Promise.resolve();
  const enqueueTreatmentRequest = work => {
    const run = treatmentRequestChain.then(work, work);
    treatmentRequestChain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
  let aiClassifierStatus = { enabled: false, available: false, reason: '', loaded: false };
  const aiClassifierCache = new Map();
  const aiClassifierInflight = new Set();
let aiClassifierTogglePending = false;
let aiClassifierSuggestions = new Map();
let aiClassifierBacklogRunning = false;
let aiClassifierCorrecting = '';
// Áreas nomeadas pelo escritório (cadastradas ao corrigir "Outra área"): viram botões no painel.
let aiClassifierCustomAreas = [];
let briefTaskUndo = null;
let briefTaskBlocked = null;
let briefTaskRunning = false;
const BRIEF_TASK_BLOCKED_KEY = 'atrium.publications.briefTaskBlocked';
const readBriefTaskBlocked = () => {
  try {
    const parsed = JSON.parse(windowRef?.sessionStorage?.getItem(BRIEF_TASK_BLOCKED_KEY) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};
const persistBriefTaskBlocked = value => {
  try {
    if (value) windowRef?.sessionStorage?.setItem(BRIEF_TASK_BLOCKED_KEY, JSON.stringify(value));
    else windowRef?.sessionStorage?.removeItem(BRIEF_TASK_BLOCKED_KEY);
  } catch {
    // Sessão sem storage: o bloqueio continua válido apenas nesta página.
  }
};
const setBriefTaskBlocked = value => {
  briefTaskBlocked = value;
  persistBriefTaskBlocked(value);
};
  const prefersReducedMotion = () => Boolean(windowRef?.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const delay = ms => new Promise(resolve => { setTimeout(resolve, ms); });
  const focusNextQuickAction = fromIndex => {
    const buttons = [...(byId('inboxList')?.querySelectorAll('.publication-row-quick:not([disabled])') || [])];
    const target = buttons[Math.min(Math.max(fromIndex, 0), buttons.length - 1)] || buttons[0]
      || documentRef?.querySelector?.('#inboxFilters button');
    if (target) target.focus({ preventScroll: true });
  };

  const byId = id => documentRef?.getElementById(id);
  const officeOabKeysFor = () => {
    const directory = getOfficeDirectory();
    const users = directory.users.length ? directory.users : (store.state.users || []);
    return officeOabKeys({ terms: store.state.terms || [], users });
  };
  const publicationLawyersFor = item => {
    const sideLawyers = officeSideLawyers(item, { oabKeys: officeOabKeysFor() });
    return sideLawyers && sideLawyers.length ? sideLawyers : publicationLawyersList(item);
  };
  const toast = (message, type = '', action = null) => showToast?.(message, type, action);
  const isV2 = () => documentRef?.documentElement?.dataset?.ui === 'v2';
  const canonicalIntimationId = id => (id ? resolveIntimationId(store.state.intimations, id) : '');
  const findIntimation = id => findIntimationRecord(store.state.intimations, id);
  const taskLinksToIntimation = (task, id) => [task?.intimationId, task?.sourceIntimationId]
    .some(value => value !== undefined && value !== null && value !== '' && canonicalIntimationId(value) === id);
  const ensurePresentationFilter = () => {
    const mode = isV2() ? 'v2' : 'classic';
    if (inboxFilter === null || (!inboxFilterExplicit && inboxFilterMode !== mode)) {
      inboxFilter = 'untreated';
    }
    inboxFilterMode = mode;
  };
  const getPresenter = () => {
    publicationsPresenter ||= createPublicationsV2Presenter({
      documentRef,
      onCloseDetail: () => feature.closeDetail()
    });
    return publicationsPresenter;
  };
  const getRiskConfirm = () => {
    // `escapeHtml` é o helper deste módulo; usar um identificador inexistente aqui (safeEscape)
    // derrubava o clique de "Confirmar tudo" com ReferenceError antes de qualquer fusão.
    riskConfirmRunner ||= createRiskConfirm({ documentRef, escapeHtml });
    return riskConfirmRunner;
  };
  // A criação de providência tem a própria preferência de "não perguntar novamente": não herda (nem
  // silencia) a escolha feita na fusão em lote de publicações.
  const getProvidenceRiskConfirm = () => {
    providenceRiskRunner ||= createRiskConfirm({
      documentRef,
      escapeHtml,
      storageKey: 'atrium:ai:publication-providence-skip'
    });
    return providenceRiskRunner;
  };

  const feature = {
    get selectedIntimation() { return selectedIntimation; },
    set selectedIntimation(value) { selectedIntimation = value; },
    get inboxFilter() { ensurePresentationFilter(); return inboxFilter; },
    set inboxFilter(value) { inboxFilter = value; inboxFilterExplicit = true; inboxFilterMode = isV2() ? 'v2' : 'classic'; },
    get inboxSort() { return inboxSort; },
    set inboxSort(value) { inboxSort = value; },
    get inboxCutoff() { return inboxCutoff; },
    set inboxCutoff(value) { inboxCutoff = value; },
    get currentEmailBulletin() { return currentEmailBulletin; },
    get initialized() { return initialized; },

    upsertExternalIntimation(record) {
      if (!record || typeof record !== 'object') return null;
      store.state.intimations = Array.isArray(store.state.intimations) ? store.state.intimations : [];
      const identity = record.externalId ?? record.id;
      const index = store.state.intimations.findIndex(item => (item.externalId ?? item.id) === identity);
      if (index < 0) {
        store.state.intimations.unshift({ ...record });
        return store.state.intimations[0];
      }
      const current = store.state.intimations[index];
      const merged = { ...current, ...record };
      const protectedFields = [
        'status', 'unread', 'treatmentStatus', 'treatmentStartedAt', 'treatmentStartedBy',
        'treatedAt', 'treatedBy', 'discardedAt', 'discardedBy', 'treatmentNote',
        'linkedTaskIds', 'taskId', 'deadline', 'fatalDeadline', 'responsible', 'completedAt'
      ];
      for (const field of protectedFields) {
        if (Object.prototype.hasOwnProperty.call(current, field)) merged[field] = current[field];
      }
      for (const field of ADDITIVE_INTIMATION_FIELDS) {
        if (!hasIntimationMergeValue(record?.[field]) && hasIntimationMergeValue(current?.[field])) {
          merged[field] = current[field];
        }
      }
      store.state.intimations[index] = merged;
      return merged;
    },

    init() {
      if (initialized) return false;
      initialized = true;
      ensurePresentationFilter();
      this.bindListeners();
      getPresenter().init();
      void this.refreshAiClassifierStatus();
      return true;
    },

    bindListeners() {
      byId('newIntimationButton')?.addEventListener('click', () => onOpenIntimation?.());
      byId('importIntimationButton')?.addEventListener('click', () => byId('jsonImportInput')?.click());
      byId('jsonImportInput')?.addEventListener('change', event => onImportJson?.(event.target.files[0]));

      byId('inboxFiltersToggle')?.addEventListener('click', event => {
        const expanded = event.currentTarget.closest('.section-toolbar')?.classList.toggle('is-expanded') === true;
        event.currentTarget.setAttribute('aria-expanded', String(expanded));
      });
      byId('inboxFilters')?.addEventListener('click', event => {
        const button = event.target.closest('button[data-filter]');
        if (!button) return;
        inboxFilter = button.dataset.filter;
        inboxFilterExplicit = true;
        // Reaplicar um recorte reinicia a paginação incremental, mesmo se o filtro já estava ativo.
        inboxVisibleLimit = INBOX_PAGE_SIZE;
        byId('inboxFilters').querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
        documentRef.querySelectorAll('#publicationsMetrics .pub-metric-card').forEach(card => card.classList.toggle('active', card.dataset.filter === inboxFilter));
        this.renderInbox();
      });
      byId('publicationsMetrics')?.addEventListener('click', event => {
        const card = event.target.closest('.pub-metric-card[data-filter]');
        if (!card) return;
        inboxFilter = card.dataset.filter;
        inboxFilterExplicit = true;
        inboxVisibleLimit = INBOX_PAGE_SIZE;
        documentRef.querySelectorAll('#publicationsMetrics .pub-metric-card').forEach(item => item.classList.toggle('active', item === card));
        byId('inboxFilters')?.querySelectorAll('button').forEach(item => item.classList.toggle('active', item.dataset.filter === inboxFilter));
        this.renderInbox();
      });
      byId('publicationsMetrics')?.addEventListener('keydown', event => {
        const card = event.target.closest('.pub-metric-card[data-filter]');
        if (!card || !['Enter', ' '].includes(event.key) || !isV2()) return;
        event.preventDefault();
        card.click();
      });
      byId('inboxSortSelect')?.addEventListener('change', event => {
        inboxSort = event.target.value;
        this.renderInbox();
      });
      if (byId('inboxSortSelect')) byId('inboxSortSelect').value = inboxSort;
      byId('inboxCutoffSelect')?.addEventListener('change', event => {
        inboxCutoff = INBOX_CUTOFF_VALUES.includes(event.target.value) ? event.target.value : 'all';
        persistInboxCutoff(inboxCutoff);
        this.renderInbox();
      });
      const mineOnlyBox = byId('publicationMineOnly');
      if (mineOnlyBox) {
        mineOnlyBox.checked = inboxMineOnly;
        mineOnlyBox.addEventListener('change', event => {
          inboxMineOnly = event.target.checked === true;
          persistInboxMineOnly(inboxMineOnly);
          this.renderInbox();
        });
      }
      documentRef.querySelectorAll('.list-head-sort').forEach(button => {
        button.addEventListener('click', () => {
          const column = button.dataset.inboxSortCol;
          if (column === 'date') inboxSort = inboxSort === 'date-desc' ? 'date-asc' : 'date-desc';
          else if (column === 'deadline') inboxSort = inboxSort === 'deadline-asc' ? 'deadline-desc' : 'deadline-asc';
          if (byId('inboxSortSelect')) byId('inboxSortSelect').value = inboxSort;
          this.renderInbox();
        });
      });

      byId('discardPublicationClose')?.addEventListener('click', () => this.closeDiscardModal());
      byId('discardPublicationCancel')?.addEventListener('click', () => this.closeDiscardModal());
      byId('discardPublicationBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('discardPublicationBackdrop')) this.closeDiscardModal();
      });
      byId('discardPublicationForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        const id = byId('discardPublicationIdInput')?.value;
        const note = byId('discardReasonInput')?.value;
        this.closeDiscardModal();
        await this.applyTreatmentAction(id, 'discard', note);
      });
      byId('treatPublicationClose')?.addEventListener('click', () => this.closeTreatModal());
      byId('treatPublicationCancel')?.addEventListener('click', () => this.closeTreatModal());
      byId('treatPublicationBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('treatPublicationBackdrop')) this.closeTreatModal();
      });
      byId('treatPublicationForm')?.addEventListener('submit', async event => {
        event.preventDefault();
        const id = byId('treatPublicationIdInput')?.value;
        const note = byId('treatNoteInput')?.value;
        this.closeTreatModal();
        await this.applyTreatmentAction(id, 'mark_treated', note);
      });

      byId('btnEmailPublications')?.addEventListener('click', () => this.openPublicationsEmailModal());
      byId('aiClassifierToggle')?.addEventListener('click', () => this.toggleAiClassifier());
      byId('aiAutoOrganizeToggle')?.addEventListener('click', () => this.toggleAutoOrganize());
      byId('aiClassifierBacklogButton')?.addEventListener('click', () => this.runAiClassifierBacklog());
      byId('duplicateReviewPanel')?.addEventListener('click', event => {
        const openButton = event.target.closest('[data-duplicate-open]');
        if (openButton) {
          this.select(openButton.dataset.duplicateOpen);
          return;
        }
        const mergeStart = event.target.closest('[data-duplicate-action="merge"]');
        if (mergeStart) {
          duplicateMergeCandidate = String(mergeStart.dataset.duplicateKey || '');
          this.renderDuplicateReview();
          return;
        }
        if (event.target.closest('[data-duplicate-action="merge-cancel"]')) {
          duplicateMergeCandidate = '';
          this.renderDuplicateReview();
          return;
        }
        const mergeConfirm = event.target.closest('[data-duplicate-action="merge-confirm"]');
        if (mergeConfirm) {
          void this.mergeDuplicatePair(mergeConfirm.dataset.duplicateA, mergeConfirm.dataset.duplicateB);
          return;
        }
        const dismiss = event.target.closest('[data-duplicate-action="dismiss"]');
        if (dismiss) {
          void this.dismissDuplicatePair(
            dismiss.dataset.duplicateA,
            dismiss.dataset.duplicateB,
            dismiss.dataset.duplicateKey
          );
          return;
        }
        if (event.target.closest('[data-duplicate-action="confirm-all"]')) {
          void this.confirmAllDuplicatePairs();
          return;
        }
        if (event.target.closest('[data-duplicate-action="analyze"]')) void this.runDuplicateReview();
      });
      byId('publicationsEmailClose')?.addEventListener('click', () => this.closePublicationsEmailModal());
      byId('publicationsEmailCancel')?.addEventListener('click', () => this.closePublicationsEmailModal());
      byId('publicationsEmailModalBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('publicationsEmailModalBackdrop')) this.closePublicationsEmailModal();
      });
      byId('btnSendEmailDirect')?.addEventListener('click', () => this.sendBatchEmail());
      byId('btnCopyEmailHtml')?.addEventListener('click', () => this.copyEmailBulletin());
      byId('btnDownloadEmailHtml')?.addEventListener('click', () => this.downloadEmailBulletin());

      byId('publicationEmailClose')?.addEventListener('click', () => this.closePublicationEmailModal());
      byId('publicationEmailCancel')?.addEventListener('click', () => this.closePublicationEmailModal());
      byId('publicationEmailBackdrop')?.addEventListener('click', event => {
        if (event.target === byId('publicationEmailBackdrop')) this.closePublicationEmailModal();
      });
      byId('publicationEmailForm')?.addEventListener('submit', event => this.submitPublicationEmail(event));
    },

    filteredItems() {
      ensurePresentationFilter();
      return filterPublications(store.state.intimations, {
        filter: inboxFilter,
        sort: inboxSort,
        cutoff: inboxCutoff,
        mineOnly: inboxMineOnly,
        me: inboxMineOnly ? resolveInboxMe() : null,
        processes: store.state.processes || [],
        teams: getOfficeDirectory().teams || store.state.teams || [],
        aiSuggestions: aiClassifierSuggestions
      });
    },

    getUntreatedCount() {
      return activeIntimations(store.state.intimations)
        .filter(item => (item.treatmentStatus || 'untreated') === 'untreated').length;
    },

    getMetrics(now = new Date()) {
      const intimations = activeIntimations(store.state.intimations);
      return {
        untreated: intimations.filter(item => (item.treatmentStatus || 'untreated') === 'untreated').length,
        inReview: intimations.filter(item => item.treatmentStatus === 'in_review').length,
        treatedToday: intimations.filter(item => item.treatmentStatus === 'treated' && isDateToday(item.treatedAt, now)).length,
        discardedToday: intimations.filter(item => item.treatmentStatus === 'discarded' && isDateToday(item.discardedAt, now)).length
      };
    },

    renderMetrics() {
      ensurePresentationFilter();
      const metrics = this.getMetrics();
      const todayCount = filterPublications(store.state.intimations, {
        filter: 'today',
        aiSuggestions: aiClassifierSuggestions,
        sort: inboxSort,
        cutoff: inboxCutoff,
        mineOnly: inboxMineOnly,
        me: inboxMineOnly ? resolveInboxMe() : null,
        processes: store.state.processes || [],
        teams: getOfficeDirectory().teams || store.state.teams || [],
        countOnly: true
      }).length;
      if (byId('pubTodayCount')) byId('pubTodayCount').textContent = String(todayCount);
      if (byId('pubMetricUntreated')) byId('pubMetricUntreated').textContent = String(metrics.untreated);
      if (byId('pubMetricInReview')) byId('pubMetricInReview').textContent = String(metrics.inReview);
      if (byId('pubMetricTreatedToday')) byId('pubMetricTreatedToday').textContent = String(metrics.treatedToday);
      if (byId('pubMetricDiscardedToday')) byId('pubMetricDiscardedToday').textContent = String(metrics.discardedToday);
      documentRef.querySelectorAll('#publicationsMetrics .pub-metric-card').forEach(card => {
        card.classList.toggle('active', card.dataset.filter === (inboxFilter || 'untreated'));
        card.setAttribute('aria-pressed', card.dataset.filter === (inboxFilter || 'untreated') ? 'true' : 'false');
      });
    },

    intimationParties(item) {
      if (isMergedIntimation(item)) return '';
      const process = store.state.processes.find(record => record.number === item.process);
      const direct = String(item.client || '').trim();
      if (direct && !/^(?:cliente|partes?) (?:não|nao) identificad/i.test(direct)) return direct;
      return [process?.client, process?.opposingParty]
        .map(value => String(value || '').trim())
        .filter(Boolean)
        .filter((value, index, values) => values.indexOf(value) === index)
        .join(' × ');
    },

    treatmentStatusBadge(treatmentStatus) {
      const badges = {
        untreated: { label: 'Não tratada', css: 'treatment-untreated' },
        in_review: { label: 'Em análise', css: 'treatment-in-review' },
        treated: { label: 'Tratada', css: 'treatment-treated' },
        discarded: { label: 'Descartada', css: 'treatment-discarded' }
      };
      const badge = badges[treatmentStatus || 'untreated'] || badges.untreated;
      return `<span class="treatment-badge ${badge.css}">${badge.label}</span>`;
    },

    renderInbox() {
      if (byId('inboxCutoffSelect')) byId('inboxCutoffSelect').value = inboxCutoff;
      if (byId('inboxSortSelect')) byId('inboxSortSelect').value = inboxSort;
      const trackingLabel = byId('publicationTrackingLabel');
      if (trackingLabel) trackingLabel.textContent = '';
      ensurePresentationFilter();
      this.renderMetrics();
      byId('inboxFilters')?.querySelectorAll('button[data-filter]').forEach(button => {
        const active = button.dataset.filter === inboxFilter;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      const items = this.filteredItems();
      const allItems = activeIntimations(store.state.intimations);
      if (!officeDirectoryLoaded()) {
        void refreshOfficeDirectory().then(directory => { if (directory.users.length || directory.teams.length) this.renderInbox(); });
      }
      const involvedFor = item => {
        const directory = getOfficeDirectory();
        const users = directory.users.length ? directory.users : (store.state.users || []);
        const people = publicationInvolvedPeople(item, { users, processes: store.state.processes || [], lawyers: publicationLawyersFor(item) });
        const team = teamForTask({ process: item.process }, directory.teams, store.state.processes || []) || teamForPeople(directory.teams, people);
        return renderOfficeInvolved({ people, team, escapeHtml, iconSvg });
      };
      const signature = [inboxFilter, inboxSort, inboxCutoff, byId('inboxSearch')?.value || ''].join('|');
      if (signature !== inboxListSignature) {
        inboxListSignature = signature;
        inboxVisibleLimit = INBOX_PAGE_SIZE;
      }
      const visibleItems = items.slice(0, inboxVisibleLimit);
      const dateButton = documentRef.querySelector('button[data-inbox-sort-col="date"]');
      const dateIcon = byId('inboxSortIconDate');
      if (dateButton && dateIcon) {
        dateButton.classList.toggle('active', inboxSort === 'date-desc' || inboxSort === 'date-asc');
        dateIcon.textContent = inboxSort === 'date-asc' ? '▲' : inboxSort === 'date-desc' ? '▼' : '↕';
      }

      const emptyMessage = (inboxFilter === 'untreated' || !inboxFilter)
        ? `<div class="empty-detail"><span>${iconSvg('check')}</span><h3>Não há publicações pendentes de tratamento.</h3><p>Todas as publicações capturadas estão em análise, tratadas ou descartadas.</p></div>`
        : `<div class="empty-detail"><span>${iconSvg('check')}</span><h3>Nenhuma publicação encontrada</h3><p>Não há publicações para o filtro ou ordenação selecionados.</p></div>`;
      const list = byId('inboxList');
      if (!list) return;
      if (isV2()) {
        getPresenter().updateCount({ visible: items.length, total: allItems.length });
        list.innerHTML = items.length ? `${visibleItems.map(item => renderPublicationRow({
          item,
          act: classifyIntimationAct(item.text, item.title, item.type),
          parties: this.intimationParties(item),
          selected: selectedIntimation === item.id,
          aiClassifier: this.aiClassifierBadgeState(canonicalIntimationId(item.id)),
          involved: involvedFor(item),
          escapeHtml,
          formatDate,
          formatDateTime,
          formatAge: formatPublicationAge
        })).join('')}${items.length > visibleItems.length ? `<div class="inbox-load-more"><button type="button" class="button ghost" data-inbox-load-more>Mostrar mais ${pluralize(items.length - visibleItems.length, 'publicação', 'publicações')}</button><small>${visibleItems.length} de ${items.length} publicações neste filtro</small></div>` : ''}` : renderPublicationEmpty({ total: allItems.length, filter: inboxFilter, escapeHtml });
      } else list.innerHTML = items.length ? `${visibleItems.map(item => {
        const act = classifyIntimationAct(item.text, item.title, item.type);
        const urgent = Boolean(item.urgent || item.priority === 'urgente');
        const urgentBadge = urgent ? '<span class="badge-urgent">URGENTE</span>' : '';
        const importantBadge = item.important ? '<span class="badge-important">IMPORTANTE</span>' : '';
        const untreated = (item.treatmentStatus || 'untreated') === 'untreated';
        const parties = this.intimationParties(item);
        return `
        <button class="inbox-row ${selectedIntimation === item.id ? 'active' : ''} ${urgent ? 'is-urgent' : ''} ${item.important ? 'is-important' : ''} ${untreated ? 'row-untreated' : ''}" data-intimation-id="${escapeHtml(item.id)}" aria-label="Publicação ${escapeHtml(item.title)}">
          <span class="inbox-primary">
            <i class="unread-dot ${item.unread ? '' : 'read'}" title="${item.unread ? 'Não lida' : 'Lida'}"></i>
            <span>
              <div style="display:flex;align-items:center;flex-wrap:wrap;gap:4px;">${urgentBadge}${importantBadge}<strong>${escapeHtml(item.title)}</strong></div>
              <small class="inbox-case-line"><b>${escapeHtml(item.process || 'Sem processo vinculado')}</b>${parties ? `<em> · ${escapeHtml(parties)}</em>` : '<em> · Partes não identificadas</em>'}</small>
            </span>
          </span>
          <span class="source-label"><span class="act-chip ${act.css}">${escapeHtml(act.label)}</span></span>
          <span class="date-label">
            <span class="pub-age ${untreated ? 'age-untreated' : ''}">${formatPublicationAge(item.publishedAt)}</span>
            <small class="pub-full-date">${formatDate(item.publishedAt)}</small>
          </span>
          <span>${this.treatmentStatusBadge(item.treatmentStatus)}</span>
        </button>`;
      }).join('')}${items.length > visibleItems.length ? `<div class="inbox-load-more"><button type="button" class="button ghost" data-inbox-load-more>Mostrar mais ${pluralize(items.length - visibleItems.length, 'publicação', 'publicações')}</button><small>${visibleItems.length} de ${items.length} publicações neste filtro</small></div>` : ''}` : emptyMessage;

      list.querySelectorAll('[data-intimation-id]').forEach(button => {
        button.addEventListener('click', () => this.select(button.dataset.intimationId, button));
      });
      this.renderDuplicateReview();
      list.querySelectorAll('[data-inbox-load-more]').forEach(button => {
        button.addEventListener('click', () => {
          inboxVisibleLimit += INBOX_PAGE_SIZE;
          this.renderInbox();
        });
      });
      list.querySelectorAll('[data-row-action]').forEach(button => {
        button.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          return this.handleRowAction(button.dataset.publicationId, button.dataset.rowAction, button);
        });
      });
      if (selectedIntimation) this.renderDetail();
      else if (isV2()) this.renderDetail();
    },

    async handleRowAction(intimationId, action, sourceButton = null) {
      if (action !== 'mark_treated') return false;
      const canonicalId = canonicalIntimationId(intimationId);
      const item = findIntimation(canonicalId);
      if (!item) return false;
      if (item.unread) item.unread = false;
      // Trava o botão durante o voo: sem duplo clique na mesma linha (que viraria
      // transição inválida) e com retorno visual imediato.
      if (sourceButton) sourceButton.disabled = true;
      const shell = sourceButton?.closest?.('[data-intimation-id]') || null;
      const rowIndex = shell
        ? [...(byId('inboxList')?.querySelectorAll('[data-intimation-id]') || [])].indexOf(shell)
        : -1;
      const result = await this.applyTreatmentAction(canonicalId, 'mark_treated', null, { successToast: false, deferRender: true });
      if (!result) {
        if (sourceButton) sourceButton.disabled = false;
        store.save();
        return false;
      }
      const canonical = findIntimation(canonicalId) || item;
      if (canonical.unread) canonical.unread = false;
      // Flush único com a revision já adotada — ENFILEIRADO na mesma cadeia das
      // escritas de tratamento (sem isso, ele correria com o POST seguinte e
      // tomaria 409 da própria fila: foi exatamente esse o reload duplo).
      // Não aguardado: o toast/feedback não espera a rede.
      enqueueTreatmentRequest(() => store.flush());
      if (shell && !prefersReducedMotion()) {
        shell.classList.add('is-treated-exit');
        await delay(240);
      }
      this.renderInbox();
      this.renderMetrics();
      onRenderGlobalMetrics?.();
      this.renderDetail();
      toast('Publicação marcada como tratada.', 'success', {
        label: 'Desfazer',
        onClick: () => this.applyTreatmentAction(canonicalId, 'reopen')
      });
      focusNextQuickAction(rowIndex);
      return true;
    },

    renderAutoOrganizeToggle() {
      const button = byId('aiAutoOrganizeToggle');
      if (!button) return;
      const auth = globalThis.AtriumAuth?.currentUser || globalThis.KellerAuth?.currentUser;
      const canManage = ['admin', 'master_admin'].includes(auth?.role);
      button.hidden = !canManage || store.state.settings?.aiClassifier?.enabled !== true;
      const enabled = store.state.settings?.aiAutoOrganize?.enabled === true;
      button.setAttribute('aria-pressed', String(enabled));
      button.textContent = enabled ? 'Organização ligada' : 'Ligar organização';
    },

    async toggleAutoOrganize() {
      const enabled = store.state.settings?.aiAutoOrganize?.enabled !== true;
      const response = await windowRef.KellerAuth?.secureFetch?.('/api/ai-classifier/organize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      }).catch(() => null);
      if (!response?.ok) {
        showToast?.('Não foi possível mudar a organização automática. Tente de novo em instantes.', 'error');
        return;
      }
      await store.load();
      this.renderAutoOrganizeToggle();
      const data = await response.json().catch(() => ({}));
      showToast?.(enabled
        ? `Organização automática ligada. ${Number(data.total) || 0} ajustes feitos agora.`
        : 'Organização automática desligada.', 'success');
    },

    select(id, invoker = null) {
      const canonicalId = canonicalIntimationId(id);
      selectedIntimation = canonicalId;
      if (isV2()) getPresenter().prepareDetailOpen(invoker, canonicalId);
      const item = findIntimation(canonicalId);
      if (item && item.unread) {
        item.unread = false;
        store.save();
      }
      this.renderInbox();
      this.renderMetrics();
      onRenderGlobalMetrics?.();
      this.renderDetail();
    },

    closeDetail() {
      if (!isV2()) return false;
      if (getPresenter().hasUnsavedDetailChanges?.()
        && !windowRef.confirm('Há alterações não salvas nesta publicação. Deseja realmente fechar?')) return false;
      const selectedId = selectedIntimation;
      selectedIntimation = null;
      getPresenter().closeDetail({ restoreFocus: false });
      this.renderInbox();
      this.renderDetail();
      if (selectedId) {
        const returnRecord = [...(byId('inboxList')?.querySelectorAll('[data-intimation-id]') || [])]
          .find(element => element.dataset.intimationId === selectedId);
        const returnTarget = returnRecord?.querySelector('.publication-record-open') || returnRecord;
        if (returnTarget?.isConnected) queueMicrotask(() => returnTarget.focus({ preventScroll: true }));
      }
      return true;
    },

    renderDetail() {
      const item = findIntimation(selectedIntimation);
      const container = byId('intimationDetail');
      if (!container) return;
      if (!item) {
        getPresenter().closeDetail({ restoreFocus: false });
        container.innerHTML = `<div class="empty-detail"><span>${iconSvg('publications')}</span><h3>Selecione uma publicação</h3><p>O texto original, o processo, alertas de urgência e o fluxo de tratamento aparecerão aqui.</p></div>`;
        return;
      }

      const act = classifyIntimationAct(item.text, item.title, item.type);
      const urgent = Boolean(item.urgent || item.priority === 'urgente');
      const treatmentStatus = item.treatmentStatus || 'untreated';
      const currentUser = windowRef?.KellerAuth?.currentUser;
      const privileged = currentUser?.role === 'master_admin' || currentUser?.role === 'admin';
      const emailAction = privileged
        ? `<button type="button" class="button ghost" data-detail-action="send-email" id="btnSendIntimationEmail" title="Enviar publicação por e-mail">${iconSvg('email')} Enviar por e-mail</button>`
        : '';

      if (isV2()) {
        const linkedTaskIds = Array.isArray(item.linkedTaskIds) ? item.linkedTaskIds : (item.taskId ? [item.taskId] : []);
        const linkedTasks = (store.state.tasks || []).filter(task => task.active !== false && (linkedTaskIds.includes(task.id) || taskLinksToIntimation(task, item.id)));
        const linkedProcess = resolvePublicationProcess(store.state, item);
        const linkedContact = resolvePublicationContact(store.state, item);
        const linkedWorkActions = (Array.isArray(item.linkedWorkActions) ? item.linkedWorkActions : []).map(relation => ({
          ...relation,
          entity: relation.entityType === 'task'
            ? (store.state.tasks || []).find(record => record.id === relation.entityId)
            : relation.entityType === 'agenda'
              ? (store.state.agenda || []).find(record => record.id === relation.entityId)
              : relation.entityType === 'process'
                ? (store.state.processes || []).find(record => record.id === relation.entityId)
                : (item.workNotes || []).find(record => record.id === relation.entityId)
        }));
        const renderSnapshot = getPresenter().captureDetailRender(canonicalIntimationId(item.id));
        container.dataset.publicationId = String(canonicalIntimationId(item.id));
        container.innerHTML = renderPublicationDetail({
          item,
          act,
          parties: this.intimationParties(item),
          linkedTasks,
          linkedProcess,
          linkedContact,
          linkedWorkActions,
          privileged,
          suspensions: store.state.settings?.suspensions || [],
          officeUsers: store.state.users || [],
          officeOabKeys: officeOabKeysFor(),
          aiClassifier: this.aiClassifierPanelState(canonicalIntimationId(item.id)),
          briefTask: this.briefTaskState(canonicalIntimationId(item.id)),
          providence: this.providenceState(canonicalIntimationId(item.id)),
          escapeHtml,
          formatDate,
          formatDateTime,
          formatAge: formatPublicationAge
        });
        // O modelo do catálogo na providência é um combobox com busca incremental — mesmo
        // controlador oficial dos formulários (instalado a cada render, como o modal faz).
        installModalComboboxes(container);
        const moreToggle = container.querySelector('[data-detail-more]');
        if (moreToggle && detailActionsExpanded) {
          moreToggle.closest('.detail-actions')?.classList.add('is-expanded');
          moreToggle.setAttribute('aria-expanded', 'true');
          moreToggle.textContent = 'Menos ações';
        }
        getPresenter().restoreDetailRender(renderSnapshot);
        getPresenter().syncDetailSizeControl?.();
        const providenceShell = container.querySelector('[data-providence-block]');
        if (providenceShell) {
          const syncProvidence = () => syncProvidenceApplyState(providenceShell);
          providenceShell.addEventListener('input', syncProvidence);
          providenceShell.addEventListener('atrium:combobox-select', syncProvidence);
          syncProvidence();
        }
        // A contagem informativa não sobrevive sozinha ao re-render: o resultado vigente volta
        // para a tela — é ele que vira prazo da tarefa criada quando a pessoa confirmar.
        const conferenceBox = container.querySelector('[data-conference-result]');
        if (conferenceBox && conferenceResult && String(conferenceResult.intimationId) === String(canonicalIntimationId(item.id))) {
          conferenceBox.innerHTML = conferenceResult.summary;
          conferenceBox.closest('details[data-fold]')?.setAttribute('open', '');
        }
        const moreButton = container.querySelector('[data-detail-more]');
        moreButton?.addEventListener('click', event => {
          const expanded = event.currentTarget.closest('.detail-actions')?.classList.toggle('is-expanded') === true;
          detailActionsExpanded = expanded;
          event.currentTarget.setAttribute('aria-expanded', String(expanded));
          event.currentTarget.textContent = expanded ? 'Menos ações' : 'Mais ações';
        });
        container.querySelectorAll('[data-detail-action]').forEach(button => {
          button.addEventListener('click', () => this.handleAction(item, button.dataset.detailAction));
        });
        container.querySelectorAll('[data-open-task-id]').forEach(button => {
          button.addEventListener('click', () => {
            const task = store.state.tasks.find(record => record.id === button.dataset.openTaskId);
            if (task) onOpenTask?.(task);
          });
        });
        container.querySelectorAll('[data-open-process-id]').forEach(button => button.addEventListener('click', () => {
          const process = (store.state.processes || []).find(record => String(record.id) === button.dataset.openProcessId);
          if (process) onOpenProcess?.(process);
        }));
        container.querySelector('[data-open-contact-id]')?.addEventListener('click', () => onOpenContact?.(linkedContact));
        container.querySelectorAll('[data-open-agenda-id]').forEach(button => button.addEventListener('click', () => {
          const appointment = (store.state.agenda || []).find(record => record.id === button.dataset.openAgendaId);
          if (appointment) onOpenAgenda?.(appointment);
        }));
        byId('publicationDetailClose')?.addEventListener('click', () => this.closeDetail());
        byId('publicationDetailNext')?.addEventListener('click', () => {
          const items = this.filteredItems();
          const position = items.findIndex(entry => entry.id === selectedIntimation);
          const next = items[position + 1];
          if (next) this.select(next.id, byId('publicationDetailNext'));
          else showToast?.('Não há próxima publicação neste filtro.', 'info');
        });
        container.querySelector('[data-ai-classifier-action="refresh"]')?.addEventListener('click', () => this.refreshAiClassifierSuggestion());
        container.querySelectorAll('[data-ai-classifier-action="correct"]').forEach(button => button.addEventListener('click', () => {
          aiClassifierCorrecting = String(button.dataset.aiClassifierQuestion || 'area');
          this.renderDetail();
        }));
        container.querySelectorAll('[data-ai-classifier-action="correct-apply"]').forEach(button => button.addEventListener('click', () => {
          const question = String(button.dataset.aiClassifierQuestion || '');
          const label = String(button.dataset.aiClassifierLabel || '');
          // "Outra área" abre o campo para nomear: a área nomeada fica registrada para reutilizar.
          if (question === 'area' && label === 'outro') {
            aiClassifierCorrecting = 'area-custom';
            this.renderDetail();
            return;
          }
          void this.correctAiClassifierLabel(question, label);
        }));
        container.querySelectorAll('[data-ai-classifier-action="correct-cancel"]').forEach(button => button.addEventListener('click', () => {
          aiClassifierCorrecting = '';
          this.renderDetail();
        }));
        // Área nomeada: o nome vira opção do painel (registrado no aprendizado do escritório).
        const customAreaInput = container.querySelector('#aiClassifierCustomAreaInput');
        const salvarAreaNomeada = () => {
          const value = String(customAreaInput?.value || '').trim();
          if (!value) {
            toast('Dê um nome para a área antes de salvar.', 'warning');
            return;
          }
          void this.correctAiClassifierLabel('area', value, { customArea: true });
        };
        container.querySelector('[data-ai-classifier-action="custom-save"]')?.addEventListener('click', salvarAreaNomeada);
        customAreaInput?.addEventListener('keydown', event => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          salvarAreaNomeada();
        });
        // Playbook do ato: cada item cria a própria tarefa (com o alerta de risco) ou o lote inteiro.
        container.querySelectorAll('[data-providence-item-index]').forEach(button => button.addEventListener('click', () => {
          void this.createProvidenceItem(button.dataset.providenceItemIndex);
        }));
        container.querySelector('[data-providence-item-batch]')?.addEventListener('click', () => { void this.createProvidenceBatch(); });
        getPresenter().syncDetailOpen();
        void this.maybeFetchAiClassifierSuggestion(canonicalIntimationId(item.id));
        void this.loadPlaybookForPublication(canonicalIntimationId(item.id));
        return;
      }

      let treatmentInfo = '';
      if (treatmentStatus === 'treated') {
        treatmentInfo = `
        <div class="treatment-info-banner treated">
          <div class="treatment-info-icon">${iconSvg('check')}</div>
          <div class="treatment-info-text">
            <strong>Tratada por ${escapeHtml(item.treatedBy || 'Advogado')}</strong>
            <span>${item.treatedAt ? formatDateTime(item.treatedAt) : 'Data registrada'}</span>
            ${item.treatmentNote ? `<small class="treatment-note-display">Obs: ${escapeHtml(item.treatmentNote)}</small>` : ''}
          </div>
        </div>`;
      } else if (treatmentStatus === 'discarded') {
        treatmentInfo = `
        <div class="treatment-info-banner discarded">
          <div class="treatment-info-icon">${iconSvg('close')}</div>
          <div class="treatment-info-text">
            <strong>Descartada por ${escapeHtml(item.discardedBy || 'Advogado')}</strong>
            <span>${item.discardedAt ? formatDateTime(item.discardedAt) : 'Data registrada'}</span>
            ${item.treatmentNote ? `<small class="treatment-note-display">Motivo: ${escapeHtml(item.treatmentNote)}</small>` : ''}
          </div>
        </div>`;
      } else if (treatmentStatus === 'in_review') {
        treatmentInfo = `
        <div class="treatment-info-banner in-review">
          <div class="treatment-info-icon">${iconSvg('search')}</div>
          <div class="treatment-info-text">
            <strong>Em análise por ${escapeHtml(item.treatmentStartedBy || 'Advogado')}</strong>
            <span>Iniciada em ${item.treatmentStartedAt ? formatDateTime(item.treatmentStartedAt) : 'Hoje'}</span>
          </div>
        </div>`;
      }

      const linkedTaskIds = Array.isArray(item.linkedTaskIds) ? item.linkedTaskIds : (item.taskId ? [item.taskId] : []);
      const linkedTasks = (store.state.tasks || []).filter(task => task.active !== false && (linkedTaskIds.includes(task.id) || taskLinksToIntimation(task, item.id)));
      const linkedTasksHtml = linkedTasks.length > 0 ? `
        <div class="linked-tasks-card">
          <div class="linked-tasks-header"><span>${iconSvg('tasks')} Providência criada (${linkedTasks.length})</span></div>
          <div class="linked-tasks-list">
            ${linkedTasks.map(task => `
              <div class="linked-task-item">
                <div class="linked-task-info">
                  <strong>Tarefa: ${escapeHtml(task.title)}</strong>
                  <small>${task.responsible ? `Responsável: ${escapeHtml(task.responsible)}` : ''} ${task.deadline ? `· Prazo: ${formatDate(task.deadline)}` : ''}</small>
                </div>
                <button type="button" class="button ghost" data-open-task-id="${escapeHtml(task.id)}" style="padding:4px 10px; font-size:12px;">Abrir tarefa</button>
              </div>
            `).join('')}
          </div>
        </div>` : '';

      let actions = '';
      if (treatmentStatus === 'untreated') {
        actions = `
          <button type="button" class="button gold" data-detail-action="start-review" id="btnStartReview">${iconSvg('search')} Iniciar análise</button>
          <button type="button" class="button ghost" data-detail-action="task" id="btnCreateTask">${iconSvg('add')} Criar tarefa</button>
          <button type="button" class="button ghost btn-success-action" data-detail-action="treat" id="btnMarkTreated">${iconSvg('check')} Marcar como tratada</button>
          <button type="button" class="button ghost btn-danger-action" data-detail-action="discard" id="btnDiscardPublication">${iconSvg('delete')} Descartar</button>
          ${emailAction}`;
      } else if (treatmentStatus === 'in_review') {
        actions = `
          <button type="button" class="button ghost" data-detail-action="task" id="btnCreateTask">${iconSvg('add')} Criar tarefa</button>
          <button type="button" class="button gold btn-success-action" data-detail-action="treat" id="btnMarkTreated">${iconSvg('check')} Marcar como tratada</button>
          <button type="button" class="button ghost btn-danger-action" data-detail-action="discard" id="btnDiscardPublication">${iconSvg('delete')} Descartar</button>
          ${emailAction}`;
      } else if (treatmentStatus === 'treated') {
        actions = `
          <button type="button" class="button ghost" data-detail-action="reopen" id="btnReopenPublication">${iconSvg('reopen')} Reabrir</button>
          <button type="button" class="button ghost" data-detail-action="task" id="btnCreateTask">${iconSvg('add')} Criar tarefa</button>
          ${emailAction}`;
      } else if (treatmentStatus === 'discarded') {
        actions = `
          <button type="button" class="button ghost" data-detail-action="restore" id="btnRestorePublication">${iconSvg('reopen')} Restaurar</button>
          ${emailAction}`;
      }

      container.innerHTML = `
        <div class="detail-header">
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
            ${this.treatmentStatusBadge(item.treatmentStatus)}
            <span class="act-chip ${act.css}">${escapeHtml(act.label)}</span>
            ${urgent ? '<span class="badge-urgent">URGENTE</span>' : ''}
            ${item.important ? '<span class="badge-important">IMPORTANTE</span>' : ''}
          </div>
          <h2>${escapeHtml(item.title)}</h2>
          <p>${escapeHtml(item.court || 'Origem judicial não informada')}</p>
        </div>
        ${treatmentInfo}
        <div class="detail-meta">
          <div><small>Processo</small><strong>${escapeHtml(item.process || 'Não identificado')}</strong></div>
          <div><small>Partes</small><strong>${escapeHtml(this.intimationParties(item) || 'Ainda não identificadas')}</strong></div>
          <div><small>Publicação</small><strong>${formatDate(item.publishedAt)} (${formatPublicationAge(item.publishedAt)})</strong></div>
          ${item.disponibilizadoEm && item.disponibilizadoEm !== item.publishedAt ? `<div><small>Disponibilização</small><strong>${formatDate(item.disponibilizadoEm)}</strong></div>` : ''}
          ${item.sourceReportedDeadlineAt ? (item.deadlineSource === 'eproc' || item.deadlineSource === 'pje'
            ? `<div><small>Prazo informado pela fonte oficial</small><strong>${formatDate(item.sourceReportedDeadlineAt)}</strong></div>`
            : `<div><small>Data informada pelo ${item.sourceReportedDeadlineSource === 'domicilio' ? 'Domicílio Eletrônico' : 'eproc'}</small><strong>${formatDate(item.sourceReportedDeadlineAt)} · conferência obrigatória</strong></div>`) : ''}
          ${item.sourceStatus ? `<div><small>Presença na fonte</small><strong>${item.sourceStatus === 'active' ? 'Presente na última coleta' : 'Evidência preservada; não presente na última coleta'}</strong></div>` : ''}
          <div><small>Responsável</small><strong>${escapeHtml(item.responsible || item.lawyers || 'Advogado')}</strong></div>
        </div>
        ${linkedTasksHtml}
        <p class="eyebrow" style="margin-top:16px;">Texto original preservado</p>
        <div class="original-text">${escapeHtml(publicationReadableText(item.fullTextSource === 'domicilio' && item.fullText ? item.fullText : (item.text || item.sourceText || item.description || 'Sem texto original.')))}</div>
        <div class="detail-actions" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;">${actions}</div>`;

      container.querySelectorAll('[data-detail-action]').forEach(button => {
        button.addEventListener('click', () => this.handleAction(item, button.dataset.detailAction));
      });
      container.querySelectorAll('[data-open-task-id]').forEach(button => {
        button.addEventListener('click', () => {
          const task = store.state.tasks.find(record => record.id === button.dataset.openTaskId);
          if (task) onOpenTask?.(task);
        });
      });
      if (!isV2()) {
        container.querySelector('.detail-actions')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }
    },

    async handleAction(item, action) {
      if (!item) return;
      if (action === 'create-brief-task') return this.createBriefTask(item);
      if (action === 'undo-brief-task') return this.undoBriefTask(item);
      if (action === 'view-decision-html') return this.viewDecisionHtml(item);
      if (action === 'download-decision-html') return this.downloadDecisionHtml(item);
      if (action === 'conference-deadline') return this.conferenceDeadline(item);
      if (action === 'suggest-providence') return this.suggestProvidence();
      if (action === 'apply-providence') return this.applyProvidence();
      if (action === 'undo-providence') return this.undoProvidence();
      if (action === 'assistant') return onOpenAssistant?.(item);
      if (action === 'send-email') return this.openPublicationEmailModal(item);
      if (action === 'task') {
        const urgent = Boolean(item.urgent || item.priority === 'urgente');
        const deadlineMode = store?.state?.settings?.deadlineMode === 'manual' ? 'manual' : 'auto';
        const draftDeadline = publicationTaskDeadline(item, { deadlineMode });
        onOpenTask?.({
          title: `Analisar publicação: ${item.title}`,
          description: item.text,
          process: item.process,
          client: item.client,
          source: item.source || 'DJEN',
          intimationId: item.id,
          deadline: draftDeadline.deadline,
          deadlineSource: draftDeadline.deadlineSource,
          sourceReportedDeadlineAt: item.sourceReportedDeadlineAt || '',
          sourceReportedDeadlineSource: item.sourceReportedDeadlineSource || item.deadlineSource || '',
          priority: urgent ? 'urgente' : 'normal',
          status: 'triagem'
        });
        return;
      }
      if (['appointment', 'deadline', 'note', 'link'].includes(action)) return this.openWorkActionModal(item, action);
      if (action === 'start-review') return this.applyTreatmentAction(item.id, 'start_review');
      if (action === 'treat') return this.openTreatModal(item);
      if (action === 'discard') return this.openDiscardModal(item);
      if (action === 'reopen') return this.applyTreatmentAction(item.id, 'reopen');
      if (action === 'restore') return this.applyTreatmentAction(item.id, 'restore');
    },

    async conferenceDeadline(item) {
      const shell = documentRef.querySelector('.publication-deadline-conference');
      if (!shell) return false;
      const start = String(shell.querySelector('[data-conference-start]')?.value || '').trim();
      const days = Number(shell.querySelector('[data-conference-days]')?.value || 0);
      const counting = String(shell.querySelector('[data-conference-counting]')?.value || 'business');
      const direction = String(shell.querySelector('[data-conference-direction]')?.value || 'after');
      const result = shell.querySelector('[data-conference-result]');
      const button = shell.querySelector('[data-detail-action="conference-deadline"]');
      if (result) result.textContent = 'Calculando…';
      if (button) button.disabled = true;
      try {
        const response = await windowRef.KellerAuth.secureFetch('/api/calc/deadline/conference', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ startDate: start, days, counting, direction })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Não foi possível conferir a contagem.');
        const conference = data.conference;
        const summary = `<strong>Data proposta: ${escapeHtml(formatDate(conference.proposedDate))}</strong>
            <span>${conference.counting === 'business' ? 'Dias úteis' : 'Dias corridos'} · ${pluralize(conference.countedDays, 'dia', 'dias')} ${conference.direction === 'after' ? 'após' : 'antes'} ${escapeHtml(formatDate(conference.startDate))}</span>
            <small>1º dia útil após o início: ${escapeHtml(formatDate(conference.firstBusinessDayAfter))} · Último dia útil anterior: ${escapeHtml(formatDate(conference.lastBusinessDayBefore))}</small>
            <small>${escapeHtml(conference.note)}</small>`;
        conferenceResult = {
          intimationId: canonicalIntimationId(item?.id || selectedIntimation),
          date: String(conference.proposedDate || ''),
          label: formatDate(conference.proposedDate),
          summary
        };
        if (result) result.innerHTML = summary;
        // A nota do bloco da providência declara o prazo que vai entrar na tarefa criada: atualizar
        // em tempo real evita re-renderizar o detalhe inteiro (e perder a rolagem da contagem).
        const notaPrazo = documentRef.querySelector('[data-providence-block] [data-providence-conference-deadline]');
        if (notaPrazo) {
          notaPrazo.outerHTML = renderProvidenceDeadlineNote({
            conference: { date: conferenceResult.date, label: conferenceResult.label },
            escapeHtml
          });
        }
        return true;
      } catch (error) {
        const message = String(error?.message || 'Falha ao conferir a contagem.');
        conferenceResult = null;
        if (result) result.textContent = message;
        const notaPrazo = documentRef.querySelector('[data-providence-block] [data-providence-conference-deadline]');
        if (notaPrazo) notaPrazo.outerHTML = renderProvidenceDeadlineNote({ conference: null, escapeHtml });
        showToast?.(message, 'error');
        return false;
      } finally {
        if (button) button.disabled = false;
      }
    },

    viewDecisionHtml(item) {
      if (!item?.hasHtml || !String(item.rawHtml || '').trim()) return false;
      documentRef.querySelector('.publication-decision-dialog')?.remove();
      const dialog = documentRef.createElement('dialog');
      dialog.className = 'publication-decision-dialog';
      dialog.setAttribute('aria-labelledby', 'publicationDecisionDialogTitle');
      dialog.innerHTML = `<header><div><span>Conteúdo judicial preservado</span><h2 id="publicationDecisionDialogTitle">${escapeHtml(item.title || 'Decisão completa')}</h2></div><div><button type="button" class="button ghost" data-print-decision>Imprimir</button><button type="button" class="icon-button" data-close-decision aria-label="Fechar decisão">${iconSvg('close')}</button></div></header><iframe title="Decisão completa em HTML" sandbox="allow-same-origin"></iframe>`;
      const frame = dialog.querySelector('iframe');
      frame.srcdoc = generateDecisionHtmlDocument(item, escapeHtml);
      const close = () => { dialog.close?.(); dialog.remove(); };
      dialog.querySelector('[data-close-decision]').addEventListener('click', close);
      dialog.querySelector('[data-print-decision]').addEventListener('click', () => frame.contentWindow?.print?.());
      dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
      documentRef.body.appendChild(dialog);
      dialog.showModal();
      return true;
    },

    downloadDecisionHtml(item) {
      if (!item?.hasHtml || !String(item.rawHtml || '').trim()) return false;
      const blob = new windowRef.Blob([generateDecisionHtmlDocument(item, escapeHtml)], { type: 'text/html;charset=utf-8' });
      const url = windowRef.URL.createObjectURL(blob);
      const link = documentRef.createElement('a');
      const process = String(item.process || '').replace(/[^\d.-]/g, '') || 'sem-processo';
      link.href = url;
      link.download = `decisao-${process}.html`;
      link.hidden = true;
      documentRef.body.appendChild(link);
      link.click();
      link.remove();
      windowRef.setTimeout(() => windowRef.URL.revokeObjectURL(url), 0);
      toast('Documento HTML preparado para download.', 'success');
      return true;
    },

    openWorkActionModal(item, type) {
      if (!item?.id || !['appointment', 'deadline', 'note', 'link'].includes(type)) return false;
      const processes = (store.state.processes || []).slice().sort((a, b) => String(a.number || '').localeCompare(String(b.number || ''), 'pt-BR'));
      const currentProcess = resolvePublicationProcess(store.state, item);
      const processField = {
        name: 'processId',
        label: type === 'link' ? 'Processo oficial para vincular' : 'Processo relacionado',
        type: 'select',
        options: [{ value: '', label: type === 'link' ? 'Selecione um processo' : 'Usar vínculo atual da publicação' }, ...processes.map(process => ({ value: process.id, label: `${process.number || 'Sem número'} · ${process.client || 'Cliente não vinculado'}` }))]
      };
      const fields = type === 'appointment'
        ? [
            { name: 'title', label: 'Título do compromisso', required: true, full: true },
            { name: 'date', label: 'Data confirmada', type: 'date', required: true },
            { name: 'time', label: 'Horário', type: 'time' },
            processField,
            { name: 'notes', label: 'Observações internas', type: 'textarea', full: true }
          ]
        : type === 'deadline'
          ? [
              { name: 'title', label: 'Título do prazo', required: true, full: true },
              { name: 'deadline', label: 'Data confirmada', type: 'date', required: true, note: 'A data será cadastrada somente após esta confirmação humana.' },
              { name: 'fatalDeadline', label: 'Prazo fatal (opcional)', type: 'date', note: 'Preencha apenas quando houver conferência jurídica expressa.' },
              processField,
              { name: 'notes', label: 'Fundamento / orientação interna', type: 'textarea', full: true }
            ]
          : type === 'note'
            ? [{ name: 'notes', label: 'Nota interna', type: 'textarea', required: true, full: true, note: 'A nota ficará vinculada à publicação e não será enviada ao tribunal.' }]
            : [processField];
      const labels = {
        appointment: ['Novo compromisso', 'Registrar na agenda'],
        deadline: ['Cadastrar prazo', 'Confirmação humana obrigatória'],
        note: ['Adicionar nota', 'Contexto interno da publicação'],
        link: ['Vincular processo', 'Ligar a um processo cadastrado']
      };
      openModal?.('publicationWorkAction', labels[type][0], labels[type][1], fields, {
        id: uid('pubwork'),
        publicationId: item.id,
        workActionType: type,
        processId: currentProcess?.id || '',
        title: type === 'appointment' ? `Compromisso: ${item.title || 'publicação'}` : type === 'deadline' ? `Prazo: ${item.title || 'publicação'}` : ''
      }, type === 'deadline' ? '<p class="modal-supervision-notice"><strong>Data não inferida.</strong> Confirme pessoalmente a natureza e a contagem do prazo antes de salvar.</p>' : '');
      return true;
    },

    async createWorkAction(publicationId, action) {
      try {
        const response = await windowRef.fetch(`/api/publications/${encodeURIComponent(publicationId)}/work-actions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': windowRef.KellerAuth?.csrfToken || '' },
          body: JSON.stringify({ publicationId, revision: store.revision ?? store.state?.revision ?? undefined, action })
        });
        const data = await response.json().catch(() => ({}));
        if (response.status === 409) {
          toast(data.message || 'Esta publicação foi atualizada por outro usuário. Recarregue os dados.', 'warning');
          await onSyncAppState?.();
          return null;
        }
        if (!response.ok || !data.publication || !data.revision) {
          toast(data.message || 'Não foi possível criar a providência vinculada.', 'error');
          return null;
        }
        if (data.collection && data.entity && Array.isArray(store.state[data.collection])) {
          const index = store.state[data.collection].findIndex(record => record.id === data.entity.id);
          if (index >= 0) store.state[data.collection][index] = data.entity;
          else store.state[data.collection].unshift(data.entity);
        }
        const publicationIndex = store.state.intimations.findIndex(record => record.id === data.publication.id || record.externalId === data.publication.id);
        if (publicationIndex >= 0) store.state.intimations[publicationIndex] = data.publication;
        store.revision = data.revision;
        this.renderInbox();
        this.renderMetrics();
        onRenderGlobalMetrics?.();
        this.renderDetail();
        return data;
      } catch {
        toast('Não foi possível criar a providência vinculada.', 'error');
        return null;
      }
    },

    async createBriefTask(item) {
      if (!item || briefTaskRunning) return null;
      const canonicalId = canonicalIntimationId(item.id);
      if (!canonicalId) return null;
      const act = classifyIntimationAct(item.text, item.title, item.type);
      const classifier = this.aiClassifierPanelState(canonicalId);
      const brief = buildPublicationBrief({ item, act, classifier });
      if (!brief.what) {
        toast('A publicação não tem texto suficiente para a leitura rápida.', 'warning');
        return null;
      }
      briefTaskRunning = true;
      try {
        const isoDate = /^\d{4}-\d{2}-\d{2}$/;
        const deadlineMode = store?.state?.settings?.deadlineMode === 'manual' ? 'manual' : 'auto';
        const sourceIsDomicilio = String(item.sourceReportedDeadlineSource || '').toLowerCase() === 'domicilio';
        const deadlineIsDomicilio = String(item.deadlineSource || '').toLowerCase() === 'domicilio';
        const domicilioSource = sourceIsDomicilio || deadlineIsDomicilio;
        const humanDeadline = !deadlineIsDomicilio
          && (!domicilioSource || isHumanDeadlineSource(item.deadlineSource))
          && isoDate.test(String(item.deadline || '').trim())
          ? item.deadline
          : '';
        const sourceDeadline = !domicilioSource && isoDate.test(String(item.sourceReportedDeadlineAt || '').trim())
          ? item.sourceReportedDeadlineAt
          : '';
        const chosenDeadline = deadlineMode === 'manual' ? '' : (humanDeadline || sourceDeadline);
        const deadlineOrigin = chosenDeadline && chosenDeadline === humanDeadline ? 'registrada no ATRIUM' : 'informada pela fonte';
        const referenceDate = domicilioSource ? String(item.sourceReportedDeadlineAt || item.deadline || '').trim() : '';
        const priority = item.urgent || item.priority === 'urgente' || /alta/i.test(brief.priority) || act.priority === 'urgente'
          ? 'urgente'
          : 'normal';
        const pieceForTitle = String(brief.piece || 'Analisar publicação').replace(/\s*\(.*?\)\s*/g, '').trim();
        const title = `${pieceForTitle}: ${item.process || item.title || 'publicação'}`.slice(0, 120);
        const deadlineNote = deadlineMode === 'manual'
          ? (chosenDeadline
            ? `A data ${deadlineOrigin} é ${chosenDeadline} e fica como referência; o prazo exige confirmação humana.`
            : (referenceDate
              ? `A data de referência do Domicílio é ${referenceDate}; ela não é prazo.`
              : 'Sem prazo informado pela fonte; o prazo exige confirmação humana.'))
          : chosenDeadline
            ? `A data ${deadlineOrigin} é ${chosenDeadline} e exige conferência humana.`
            : (referenceDate
              ? `A data de referência do Domicílio é ${referenceDate}; ela não é prazo.`
              : 'Sem prazo informado pela fonte.');
        const description = [
          `Resumo: ${brief.what}`,
          `O que fazer: ${brief.action}`,
          `${brief.pieceKind === 'peca' ? 'Peça' : 'Providência'}: ${brief.piece}`,
          '',
          `Origem: ${brief.source}${brief.confidence !== null ? ` · confiança da área ${brief.confidence.toFixed(2).replace('.', ',')}` : ''}.`,
          deadlineNote,
          'Tarefa criada para revisão humana.'
        ].join('\n');
        const data = await this.createTaskFromPublication(canonicalId, {
          title,
          description,
          process: item.process,
          client: item.client,
          source: item.source || 'DJEN',
          intimationId: item.id,
          deadline: chosenDeadline,
          sourceReportedDeadlineAt: item.sourceReportedDeadlineAt || '',
          sourceReportedDeadlineSource: item.sourceReportedDeadlineSource || item.deadlineSource || '',
          priority,
          status: 'triagem',
          aiSuggestion: {
            id: `${canonicalId}:${Date.now()}`,
            action: brief.action,
            reason: brief.review ? 'review' : 'suggest',
            confidence: brief.confidence ?? 0,
            at: new Date().toISOString(),
            piece: brief.piece
          }
        });
        if (!data?.task) return null;
        briefTaskUndo = {
          publicationId: canonicalId,
          taskId: data.task.id,
          title: data.task.title,
          createdBy: windowRef?.KellerAuth?.currentUser?.username || windowRef?.KellerAuth?.currentUser?.displayName || ''
        };
        setBriefTaskBlocked(null);
        toast('Tarefa criada a partir da sugestão.', 'success');
        this.renderDetail();
        windowRef.setTimeout(() => byId('btnUndoBriefTask')?.focus(), 0);
        return data.task;
      } catch (error) {
        toast(error?.message || 'Não foi possível criar a tarefa da sugestão.', 'error');
        return null;
      } finally {
        briefTaskRunning = false;
      }
    },

    async undoBriefTask(item) {
      const canonicalId = canonicalIntimationId(item?.id || selectedIntimation);
      const undo = this.briefTaskState(canonicalId).undo;
      if (!undo?.taskId) return false;
      try {
        const response = await windowRef.fetch(`/api/publications/${encodeURIComponent(canonicalId)}/task/undo`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': windowRef.KellerAuth?.csrfToken || ''
          },
          body: JSON.stringify({
            taskId: undo.taskId,
            revision: store.revision ?? store.state?.revision ?? undefined
          })
        });
        const data = await response.json().catch(() => ({}));
        const message = String(data.error || data.message || '');
        const blockedMessage = response.status === 403
          || /alterada|não está disponível|não foi criada|pertence a esta publicação/i.test(message);
        if (blockedMessage) {
          setBriefTaskBlocked({
            publicationId: canonicalId,
            taskId: undo.taskId,
            title: undo.title,
            reason: message || 'Não é possível desfazer esta tarefa.'
          });
          briefTaskUndo = null;
          this.renderDetail();
          toast(message || 'Não é possível desfazer esta tarefa.', 'warning');
          return false;
        }
        if (response.status === 409) {
          await onSyncAppState?.();
          toast(message || 'A publicação foi atualizada. Tente de novo.', 'warning');
          return false;
        }
        if (response.status === 404 || data.alreadyUndone) {
          briefTaskUndo = null;
          setBriefTaskBlocked(null);
          await onSyncAppState?.();
          toast('A tarefa já foi desfeita.', 'info');
          return true;
        }
        if (!response.ok) {
          toast(message || 'Não foi possível desfazer agora.', 'warning');
          return false;
        }
        if (data.publication) {
          const index = store.state.intimations.findIndex(record => record.id === data.publication.id || record.externalId === data.publication.id);
          if (index >= 0) {
            store.state.intimations[index] = { ...store.state.intimations[index], ...data.publication };
          }
        }
        if (data.removedTaskId) {
          store.state.tasks = (store.state.tasks || []).filter(task => task.id !== data.removedTaskId);
        }
        for (const restored of (Array.isArray(data.restoredTasks) ? data.restoredTasks : [])) {
          const index = (store.state.tasks || []).findIndex(task => String(task.id) === String(restored.id));
          if (index >= 0) store.state.tasks[index] = restored;
          else store.state.tasks.unshift(restored);
        }
        for (const restoredId of (Array.isArray(data.restoredTaskIds) ? data.restoredTaskIds : [])) {
          const restored = (store.state.tasks || []).find(task => String(task.id) === String(restoredId));
          if (!restored) continue;
          delete restored.absorbedInto;
          delete restored.absorbedAt;
          delete restored.absorbReason;
          delete restored.absorbedBy;
          restored.active = true;
        }
        if (data.revision) store.revision = data.revision;
        const skippedCount = Array.isArray(data.skippedAbsorbedTaskIds) ? data.skippedAbsorbedTaskIds.length : 0;
        briefTaskUndo = null;
        setBriefTaskBlocked(null);
        toast(skippedCount
          ? `Tarefa desfeita. ${skippedCount === 1 ? '1 tarefa de prazo foi reativada para o responsável.' : `${skippedCount} tarefas de prazo foram reativadas para os responsáveis.`}`
          : 'Tarefa desfeita.', skippedCount ? 'warning' : 'success');
        this.renderInbox();
        this.renderMetrics();
        onRenderGlobalMetrics?.();
        this.renderDetail();
        windowRef.setTimeout(() => byId('btnCreateBriefTask')?.focus(), 0);
        return true;
      } catch (error) {
        toast(error?.message || 'Não foi possível desfazer agora.', 'error');
        return false;
      }
    },

    async createTaskFromPublication(publicationId, task) {
      try {
        const response = await windowRef.fetch(`/api/publications/${encodeURIComponent(publicationId)}/task`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': windowRef.KellerAuth?.csrfToken || ''
          },
          body: JSON.stringify({
            publicationId,
            revision: store.revision ?? store.state?.revision ?? undefined,
            task
          })
        });
        if (response.status === 409) {
          const errorData = await response.json().catch(() => ({}));
          toast(errorData.error || errorData.message || 'Esta publicação foi atualizada por outro usuário. Recarregue os dados.', 'warning');
          await onSyncAppState?.();
          return null;
        }
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          toast(errorData.error || errorData.message || 'Não foi possível criar a tarefa vinculada à publicação.', 'error');
          return null;
        }

        const data = await response.json();
        const canonicalPublication = data.publication || data.intimation;
        if (!data.task || !canonicalPublication || !data.revision) {
          toast('O servidor não devolveu o estado consolidado completo da tarefa.', 'error');
          return null;
        }
        if (!Array.isArray(store.state.tasks)) store.state.tasks = [];
        const taskIndex = store.state.tasks.findIndex(record => record.id === data.task.id);
        if (taskIndex === -1) store.state.tasks.unshift(data.task);
        else store.state.tasks[taskIndex] = data.task;
        const publicationIndex = store.state.intimations.findIndex(record => record.id === canonicalPublication.id || record.externalId === canonicalPublication.id);
        if (publicationIndex !== -1) store.state.intimations[publicationIndex] = canonicalPublication;
        store.revision = data.revision;
        this.renderInbox();
        this.renderMetrics();
        onRenderGlobalMetrics?.();
        this.renderDetail();
        return data;
      } catch {
        toast('Não foi possível criar a tarefa vinculada à publicação.', 'error');
        return null;
      }
    },

    async applyTreatmentAction(intimationId, action, note = null, { successToast = true, deferRender = false } = {}) {
      const canonicalId = canonicalIntimationId(intimationId);
      const item = findIntimation(canonicalId);
      if (!item) return null;
      return enqueueTreatmentRequest(async () => {
      try {
        const response = await windowRef.fetch(`/api/intimations/${encodeURIComponent(canonicalId)}/treatment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': windowRef.KellerAuth?.csrfToken || ''
          },
          body: JSON.stringify({
            action,
            note,
            revision: store.revision || store.state?.revision || undefined
          })
        });
        if (response.status === 409) {
          const errorData = await response.json().catch(() => ({}));
          toast(errorData.error || errorData.message || 'Esta publicação foi atualizada por outro usuário. Recarregue os dados.', 'warning');
          await onSyncAppState?.();
          return null;
        }
        if (response.ok) {
          const data = await response.json();
          if (data.intimation) {
            const index = store.state.intimations.findIndex(record => record.id === canonicalId);
            if (index !== -1) store.state.intimations[index] = data.intimation;
            if (data.revision) store.revision = data.revision;
          }
          if (!deferRender) {
            this.renderInbox();
            this.renderMetrics();
            onRenderGlobalMetrics?.();
            this.renderDetail();
          }
          if (successToast) toast(data.message || 'Tratamento atualizado com sucesso!', 'success');
          return data;
        }
        const errorData = await response.json().catch(() => ({}));
        toast(errorData.error || errorData.message || 'Não foi possível atualizar o tratamento da publicação. Tente novamente.', 'error');
      } catch (error) {
        console.error('Falha na requisição de tratamento:', error);
        toast('Não foi possível atualizar o tratamento da publicação. Tente novamente.', 'error');
      }
      return null;
      });
    },

    securePostJson(url, body, method = 'POST') {
      if (typeof windowRef.KellerAuth?.secureFetch === 'function') {
        return windowRef.KellerAuth.secureFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      }
      return windowRef.fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': windowRef.KellerAuth?.csrfToken || '' },
        body: JSON.stringify(body)
      });
    },

    async refreshAiClassifierStatus() {
      try {
        const response = await windowRef.fetch('/api/ai-classifier/status', { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`status ${response.status}`);
        const data = await response.json();
        aiClassifierCustomAreas = Array.isArray(data?.customAreas) ? data.customAreas.map(String).filter(Boolean) : [];
        aiClassifierStatus = {
          enabled: data?.enabled === true,
          available: data?.available === true,
          reason: String(data?.reason || ''),
          loaded: true
        };
      } catch {
        if (!aiClassifierStatus.loaded) {
          aiClassifierStatus = { enabled: false, available: false, reason: 'Não foi possível consultar.', loaded: true };
        }
      }
      this.syncAiClassifierToggle();
      if (aiClassifierStatus.enabled) {
        await this.loadAiClassifierSuggestions();
        await this.loadDuplicateReview();
      } else {
        this.renderDuplicateReview();
      }
    },

    syncAiClassifierToggle() {
      this.renderAutoOrganizeToggle();
      const button = byId('aiClassifierToggle');
      if (!button) return;
      const currentUser = windowRef?.KellerAuth?.currentUser;
      const privileged = currentUser?.role === 'master_admin' || currentUser?.role === 'admin';
      button.hidden = !privileged;
      if (!privileged) return;
      button.setAttribute('aria-pressed', String(aiClassifierStatus.enabled));
      button.classList.toggle('active', aiClassifierStatus.enabled);
      const backlogButton = byId('aiClassifierBacklogButton');
      if (backlogButton) {
        backlogButton.hidden = !(aiClassifierStatus.enabled && aiClassifierStatus.available);
        backlogButton.disabled = aiClassifierBacklogRunning;
      }
      this.syncAiClassifierBacklogStatus(aiClassifierStatus.enabled && aiClassifierSuggestions.size
        ? `${aiClassifierSuggestions.size} ${aiClassifierSuggestions.size === 1 ? 'sugestão de área e prioridade para revisar' : 'sugestões de área e prioridade para revisar'}`
        : '');
    },

    get aiClassifierEnabled() { return aiClassifierStatus.enabled === true; },

    /** Liga/desliga pelo botão do painel: alterna o estado atual. */
    async toggleAiClassifier() {
      return this.setAiClassifierEnabled(!aiClassifierStatus.enabled);
    },

    /**
     * Define o estado do Atrium IA pela rota oficial (admin + CSRF + revisão). Usado pelo botão
     * do painel e pela ativação no walkthrough — mesma autoridade, mesmo efeito.
     */
    async setAiClassifierEnabled(enabled) {
      if (aiClassifierTogglePending) return null;
      const currentUser = windowRef?.KellerAuth?.currentUser;
      if (!(currentUser?.role === 'master_admin' || currentUser?.role === 'admin')) {
        toast('Apenas administradores podem ligar ou desligar o Atrium IA.', 'warning');
        return null;
      }
      aiClassifierTogglePending = true;
      const button = byId('aiClassifierToggle');
      if (button) button.disabled = true;
      try {
        const response = await this.securePostJson('/api/ai-classifier/settings', {
          enabled: enabled === true,
          revision: store.revision || store.state?.revision || undefined
        }, 'PATCH');
        if (response.status === 409) {
          const errorData = await response.json().catch(() => ({}));
          toast(errorData.error || errorData.message || 'As configurações foram atualizadas por outro usuário. Recarregue os dados.', 'warning');
          await onSyncAppState?.();
          await this.refreshAiClassifierStatus();
          return null;
        }
        if (response.status === 403) {
          toast('Apenas administradores podem ligar ou desligar o Atrium IA.', 'warning');
          return null;
        }
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          toast(errorData.error || errorData.message || 'Não foi possível atualizar o Atrium IA. Tente novamente.', 'error');
          return null;
        }
        const data = await response.json();
        if (!store.state.settings || typeof store.state.settings !== 'object') store.state.settings = {};
        store.state.settings.aiClassifier = { enabled: data.enabled === true };
        if (data.revision) store.revision = data.revision;
        aiClassifierStatus = { ...aiClassifierStatus, enabled: data.enabled === true, loaded: true };
        if (!aiClassifierStatus.enabled) {
          aiClassifierCache.clear();
          this.renderDuplicateReview();
        } else {
          void this.loadAiClassifierSuggestions();
          void this.loadDuplicateReview();
        }
        this.syncAiClassifierToggle();
        this.renderDetail();
        toast(data.enabled ? 'Atrium IA ativado.' : 'Atrium IA desativado.', 'success');
        return aiClassifierStatus.enabled;
      } catch (error) {
        console.error('Falha ao atualizar o Atrium IA:', error);
        toast('Não foi possível atualizar o Atrium IA. Tente novamente.', 'error');
        return null;
      } finally {
        aiClassifierTogglePending = false;
        if (byId('aiClassifierToggle')) byId('aiClassifierToggle').disabled = false;
      }
    },

    async loadAiClassifierSuggestions() {
      if (!aiClassifierStatus.enabled) {
        aiClassifierSuggestions = new Map();
        return;
      }
      try {
        const response = await windowRef.fetch('/api/ai-classifier/suggestions', { headers: { Accept: 'application/json' } });
        if (!response.ok) return;
        const data = await response.json().catch(() => ({}));
        const next = new Map();
        for (const [id, entry] of Object.entries(data?.suggestions || {})) {
          if (entry && typeof entry === 'object') next.set(String(id), entry);
        }
        aiClassifierSuggestions = next;
        this.syncAiClassifierToggle();
        this.renderInbox();
      } catch {
        aiClassifierSuggestions = new Map();
      }
    },

    aiClassifierBadgeState(canonicalId) {
      if (!aiClassifierStatus.enabled) return null;
      const entry = aiClassifierSuggestions.get(String(canonicalId || ''));
      if (!entry || !entry.area) return null;
      return {
        enabled: true,
        action: entry.action || 'review',
        area: entry.area,
        areaConfidence: entry.areaConfidence,
        priority: entry.priority,
        deadlineSignal: entry.deadlineSignal,
        deadlineDays: entry.deadlineDays
      };
    },

    /**
     * Duplicatas prováveis: apenas leitura + conferência. O painel mostra os pares
     * candidatos (identidade oficial) e o veredito assistivo; a fusão continua manual.
     */
    duplicateReviewPanelModel() {
      const labelOf = (id, informado = '') => {
        const item = findIntimation(id);
        if (item) {
          const process = String(item.process || item.processNumber || '').trim();
          const title = String(item.title || item.event || 'Publicação').trim();
          return process ? `${title} · ${process}` : title;
        }
        // Sem a publicação no acervo, usa o rótulo que o servidor já manda (EPROC 23/09 · CNJ)
        // e, na falta dele, um resumo curto — nunca o identificador técnico inteiro, que estoura
        // a largura do diálogo e vira ruído para quem lê.
        const bruto = String(informado || '').trim();
        if (bruto) return bruto;
        const partes = String(id || '').split(':').filter(Boolean);
        const fonte = (partes[0] || 'publicação').toUpperCase();
        const trecho = String(partes[partes.length - 1] || '').slice(0, 8);
        return trecho ? `${fonte} · registro ${trecho}` : 'Publicação cadastrada';
      };
      return {
        enabled: duplicateReview.enabled,
        running: duplicateReviewRunning,
        mergeCandidate: duplicateMergeCandidate,
        pairs: duplicateReview.pairs.map(pair => ({
          ...pair,
          aLabel: labelOf(pair.aId, pair.aLabel),
          bLabel: labelOf(pair.bId, pair.bLabel),
          refusal: duplicateReviewRefusals.get(pair.key) || null
        }))
      };
    },

    /**
     * Fusão confirmada de um par de duplicatas prováveis. A decisão é humana e a fusão é
     * oficial: o absorvido vira alias reversível, as tarefas são reapontadas e a auditoria
     * registra o ato. O servidor recusa par já fundido ou com conflito de tratamento.
     */
    async mergeDuplicatePair(idA, idB) {
      const a = String(idA || '').trim();
      const b = String(idB || '').trim();
      const pairKey = [a, b].sort().join('|');
      if (!a || !b || a === b) {
        toast('Par de duplicatas inválido.', 'warning');
        return { ok: false, refusal: null };
      }
      try {
        // A revisão otimista pode estar velha (a tela ficou aberta, o acervo andou): nesse caso
        // ressincroniza e repete **uma vez** — a fusão é idempotente e o servidor recusa par já
        // fundido, então repetir é seguro e evita o clique sem efeito.
        for (let attempt = 1; attempt <= 2; attempt += 1) {
          const response = await this.securePostJson('/api/publications/merge', {
            publicationId: a,
            otherId: b,
            revision: store.revision || null
          });
          const data = await response.json().catch(() => ({}));
          if (response.ok) {
            duplicateMergeCandidate = '';
            duplicateReviewRefusals.delete(pairKey);
            // A fusão é aplicada no estado local com o que o servidor devolveu (keeper/perdedor)
            // e a revisão nova é adotada: nada de recarregar a página no meio do trabalho.
            this.applyMergedPairLocally(data.keeperId, data.loserId, data.revision);
            await this.fadeDuplicatePair(pairKey);
            toast(data.message || 'Publicações fundidas.', 'success');
            this.renderInbox();
            this.renderMetrics();
            onRenderGlobalMetrics?.();
            this.renderDetail();
            await this.loadDuplicateReview();
            return { ok: true, refusal: null };
          }
          const staleRevision = response.status === 409 && data.code !== 'MERGE_REFUSED';
          if (staleRevision && attempt === 1) {
            await onSyncAppState?.();
            continue;
          }
          const refusal = duplicateRefusalOf(data, response.status);
          if (refusal?.alreadyMerged) {
            // Desfecho definitivo do par: sai da conferência na hora. O painel não pode seguir
            // listando uma duplicata que já não existe (o próximo carregamento confirma).
            duplicateReviewRefusals.delete(pairKey);
            duplicateReview = { ...duplicateReview, pairs: duplicateReview.pairs.filter(pair => pair.key !== pairKey) };
          } else if (refusal) {
            // Recusa com motivo (conflito de teor/tratamento, registro ausente): o par permanece
            // na conferência **marcado** — a decisão continua humana e precisa do motivo à vista.
            duplicateReviewRefusals.set(pairKey, refusal);
          }
          const alreadyMerged = Boolean(refusal?.alreadyMerged) || /ja-fundido/i.test(String(data.message || ''));
          toast(
            alreadyMerged
              ? 'Este par já estava fundido — a lista foi atualizada.'
              : (refusal?.detail || data.message || data.error || 'Não foi possível fundir este par agora.'),
            'warning'
          );
          if (response.status === 409) await onSyncAppState?.();
          await this.loadDuplicateReview();
          duplicateMergeCandidate = '';
          this.renderDetail();
          return { ok: false, refusal };
        }
        return { ok: false, refusal: null };
      } catch (error) {
        toast(error?.message || 'Não foi possível fundir este par agora.', 'error');
        return { ok: false, refusal: null };
      }
    },

    /**
     * Aplica no estado local a fusão que o servidor acabou de registrar: o perdedor vira alias
     * (`mergedInto`) e as tarefas que apontavam para ele passam a apontar para o keeper. A
     * revisão devolvida é adotada para o próximo flush não cair em conflito (409 → recarga).
     */
    applyMergedPairLocally(keeperId, loserId, revision) {
      const keeperKey = String(keeperId || '').trim();
      const loserKey = String(loserId || '').trim();
      if (keeperKey) {
        const keeper = store.state.intimations.find(record => record.id === keeperKey || record.externalId === keeperKey);
        if (keeper) delete keeper.mergedInto;
      }
      if (loserKey) {
        const loser = store.state.intimations.find(record => record.id === loserKey || record.externalId === loserKey);
        if (loser) {
          loser.mergedInto = keeperKey || loser.mergedInto;
          loser.mergeReviewedBy = windowRef?.KellerAuth?.currentUser?.displayName || 'Advogado';
        }
      }
      if (keeperKey && loserKey) {
        const keeper = store.state.intimations.find(record => record.id === keeperKey || record.externalId === keeperKey);
        const linked = new Set(Array.isArray(keeper?.linkedTaskIds) ? keeper.linkedTaskIds.map(String) : []);
        for (const task of store.state.tasks || []) {
          let moved = false;
          for (const field of ['intimationId', 'sourceIntimationId', 'publicationId']) {
            if (String(task?.[field] || '') === loserKey) {
              task[field] = keeperKey;
              moved = true;
            }
          }
          if (moved && task?.id) linked.add(String(task.id));
        }
        if (keeper && linked.size > 0) keeper.linkedTaskIds = [...linked];
      }
      if (revision) {
        store.revision = revision;
        // `store.js` não entra na cadeia versionada (singleton importado em dezenas de pontos):
        // numa máquina com cópia antiga em cache o método pode não existir, então a adoção da
        // revisão tem o mesmo efeito pelo caminho direto.
        if (typeof store.adoptServerRevision === 'function') {
          store.adoptServerRevision(revision);
        } else if (typeof store.persistenceFingerprint === 'function') {
          store.persistedFingerprint = store.persistenceFingerprint();
        }
      }
      return true;
    },

    /** Saída suave da linha do par antes do re-render (respeita quem pediu menos movimento). */
    async fadeDuplicatePair(key) {
      const row = byId('duplicateReviewPanel')?.querySelector(`[data-duplicate-key="${String(key).replace(/"/g, '')}"]`);
      if (!row || prefersReducedMotion()) return false;
      row.classList.add('is-removing');
      await delay(180);
      return true;
    },

    /**
     * "Descartar sugestão": a pessoa diz que o par **não** é a mesma publicação. O par sai da
     * conferência (volta se o teor mudar) e a decisão vira exemplo do aprendizado do Atrium IA.
     */
    async dismissDuplicatePair(idA, idB, key = '') {
      const a = String(idA || '').trim();
      const b = String(idB || '').trim();
      const pairKey = String(key || '').trim() || [a, b].sort().join('|');
      try {
        const response = await this.securePostJson('/api/ai-classifier/duplicate-dismiss', {
          aId: a,
          bId: b,
          key: pairKey
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          toast(data.message || data.error || 'Não foi possível descartar esta sugestão agora.', 'warning');
          return false;
        }
        duplicateReview = { ...duplicateReview, pairs: duplicateReview.pairs.filter(pair => pair.key !== pairKey) };
        await this.fadeDuplicatePair(pairKey);
        this.renderDuplicateReview();
        toast(data.message || 'Sugestão descartada.', 'success');
        return true;
      } catch (error) {
        toast(error?.message || 'Não foi possível descartar esta sugestão agora.', 'error');
        return false;
      }
    },

    /**
     * "Confirmar tudo": aplica em lote as sugestões em que o Atrium IA viu a **mesma**
     * publicação. A autorização é dada uma vez, no alerta de riscos padrão Atrium — e a pessoa
     * pode marcar "não perguntar novamente". Cada fusão continua unitária no servidor (CAS e
     * idempotente); o resumo no fim diz exatamente o que aconteceu.
     */
    async confirmAllDuplicatePairs() {
      if (duplicateBulkRunning) return null;
      // O lote parte da revisão fresca da conferência: par já fundido em outra aba (ou numa
      // rodada anterior) fazia o clique cair em 409 e consumir uma tentativa à toa.
      await this.loadDuplicateReview();
      const confirmable = duplicateReview.pairs.filter(pair => pair.verdict === 'mesma');
      if (confirmable.length === 0) {
        toast('Nenhuma sugestão de mesma publicação para confirmar agora.', 'info');
        return null;
      }
      const riskConfirm = getRiskConfirm();
      // O diálogo usa os MESMOS rótulos legíveis do painel (data/fonte · processo); sem isso ele
      // mostrava as chaves técnicas de origem (eproc:…) e estourava a largura da janela.
      const rotulosDoPainel = new Map(this.duplicateReviewPanelModel().pairs
        .map(item => [`${item.aId}|${item.bId}`, item]));
      const authorized = await riskConfirm.open({
        count: confirmable.length,
        countLabel: confirmable.length === 1 ? 'publicação duplicada será fundida' : 'pares serão fundidos',
        message: `O Atrium IA apontou ${confirmable.length} ${confirmable.length === 1 ? 'par' : 'pares'} como a mesma publicação. Ao continuar, a fusão é aplicada em lote, com registro na auditoria e possibilidade de revisão posterior.`,
        details: confirmable.slice(0, 5).map(pair => {
          const doPainel = rotulosDoPainel.get(`${pair.aId}|${pair.bId}`) || {};
          return `${doPainel.aLabel || pair.aLabel || 'Publicação cadastrada'} × ${doPainel.bLabel || pair.bLabel || 'Publicação cadastrada'}`;
        })
          .concat(confirmable.length > 5 ? [`… e mais ${confirmable.length - 5}`] : [])
      });
      if (!authorized) {
        toast('Nada foi fundido — a revisão continua manual.', 'info');
        return null;
      }
      duplicateBulkRunning = true;
      this.renderDuplicateReview();
      let merged = 0;
      let alreadyMerged = 0;
      const refused = [];
      try {
        for (const pair of confirmable) {
          const outcome = await this.mergeDuplicatePair(pair.aId, pair.bId);
          if (outcome?.ok) merged += 1;
          else if (outcome?.refusal?.alreadyMerged) alreadyMerged += 1;
          else refused.push(pair.key);
        }
        const remaining = duplicateReview.pairs.filter(pair => pair.verdict === 'mesma').length;
        toast(
          `Confirmação em lote concluída: ${pluralize(merged, 'fundida', 'fundidas')}`
          + `${alreadyMerged ? `, ${pluralize(alreadyMerged, 'já estava fundida e saiu da conferência', 'já estavam fundidas e saíram da conferência')}` : ''}`
          + `${refused.length ? `, ${pluralize(refused.length, 'segue na conferência com o motivo indicado', 'seguem na conferência com o motivo indicado')}` : ''}`
          + `${remaining ? `, ${pluralize(remaining, 'ainda pendente de análise', 'ainda pendentes de análise')}` : ''}.`,
          refused.length ? 'warning' : 'success'
        );
      } finally {
        // Recarrega a revisão de duplicatas ao terminar: o painel passa a refletir o servidor
        // agora, e a marca de recusa só sobrevive para par que continua listado.
        duplicateBulkRunning = false;
        await this.loadDuplicateReview();
        this.renderDuplicateReview();
      }
      return { merged, alreadyMerged, refused };
    },

    renderDuplicateReview() {
      const container = byId('duplicateReviewPanel');
      if (!container) return;
      const model = this.duplicateReviewPanelModel();
      const show = isV2() && model.enabled && model.pairs.length > 0;
      container.classList.toggle('hidden', !show);
      container.innerHTML = show ? renderDuplicateReviewPanel({ panel: model, escapeHtml }) : '';
    },

    async loadDuplicateReview() {
      if (!aiClassifierStatus.enabled) {
        duplicateReview = { enabled: false, pairs: [], loaded: false };
        duplicateReviewRefusals.clear();
        this.renderDuplicateReview();
        return duplicateReview;
      }
      try {
        const response = await windowRef.fetch('/api/ai-classifier/duplicate-candidates', { headers: { Accept: 'application/json' } });
        if (!response.ok) return duplicateReview;
        const data = await response.json().catch(() => ({}));
        duplicateReview = {
          enabled: data?.enabled === true,
          pairs: Array.isArray(data?.pairs) ? data.pairs : [],
          loaded: true
        };
      } catch {
        duplicateReview = { ...duplicateReview, loaded: true };
      }
      // A marca de recusa vale enquanto o par continua na conferência: par que saiu (fundido,
      // descartado ou absorvido) não leva o motivo antigo adiante, que viraria ruído.
      const presentes = new Set(duplicateReview.pairs.map(pair => pair.key));
      for (const key of [...duplicateReviewRefusals.keys()]) {
        if (!presentes.has(key)) duplicateReviewRefusals.delete(key);
      }
      this.renderDuplicateReview();
      return duplicateReview;
    },

    async runDuplicateReview() {
      if (duplicateReviewRunning || !aiClassifierStatus.enabled || !aiClassifierStatus.available) return null;
      duplicateReviewRunning = true;
      this.renderDuplicateReview();
      try {
        const response = await this.securePostJson('/api/ai-classifier/duplicate-check', {});
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Não foi possível analisar os pares agora.');
        if (Number(data?.classified) > 0) {
          toast(`${pluralize(Number(data.classified), 'par analisado para conferência', 'pares analisados para conferência')}.${Number(data.pending) ? ` ${pluralize(Number(data.pending), 'restante', 'restantes')}.` : ''}`, 'success');
        } else if (Number(data?.pending) > 0) {
          toast(`${pluralize(Number(data.pending), 'par segue pendente e não pôde ser analisado agora', 'pares seguem pendentes e não puderam ser analisados agora')}.`, 'warning');
        } else {
          toast('Nenhum par novo para analisar.', 'info');
        }
        await this.loadDuplicateReview();
      } catch (error) {
        toast(error?.message || 'Não foi possível analisar as duplicatas agora.', 'error');
      } finally {
        duplicateReviewRunning = false;
        this.renderDuplicateReview();
      }
      return duplicateReview;
    },

    syncAiClassifierBacklogStatus(message) {
      const element = byId('aiClassifierBacklogStatus');
      if (!element) return;
      element.textContent = message || '';
      element.title = message || '';
      element.classList.toggle('hidden', !message);
    },

    async runAiClassifierBacklog() {
      if (aiClassifierBacklogRunning || !aiClassifierStatus.enabled || !aiClassifierStatus.available) return;
      aiClassifierBacklogRunning = true;
      const button = byId('aiClassifierBacklogButton');
      if (button) button.disabled = true;
      let classified = 0;
      let failed = 0;
      try {
        for (let round = 0; round < 10; round += 1) {
          const response = await this.securePostJson('/api/ai-classifier/triage-backlog', {});
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.message || 'Não foi possível classificar agora.');
          classified += Number(data.classified) || 0;
          failed += Number(data.failed) || 0;
          const pending = Number(data.pending) || 0;
          this.syncAiClassifierBacklogStatus(`Classificando… ${classified} ${classified === 1 ? 'sugestão criada' : 'sugestões criadas'}${pending ? `, ${pending} ${pending === 1 ? 'publicação pendente' : 'publicações pendentes'}` : ''}`);
          if (pending === 0) break;
          if (Number(data.classified) === 0) {
            toast(`${pending} ${pending === 1 ? 'publicação segue pendente e não pôde ser classificada agora' : 'publicações seguem pendentes e não puderam ser classificadas agora'}.`, 'warning');
            break;
          }
        }
        toast(failed
          ? `Triagem concluída: ${pluralize(classified, 'sugestão criada', 'sugestões criadas')} e ${pluralize(failed, 'falha', 'falhas')}.`
          : `Triagem concluída: ${pluralize(classified, 'sugestão criada', 'sugestões criadas')}.`, failed ? 'warning' : 'success');
      } catch (error) {
        toast(error?.message || 'Não foi possível classificar as publicações pendentes.', 'error');
      } finally {
        aiClassifierBacklogRunning = false;
        if (button) button.disabled = false;
        await this.loadAiClassifierSuggestions();
      }
    },

    aiClassifierPanelState(canonicalId) {
      const correcting = aiClassifierCorrecting;
      const customAreas = [...aiClassifierCustomAreas];
      if (!aiClassifierStatus.enabled) return null;
      if (!aiClassifierStatus.available) {
        return { enabled: true, status: 'unavailable', correcting, customAreas, message: aiClassifierStatus.reason || 'Atrium IA indisponível no servidor.' };
      }
      const stored = aiClassifierSuggestions.get(String(canonicalId || ''));
      if (stored) {
        return {
          enabled: true,
          status: 'ready',
          correcting,
          customAreas,
          suggestion: {
            action: stored.areaOrigin === 'humano' || stored.priorityOrigin === 'humano' ? 'suggest' : stored.action,
            origin: stored.areaOrigin === 'humano' || stored.priorityOrigin === 'humano' ? 'humano' : stored.origin || '',
            humanBy: stored.humanBy || '',
            confidence: stored.areaConfidence || 0,
            suggestion: {
              area: { label: stored.area, confidence: stored.areaConfidence || 0, origin: stored.areaOrigin || '' },
              priority: { label: stored.priority, confidence: stored.priorityConfidence || 0, origin: stored.priorityOrigin || '' },
              deadline_signal: { label: stored.deadlineSignal || '' },
              deadline_days: { label: stored.deadlineDays || '' }
            }
          }
        };
      }
      if (aiClassifierCache.has(canonicalId)) {
        const cached = aiClassifierCache.get(canonicalId);
        if (cached && cached.error) return { enabled: true, status: 'error', correcting, customAreas, message: cached.error };
        return { enabled: true, status: 'ready', correcting, customAreas, suggestion: cached.suggestion };
      }
      return { enabled: true, status: 'loading', correcting, customAreas };
    },

    async maybeFetchAiClassifierSuggestion(canonicalId) {
      if (!aiClassifierStatus.enabled || !aiClassifierStatus.available) return;
      if (!canonicalId || aiClassifierCache.has(canonicalId) || aiClassifierInflight.has(canonicalId)) return;
      if (aiClassifierSuggestions.has(String(canonicalId))) return;
      aiClassifierInflight.add(canonicalId);
      try {
        const response = await this.securePostJson('/api/ai-classifier/suggest', { intimationId: canonicalId });
        if (response.status === 409) {
          await this.refreshAiClassifierStatus();
        } else if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          aiClassifierCache.set(canonicalId, { error: errorData.error || errorData.message || 'Não foi possível gerar a sugestão.' });
        } else {
          const data = await response.json();
          aiClassifierCache.set(canonicalId, { suggestion: data.suggestion || null });
        }
      } catch {
        aiClassifierCache.set(canonicalId, { error: 'Não foi possível gerar a sugestão.' });
      } finally {
        aiClassifierInflight.delete(canonicalId);
      }
      if (canonicalIntimationId(selectedIntimation) === canonicalId) this.renderDetail();
    },

    /**
     * Do prazo à providência — três passos, nenhum automático:
     * (1) `suggestProvidence` pede ao Atrium IA a **natureza** da providência (vocabulário fixo) e o
     *     servidor devolve o modelo do catálogo por regra determinística e o vocabulário completo;
     * (2) `applyProvidence` confirma pelo alerta de risco e chama o par de ações oficial (conclui a
     *     conferência e cria a tarefa específica, com prazo em branco), aplicando o resultado no
     *     estado local com a revisão do servidor;
     * (3) `undoProvidence` desfaz pelo mesmo caminho, declarando o que não pôde ser desfeito.
     */
    briefTaskState(canonicalId) {
      const id = String(canonicalId || '');
      const blocked = briefTaskBlocked || readBriefTaskBlocked();
      if (blocked && String(blocked.publicationId) === id) {
        const stillExists = (store.state.tasks || []).some(task => String(task.id) === String(blocked.taskId));
        if (stillExists) {
          briefTaskBlocked = blocked;
          return { undo: null, blocked };
        }
        setBriefTaskBlocked(null);
      }
      const candidate = briefTaskUndo && String(briefTaskUndo.publicationId) === id
        ? briefTaskUndo
        : (store.state.tasks || []).find(task => task
            && task.aiSuggestion
            && String(task.status || '') === 'triagem'
            && task.active !== false
            && !task.absorbedInto
            && [task.intimationId, task.sourceIntimationId].map(String).includes(id));
      if (!candidate) return { undo: null };
      const current = windowRef?.KellerAuth?.currentUser;
      const privileged = current?.role === 'admin' || current?.role === 'master_admin';
      const creator = String(candidate.createdBy || (Array.isArray(candidate.history) ? candidate.history[0]?.actor : '') || '');
      const me = String(current?.username || current?.displayName || '');
      if (creator && !privileged && me && creator !== me) {
        return {
          undo: null,
          blocked: {
            publicationId: id,
            taskId: candidate.taskId || candidate.id,
            title: candidate.title,
            reason: 'Tarefa criada por outra pessoa. Peça a ela para desfazer.'
          }
        };
      }
      return {
        undo: {
          publicationId: id,
          taskId: candidate.taskId || candidate.id,
          title: candidate.title,
          createdBy: creator
        }
      };
    },

    providenceState(intimationId) {
      const id = String(intimationId || '');
      return {
        suggestion: providenceSuggestion && String(providenceSuggestion.intimationId) === id ? providenceSuggestion : null,
        undo: providenceUndo && String(providenceUndo.publicationId) === id ? providenceUndo : null,
        playbook: providencePlaybook && String(providencePlaybook.intimationId) === id ? providencePlaybook : null,
        // Contagem vigente desta publicação: o bloco declara que o prazo vai para a tarefa criada.
        conference: conferenceResult && String(conferenceResult.intimationId) === id
          ? { date: conferenceResult.date, label: conferenceResult.label }
          : null
      };
    },

    /**
     * Playbook do ato: leitura determinística do catálogo do escritório para a publicação aberta.
     * Carrega uma vez por publicação (a marca evita laço com o próprio render).
     */
    async loadPlaybookForPublication(canonicalId) {
      const id = String(canonicalId || '');
      if (!id || providencePlaybookLoadedFor === id) return providencePlaybook;
      providencePlaybookLoadedFor = id;
      try {
        const response = await windowRef.KellerAuth.secureFetch(`/api/ai-classifier/publication-playbook?publicationId=${encodeURIComponent(id)}`, {
          headers: { Accept: 'application/json' }
        });
        if (!response.ok) return null;
        const data = await response.json().catch(() => ({}));
        providencePlaybook = {
          intimationId: String(data.intimationId || id),
          act: String(data.act || ''),
          actLabel: String(data.actLabel || ''),
          reason: String(data.reason || ''),
          note: String(data.note || ''),
          references: Array.isArray(data.references) ? data.references : [],
          items: Array.isArray(data.items) ? data.items : []
        };
        if (canonicalIntimationId(selectedIntimation) === id) this.renderDetail();
        return providencePlaybook;
      } catch {
        return null;
      }
    },

    /** Cria UM item do playbook (rascunho com prazo em branco), pelo alerta de risco. */
    async createProvidenceItem(index) {
      if (providenceRunning) return false;
      const item = (Array.isArray(providencePlaybook?.items) ? providencePlaybook.items : [])[Number(index)];
      const canonicalId = canonicalIntimationId(selectedIntimation);
      if (!item?.definition?.name || !canonicalId) {
        toast('Este item do playbook não tem modelo no catálogo — escolha o modelo na lista.', 'warning');
        return false;
      }
      const autorizado = await getProvidenceRiskConfirm().open({
        count: 1,
        countLabel: 'tarefa será criada a partir do playbook',
        message: `A providência "${item.label}" será criada como tarefa do catálogo (${item.definition.name}). A tarefa nasce sem prazo, o tratamento da publicação não muda e nada é enviado.`,
        note: 'A criação fica na auditoria com o seu nome e pode ser desfeita em seguida.',
        details: [`${item.label} · ${item.definition.name}`],
        copy: {
          title: 'Você tem certeza que deseja criar esta tarefa?',
          acknowledge: 'Compreendo os riscos e desejo continuar',
          cancel: 'Não, vou revisar manualmente',
          skip: 'Não perguntar novamente',
          confirmAll: 'Criar tarefa'
        }
      });
      if (!autorizado) {
        toast('Nada foi criado.', 'info');
        return false;
      }
      return this.createProvidenceTasks([item], canonicalId);
    },

    /** Criação em lote: uma autorização para o lote, criação item a item no servidor. */
    async createProvidenceBatch() {
      if (providenceRunning) return false;
      const itens = (Array.isArray(providencePlaybook?.items) ? providencePlaybook.items : []).filter(item => item?.definition?.name);
      const canonicalId = canonicalIntimationId(selectedIntimation);
      if (!itens.length || !canonicalId) {
        toast('Nenhum item do playbook tem modelo no catálogo — escolha na mão.', 'warning');
        return false;
      }
      const autorizado = await getProvidenceRiskConfirm().open({
        count: itens.length,
        countLabel: itens.length === 1 ? 'tarefa será criada a partir do playbook' : 'tarefas serão criadas a partir do playbook',
        message: `As ${itens.length} providências típicas deste ato serão criadas como tarefas do catálogo. Todas nascem sem prazo, o tratamento da publicação não muda e nada é enviado.`,
        note: 'Cada tarefa fica na auditoria com o seu nome e pode ser desfeita individualmente.',
        details: itens.slice(0, 5).map(item => `${item.label} · ${item.definition.name}`).concat(itens.length > 5 ? [`… e mais ${itens.length - 5}`] : []),
        copy: {
          title: 'Você tem certeza que deseja criar as tarefas do playbook?',
          acknowledge: 'Compreendo os riscos e desejo continuar',
          cancel: 'Não, vou revisar manualmente',
          skip: 'Não perguntar novamente',
          confirmAll: 'Criar tarefas do playbook'
        }
      });
      if (!autorizado) {
        toast('Nada foi criado.', 'info');
        return false;
      }
      return this.createProvidenceTasks(itens, canonicalId, { batch: true });
    },

    async createProvidenceTasks(itens, canonicalId, { batch = false } = {}) {
      providenceRunning = true;
      let criadas = 0;
      let falhas = 0;
      let duplicadas = 0;
      let ultimaCriada = '';
      let ultimaConferencia = '';
      try {
        for (const item of itens) {
          try {
            const response = await this.securePostJson('/api/tasks/from-publication', {
              publicationId: canonicalId,
              action: item.action,
              definitionName: item.definition.name
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
              falhas += 1;
              continue;
            }
            this.applyProvidenceLocally(canonicalId, data);
            if (data.idempotent) duplicadas += 1;
            else criadas += 1;
            ultimaCriada = String(data.task?.id || ultimaCriada);
            ultimaConferencia = String(data.completedTaskId || ultimaConferencia);
          } catch {
            falhas += 1;
          }
        }
        if (ultimaCriada) {
          providenceUndo = {
            publicationId: canonicalId,
            createdTaskId: ultimaCriada,
            conferenceTaskId: ultimaConferencia,
            conferenceConcluded: Boolean(ultimaConferencia)
          };
        }
        const resumo = [
          criadas ? pluralize(criadas, 'tarefa criada', 'tarefas criadas') : '',
          duplicadas ? `${pluralize(duplicadas, 'já existia', 'já existiam')} (nada duplicado)` : '',
          falhas ? pluralize(falhas, 'falha — veja a lista e tente de novo', 'falhas — veja a lista e tente de novo') : ''
        ].filter(Boolean).join(' · ') || 'Nada foi criado';
        toast(`${resumo}. Prazo em branco para o seu preenchimento; o prazo não é alterado por este fluxo.`, falhas ? 'warning' : (criadas ? 'success' : 'info'));
        this.renderDetail();
        return !falhas;
      } finally {
        providenceRunning = false;
      }
    },

    async suggestProvidence() {
      const canonicalId = canonicalIntimationId(selectedIntimation);
      if (!canonicalId) return false;
      const shell = documentRef.querySelector('[data-providence-block]');
      const button = shell?.querySelector('[data-detail-action="suggest-providence"]');
      if (button) button.disabled = true;
      try {
        const response = await this.securePostJson('/api/ai-classifier/suggest-publication-action', { intimationId: canonicalId });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          toast(String(data.message || data.error || 'Não foi possível sugerir a providência agora.'), 'warning');
          return false;
        }
        providenceSuggestion = {
          intimationId: String(data.intimationId || canonicalId),
          action: String(data.action || ''),
          actionLabel: String(data.actionLabel || ''),
          confidence: Number(data.confidence) || 0,
          reason: String(data.reason || ''),
          reasonLabel: String(data.reasonLabel || ''),
          taskDefinition: data.taskDefinition || null,
          actions: Array.isArray(data.actions) ? data.actions : [],
          catalog: Array.isArray(data.catalog) ? data.catalog : []
        };
        providenceUndo = null;
        this.renderDetail();
        return true;
      } catch {
        toast('Não foi possível sugerir a providência agora.', 'error');
        return false;
      } finally {
        if (button?.isConnected) button.disabled = false;
      }
    },

    async applyProvidence() {
      if (providenceRunning) return false;
      const canonicalId = canonicalIntimationId(selectedIntimation);
      const shell = documentRef.querySelector('[data-providence-block]');
      const action = String(shell?.querySelector('[data-providence-action]')?.value || '').trim();
      // O servidor só aceita nome exato do catálogo: envia o oficial da opção escolhida.
      const definitionName = providenceModelChoice(shell).canonical;
      if (!canonicalId || !action || !definitionName) {
        toast('Escolha a providência e o modelo do catálogo antes de confirmar.', 'warning');
        return false;
      }
      const rotulo = providenceSuggestion?.actionLabel || action;
      // Contagem vigente desta publicação: ela vira o prazo da tarefa criada (data humana
      // confirmada na contagem). Sem contagem, a tarefa nasce em branco, como antes.
      const conferencia = conferenceResult && String(conferenceResult.intimationId) === String(canonicalId) ? conferenceResult : null;
      const frasePrazo = conferencia?.date
        ? `A tarefa nasce com o prazo calculado na conferência (${conferencia.label}) — ajuste na tarefa se precisar.`
        : 'A tarefa nasce sem prazo.';
      // Alerta de risco padrão do Atrium: cria tarefa e conclui a conferência no mesmo ato.
      const autorizado = await getProvidenceRiskConfirm().open({
        count: 1,
        countLabel: 'tarefa será criada e a conferência desta publicação será concluída',
        message: `A providência "${rotulo}" será criada como tarefa do catálogo e a tarefa de conferência desta publicação será concluída. ${frasePrazo} O tratamento da publicação não muda e nada é enviado.`,
        note: 'A criação fica na auditoria com o seu nome e pode ser desfeita em seguida; a conferência volta a ficar pendente se nada tiver sido trabalhado.',
        details: [`${rotulo} · ${definitionName}`, ...(conferencia?.date ? [`Prazo aplicado: ${conferencia.label}`] : [])],
        copy: {
          title: 'Você tem certeza que deseja criar a tarefa e concluir a conferência?',
          acknowledge: 'Compreendo os riscos e desejo continuar',
          cancel: 'Não, vou revisar manualmente',
          skip: 'Não perguntar novamente',
          confirmAll: 'Criar tarefa e concluir conferência'
        }
      });
      if (!autorizado) {
        toast('Nada foi criado — a conferência continua como estava.', 'info');
        return false;
      }
      providenceRunning = true;
      try {
        const response = await this.securePostJson('/api/tasks/from-publication', {
          publicationId: canonicalId,
          action,
          definitionName,
          // O prazo da contagem vai junto quando existe; o servidor grava com a origem da
          // conferência e nunca ajusta a data por conta própria.
          ...(conferencia?.date ? { deadline: conferencia.date } : {})
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          toast(String(data.message || data.error || 'Não foi possível criar a tarefa agora.'), 'warning');
          return false;
        }
        this.applyProvidenceLocally(canonicalId, data);
        const conferenciaConcluida = Boolean(data.completedTaskId);
        providenceUndo = {
          publicationId: canonicalId,
          createdTaskId: String(data.task?.id || ''),
          conferenceTaskId: String(data.completedTaskId || ''),
          conferenceConcluded: conferenciaConcluida
        };
        toast(String(data.message || 'Tarefa criada.'), conferenciaConcluida ? 'success' : 'info');
        this.renderDetail();
        // Calibração do escritório: só a escolha DIFERENTE da sugestão é correção humana — aceitar
        // a sugestão não pode virar exemplo (senão o modelo aprende a própria saída como padrão e
        // passa a vencer a leitura nova). Não bloqueia a ação.
        if (providenceSuggestion && action !== providenceSuggestion.action) {
          void this.securePostJson('/api/ai-classifier/correct', {
            schemaId: 'publication_action',
            questionKey: 'action',
            label: action,
            intimationId: canonicalId
          }).catch(() => {});
        }
        return true;
      } catch {
        toast('Não foi possível criar a tarefa agora.', 'error');
        return false;
      } finally {
        providenceRunning = false;
      }
    },

    async undoProvidence() {
      const registro = providenceUndo;
      if (!registro?.createdTaskId) return false;
      try {
        const response = await this.securePostJson('/api/tasks/from-publication/undo', {
          createdTaskId: registro.createdTaskId,
          // A conferência vai junto: se a tarefa criada sumiu do acervo, o servidor ainda devolve a
          // conferência ao fluxo em vez de deixar o par meio-aplicado.
          conferenceTaskId: registro.conferenceTaskId || ''
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          toast(String(data.message || data.error || 'Não foi possível desfazer agora.'), 'warning');
          return false;
        }
        this.applyProvidenceUndoLocally(registro.publicationId, registro.createdTaskId, data);
        providenceUndo = null;
        toast(String(data.message || 'Providência desfeita.'), data.removed === false ? 'warning' : 'success');
        this.renderDetail();
        return true;
      } catch {
        toast('Não foi possível desfazer agora.', 'error');
        return false;
      }
    },

    applyProvidenceLocally(publicationId, data) {
      // O servidor devolve os dois registros como ficaram gravados (conferência concluída e tarefa
      // criada): o espelho local usa exatamente esses objetos, então o próximo flush não apaga a
      // autoria nem o histórico que o servidor registrou.
      const sincronizar = registro => {
        if (!registro || !registro.id) return;
        if (typeof store.upsert === 'function') {
          store.upsert('tasks', registro);
          return;
        }
        const existente = store.state.tasks.find(task => String(task.id) === String(registro.id));
        if (existente) Object.assign(existente, registro);
        else store.state.tasks.unshift(registro);
      };
      sincronizar(data?.conferenceTask);
      sincronizar(data?.task);
      const publicacao = (store.state.intimations || []).find(item => String(item.id) === String(publicationId));
      if (publicacao && data?.task?.id) {
        publicacao.linkedTaskIds = [...new Set([...(Array.isArray(publicacao.linkedTaskIds) ? publicacao.linkedTaskIds : []), String(data.task.id)])];
        publicacao.taskId = String(data.task.id);
      }
      this.adoptProvidenceRevision(data?.revision);
    },

    applyProvidenceUndoLocally(publicationId, createdTaskId, data) {
      if (data?.removed) {
        store.state.tasks = store.state.tasks.filter(task => String(task.id) !== String(createdTaskId));
        const publicacao = (store.state.intimations || []).find(item => String(item.id) === String(publicationId));
        if (publicacao) {
          publicacao.linkedTaskIds = (Array.isArray(publicacao.linkedTaskIds) ? publicacao.linkedTaskIds : [])
            .filter(id => String(id) !== String(createdTaskId));
          if (String(publicacao.taskId || '') === String(createdTaskId)) publicacao.taskId = publicacao.linkedTaskIds[0] || '';
        }
      }
      // Reabre apenas a conferência que o servidor devolveu: uma tarefa concluída por pessoa
      // (ou por outro fluxo) não é tocada pelo espelho local.
      const conferenciaDevolvida = data?.conferenceTask;
      if (conferenciaDevolvida?.id) {
        if (typeof store.upsert === 'function') {
          store.upsert('tasks', conferenciaDevolvida);
        } else {
          const conferencia = store.state.tasks.find(task => String(task.id) === String(conferenciaDevolvida.id));
          if (conferencia) Object.assign(conferencia, conferenciaDevolvida);
        }
      }
      this.adoptProvidenceRevision(data?.revision);
    },

    adoptProvidenceRevision(revision) {
      if (!revision) return;
      store.revision = revision;
      if (typeof store.adoptServerRevision === 'function') store.adoptServerRevision(revision);
      else if (typeof store.persistenceFingerprint === 'function') store.persistedFingerprint = store.persistenceFingerprint();
    },

    async refreshAiClassifierSuggestion() {
      const canonicalId = canonicalIntimationId(selectedIntimation);
      if (!canonicalId) return;
      aiClassifierCache.delete(canonicalId);
      await this.maybeFetchAiClassifierSuggestion(canonicalId);
    },

    /**
     * Corrige a sugestão do classificador com o rótulo que a pessoa sabe ser o certo. A
     * correção vence no painel (o modelo não sobrescreve) e vira exemplo de calibração para
     * as próximas classificações do escritório.
     */
    async correctAiClassifierLabel(questionKey, label, { customArea = false } = {}) {
      const canonicalId = canonicalIntimationId(selectedIntimation);
      const key = String(questionKey || '').trim();
      const value = String(label || '').trim();
      if (!canonicalId || !key || !value) return false;
      try {
        const response = await this.securePostJson('/api/ai-classifier/correct', {
          schemaId: 'publication_triage',
          questionKey: key,
          label: value,
          intimationId: canonicalId,
          // Área nomeada ("Outra área" com nome): o servidor registra a área no escritório.
          ...(customArea ? { custom: true } : {})
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          toast(data.error || data.message || 'Não foi possível registrar a correção agora.', 'warning');
          return false;
        }
        aiClassifierCorrecting = '';
        if (Array.isArray(data.customAreas)) aiClassifierCustomAreas = data.customAreas.map(String).filter(Boolean);
        const canonicalLabel = String(data.label || value);
        const cached = aiClassifierCache.get(canonicalId);
        const suggestion = cached?.suggestion || null;
        if (suggestion && suggestion.suggestion) {
          aiClassifierCache.set(canonicalId, {
            suggestion: {
              ...suggestion,
              origin: 'humano',
              humanBy: '',
              action: 'suggest',
              suggestion: {
                ...suggestion.suggestion,
                [key]: { label: canonicalLabel, confidence: 1, origin: 'humano' }
              }
            }
          });
        } else {
          aiClassifierCache.delete(canonicalId);
        }
        await this.loadAiClassifierSuggestions();
        toast(data.message || 'Correção registrada.', 'success');
        this.renderInbox();
        this.renderDetail();
        return true;
      } catch (error) {
        toast(error?.message || 'Não foi possível registrar a correção agora.', 'error');
        return false;
      }
    },

    openDiscardModal(item) {
      if (!item) return;
      byId('discardPublicationIdInput').value = item.id;
      byId('discardPublicationProcessRef').textContent = item.process || 'Sem processo vinculado';
      byId('discardPublicationTitleRef').textContent = item.title || 'Publicação';
      byId('discardReasonInput').value = '';
      if (!getPresenter().openOverlay('discardPublicationBackdrop', 'discardReasonInput')) {
        byId('discardPublicationBackdrop').classList.remove('hidden');
        byId('discardReasonInput').focus();
      }
    },
    closeDiscardModal() {
      if (!getPresenter().closeOverlay('discardPublicationBackdrop')) byId('discardPublicationBackdrop')?.classList.add('hidden');
    },
    openTreatModal(item) {
      if (!item) return;
      byId('treatPublicationIdInput').value = item.id;
      byId('treatPublicationProcessRef').textContent = item.process || 'Sem processo vinculado';
      byId('treatPublicationTitleRef').textContent = item.title || 'Publicação';
      byId('treatNoteInput').value = '';
      if (!getPresenter().openOverlay('treatPublicationBackdrop', 'treatNoteInput')) {
        byId('treatPublicationBackdrop').classList.remove('hidden');
        byId('treatNoteInput').focus();
      }
    },
    closeTreatModal() {
      if (!getPresenter().closeOverlay('treatPublicationBackdrop')) byId('treatPublicationBackdrop')?.classList.add('hidden');
    },

    openPublicationsEmailModal() {
      currentEmailBulletin = null;
      const preview = byId('emailPreviewContainer');
      if (preview) preview.innerHTML = `<div style="padding:24px;text-align:center;color:#64748b;">${iconSvg('info')} Informe o destinatário e confirme o envio manual para gerar o boletim com dados oficiais do servidor.</div>`;
      if (!getPresenter().openOverlay('publicationsEmailModalBackdrop', 'emailTargetAddress')) {
        byId('publicationsEmailModalBackdrop')?.classList.remove('hidden');
      }
    },
    closePublicationsEmailModal() {
      if (!getPresenter().closeOverlay('publicationsEmailModalBackdrop')) byId('publicationsEmailModalBackdrop')?.classList.add('hidden');
    },

    async sendBatchEmail() {
      const recipient = byId('emailTargetAddress')?.value?.trim();
      if (!recipient) return toast('Informe um e-mail de destino.', 'error');
      const publicationIds = this.filteredItems().map(item => item?.id || item?.externalId).filter(Boolean);
      if (!publicationIds.length) return toast('Nenhuma publicação foi selecionada para o boletim.', 'error');
      const sendButton = byId('btnSendEmailDirect');
      if (sendButton) {
        sendButton.disabled = true;
        sendButton.textContent = 'Enviando…';
      }
      toast('Processando envio do boletim de publicações…');
      try {
        const batchBody = JSON.stringify({ recipient, publicationIds });
        const response = await windowRef.KellerAuth.secureFetch('/api/publications/email/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Idempotency-Key': emailAttempt.for(batchBody) },
          body: batchBody
        });
        emailAttempt.settle();
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || 'Falha no envio.');
        currentEmailBulletin = data;
        const preview = byId('emailPreviewContainer');
        if (preview) preview.innerHTML = data.emailHtml ? sanitizeRichHtml(data.emailHtml) : '<div style="padding:16px;">Boletim enviado com sucesso.</div>';
        toast(data.message || 'Boletim enviado com sucesso!', 'success');
      } catch (error) {
        toast(`Erro na requisição: ${error.message}`, 'error');
      } finally {
        if (sendButton) {
          sendButton.disabled = false;
          sendButton.innerHTML = `${iconSvg('send')} Enviar e-mail`;
        }
      }
    },

    async copyEmailBulletin() {
      if (!currentEmailBulletin?.emailHtml) return toast('Nenhum conteúdo para copiar.', 'error');
      try {
        const htmlBlob = new Blob([currentEmailBulletin.emailHtml], { type: 'text/html' });
        const textBlob = new Blob([currentEmailBulletin.emailText || ''], { type: 'text/plain' });
        await navigatorRef.clipboard.write([new ClipboardItem({ 'text/html': htmlBlob, 'text/plain': textBlob })]);
        toast('HTML e texto do e-mail copiados com sucesso!', 'success');
      } catch {
        await navigatorRef.clipboard.writeText(currentEmailBulletin.emailText || '');
        toast('Texto do e-mail copiado com sucesso!', 'success');
      }
    },

    downloadEmailBulletin() {
      if (!currentEmailBulletin?.emailHtml) return toast('Gere o boletim primeiro.', 'error');
      const blob = new Blob([currentEmailBulletin.emailHtml], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = documentRef.createElement('a');
      anchor.href = url;
      anchor.download = `boletim-publicacoes-${isoDate()}.html`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast('Arquivo HTML baixado com sucesso.', 'success');
    },

    openPublicationEmailModal(item) {
      if (!item) return;
      const backdrop = byId('publicationEmailBackdrop');
      if (!backdrop) return;
      const idInput = byId('publicationEmailIdInput');
      const reference = byId('publicationEmailRef');
      const recipient = byId('publicationEmailRecipientInput');
      const submitButton = byId('publicationEmailSubmitBtn');
      if (idInput) idInput.value = item.id;
      if (reference) reference.textContent = item.process || item.number || item.title || 'Publicação judicial';
      if (recipient) recipient.value = '';
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = 'Enviar';
      }
      if (!getPresenter().openOverlay('publicationEmailBackdrop', 'publicationEmailRecipientInput')) {
        backdrop.classList.remove('hidden');
        documentRef.body.style.overflow = 'hidden';
        if (recipient) windowRef.setTimeout(() => recipient.focus(), 50);
      }
    },

    closePublicationEmailModal() {
      if (!getPresenter().closeOverlay('publicationEmailBackdrop')) {
        byId('publicationEmailBackdrop')?.classList.add('hidden');
        if (byId('modalBackdrop')?.classList.contains('hidden')) documentRef.body.style.overflow = '';
      }
    },

    async submitPublicationEmail(event) {
      event?.preventDefault();
      const publicationId = byId('publicationEmailIdInput')?.value;
      const recipient = byId('publicationEmailRecipientInput')?.value?.trim();
      const submitButton = byId('publicationEmailSubmitBtn');
      if (!publicationId) return toast('Identificador da publicação não encontrado.', 'error');
      if (!recipient) return toast('Informe o endereço de e-mail do destinatário.', 'warning');
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Enviando...';
      }
      try {
        const singleBody = JSON.stringify({ publicationId, recipient });
        const response = await windowRef.KellerAuth.secureFetch('/api/intimations/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': emailAttempt.for(singleBody) },
          body: singleBody
        });
        emailAttempt.settle();
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.message || 'Falha ao enviar publicação por e-mail.');
        this.closePublicationEmailModal();
        toast('Publicação enviada por e-mail.', 'success');
      } catch (error) {
        toast(error.message || 'Falha ao enviar publicação.', 'error');
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = 'Enviar';
        }
      }
    },

    classifyAct: classifyIntimationAct,
    formatAge: formatPublicationAge
  };

  return feature;
}

const DECISION_ALLOWED_TAGS = new Set(['div', 'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'blockquote', 'pre', 'code', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'small', 'sup', 'sub']);
const DECISION_VOID_TAGS = new Set(['br', 'hr']);
const DECISION_DROP_BLOCKS = /<(script|style|iframe|object|embed|svg|math|form|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const DECISION_PRINT_SCRIPT = 'document.getElementById("atriumPrintButton").addEventListener("click",()=>window.print());';
const DECISION_PRINT_SCRIPT_HASH = 'sha256-sbLN3vQEeoXLrUDEBUBEBdZ1E+CUvPfZi7GMxPaw9L0=';

export function sanitizeDecisionHtml(rawHtml, escapeHtmlFn = defaultEscapeHtml) {
  let source = String(rawHtml || '').slice(0, 200_000);
  let previous;
  do {
    previous = source;
    source = source.replace(DECISION_DROP_BLOCKS, '');
  } while (source !== previous);
  source = source.replace(/<!--([\s\S]*?)-->/g, '');
  return source.replace(/<\/?([a-z][a-z0-9-]*)([^>]*)>|</gi, (match, rawTag, rawAttributes) => {
    if (match === '<') return '&lt;';
    const tag = rawTag.toLowerCase();
    if (!DECISION_ALLOWED_TAGS.has(tag)) return '';
    const closing = /^<\//.test(match);
    if (closing) return DECISION_VOID_TAGS.has(tag) ? '' : `</${tag}>`;
    const attributes = [];
    String(rawAttributes || '').replace(/\b(colspan|rowspan)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi, (_whole, name, doubleQuoted, singleQuoted, bare) => {
      const value = Number(doubleQuoted ?? singleQuoted ?? bare);
      if (Number.isInteger(value) && value >= 1 && value <= 100) attributes.push(`${name.toLowerCase()}="${value}"`);
      return '';
    });
    if (/\bscope\s*=\s*(?:"(row|col|rowgroup|colgroup)"|'(row|col|rowgroup|colgroup)'|(row|col|rowgroup|colgroup))/i.test(rawAttributes || '')) {
      const scope = RegExp.$1 || RegExp.$2 || RegExp.$3;
      attributes.push(`scope="${escapeHtmlFn(scope)}"`);
    }
    return `<${tag}${attributes.length ? ` ${attributes.join(' ')}` : ''}>`;
  });
}

export function generateDecisionHtmlDocument(item, escapeHtmlFn = defaultEscapeHtml) {
  const title = escapeHtmlFn(item?.title || 'Decisão judicial');
  const court = escapeHtmlFn(item?.court || item?.source || 'Origem judicial não informada');
  const process = escapeHtmlFn(item?.process || 'Processo não identificado');
  const parties = escapeHtmlFn(item?.client || 'Partes não identificadas');
  const publishedAt = escapeHtmlFn(String(item?.publishedAt || 'Data não informada').slice(0, 40));
  const disponibilizadoEm = item?.disponibilizadoEm && item.disponibilizadoEm !== item.publishedAt
    ? escapeHtmlFn(String(item.disponibilizadoEm).slice(0, 40))
    : '';
  const content = sanitizeDecisionHtml(item?.rawHtml || '', escapeHtmlFn) || `<pre>${escapeHtmlFn(item?.text || 'Sem conteúdo.')}</pre>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src '${DECISION_PRINT_SCRIPT_HASH}'; img-src data:; base-uri 'none'; form-action 'none'"><title>${title}</title><style>:root{color-scheme:light dark;font-family:Georgia,'Times New Roman',serif;background:#f4f1eb;color:#222}*{box-sizing:border-box}body{margin:0;padding:clamp(16px,4vw,48px)}main{max-width:960px;margin:auto;background:Canvas;color:CanvasText;border:1px solid color-mix(in srgb,CanvasText 18%,transparent);border-radius:12px;padding:clamp(20px,5vw,56px);box-shadow:0 18px 55px rgba(0,0,0,.14)}header{padding-bottom:20px;border-bottom:2px solid #aa8538;margin-bottom:28px}header span{font:700 12px/1.2 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#9a741f}h1{font-size:clamp(24px,5vw,42px);margin:8px 0 12px}dl{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 24px;margin:0;font:14px/1.5 Arial,sans-serif}dt{font-weight:700;color:#78683f}dd{margin:0}.print-action{margin-top:18px;border:1px solid #aa8538;border-radius:8px;padding:10px 14px;background:#aa8538;color:#fff;font:700 14px/1 Arial,sans-serif;cursor:pointer}article{line-height:1.65;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;display:block;overflow-x:auto}th,td{border:1px solid #8b8b8b;padding:8px;text-align:left}pre{white-space:pre-wrap;font:inherit}@media(max-width:640px){dl{grid-template-columns:1fr}}@media print{body{padding:0;background:#fff}main{max-width:none;border:0;box-shadow:none;padding:0}.print-action{display:none}}</style></head><body><main><header><span>ATRIUM · Conteúdo judicial preservado</span><h1>${title}</h1><dl><div><dt>Tribunal / origem</dt><dd>${court}</dd></div><div><dt>Processo</dt><dd>${process}</dd></div><div><dt>Partes</dt><dd>${parties}</dd></div><div><dt>Publicação</dt><dd>${publishedAt}</dd></div>${disponibilizadoEm ? `<div><dt>Disponibilização</dt><dd>${disponibilizadoEm}</dd></div>` : ''}</dl><button class="print-action" type="button" id="atriumPrintButton">Imprimir / salvar em PDF</button></header><article>${content}</article></main><script>${DECISION_PRINT_SCRIPT}</script></body></html>`;
}

/**
 * Rótulos humanos para a recusa de fusão. O servidor responde 409 com `code: 'MERGE_REFUSED'`
 * quando o par é recusado por decisão do domínio (já fundido, conflito de tratamento, registro
 * ausente); 409 **sem** esse código é revisão velha — corrida de gravação que o caminho de par
 * repete após ressincronizar. Os dois desfechos são diferentes para quem opera: um sai da
 * conferência, o outro permanece marcado com o motivo.
 */
const DUPLICATE_REFUSAL_LABELS = Object.freeze({
  'ja-fundido': 'Já estava fundida',
  'treatment-conflict': 'Conflito de teor: uma tratada e outra descartada',
  'registro-ausente': 'Registro removido',
  'mesmo-registro': 'O par aponta para o mesmo registro',
  'keeper-indisponivel': 'Nenhum registro do par pode ser o oficial',
  'estado-ausente': 'O acervo ainda não foi inicializado',
  'revisao-velha': 'O acervo mudou durante a fusão'
});

function duplicateRefusalOf(data, status) {
  if (Number(status) !== 409) return null;
  const code = String(data?.code || '').trim();
  const reason = String(data?.reason || '').trim();
  const detail = String(data?.message || data?.error || '').trim();
  if (code === 'MERGE_REFUSED') {
    const chave = reason || 'recusado';
    return {
      reason: chave,
      label: DUPLICATE_REFUSAL_LABELS[chave] || 'Recusada pelo servidor',
      detail,
      alreadyMerged: chave === 'ja-fundido'
    };
  }
  return {
    reason: 'revisao-velha',
    label: DUPLICATE_REFUSAL_LABELS['revisao-velha'],
    detail,
    alreadyMerged: false
  };
}

function defaultEscapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function resolvePublicationProcess(state, item) {
  const direct = (state.processes || []).find(process => String(process.id) === String(item.processId || ''));
  if (direct) return direct;
  const cnj = String(item.process || '').replace(/\D/g, '');
  return cnj ? (state.processes || []).find(process => String(process.number || '').replace(/\D/g, '') === cnj) || null : null;
}

function normalizedContactName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function meaningfulProcessClient(value) {
  const name = String(value || '').trim();
  return name !== '' && !/^cliente n[aã]o informado$/i.test(name);
}

function uniqueContactByName(contacts, value) {
  const name = normalizedContactName(value);
  if (!name) return null;
  const matches = contacts.filter(contact => normalizedContactName(contact.name) === name);
  return matches.length === 1 ? matches[0] : null;
}

function resolvePublicationContact(state, item) {
  const contacts = Array.isArray(state.contacts) ? state.contacts : [];
  const directId = item.contactId || item.clientContactId;
  const direct = contacts.find(contact => String(contact.id) === String(directId || ''));
  if (direct) return direct;

  const process = resolvePublicationProcess(state, item);
  if (process && meaningfulProcessClient(process.client)) {
    const clientName = String(process.client).trim();
    return uniqueContactByName(contacts, clientName) || { id: '', name: clientName };
  }
  if (process?.contactId) {
    const linked = contacts.find(contact => String(contact.id) === String(process.contactId) && contact.contactRole === 'cliente');
    if (linked?.name) return linked;
  }
  const number = String(process?.number || process?.protocol || '').replace(/\D/g, '');
  if (number) {
    const related = contacts.filter(contact => contact.contactRole === 'cliente'
      && (contact.relatedProcessNumbers || []).some(value => String(value || '').replace(/\D/g, '') === number));
    if (related.length === 1) return related[0];
  }

  return uniqueContactByName(contacts, item.client);
}
