/**
 * Qualidade de segurado — porta de `previus-core/src/quality.rs`, integrada à
 * regra geral do art. 15 que o ATRIUM já implementava.
 *
 * Datas esperadas calculadas à mão a partir da regra da fonte: 6 meses civis
 * somados ao mês da contribuição, prazo no dia 15 do segundo mês seguinte,
 * perda no dia seguinte.
 */
import assert from 'node:assert/strict';

import {
  QualidadeSeguradoError,
  avaliarQualidadeSegurado,
  periodoGracaFacultativo,
  CATEGORIAS_SEGURADO,
  GRACA_FACULTATIVA_MESES,
  QUALIDADE_FACULTATIVA_POLICY
} from '../lib/calc/qualidade-segurado.mjs';

let ok = 0;
const falhas = [];
const check = (cond, msg) => { if (cond) ok += 1; else falhas.push(msg); };
const igual = (a, b, msg) => check(a === b, `${msg} (recebido ${JSON.stringify(a)}, esperado ${JSON.stringify(b)})`);
const temAviso = (avisos, padrao, msg) => check(Array.isArray(avisos) && avisos.some(a => padrao.test(a)), msg);

/* ---------- 1. Variante facultativa: 2026-03-10 ---------- */
{
  // mês 2026-03 + 6 = 2026-09 (último mês de graça)
  // + 2 = 2026-11, dia 15 -> prazo 2026-11-15
  // perda = 2026-11-16
  const r = periodoGracaFacultativo({ lastContributionDate: '2026-03-10' });
  igual(r.graceMonths, 6, 'meses de graça');
  igual(r.lastGraceMonth, '2026-09', 'último mês de graça');
  igual(r.latestPaymentDate, '2026-11-15', 'prazo');
  igual(r.qualityLossDate, '2026-11-16', 'perda da qualidade');
  igual(r.explanation.length, 3, 'três explicações da fonte');
}

/* ---------- 2. Virada de ano na soma de meses ---------- */
{
  // 2026-10 + 6 = 2027-04 ; + 2 = 2027-06 -> 2027-06-15 ; perda 2027-06-16
  const r = periodoGracaFacultativo({ lastContributionDate: '2026-10-05' });
  igual(r.lastGraceMonth, '2027-04', 'virada de ano no mês de graça');
  igual(r.latestPaymentDate, '2027-06-15', 'virada de ano no prazo');
  igual(r.qualityLossDate, '2027-06-16', 'virada de ano na perda');
}

/* ---------- 3. Dia da contribuição não desloca o mês ---------- */
{
  const inicio = periodoGracaFacultativo({ lastContributionDate: '2026-01-01' });
  const fim = periodoGracaFacultativo({ lastContributionDate: '2026-01-31' });
  igual(inicio.lastGraceMonth, fim.lastGraceMonth, 'dia não desloca o mês de graça');
  igual(inicio.latestPaymentDate, fim.latestPaymentDate, 'dia não desloca o prazo');
}

/* ---------- 4. Perda é sempre o dia seguinte ao prazo ---------- */
{
  for (const data of ['2026-01-15', '2026-06-30', '2026-12-01', '2024-02-29']) {
    const r = periodoGracaFacultativo({ lastContributionDate: data });
    const esperado = new Date(Date.UTC(
      Number(r.latestPaymentDate.slice(0, 4)),
      Number(r.latestPaymentDate.slice(5, 7)) - 1,
      Number(r.latestPaymentDate.slice(8, 10)) + 1
    )).toISOString().slice(0, 10);
    igual(r.qualityLossDate, esperado, `dia seguinte ao prazo para ${data}`);
  }
}

/* ---------- 5. Envelope experimental quando a variante facultativa se aplica ---------- */
{
  const e = avaliarQualidadeSegurado({
    stoppedContributing: true,
    currentlyReceivingBenefit: false,
    insuredCategory: 'facultative',
    lastContributionDate: '2026-03-10'
  });
  igual(e.status, 'experimental', 'status experimental');
  igual(e.modelo_aplicado, 'facultativa', 'modelo aplicado');
  igual(e.legal_validation_performed, false, 'não valida juridicamente');
  igual(e.actual_entitlement_verified, false, 'não verifica direito');
  igual(e.policy_version, QUALIDADE_FACULTATIVA_POLICY, 'versão da política');
  igual(e.data.native_result.facultativa.qualityLossDate, '2026-11-16', 'resultado no envelope');
  temAviso(e.warnings, /experimental/, 'aviso de extrapolação experimental presente');
}

/* ---------- 6. `unsupported` quando nada se aplica ---------- */
{
  const e = avaliarQualidadeSegurado({
    stoppedContributing: false,
    currentlyReceivingBenefit: false,
    insuredCategory: 'employee',
    lastContributionDate: '2026-03-10'
  });
  igual(e.status, 'unsupported', 'sem modelo aplicável é unsupported');
  igual(e.data, null, 'unsupported não carrega dado');
  check(e.missing.includes('qualidade_modelo_aplicavel'), 'missing declara o motivo');
}

/* ---------- 7. Recebendo benefício bloqueia a variante facultativa ---------- */
{
  const e = avaliarQualidadeSegurado({
    stoppedContributing: true,
    currentlyReceivingBenefit: true,
    insuredCategory: 'facultative',
    lastContributionDate: '2026-03-10'
  });
  igual(e.status, 'unsupported', 'benefício em curso não usa a variante facultativa');
}

/* ---------- 8. Regra geral (art. 15) segue funcionando pela porta ---------- */
{
  const e = avaliarQualidadeSegurado({
    stoppedContributing: true,
    currentlyReceivingBenefit: false,
    insuredCategory: 'employee',
    lastContributionDate: '2026-03-10',
    contribuicoesMeses: 36,
    dataReferencia: '2026-12-01'
  });
  igual(e.status, 'experimental', 'regra geral produz experimental');
  igual(e.modelo_aplicado, 'geral', 'modelo geral aplicado');
  igual(e.data.native_result.geral.mesesPeriodo, 12, '12 meses sem prorrogação');
  igual(e.data.native_result.geral.prorrogacao, false, 'sem prorrogação com 36 contribuições');
  igual(e.data.native_result.geral.mantemQualidade, true, 'mantém qualidade em 2026-12-01');
}

/* ---------- 9. Prorrogação para 24 meses com 120+ contribuições ---------- */
{
  const e = avaliarQualidadeSegurado({
    contribuicoesMeses: 120,
    lastContributionDate: '2026-03-10',
    dataReferencia: '2027-06-01'
  });
  igual(e.data.native_result.geral.mesesPeriodo, 24, 'prorrogação aplicada');
  igual(e.data.native_result.geral.prorrogacao, true, 'flag de prorrogação');
}

/* ---------- 10. Os dois modelos juntos são declarados ---------- */
{
  const e = avaliarQualidadeSegurado({
    stoppedContributing: true,
    currentlyReceivingBenefit: false,
    insuredCategory: 'facultative',
    lastContributionDate: '2026-03-10',
    contribuicoesMeses: 12,
    dataReferencia: '2026-10-01'
  });
  igual(e.modelo_aplicado, 'geral_e_facultativa', 'os dois modelos declarados');
  check(Boolean(e.data.native_result.facultativa) && Boolean(e.data.native_result.geral), 'ambos os resultados presentes');
  // A variante facultativa é mais restritiva (6 meses) que a geral (12): o
  // envelope não escolhe uma silenciosamente, entrega as duas.
  check(e.data.native_result.facultativa.qualityLossDate !== e.data.native_result.geral.fimPeriodo, 'modelos permanecem distintos');
  /* O servidor responde com `JSON.stringify`: o envelope tem de ser serializável. */
  let serializavel = true;
  try { JSON.stringify(e); } catch { serializavel = false; }
  check(serializavel, 'envelope da qualidade é serializável em JSON');
}

/* ---------- 11. Recusas declaradas ---------- */
const tentar = fn => { try { fn(); return null; } catch (e) { return e; } };
check(tentar(() => periodoGracaFacultativo({ lastContributionDate: '10/03/2026' })) instanceof QualidadeSeguradoError, 'data BR deveria falhar');
check(tentar(() => periodoGracaFacultativo({})) instanceof QualidadeSeguradoError, 'data ausente deveria falhar');
check(tentar(() => periodoGracaFacultativo({ lastContributionDate: '2026-02-30' })) instanceof QualidadeSeguradoError, 'data impossível deveria falhar');
check(tentar(() => avaliarQualidadeSegurado({ insuredCategory: 'invalida', contribuicoesMeses: 12 })) instanceof QualidadeSeguradoError, 'categoria inválida deveria falhar');
check(tentar(() => avaliarQualidadeSegurado(null)) instanceof QualidadeSeguradoError, 'entrada nula deveria falhar');

/* ---------- 12. Constantes ---------- */
igual(GRACA_FACULTATIVA_MESES, 6, 'meses da variante facultativa');
igual(CATEGORIAS_SEGURADO.length, 4, 'categorias da fonte');

console.log(`\n${ok} verificações OK${falhas.length ? `, ${falhas.length} FALHAS` : ', 0 falhas'}`);
for (const f of falhas) console.log(`  - ${f}`);
if (falhas.length) process.exitCode = 1;
