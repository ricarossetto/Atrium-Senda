import assert from 'node:assert/strict';
import test from 'node:test';
import { createCalcHttpHandler } from '../lib/http/calc-routes.mjs';
import { createCalcSource } from '../lib/calc/source.mjs';
import { normalizeSgsRows } from '../lib/calc/indices.mjs';

const ROWS = normalizeSgsRows([
  { data: '31/01/2025', valor: '0.16' },
  { data: '28/02/2025', valor: '1.31' },
  { data: '31/03/2025', valor: '0.56' }
], 'fixture');

const TABELA = {
  '2025-01': { ipca: 0.0016 },
  '2025-02': { ipca: 0.0131 },
  '2025-03': { ipca: 0.0056 }
};

const ENTRADA = {
  atualizacaoAte: '2025-03-31',
  correcao: { serie: 'IPCA' },
  itens: [{ id: 'principal', especie: 'debito', data: '2025-01-15', valor: '1000.00' }]
};

function montar({ fabrica } = {}) {
  const saidas = [];
  const source = createCalcSource({ fetchSeriesImpl: async () => ROWS });
  const handler = createCalcHttpHandler({
    source,
    assertAuthenticated: () => ({ username: 'teste', role: 'admin' }),
    readJson: async () => ENTRADA,
    json: (res, status, payload) => saidas.push({ status, payload }),
    fabrica
  });
  const req = { method: 'POST', headers: {}, socket: { remoteAddress: '127.0.0.1' } };
  const res = { setHeader() {} };
  return { handler, saidas, req, res };
}

test('rota de conferência devolve o fator oficial da Fábrica', async () => {
  const { handler, saidas, req, res } = montar({
    fabrica: { configured: true, indices: async () => ({ result: TABELA }) }
  });
  const handled = await handler(req, res, new URL('http://local/api/calc/civel/conferencia-oficial'));
  assert.equal(handled, true);
  assert.equal(saidas.length, 1);
  assert.equal(saidas[0].status, 200);
  const conferencia = saidas[0].payload.conferencia;
  assert.equal(conferencia.fontes.length, 1);
  assert.equal(conferencia.fontes[0].status, 'confere');
  assert.equal(conferencia.fontes[0].fatorOficial, '1.018773360000');
  assert.equal(conferencia.resumo.conferem, 1);
});

test('rota declara ausência de configuração da Fábrica', async () => {
  const { handler, saidas, req, res } = montar({
    fabrica: { configured: false, indices: async () => ({ result: TABELA }) }
  });
  await assert.rejects(
    () => handler(req, res, new URL('http://local/api/calc/civel/conferencia-oficial')),
    error => error?.code === 'FABRICA_NOT_CONFIGURED'
  );
  assert.equal(saidas.length, 0);
});
