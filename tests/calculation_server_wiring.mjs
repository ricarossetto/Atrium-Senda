import assert from 'node:assert/strict';
import { startTestServer } from './helpers.mjs';

const server = await startTestServer();
try {
  const unknown = await fetch(`${server.baseUrl}/api/calc/nao-existe`);
  assert.equal(unknown.status, 404, 'Rota desconhecida sob /api/calc/ deve ser tratada pelo handler de cálculos.');
  const unknownBody = await unknown.json();
  assert.equal(unknownBody.message, 'Recurso de cálculos não encontrado.');

  const catalog = await fetch(`${server.baseUrl}/api/calc/catalog`);
  assert.equal(catalog.status, 401, 'Catálogo de cálculos exige sessão autenticada.');

  const series = await fetch(`${server.baseUrl}/api/calc/series/IPCA?from=2026-01-01&to=2026-04-30`);
  assert.equal(series.status, 401, 'Consulta de série exige sessão autenticada.');

  const preview = await fetch(`${server.baseUrl}/api/calc/civel/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ atualizacaoAte: '2026-04-20', itens: [] })
  });
  assert.equal(preview.status, 401, 'Preview cível exige sessão autenticada antes de validar o corpo.');
  console.log('Wiring dos cálculos aprovado: servidor inicia, rotas /api/calc registradas e autenticação exigida PASS.');
} finally {
  await server.stop();
}
