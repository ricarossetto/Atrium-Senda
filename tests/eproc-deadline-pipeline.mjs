import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collectEprocDeadlines, isVerifiedEprocEmptyState, readEprocDeadlineRows } from '../collector/adapters/eproc.mjs';
import {
  getEprocPanelCollectionErrors,
  getEprocPanelCollectionWarnings,
  reconcileEprocSourceItems
} from '../lib/judicial/eproc-a1-downloader.mjs';

const state = { intimations: [], processes: [], tasks: [] };
const portalId = 'tjrs-eproc-1g';
const firstCollectedAt = '2026-09-15T12:00:00.000Z';
const collectionStatus = {
  open_deadline: { discovered: true, collected: true },
  pending_intimation: { discovered: true, collected: true }
};
const openDeadline = {
  processNumber: '0000001-00.2026.8.21.0001',
  event: 'Evento 42',
  subject: 'Manifestação da parte',
  processDetails: 'Classe sintética',
  sourceText: 'Texto integral sintético do prazo em aberto',
  sentAt: '14/09/2026 10:30',
  deadlineAt: '20/09/2026 23:59',
  sourceAction: 'citacao_intimacao_prazo_aberto_listar',
  sourcePath: '/eproc/controlador.php'
};
const pendingIntimation = {
  processNumber: '0000002-00.2026.8.21.0002',
  event: 'Evento 17',
  subject: 'Intimação sintética',
  sourceText: 'Texto integral sintético da intimação pendente',
  sentAt: '15/09/2026 08:00',
  sourceAction: 'citacao_intimacao_pendente_listar',
  sourcePath: '/eproc/controlador.php'
};

const first = reconcileEprocSourceItems(state, {
  portalId,
  portalLabel: 'TJRS 1G',
  collectedAt: firstCollectedAt,
  openDeadlines: [openDeadline],
  pendingIntimations: [pendingIntimation],
  collectionStatus
});
assert.deepEqual(first, { created: 2, updated: 0, inactive: 0, deadlines: 1, intimations: 1, consolidated: 0 });
assert.equal(state.intimations.length, 2);
assert.equal(state.processes.length, 2);
assert.equal(state.tasks.length, 1, 'Cada prazo aberto deve projetar uma tarefa idempotente com o prazo do eproc.');
assert.equal(state.tasks[0].sourceReportedDeadlineAt, '2026-09-20');
assert.equal(state.tasks[0].deadline, '2026-09-20', 'Prazo declarado pela fonte oficial deve ser aplicado automaticamente.');
assert.equal(state.tasks[0].deadlineSource, 'eproc');
assert.match(state.tasks[0].title, /^Prazo eproc/);
assert.equal(Object.hasOwn(state.tasks[0], 'fatalDeadline'), false);

const deadlineRecord = state.intimations.find(item => item.itemType === 'open_deadline');
assert.ok(deadlineRecord.id.startsWith(`eproc:${portalId}:`));
assert.equal(deadlineRecord.portalId, portalId);
assert.equal(deadlineRecord.processNumber, openDeadline.processNumber);
assert.equal(deadlineRecord.event, openDeadline.event);
assert.equal(deadlineRecord.sourceText, openDeadline.sourceText);
assert.equal(deadlineRecord.sourceReportedDeadlineAt, '2026-09-20');
assert.equal(deadlineRecord.sourceCollectedAt, firstCollectedAt);
assert.equal(deadlineRecord.sourceProvenance.action, openDeadline.sourceAction);
assert.equal(deadlineRecord.sourceProvenance.path, openDeadline.sourcePath);
assert.equal(deadlineRecord.deadline, '2026-09-20', 'Registro deve receber o prazo da fonte oficial.');
assert.equal(deadlineRecord.deadlineSource, 'eproc');
assert.equal(Object.hasOwn(deadlineRecord, 'deadlineAt'), false, 'Campo legado não pode ser reintroduzido.');
assert.equal(Object.hasOwn(deadlineRecord, 'fatalDeadline'), false, 'fatalDeadline permanece decisão humana.');

const stableId = deadlineRecord.id;
deadlineRecord.treatmentStatus = 'in_review';
deadlineRecord.treatmentNote = 'Curadoria humana preservada';
const second = reconcileEprocSourceItems(state, {
  portalId,
  portalLabel: 'TJRS 1G',
  collectedAt: '2026-09-15T13:00:00.000Z',
  openDeadlines: [openDeadline],
  pendingIntimations: [pendingIntimation],
  collectionStatus
});
assert.equal(second.created, 0);
assert.equal(state.intimations.length, 2, 'Sync idempotente não pode duplicar registros.');
assert.equal(deadlineRecord.id, stableId);
assert.equal(deadlineRecord.treatmentStatus, 'in_review');
assert.equal(deadlineRecord.treatmentNote, 'Curadoria humana preservada');
assert.equal(deadlineRecord.sourceEvidence.length, 1, 'Evidência idêntica não deve ser duplicada.');

const third = reconcileEprocSourceItems(state, {
  portalId,
  portalLabel: 'TJRS 1G',
  collectedAt: '2026-09-15T14:00:00.000Z',
  openDeadlines: [],
  pendingIntimations: [pendingIntimation],
  collectionStatus
});
assert.equal(third.inactive, 1);
assert.equal(deadlineRecord.sourceStatus, 'not_present');
assert.equal(deadlineRecord.sourceEvidence.at(-1).status, 'not_present');
assert.equal(state.tasks[0].sourceStatus, 'not_present');
assert.equal(state.tasks[0].active, false);
assert.equal(state.intimations.length, 2, 'Item ausente deve preservar registro e evidência.');

reconcileEprocSourceItems(state, {
  portalId,
  portalLabel: 'TJRS 1G',
  collectedAt: '2026-09-15T15:00:00.000Z',
  openDeadlines: [openDeadline],
  pendingIntimations: [],
  collectionStatus: {
    open_deadline: { discovered: true, collected: true },
    pending_intimation: { discovered: false, collected: false }
  }
});
const pendingRecord = state.intimations.find(item => item.itemType === 'pending_intimation');
assert.equal(pendingRecord.sourceStatus, 'active', 'Falha de coleta não pode marcar item como ausente.');

const reviewTask = state.tasks[0];
reviewTask.title = 'Prazo confirmado pela equipe';
reviewTask.description = 'Análise humana preservada';
reviewTask.deadline = '2026-09-21';
reviewTask.responsible = 'Advogada Teste';
reviewTask.priority = 'importante';
reconcileEprocSourceItems(state, {
  portalId,
  portalLabel: 'TJRS 1G',
  collectedAt: '2026-09-15T16:00:00.000Z',
  openDeadlines: [],
  pendingIntimations: [],
  collectionStatus
});
assert.equal(reviewTask.sourceStatus, 'not_present');
assert.equal(reviewTask.active, true, 'Tarefa já assumida pela equipe não pode desaparecer quando a fonte deixa de listar o item.');
assert.equal(reviewTask.title, 'Prazo confirmado pela equipe');
assert.equal(reviewTask.description, 'Análise humana preservada');
assert.equal(reviewTask.deadline, '2026-09-21');
assert.equal(reviewTask.responsible, 'Advogada Teste');
assert.equal(reviewTask.priority, 'importante');

const errors = getEprocPanelCollectionErrors({
  open_deadline: { collected: true },
  pending_intimation: { collected: false }
}, portalId);
assert.equal(errors.length, 1);
assert.equal(errors[0].itemType, 'pending_intimation');

const notFoundErrors = getEprocPanelCollectionErrors({
  open_deadline: { collected: true },
  pending_intimation: { collected: false, notFound: true }
}, portalId);
assert.equal(notFoundErrors.length, 0, 'Seção indisponível para o usuário não pode virar erro de coleta.');
const sectionWarnings = getEprocPanelCollectionWarnings({
  open_deadline: { collected: true, notFound: false },
  pending_intimation: { collected: false, notFound: true }
});
assert.equal(sectionWarnings.length, 1, 'Seção indisponível deve ser registrada como aviso explícito.');
assert.match(sectionWarnings[0], /Intimações pendentes/);

for (let index = 0; index < 55; index += 1) {
  reconcileEprocSourceItems(state, {
    portalId,
    portalLabel: 'TJRS 1G',
    collectedAt: `2026-09-${String(16 + Math.floor(index / 24)).padStart(2, '0')}T${String(index % 24).padStart(2, '0')}:00:00.000Z`,
    openDeadlines: [{ ...openDeadline, sourceText: `Evidência sintética ${index}` }],
    pendingIntimations: [],
    collectionStatus: {
      open_deadline: { discovered: true, collected: true },
      pending_intimation: { discovered: false, collected: false }
    }
  });
}
assert.ok(deadlineRecord.sourceEvidence.length > 50, 'Histórico de evidência não pode perder entradas antigas após 50 mudanças.');
assert.ok(deadlineRecord.sourceEvidence.some(evidence => evidence.sourceText === openDeadline.sourceText));

class FakeLocator {
  constructor(handlers = {}) { this.handlers = handlers; }
  first() { return this; }
  count() { return Promise.resolve(this.handlers.count ?? 0); }
  isVisible() { return Promise.resolve(this.handlers.visible ?? true); }
  getAttribute(name) { return Promise.resolve(this.handlers.attributes?.[name] ?? null); }
  evaluate() { return Promise.resolve(this.handlers.formAction || ''); }
  click() { return Promise.resolve(this.handlers.click?.()); }
  evaluateAll(callback, provenance) { return Promise.resolve(this.handlers.evaluateAll?.(callback, provenance)); }
  locator(selector) { return this.handlers.locator?.(selector) || new FakeLocator(); }
  nth(index) { return this.handlers.nth?.(index) || new FakeLocator(); }
  selectOption(value) { return Promise.resolve(this.handlers.selectOption?.(value)); }
}

class FakeDeadlinePage {
  constructor({ failPending = false, recognized = true } = {}) {
    this.currentUrl = 'https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=painel_adv_listar';
    this.failPending = failPending;
    this.recognized = recognized;
    this.pageIndex = 0;
    this.loading = false;
    this.observedLoadingState = false;
  }
  url() { return this.currentUrl; }
  async goto(url) {
    if (this.failPending && url.includes('citacao_intimacao_pendente_listar')) throw new Error('Falha sintética na segunda seção.');
    this.currentUrl = url;
    this.pageIndex = 0;
  }
  async waitForLoadState() {}
  async waitForTimeout() {}
  async waitForFunction() {
    this.waitCalls = (this.waitCalls || 0) + 1;
    if (this.settleReady) return true;    const startedAt = Date.now();
    while (this.pageIndex === 0 || this.loading) {
      if (this.loading) this.observedLoadingState = true;
      if (Date.now() - startedAt > 1_000) throw new Error('Transição sintética não confirmada.');
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }
  async textContent() { return 'Painel sintético sem marcador de lista vazia'; }
  async evaluate() { return ''; }
  locator(selector) {
    if (selector === 'table') {
      return new FakeLocator({
        evaluateAll: (_callback, provenance) => provenance === undefined
          ? (this.loading ? 'Cabeçalhos sem linhas durante carregamento' : `assinatura-pagina-${this.pageIndex}`)
          : (this.recognized
            ? { recognized: true, items: [{ ...openDeadline, sourceText: `Página ${this.pageIndex + 1}` }], empty: false }
            : { recognized: false, items: [], empty: false })
      });
    }
    if (selector.startsWith('select#selInfraPaginacaoSuperior')) {
      const optionLocator = new FakeLocator({
        count: 2,
        nth: index => new FakeLocator({ attributes: { value: String(index + 1) } })
      });
      return new FakeLocator({
        count: 1,
        locator: child => child === 'option' ? optionLocator : new FakeLocator(),
        selectOption: value => {
          setTimeout(() => { this.loading = true; }, 20);
          setTimeout(() => {
            this.pageIndex = Number(value) - 1;
            this.loading = false;
          }, 120);
        }
      });
    }
    if (selector.includes('painel_adv_listar')) {
      return new FakeLocator({
        count: 1,
        attributes: { href: 'https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=painel_adv_listar' },
        click: () => { this.currentUrl = 'https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=painel_adv_listar'; }
      });
    }
    if (selector.includes('prazo_aberto_listar')) {
      return new FakeLocator({
        count: 1,
        attributes: { href: 'https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=citacao_intimacao_prazo_aberto_listar' }
      });
    }
    if (selector.includes('pendente_listar')) {
      return new FakeLocator({
        count: 1,
        attributes: { href: 'https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=citacao_intimacao_pendente_listar' }
      });
    }
    return new FakeLocator();
  }
}

assert.equal(isVerifiedEprocEmptyState('Prazos em aberto — 0 registros', 'open_deadline'), true);
assert.equal(isVerifiedEprocEmptyState('Prazos em aberto — 10 registros', 'open_deadline'), false);
assert.equal(isVerifiedEprocEmptyState('Página genérica — 0 registros', 'open_deadline'), false);
assert.equal(isVerifiedEprocEmptyState('Intimações pendentes: não há intimações', 'pending_intimation'), true);
assert.equal(isVerifiedEprocEmptyState('Intimações pendentes: nenhuma intimação encontrada', 'pending_intimation'), true);
assert.equal(isVerifiedEprocEmptyState('Intimações pendentes: não foram encontradas intimações', 'pending_intimation'), true);
assert.equal(isVerifiedEprocEmptyState('Citações pendentes: nenhum registro encontrado', 'pending_intimation'), true);
assert.equal(isVerifiedEprocEmptyState('Intimações pendentes: lista com 3 registros', 'pending_intimation'), false);

const partialStartedAt = Date.now();
const partialPage = new FakeDeadlinePage({ failPending: true });
const partialCollection = await collectEprocDeadlines(partialPage);
assert.ok(Date.now() - partialStartedAt >= 20, 'Paginação deve aguardar a mudança real da tabela, não apenas a seleção do controle.');
assert.equal(partialPage.observedLoadingState, true, 'Teste deve atravessar tabela temporariamente sem linhas.');
assert.equal(partialCollection.collectionStatus.open_deadline.collected, true);
assert.equal(partialCollection.collectionStatus.pending_intimation.collected, false);
assert.equal(partialCollection.openDeadlines.length, 2, 'Todas as páginas confirmadas devem ser preservadas.');
assert.equal(partialCollection.collectionErrors[0].itemType, 'pending_intimation');

const unrecognizedCollection = await collectEprocDeadlines(new FakeDeadlinePage({ recognized: false }));
assert.equal(unrecognizedCollection.collectionStatus.open_deadline.collected, false);
assert.equal(unrecognizedCollection.collectionStatus.pending_intimation.collected, false);
assert.equal(unrecognizedCollection.openDeadlines.length, 0);
assert.match(unrecognizedCollection.collectionErrors[0].error, /não foi reconhecida/i);

// A espera de assentamento da lista roda por secao e nunca quebra o fluxo:
// mesmo quando a lista nao monta, o erro continua honesto em vez de travar.
const settlePage = new FakeDeadlinePage({ recognized: false });
await collectEprocDeadlines(settlePage);
assert.ok((settlePage.waitCalls || 0) >= 2, 'Cada secao deve aguardar a lista assentar.');

const collectorSource = readFileSync(new URL('../collector/adapters/eproc.mjs', import.meta.url), 'utf8');
const deadlineCollector = collectorSource.slice(
  collectorSource.indexOf('export async function collectEprocDeadlines'),
  collectorSource.indexOf('export async function readEprocDeadlineRows')
);
assert.doesNotMatch(deadlineCollector, /eproc1g\.tjrs\.jus\.br|eproc2g\.tjrs\.jus\.br|hash=/i);
assert.match(deadlineCollector, /new URL\(href, page\.url\(\)\)/);
assert.match(deadlineCollector, /hasCnjRow \|\| verifiedEmpty/, 'Estado intermediário sem linhas não pode confirmar paginação completa.');

const downloaderSource = readFileSync(new URL('../lib/judicial/eproc-a1-downloader.mjs', import.meta.url), 'utf8');
const sweepSource = downloaderSource.slice(downloaderSource.indexOf('export async function sweepAndEnrichProcessesWithA1'));
assert.doesNotMatch(sweepSource, /const fresh = await readStateEnvelope/, 'Não pode adotar revisão nova para salvar snapshot antigo.');
assert.match(sweepSource, /saveState\(state, envelopeRevision\)/, 'Persistência deve usar optimistic concurrency com a revisão do snapshot corrente.');

const manualState = { intimations: [], processes: [], tasks: [], settings: { deadlineMode: 'manual' } };
reconcileEprocSourceItems(manualState, {
  portalId,
  portalLabel: 'TJRS 1G',
  collectedAt: firstCollectedAt,
  openDeadlines: [openDeadline],
  pendingIntimations: [],
  collectionStatus
});
assert.equal(manualState.intimations[0].deadline, undefined, 'Modo manual mantém a data apenas como referência.');
assert.equal(manualState.tasks[0].deadline || '', '', 'Modo manual mantém a tarefa sem deadline.');
assert.match(manualState.tasks[0].title, /^Conferir prazo informado pelo eproc/);

// Prazo humano divergente: a coleta registra aviso e nunca sobrescreve o valor da pessoa.
const conflictState = { intimations: [], processes: [], tasks: [] };
reconcileEprocSourceItems(conflictState, {
  portalId,
  portalLabel: 'TJRS 1G',
  collectedAt: firstCollectedAt,
  openDeadlines: [openDeadline],
  pendingIntimations: [],
  collectionStatus
});
const conflictTask = conflictState.tasks[0];
assert.equal(conflictTask.deadline, '2026-09-20');
conflictTask.deadline = '2026-09-22';
reconcileEprocSourceItems(conflictState, {
  portalId,
  portalLabel: 'TJRS 1G',
  collectedAt: '2026-09-16T09:00:00.000Z',
  openDeadlines: [openDeadline],
  pendingIntimations: [],
  collectionStatus
});
assert.equal(conflictTask.deadline, '2026-09-22', 'Prazo editado por pessoa não pode ser sobrescrito pela coleta.');
assert.equal(conflictTask.deadlineConflict.source, 'eproc');
assert.equal(conflictTask.deadlineConflict.sourceValue, '2026-09-20');
assert.equal(conflictTask.deadlineConflict.humanValue, '2026-09-22');
assert.equal(conflictTask.deadlineConflict.mode, 'auto');

// Fonte altera o prazo (suspensão/recesso): a tarefa que veio da fonte acompanha e a
// mudança fica registrada com o valor anterior.
const movedDeadline = { ...openDeadline, deadlineAt: '05/10/2026 23:59' };
const movedState = { intimations: [], processes: [], tasks: [] };
reconcileEprocSourceItems(movedState, {
  portalId,
  portalLabel: 'TJRS 1G',
  collectedAt: firstCollectedAt,
  openDeadlines: [openDeadline],
  pendingIntimations: [],
  collectionStatus
});
const movedTask = movedState.tasks[0];
const movedRecord = movedState.intimations.find(item => item.itemType === 'open_deadline');
assert.equal(movedTask.deadline, '2026-09-20');
assert.equal(Object.hasOwn(movedRecord, 'sourceDeadlineChangedAt'), false, 'Primeira coleta não é mudança de prazo.');
reconcileEprocSourceItems(movedState, {
  portalId,
  portalLabel: 'TJRS 1G',
  collectedAt: '2026-09-17T09:00:00.000Z',
  openDeadlines: [movedDeadline],
  pendingIntimations: [],
  collectionStatus
});
assert.equal(movedTask.deadline, '2026-10-05', 'Mudança declarada pela fonte acompanha a tarefa em modo auto.');
assert.equal(movedRecord.sourceDeadlineChangedAt, '2026-09-17T09:00:00.000Z');
assert.equal(movedRecord.sourceReportedDeadlinePrevious, '2026-09-20');
assert.equal(movedTask.sourceReportedDeadlineAt, '2026-10-05');
assert.equal(Object.hasOwn(movedTask, 'deadlineConflict'), false, 'Sem divergência humana não há aviso.');

console.log('EPROC DEADLINE PIPELINE: PASS');

// Diagnóstico sem PII quando a lista não é reconhecida: executa as funções reais
// contra um DOM falso. O texto de linha nunca pode vazar para a mensagem de erro.
{
  const cell = text => ({ textContent: text, innerText: text, getClientRects: () => [1] });
  const fakeTable = (headers, bodyText) => ({
    querySelectorAll: sel => (sel === 'th' || sel === 'th, td' ? headers : []).map(cell),
    querySelector: sel => sel === 'tr' ? { querySelectorAll: () => headers.map(cell) } : null,
    rows: [{ cells: headers.map(cell), innerText: headers.join(' ') }],
    innerText: bodyText
  });
  const tables = [fakeTable(['Numero', 'Classe'], 'Numero Classe dado-sensivel-xyz sem cnj aqui')];
  const fakeBody = {
    querySelectorAll: sel => sel === 'table' ? tables : [],
    innerText: 'Intimações pendentes dado-sensivel-xyz'
  };
  const fakePage = {
    textContent: async () => 'Intimacoes pendentes',
    locator: sel => sel === 'body'
      ? { evaluate: async fn => fn(fakeBody) }
      : sel === 'table'
        ? { evaluateAll: async (fn, source) => fn(tables, source) }
        : { first: () => ({ count: async () => 0 }) }
  };
  const parsed = await (async () => {
    const prevLocation = globalThis.location;
    const prevDocument = globalThis.document;
    globalThis.location = { href: 'https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=citacao_intimacao_pendente_listar&chave=SEGREDO', pathname: '/eproc/controlador.php' };
    globalThis.document = { title: 'Intimações Pendentes' };
    try {
      return await readEprocDeadlineRows(fakePage, { itemType: 'pending_intimation' });
    } finally {
      globalThis.location = prevLocation;
      globalThis.document = prevDocument;
    }
  })();
  assert.equal(parsed.recognized, false);
  assert.equal(parsed.diagnostic.tableCount, 1);
  assert.equal(parsed.diagnostic.firstHeaders, 'Numero | Classe');
  assert.equal(parsed.diagnostic.sectionHint, 'sim');
  assert.ok(parsed.diagnostic.textLen > 0);
  assert.deepEqual(parsed.diagnostic.pistas, { nenhuma: 'nao', encontrada: 'nao', possui: 'nao', vazia: 'nao', semRegistros: 'nao' });
  assert.ok(parsed.diagnostic.url.includes('/controlador.php'), 'Diagnostico registra onde falhou.');
  assert.ok(!parsed.diagnostic.url.includes('?'), 'Query nunca entra no diagnostico.');
  assert.ok(!JSON.stringify(parsed.diagnostic).includes('SEGREDO'), 'Token de query nao pode vazar.');
  assert.equal(parsed.diagnostic.title, 'Intimações Pendentes');
  console.log('EPROC DIAGNOSTICO SEM PII: PASS');
}
