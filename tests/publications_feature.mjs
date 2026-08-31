import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { generateTotp } from '../lib/security.mjs';
import {
  ACT_RULES,
  classifyIntimationAct,
  createPublicationsFeature,
  filterPublications,
  formatPublicationAge,
  parsePublicationLocalDate
} from '../js/features/publications.js';
import { isoDate } from '../js/core/store.js';
import { postJson, startTestServer } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const featurePath = path.join(ROOT, 'js', 'features', 'publications.js');
const portalPath = path.join(ROOT, 'js', 'portal.js');
const [featureSource, portalSource] = await Promise.all([
  readFile(featurePath, 'utf8'),
  readFile(portalPath, 'utf8')
]);

console.log('\n===============================================================');
console.log('  ATRIUM — SUÍTE DA FEATURE MODULAR DE PUBLICAÇÕES');
console.log('===============================================================\n');

assert.doesNotMatch(featureSource, /from\s+['"]\.\.\/\.\.\/portal\.js['"]|from\s+['"]\.\.\/portal\.js['"]/, 'A feature não pode importar portal.js.');
assert.match(featureSource, /from ['"]\.\.\/core\/store\.js['"]/, 'A feature deve consumir o Store canônico.');
assert.match(portalSource, /from ['"]\.\/features\/publications\.js['"]/, 'portal.js deve importar a feature modular.');
assert.doesNotMatch(featureSource, /window\.(?:Publications|Intimations)\s*=/, 'A feature não pode criar um novo global.');
assert.doesNotMatch(featureSource, /\/api\/email\/publications/, 'O endpoint legado removido não pode reaparecer.');
assert.match(featureSource, /\/api\/intimations\/email/, 'O endpoint individual canônico deve permanecer.');
assert.match(featureSource, /\/api\/publications\/email\/batch/, 'O endpoint batch canônico deve permanecer.');
assert.match(featureSource, /\/api\/publications\/\$\{encodeURIComponent\(publicationId\)\}\/task/, 'A feature deve usar o endpoint transacional de tarefa.');
assert.doesNotMatch(portalSource, /linkTaskToPublication|linkedTaskIds|treatmentStartedAt\s*=/, 'Portal não pode mutar vínculo ou tratamento da publicação diretamente.');

const wrapperContracts = [
  ['filteredIntimations', 'filteredItems'],
  ['renderInbox', 'renderInbox'],
  ['selectIntimation', 'select'],
  ['renderIntimationDetail', 'renderDetail'],
  ['renderPublicationsMetrics', 'renderMetrics'],
  ['applyTreatmentAction', 'applyTreatmentAction'],
  ['openPublicationsEmailModal', 'openPublicationsEmailModal'],
  ['closePublicationsEmailModal', 'closePublicationsEmailModal']
];
for (const [wrapper, target] of wrapperContracts) {
  const expression = new RegExp(`${wrapper}\\([^)]*\\)\\s*\\{\\s*return getPublicationsFeature\\(\\)\\.${target}\\(`);
  assert.match(portalSource, expression, `App.${wrapper} deve ser apenas um wrapper fino.`);
}
assert.equal((portalSource.match(/createPublicationsFeature\(/g) || []).length, 1, 'A feature deve possuir uma única instância canônica.');
assert.equal((featureSource.match(/filteredItems\(\)\s*\{/g) || []).length, 1, 'A filtragem deve ter uma única implementação pública.');
assert.doesNotMatch(portalSource, /secureFetch\(['"]\/api\/publications\/email\/batch/, 'O batch não pode permanecer implementado no portal.');
assert.doesNotMatch(portalSource, /secureFetch\(['"]\/api\/intimations\/email/, 'O envio individual não pode permanecer implementado no portal.');

const referenceNow = new Date(2026, 7, 28, 10, 0, 0);
const publications = [
  { id: 'untreated-old', title: 'Contestação', publishedAt: '2026-08-20', treatmentStatus: 'untreated' },
  { id: 'untreated-urgent', title: 'Apelação', publishedAt: '2026-08-27', treatmentStatus: 'untreated', urgent: true },
  { id: 'review', title: 'Manifestação', publishedAt: '2026-08-26', treatmentStatus: 'in_review', important: true },
  { id: 'treated', title: 'Decisão', publishedAt: '2026-08-25', treatmentStatus: 'treated' },
  { id: 'discarded', title: 'Edital', publishedAt: '2026-07-01', treatmentStatus: 'discarded' },
  { id: 'fatal', title: 'Prazo explícito', publishedAt: '2026-08-28', treatmentStatus: 'untreated', fatalDeadline: '2026-09-10' }
];

assert.deepEqual(filterPublications(publications, { filter: 'in_review', sort: 'date-desc', now: referenceNow }).map(item => item.id), ['review']);
assert.deepEqual(filterPublications(publications, { filter: 'treated', now: referenceNow }).map(item => item.id), ['treated']);
assert.deepEqual(filterPublications(publications, { filter: 'discarded', now: referenceNow }).map(item => item.id), ['discarded']);
assert.deepEqual(filterPublications(publications, { filter: 'prazo-fatal', now: referenceNow }).map(item => item.id), ['fatal']);
assert.deepEqual(filterPublications(publications, { filter: 'all', cutoff: '7days', sort: 'date-asc', now: referenceNow }).map(item => item.id), ['treated', 'review', 'untreated-urgent', 'fatal']);
assert.deepEqual(filterPublications(publications, { filter: 'untreated', sort: 'priority-urgent', now: referenceNow }).map(item => item.id), ['untreated-urgent', 'untreated-old', 'fatal']);
assert.deepEqual(filterPublications(publications, { filter: 'all', sort: 'date-desc', now: referenceNow }).map(item => item.id), ['fatal', 'untreated-urgent', 'review', 'treated', 'untreated-old', 'discarded']);
assert.deepEqual(filterPublications(publications, { filter: 'all', sort: 'date-asc', now: referenceNow }).map(item => item.id), ['discarded', 'untreated-old', 'treated', 'review', 'untreated-urgent', 'fatal']);

const localDate = parsePublicationLocalDate('2026-08-28');
assert.equal(localDate.getFullYear(), 2026);
assert.equal(localDate.getMonth(), 7);
assert.equal(localDate.getDate(), 28, 'Data YYYY-MM-DD deve permanecer no mesmo dia local.');
assert.equal(formatPublicationAge('2026-08-28', referenceNow), 'Hoje');
assert.equal(formatPublicationAge('2026-08-27', referenceNow), 'Há 1 dia');

const originalTimezone = process.env.TZ;
process.env.TZ = 'America/Sao_Paulo';
try {
  const lateLocalInstant = new Date('2026-08-29T01:30:00.000Z');
  assert.equal(isoDate(0, lateLocalInstant), '2026-08-28', 'isoDate deve preservar o dia civil local após 21h em São Paulo.');
  assert.equal(isoDate(1, lateLocalInstant), '2026-08-29', 'Offset de isoDate deve avançar pelo calendário local.');

  const parsedTimestamp = parsePublicationLocalDate(lateLocalInstant.toISOString());
  assert.equal(parsedTimestamp.getFullYear(), 2026);
  assert.equal(parsedTimestamp.getMonth(), 7);
  assert.equal(parsedTimestamp.getDate(), 28, 'Timestamp ISO deve ser convertido para o dia local do instante, sem truncamento UTC.');

  assert.deepEqual(
    filterPublications(
      [{ id: 'local-today', publishedAt: '2026-08-28', treatmentStatus: 'untreated' }],
      { filter: 'all', cutoff: 'today', now: lateLocalInstant }
    ).map(item => item.id),
    ['local-today'],
    'Filtro de hoje deve usar a fronteira do dia civil local.'
  );
} finally {
  if (originalTimezone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimezone;
}

for (const text of ['apelação', 'embargos de declaração', 'prazo de 15 dias', 'contestação']) {
  const classification = classifyIntimationAct(text);
  assert.equal(Object.hasOwn(classification, 'deadline'), false, `Classificação de "${text}" não pode inferir deadline.`);
  assert.equal(Object.hasOwn(classification, 'days'), false, `Classificação de "${text}" não pode inferir dias.`);
}
assert.equal(ACT_RULES.some(rule => Object.hasOwn(rule, 'deadline') || Object.hasOwn(rule, 'days')), false, 'ACT_RULES não pode conter cálculo jurídico de prazo.');

let listenerRegistrations = 0;
const fakeElement = { addEventListener() { listenerRegistrations += 1; } };
const fakeDocument = {
  getElementById(id) { return id === 'inboxFilters' ? fakeElement : null; },
  querySelectorAll() { return []; },
  body: { style: {} }
};
const fakeStore = { state: { intimations: [], processes: [], tasks: [] }, save() {} };
const isolatedFeature = createPublicationsFeature({
  store: fakeStore,
  documentRef: fakeDocument,
  windowRef: { KellerAuth: {}, fetch() {}, setTimeout },
  navigatorRef: {},
  escapeHtml: String,
  formatDate: String,
  formatDateTime: String,
  showToast() {}
});

fakeStore.state.intimations = [{
  id: 'external-preserve', externalId: 'djen:preserve', title: 'Título anterior', unread: false,
  treatmentStatus: 'treated', treatedBy: 'Advogada Teste', deadline: '2026-09-20', linkedTaskIds: ['task-manual']
}];
const mergedExternal = isolatedFeature.upsertExternalIntimation({
  id: 'external-preserve-new-id', externalId: 'djen:preserve', title: 'Título oficial atualizado', unread: true,
  treatmentStatus: 'untreated', treatedBy: '', deadline: '2026-08-30', linkedTaskIds: []
});
assert.equal(mergedExternal.title, 'Título oficial atualizado', 'Conteúdo oficial mais novo deve atualizar a publicação.');
assert.equal(mergedExternal.unread, false, 'Sincronização não pode remarcar publicação lida como não lida.');
assert.equal(mergedExternal.treatmentStatus, 'treated', 'Sincronização não pode reabrir tratamento humano concluído.');
assert.equal(mergedExternal.deadline, '2026-09-20', 'Sincronização não pode sobrescrever prazo humano explícito.');
assert.deepEqual(mergedExternal.linkedTaskIds, ['task-manual'], 'Sincronização não pode apagar vínculos manuais.');
assert.equal(isolatedFeature.init(), true, 'Primeiro init deve registrar a feature.');
assert.equal(isolatedFeature.init(), false, 'Segundo init deve ser ignorado.');
assert.equal(listenerRegistrations, 1, 'init idempotente deve registrar cada listener uma única vez.');

const treatmentDocument = {
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  body: { style: {} }
};

const conflictStore = {
  revision: 'revision-local',
  state: { intimations: [{ id: 'conflict', treatmentStatus: 'untreated' }], processes: [], tasks: [] },
  save() {}
};
let conflictSyncs = 0;
const conflictToasts = [];
const conflictFeature = createPublicationsFeature({
  store: conflictStore,
  documentRef: treatmentDocument,
  windowRef: {
    KellerAuth: { csrfToken: 'csrf-test' },
    fetch: async () => ({ status: 409, ok: false, json: async () => ({ error: 'Conflito de revision' }) })
  },
  escapeHtml: String,
  formatDate: String,
  formatDateTime: String,
  showToast: (message, type) => conflictToasts.push({ message, type }),
  onSyncAppState: async () => { conflictSyncs += 1; }
});
await conflictFeature.applyTreatmentAction('conflict', 'start_review');
assert.equal(conflictStore.state.intimations[0].treatmentStatus, 'untreated', '409 não pode sobrescrever tratamento local.');
assert.equal(conflictStore.revision, 'revision-local', '409 não pode sobrescrever revision local silenciosamente.');
assert.equal(conflictSyncs, 1, '409 deve preservar a política atual de refresh/sync.');
assert.deepEqual(conflictToasts.at(-1), { message: 'Conflito de revision', type: 'warning' });

const networkStore = {
  revision: 'revision-network',
  state: { intimations: [{ id: 'network', treatmentStatus: 'untreated' }], processes: [], tasks: [] },
  save() {}
};
const networkFeature = createPublicationsFeature({
  store: networkStore,
  documentRef: treatmentDocument,
  windowRef: { KellerAuth: { csrfToken: 'csrf-test' }, fetch: async () => { throw new Error('Falha simulada'); } },
  escapeHtml: String,
  formatDate: String,
  formatDateTime: String,
  showToast() {}
});
await networkFeature.applyTreatmentAction('network', 'start_review');
assert.equal(networkStore.state.intimations[0].treatmentStatus, 'untreated', 'Falha de rede não pode criar estado tratado falso.');

const canonicalIntimation = { id: 'canonical', treatmentStatus: 'treated', treatedBy: 'Advogada Teste' };
const canonicalStore = {
  revision: 'revision-old',
  state: { intimations: [{ id: 'canonical', treatmentStatus: 'in_review' }], processes: [], tasks: [] },
  save() {}
};
const canonicalFeature = createPublicationsFeature({
  store: canonicalStore,
  documentRef: treatmentDocument,
  windowRef: {
    KellerAuth: { csrfToken: 'csrf-test' },
    fetch: async () => ({
      status: 200,
      ok: true,
      json: async () => ({ intimation: canonicalIntimation, revision: 'revision-server', message: 'Tratada' })
    })
  },
  escapeHtml: String,
  formatDate: String,
  formatDateTime: String,
  showToast() {}
});
await canonicalFeature.applyTreatmentAction('canonical', 'mark_treated');
assert.equal(canonicalStore.state.intimations[0], canonicalIntimation, 'Sucesso deve usar o objeto canônico devolvido pelo backend.');
assert.equal(canonicalStore.revision, 'revision-server', 'Sucesso deve adotar a revision devolvida pelo backend.');

const linkedTask = { id: 'task-canonical', intimationId: 'canonical-link', deadline: '' };
const linkedPublication = { id: 'canonical-link', treatmentStatus: 'in_review', linkedTaskIds: ['task-canonical'] };
const linkingRequests = [];
const linkingStore = {
  revision: 'revision-link-old',
  state: { intimations: [{ id: 'canonical-link', treatmentStatus: 'untreated' }], processes: [], tasks: [] },
  save() { throw new Error('Resposta transacional não pode disparar Store.save.'); }
};
const linkingFeature = createPublicationsFeature({
  store: linkingStore,
  documentRef: treatmentDocument,
  windowRef: {
    KellerAuth: { csrfToken: 'csrf-test' },
    fetch: async (_url, options) => {
      linkingRequests.push(JSON.parse(options.body));
      return {
        status: 201,
        ok: true,
        json: async () => ({ task: linkedTask, publication: linkedPublication, revision: 'revision-link-new' })
      };
    }
  },
  escapeHtml: String,
  formatDate: String,
  formatDateTime: String,
  showToast() {}
});
const linkingResult = await linkingFeature.createTaskFromPublication('canonical-link', { id: 'task-canonical', title: 'Tarefa canônica' });
assert.equal(linkingResult.task, linkedTask);
assert.equal(linkingStore.state.tasks[0], linkedTask, 'Frontend deve adotar a tarefa canônica da resposta.');
assert.equal(linkingStore.state.intimations[0], linkedPublication, 'Frontend deve adotar a publicação canônica da resposta.');
assert.equal(linkingStore.revision, 'revision-link-new');
assert.deepEqual(linkingRequests[0], {
  publicationId: 'canonical-link',
  revision: 'revision-link-old',
  task: { id: 'task-canonical', title: 'Tarefa canônica' }
});

const server = await startTestServer();
const browser = await chromium.launch({ headless: true });

try {
  const moduleResponse = await fetch(`${server.baseUrl}/js/features/publications.js`);
  assert.equal(moduleResponse.status, 200, 'O módulo da feature deve responder 200.');
  assert.match(moduleResponse.headers.get('content-type') || '', /^(text|application)\/javascript\b/i, 'O módulo deve usar MIME JavaScript.');

  const password = 'Senha-Teste-Publicacoes-2026!';
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_publicacoes',
    displayName: 'Advogada Teste',
    email: 'advogada@example.test',
    password
  });
  const setup = await response.json();
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  assert.equal(response.status, 200, 'Setup administrativo da fixture deve concluir.');
  const cookiePair = response.headers.get('set-cookie').split(';')[0];
  const separator = cookiePair.indexOf('=');

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'pt-BR' });
  await context.addCookies([{
    name: cookiePair.slice(0, separator),
    value: cookiePair.slice(separator + 1),
    url: server.baseUrl
  }]);
  const page = await context.newPage();
  const pageErrors = [];
  const batchRequests = [];
  const individualRequests = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const nativeSetTimeout = globalThis.setTimeout;
    globalThis.__publicationConflictReloads = 0;
    globalThis.setTimeout = function (handler, timeout, ...args) {
      if (timeout === 700) {
        globalThis.__publicationConflictReloads += 1;
        return 0;
      }
      return nativeSetTimeout.call(this, handler, timeout, ...args);
    };
    localStorage.setItem('jurisflow_tour_completed', 'true');
    localStorage.setItem('jurisflow_tour_seen', 'true');
    localStorage.setItem('atrium_tour_seen', 'true');
  });
  await page.route('**/api/publications/email/batch', async route => {
    batchRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, message: 'Boletim enviado.', emailHtml: '<p>Boletim canônico</p>', emailText: 'Boletim canônico' })
    });
  });
  await page.route('**/api/intimations/email', async route => {
    individualRequests.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });

  await page.addInitScript(() => localStorage.setItem('atrium:ui:mode', 'classic'));
  await page.goto(server.baseUrl, { waitUntil: 'networkidle' });
  await page.locator('#appShell:not(.hidden)').waitFor();
  await page.click('.nav-item[data-view="inbox"]');
  await page.locator('#view-inbox.active').waitFor();
  await page.locator('#inboxList .inbox-row').first().waitFor();

  assert.equal(await page.evaluate(() => Boolean(window.Publications || window.Intimations)), false, 'A feature não deve criar globals novos.');
  const renderSummary = await page.evaluate(() => {
    const app = window.portalApp;
    const store = window.Atrium.Store;
    const filtered = app.filteredIntimations();
    return {
      rows: document.querySelectorAll('#inboxList .inbox-row').length,
      filtered: filtered.length,
      untreatedMetric: Number(document.getElementById('pubMetricUntreated')?.textContent || 0),
      dashboardMetric: Number(document.getElementById('metricInbox')?.textContent || 0),
      untreatedStore: store.state.intimations.filter(item => (item.treatmentStatus || 'untreated') === 'untreated').length
    };
  });
  assert.ok(renderSummary.rows > 0, 'A inbox deve renderizar publicações.');
  assert.equal(renderSummary.rows, renderSummary.filtered, 'Inbox e lista filtrada devem usar a mesma implementação.');
  assert.equal(renderSummary.untreatedMetric, renderSummary.untreatedStore, 'Métrica da feature deve refletir o Store.');
  assert.equal(renderSummary.dashboardMetric, renderSummary.untreatedStore, 'Dashboard deve consumir a contagem canônica da feature.');

  await page.locator('#inboxList .inbox-row').first().click();
  await page.locator('#intimationDetail .detail-header').waitFor();
  const unreadResult = await page.evaluate(() => {
    const app = window.portalApp;
    const item = window.Atrium.Store.state.intimations.find(record => record.id === app.selectedIntimation);
    return { unread: item.unread, treatmentStatus: item.treatmentStatus || 'untreated' };
  });
  assert.equal(unreadResult.unread, false, 'Selecionar deve marcar somente unread como false.');
  assert.equal(unreadResult.treatmentStatus, 'untreated', 'Ler não pode tratar a publicação.');

  assert.equal(await page.locator('#btnSendIntimationEmail').count(), 1, 'Admin deve visualizar envio individual.');
  await page.evaluate(() => {
    window.KellerAuth.currentUser.role = 'collaborator';
    window.portalApp.renderIntimationDetail();
  });
  assert.equal(await page.locator('#btnSendIntimationEmail').count(), 0, 'Colaborador não pode visualizar envio individual.');
  await page.evaluate(() => {
    window.KellerAuth.currentUser.role = 'master_admin';
    window.portalApp.renderIntimationDetail();
  });

  await page.click('#btnSendIntimationEmail');
  await page.locator('#publicationEmailBackdrop:not(.hidden)').waitFor();
  assert.equal(individualRequests.length, 0, 'Abrir modal individual não pode enviar requisição.');
  await page.fill('#publicationEmailRecipientInput', 'destino@example.test');
  await page.click('#publicationEmailSubmitBtn');
  await page.locator('#publicationEmailBackdrop.hidden').waitFor({ state: 'attached' });
  assert.equal(individualRequests.length, 1, 'Clique explícito deve enviar uma requisição individual.');
  assert.deepEqual(Object.keys(individualRequests[0]).sort(), ['publicationId', 'recipient']);

  await page.click('#btnEmailPublications');
  await page.locator('#publicationsEmailModalBackdrop:not(.hidden)').waitFor();
  assert.equal(batchRequests.length, 0, 'Abrir modal batch não pode enviar requisição.');
  await page.fill('#emailTargetAddress', 'boletim@example.test');
  await page.click('#btnSendEmailDirect');
  await page.locator('#emailPreviewContainer').getByText('Boletim canônico').waitFor();
  assert.equal(batchRequests.length, 1, 'Clique explícito deve enviar uma requisição batch.');
  assert.deepEqual(Object.keys(batchRequests[0]).sort(), ['publicationIds', 'recipient']);
  assert.ok(batchRequests[0].publicationIds.every(value => typeof value === 'string'), 'Batch deve enviar apenas identificadores.');
  await page.click('#publicationsEmailClose');
  await page.locator('#publicationsEmailModalBackdrop.hidden').waitFor({ state: 'attached' });

  await page.evaluate(() => {
    window.portalApp.selectIntimation('int-demo-1');
    const target = window.Atrium.Store.state.intimations.find(item => item.id === 'int-demo-2');
    if (target) target.unread = true;
  });
  await page.fill('#globalSearch', 'Movimentação processual aguardando análise');
  await page.locator('#globalSearchPalette:not(.hidden)').waitFor();
  const searchResult = page.locator('[data-search-target="intimation"][data-search-id="int-demo-2"]');
  await searchResult.waitFor();
  await searchResult.click();
  await page.locator('#view-inbox.active').waitFor();
  const globalSelection = await page.evaluate(() => {
    const item = window.Atrium.Store.state.intimations.find(record => record.id === 'int-demo-2');
    return {
      selected: window.portalApp.selectedIntimation,
      activeId: document.querySelector('#inboxList .inbox-row.active')?.dataset.intimationId || null,
      unread: item?.unread,
      detail: document.querySelector('#intimationDetail')?.textContent || ''
    };
  });
  assert.equal(globalSelection.selected, 'int-demo-2', 'Global Search deve selecionar a publicação pelo estado canônico da feature.');
  assert.equal(globalSelection.activeId, 'int-demo-2', 'A linha ativa deve acompanhar a seleção feita pela Global Search.');
  assert.equal(globalSelection.unread, false, 'Selecionar pela Global Search deve preservar a política canônica de leitura.');
  assert.match(globalSelection.detail, /Movimentação processual aguardando análise/i, 'O detalhe deve corresponder à publicação selecionada na busca.');

  await page.route('**/api/intimations/int-demo-2/treatment', async route => {
    await route.fulfill({
      status: 409,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Conflito canônico de revisão' })
    });
  });
  const conflictBefore = await page.evaluate(() => {
    const item = window.Atrium.Store.state.intimations.find(record => record.id === 'int-demo-2');
    return { revision: window.Atrium.Store.revision, treatmentStatus: item?.treatmentStatus ?? null };
  });
  await page.evaluate(() => window.portalApp.applyTreatmentAction('int-demo-2', 'start_review'));
  const conflictAfter = await page.evaluate(() => {
    const item = window.Atrium.Store.state.intimations.find(record => record.id === 'int-demo-2');
    return {
      revision: window.Atrium.Store.revision,
      treatmentStatus: item?.treatmentStatus ?? null,
      reloads: globalThis.__publicationConflictReloads
    };
  });
  assert.equal(conflictAfter.revision, conflictBefore.revision, '409 não pode adotar revision fabricada no frontend.');
  assert.equal(conflictAfter.treatmentStatus, conflictBefore.treatmentStatus, '409 não pode aplicar transição local de tratamento.');
  assert.equal(conflictAfter.reloads, 1, 'O wiring real do portal deve agendar exatamente um reload canônico após 409.');
  await page.locator('#toastRegion .toast.warning', { hasText: 'Conflito canônico de revisão' }).waitFor();
  assert.deepEqual(pageErrors, [], `A feature gerou pageerror: ${pageErrors.join(' | ')}`);
  await context.close();
} finally {
  await browser.close();
  await server.stop();
}

console.log('✓ Feature de Publicações aprovada: arquitetura, filtros, datas, render, unread, RBAC, e-mail manual e consumidores externos.');
