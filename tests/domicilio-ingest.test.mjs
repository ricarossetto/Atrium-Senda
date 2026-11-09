import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';
import {
  DOMICILIO_SYNC_FILE,
  computeDomicilioWindow,
  emptyDomicilioSyncState,
  markDomicilioCaptured,
  normalizeDomicilioSyncState,
  readDomicilioSyncState,
  writeDomicilioSyncState
} from '../lib/judicial/domicilio/domicilio-sync-state.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — INGESTÃO DO DOMICÍLIO ELETRÔNICO (JANELA + CANÔNICO) ');
console.log('===============================================================\n');

const PASSWORD = 'Domicilio-Sintetico-2026!';
const CNJ = '5001234-56.2024.8.21.0001';

console.log('[C1] Estado durável da janela: 7 dias na primeira captura, 2 dias depois...');
{
  const dir = await mkdtemp(path.join(tmpdir(), 'atrium-domicilio-sync-'));
  try {
    const empty = await readDomicilioSyncState(dir);
    assert.deepEqual(empty, emptyDomicilioSyncState());
    const first = computeDomicilioWindow(empty, { now: new Date('2026-09-21T12:00:00Z') });
    assert.deepEqual(first, { dataInicio: '2026-09-15', dataFim: '2026-09-21', days: 7, primeiraCaptura: true });

    const marked = await markDomicilioCaptured(dir, { now: new Date('2026-09-21T12:00:00Z'), window: first, recebidas: 4, normalizadas: 4 });
    assert.equal(marked.captures, 1);
    assert.equal(marked.firstCapturedAt, '2026-09-21T12:00:00.000Z');
    assert.equal(marked.lastRecebidas, 4);

    const routine = computeDomicilioWindow(await readDomicilioSyncState(dir), { now: new Date('2026-09-21T18:00:00Z') });
    assert.deepEqual(routine, { dataInicio: '2026-09-20', dataFim: '2026-09-21', days: 2, primeiraCaptura: false });

    // Repetir a MESMA janela não duplica contagem nem move a primeira captura.
    const repeated = await markDomicilioCaptured(dir, { now: new Date('2026-09-21T19:00:00Z'), window: routine, recebidas: 1, normalizadas: 1 });
    assert.equal(repeated.captures, 2);
    assert.equal(repeated.firstCapturedAt, '2026-09-21T12:00:00.000Z');
    await markDomicilioCaptured(dir, { now: new Date('2026-09-21T19:30:00Z'), window: routine, recebidas: 1, normalizadas: 1 });
    const afterRepeat = await readDomicilioSyncState(dir);
    assert.equal(afterRepeat.captures, 2, 'Mesma janela repetida não conta como novo ciclo.');

    const file = path.join(dir, DOMICILIO_SYNC_FILE);
    if (process.platform !== 'win32') {
      const mode = (await stat(file)).mode & 0o777;
      assert.equal(mode, 0o600, 'Marcador do Domicílio deve ser privado (0600).');
    }
    const raw = await readFile(file, 'utf8');
    assert.doesNotMatch(raw, /5001234|Cliente|Advogada/, 'Marcador nunca guarda conteúdo judicial ou PII.');
    assert.deepEqual(normalizeDomicilioSyncState({ captures: -3, firstCapturedAt: 42 }), emptyDomicilioSyncState(), 'Valor inválido volta ao padrão.');
    await writeFile(file, '{quebrado', 'utf8');
    assert.deepEqual(await readDomicilioSyncState(dir), emptyDomicilioSyncState(), 'Arquivo corrompido não trava a captura.');
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  console.log('  ✓ Janela primeira/rotina, contagem idempotente, modo 0600 e sem PII.');
}

console.log('[C2] Rotas do coletor: janela autenticada e ingestão oficial...');
{
  const server = await startTestServer({});
  try {
    const unauthenticated = await fetch(`${server.baseUrl}/api/judicial/domicilio/window`);
    assert.equal(unauthenticated.status, 401, 'Janela exige token do coletor.');

    const collectorHeaders = { Authorization: `Bearer ${server.collectorToken}`, 'Content-Type': 'application/json' };
    // O estado do workspace nasce no primeiro uso: o setup cria a base oficial antes do ingest.
    let setupResponse = await postJson(`${server.baseUrl}/api/auth/setup`, { username: `admin-domicilio-${Date.now()}`, displayName: 'Administradora Domicílio', password: PASSWORD });
    const setup = await setupResponse.json();
    setupResponse = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });
    const verified = await setupResponse.json();
    const auth = { Cookie: setupResponse.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json', 'X-CSRF-Token': verified.csrfToken };
    // Workspace em uso tem estado consolidado: cria a base mínima antes do ingest (o
    // primeiro flush do cliente faz isso na vida real).
    const minimalState = {
      version: 1, terms: [], sources: [], intimations: [], tasks: [], processes: [], agenda: [], audit: [],
      contacts: [], leads: [], customPrompts: [], customLinks: [], configuration: {}, settings: { officeName: 'Escritório Sintético' }
    };
    const seeded = await postJson(`${server.baseUrl}/api/state`, { state: minimalState, revision: null }, auth);
    assert.equal(seeded.status, 200, 'Estado sintético inicial precisa ser persistido.');
    const windowResponse = await fetch(`${server.baseUrl}/api/judicial/domicilio/window`, { headers: collectorHeaders });
    assert.equal(windowResponse.status, 200);
    const windowBody = await windowResponse.json();
    assert.equal(windowBody.window.primeiraCaptura, true);
    assert.equal(windowBody.window.days, 7);

    const ingestDenied = await postJson(`${server.baseUrl}/api/judicial/domicilio/ingest`, { comunicacoes: [] });
    assert.equal(ingestDenied.status, 401, 'Ingestão exige token do coletor.');
    const ingestEmpty = await postJson(`${server.baseUrl}/api/judicial/domicilio/ingest`, { comunicacoes: [] }, collectorHeaders);
    assert.equal(ingestEmpty.status, 400, 'Lote vazio é recusado.');

    const comunicacoes = [{
      numeroComunicacao: 'DOM-9001',
      numeroProcesso: CNJ.replace(/\D/g, ''),
      tribunalOrigem: 'TJRS',
      tipoComunicacao: 'Intimação',
      dataComunicacao: '2026-09-18',
      dataFinalCiencia: '2026-09-25',
      prazo: '2026-09-30',
      representantes: [{ nome: 'Advogada Teste', numeroOab: '000000', ufOab: 'RS' }],
      linksDocumentos: ['https://docs.exemplo.test/intimacao.pdf']
    }];
    const ingest = await postJson(`${server.baseUrl}/api/judicial/domicilio/ingest`, { comunicacoes }, collectorHeaders);
    assert.equal(ingest.status, 200, `Ingestão deve aceitar o lote oficial (recebido ${ingest.status}).`);
    const ingestBody = await ingest.json();
    assert.equal(ingestBody.ok, true);
    assert.equal(ingestBody.resumo.normalizadas, 1);
    assert.equal(ingestBody.state.captures, 1);
    assert.equal(ingestBody.persisted.persisted, true, 'Lote precisa ser persistido no estado consolidado na mesma requisição.');

    const windowAfter = await (await fetch(`${server.baseUrl}/api/judicial/domicilio/window`, { headers: collectorHeaders })).json();
    assert.equal(windowAfter.window.primeiraCaptura, false, 'Depois da primeira captura a janela vira rotina (2 dias).');
    assert.equal(windowAfter.window.days, 2);

    // O registro oficial nasce no servidor com identidade `domicilio:` e referências declaradas.
    const stateResponse = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: auth.Cookie } });
    const stateBody = await stateResponse.json();
    const intimation = (stateBody.state?.intimations || []).find(item => item.externalId === 'domicilio:DOM-9001');
    assert.ok(intimation, 'Intimação do Domicílio precisa estar no estado consolidado.');
    assert.equal(intimation.type, 'domicilio');
    assert.equal(intimation.sourceReportedDeadlineAt, '2026-09-30');
    assert.equal(intimation.sourceReportedDeadlineSource, 'domicilio');
    assert.equal(intimation.noticeDeadlineAt, '2026-09-25');
    assert.equal('deadline' in intimation, false, 'Domicílio nunca aplica prazo operativo por si só.');
    assert.equal(intimation.treatmentStatus, 'untreated');
    assert.equal(intimation.unread, true);
    console.log('  ✓ Ingestão normaliza no servidor, persiste no oficial e avança a janela para rotina.');
  } finally {
    await server.stop();
  }
}

console.log('\n>>> DOMICÍLIO ELETRÔNICO (INGESTÃO): PASS <<<\n');
