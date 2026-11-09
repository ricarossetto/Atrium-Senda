import assert from 'node:assert/strict';
import { resolveClassifierDecision } from '../lib/ai/classifier-decision-chain.mjs';

console.log('--- Iniciando Testes: Cadeia de decisão do classificador (JEV → provedor → CLI) ---');

const jevOk = { answers: { focus: { type: 'choice', choice: 'tasks', confidence: 0.9 } }, transport: 'jev' };
const providerOk = { answers: { focus: { type: 'choice', choice: 'tasks', confidence: 0.6 } }, transport: 'provider-degraded' };
const headlessOk = { answers: { focus: { type: 'choice', choice: 'tasks', confidence: 0.5 } }, transport: 'headless' };

const unauthorized = () => {
  const error = new Error('Falha do provedor Jev (HTTP 401).');
  error.code = 'UNAUTHORIZED';
  return error;
};

// [C1] JEV responde: é a fonte usada e o provedor do escritório não é chamado.
{
  let providerCalls = 0;
  const result = await resolveClassifierDecision({
    jev: async () => jevOk,
    provider: async () => { providerCalls += 1; return providerOk; }
  });
  assert.deepEqual(result, jevOk, 'resultado do JEV preservado');
  assert.equal(providerCalls, 0, 'provedor não é chamado quando o JEV responde');
  console.log('  OK: JEV respondendo é a fonte; nenhum transporte extra é acionado.');
}

// [C2] Chave revogada (401): degrada de forma declarada e o recurso continua.
{
  const failures = [];
  let providerCalls = 0;
  const result = await resolveClassifierDecision({
    jev: async () => { throw unauthorized(); },
    provider: async () => { providerCalls += 1; return providerOk; },
    onDegrade: failure => failures.push(failure)
  });
  assert.equal(providerCalls, 1, 'provedor do escritório assume a decisão');
  assert.equal(result.transport, 'provider-degraded');
  assert.equal(result.jevUnavailable, 'UNAUTHORIZED', 'a resposta declara que o JEV não foi usado');
  assert.deepEqual(failures, [{ code: 'UNAUTHORIZED' }], 'a degradação é registrada uma vez');
  console.log('  OK: JEV recusado degrada para o provedor do escritório e declara o motivo.');
}

// [C3] JEV indisponível sem erro (sem chave): segue para o provedor sem marcar degradação.
{
  const result = await resolveClassifierDecision({
    jev: async () => null,
    provider: async () => providerOk
  });
  assert.deepEqual(result, providerOk, 'sem chave, o provedor responde sem marca de falha');
  assert.equal(result.jevUnavailable, undefined);
  console.log('  OK: ausência de chave não vira falha declarada.');
}

// [C4] JEV falha e não há provedor: o CLI headless local assume e a falha continua declarada.
{
  const result = await resolveClassifierDecision({
    jev: async () => { throw unauthorized(); },
    provider: async () => null,
    headless: async () => headlessOk
  });
  assert.equal(result.transport, 'headless');
  assert.equal(result.jevUnavailable, 'UNAUTHORIZED');
  console.log('  OK: sem provedor, o CLI headless assume e a origem da degradação permanece explícita.');
}

// [C5] Nada disponível: a cadeia devolve null (o chamador responde 503, sem falso sucesso).
{
  const result = await resolveClassifierDecision({
    jev: async () => { throw unauthorized(); },
    provider: async () => null,
    headless: async () => null
  });
  assert.equal(result, null);
  console.log('  OK: sem transporte, o resultado é null — nunca uma decisão inventada.');
}

// [C6] Aviso de degradação quebrado não interrompe a cadeia.
{
  const result = await resolveClassifierDecision({
    jev: async () => { throw unauthorized(); },
    provider: async () => providerOk,
    onDegrade: () => { throw new Error('aviso indisponível'); }
  });
  assert.equal(result.transport, 'provider-degraded');
  console.log('  OK: falha do aviso não derruba o atendimento.');
}

console.log('\n[PASS] Cadeia de decisão do classificador: degradação declarada, sem falso sucesso.\n');
