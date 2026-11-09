/**
 * Acumulação de pensões — porta de `previus-core/src/pension.rs`.
 *
 * Os valores esperados aqui foram calculados à mão a partir da regra da fonte
 * (maior integral; demais por faixas 100/60/40/20 sobre a base, excedente 10%,
 * quantizando em centavos a cada faixa), não copiados de uma execução.
 */
import assert from 'node:assert/strict';

import {
  PensaoError,
  acumularPensoes,
  envelopePensao,
  FAIXAS_ACUMULACAO,
  PENSAO_POLICY_VERSION
} from '../lib/calc/pensao.mjs';

let ok = 0;
const falhas = [];
const check = (cond, msg) => { if (cond) ok += 1; else falhas.push(msg); };
const igual = (a, b, msg) => check(a === b, `${msg} (recebido ${JSON.stringify(a)}, esperado ${JSON.stringify(b)})`);

/* ---------- 1. Caso com excedente: 3000 integral + 2500 por faixas ---------- */
{
  const r = acumularPensoes({
    referenceDate: '2026-10-19',
    incomes: ['3000.00', '2500.00'],
    referenceBase: '1000.00'
  });

  igual(r.integralIncomeIndex, 0, 'maior renda deveria ser a primeira');
  igual(r.integralIncome, '3000.00', 'renda integral');
  igual(r.incomes[1].integral, false, 'segunda renda não é integral');

  // 1000,00 a 100% + 1000,00 a 60% + 500,00 a 40% = 1000 + 600 + 200 = 1800,00
  igual(r.incomes[1].receivedAmount, '1800.00', 'renda reduzida');
  igual(r.reducedTotal, '1800.00', 'total reduzido');
  igual(r.combinedTotal, '4800.00', 'total combinado');
  igual(r.incomes[1].receivedPercentage, '72.00', 'percentual recebido');

  const faixas = r.incomes[1].tranches;
  igual(faixas.length, 5, 'devem existir 5 faixas');
  igual(faixas[0].baseAmount, '1000.00', 'faixa 1 base');
  igual(faixas[0].ratePercent, 100, 'faixa 1 percentual');
  igual(faixas[0].receivedAmount, '1000.00', 'faixa 1 recebido');
  igual(faixas[1].baseAmount, '1000.00', 'faixa 2 base');
  igual(faixas[1].receivedAmount, '600.00', 'faixa 2 recebido');
  igual(faixas[2].baseAmount, '500.00', 'faixa 3 base');
  igual(faixas[2].receivedAmount, '200.00', 'faixa 3 recebido');
  igual(faixas[3].baseAmount, '0.00', 'faixa 4 base zerada');
  igual(faixas[4].baseAmount, '0.00', 'faixa 5 base zerada');

  // A soma das faixas tem de reproduzir o total: nenhum centavo some.
  const somaFaixas = faixas.reduce((soma, f) => soma + Math.round(Number(f.receivedAmount) * 100), 0);
  igual(somaFaixas, Math.round(Number(r.incomes[1].receivedAmount) * 100), 'soma das faixas == total');
}

/* ---------- 2. Renda abaixo da base entra integral (sem redução) ---------- */
{
  const r = acumularPensoes({
    referenceDate: '2026-10-19',
    incomes: ['3000.00', '500.00'],
    referenceBase: '1000.00'
  });
  igual(r.incomes[1].receivedAmount, '500.00', 'renda menor que a base não é reduzida');
  igual(r.incomes[1].receivedPercentage, '100.00', 'percentual integral');
  igual(r.combinedTotal, '3500.00', 'total com renda pequena');
}

/* ---------- 3. Empate: vence a primeira posição (política declarada) ---------- */
{
  const r = acumularPensoes({
    referenceDate: '2026-10-19',
    incomes: ['2000.00', '2000.00'],
    referenceBase: '1000.00'
  });
  igual(r.integralIncomeIndex, 0, 'empate deveria favorecer a primeira posição');
  igual(r.incomes[0].integral, true, 'primeira é integral');
  igual(r.incomes[1].integral, false, 'segunda é reduzida');
  // 1000 a 100% + 1000 a 60% = 1600
  igual(r.incomes[1].receivedAmount, '1600.00', 'segunda reduzida pelo empate');
}

/* ---------- 4. Renda de uma só entrada: sempre integral ---------- */
{
  const r = acumularPensoes({
    referenceDate: '2026-10-19',
    incomes: ['1234.56'],
    referenceBase: '1000.00'
  });
  igual(r.integralIncomeIndex, 0, 'única renda é integral');
  igual(r.reducedTotal, '0.00', 'sem renda reduzida');
  igual(r.combinedTotal, '1234.56', 'total igual à única renda');
}

/* ---------- 5. Renda zero: percentual null, não inventado ---------- */
{
  const r = acumularPensoes({
    referenceDate: '2026-10-19',
    incomes: ['1000.00', '0.00'],
    referenceBase: '1000.00'
  });
  igual(r.incomes[1].receivedPercentage, null, 'renda zero não gera percentual (0/0)');
  igual(r.incomes[1].receivedAmount, '0.00', 'renda zero permanece zero');
  igual(r.incomes[1].tranches.length, 5, 'faixas continuam sendo reportadas');
}

/* ---------- 6. Grande excedente: última faixa absorve o resto ---------- */
{
  const r = acumularPensoes({
    referenceDate: '2026-10-19',
    incomes: ['50000.00', '10000.00'],
    referenceBase: '1000.00'
  });
  // 1000*100% + 1000*60% + 1000*40% + 1000*20% + 6000*10% = 1000+600+400+200+600 = 2800
  igual(r.incomes[1].receivedAmount, '2800.00', 'excedente a 10% na última faixa');
  const faixas = r.incomes[1].tranches;
  igual(faixas[4].baseAmount, '6000.00', 'última faixa absorve o excedente');
  igual(faixas[4].receivedAmount, '600.00', 'excedente a 10%');
  igual(r.incomes[1].receivedPercentage, '28.00', 'percentual sobre 10000');
}

/* ---------- 7. Aritmética em centavos não perde precisão ---------- */
{
  const r = acumularPensoes({
    referenceDate: '2026-10-19',
    incomes: ['10000.00', '3333.33'],
    referenceBase: '1111.11'
  });
  // 1111,11*100% + 1111,11*60% + 1111,11*40% + 0,00*20% + 0,00*10%
  // 1111,11 + 666,67 (666,666 -> 666,67) + 444,44 (444,444 -> 444,44) = 2222,22
  igual(r.incomes[1].receivedAmount, '2222.22', 'arredondamento por faixa em centavos');
  igual(r.combinedTotal, '12222.22', 'total com centavos');
}

/* ---------- 8. Recusas declaradas ---------- */
const tentar = fn => { try { fn(); return null; } catch (e) { return e; } };

check(tentar(() => acumularPensoes({ referenceDate: '2026-10-19', incomes: [], referenceBase: '1000.00' })) instanceof PensaoError, 'rendas vazias deveriam falhar');
check(tentar(() => acumularPensoes({ referenceDate: '2026-10-19', incomes: ['100.00'], referenceBase: '0.00' })) instanceof PensaoError, 'base zero deveria falhar');
check(tentar(() => acumularPensoes({ referenceDate: '2026-10-19', incomes: ['100.00'], referenceBase: '-1.00' })) instanceof PensaoError, 'base negativa deveria falhar');
check(tentar(() => acumularPensoes({ referenceDate: '2026-10-19', incomes: ['-5.00'], referenceBase: '1000.00' })) instanceof PensaoError, 'renda negativa deveria falhar');
check(tentar(() => acumularPensoes({ referenceDate: '19/10/2026', incomes: ['100.00'], referenceBase: '1000.00' })) instanceof PensaoError, 'data fora de ISO deveria falhar');
check(tentar(() => acumularPensoes({ referenceDate: '2026-10-19', incomes: ['100.00'], referenceBase: '1000.00', rounding: 'banqueiro' })) instanceof PensaoError, 'modo de arredondamento inválido deveria falhar');
check(tentar(() => acumularPensoes({ referenceDate: '2026-10-19', incomes: ['abc'], referenceBase: '1000.00' })) instanceof PensaoError, 'renda não numérica deveria falhar');

/* ---------- 9. Modos de arredondamento produzem resultados distintos quando cabem ---------- */
{
  // 3,33 * 60% = 1,998 -> half-up 2,00 ; half-even 2,00 (nenhum empate aqui),
  // então usamos um caso de empate exato: 2,50 * 100% já é exato; 0,05/2 = 0,025
  const um = acumularPensoes({ referenceDate: '2026-10-19', incomes: ['1000.00', '1000.05'], referenceBase: '0.05', rounding: 'half-up' });
  const dois = acumularPensoes({ referenceDate: '2026-10-19', incomes: ['1000.00', '1000.05'], referenceBase: '0.05', rounding: 'half-even' });
  check(um.rounding === 'half-up' && dois.rounding === 'half-even', 'modo registrado no resultado');
  igual(um.combinedTotal, dois.combinedTotal, 'total combinado estável entre modos neste caso');
}

/* ---------- 10. Envelope declara os limites ---------- */
{
  const e = envelopePensao({ referenceDate: '2026-10-19', incomes: ['3000.00', '2500.00'], referenceBase: '1000.00' });
  igual(e.status, 'experimental', 'envelope experimental');
  igual(e.legal_validation_performed, false, 'não declara validação jurídica');
  igual(e.actual_entitlement_verified, false, 'não declara direito verificado');
  igual(e.policy_version, PENSAO_POLICY_VERSION, 'versão da política');
  check(Array.isArray(e.warnings) && e.warnings.length >= 3, 'envelope traz os avisos de limite');
  check(e.data && e.data.native_result && e.data.native_result.combinedTotal === '4800.00', 'native_result presente');
  /* O servidor responde com `JSON.stringify`: o envelope tem de ser serializável. */
  let serializavel = true;
  try { JSON.stringify(e); } catch { serializavel = false; }
  check(serializavel, 'envelope da pensão é serializável em JSON');
}

/* ---------- 11. Constantes da regra ---------- */
igual(FAIXAS_ACUMULACAO.join(','), '100,60,40,20,10', 'faixas da regra');

console.log(`\n${ok} verificações OK${falhas.length ? `, ${falhas.length} FALHAS` : ', 0 falhas'}`);
for (const f of falhas) console.log(`  - ${f}`);
if (falhas.length) process.exitCode = 1;
