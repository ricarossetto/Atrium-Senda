import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { InpiService } from '../lib/inpi/inpi-service.mjs';
import { createInpiHttpHandler } from '../lib/http/inpi-routes.mjs';
import { createInpiIntegrationFeature } from '../js/features/inpi-integration.js';
import '../js/office-data.js';

test('INPI Service - Extração dinâmica de advogados do estado do ATRIUM', async () => {
  const service = new InpiService({ dataDir: path.resolve('data') });

  const mockState = {
    settings: {
      officeName: 'Rossetto & Associados',
      lawyerName: 'Ricardo de Luca Rossetto',
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
  assert.ok(names.includes('Ricardo de Luca Rossetto'), 'Inclui advogado de settings');
  assert.ok(names.includes('Luiz Fernando Soares Costa'), 'Inclui advogado de terms ativos');
  assert.ok(names.includes('Nícolas Fernando Barbosa'), 'Inclui advogado da equipe');
  assert.ok(names.includes('Samuel Dietrich Batistella'), 'Inclui sócio advogado da equipe');
  assert.ok(!names.includes('Termo Inativo Ignorado'), 'Não inclui termos inativos');
  assert.ok(!names.includes('Maria Assistente'), 'Não inclui funcionários que não são advogados');

  // Verifica termos de busca do Dr. Ricardo Rossetto
  const ricardoMonitor = monitors.find(m => m.label === 'Ricardo de Luca Rossetto');
  assert.ok(ricardoMonitor, 'Monitor do Ricardo encontrado');
  assert.ok(ricardoMonitor.terms.includes('Ricardo de Luca Rossetto'));
  assert.ok(ricardoMonitor.terms.includes('135294'), 'Termos devem conter números puros da OAB');
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
    runScan: async () => { scanCalled = true; return { ok: true, message: 'Sucesso' }; }
  };

  const handler = createInpiHttpHandler({
    service: mockService,
    assertAuthenticated: () => ({ username: 'admin' }),
    readStateEnvelope: async () => ({ state: {} }),
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
    settings: { lawyerName: 'Ricardo de Luca Rossetto', lawyerOab: '135294' }
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
