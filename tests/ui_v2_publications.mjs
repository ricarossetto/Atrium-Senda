import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPublicationsFeature, filterPublications, findIntimationRecord, isActiveIntimation } from '../js/features/publications.js';
import { isDetailControlEdited, publicationCaptureDate, renderPublicationDetail, renderPublicationRow } from '../js/views/ui-v2/publications-presenter.js';
import { prepareUiV2Page, prepareUiV2PublicationsFixture, startUiV2Session } from './ui_v2_helpers.mjs';

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');
const formatDate = value => value || '—';
const formatDateTime = value => value || 'Nunca';
const formatAge = () => 'Hoje';
const unitItem = {
  id: 'publication-unit', title: 'Título <sintético>', process: '5000000-00.2026.8.21.0001',
  court: 'TJRS & Unidade', source: 'DJEN', publishedAt: '2026-08-30',
  text: 'Texto oficial\ncom 15 dias sem prazo cadastrado.', treatmentStatus: 'untreated', unread: true, urgent: true,
  hasHtml: true, rawHtml: '<p>Conteúdo <strong>HTML</strong> sintético.</p>'
};
const unitAct = { label: 'Manifestação', css: 'act-manifestacao' };
const legacyDomicilio = renderPublicationRow({
  item: { ...unitItem, type: 'domicilio', publishedAt: '', disponibilizadoEm: '2026-10-20', text: '<!DOCTYPE html><html><head>...', fullTextSource: 'domicilio', fullText: '<html><head><title>Ignorar</title></head><body><p>Processo sigiloso</p><p>Consulte os autos &amp; documentos.</p></body></html>', sourceReportedDeadlineSource: 'pje', sourceReportedDeadlineAt: '2026-11-23' },
  act: unitAct, parties: '', selected: false, escapeHtml, formatDate, formatAge
});
assert.match(legacyDomicilio, /Processo sigiloso Consulte os autos &amp; documentos/);
assert.doesNotMatch(legacyDomicilio, /DOCTYPE|&lt;html|Ignorar/);
assert.match(legacyDomicilio, /PJe informou 2026-11-23/);
assert.match(legacyDomicilio, /Disponibilização/);
const unitRow = renderPublicationRow({ item: unitItem, act: unitAct, parties: 'Cliente Sintético', selected: false, escapeHtml, formatDate, formatAge });
assert.match(unitRow, /Não lida/);
assert.match(unitRow, /Não tratada/);
assert.match(unitRow, /Título &lt;sintético&gt;/);
assert.match(unitRow, /aria-controls="intimationDetail"/);
assert.match(unitRow, /<div class="publication-record-shell" data-intimation-id="publication-unit">/, 'A raiz da linha deve ser um container, sem botão aninhado.');
assert.match(unitRow, /<button type="button" class="inbox-row v2-publication-record publication-record-open [^"]*" aria-controls="intimationDetail" aria-pressed="false"/, 'O controle de abrir deve ser focável e anunciar o estado.');
assert.match(unitRow, /data-row-action="mark_treated"/, 'Publicação não tratada deve oferecer a ação rápida de tratar.');
assert.match(unitRow, /data-publication-id="publication-unit"/);
assert.match(unitRow, /aria-label="Marcar como tratada sem abrir"/);
assert.match(unitRow, /href="assets\/icons\/atrium-ui-icons\.svg(?:\?v=[^"#]+)?#atrium-icon-check"/, 'A ação rápida deve usar o SVG oficial, sem emoji ou glyph.');
assert.doesNotMatch(unitRow, /<button[^>]*>\s*<button/, 'Nenhum botão pode conter outro botão.');

const reviewUnitRow = renderPublicationRow({ item: { ...unitItem, id: 'publication-review', treatmentStatus: 'in_review' }, act: unitAct, parties: 'Cliente Sintético', selected: false, escapeHtml, formatDate, formatAge });
assert.match(reviewUnitRow, /data-row-action="mark_treated"/, 'Publicação em análise também aceita a ação rápida.');
for (const status of ['treated', 'discarded']) {
  const closedRow = renderPublicationRow({ item: { ...unitItem, id: `publication-${status}`, treatmentStatus: status }, act: unitAct, parties: 'Cliente Sintético', selected: false, escapeHtml, formatDate, formatAge });
  assert.doesNotMatch(closedRow, /data-row-action="mark_treated"/, `Publicação ${status} não pode expor ação rápida de tratar.`);
}

assert.equal(publicationCaptureDate({ sourceCollectedAt: 'coleta', firstSeenAt: 'primeira', createdAt: 'criacao' }), 'coleta', 'A coleta da fonte é a data de captura oficial.');
assert.equal(publicationCaptureDate({ firstSeenAt: 'primeira', createdAt: 'criacao' }), 'primeira', 'Sem coleta, a primeira visualização é a captura.');
assert.equal(publicationCaptureDate({ createdAt: 'criacao' }), 'criacao', 'Sem coleta e sem primeira visualização, o registro usa a criação.');
assert.equal(publicationCaptureDate({}), '', 'Sem data conhecida, a linha não inventa captura.');

{
  const control = props => ({ matches: selector => selector === 'input, textarea' && ['INPUT', 'TEXTAREA'].includes(props.tagName), ...props });
  assert.equal(isDetailControlEdited(null), false, 'Sem elemento, nada é considerado editado.');
  assert.equal(
    isDetailControlEdited(control({ tagName: 'BUTTON', type: 'button', value: 'x', defaultValue: undefined })),
    false,
    'Botão tem .value mas não .defaultValue; não pode ser marcado como editado a cada re-render.'
  );
  assert.equal(isDetailControlEdited(control({ tagName: 'INPUT', type: 'text', value: 'igual', defaultValue: 'igual' })), false, 'Campo inalterado não é edição.');
  assert.equal(isDetailControlEdited(control({ tagName: 'INPUT', type: 'text', value: 'novo', defaultValue: 'antigo' })), true, 'Campo alterado é edição.');
  assert.equal(isDetailControlEdited(control({ tagName: 'INPUT', type: 'checkbox', checked: true, defaultChecked: true })), false, 'Checkbox no estado padrão não é edição.');
  assert.equal(isDetailControlEdited(control({ tagName: 'INPUT', type: 'checkbox', checked: false, defaultChecked: true })), true, 'Checkbox alterado é edição.');
  assert.equal(isDetailControlEdited(control({ tagName: 'TEXTAREA', value: 'novo', defaultValue: 'antigo' })), true, 'Textarea alterada é edição.');
  const select = (selectedIndex, defaults) => control({ tagName: 'SELECT', selectedIndex, options: defaults.map(defaultSelected => ({ defaultSelected })) });
  assert.equal(isDetailControlEdited(select(0, [true, false])), false, 'Select na opção padrão marcada não é edição.');
  assert.equal(isDetailControlEdited(select(1, [true, false])), true, 'Select fora da opção padrão marcada é edição.');
  assert.equal(isDetailControlEdited(select(0, [false, true])), true, 'Select na primeira opção quando o padrão marcado é outra é edição.');
  assert.equal(isDetailControlEdited(select(0, [false, false])), false, 'Select sem marcação explícita assume a primeira opção.');
  assert.equal(isDetailControlEdited(select(2, [false, false])), true, 'Select sem marcação explícita fora da primeira opção é edição.');
}

const captureRow = renderPublicationRow({
  item: { ...unitItem, id: 'publication-capture', sourceCollectedAt: '2026-08-30T14:05:00.000Z' },
  act: unitAct, parties: 'Cliente Sintético', selected: false, escapeHtml,
  formatDate: () => '30/08/2026', formatDateTime: () => '30/08/2026 14:05', formatAge
});
assert.match(captureRow, /Capturada em 30\/08\/2026 14:05/, 'A primeira linha deve rotular a data da captura com hora.');
assert.match(captureRow, /5000000-00\.2026\.8\.21\.0001/);
assert.match(captureRow, /Cliente Sintético/);

const dateOnlyCaptureRow = renderPublicationRow({
  item: { ...unitItem, id: 'publication-capture-date', createdAt: '2026-08-29' },
  act: unitAct, parties: 'Cliente Sintético', selected: false, escapeHtml,
  formatDate: value => `data:${value}`, formatDateTime: () => 'hora-indevida', formatAge
});
assert.match(dateOnlyCaptureRow, /Capturada em data:2026-08-29/);
assert.doesNotMatch(dateOnlyCaptureRow, /hora-indevida/, 'Captura sem hora não pode fabricar horário.');

const eprocDeadlineRow = renderPublicationRow({
  item: { ...unitItem, id: 'publication-deadline', sourceReportedDeadlineAt: '2026-09-12', deadlineSource: 'eproc' },
  act: unitAct, parties: 'Cliente Sintético', selected: false, escapeHtml,
  formatDate: value => `data:${value}`, formatDateTime: () => 'x', formatAge
});
assert.match(eprocDeadlineRow, /class="publication-source-deadline"/);
assert.match(eprocDeadlineRow, /Prazo do eproc: data:2026-09-12/, 'O chip deve exibir o prazo da fonte oficial no modo automático.');
const manualDeadlineRow = renderPublicationRow({
  item: { ...unitItem, id: 'publication-deadline-manual', sourceReportedDeadlineAt: '2026-09-12' },
  act: unitAct, parties: 'Cliente Sintético', selected: false, escapeHtml,
  formatDate: value => `data:${value}`, formatDateTime: () => 'x', formatAge
});
assert.match(manualDeadlineRow, /Eproc informou data:2026-09-12 · conferir/, 'No modo manual o chip deve pedir conferência.');
const domicilioDeadlineRow = renderPublicationRow({
  item: { ...unitItem, id: 'publication-deadline-domicilio', sourceReportedDeadlineAt: '2026-09-25', sourceReportedDeadlineSource: 'domicilio', noticeDeadlineAt: '2026-09-23' },
  act: unitAct, parties: 'Cliente Sintético', selected: false, escapeHtml,
  formatDate: value => `data:${value}`, formatDateTime: () => 'x', formatAge
});
assert.match(domicilioDeadlineRow, /Domicílio Eletrônico informou data:2026-09-25 · conferir/, 'A referência do Domicílio nomeia a fonte real, nunca o eproc.');
assert.doesNotMatch(domicilioDeadlineRow, /Prazo do domicilio:/, 'Referência do Domicílio nunca aparece como prazo aplicado.');
assert.doesNotMatch(eprocDeadlineRow, /prazo fatal/i, 'A data informada pelo eproc não pode virar prazo fatal.');
assert.doesNotMatch(eprocDeadlineRow, /(?:danger|warning)/, 'O chip não pode usar classe de alarme.');
const noDeadlineRow = renderPublicationRow({ item: { ...unitItem, id: 'publication-no-deadline' }, act: unitAct, parties: 'Cliente Sintético', selected: false, escapeHtml, formatDate, formatAge });
assert.doesNotMatch(noDeadlineRow, /publication-source-deadline/, 'Sem data do eproc, nenhum chip é renderizado.');
assert.doesNotMatch(noDeadlineRow, /Eproc informou/);

function createQuickActionHarness({ status = 'untreated', response }) {
  const fetchCalls = [];
  const toasts = [];
  const saves = [];
  const listeners = [];
  const state = {
    intimations: [{ id: 'publication-unit', title: 'Título sintético', process: '5000000-00.2026.8.21.0001', text: 'Texto sintético.', publishedAt: '2026-08-30', treatmentStatus: status, unread: true }],
    processes: [],
    tasks: []
  };
  const store = { revision: 'revision-1', state, save: () => saves.push('save') };
  const list = {
    innerHTML: '',
    querySelectorAll: selector => (selector === '[data-row-action]' ? listeners : [])
  };
  const documentRef = {
    documentElement: { dataset: { ui: 'v2' } },
    getElementById: id => (id === 'inboxList' ? list : null),
    querySelectorAll: () => [],
    querySelector: () => null,
    body: { style: {} }
  };
  const feature = createPublicationsFeature({
    store,
    documentRef,
    windowRef: {
      KellerAuth: { csrfToken: 'csrf-sintetico' },
      fetch: async (url, options) => {
        fetchCalls.push({ url, body: JSON.parse(options.body) });
        return response;
      }
    },
    escapeHtml: String,
    formatDate: String,
    formatDateTime: String,
    showToast: (message, type, action) => toasts.push({ message, type, action })
  });
  const quickButton = {
    dataset: { publicationId: 'publication-unit', rowAction: 'mark_treated' },
    addEventListener(type, handler) { listeners.push({ type, handler }); }
  };
  list.querySelectorAll = selector => {
    if (selector === '[data-intimation-id]') return [];
    if (selector === '[data-row-action]') return [quickButton];
    return [];
  };
  return { feature, store, state, listeners, fetchCalls, toasts, saves };
}

const successResponse = {
  ok: true,
  status: 200,
  json: async () => ({
    intimation: { id: 'publication-unit', title: 'Título sintético', treatmentStatus: 'treated', treatedBy: 'Advogada Teste', unread: true },
    revision: 'revision-2',
    message: 'Tratamento atualizado.'
  })
};
const quickHarness = createQuickActionHarness({ response: successResponse });
quickHarness.feature.renderInbox();
assert.equal(quickHarness.listeners.length, 1, 'Cada linha deve registrar exatamente um listener de ação rápida.');
assert.equal(quickHarness.listeners[0].type, 'click');
await quickHarness.listeners[0].handler({ preventDefault() {}, stopPropagation() {} });
assert.equal(quickHarness.fetchCalls.length, 1, 'A ação rápida deve produzir uma única requisição de tratamento.');
assert.equal(quickHarness.fetchCalls[0].url, '/api/intimations/publication-unit/treatment');
assert.equal(quickHarness.fetchCalls[0].body.action, 'mark_treated');
assert.equal(quickHarness.feature.selectedIntimation, null, 'A ação rápida não pode abrir o inspector da publicação.');
assert.equal(quickHarness.store.state.intimations[0].treatmentStatus, 'treated', 'O estado consolidado devolvido pelo backend deve ser adotado.');
assert.equal(quickHarness.store.revision, 'revision-2');
assert.equal(quickHarness.store.state.intimations[0].unread, false, 'A leitura local deve permanecer registrada na triagem.');
assert.equal(quickHarness.toasts.at(-1)?.action?.label, 'Desfazer', 'O sucesso deve oferecer desfazer na triagem interna.');
await quickHarness.toasts.at(-1).action.onClick();
assert.equal(quickHarness.fetchCalls.length, 2, 'Desfazer deve produzir uma segunda requisição explícita.');
assert.equal(quickHarness.fetchCalls[1].body.action, 'reopen');

const conflictHarness = createQuickActionHarness({
  response: { ok: false, status: 409, json: async () => ({ message: 'Conflito oficial' }) }
});
conflictHarness.feature.renderInbox();
await conflictHarness.listeners[0].handler({ preventDefault() {}, stopPropagation() {} });
assert.equal(conflictHarness.fetchCalls.length, 1);
assert.equal(conflictHarness.store.state.intimations[0].treatmentStatus, 'untreated', '409 não pode mutar o tratamento local.');
assert.equal(conflictHarness.store.revision, 'revision-1', '409 não pode sobrescrever a revision local.');
assert.equal(conflictHarness.toasts.some(entry => entry.action?.label === 'Desfazer'), false, '409 não pode oferecer desfazer de transição não aplicada.');
assert.equal(conflictHarness.toasts.at(-1)?.type, 'warning');

const unitDetail = renderPublicationDetail({
  item: unitItem, act: unitAct, parties: 'Cliente Sintético', linkedTasks: [], privileged: true,
  escapeHtml, formatDate, formatDateTime, formatAge
});
assert.match(unitDetail, /Texto original preservado/);
assert.match(unitDetail, /Texto oficial\ncom 15 dias sem prazo cadastrado\./);
assert.match(unitDetail, /Aguardando triagem humana/);
assert.doesNotMatch(unitDetail, /original-text is-structured/, 'texto curto com quebras próprias fica como veio');
assert.match(unitDetail, /data-fold="source"/, 'dados secundários ficam recolhidos');
assert.match(unitDetail, /data-fold="conference"/, 'contagem fica recolhida');
const gluedText = 'Intimação sintética Classe: Procedimento ADVOGADO(A): ADVOGADA TESTE (OAB RS000000) RÉU: EMPRESA TESTE DECISÃO Vistos. ' + 'Parágrafo oficial sintético para leitura. '.repeat(6) + '<script>alert(1)</script>';
const gluedDetail = renderPublicationDetail({
  item: { ...unitItem, text: gluedText }, act: unitAct, parties: 'Cliente Sintético', linkedTasks: [], privileged: true,
  escapeHtml, formatDate, formatDateTime, formatAge
});
assert.match(gluedDetail, /original-text is-structured/);
assert.match(gluedDetail, /original-text-field"><span>ADVOGADO\(A\):<\/span> ADVOGADA TESTE \(OAB RS000000\)/);
assert.match(gluedDetail, /original-text-heading">DECISÃO/);
assert.doesNotMatch(gluedDetail, /<script>alert/, 'texto organizado continua escapado');
assert.doesNotMatch(gluedDetail, /data-original-text-toggle/, 'texto médio aparece inteiro');
const longDetail = renderPublicationDetail({
  item: { ...unitItem, text: gluedText + ' Parágrafo oficial sintético para leitura.'.repeat(60) }, act: unitAct, parties: 'Cliente Sintético', linkedTasks: [], privileged: true,
  escapeHtml, formatDate, formatDateTime, formatAge
});
assert.match(longDetail, /is-clamped/);
assert.match(longDetail, /data-original-text-toggle aria-expanded="false">Ler texto completo/);
const signalledDetail = renderPublicationDetail({
  item: unitItem, act: unitAct, parties: 'Cliente Sintético', linkedTasks: [], privileged: true,
  aiClassifier: { enabled: true, status: 'ready', suggestion: { action: 'suggest', suggestion: { area: { label: 'civil' }, priority: { label: 'alta' }, deadline_signal: { label: 'sim' } } } },
  escapeHtml, formatDate, formatDateTime, formatAge
});
assert.match(signalledDetail, /data-fold="conference" open/, 'sinal de prazo no texto abre a contagem');
assert.match(signalledDetail, /data-fold="classifier"><summary>.*Cível · Prioridade alta/s, 'o resumo mostra a classificação sem abrir');
assert.match(unitDetail, /id="btnCreateTask"/);
assert.match(unitDetail, /Outras providências/);
assert.match(unitDetail, /data-detail-action="deadline"/);
assert.match(unitDetail, /id="btnSendIntimationEmail"/);
assert.match(unitDetail, /data-detail-action="view-decision-html"/);
assert.match(unitDetail, /data-detail-action="download-decision-html"/);

const suspensionDetail = renderPublicationDetail({
  item: { ...unitItem, publishedAt: '2026-09-21' }, act: unitAct, parties: 'Cliente Sintético', linkedTasks: [], privileged: true,
  suspensions: [{ id: 's1', start: '2026-09-21', end: '2026-09-22', scope: 'PJe', note: 'Indisponibilidade de teste', sourceUrl: 'https://www.cnj.jus.br/' }],
  escapeHtml, formatDate, formatDateTime, formatAge
});
assert.match(suspensionDetail, /publication-suspension-notice/, 'Publicação dentro de suspensão registrada deve exibir aviso informativo.');
assert.match(suspensionDetail, /Pode haver prorrogação de prazos/);
assert.match(suspensionDetail, /2026-09-21 a 2026-09-22 · PJe · Indisponibilidade de teste/);
assert.match(suspensionDetail, /fonte oficial/);
assert.doesNotMatch(suspensionDetail, /link-safety-note/, 'Fonte oficial (jus.br) não recebe aviso de link.');
const externalSuspensionDetail = renderPublicationDetail({
  item: { ...unitItem, publishedAt: '2026-09-21' }, act: unitAct, parties: 'Cliente Sintético', linkedTasks: [], privileged: true,
  suspensions: [{ id: 's3', start: '2026-09-21', end: '2026-09-22', scope: 'PJe', note: 'Registro sintético', sourceUrl: 'https://portal-sintetico.example.test/comunicado' }],
  escapeHtml, formatDate, formatDateTime, formatAge
});
assert.match(externalSuspensionDetail, /link-safety-note is-external/, 'Fonte fora dos domínios oficiais recebe aviso discreto.');
assert.match(externalSuspensionDetail, /Domínio externo/);
const unsafeSuspensionDetail = renderPublicationDetail({
  item: { ...unitItem, publishedAt: '2026-09-21' }, act: unitAct, parties: 'Cliente Sintético', linkedTasks: [], privileged: true,
  suspensions: [{ id: 's4', start: '2026-09-21', end: '2026-09-22', scope: 'PJe', note: 'Registro sintético', sourceUrl: 'http://portal-sintetico.example.test/comunicado' }],
  escapeHtml, formatDate, formatDateTime, formatAge
});
assert.match(unsafeSuspensionDetail, /link-safety-note is-unsafe/, 'Conexão não segura recebe aviso de link suspeito.');
assert.match(unsafeSuspensionDetail, /Link suspeito/);
const noSuspensionDetail = renderPublicationDetail({
  item: { ...unitItem, publishedAt: '2026-09-21' }, act: unitAct, parties: 'Cliente Sintético', linkedTasks: [], privileged: true,
  suspensions: [{ id: 's2', start: '2026-10-01', end: '2026-10-02', scope: 'PJe' }],
  escapeHtml, formatDate, formatDateTime, formatAge
});
assert.doesNotMatch(noSuspensionDetail, /publication-suspension-notice/, 'Fora da janela não pode haver aviso.');

const incompleteDjen = renderPublicationDetail({
  item: { ...unitItem, type: 'djen', externalId: 'djen:incompleta', process: '', court: '', client: '', publishedAt: '', disponibilizadoEm: '' },
  act: unitAct, parties: '', linkedTasks: [], privileged: true,
  escapeHtml, formatDate, formatDateTime, formatAge
});
assert.match(incompleteDjen, /publication-quality-notice/, 'Intimação DJEN incompleta deve exibir conferência de conteúdo.');
assert.match(incompleteDjen, /Res\. CNJ 455\/2022, art\. 12, §1º/);
assert.match(incompleteDjen, /número único do processo ausente/);
const completeDjen = renderPublicationDetail({
  item: { ...unitItem, type: 'djen', externalId: 'djen:completa', process: '5001111-61.2026.8.21.0001', court: 'TJRS · 1ª Vara', client: 'Cliente Sintético', publishedAt: '2026-09-21', disponibilizadoEm: '2026-09-18' },
  act: unitAct, parties: 'Cliente Sintético', linkedTasks: [], privileged: true,
  escapeHtml, formatDate, formatDateTime, formatAge
});
assert.doesNotMatch(completeDjen, /publication-quality-notice/, 'Intimação DJEN completa não deve exibir conferência de conteúdo.');

const lawyersDetail = renderPublicationDetail({
  item: {
    ...unitItem,
    publicationLawyers: [{ name: 'Advogada Teste', oab: '111111', uf: 'RS' }],
    lawyers: 'Advogada Teste (OAB/RS 111111)'
  },
  act: unitAct, parties: 'Cliente Sintético', linkedTasks: [], privileged: true,
  officeUsers: [{ id: 'u1', displayName: 'Advogada Teste', oab: '111111', oabUf: 'RS' }],
  escapeHtml, formatDate, formatDateTime, formatAge
});
assert.match(lawyersDetail, /Advogados na publicação/, 'Advogados citados pela fonte oficial devem aparecer na leitura.');
assert.match(lawyersDetail, /Advogada Teste \(OAB\/RS 111111\)/);
assert.match(lawyersDetail, /Vínculo por OAB/, 'O vínculo derivado com o escritório deve ser indicado.');
assert.match(lawyersDetail, /<dt>Responsável<\/dt><dd>Advogada Teste<\/dd>/, 'Sem responsável manual, o vínculo por OAB preenche a leitura sem persistir.');
const unmatchedLawyersDetail = renderPublicationDetail({
  item: { ...unitItem, publicationLawyers: [{ name: 'Advogada Teste', oab: '222222', uf: 'RS' }] },
  act: unitAct, parties: 'Cliente Sintético', linkedTasks: [], privileged: true,
  officeUsers: [{ id: 'u1', displayName: 'Advogada Teste', oab: '111111', oabUf: 'RS' }],
  escapeHtml, formatDate, formatDateTime, formatAge
});
assert.doesNotMatch(unmatchedLawyersDetail, /Vínculo por OAB/, 'OAB divergente não pode criar vínculo.');
assert.match(unmatchedLawyersDetail, /Advogados na publicação/);
assert.match(unmatchedLawyersDetail, /<dt>Responsável<\/dt><dd>Não atribuído<\/dd>/);

const presenterSource = readFileSync(new URL('../js/views/ui-v2/publications-presenter.js', import.meta.url), 'utf8');
const featureSource = readFileSync(new URL('../js/features/publications.js', import.meta.url), 'utf8');
const portalSource = readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
assert.doesNotMatch(presenterSource, /\bStore\b|secureFetch|\bfetch\s*\(|\.save\s*\(|\.flush\s*\(|\/api\//, 'Presenter não pode acessar Store, persistência ou API.');
assert.equal((portalSource.match(/createPublicationsFeature\(/g) || []).length, 1, 'A feature funcional deve continuar única.');
assert.doesNotMatch(featureSource, /createPublicationsV2Feature|setInterval\s*\(/, 'Não pode existir segunda feature ou timer V2.');
assert.match(featureSource, /item\.unread = false;\s*store\.save\(\);/, 'Leitura deve preservar o contrato local existente.');assert.match(featureSource, /const deadlineMode = store\?\.state\?\.settings\?\.deadlineMode === 'manual'/, 'A cria��o de tarefa deve consultar o modo de prazo do escrit�rio.');
assert.match(featureSource, /export function publicationTaskDeadline\(item, \{ deadlineMode = 'auto' \} = \{\}\)/, 'A decisão de prazo da tarefa genérica deve ser centralizada e testável.');
assert.match(featureSource, /const draftDeadline = publicationTaskDeadline\(item, \{ deadlineMode \}\);/, 'No modo manual a tarefa nasce sem prazo; no auto recebe apenas a fonte ou a data humana.');
assert.doesNotMatch(featureSource, /deadline: item\.deadline \|\| item\.sourceReportedDeadlineAt/, 'A refer�ncia da fonte nunca pode ser colada como deadline.');

const aliasNow = new Date(2026, 7, 30, 12, 0, 0);
const aliasFixture = [
  { id: 'publication-keeper', title: 'Publicação oficial', publishedAt: '2026-08-30', treatmentStatus: 'untreated' },
  { id: 'publication-alias', title: 'Publicação alias', mergedInto: 'publication-keeper', publishedAt: '2026-08-30', treatmentStatus: 'untreated' }
];
assert.deepEqual(
  filterPublications(aliasFixture, { filter: 'all', sort: 'date-desc', now: aliasNow }).map(item => item.id),
  ['publication-keeper'],
  'O filtro central não pode devolver alias.'
);
for (const filter of ['untreated', 'in_review', 'treated', 'discarded', 'urgente', 'importante', 'prazo-fatal', 'triagem', 'prazo']) {
  assert.equal(
    filterPublications(aliasFixture, { filter, now: aliasNow }).some(item => item.id === 'publication-alias'),
    false,
    `Alias não pode aparecer no filtro ${filter}.`
  );
}
assert.equal(isActiveIntimation({ id: 'sem-fusao' }), true);
assert.equal(isActiveIntimation({ id: 'com-fusao', mergedInto: 'keeper' }), false);
assert.equal(isActiveIntimation({ id: 'fusao-vazia', mergedInto: '' }), true, 'mergedInto vazio não caracteriza alias.');
assert.equal(findIntimationRecord(aliasFixture, 'publication-alias').id, 'publication-keeper', 'Vínculo por id deve resolver para o keeper.');
assert.equal(findIntimationRecord([{ id: 'publication-orphan-alias', mergedInto: 'publication-ausente' }], 'publication-orphan-alias'), null, 'Alias sem keeper no estado não pode ser devolvido como ativo.');
assert.equal(findIntimationRecord([{ id: 'a', mergedInto: 'b' }, { id: 'b', mergedInto: 'a' }], 'a'), null, 'Ciclo de fusão não pode travar nem devolver alias.');

const aliasRow = renderPublicationRow({ item: aliasFixture[1], act: unitAct, parties: 'Cliente Sintético', selected: false, escapeHtml, formatDate, formatAge });
assert.equal(aliasRow, '', 'A linha de um alias não pode ser renderizada.');
const aliasDetail = renderPublicationDetail({ item: aliasFixture[1], act: unitAct, parties: 'Cliente Sintético', linkedTasks: [], privileged: true, escapeHtml, formatDate, formatDateTime, formatAge });
assert.equal(aliasDetail, '', 'O detalhe de um alias não pode ser renderizado.');

function createAliasInboxHarness() {
  const state = {
    intimations: [
      { id: 'publication-active', title: 'Publicação ativa', process: '5000000-00.2026.8.21.0001', publishedAt: '2026-08-30', treatmentStatus: 'untreated' },
      { id: 'publication-alias-hidden', title: 'Publicação alias', mergedInto: 'publication-active', process: '5000000-00.2026.8.21.0001', publishedAt: '2026-08-30', treatmentStatus: 'untreated' }
    ],
    processes: [],
    tasks: []
  };
  const list = { innerHTML: '', querySelectorAll: () => [] };
  const documentRef = {
    documentElement: { dataset: { ui: 'v2' } },
    getElementById: id => (id === 'inboxList' ? list : null),
    querySelectorAll: () => [],
    querySelector: () => null,
    body: { style: {} }
  };
  const store = { revision: 'revision-alias', state, save() {} };
  const feature = createPublicationsFeature({
    store,
    documentRef,
    windowRef: { KellerAuth: {}, localStorage: null },
    escapeHtml: String,
    formatDate: String,
    formatDateTime: String,
    showToast() {}
  });
  return { feature, list, state };
}
const aliasInbox = createAliasInboxHarness();
aliasInbox.feature.inboxFilter = 'all';
aliasInbox.feature.renderInbox();
assert.match(aliasInbox.list.innerHTML, /publication-active/, 'A publicação oficial deve continuar na lista.');
assert.doesNotMatch(aliasInbox.list.innerHTML, /publication-alias-hidden/, 'O alias não pode aparecer na lista renderizada.');
assert.equal(aliasInbox.feature.getUntreatedCount(), 1, 'Alias não pode contar como não tratada.');
assert.deepEqual(
  aliasInbox.feature.getMetrics(aliasNow),
  { untreated: 1, inReview: 0, treatedToday: 0, discardedToday: 0 },
  'Métricas não podem contar alias.'
);

const session = await startUiV2Session();
try {
  const context = await session.createContext({ viewport: { width: 1280, height: 800 } });
  try {
    const { page, pageErrors } = await prepareUiV2Page(context, session.server.baseUrl, { theme: 'light', probe: true });
    const fixture = await prepareUiV2PublicationsFixture(page);
    await page.evaluate(() => {
      const format = date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const item = window.Atrium.Store.state.intimations.find(record => record.id === 'ui-v2-publication-urgent');
      item.hasHtml = true;
      item.rawHtml = '<div onclick="alert(1)"><h2>Decisão integral sintética</h2><script>alert(2)</script><p>Teor completo.</p></div>';
      window.Atrium.Store.state.intimations[0].publishedAt = format(today);
      window.Atrium.Store.state.intimations[1].publishedAt = format(yesterday);
      window.Atrium.Store.state.intimations[2].publishedAt = format(today);
      window.Atrium.Store.state.intimations[3].publishedAt = '2000-01-01';
      window.Atrium.App.inboxCutoff = '2days';
      window.Atrium.App.renderInbox();
    });
    const requests = [];
    page.on('request', request => requests.push({ method: request.method(), url: request.url() }));
    const intervalBaseline = await page.evaluate(() => window.__uiV2RuntimeProbe.intervals);

    assert.equal(await page.evaluate(() => window.Atrium.App.inboxFilter), 'all');
    assert.equal(await page.locator('#inboxFilters [data-filter="all"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#inboxCutoffSelect').inputValue(), '2days');
    assert.equal(await page.locator('#inboxList [data-intimation-id]').count(), 3);
    assert.equal(await page.locator('#publicationResultCount').textContent(), '3 de 4 publicações');
    await page.locator('#inboxCutoffSelect').selectOption('all');
    assert.equal(await page.locator('#inboxList [data-intimation-id]').count(), 4);
    assert.equal(await page.locator('#publicationResultCount').textContent(), '4 de 4 publicações');
    assert.equal(await page.locator('#view-inbox').evaluate(view => view.classList.contains('publication-detail-open')), false);
    assert.equal(await page.locator('#intimationDetail').isVisible(), false);
    assert.equal(await page.locator('#publicationInspectorBackdrop').isVisible(), false);
    const urgentRow = page.locator('[data-intimation-id="ui-v2-publication-urgent"]');
    const urgentOpen = urgentRow.locator('.publication-record-open');
    assert.match(await urgentOpen.getAttribute('aria-label'), /Não lida[\s\S]*Não tratada/);
    assert.match(await urgentRow.textContent(), /Capturada em 30\/08\/2026/, 'A linha deve expor a data da captura rotulada.');
    assert.equal(await urgentRow.locator('.publication-record-capture').count(), 1);
    assert.equal(await urgentRow.locator('.publication-source-deadline').count(), 0, 'Sem data reportada pelo eproc, nenhum chip é renderizado.');
    const reviewRow = page.locator('[data-intimation-id="ui-v2-publication-review"]');
    assert.match(await reviewRow.locator('.publication-record-open').getAttribute('aria-label'), /Lida[\s\S]*Em análise/);

    await page.evaluate(() => {
      const item = window.Atrium.Store.state.intimations.find(record => record.id === 'ui-v2-publication-treated');
      item.sourceReportedDeadlineAt = '2026-09-12';
      window.Atrium.App.renderInbox();
    });
    const deadlineRow = page.locator('[data-intimation-id="ui-v2-publication-treated"]');
    assert.match(await deadlineRow.locator('.publication-source-deadline').textContent(), /Eproc informou 12\/09\/2026 · conferir/);
    assert.doesNotMatch(await deadlineRow.textContent(), /prazo fatal/i);

    await page.locator('.pub-metric-card[data-filter="in_review"]').focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#inboxList [data-intimation-id]').count(), 1, 'Métrica deve reutilizar o filtro oficial.');
    assert.equal(await page.locator('.pub-metric-card[data-filter="in_review"]').getAttribute('aria-pressed'), 'true');
    await page.evaluate(() => { window.Atrium.App.inboxFilter = 'all'; window.Atrium.App.renderInbox(); });

    const beforeSort = await page.locator('#inboxList [data-intimation-id]').evaluateAll(rows => rows.map(row => row.dataset.intimationId));
    await page.locator('[data-inbox-sort-col="date"]').click();
    const afterSort = await page.locator('#inboxList [data-intimation-id]').evaluateAll(rows => rows.map(row => row.dataset.intimationId));
    assert.notDeepEqual(afterSort, beforeSort, 'Sort existente deve continuar operando na única lista.');
    assert.equal(requests.filter(request => /\/api\/(?:intimations\/.+\/treatment|publications\/.+\/task|intimations\/email|publications\/email\/batch)/.test(request.url)).length, 0, 'Render, filtro e sort não podem disparar operações.');

    await page.evaluate(() => document.querySelector('[data-intimation-id="ui-v2-publication-urgent"]')?.click());
    await page.locator('#intimationDetail .detail-header').waitFor();
    await page.locator('#view-inbox.publication-detail-open').waitFor();
    await page.waitForFunction(() => getComputedStyle(document.getElementById('intimationDetail')).opacity === '1');
    assert.equal(await page.locator('#intimationDetail').getAttribute('role'), 'dialog');
    const readState = await page.evaluate(() => {
      const item = window.Atrium.Store.state.intimations.find(record => record.id === 'ui-v2-publication-urgent');
      return { unread: item.unread, treatmentStatus: item.treatmentStatus, deadline: item.deadline, fatalDeadline: item.fatalDeadline };
    });
    assert.deepEqual(readState, { unread: false, treatmentStatus: 'untreated', deadline: undefined, fatalDeadline: undefined });
    const detailText = await page.locator('#intimationDetail').textContent();
    assert.match(detailText, /TEXTO OFICIAL SINTÉTICO/);
    assert.match(detailText, /Aguardando triagem humana/);
    assert.equal(await page.locator('[data-detail-action="view-decision-html"]').isVisible(), true);
    await page.locator('[data-detail-action="view-decision-html"]').click();
    await page.locator('.publication-decision-dialog[open]').waitFor();
    const frameHtml = await page.locator('.publication-decision-dialog iframe').getAttribute('srcdoc');
    assert.match(frameHtml, /Decisão integral sintética/);
    assert.doesNotMatch(frameHtml, /alert\(|onclick/i);
    await page.locator('.publication-decision-dialog [data-close-decision]').click();
    assert.equal(await urgentOpen.getAttribute('aria-pressed'), 'true');

    await page.evaluate(() => document.getElementById('publicationInspectorBackdrop').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    await page.evaluate(() => document.querySelector('[data-intimation-id="ui-v2-publication-urgent"]')?.click());
    await page.locator('#view-inbox.publication-detail-open').waitFor();

    await page.locator('.publication-work-menu > summary').click();
    await page.locator('.publication-work-menu [data-detail-action="deadline"]').click();
    await page.locator('#modalBackdrop[data-modal-mode="publicationWorkAction"]:not(.hidden)').waitFor();
    assert.equal(await page.locator('#field-deadline').inputValue(), '', 'Prazo não pode ser inferido do texto da publicação.');
    assert.equal(await page.locator('#field-fatalDeadline').inputValue(), '', 'Prazo fatal exige confirmação humana expressa.');
    assert.match(await page.locator('#modalFields').textContent(), /Data não inferida/);
    await page.locator('#modalCancel').click();

    await page.locator('#btnCreateTask').click();
    await page.locator('#modalBackdrop[data-modal-mode="task"]:not(.hidden)').waitFor();
    assert.equal(await page.locator('#field-deadline').inputValue(), '', 'Texto “15 dias” não pode preencher deadline.');
    assert.equal(await page.locator('#field-process').inputValue(), '5004321-12.2026.8.21.0001');
    await page.locator('#modalCancel').click();
    if (await page.locator('#view-inbox').evaluate(view => view.classList.contains('publication-detail-open'))) await page.locator('#publicationDetailClose').click();
    await page.locator('#view-inbox:not(.publication-detail-open)').waitFor();

    await page.evaluate(() => { window.Atrium.App.inboxFilter = 'treated'; window.Atrium.App.renderInbox(); });
    await page.locator('[data-intimation-id="ui-v2-publication-treated"]').click();
    await page.waitForFunction(() => getComputedStyle(document.getElementById('intimationDetail')).opacity === '1');
    assert.match(await page.locator('#intimationDetail').textContent(), /Providência vinculada sintética/);
    assert.match(await page.locator('#intimationDetail').textContent(), /Advogada Tratadora Sintética/);
    assert.match(await page.locator('#intimationDetail').textContent(), /Providência conferida manualmente/);
    await page.locator('[data-open-task-id="ui-v2-publication-task"]').click();
    await page.locator('#modalBackdrop[data-modal-mode="task"]:not(.hidden)').waitFor();
    assert.equal(await page.locator('#field-title').inputValue(), 'Providência vinculada sintética');
    await page.locator('#modalCancel').click();
    if (await page.locator('#view-inbox').evaluate(view => view.classList.contains('publication-detail-open'))) await page.locator('#publicationDetailClose').click();
    await page.locator('#view-inbox:not(.publication-detail-open)').waitFor();

    const readClientDefinition = () => page.evaluate(() => {
      const term = [...document.querySelectorAll('#intimationDetail .publication-detail-meta dt')]
        .find(element => element.textContent.trim() === 'Cliente / contato');
      return (term?.nextElementSibling?.textContent || '').replace(/\s*→\s*$/, '').trim();
    });

    await page.evaluate(() => {
      const { Store } = window.Atrium;
      const publication = Store.state.intimations.find(record => record.id === 'ui-v2-publication-urgent');
      delete publication.client;
      Store.state.contacts = [];
    });
    await page.evaluate(() => window.Atrium.App.selectIntimation('ui-v2-publication-urgent'));
    await page.locator('#view-inbox.publication-detail-open').waitFor();
    assert.equal(await readClientDefinition(), 'Cliente Sintética Publicações', 'Publicação sem client deve resolver o cliente pelo processo vinculado.');
    assert.equal(await page.locator('#intimationDetail [data-open-contact-id]').count(), 0, 'Cliente apenas textual do processo não pode ganhar vínculo de contato fabricado.');
    await page.locator('#publicationDetailClose').click();
    await page.locator('#view-inbox:not(.publication-detail-open)').waitFor();

    await page.evaluate(() => {
      const { Store } = window.Atrium;
      const process = Store.state.processes.find(record => record.id === 'ui-v2-publication-process');
      delete process.client;
      Store.state.contacts = [{
        id: 'ui-v2-contact-process-client',
        name: 'Cliente Vinculada Sintética',
        contactRole: 'cliente',
        relatedProcessNumbers: ['5004321-12.2026.8.21.0001']
      }];
    });
    await page.evaluate(() => window.Atrium.App.selectIntimation('ui-v2-publication-urgent'));
    await page.locator('#view-inbox.publication-detail-open').waitFor();
    assert.equal(await readClientDefinition(), 'Cliente Vinculada Sintética', 'Contato cliente único vinculado ao número do processo deve resolver o cliente.');
    assert.equal(await page.locator('#intimationDetail [data-open-contact-id="ui-v2-contact-process-client"]').count(), 1, 'Contato resolvido deve manter o vínculo oficial navegável.');

    await page.evaluate(() => {
      window.Atrium.Store.state.contacts.push({
        id: 'ui-v2-contact-ambiguous',
        name: 'Cliente Ambígua Sintética',
        contactRole: 'cliente',
        relatedProcessNumbers: ['5004321-12.2026.8.21.0001']
      });
      window.Atrium.App.renderIntimationDetail();
    });
    assert.equal(await readClientDefinition(), 'Não identificado', 'Dois contatos cliente para o mesmo processo não podem ser escolhidos arbitrariamente.');
    assert.equal(await page.locator('#intimationDetail [data-open-contact-id]').count(), 0, 'Resolução ambígua não pode produzir vínculo de contato.');

    await page.evaluate(() => {
      window.Atrium.Store.state.intimations.find(record => record.id === 'ui-v2-publication-urgent').contactId = 'ui-v2-contact-process-client';
      window.Atrium.App.renderIntimationDetail();
    });
    assert.equal(await readClientDefinition(), 'Cliente Vinculada Sintética', 'Vínculo direto explícito da publicação deve prevalecer sobre a ambiguidade do processo.');
    assert.equal(await page.locator('#intimationDetail [data-open-contact-id="ui-v2-contact-process-client"]').count(), 1, 'Vínculo direto explícito deve permanecer navegável.');
    if (await page.locator('#view-inbox').evaluate(view => view.classList.contains('publication-detail-open'))) await page.locator('#publicationDetailClose').click();
    await page.locator('#view-inbox:not(.publication-detail-open)').waitFor();

    await page.evaluate(() => { window.Atrium.App.inboxFilter = 'all'; window.Atrium.App.renderInbox(); });
    await page.locator('[data-intimation-id="ui-v2-publication-review"]').click();
    await page.waitForFunction(() => getComputedStyle(document.getElementById('intimationDetail')).opacity === '1');
    assert.equal(await page.locator('#btnSendIntimationEmail').count(), 1, 'Admin deve manter ação individual.');
    let individualRequests = 0;
    await page.route('**/api/intimations/email', async route => {
      individualRequests++;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });
    await page.locator('#btnSendIntimationEmail').click();
    assert.equal(individualRequests, 0, 'Abrir modal individual não pode enviar.');
    await page.locator('#publicationEmailRecipientInput').fill('destino@example.test');
    await page.locator('#publicationEmailSubmitBtn').click();
    await page.locator('#publicationEmailBackdrop.hidden').waitFor({ state: 'attached' });
    assert.equal(individualRequests, 1, 'Envio explícito deve produzir uma operação individual.');
    await page.locator('#publicationDetailClose').click();
    await page.locator('#view-inbox:not(.publication-detail-open)').waitFor();

    let batchRequests = 0;
    await page.route('**/api/publications/email/batch', async route => {
      batchRequests++;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, emailHtml: '<p>Boletim sintético</p>', emailText: 'Boletim sintético' }) });
    });
    await page.locator('#btnEmailPublications').click();
    assert.equal(batchRequests, 0, 'Abrir boletim não pode enviar.');
    await page.locator('#emailTargetAddress').fill('boletim@example.test');
    await page.locator('#btnSendEmailDirect').click();
    await page.locator('#emailPreviewContainer', { hasText: 'Boletim sintético' }).waitFor();
    assert.equal(batchRequests, 1, 'Envio batch explícito deve produzir uma operação.');
    await page.locator('#publicationsEmailClose').click();

    await page.evaluate(() => {
      window.KellerAuth.currentUser.role = 'collaborator';
      window.Atrium.App.renderIntimationDetail();
    });
    assert.equal(await page.locator('#btnSendIntimationEmail').count(), 0, 'RBAC visual individual deve permanecer.');

    const runtime = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('[id]')].map(element => String(element.getAttribute('id')));
      return {
        intervals: window.__uiV2RuntimeProbe.intervals,
        duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index)
      };
    });
    assert.equal(runtime.intervals, intervalBaseline, 'Publicações V2 não pode adicionar timer.');
    assert.deepEqual(runtime.duplicateIds, [], 'Não pode haver IDs duplicados.');
    assert.deepEqual(pageErrors, [], `Pageerrors: ${pageErrors.join(' | ')}`);
    assert.equal(fixture.intimations.length, 4);

    assert.equal(await page.locator('#uiModeControl, [data-ui-mode]').count(), 0, 'Publicações estáveis não podem expor retorno ao Classic.');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.ui), 'v2');
    assert.equal(await page.locator('.v2-publications-heading').isVisible(), true);
  } finally {
    await context.close();
  }
} finally {
  await session.stop();
}

console.log('✓ Publicações V2 aprovada: uma feature, leitura e tratamento independentes, tarefa sem prazo inferido e e-mail somente explícito.');
