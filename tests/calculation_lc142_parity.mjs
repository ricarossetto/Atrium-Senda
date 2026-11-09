/**
 * Suíte de paridade do perfil LC 142 de grau constante.
 *
 * Prova que o motor JavaScript de PRODUÇÃO (`lib/calc/lc142.mjs`) reproduz o
 * oráculo sintético gerado pelo motor Rust de referência, caso a caso.
 *
 * O que este teste NÃO prova: integração HTTP, persistência, PDF, UI mobile,
 * OCR, direito previdenciário ou equivalência com o produto de origem. O escopo
 * é aritmética e guardas do perfil, declarado no cabeçalho do relatório.
 *
 * Execução: node tests/calculation_lc142_parity.mjs [--verbose]
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { runParity, semanticOutcome } from './lc142-parity-core.mjs';
import { calculateScenario } from './lc142-adapter.mjs';
import { calculateCase, parseRulePolicy } from '../lib/calc/lc142.mjs';
import { LC142_ENGINE_ID } from '../lib/calc/lc142-profile.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'lc142-rust-oracle.json');
const ARTIFACTS = path.join(ROOT, 'artifacts', 'lc142-parity');

const verbose = process.argv.includes('--verbose');

function log(message) {
  console.log(message);
}

async function loadOracle() {
  const raw = await fs.readFile(FIXTURE, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const oracle = await loadOracle();

  // Integridade do próprio fixture: se ele foi alterado, a paridade não vale.
  assert.equal(oracle.syntheticOnly, true, 'O oráculo precisa ser explicitamente sintético');
  assert.equal(oracle.sourceCommit, '8ec45ec2501418ec62193d053a63f96caa4b05c3', 'Commit de origem divergente');
  assert.equal(oracle.cases.length, 34, 'O oráculo deve conter 34 cenários');
  assert.equal(
    new Set(oracle.cases.map(item => item.id)).size,
    34,
    'IDs de cenário duplicados no oráculo'
  );
  for (const entry of oracle.cases) {
    assert.equal(entry.synthetic, true, `Caso não sintético: ${entry.id}`);
    assert.ok(['outcome', 'error'].includes(entry.expected.kind), `Envelope inválido: ${entry.id}`);
    parseRulePolicy(entry.calculation.options.rule_policy);
  }

  // O adaptador precisa estar implementado de verdade, não ser o template.
  assert.equal(typeof calculateScenario, 'function', 'Adaptador precisa exportar calculateScenario');

  const report = await runParity(oracle.cases, calculateScenario);

  await fs.mkdir(ARTIFACTS, { recursive: true });
  await fs.writeFile(
    path.join(ARTIFACTS, 'parity-report.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), oracle: oracle.sourceCommit, ...report }, null, 2)}\n`,
    'utf8'
  );

  const porStatus = { experimental: 0, blocked: 0, error: 0 };
  for (const entry of oracle.cases) {
    if (entry.expected.kind === 'error') porStatus.error += 1;
    else porStatus[entry.expected.value.status] += 1;
  }

  log('=== Paridade LC 142 — motor JS de produção x oráculo Rust ===');
  log(`Origem: commit ${oracle.sourceCommit} | engine ${LC142_ENGINE_ID}`);
  log(`Cenários: ${report.cases} | esperado: ${porStatus.experimental} experimentais, ${porStatus.blocked} bloqueios, ${porStatus.error} erros`);
  log(`Resultado: ${report.passed} passaram, ${report.failed} falharam`);
  log(`Escopo: ${report.scope}`);
  log('');

  if (report.failed > 0) {
    log('--- Divergências ---');
    for (const item of report.results) {
      if (item.status === 'passed') continue;
      log(`FAIL ${item.id}\n  ${item.reason}`);
    }
    log('');
    log('A paridade do perfil NÃO foi atingida. Não relaxe o comparador para ficar verde.');
    process.exitCode = 1;
    return;
  }

  if (verbose) {
    for (const item of report.results) log(`PASS ${item.id}`);
    log('');
  }

  // --- Verificações de contrato que o comparador de oráculo não cobre -------

  // 1. Todo bloqueio tem data null e códigos não vazios.
  for (const entry of oracle.cases) {
    if (entry.expected.kind !== 'outcome' || entry.expected.value.status !== 'blocked') continue;
    const output = await calculateScenario(structuredClone(entry.calculation));
    assert.equal(output.status, 'blocked', `${entry.id}: esperava bloqueio`);
    assert.equal(output.data, null, `${entry.id}: bloqueio não pode carregar dado`);
    assert.ok(output.blockers.length > 0, `${entry.id}: bloqueio sem código`);
    for (const blocker of output.blockers) {
      assert.ok(blocker.code, `${entry.id}: blocker sem code`);
      assert.ok(blocker.field, `${entry.id}: blocker sem field`);
    }
  }

  // 2. Nenhum envelope experimental devolve RMI sem elegibilidade, e o
  //    coeficiente declarado nunca é recalculado por idade/tempo.
  for (const entry of oracle.cases) {
    if (entry.expected.kind !== 'outcome' || entry.expected.value.status !== 'experimental') continue;
    const output = await calculateScenario(structuredClone(entry.calculation));
    const native = output.data.native_result;
    if (native.pcd.tempo_atingido_no_cenario === false) {
      assert.equal(native.resumo.rmi, null, `${entry.id}: RMI não pode existir sem requisito`);
    }
    assert.equal(native.resumo.coeficiente, '100.00', `${entry.id}: coeficiente divergente`);
    assert.equal(native.parametros.coeficiente, '100.00', `${entry.id}: parâmetro divergente`);
    for (const parcela of native.correcao.parcelas) {
      assert.ok(
        ['imported', 'declared_missing_minimum', 'declared_projection', 'reviewed_overlay'].includes(
          parcela.origem
        ),
        `${entry.id}: origem de parcela desconhecida ${parcela.origem}`
      );
      assert.ok(
        Number.isInteger(parcela.dias) && parcela.dias >= 0 && parcela.dias <= 30,
        `${entry.id}: dias por competência fora de 0..30`
      );
    }
  }

  // 3. A média nunca é apresentada como RMI quando o requisito não fecha.
  const semRequisito = oracle.cases.find(entry => entry.id === 'insufficient-time');
  const saidaSemRequisito = await calculateScenario(structuredClone(semRequisito.calculation));
  assert.equal(saidaSemRequisito.data.native_result.resumo.rmi, null);
  assert.equal(saidaSemRequisito.data.native_result.resumo.salario_beneficio, '2550.00');

  // 4. Identidade: o motor não pode certificar validação jurídica em nenhum caminho.
  for (const entry of oracle.cases) {
    if (entry.expected.kind !== 'outcome') continue;
    const output = await calculateScenario(structuredClone(entry.calculation));
    assert.equal(output.legal_validation_performed, false, `${entry.id}: não certificar direito`);
    if (output.status === 'experimental') {
      assert.equal(output.data.native_result.pcd.actual_entitlement_verified, false);
    }
  }

  // 5. Erros de validação: mensagem exata, sem envelope pela metade.
  for (const entry of oracle.cases) {
    if (entry.expected.kind !== 'error') continue;
    let captured = null;
    try {
      await calculateScenario(structuredClone(entry.calculation));
    } catch (error) {
      captured = error;
    }
    assert.ok(captured, `${entry.id}: esperava erro`);
    assert.equal(captured.message, entry.expected.message, `${entry.id}: mensagem divergente`);
  }

  // 6. Sem política LC 142 não há cálculo silencioso por outro perfil.
  const semPolitica = structuredClone(oracle.cases[0].calculation);
  semPolitica.options.rule_policy = '{}';
  const saidaSemPolitica = calculateCase(semPolitica);
  assert.equal(saidaSemPolitica.status, 'blocked');
  assert.equal(saidaSemPolitica.data, null);

  // 7. O motor não muta a entrada.
  const entradaOriginal = structuredClone(oracle.cases[0].calculation);
  const copia = structuredClone(entradaOriginal);
  calculateCase(copia);
  assert.deepEqual(copia, entradaOriginal, 'O motor não pode mutar o cenário recebido');

  // 8. Paridade é reprodutível: rodar duas vezes dá o mesmo resultado.
  const segundaPassada = await runParity(oracle.cases, calculateScenario);
  assert.equal(segundaPassada.passed, report.passed, 'Paridade instável entre execuções');

  // 9. O comparador rejeita saída adulterada (teste do próprio comparador).
  const casoBase = oracle.cases.find(entry => entry.id === 'base-moderada');
  const envelopeCorreto = await calculateScenario(structuredClone(casoBase.calculation));
  const adulterado = structuredClone(envelopeCorreto);
  adulterado.data.native_result.resumo.rmi = '9999.99';
  assert.throws(
    () => assert.deepEqual(semanticOutcome(adulterado), semanticOutcome(casoBase.expected.value)),
    'O comparador precisa detectar RMI adulterada'
  );
  const envelopeSemAviso = structuredClone(envelopeCorreto);
  envelopeSemAviso.warnings = [];
  assert.throws(
    () => semanticOutcome(envelopeSemAviso),
    'O comparador precisa detectar avisos suprimidos'
  );
  const envelopeComDadoEmBloqueio = {
    status: 'blocked',
    legal_validation_performed: false,
    blockers: [{ code: 'x', field: 'y' }],
    data: { rmi: '1.00' }
  };
  assert.throws(
    () => semanticOutcome(envelopeComDadoEmBloqueio),
    'O comparador precisa detectar dado financeiro em bloqueio'
  );
  const envelopeCertificador = structuredClone(envelopeCorreto);
  envelopeCertificador.legal_validation_performed = true;
  assert.throws(
    () => semanticOutcome(envelopeCertificador),
    'O comparador precisa detectar auto-certificação jurídica'
  );

  // 10. O template de adaptador continua falhando (não é substituído por engano).
  const template = await import(
    pathToFileURL(path.join(ROOT, 'tests', 'lc142-adapter.example.mjs')).href
  )
    .then(modulo => modulo.calculateScenario({}))
    .then(() => 'resolveu')
    .catch(error => error.message);
  assert.equal(template, 'ATRIUM_ADAPTER_NOT_IMPLEMENTED', 'O template deve continuar não implementado');

  log('Verificações de contrato: 10/10');
  log('');
  log('PARIDADE ATINGIDA — paridade sintética de aritmética e guardas do perfil.');
  log('Não declarar integração em produção, validação jurídica, UI mobile ou PDF por este teste.');
}

main().catch(error => {
  console.error(`FALHA: ${error.message}`);
  process.exitCode = 1;
});
