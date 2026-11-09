/**
 * Comparador de paridade: motor JS de produção contra o oráculo Rust.
 *
 * Compara SEMÂNTICA DE DOMÍNIO, não prosa de UI:
 *  - envelope (status, `data: null` em blocked, `legal_validation_performed: false`);
 *  - códigos e campos de bloqueio;
 *  - todos os valores financeiros, fatores, tempos, contagens e origem das parcelas;
 *  - premissas de PcD e `actual_entitlement_verified: false`;
 *  - exceções de validação com a mensagem exata.
 *
 * Avisos/memória são prose localizada e não provam aritmética, mas continuam
 * obrigatórios: o comparador exige que existam, sem comparar o texto.
 */

import assert from 'node:assert/strict';

const CAMPOS_FINANCEIROS = [
  'competencias',
  'carencia_meses',
  'soma_salarios',
  'salario_beneficio',
  'coeficiente',
  'rmi_bruta',
  'rmi',
  'teto',
  'piso'
];

const CAMPOS_PARCELA = [
  'competencia',
  'salario',
  'teto',
  'considerado',
  'indice',
  'corrigido',
  'origem',
  'dias',
  'descartada'
];

function exigirObjeto(value, label) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} ausente`);
}

/**
 * Extrai a semântica comparável de um envelope. Falha explicitamente quando o
 * envelope mente sobre validação jurídica ou esconde dado.
 */
export function semanticOutcome(value) {
  exigirObjeto(value, 'Envelope');
  assert.equal(
    value.legal_validation_performed,
    false,
    'Nenhum envelope pode certificar validação jurídica'
  );
  if (value.status === 'blocked') {
    assert.equal(value.data, null, 'Bloqueio não pode carregar dado financeiro');
    assert.ok(
      Array.isArray(value.blockers) && value.blockers.length > 0,
      'Bloqueio exige ao menos um blocker explícito'
    );
    return {
      status: 'blocked',
      legal_validation_performed: false,
      blockers: value.blockers.map(({ code, field }) => ({ code, field }))
    };
  }
  assert.equal(value.status, 'experimental', `Estado desconhecido: ${value.status}`);
  const native = value.data?.native_result;
  exigirObjeto(native, 'native_result');
  assert.ok(
    Array.isArray(value.warnings) && value.warnings.length > 0,
    'Avisos do cenário não podem ser suprimidos'
  );
  assert.equal(native.pcd?.actual_entitlement_verified, false, 'Nunca certificar direito');
  for (const nome of ['resumo', 'parametros', 'correcao', 'tempo', 'pcd']) {
    exigirObjeto(native[nome], `native_result.${nome}`);
  }
  return {
    status: 'experimental',
    legal_validation_performed: false,
    rule_review_status: value.rule_review_status,
    engine_id: native.engine_id,
    resumo: pick(native.resumo, CAMPOS_FINANCEIROS),
    parametros: {
      divisor: native.parametros.divisor,
      correcao_ativa: native.parametros.correcao_ativa,
      referencia_correcao: native.parametros.referencia_correcao,
      descarte_aplicado: native.parametros.descarte_aplicado,
      divisor_minimo_aplicado: native.parametros.divisor_minimo_aplicado,
      coeficiente: native.parametros.coeficiente
    },
    correcao: {
      referencia: native.correcao.referencia,
      pbc: native.correcao.pbc,
      consideradas: native.correcao.consideradas,
      descartadas: native.correcao.descartadas,
      soma_considerada: native.correcao.soma_considerada,
      media: native.correcao.media,
      salario_beneficio: native.correcao.salario_beneficio,
      descarte_aplicado: native.correcao.descarte_aplicado,
      parcelas: (native.correcao.parcelas ?? []).map(linha => pick(linha, CAMPOS_PARCELA)),
      parcelas_descartadas: native.correcao.parcelas_descartadas ?? []
    },
    tempo: {
      total: native.tempo.total,
      sem_projecao: native.tempo.sem_projecao,
      carencia_meses: native.tempo.carencia_meses,
      convention: native.tempo.convention,
      vinculos: (native.tempo.vinculos ?? []).map(({ inicio, fim, dias_30_360 }) => ({
        inicio,
        fim,
        dias_30_360
      }))
    },
    pcd: {
      grau: native.pcd.grau,
      anos_exigidos: native.pcd.anos_exigidos,
      tempo_atingido_no_cenario: native.pcd.tempo_atingido_no_cenario,
      projection_count: native.pcd.projection_count,
      filled_minimum_count: native.pcd.filled_minimum_count,
      actual_entitlement_verified: native.pcd.actual_entitlement_verified,
      snapshot_sha256: native.pcd.snapshot_sha256,
      source_sha256: native.pcd.source_sha256,
      assumptions_confirmed: native.pcd.assumptions_confirmed,
      calculation_date: native.pcd.calculation_date,
      review_evidence: native.pcd.review_evidence,
      disability_evidence: native.pcd.disability_evidence
    },
    memoria_presente: Array.isArray(native.memoria) ? native.memoria.length > 0 : false
  };
}

function pick(source, campos) {
  const out = {};
  for (const campo of campos) out[campo] = source?.[campo];
  return out;
}

/**
 * Executa um caso do oráculo contra o adaptador real.
 */
export async function verifyCase(entry, calculateScenario, { timeoutMs = 20000 } = {}) {
  assert.equal(entry.synthetic, true, 'O comparador aceita apenas casos sintéticos');
  const input = structuredClone(entry.calculation);
  const original = structuredClone(input);
  let output;
  let exception;
  let timer;
  try {
    output = await Promise.race([
      Promise.resolve().then(() => calculateScenario(input)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('parity_timeout')), timeoutMs);
      })
    ]);
  } catch (error) {
    exception = error;
  } finally {
    clearTimeout(timer);
  }
  assert.deepEqual(input, original, 'O adaptador não pode alterar a origem ou a hipótese importada');
  if (entry.expected.kind === 'error') {
    assert.ok(exception, 'Esperava erro explícito de validação');
    assert.equal(exception.message, entry.expected.message, 'Erro de validação divergente');
  } else {
    assert.ok(!exception, `Erro inesperado do adaptador: ${exception?.message ?? ''}`);
    assert.deepEqual(
      semanticOutcome(output),
      semanticOutcome(entry.expected.value),
      'Divergência semântica de domínio'
    );
    assert.doesNotThrow(
      () => JSON.stringify(output),
      'A saída precisa atravessar JSON (sem BigInt cru)'
    );
  }
  return { id: entry.id, status: 'passed' };
}

/**
 * Executa todos os casos e devolve relatório. Não lança no primeiro erro:
 * agrega para que o relatório mostre todas as divergências.
 */
export async function runParity(cases, calculateScenario) {
  const results = [];
  for (const entry of cases) {
    try {
      results.push(await verifyCase(entry, calculateScenario));
    } catch (error) {
      results.push({
        id: entry.id,
        status: 'failed',
        reason: String(error?.message ?? error).slice(0, 2000)
      });
    }
  }
  const passed = results.filter(item => item.status === 'passed').length;
  return {
    status: passed === results.length ? 'passed' : 'failed',
    scope: 'paridade sintética do perfil lc142 constante; NÃO certifica integração, UI ou PDF',
    cases: results.length,
    passed,
    failed: results.length - passed,
    results
  };
}
