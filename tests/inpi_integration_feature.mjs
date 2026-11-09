import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { InpiService } from '../lib/inpi/inpi-service.mjs';
import { createInpiHttpHandler } from '../lib/http/inpi-routes.mjs';
import { createInpiIntegrationFeature } from '../js/features/inpi-integration.js';
import '../js/office-data.js';
import { startTestServer, postJson } from './helpers.mjs';
import { generateTotp } from '../lib/security.mjs';

test('INPI Service - Extração dinâmica de advogados do estado do ATRIUM', async () => {
  const service = new InpiService({ dataDir: path.resolve('data') });

  const mockState = {
    settings: {
      officeName: 'Teste & Associados',
      lawyerName: 'Advogado Teste',
      lawyerOab: 'OAB/RS 135.294'
    },
    terms: [
      { id: 'term-1', name: 'Luiz Fernando Soares Costa', registration: 'OAB/RS 66.379', active: true },
      { id: 'term-2', name: 'Termo Inativo Ignorado', registration: 'OAB/RS 99.999', active: false }
    ],
    configuration: {
      users: [
        { id: 'usr-1', name: 'Nícolas Fernando Barbosa', role: 'Advogado Associado', oab: 'OAB/RS 135.184', status: 'ativo' },
        { id: 'usr-2', name: 'Samuel Dietrich Batistella', role: 'Advogado Sócio', oab: '136553', status: 'ativo' },
        { id: 'usr-3', name: 'Maria Assistente', role: 'Secretária', oab: '', status: 'ativo' }
      ]
    }
  };

  const monitors = service.extractLawyerMonitors(mockState);

  assert.equal(monitors.length, 4, 'Deve extrair exatamente os 4 advogados únicos');

  const names = monitors.map(m => m.label);
  assert.ok(names.includes('Advogado Teste'), 'Inclui advogado de settings');
  assert.ok(names.includes('Luiz Fernando Soares Costa'), 'Inclui advogado de terms ativos');
  assert.ok(names.includes('Nícolas Fernando Barbosa'), 'Inclui advogado da equipe');
  assert.ok(names.includes('Samuel Dietrich Batistella'), 'Inclui sócio advogado da equipe');
  assert.ok(!names.includes('Termo Inativo Ignorado'), 'Não inclui termos inativos');
  assert.ok(!names.includes('Maria Assistente'), 'Não inclui funcionários que não são advogados');

  // Verifica termos de busca do Dr. Ricardo Teste
  const ricardoMonitor = monitors.find(m => m.label === 'Advogado Teste');
  assert.ok(ricardoMonitor, 'Monitor do Ricardo encontrado');
  assert.ok(ricardoMonitor.terms.includes('Advogado Teste'));
  assert.ok(!ricardoMonitor.terms.includes('135294'), 'Número solto da OAB não identifica ninguém: fica fora dos termos');
  assert.ok(ricardoMonitor.terms.includes('OAB/RS 135294'), 'Termos devem conter variação OAB/RS');
});

test('INPI Service - Regras de agendamento da RPI (Terças no final da tarde vs 1ª verificação)', async () => {
  const service = new InpiService({ dataDir: path.resolve('data') });

  // 1. Data do Brasil no fuso de Brasília
  const brDate = service.getCurrentBrazilDate();
  assert.ok(Number.isInteger(brDate.dayOfWeek), 'dayOfWeek deve ser inteiro de 0 a 6');
  assert.ok(Number.isInteger(brDate.hour), 'hour deve ser inteiro de 0 a 23');

  // 2. Status com base limpa
  const status = await service.getStatus({});
  assert.equal(status.ok, true);
  assert.equal(status.sidesystem, 'INPI_RPI_MONITOR');
  assert.equal(status.schedule.publishedDay, 'Terça-feira');
});

test('INPI HTTP Routes - Contratos das rotas sob /api/integrations/inpi/*', async () => {
  let scanCalled = false;
  let persistedCount = 0;
  const mockService = {
    getStatus: async () => ({ ok: true, sidesystem: 'INPI_RPI_MONITOR', monitorsCount: 2 }),
    getDashboardData: async () => ({ ok: true, matches: [{ id: 'match-1', marca: { nome: 'PULO' } }], statistics: { totalMatches: 1 } }),
    extractLawyerMonitors: () => [{ id: 'adv-1', label: 'Dr. Teste' }],
    getAllMonitors: async () => ({
      automatic: [{ id: 'adv-1', label: 'Dr. Teste' }],
      custom: [{ id: 'custom-1', term: 'MARCA X', type: 'marca', label: 'MARCA X' }],
      all: [{ id: 'adv-1', label: 'Dr. Teste' }, { id: 'custom-1', label: 'MARCA X' }]
    }),
    saveCustomMonitor: async ({ term, type }) => ({ id: 'custom-new', term, type }),
    getCustomMonitors: async () => [{ id: 'custom-1', term: 'MARCA X', type: 'marca' }],
    deleteCustomMonitor: async () => [],
    syncMatchesToState: async () => ({ added: 1 }),
    runScan: async () => { scanCalled = true; return { ok: true, syncedToIntimations: 1, message: 'Sucesso' }; }
  };

  const authFlags = [];
  const handler = createInpiHttpHandler({
    service: mockService,
    assertAuthenticated: (_req, requireCsrf) => { authFlags.push(Boolean(requireCsrf)); return { username: 'admin', role: 'admin' }; },
    readStateEnvelope: async () => ({ state: {}, revision: 'revision-synthetic' }),
    persistStateEnvelope: async envelope => { assert.equal(envelope.revision, 'revision-synthetic'); persistedCount++; },
    readJson: async () => ({ limit: 1 }),
    json: (res, code, data) => {
      res.statusCode = code;
      res.body = data;
    }
  });

  // Teste GET status
  const resStatus = {};
  const handledStatus = await handler({ method: 'GET' }, resStatus, new URL('http://localhost/api/integrations/inpi/status'));
  assert.equal(handledStatus, true);
  assert.equal(resStatus.statusCode, 200);
  assert.equal(resStatus.body.sidesystem, 'INPI_RPI_MONITOR');

  // Teste GET data
  const resData = {};
  const handledData = await handler({ method: 'GET' }, resData, new URL('http://localhost/api/integrations/inpi/data'));
  assert.equal(handledData, true);
  assert.equal(resData.statusCode, 200);
  assert.equal(resData.body.matches.length, 1);
  assert.equal(persistedCount, 1, 'GET data deve persistir somente quando importar nova ocorrência, preservando a revisão lida');

  // Teste GET monitors
  const resMonitors = {};
  const handledMonitors = await handler({ method: 'GET' }, resMonitors, new URL('http://localhost/api/integrations/inpi/monitors'));
  assert.equal(handledMonitors, true);
  assert.equal(resMonitors.statusCode, 200);
  assert.equal(resMonitors.body.count, 2);
  assert.equal(resMonitors.body.automatic.length, 1);
  assert.equal(resMonitors.body.custom.length, 1);

  // Teste POST scan
  const resScan = {};
  const handledScan = await handler({ method: 'POST' }, resScan, new URL('http://localhost/api/integrations/inpi/scan'));
  assert.equal(handledScan, true);
  assert.equal(resScan.statusCode, 200);
  assert.equal(scanCalled, true);
  assert.equal(persistedCount, 2, 'POST scan deve persistir novas ocorrências com a revisão lida');

  // Mutações de monitores INPI exigem CSRF (requireCsrf=true) como a rota de scan.
  authFlags.length = 0;
  const resCreateMonitor = {};
  const handledCreateMonitor = await handler({ method: 'POST' }, resCreateMonitor, new URL('http://localhost/api/integrations/inpi/custom-monitors'));
  assert.equal(handledCreateMonitor, true);
  assert.equal(authFlags.length, 1);
  assert.equal(authFlags[0], true, 'POST custom-monitors deve exigir CSRF.');
  const resDeleteMonitor = {};
  const handledDeleteMonitor = await handler({ method: 'POST' }, resDeleteMonitor, new URL('http://localhost/api/integrations/inpi/custom-monitors/delete'));
  assert.equal(handledDeleteMonitor, true);
  assert.equal(authFlags.length, 2);
  assert.equal(authFlags[1], true, 'DELETE custom-monitors deve exigir CSRF.');
});

test('INPI Service - Status da última varredura é honesto e sanitizado', async () => {
  const testDir = path.resolve('data', 'test-inpi-status');
  const service = new InpiService({ dataDir: testDir });
  await service.persistScanMetadata({
    status: 'ERROR',
    error: 'Falha de rede\ntrace interno não deve aparecer',
    completedAt: '2026-09-15T20:00:00.000Z'
  });

  const status = await service.getStatus({});
  assert.equal(status.lastScanStatus, 'ERROR');
  assert.equal(status.healthy, false);
  assert.equal(status.lastScanCompletedAt, '2026-09-15T20:00:00.000Z');
  assert.equal(status.lastScanError, 'Falha de rede trace interno não deve aparecer');
  assert.notEqual(status.lastScanError.includes('\n'), true);
});

test('INPI Service - Estado transitório da varredura é isolado por workspace', async () => {
  let activeDir = path.resolve('data', 'test-inpi-workspace-a');
  const service = new InpiService({ resolveDataDir: () => activeDir });
  service.getScanState().lastScan = { status: 'ERROR', error: 'Falha sintética A', completedAt: '2026-09-15T20:00:00.000Z' };
  assert.equal((await service.getStatus({})).lastScanStatus, 'ERROR');
  activeDir = path.resolve('data', 'test-inpi-workspace-b');
  const statusB = await service.getStatus({});
  assert.notEqual(statusB.lastScanError, 'Falha sintética A');
  assert.equal(statusB.lastScanStatus, 'NEVER');
});

test('INPI Office Data - Integração registrada no catálogo padrão de integrações', () => {
  const officeData = globalThis.OFFICE_DEFAULT_DATA || {};
  const inpiIntegration = (officeData.integrations || []).find(i => /inpi|rpi/i.test(i.name));
  assert.ok(inpiIntegration, 'INPI / RPI Marcas deve estar registrado em office-data.js');
  assert.equal(inpiIntegration.status, 'Ativo');
});

test('INPI Frontend Feature - Lógica de filtros, ordenação e exibição de resultados', async () => {
  const elements = new Map();
  const getOrCreate = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        id,
        textContent: '',
        innerHTML: '',
        value: '',
        classList: {
          contains: () => false,
          add: () => {},
          remove: () => {},
          toggle: () => {}
        },
        setAttribute: () => {},
        addEventListener: () => {}
      });
    }
    return elements.get(id);
  };

  const mockDoc = {
    getElementById: id => getOrCreate(id),
    addEventListener: () => {}
  };

  const feature = createInpiIntegrationFeature({
    documentRef: mockDoc,
    windowRef: {
      KellerAuth: {
        secureFetch: async url => {
          if (url.includes('/status')) return { ok: true, json: async () => ({ monitors: [{ id: 'adv-1', label: 'Dr. Teste', oab: 'OAB/RS 12345' }] }) };
          if (url.includes('/data')) return {
            ok: true,
            json: async () => ({
              generatedAt: '2026-09-10T12:00:00Z',
              statistics: { totalMatches: 1, totalProcesses: 1, totalRevistas: 1, latestRevista: { numero: '2827' } },
              matches: [{
                id: 'm-1',
                processo: '912345678',
                marca: { nome: 'PULO PARK' },
                revista: { numero: '2827', data: '2026-09-10' },
                monitores: [{ id: 'adv-1', label: 'Dr. Teste' }],
                despachos: [{ codigo: 'IPAS005', nome: 'Publicação de pedido de registro', texto: 'Texto da publicação' }],
                classes: [{ codigo: '41', status: 'Deferido', especificacao: 'Serviços de recreação' }],
                requerentes: [{ nome: 'Empresa Modelo Ltda', uf: 'RS' }],
                procuradores: ['Dr. Teste']
              }]
            })
          };
          return { ok: true, json: async () => ({}) };
        }
      }
    },
    showToast: () => {}
  });

  assert.ok(feature.init(), 'Inicialização do feature');
  await feature.openModal();

  const elMatches = mockDoc.getElementById('inpiMetricMatches');
  assert.equal(elMatches.textContent, '1', 'Deve exibir 1 ocorrência');

  const elResults = mockDoc.getElementById('inpiResultsList');
  assert.ok(elResults.innerHTML.includes('PULO PARK'), 'Card deve renderizar a marca');
  assert.ok(elResults.innerHTML.includes('912345678'), 'Card deve conter o número do processo');
  assert.ok(elResults.innerHTML.includes('RPI 2827'), 'Card deve exibir o número da RPI');
});

test('INPI Service - Gestão de termos personalizados (marcas, processos, outros advogados)', async () => {
  const testDir = path.resolve('data', 'test-inpi-custom');
  const service = new InpiService({ dataDir: testDir });

  // 1. Salvar monitor de marca
  const marcaMon = await service.saveCustomMonitor({ term: 'ATRIUM PRO', type: 'marca' });
  assert.ok(marcaMon.id.startsWith('custom-'));
  assert.equal(marcaMon.term, 'ATRIUM PRO');
  assert.equal(marcaMon.type, 'marca');

  // 2. Salvar monitor de processo
  const procMon = await service.saveCustomMonitor({ term: '930.123.456', type: 'processo' });
  assert.equal(procMon.type, 'processo');

  // 3. Salvar monitor de outro advogado
  const advMon = await service.saveCustomMonitor({ term: 'Dra. Maria Advogada', type: 'advogado' });
  assert.equal(advMon.type, 'advogado');

  // 4. Listar
  const customList = await service.getCustomMonitors();
  assert.equal(customList.length, 3);

  // 5. Obter todos os monitores combinados
  const mockState = {
    settings: { lawyerName: 'Advogado Teste', lawyerOab: '000000' }
  };
  const allResult = await service.getAllMonitors(mockState);
  assert.equal(allResult.automatic.length, 1);
  assert.equal(allResult.custom.length, 3);
  assert.equal(allResult.all.length, 4);

  // Verifica termos gerados para o processo (com e sem pontuação)
  const preparedProc = allResult.all.find(m => m.id === procMon.id);
  assert.ok(preparedProc.terms.includes('930.123.456'));
  assert.ok(preparedProc.terms.includes('930123456'));

  // 6. Excluir monitor
  const afterDelete = await service.deleteCustomMonitor(marcaMon.id);
  assert.equal(afterDelete.length, 2);
  assert.ok(!afterDelete.some(m => m.id === marcaMon.id));

  // Limpeza
  await service.deleteCustomMonitor(procMon.id);
  await service.deleteCustomMonitor(advMon.id);
});

test('INPI - Integração completa nos menus Fontes Monitoradas e Integrações', async () => {
  // 1. Verifica presença do inpi-rpi nas fontes padrão do Store
  const { sampleState } = await import('../js/core/store.js');
  assert.ok(Array.isArray(sampleState.sources), 'sampleState.sources deve ser array');
  const inpiSource = sampleState.sources.find(s => s.id === 'inpi-rpi');
  assert.ok(inpiSource, 'Fonte inpi-rpi deve estar registrada nas fontes padrão do Store');
  assert.equal(inpiSource.short, 'INPI');
  assert.equal(inpiSource.status, 'ok');

  // 2. Roteamento de fontes monitoradas
  const { createMonitoringFeature } = await import('../js/features/monitoring.js');
  let inpiPanelOpened = false;
  const monitoring = createMonitoringFeature({
    store: {
      state: {
        terms: [{ id: 'term-1', name: 'Dr. Teste', registration: 'OAB/RS 1234' }],
        sources: [inpiSource],
        settings: {},
        intimations: []
      }
    },
    documentRef: { getElementById: () => null, documentElement: { dataset: { ui: 'v2' } } },
    onOpenInpiPanel: () => { inpiPanelOpened = true; }
  });

  assert.equal(monitoring.sourceRouteKind(inpiSource), 'inpi', 'sourceRouteKind deve classificar inpi-rpi como inpi');
  monitoring.routeSource('inpi-rpi');
  assert.equal(inpiPanelOpened, true, 'routeSource deve abrir o painel INPI');

  // 3. Verificação de elementos no index.html
  const html = await readFile(path.resolve('index.html'), 'utf8');
  assert.ok(html.includes('id="btnOpenInpiFromIntegrations"'), 'index.html deve conter botão para abrir INPI no menu Integrações');
  assert.ok(html.includes('id="btnOpenInpiFromMonitoring"'), 'index.html deve conter botão para abrir INPI no menu Fontes Monitoradas');
  assert.ok(html.includes('id="inpiIntegrationCardStatus"'), 'index.html deve conter status badge do card INPI em Integrações');
  assert.ok(html.includes('class="integration-card card connection-integration-card inpi-integration-card"'), 'index.html deve conter o card INPI em view-integrations');
});

test('INPI Service - Conversão de ocorrência da RPI em intimação e sincronização no acervo', async () => {
  const service = new InpiService({ dataDir: path.resolve('data') });
  const sampleMatch = {
    id: 'match-inpi-test-01',
    processo: '938701029',
    marca: { nome: 'RESERVA CONSÓRCIO' },
    despachos: [{ codigo: 'IPAS005', nome: 'Deferimento do pedido', texto: 'Pedido deferido' }],
    requerentes: [{ nome: 'RESERVA ADMINISTRADORA LTDA', pais: 'BR', uf: 'RJ' }],
    procuradores: ['Ricardo De Luca Teste'],
    classes: [{ codigo: '36', edicao: '12', especificacao: 'Serviços Financeiros' }],
    revista: { numero: '2802', data: '2026-09-15' },
    monitores: [{ label: 'Ricardo De Luca Teste', matchedTerms: ['RICARDO DE LUCA TESTE'] }]
  };

  const intimation = service.convertMatchToIntimation(sampleMatch);
  assert.equal(intimation.source, 'INPI');
  assert.equal(intimation.court, 'INPI · Marcas');
  assert.equal(intimation.origin, 'inpi_rpi');
  assert.equal(intimation.treatmentStatus, 'untreated');
  assert.equal(intimation.processNumber, '938701029');
  assert.match(intimation.text, /RESERVA ADMINISTRADORA LTDA/);
  assert.match(intimation.text, /Ricardo De Luca Teste/);
  assert.match(intimation.text, /Serviços Financeiros/);

  const mockState = { intimations: [] };
  service.getDashboardData = async () => ({ matches: [sampleMatch] });

  const syncResult = await service.syncMatchesToState(mockState);
  assert.equal(syncResult.added, 1);
  assert.equal(mockState.intimations.length, 1);
  assert.equal(mockState.intimations[0].id, 'inpi-match-inpi-test-01');

  // Segunda sincronização: não duplica e preserva tratamento
  mockState.intimations[0].treatmentStatus = 'treated';
  mockState.intimations[0].treatedAt = '2026-09-15T12:00:00.000Z';
  const syncResult2 = await service.syncMatchesToState(mockState);
  assert.equal(syncResult2.added, 0);
  assert.equal(mockState.intimations.length, 1);
  assert.equal(mockState.intimations[0].treatmentStatus, 'treated');
});

test('INPI Service - Reconcilia RPI ativa no acervo por workspace, com reload e idempotência', async () => {
  const workspaceDir = await mkdtemp(path.join(tmpdir(), 'atrium-inpi-reconcile-'));
  try {
    const dashboard = {
      generatedAt: '2026-09-16T12:00:00.000Z',
      matches: [{
        id: 'rpi-reconcile-01',
        processo: '930123456',
        revista: { numero: '2900', data: '2026-09-16' },
        marca: { nome: 'MARCA SINTÉTICA' },
        despachos: [{ nome: 'Publicação de marca', texto: 'Ato publicado na RPI.' }]
      }],
      statistics: { totalMatches: 1, totalProcesses: 1, totalRevistas: 1, latestRevista: { numero: '2900' } },
      revistas: [],
      lastRun: { status: 'SUCCESS' }
    };
    await mkdir(path.join(workspaceDir, 'inpi'), { recursive: true });
    await writeFile(path.join(workspaceDir, 'inpi', 'inpi-dashboard.json'), JSON.stringify(dashboard), 'utf8');

    const service = new InpiService({ dataDir: workspaceDir });
    const state = { sources: [{ id: 'inpi-rpi', active: true }], intimations: [] };
    const first = await service.reconcileDashboardToState(state);
    assert.equal(first.added, 1);
    assert.equal(first.newIntimations.length, 1);
    assert.equal(first.newIntimations[0].origin, 'inpi_rpi');

    state.intimations[0].treatmentStatus = 'treated';
    const reloadedState = { sources: [{ id: 'inpi-rpi', active: true }], intimations: [...state.intimations] };
    const second = await new InpiService({ dataDir: workspaceDir }).reconcileDashboardToState(reloadedState);
    assert.equal(second.added, 0);
    assert.equal(reloadedState.intimations.length, 1);
    assert.equal(reloadedState.intimations[0].treatmentStatus, 'treated');

    const disabledState = { sources: [{ id: 'inpi-rpi', active: false }], intimations: [] };
    const skipped = await service.reconcileDashboardToState(disabledState);
    assert.equal(skipped.skipped, true);
    assert.equal(skipped.added, 0);
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test('INPI - Sync global inclui a fonte ativa e declara falha parcial sem falso sucesso', async () => {
  const serverSource = await readFile(path.join(process.cwd(), 'server.mjs'), 'utf8');
  assert.match(serverSource, /syncActiveInpiToState\(appState,\s*\{\s*scan:\s*syncTrigger\s*===\s*'manual'\s*\}\)/);
  assert.match(serverSource, /inpiService\.isSourceActive\(appState\)/);
  assert.match(serverSource, /const syncPartial\s*=\s*Boolean\(inpiSyncError\s*\|\|\s*inpiSyncResult\?\.ok\s*===\s*false\)/);
  assert.match(serverSource, /partial:\s*syncPartial/);
  assert.match(serverSource, /phase:\s*syncPartial\s*\?\s*'partial'\s*:\s*'done'/);
  assert.match(serverSource, /label:\s*syncPartial\s*\?\s*'Sincronização concluída com avisos'/);
  assert.match(serverSource, /warnings:[\s\S]*source:\s*'inpi-rpi'/);
  assert.match(serverSource, /mergeExternalIntimations\([\s\S]*item\?\.source\s*===\s*'INPI'/);
});

test('INPI - Falha do scanner atravessa sync HTTP real e acompanhamento parcial', async () => {
  const preload = new URL('./fixtures/inpi-sync-failure.mjs', import.meta.url);
  const server = await startTestServer({ env: { NODE_OPTIONS: `--import="${preload.href}"` } });
  try {
    const setupResponse = await postJson(`${server.baseUrl}/api/auth/setup`, {
      username: 'rpi_test', displayName: 'Advogada Teste', email: 'teste@example.test', password: 'Synthetic-Rpi-2026!'
    });
    const setup = await setupResponse.json();
    const verifiedResponse = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
      setupToken: setup.setupToken, code: generateTotp(setup.manualSecret)
    });
    assert.equal(verifiedResponse.status, 200);
    const verified = await verifiedResponse.json();
    const headers = { Cookie: verifiedResponse.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token': verified.csrfToken };
    const envelope = await fetch(`${server.baseUrl}/api/state`, { headers }).then(response => response.json());
    const saved = await postJson(`${server.baseUrl}/api/state`, {
      revision: envelope.revision,
      state: { ...envelope.state, sources: [{ id: 'inpi-rpi', active: true }], processes: [], intimations: [] }
    }, headers);
    assert.equal(saved.status, 200, await saved.clone().text());
    const response = await postJson(`${server.baseUrl}/api/sync`, {}, headers);
    assert.equal(response.status, 200, await response.clone().text());
    const result = await response.json();
    assert.equal(result.partial, true);
    assert.equal(result.warnings[0].source, 'inpi-rpi');
    assert.match(result.warnings[0].message, /Synthetic RPI scanner failure/);
    const progress = await fetch(`${server.baseUrl}/api/sync/status`, { headers }).then(response => response.json());
    assert.equal(progress.phase, 'partial');
    assert.match(progress.label, /avisos/);
    assert.doesNotMatch(progress.detail, /concluída com sucesso/);
  } finally {
    await server.stop();
  }
});
