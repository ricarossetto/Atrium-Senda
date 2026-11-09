import assert from 'node:assert/strict';
import test from 'node:test';
import { collectDjen } from '../collector/adapters/djen.mjs';
import { workspaceCollectorInputs } from '../lib/collectors/collector-context.mjs';
import {
  formatMonitoredProcessNumber,
  isProcessMonitoringTerm,
  monitoringTermProcessDigits
} from '../lib/office/monitoring-scope.mjs';

const PROCESS = '50016207620248210028';
const processTerm = {
  id: 'term-proc',
  type: 'process',
  name: 'Processo de acompanhamento',
  registration: 'Processo 5001620-76.2024.8.21.0028',
  processNumber: PROCESS,
  scope: 'office',
  active: true
};

function djenResponse(items) {
  return new Response(JSON.stringify({ count: items.length, items }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

test('helpers reconhecem e formatam o termo de processo', () => {
  assert.equal(isProcessMonitoringTerm(processTerm), true);
  assert.equal(isProcessMonitoringTerm({ type: 'oab' }), false);
  assert.equal(monitoringTermProcessDigits(processTerm), PROCESS);
  assert.equal(formatMonitoredProcessNumber(PROCESS), '5001620-76.2024.8.21.0028');
});

test('DJEN consulta por numeroProcesso, sem OAB, e captura a publicação', async () => {
  const urls = [];
  const target = { intimations: [], contacts: [], processes: [], tasks: [] };
  const fakeFetch = async url => {
    urls.push(new URL(url));
    return djenResponse([{
      id: 9001,
      numeroProcesso: PROCESS,
      siglaTribunal: 'TJRS',
      tipoComunicacao: 'Intimação',
      data_disponibilizacao: '2026-11-03',
      texto: 'Intimação de teste',
      destinatarios: [{ nome: 'Parte Autora', polo: 'A' }],
      destinatarioadvogados: [{ advogado: { nome: 'Outro Advogado', numero_oab: '999999', uf_oab: 'RS' } }]
    }]);
  };
  const result = await collectDjen({
    url: 'https://comunicaapi.pje.jus.br/api/v1/comunicacao',
    numeroProcesso: PROCESS,
    lookbackDays: 60,
    intimationTrackingSince: '2026-11-01'
  }, { monitoredTerm: processTerm, monitoredTerms: [processTerm] }, target, {
    fetchImpl: fakeFetch,
    sleep: async () => {}
  });

  assert.equal(urls.length, 1);
  assert.equal(urls[0].searchParams.get('numeroProcesso'), PROCESS);
  assert.equal(urls[0].searchParams.has('numeroOab'), false);
  assert.equal(urls[0].searchParams.has('ufOab'), false);
  assert.equal(result.inboxAdded, 1);
  assert.equal(target.intimations[0].process, '5001620-76.2024.8.21.0028');
  assert.deepEqual(target.intimations[0].monitoredTermIds, ['term-proc']);
  assert.equal(target.processes.length, 1);
  // Sem OAB do usuário na publicação, nenhuma parte vira cliente por inferência.
  assert.ok(target.contacts.every(contact => contact.contactRole !== 'cliente'));
});

test('o número do processo vem do termo quando o portal não informa', async () => {
  const urls = [];
  await collectDjen({ url: 'https://comunicaapi.pje.jus.br/api/v1/comunicacao' },
    { monitoredTerm: processTerm }, { intimations: [], contacts: [], processes: [] }, {
      fetchImpl: async url => { urls.push(new URL(url)); return djenResponse([]); },
      sleep: async () => {}
    });
  assert.equal(urls[0].searchParams.get('numeroProcesso'), PROCESS);
});

test('número de processo incompleto é recusado', async () => {
  await assert.rejects(
    collectDjen({ url: 'https://comunicaapi.pje.jus.br/api/v1/comunicacao', numeroProcesso: '123' },
      { monitoredTerm: processTerm }, { intimations: [] }, { fetchImpl: async () => djenResponse([]), sleep: async () => {} }),
    /número do processo/
  );
});

test('termo de processo não entra como advogado no coletor', () => {
  const inputs = workspaceCollectorInputs({
    terms: [
      { id: 'oab', name: 'Advogado', registration: 'OAB/RS 123456', oabUf: 'RS', oabNumber: '123456', primary: true },
      processTerm
    ]
  });
  const names = JSON.stringify(inputs);
  assert.equal(names.includes('Processo de acompanhamento'), false);
});
