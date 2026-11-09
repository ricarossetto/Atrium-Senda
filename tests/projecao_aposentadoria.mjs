/**
 * Projeção de DER — porta de `rgps-core/src/projecao.rs`.
 *
 * O caso 1 replica o cenário do teste Rust `homen_60_anos_30_tempo_projeta_para_pontos`
 * (mesmo nascimento, mesmas 360 competências, mesma data de referência) e verifica
 * os três asserts da fonte. Os demais casos cobrem seleção de regra, ausência de
 * RMI calculável e o limite de simulação.
 */
import assert from 'node:assert/strict';

import {
  ProjecaoError,
  projetarAposentadoria,
  envelopeProjecao,
  LIMITE_SIMULACAO_MESES,
  PROJECAO_POLICY_VERSION,
  REGRAS_PROJETAVEIS
} from '../lib/calc/projecao.mjs';
import { parseDec, mul, div, fromCents, toCents, toFixedString } from '../lib/calc/decimal.mjs';
import { fatorPrevidenciario } from '../lib/calc/retorno.mjs';

let ok = 0;
const falhas = [];
const check = (cond, msg) => { if (cond) ok += 1; else falhas.push(msg); };
const igual = (a, b, msg) => check(a === b, `${msg} (recebido ${JSON.stringify(a)}, esperado ${JSON.stringify(b)})`);

/** Gera competências mensais consecutivas. */
function competenciasDe(inicioAno, inicioMes, quantidade, salario) {
  const lista = [];
  let ano = inicioAno;
  let mes = inicioMes;
  for (let i = 0; i < quantidade; i += 1) {
    lista.push({ competencia: `${ano}-${String(mes).padStart(2, '0')}`, salario });
    mes += 1;
    if (mes > 12) { mes = 1; ano += 1; }
  }
  return lista;
}

/* ---------- 1. Cenário idêntico ao teste Rust ---------- */
{
  const r = projetarAposentadoria({
    sexo: 'masculino',
    dataNascimento: '1966-05-10',
    dataReferencia: '2026-10-09',
    competencias: competenciasDe(1996, 6, 360, '3000.00'),
    corrigirSalarios: false,
    descarte: false
  });

  // Os três asserts do teste Rust.
  check(r.der !== null, 'der.is_some(): deve projetar DER');
  check(r.mesesSimulados <= LIMITE_SIMULACAO_MESES, 'meses_simulados <= 480');
  check(r.idadeDerMeses >= 60 * 12, 'idade >= 60 anos no DER');

  // Determinismo do resultado observado.
  igual(r.der, '2031-06-09', 'DER projetada');
  igual(r.competenciaDer, '2031-02', 'competência da DER');
  igual(r.mesesSimulados, 56, 'meses simulados');
  igual(r.idadeDerAnos, 65, 'idade na DER');
  igual(r.regraEscolhida, 'idade-permanente', 'regra vencedora');
  igual(r.salarioBeneficio, '3000.00', 'salário de benefício');

  // 60% + 2% × (34 − 20) = 88% de 3000,00 = 2640,00
  igual(r.tempoDerAnos, 34, 'tempo na DER');
  igual(r.rmi, '2640.00', 'RMI pela regra permanente');
  igual(r.criterioRmi, 'coeficiente-progressivo', 'critério da RMI');
}

/* ---------- 2. Fonte única da verdade para a elegibilidade ---------- */
{
  const r = projetarAposentadoria({
    sexo: 'masculino',
    dataNascimento: '1966-05-10',
    dataReferencia: '2026-10-09',
    competencias: competenciasDe(1996, 6, 360, '3000.00')
  });
  // `direito-adquirido` nunca vence a projeção: não representa data futura e não
  // tem RMI calculável neste comparador.
  check(!r.regrasElegiveis.some(x => x.id === 'direito-adquirido'), 'direito-adquirido não entra na projeção');
  check(r.regrasElegiveis.every(x => REGRAS_PROJETAVEIS.includes(x.id)), 'só regras projetáveis são avaliadas');
  check(r.avisos.some(a => /maior RMI final/.test(a)), 'aviso explica a seleção da regra');
  /* Regressão real: cada regra elegível trazia `centavos` (BigInt) e o envelope não
   * era serializável — a rota devolveria 500 no caminho feliz. O valor interno não
   * pode sair; a RMI sai como decimal. */
  check(r.regrasElegiveis.every(regra => regra.centavos === undefined), 'regra publicada não expõe centavos');
  check(r.regrasElegiveis.every(regra => regra.rmi === null || /^\d+\.\d{2}$/.test(regra.rmi)), 'RMI publicada como decimal');
  let serializavel = true;
  try { JSON.stringify(envelopeProjecao({
    sexo: 'masculino',
    dataNascimento: '1966-05-10',
    dataReferencia: '2026-10-09',
    competencias: competenciasDe(1996, 6, 360, '3000.00')
  })); } catch { serializavel = false; }
  check(serializavel, 'envelope da projeção é serializável em JSON');
}

/* ---------- 3. Salário de simulação entra no PBC e dilui a média ---------- */
{
  const base = {
    sexo: 'masculino',
    dataNascimento: '1966-05-10',
    dataReferencia: '2026-10-09',
    competencias: competenciasDe(1996, 6, 360, '3000.00')
  };
  const semSimulacao = projetarAposentadoria(base);
  const comSimulacao = projetarAposentadoria({ ...base, salarioSimulacao: '5000.00' });
  igual(semSimulacao.rmi, '2640.00', 'RMI sem salário de simulação');
  igual(comSimulacao.salarioSimulacao, '5000.00', 'salário de simulação registrado');

  // O SB é a média de TODO o PBC: 360 competências a 3000 + 56 simuladas a 5000,
  // divididas por 416. O salário simulado dilui a média — não a substitui.
  const totalCentavos = 360n * 300000n + 56n * 500000n;
  const mediaEsperada = toFixedString(div(fromCents(totalCentavos), parseDec('416')), 2, 'half-up');
  igual(comSimulacao.salarioBeneficio, mediaEsperada, 'SB é a média do PBC com os meses simulados');
  igual(comSimulacao.salarioBeneficio, '3269.23', 'SB conferido à mão');

  // RMI = SB × 88% (60% + 2% × 14 anos excedentes)
  const rmiEsperada = toFixedString(mul(parseDec(mediaEsperada), parseDec('0.88')), 2, 'half-up');
  igual(comSimulacao.rmi, rmiEsperada, 'RMI = SB × coeficiente');
  igual(comSimulacao.rmi, '2876.92', 'RMI conferida à mão');
  check(
    comSimulacao.salarioBeneficio !== '5000.00',
    'o salário simulado NÃO pode virar o SB sozinho'
  );
}

/* ---------- 4. Teto limita a RMI e é declarado ---------- */
{
  const r = projetarAposentadoria({
    sexo: 'masculino',
    dataNascimento: '1966-05-10',
    dataReferencia: '2026-10-09',
    competencias: competenciasDe(1996, 6, 360, '3000.00'),
    teto: '2000.00'
  });
  igual(r.rmi, '2000.00', 'teto aplicado');
  igual(r.rmiSemLimite, false, 'flag de limite aplicado');
  check(r.avisos.some(a => /Limites aplicados/.test(a)), 'aviso declara o limite');
  const permanente = r.regrasElegiveis.find(x => x.id === 'idade-permanente');
  igual(permanente.limite, 'teto', 'limite registrado na regra');
}

/* ---------- 5. Piso limita a RMI ---------- */
{
  const r = projetarAposentadoria({
    sexo: 'masculino',
    dataNascimento: '1966-05-10',
    dataReferencia: '2026-10-09',
    competencias: competenciasDe(1996, 6, 360, '1000.00'),
    piso: '1500.00'
  });
  igual(r.rmi, '1500.00', 'piso aplicado');
  igual(r.rmiSemLimite, false, 'flag de limite aplicado pelo piso');
}

/* ---------- 6. Pedágio de 50%: alcançável com tempo anterior ao PBC ---------- */
{
  // 91 meses anteriores a 1994-07 + 305 competências (1994-07 a 2019-11) = 396
  // meses até a reforma. Faltavam 24 meses para os 420 → pedágio de 50% aplicável,
  // com pedágio de 12 meses (total exigido: 432).
  const comum = {
    sexo: 'masculino',
    dataNascimento: '1965-01-01',
    dataReferencia: '2019-12-31',
    competencias: competenciasDe(1994, 7, 305, '2500.00'),
    mesesContribuicaoAnteriores: 91
  };

  const semExpectativa = projetarAposentadoria(comum);
  igual(semExpectativa.regraEscolhida, null, 'sem RMI calculável não há regra vencedora');
  igual(semExpectativa.motivoSemRmi, 'sem_rmi_calculavel', 'motivo declarado');
  check(
    (semExpectativa.regrasElegiveisSemRmi || []).includes('pedagio-50'),
    'a regra atingida é declarada mesmo sem RMI'
  );
  igual(semExpectativa.rmi, null, 'sem expectativa de sobrevida não se inventa RMI');
  igual(semExpectativa.salarioBeneficio, '2500.00', 'SB continua sendo apresentado (só o PBC pós-1994)');
  check(
    semExpectativa.avisos.some(a => /RMI calculável/.test(a)),
    'aviso declara que não há RMI calculável'
  );
  check(
    semExpectativa.avisos.some(a => /anteriores a 1994-07/.test(a)),
    'aviso explica que meses anteriores contam para tempo, não para o PBC'
  );

  const comExpectativa = projetarAposentadoria({ ...comum, expectativaSobrevida: '25' });
  igual(comExpectativa.regraEscolhida, 'pedagio-50', 'mesma regra vencedora');
  check(comExpectativa.rmi !== null, 'com expectativa a RMI é calculada');
  igual(comExpectativa.criterioRmi, 'fator-previdenciario', 'critério por fator previdenciário');

  // A RMI tem de ser exatamente SB × fator, quantizada em centavos.
  const fator = fatorPrevidenciario({
    sexo: 'masculino',
    idadeAnos: comExpectativa.idadeDerAnos,
    tempoContribuicaoMeses: comExpectativa.tempoDerMeses,
    expectativaSobrevidaAnos: 25
  });
  const esperado = toFixedString(mul(parseDec('2500.00'), parseDec(fator.fator)), 2);
  igual(comExpectativa.rmi, esperado, 'RMI == SB × fator (arredondado a centavos)');
  igual(comExpectativa.carenciaDer, comExpectativa.tempoDerMeses, 'carência inclui os meses anteriores ao PBC');
}

/* ---------- 6b. Sem os meses anteriores, o pedágio de 50% não é alcançável ---------- */
{
  // Máximo entre 1994-07 e 2019-11 é 305 meses: abaixo dos 396 exigidos.
  const r = projetarAposentadoria({
    sexo: 'masculino',
    dataNascimento: '1965-01-01',
    dataReferencia: '2019-12-31',
    competencias: competenciasDe(1994, 7, 305, '2500.00')
  });
  check(r.regraEscolhida !== 'pedagio-50', 'sem tempo anterior o pedágio de 50% não é atingido');
}

/* ---------- 7. `regraAlvo` exige a regra pedida ---------- */
{
  const r = projetarAposentadoria({
    sexo: 'masculino',
    dataNascimento: '1966-05-10',
    dataReferencia: '2026-10-09',
    competencias: competenciasDe(1996, 6, 360, '3000.00'),
    regraAlvo: 'pontos'
  });
  // A regra de pontos exige 105 pontos; a idade permanente chega antes.
  check(r.der === null || r.regraEscolhida === 'pontos', 'regraAlvo só aceita a regra pedida');
  if (r.der !== null) igual(r.regraEscolhida, 'pontos', 'regra alvo respeitada');
  else igual(r.mesesSimulados, LIMITE_SIMULACAO_MESES, 'sem a regra alvo, esgota o limite');
}

/* ---------- 8. Nenhuma regra no limite → unsupported, sem valor ---------- */
{
  const r = projetarAposentadoria({
    sexo: 'masculino',
    dataNascimento: '2006-01-01',
    dataReferencia: '2026-01-01',
    competencias: competenciasDe(2025, 1, 12, '2000.00')
  });
  igual(r.der, null, 'jovem não atinge regra em 40 anos');
  igual(r.rmi, null, 'sem RMI inventada');
  igual(r.mesesSimulados, LIMITE_SIMULACAO_MESES, 'limite registrado');
  check(r.avisos.some(a => /Nenhuma regra elegível/.test(a)), 'aviso declara o limite atingido');

  const e = envelopeProjecao({
    sexo: 'masculino',
    dataNascimento: '2006-01-01',
    dataReferencia: '2026-01-01',
    competencias: competenciasDe(2025, 1, 12, '2000.00')
  });
  igual(e.status, 'unsupported', 'envelope unsupported');
  igual(e.data, null, 'unsupported não carrega dado');
  igual(e.legal_validation_performed, false, 'não valida juridicamente');
  check(e.missing.includes('regra_elegivel_no_limite_de_simulacao'), 'missing declara o motivo');
}

/* ---------- 9. Envelope experimental carrega o resultado ---------- */
{
  const e = envelopeProjecao({
    sexo: 'masculino',
    dataNascimento: '1966-05-10',
    dataReferencia: '2026-10-09',
    competencias: competenciasDe(1996, 6, 360, '3000.00')
  });
  igual(e.status, 'experimental', 'status experimental');
  igual(e.actual_entitlement_verified, false, 'não verifica direito');
  igual(e.policy_version, PROJECAO_POLICY_VERSION, 'versão da política');
  igual(e.data.native_result.rmi, '2640.00', 'RMI no envelope');
  check(e.warnings.some(a => /não constitui certidão/.test(a)), 'aviso de estimativa presente');
  check(e.warnings.some(a => /tempo especial/.test(a)), 'aviso de escopo presente');
}

/* ---------- 10. Correção monetária é recusada quando a série não alcança a DER ---------- */
{
  let erro = null;
  try {
    projetarAposentadoria({
      sexo: 'masculino',
      dataNascimento: '1966-05-10',
      dataReferencia: '2026-10-09',
      competencias: competenciasDe(1996, 6, 360, '3000.00'),
      corrigirSalarios: true
    });
  } catch (e) { erro = e; }
  check(erro instanceof ProjecaoError, 'correção além da série publicada é recusada');
  check(/série publicada termina/.test(String(erro?.message)), 'mensagem explica o motivo');
}

/* ---------- 11. Recusas declaradas ---------- */
const tentar = fn => { try { fn(); return null; } catch (e) { return e; } };
const base = {
  sexo: 'masculino',
  dataNascimento: '1966-05-10',
  dataReferencia: '2026-10-09',
  competencias: competenciasDe(1996, 6, 12, '3000.00')
};
check(tentar(() => projetarAposentadoria({ ...base, sexo: 'outro' })) instanceof ProjecaoError, 'sexo inválido deveria falhar');
check(tentar(() => projetarAposentadoria({ ...base, dataNascimento: '10/05/1966' })) instanceof ProjecaoError, 'data BR deveria falhar');
check(tentar(() => projetarAposentadoria({ ...base, competencias: [] })) instanceof ProjecaoError, 'sem competências deveria falhar');
check(tentar(() => projetarAposentadoria({ ...base, competencias: competenciasDe(1990, 1, 3, '100.00') })) instanceof ProjecaoError, 'competência antes de 1994-07 deveria falhar');
check(tentar(() => projetarAposentadoria({ ...base, competencias: [{ competencia: '2020-01', salario: '0' }] })) instanceof ProjecaoError, 'salário zero deveria falhar');
check(tentar(() => projetarAposentadoria({ ...base, competencias: [{ competencia: '2020-01', salario: '-5' }] })) instanceof ProjecaoError, 'salário negativo deveria falhar');
check(tentar(() => projetarAposentadoria({ ...base, salarioSimulacao: '0' })) instanceof ProjecaoError, 'salário de simulação zero deveria falhar');
check(tentar(() => projetarAposentadoria({ ...base, regraAlvo: 'inventada' })) instanceof ProjecaoError, 'regra alvo desconhecida deveria falhar');
check(tentar(() => projetarAposentadoria({ ...base, expectativaSobrevida: '-3' })) instanceof ProjecaoError, 'expectativa negativa deveria falhar');
check(tentar(() => projetarAposentadoria({ ...base, piso: '9000.00', teto: '1000.00' })) instanceof ProjecaoError, 'piso maior que teto deveria falhar');
check(tentar(() => projetarAposentadoria({ ...base, competencias: [...competenciasDe(2020, 1, 2, '100.00'), { competencia: '2020-01', salario: '200.00' }] })) instanceof ProjecaoError, 'competência duplicada deveria falhar');
check(tentar(() => projetarAposentadoria({ ...base, mesesContribuicaoAnteriores: -1 })) instanceof ProjecaoError, 'meses anteriores negativos deveriam falhar');
check(tentar(() => projetarAposentadoria({ ...base, mesesContribuicaoAnteriores: 601 })) instanceof ProjecaoError, 'meses anteriores acima de 600 deveriam falhar');
check(tentar(() => projetarAposentadoria({ ...base, mesesContribuicaoAnteriores: 1.5 })) instanceof ProjecaoError, 'meses anteriores fracionários deveriam falhar');

/* ---------- 12. Constantes ---------- */
igual(LIMITE_SIMULACAO_MESES, 480, 'limite de simulação da fonte');
igual(REGRAS_PROJETAVEIS.length, 5, 'cinco regras projetáveis');

console.log(`\n${ok} verificações OK${falhas.length ? `, ${falhas.length} FALHAS` : ', 0 falhas'}`);
for (const f of falhas) console.log(`  - ${f}`);
if (falhas.length) process.exitCode = 1;
