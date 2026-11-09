/**
 * Testes de persistência do cenário LC 142 no Store oficial.
 *
 * Prova os invariantes que protegem dado:
 *  - o registro é reconstruível e o resultado gravado não é a autoridade;
 *  - limite de caracteres é recusado, nunca "resolvido" removendo parcelas;
 *  - hash oficial não depende da ordem das chaves;
 *  - conflito de revisão não é mascarado;
 *  - snapshot é deduplicado por hash;
 *  - RMI nula não vira zero no resumo.
 *
 * Execução: node tests/calculation_lc142_persistence.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { calculateCase } from '../lib/calc/lc142.mjs';
import {
  Lc142PersistenceError,
  canonicalJson,
  conferirRecalculo,
  deduplicarSnapshot,
  hashCanonico,
  politicaDoCenario,
  prepararRegistroLc142,
  reconstruirCenario,
  resumirRegistroLc142,
  verificarRevisao
} from '../lib/calc/lc142-persistence.mjs';
import { MAX_RECORD_CHARACTERS } from '../lib/calc/persistence.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORACLE = path.join(ROOT, 'tests', 'fixtures', 'lc142-rust-oracle.json');
const oracle = JSON.parse(fs.readFileSync(ORACLE, 'utf8'));

function caso(id) {
  const entry = oracle.cases.find(item => item.id === id);
  assert.ok(entry, `Cenário ausente: ${id}`);
  return structuredClone(entry.calculation);
}

function cenarioValido(id = 'base-moderada') {
  const calculation = caso(id);
  const resultado = calculateCase(calculation);
  assert.equal(resultado.status, 'experimental', `${id} deveria calcular`);
  return { calculation, resultado };
}

// --- 1. Registro feliz: id, tipo, proveniência e reconstrução --------------
{
  const { calculation, resultado } = cenarioValido();
  const registro = prepararRegistroLc142({
    id: 'lc142-teste-1',
    titulo: 'Cenário sintético de teste',
    calculation,
    resultado,
    ator: 'Advogada Teste',
    criadoEm: '2026-10-18T00:00:00.000Z'
  });
  assert.equal(registro.id, 'lc142-teste-1');
  assert.equal(registro.tipo, 'previdenciario');
  assert.equal(registro.schemaVersion, 1);
  assert.ok(registro.entrada.proveniencia.snapshot_sha256);
  assert.equal(registro.entrada.proveniencia.snapshot_sha256.length, 64);
  assert.ok(registro.entrada.proveniencia.snapshot_hash_canonico.length === 64);
  assert.ok(registro.entrada.proveniencia.cenario_hash.length === 64);
  assert.equal(registro.entrada.proveniencia.versao_registro, 1);

  const reconstruido = reconstruirCenario(registro);
  assert.equal(reconstruido.calculation.sex, calculation.sex);
  assert.equal(reconstruido.politica.version, 'lc142-constant-grade-v1');
  assert.equal(reconstruido.cenarioHashEsperado, registro.entrada.proveniencia.cenario_hash);

  const recalculado = calculateCase(reconstruido.calculation);
  assert.doesNotThrow(() =>
    conferirRecalculo({
      registro,
      cenario: reconstruido.calculation,
      politica: reconstruido.politica,
      resultado: recalculado
    })
  );
}

// --- 2. Bloqueio não é salvável como resultado ----------------------------
{
  const calculation = caso('unconfirmed-assumptions');
  const resultado = calculateCase(calculation);
  assert.equal(resultado.status, 'blocked');
  assert.throws(
    () => prepararRegistroLc142({ calculation, resultado }),
    error => error instanceof Lc142PersistenceError && /bloqueio não é resultado/.test(error.message)
  );
}

// --- 3. Resultado sem native_result é recusado ----------------------------
{
  const { calculation } = cenarioValido();
  assert.throws(
    () => prepararRegistroLc142({ calculation, resultado: { status: 'experimental', data: {} } }),
    /recálculo é obrigatório/
  );
}

// --- 4. Hash oficial independe da ordem das chaves ----------------------
{
  const a = { b: 1, a: [3, 2], c: { z: true, y: null } };
  const b = { c: { y: null, z: true }, a: [3, 2], b: 1 };
  assert.equal(canonicalJson(a), canonicalJson(b));
  assert.equal(hashCanonico(a), hashCanonico(b));
  assert.notEqual(hashCanonico({ a: 1 }), hashCanonico({ a: 2 }));
}

// --- 5. RMI adulterada no registro é detectada no recálculo --------------
{
  const { calculation, resultado } = cenarioValido();
  const registro = prepararRegistroLc142({ calculation, resultado });
  const adulterado = structuredClone(registro);
  adulterado.resultado.data.native_result.resumo.rmi = '99999.99';
  const recalculado = calculateCase(calculation);
  assert.throws(
    () =>
      conferirRecalculo({
        registro: adulterado,
        cenario: calculation,
        politica: politicaDoCenario(calculation),
        resultado: recalculado
      }),
    /incidente de contrato/
  );
}

// --- 6. Cenário alterado após salvar é detectado -------------------------
{
  const { calculation, resultado } = cenarioValido();
  const registro = prepararRegistroLc142({ calculation, resultado });
  const alterado = structuredClone(calculation);
  alterado.sex = 'Feminino';
  assert.throws(
    () =>
      conferirRecalculo({
        registro,
        cenario: alterado,
        politica: politicaDoCenario(alterado),
        resultado: calculateCase(alterado)
      }),
    /diverge do registro salvo/
  );
}

// --- 7. Limite de caractere é recusado, não compactado em silêncio -------
{
  const { calculation, resultado } = cenarioValido();
  // Infla o resultado acima do limite oficial do registro.
  const inflado = structuredClone(resultado);
  inflado.data.native_result.memoria = Array.from({ length: 4000 }, (_, index) => ({
    tipo: 'enchimento',
    descricao: `linha sintética de enchimento ${index} ${'x'.repeat(40)}`,
    valor: '0.00'
  }));
  assert.ok(
    JSON.stringify(inflado).length > MAX_RECORD_CHARACTERS,
    'O caso de teste precisa exceder o limite para provar a recusa'
  );
  assert.throws(
    () => prepararRegistroLc142({ calculation, resultado: inflado }),
    /excede o limite/
  );
}

// --- 8. Conflito de revisão é explícito ----------------------------------
{
  assert.throws(
    () => verificarRevisao({ currentRevision: 10 }),
    /revisão esperada/
  );
  assert.throws(
    () => verificarRevisao({ expectedRevision: 9, currentRevision: 10 }),
    error => error.statusCode === 409 && error.code === 'REVISION_CONFLICT'
  );
  assert.equal(verificarRevisao({ expectedRevision: 10, currentRevision: 10 }), true);
}

// --- 9. Deduplicação de snapshot por hash --------------------------------
{
  const { calculation } = cenarioValido();
  const politica = politicaDoCenario(calculation);
  const primeiro = deduplicarSnapshot(null, politica.snapshot);
  assert.equal(primeiro.acao, 'criar');
  const segundo = deduplicarSnapshot(politica.snapshot, structuredClone(politica.snapshot));
  assert.equal(segundo.acao, 'reutilizar');
  const alterado = structuredClone(politica.snapshot);
  alterado.through = '2020-05';
  const terceiro = deduplicarSnapshot(politica.snapshot, alterado);
  assert.equal(terceiro.acao, 'criar');
}

// --- 10. Resumo preserva RMI nula e não mente sobre direito -------------
{
  const calculation = caso('insufficient-time');
  const resultado = calculateCase(calculation);
  const registro = prepararRegistroLc142({ calculation, resultado, id: 'lc142-sem-requisito' });
  const resumo = resumirRegistroLc142(registro);
  assert.equal(resumo.rmi, null, 'RMI ausente não pode virar zero');
  assert.equal(resumo.salarioBeneficio, '2550.00', 'A média continua disponível e separada');
  assert.equal(resumo.tempoAtingido, false);
  assert.equal(resumo.actualEntitlementVerified, false);
  assert.equal(resumo.grau, 'moderada');
  assert.equal(resumo.anosExigidos, 29);
}

// --- 11. Registro não carrega credencial nem PII de fixture -------------
{
  const { calculation, resultado } = cenarioValido();
  const registro = prepararRegistroLc142({ calculation, resultado });
  const texto = JSON.stringify(registro);
  for (const proibido of ['FC_API_KEY', 'apiKey', 'password', 'token']) {
    assert.ok(!texto.includes(proibido), `Registro não pode conter "${proibido}"`);
  }
  assert.ok(!/\.env/.test(texto), 'Registro não pode referenciar .env');
}

// --- 12. Cenário sem política não é salvo -------------------------------
{
  const calculation = caso('base-moderada');
  calculation.options.rule_policy = '{}';
  const resultado = {
    status: 'experimental',
    data: { native_result: { resumo: {}, pcd: {} } }
  };
  assert.throws(
    () => prepararRegistroLc142({ calculation, resultado }),
    /sem política LC 142/
  );
}

// --- 13. Título automático descreve grau e exigência --------------------
{
  const { calculation, resultado } = cenarioValido();
  const registro = prepararRegistroLc142({ calculation, resultado });
  assert.match(registro.titulo, /LC 142 moderada/);
  assert.match(registro.titulo, /29 anos/);
}

console.log('OK  persistência LC 142: 13 cenários aprovados (proveniência, recusa de limite, revisão, dedupe, RMI nula).');
