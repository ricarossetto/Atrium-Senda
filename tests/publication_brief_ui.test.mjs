import assert from 'node:assert/strict';
import { renderPublicationDetail, renderPublicationRow } from '../js/views/ui-v2/publications-presenter.js';

console.log('\n===============================================================');
console.log('  ATRIUM - LEITURA RÁPIDA E FILA DO DIA NA TELA              ');
console.log('===============================================================\n');

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');
const formatDate = value => value || '-';
const formatDateTime = value => value || 'Nunca';
const formatAge = () => 'Hoje';

const item = {
  id: 'pub-brief-ui',
  title: 'Acórdão sintético',
  process: '5009754-74.2026.8.21.9000',
  court: 'TJRS',
  source: 'DJEN',
  publishedAt: '2026-10-30',
  text: 'RECURSO DE MEDIDA CAUTELAR Nº 1. TIPO DE AÇÃO: CNH. RECURSO DESPROVIDO. A Turma negou provimento.',
  treatmentStatus: 'untreated',
  unread: true
};
const act = { category: 'Recurso', priority: 'importante', label: 'Recurso', css: 'recurso' };
const panel = {
  enabled: true,
  status: 'ready',
  suggestion: {
    action: 'suggest',
    confidence: 0.88,
    suggestion: {
      area: { label: 'Cível', confidence: 0.9 },
      priority: { label: 'Alta', confidence: 0.8 },
      deadline_signal: { label: 'sim' },
      deadline_days: { label: 'd15' }
    }
  }
};

const detail = renderPublicationDetail({
  item,
  act,
  parties: 'Cliente Sintético',
  linkedTasks: [],
  privileged: true,
  aiClassifier: panel,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatAge
});
assert.match(detail, /class="publication-brief"/);
assert.match(detail, /Leitura rápida/);
assert.match(detail, /Resumo/);
assert.doesNotMatch(detail, /O que caiu/);
assert.match(detail, /O que fazer/);
assert.match(detail, /Peça/);
assert.match(detail, /Área com confiança (baixa|média|alta)/);
assert.match(detail, /RECURSO DESPROVIDO/);
assert.match(detail, /Criar tarefa da sugestão/);
assert.match(detail, /id="btnCreateBriefTask"/);
assert.match(detail, /data-detail-action="create-brief-task"/);
assert.match(detail, /Nenhum prazo é calculado a partir do texto/);
assert.doesNotMatch(detail, /data-detail-action="undo-brief-task"/);
assert.match(detail, /publication-brief-priority is-urgent/);

const sentenceDetail = renderPublicationDetail({
  item,
  act: { category: 'Sentença / Acórdão', priority: 'importante', label: 'Sentença', css: 'recurso' },
  parties: '',
  linkedTasks: [],
  privileged: true,
  aiClassifier: panel,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatAge
});
assert.match(sentenceDetail, /<dt>Providência<\/dt>/);
assert.doesNotMatch(sentenceDetail, /<dt>Peça<\/dt>/);

const reviewDetail = renderPublicationDetail({
  item,
  act,
  parties: '',
  linkedTasks: [],
  privileged: true,
  aiClassifier: { ...panel, suggestion: { ...panel.suggestion, action: 'review', suggestion: { ...panel.suggestion.suggestion, priority: { label: 'Normal', confidence: 0.7 } } } },
  escapeHtml,
  formatDate,
  formatDateTime,
  formatAge
});
assert.match(reviewDetail, /Conferir antes de agir/);
assert.match(reviewDetail, /publication-brief-priority is-review/);

const undoDetail = renderPublicationDetail({
  item,
  act,
  parties: '',
  linkedTasks: [],
  privileged: true,
  aiClassifier: panel,
  briefTask: { undo: { title: 'Recurso: 5009754-74.2026.8.21.9000', taskId: 'task-1' } },
  escapeHtml,
  formatDate,
  formatDateTime,
  formatAge
});
assert.match(undoDetail, /Tarefa criada:/);
assert.match(undoDetail, /id="btnUndoBriefTask"/);
assert.match(undoDetail, /Desfazer criação da tarefa/);
assert.match(undoDetail, /data-detail-action="undo-brief-task"/);
assert.doesNotMatch(undoDetail, /Criar tarefa da sugestão/);

const blockedDetail = renderPublicationDetail({
  item,
  act,
  parties: '',
  linkedTasks: [],
  privileged: true,
  aiClassifier: panel,
  briefTask: { blocked: { title: 'Recurso: 5009754-74.2026.8.21.9000', reason: 'Tarefa criada por outra pessoa. Peça a ela para desfazer.' } },
  escapeHtml,
  formatDate,
  formatDateTime,
  formatAge
});
assert.match(blockedDetail, /publication-brief-undo is-blocked/);
assert.match(blockedDetail, /Tarefa criada por outra pessoa/);
assert.doesNotMatch(blockedDetail, /data-detail-action="undo-brief-task"/);
assert.doesNotMatch(blockedDetail, /Criar tarefa da sugestão/);

const noAiDetail = renderPublicationDetail({
  item,
  act,
  parties: '',
  linkedTasks: [],
  privileged: true,
  aiClassifier: null,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatAge
});
assert.match(noAiDetail, /Leitura do teor/);
assert.doesNotMatch(noAiDetail, /Criar tarefa da sugestão/);

const hostileItem = {
  ...item,
  title: '<img src=x onerror=alert(1)>',
  text: '<script>alert(1)</script> RECURSO DESPROVIDO. Nada mais.'
};
const hostileDetail = renderPublicationDetail({
  item: hostileItem,
  act,
  parties: '<b>Parte</b>',
  linkedTasks: [],
  privileged: true,
  aiClassifier: panel,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatAge
});
assert.equal(hostileDetail.includes('<script>alert(1)</script>'), false, 'Texto hostil não pode virar HTML.');
assert.equal(hostileDetail.includes('<img src=x'), false, 'Título hostil não pode virar HTML.');
assert.match(hostileDetail, /&lt;script&gt;/);

const row = renderPublicationRow({
  item,
  act,
  parties: '',
  selected: false,
  aiClassifier: { enabled: true, action: 'suggest', area: 'Cível', priority: 'alta', areaConfidence: 0.9, deadlineSignal: 'sim' },
  escapeHtml,
  formatDate,
  formatDateTime,
  formatAge
});
assert.match(row, /publication-today-chip/);
assert.match(row, /Hoje · prioridade alta/);

console.log('V Bloco de leitura, botão, desfazer, estado sem IA, escaping e chip da fila.');
console.log('\n>>> LEITURA RÁPIDA NA TELA: PASS <<<\n');
