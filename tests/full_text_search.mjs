import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { generateTotp } from '../lib/security.mjs';
import { runStateMigrations } from '../lib/state-migrations.mjs';
import {
  SEARCH_INDEX_VERSION,
  SearchIndex,
  normalizeSearchText,
  parseDefaultPromptsSource
} from '../lib/search-index.mjs';
import { postJson, startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — DERIVED FULL-TEXT SEARCH');
console.log('===============================================================\n');

assert.equal(normalizeSearchText('  AÇÃO   PREVIDENCIÁRIA  '), 'acao previdenciaria');
const defaultPrompts = parseDefaultPromptsSource(await readFile(new URL('../js/prompts-data.js', import.meta.url), 'utf8'));
assert.equal(defaultPrompts.length, 230, 'Catálogo padrão deve ser lido como JSON, sem eval.');

const ocrReads = [];
const unitState = {
  processes: [{ id: 'process-unit', number: '5001234-12.2026.4.04.0001', client: 'Cliente Aurora', court: 'TRF4', lastMovement: 'Sentença previdenciária disponibilizada', feeStatus: 'em_dia', movements: [{ id: 'movement-unit', description: 'Conclusão judicial rara para conferência' }], expenses: [{ id: 'expense-unit', description: 'Custas de diligência rara', amount: 125 }], feeInstallments: [{ id: 'installment-unit', description: 'Parcela turmalina', amount: 500, status: 'pendente', dueDate: '2026-09-20' }], receipts: [{ id: 'receipt-unit', description: 'Recebimento topázio', amount: 250, status: 'recebido', date: '2026-09-01' }] }],
  contacts: [{ id: 'contact-unit', name: 'Áurea Sintética', contactRole: 'cliente', cpf: '000.111.222-33', email: 'aurea@example.test', city: 'Ijuí' }],
  leads: [{ id: 'lead-unit', client: 'Áurea Sintética', serviceType: 'Planejamento previdenciário', status: 'novo', notes: 'Entrevista sintética inicial' }],
  intimations: [{ id: 'publication-unit', title: 'Intimação sobre benefício', process: '5001234-12.2026.4.04.0001', text: 'Manifestação expressa sem prazo inferido', workNotes: [{ id: 'note-unit', text: 'Estratégia interna rara e supervisionada' }] }],
  tasks: [{ id: 'task-unit', title: 'Revisar cálculo previdenciário', description: 'Conferência humana obrigatória', responsible: 'Equipe' }],
  agenda: [{ id: 'appointment-unit', processId: 'process-unit', title: 'Pauta sintética de conferência', date: '2026-09-08', time: '14:00' }],
  documents: [{ id: 'document-unit', name: 'laudo-aurora.pdf', ownerType: 'process', ownerId: 'process-unit', documentType: 'Laudo', checksum: 'a'.repeat(64), metadata: { origin: 'Digitalização local', tags: ['perícia rara'], summary: 'Resumo documental quartzo.', context: 'Contexto supervisionado âmbar.', entities: [{ type: 'organization', label: 'Entidade Jade', identifier: 'ID-JADE' }] }, intelligence: { ocr: { checksum: 'b'.repeat(64) } } }],
  customPrompts: [{ id: 'prompt-unit', title: 'Síntese previdenciária supervisionada', category: 'Previdenciário', prompt: 'Organize o relatório sem inventar fatos.' }],
  audit: [
    { id: 'audit-unit', at: '2026-09-01T12:00:00.000Z', actor: 'Advogada Teste', action: 'Documento revisado', detail: 'Revisão supervisionada concluída.' },
    { id: 'audit-secret', at: '2026-09-01T12:01:00.000Z', actor: 'Sistema', action: 'Configuração protegida', detail: 'apiKey=AIzaSyntheticSecretMustNeverBeIndexed123456' }
  ]
};

const index = new SearchIndex({
  defaultPrompts: [],
  loadOcrText: async checksum => {
    ocrReads.push(checksum);
    return 'Conteúdo OCR ultrarraro do laudo médico.';
  },
  snapshot: { version: 999, entries: 'corrompidas' },
  now: () => '2026-09-01T12:30:00.000Z'
});
let sync = await index.ensure({ state: unitState, revision: 'revision-1' });
assert.equal(sync.rebuilt, true);
assert.equal(sync.reason, 'corrupt');
assert.equal(index.status.version, SEARCH_INDEX_VERSION);
assert.equal(index.status.entryCount, 16);
assert.equal(ocrReads.length, 1);
assert.equal(index.search('ultrarraro')[0].entityType, 'document');
assert.equal(index.search('ÁUREA')[0].id, 'contact-unit', 'Busca deve ser accent/case insensitive e ranquear título.');
assert.equal(index.search('50012341220264040001').some(item => item.entityType === 'process'), true, 'CNJ sem pontuação deve localizar o processo.');
assert.equal(index.search('00011122233')[0].entityType, 'contact', 'CPF sem pontuação deve localizar o contato.');
assert.equal(index.search('Pauta sintética')[0].entityType, 'appointment');
assert.equal(index.search('Estratégia interna rara')[0].entityType, 'note');
assert.equal(index.search('Conclusão judicial rara')[0].entityType, 'movement');
assert.equal(index.search('Custas diligência rara')[0].entityType, 'financial');
assert.equal(index.search('Parcela turmalina')[0].entityType, 'financial');
assert.equal(index.search('Recebimento topázio')[0].entityType, 'financial');
assert.equal(index.search('Cliente Aurora').some(item => item.entityType === 'document'), true, 'Documento deve herdar contexto de processo e cliente sem duplicar cadastro.');
for (const query of ['perícia rara', 'quartzo', 'âmbar', 'Entidade Jade', 'ID-JADE', 'Digitalização local']) {
  assert.equal(index.search(query).some(item => item.entityType === 'document'), true, `Metadado documental deve ser localizável por ${query}.`);
}
assert.equal(index.search('AIzaSyntheticSecretMustNeverBeIndexed123456').length, 0, 'Segredo explícito deve ser descartado do índice.');
assert.deepEqual(index.search('previdenciária').map(item => item.relevance), [...index.search('previdenciária').map(item => item.relevance)].sort((a, b) => b - a));

sync = await index.ensure({ state: unitState, revision: 'revision-1' });
assert.equal(sync.synchronized, false);
assert.equal(ocrReads.length, 1, 'Revision corrente não relê OCR.');

const changedState = structuredClone(unitState);
changedState.tasks.push({ id: 'task-added', title: 'Protocolar manifestação supervisionada' });
sync = await index.ensure({ state: changedState, revision: 'revision-2' });
assert.equal(sync.synchronized, true);
assert.equal(sync.changes.added, 1);
assert.ok(sync.changes.reused >= 16);
assert.equal(ocrReads.length, 1, 'Checksum OCR estável deve reutilizar cache.');
assert.equal(index.search('Protocolar manifestação')[0].id, 'task-added');

const rebuilt = await index.rebuild({ state: changedState, revision: 'revision-2' });
assert.equal(rebuilt.rebuilt, true);
assert.equal(rebuilt.reason, 'explicit');
assert.equal(ocrReads.length, 2, 'Rebuild explícito relê a fonte cifrada derivada.');

const withoutDocument = structuredClone(changedState);
withoutDocument.documents = [];
sync = await index.ensure({ state: withoutDocument, revision: 'revision-3' });
assert.equal(sync.changes.removed, 1);
assert.equal(index.ocrCache.size, 0, 'Checksum OCR sem documento ativo deve sair do cache derivado em memória.');

const server = await startTestServer();
try {
  const auth = await setupMaster(server.baseUrl);
  const state = runStateMigrations({
    schemaVersion: 9,
    dataVersion: 9,
    processes: [{ id: 'process-search', number: '5009999-11.2026.4.04.0001', client: 'Cliente Horizonte', court: 'TRF4', lastMovement: 'Perícia concluída' }],
    contacts: [{ id: 'contact-search', name: 'Beatriz Horizonte', contactRole: 'cliente', email: 'beatriz@example.test', city: 'Ijuí' }],
    intimations: [{ id: 'publication-search', title: 'Publicação Horizonte', process: '5009999-11.2026.4.04.0001', text: 'Despacho de saneamento publicado' }],
    tasks: [{ id: 'task-search', title: 'Revisar despacho Horizonte', description: 'Tarefa de conferência', responsible: 'Equipe' }],
    documents: [],
    customPrompts: [{ id: 'prompt-search', title: 'Roteiro Horizonte', category: 'Civil', prompt: 'Sintetize os fatos sob supervisão.' }],
    audit: [
      { id: 'audit-search', at: '2026-09-01T13:00:00.000Z', actor: 'Advogada Busca', action: 'Triagem Horizonte concluída', detail: 'Metadados revisados.' },
      { id: 'audit-secret-server', at: '2026-09-01T13:01:00.000Z', actor: 'Sistema', action: 'Configuração protegida', detail: 'token=sk-SyntheticSearchSecret123456789012345' }
    ],
    settings: {}
  }, 'test').state;
  let response = await postJson(`${server.baseUrl}/api/state`, { state, revision: null }, auth.headers);
  assert.equal(response.status, 200);
  let revision = (await response.json()).revision;

  const sourceText = Buffer.from('Relatório local com a expressão xilofone-ultravioleta para localização OCR.', 'utf8');
  response = await postJson(`${server.baseUrl}/api/documents`, {
    revision,
    ownerType: 'process',
    ownerId: 'process-search',
    originalName: 'relatorio-horizonte.md',
    mime: 'text/markdown',
    documentType: 'Relatório',
    documentDate: '2026-09-01',
    contentBase64: sourceText.toString('base64')
  }, auth.headers);
  assert.equal(response.status, 201);
  let payload = await response.json();
  revision = payload.revision;
  const document = payload.document;
  response = await postJson(`${server.baseUrl}/api/documents/${document.id}/ocr`, { revision }, auth.headers);
  assert.equal(response.status, 200);
  revision = (await response.json()).revision;

  response = await fetch(`${server.baseUrl}/api/search?q=Horizonte&limit=30`, { headers: { Cookie: auth.cookie } });
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.index.version, SEARCH_INDEX_VERSION);
  assert.equal(payload.index.sourceRevision, revision);
  assert.equal(payload.index.rebuilt, true);
  assert.deepEqual(new Set(payload.results.map(item => item.entityType)), new Set(['process', 'contact', 'publication', 'task', 'document', 'prompt', 'audit']));
  for (const result of payload.results) {
    assert.ok(result.title);
    assert.ok(result.matchedField);
    assert.equal(Number.isFinite(result.relevance), true);
    assert.equal(Object.hasOwn(result, 'fields'), false, 'Resposta não expõe representação interna do índice.');
  }

  response = await fetch(`${server.baseUrl}/api/search?q=xilofone-ultravioleta`, { headers: { Cookie: auth.cookie } });
  payload = await response.json();
  assert.equal(payload.results[0].id, document.id);
  assert.equal(payload.results[0].matchedField, 'Texto extraído');

  response = await fetch(`${server.baseUrl}/api/search?q=Pesquisa%20e%20produção%20de%20tese`, { headers: { Cookie: auth.cookie } });
  payload = await response.json();
  assert.equal(payload.results.some(item => item.entityType === 'prompt' && item.id === 'p-1'), true, 'Prompts padrão também devem ser indexados.');

  response = await fetch(`${server.baseUrl}/api/search?q=SyntheticSearchSecret`, { headers: { Cookie: auth.cookie } });
  payload = await response.json();
  assert.equal(JSON.stringify(payload.results).includes('SyntheticSearchSecret'), false);

  response = await fetch(`${server.baseUrl}/api/search?q=Horizonte`);
  assert.equal(response.status, 401, 'Busca sem sessão deve ser negada.');
  response = await postJson(`${server.baseUrl}/api/search/rebuild`, {}, { Cookie: auth.cookie, 'Content-Type': 'application/json' });
  assert.equal(response.status, 403, 'Rebuild sem CSRF deve ser negado.');

  const before = await getState(server.baseUrl, auth.cookie);
  response = await postJson(`${server.baseUrl}/api/search/rebuild`, {}, auth.headers);
  assert.equal(response.status, 200);
  payload = await response.json();
  assert.equal(payload.index.rebuilt, true);
  assert.equal(payload.index.sourceRevision, before.revision);
  const after = await getState(server.baseUrl, auth.cookie);
  assert.equal(after.revision, before.revision, 'Rebuild não altera revision canônica.');
  assert.deepEqual(after.state, before.state, 'Rebuild não altera Store nem audit.');

  before.state.tasks.push({ id: 'task-search-new', title: 'Diligência incremental inédita', status: 'triagem' });
  response = await postJson(`${server.baseUrl}/api/state`, { state: before.state, revision: before.revision }, auth.headers);
  assert.equal(response.status, 200);
  const updatedRevision = (await response.json()).revision;
  response = await fetch(`${server.baseUrl}/api/search?q=Diligência%20incremental`, { headers: { Cookie: auth.cookie } });
  payload = await response.json();
  assert.equal(payload.index.sourceRevision, updatedRevision);
  assert.equal(payload.index.synchronized, true);
  assert.equal(payload.results[0].id, 'task-search-new');

  console.log('✓ Busca full-text: doze domínios jurídicos, OCR, contexto, ranking, segredo omitido e sync incremental aprovados.');
} finally {
  await server.stop();
}

async function setupMaster(baseUrl) {
  let response = await postJson(`${baseUrl}/api/auth/setup`, {
    username: 'search.master',
    password: 'Senha-Sintetica-26D!123',
    displayName: 'Advogada Busca Teste'
  });
  assert.equal(response.status, 200);
  const setup = await response.json();
  response = await postJson(`${baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  assert.equal(response.status, 200);
  const verified = await response.json();
  const cookie = response.headers.get('set-cookie').split(';')[0];
  return { cookie, headers: { Cookie: cookie, 'Content-Type': 'application/json', 'X-CSRF-Token': verified.csrfToken } };
}

async function getState(baseUrl, cookie) {
  const response = await fetch(`${baseUrl}/api/state`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  return response.json();
}
