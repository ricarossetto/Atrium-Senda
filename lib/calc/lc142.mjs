/**
 * Motor do perfil previdenciário LC 142/2013 de GRAU CONSTANTE.
 *
 * Port em JavaScript do contrato `lc142-constant-grade-v1` observado no motor
 * de referência (commit 8ec45ec2). Reproduz aritmética, guardas, envelope e
 * proveniência. NÃO é validação jurídica, não certifica concessão, deficiência,
 * carência jurídica nem direito adquirido.
 *
 * Invariantes deste arquivo:
 *  1. Dinheiro, índices, fatores e percentuais usam o decimal escalado de 18
 *     casas (`decimal.mjs`, BigInt). Nenhum `Number` participa de aritmética
 *     financeira nem de formatação de valor.
 *  2. O fator de correção é multiplicado integral; só a EXIBIÇÃO é truncada em
 *     6 casas.
 *  3. Arredondamento monetário é `half-up` com meio afastado de zero, 2 casas,
 *     apenas onde o motor de origem arredonda.
 *  4. Ausência de dado nunca vira zero nem é preenchida por inferência: ou é
 *     bloqueio explícito, ou é hipótese declarada com evidência.
 *  5. Toda saída é JSON-safe: strings monetárias, inteiros de contagem, sem BigInt.
 *
 * Convenção de tempo: `declared_30_360_inclusive_union` (ver `calendar-30360.mjs`).
 */

import {
  add,
  cmp,
  div,
  mul,
  parseDec,
  roundTo,
  sub,
  toFixedString
} from './decimal.mjs';
import {
  LC142_CARENCIA_MESES,
  LC142_COEFICIENTE,
  LC142_ENGINE_ID,
  LC142_LIMITS,
  LC142_ORIGEM,
  LC142_PBC_INICIO,
  LC142_PERCENTUAL_CONSIDERADO,
  LC142_POLITICAS_NEGATIVAS,
  LC142_RULE_REVIEW_STATUS,
  avisosDoPerfil,
  normalizarTexto,
  tempoExigidoAnos
} from './lc142-profile.mjs';
import {
  competenceOf,
  competencesBetween,
  coveredCompetences,
  durationFromDays,
  durationUntil,
  mergePeriods,
  nextCompetence,
  parseIsoDate,
  periodDays30_360,
  salaryDays30_360
} from './calendar-30360.mjs';
import {
  Lc142SnapshotError,
  fatorDeCorrecao,
  fatorTruncado6,
  indexSnapshot,
  money2,
  parseHipoteseDecimal,
  validateSnapshot
} from './lc142-snapshot.mjs';
import {
  Lc142OverlayError,
  projectContributionReview,
  validateContributionReview,
  validateSourceLinks,
  valorEmCentavos
} from './lc142-overlays.mjs';

export { Lc142SnapshotError, Lc142OverlayError };
export { LC142_ENGINE_ID };

export class Lc142Error extends Error {
  constructor(message) {
    super(message);
    this.name = 'Lc142Error';
  }
}

const ZERO = parseDec('0');
const UM = parseDec('1');

function bloqueio(code, field, message) {
  return { code, field, message };
}

/**
 * Envelope de bloqueio: `data` SEMPRE null. Bloqueio não carrega número.
 */
export function blockedEnvelope(blockers, warnings = []) {
  const missing = [];
  for (const blocker of blockers) {
    if (!missing.includes(blocker.code)) missing.push(blocker.code);
  }
  return {
    status: 'blocked',
    rule_review_status: 'unvalidated',
    policy_version: 'rgps-core-observational-v1',
    legal_validation_performed: false,
    data: null,
    missing,
    blockers,
    warnings: Array.isArray(warnings) ? warnings : []
  };
}

/**
 * Interpreta `calculation.options.rule_policy` (string JSON) sem inventar
 * política quando o texto não é JSON.
 */
export function parseRulePolicy(rawPolicy) {
  const text = typeof rawPolicy === 'string' ? rawPolicy.trim() : '';
  if (!text.startsWith('{')) return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Lc142Error('Política de cálculo inválida.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Lc142Error('Política de cálculo inválida.');
  }
  return parsed;
}

/**
 * Normaliza a política LC 142 para uso interno, aplicando os padrões do
 * contrato Rust (`#[serde(default)]`).
 */
function normalizarPolitica(lc142) {
  const snapshot = lc142?.snapshot ?? null;
  return {
    version: typeof lc142?.version === 'string' ? lc142.version : '',
    calculation_date: typeof lc142?.calculation_date === 'string' ? lc142.calculation_date : '',
    correction_month: typeof lc142?.correction_month === 'string' ? lc142.correction_month : '',
    assumptions_confirmed: lc142?.assumptions_confirmed === true,
    review_evidence: typeof lc142?.review_evidence === 'string' ? lc142.review_evidence : '',
    disability_all_periods: lc142?.disability_all_periods === true,
    disability_evidence: typeof lc142?.disability_evidence === 'string' ? lc142.disability_evidence : '',
    rgps_confirmed: lc142?.rgps_confirmed === true,
    project_open_links: lc142?.project_open_links === true,
    ongoing_evidence: typeof lc142?.ongoing_evidence === 'string' ? lc142.ongoing_evidence : '',
    fill_missing_minimum: lc142?.fill_missing_minimum === true,
    missing_salary_evidence: typeof lc142?.missing_salary_evidence === 'string'
      ? lc142.missing_salary_evidence
      : '',
    project_at_known_ceiling: lc142?.project_at_known_ceiling === true,
    projection_evidence: typeof lc142?.projection_evidence === 'string'
      ? lc142.projection_evidence
      : '',
    historical_negative_policy: typeof lc142?.historical_negative_policy === 'string'
      ? lc142.historical_negative_policy
      : '',
    apply_inss_overrides: lc142?.apply_inss_overrides === true,
    snapshot
  };
}

/**
 * Mês de correção a partir de uma data-base ISO.
 */
function mesDeCorrecao(baseIso) {
  return baseIso.slice(0, 7);
}

/**
 * Calcula o cenário. Retorna o envelope `experimental` ou `blocked`.
 * Lança `Lc142Error`/`Lc142SnapshotError`/`Lc142OverlayError` apenas para
 * falhas de validação estruturais, como o motor de origem.
 */
export function calculateLc142(calculation, lc142Policy = null) {
  if (!calculation || typeof calculation !== 'object') {
    throw new Lc142Error('Cenário de cálculo inválido.');
  }
  /* Aceita as duas formas que chegam na prática:
   *  - o objeto do perfil direto (`{calculation_date, snapshot, ...}`), usado
   *    por `calculateCase` ao ler `options.rule_policy.lc142`; e
   *  - o envelope de política completo (`{lc142: {...}, version}`), que é o que
   *    o frontend envia em `body.politica` e o handler repassa.
   * Sem isso, o fluxo da tela mandava o envelope, `normalizarPolitica` não
   * encontrava `calculation_date` e o motor lançava "Data ISO inválida." —
   * enquanto a rota respondia 400 para um cenário que era válido. */
  const politicaNormalizada =
    lc142Policy && typeof lc142Policy === 'object' && lc142Policy.lc142 && typeof lc142Policy.lc142 === 'object'
      ? lc142Policy.lc142
      : lc142Policy;
  const policy = normalizarPolitica(politicaNormalizada);
  const blockers = [];
  const issue = (code, field, message) => blockers.push(bloqueio(code, field, message));

  // 1. Guardas de hipótese e documentação -----------------------------------
  if (normalizarTexto(calculation.kind) !== 'rgps') {
    issue('lc142_kind', 'kind', 'Cenário LC 142 exige RGPS.');
  }
  if (
    policy.version !== LC142_ENGINE_ID ||
    !policy.assumptions_confirmed ||
    policy.review_evidence.trim() === ''
  ) {
    issue(
      'lc142_review',
      'options.rule_policy.lc142',
      'Confirme as premissas e a referência documental deste cenário.'
    );
  }
  if (!policy.disability_all_periods || policy.disability_evidence.trim() === '') {
    issue(
      'lc142_disability_periods',
      'disability',
      'Esta versão exige um grau constante em todos os períodos, declarado e documentado. Graus mistos/conversões não são presumidos.'
    );
  }
  if (!policy.rgps_confirmed) {
    issue(
      'lc142_regime',
      'cnis.links',
      'Confirme documentalmente o regime dos períodos; ausência de PRPPS não comprova RGPS.'
    );
  }

  // 2. Parâmetros do segurado ----------------------------------------------
  const sexo = normalizarTexto(calculation.sex);
  const grau = normalizarTexto(calculation.disability);
  const anosExigidos = tempoExigidoAnos(grau, sexo) ?? 0;
  if (anosExigidos === 0) {
    issue(
      'lc142_parameters',
      'identity',
      'Sexo e grau de deficiência precisam ser declarados.'
    );
  }
  const nascimentoRaw = calculation.identity?.birth_date ?? null;
  const nascimento = typeof nascimentoRaw === 'string' ? parseIsoDate(nascimentoRaw) : null;
  if (nascimento === null) {
    issue('lc142_birth', 'identity.birth_date', 'Confirme a data de nascimento.');
  }
  const dib = parseIsoDate(calculation.dib);
  const dataBase = parseIsoDate(policy.calculation_date);
  if (!/^\d{4}-\d{2}$/.test(policy.correction_month)) {
    throw new Lc142Error('Competência AAAA-MM inválida.');
  }
  const mesCorrecaoEsperado = mesDeCorrecao(policy.calculation_date);
  if (
    policy.calculation_date > (typeof calculation.dib === 'string' ? calculation.dib : '') ||
    policy.correction_month !== mesCorrecaoEsperado
  ) {
    issue(
      'lc142_reference',
      'calculation_date',
      'A data-base deve ser anterior ou igual à DIB e corresponder ao mês da correção.'
    );
  }
  if (!LC142_POLITICAS_NEGATIVAS.includes(policy.historical_negative_policy)) {
    issue(
      'lc142_method',
      'historical_negative_policy',
      'Selecione o tratamento histórico das variações negativas.'
    );
  }

  // 3. Opções de workspace que este motor não usa ----------------------------
  const options = calculation.options ?? {};
  if (
    textoNaoVazio(options.interest_rate) ||
    textoNaoVazio(options.interest_kind) ||
    textoNaoVazio(options.fees_percent) ||
    textoNaoVazio(options.fees_fixed) ||
    textoNaoVazio(options.prescription_date) ||
    textoNaoVazio(options.reference_base) ||
    options.include_thirteenth === true
  ) {
    issue(
      'workspace_options_unsupported',
      'options',
      'Juros, honorários e atrasados são separados da RMI; parâmetros antigos não serão ignorados.'
    );
  }

  // 4. Overlays documentais -------------------------------------------------
  validateSourceLinks(calculation);
  const review = calculation.contribution_review ?? null;
  if (review) {
    validateContributionReview(review, calculation);
    if (review.applied !== true) {
      issue(
        'contribution_review_unapplied',
        'contribution_review',
        'Aplique o livro revisado antes de calcular.'
      );
    }
  }

  // 5. Snapshot -------------------------------------------------------------
  if (!policy.snapshot) {
    issue('lc142_snapshot', 'snapshot', 'Consulte os índices e limites públicos antes de executar.');
    return blockedEnvelope(blockers, []);
  }
  validateSnapshot(policy.snapshot);
  if (policy.snapshot.through !== policy.correction_month) {
    issue(
      'lc142_snapshot_date',
      'snapshot.through',
      'Snapshot pertence a outro mês de referência.'
    );
  }

  // 6. Origem CNIS ----------------------------------------------------------
  const cnis = calculation.cnis ?? null;
  if (!cnis) {
    issue(
      'lc142_source',
      'cnis',
      'Esta versão do cenário requer origem CNIS preservada.'
    );
    return blockedEnvelope(blockers, []);
  }
  const cnisLinks = Array.isArray(cnis.links) ? cnis.links : [];
  const cnisSalaryEntries = Array.isArray(cnis.salary_entries) ? cnis.salary_entries : [];
  const cnisSalaryMonths = cnis.salary_months && typeof cnis.salary_months === 'object'
    ? cnis.salary_months
    : {};
  if (cnisLinks.some(link => link.prpps === true || link.excluded_from_validated_domain === true)) {
    issue(
      'lc142_ctc',
      'cnis.links',
      'CTC/regime próprio não são convertidos automaticamente neste cenário.'
    );
  }
  if (cnisLinks.length > LC142_LIMITS.maxVinculos || Object.keys(cnisSalaryMonths).length > LC142_LIMITS.maxSalarios) {
    throw new Lc142Error('Quantidade de vínculos/salários excede o cenário suportado.');
  }
  if (
    cnisSalaryEntries.some(
      entry => entry.amount_kind === 'contribution_column_unresolved'
    )
  ) {
    issue(
      'lc142_salary_column',
      'cnis.salary_entries',
      'Há valores de contribuição sem salário identificado; não inferir salário pela alíquota.'
    );
  }

  // 7. Trechos de vínculo ---------------------------------------------------
  const dibIso = typeof calculation.dib === 'string' ? calculation.dib : '';
  const manualLinks = Array.isArray(calculation.manual_links) ? calculation.manual_links : [];
  /* O teto do perfil vale para QUALQUER origem de vínculo. Antes ele só era
   * aplicado a `cnis.links`, então `manual_links` com milhares de itens passava
   * e o custo da união de períodos × competências crescia sem limite. */
  if (manualLinks.length > LC142_LIMITS.maxVinculos) {
    throw new Lc142Error(
      `Vínculos manuais excedem o limite do cenário (${LC142_LIMITS.maxVinculos}).`
    );
  }
  const intervalos = [];
  if (manualLinks.length === 0) {
    for (const link of cnisLinks) {
      const startRaw = link.start_date ?? null;
      if (typeof startRaw !== 'string' || startRaw === '') {
        issue('lc142_link_start', 'cnis.links', 'Início de vínculo ausente.');
        continue;
      }
      let endIso;
      if (typeof link.end_date === 'string' && link.end_date !== '') {
        endIso = link.end_date;
      } else {
        if (!policy.project_open_links || policy.ongoing_evidence.trim() === '') {
          issue(
            'lc142_open_end',
            'cnis.links',
            'Fim ausente exige hipótese explícita de continuidade; não será substituído pelo último salário.'
          );
        }
        endIso = dibIso;
      }
      const start = parseIsoDate(startRaw);
      const end = parseIsoDate(endIso);
      const startIso = startRaw;
      if (startIso > endIso) {
        issue('lc142_link_dates', 'cnis.links', 'Datas de vínculo inconsistentes.');
      } else if (startIso <= dibIso) {
        intervalos.push([startIso, endIso < dibIso ? endIso : dibIso]);
      }
    }
  } else {
    for (const link of manualLinks) {
      if (link.source_review?.excluded === true) continue;
      if (
        link.confirmed !== true ||
        normalizarTexto(link.regime).toUpperCase() !== 'RGPS' ||
        (typeof link.indicators === 'string' ? link.indicators : '').trim() !== ''
      ) {
        issue(
          'lc142_manual_link_review',
          'manual_links',
          'Períodos declarados exigem RGPS, confirmação e indicadores resolvidos.'
        );
      }
      const startIso = parseIsoDate(link.start_date);
      const endIso = parseIsoDate(link.end_date);
      if (link.start_date > link.end_date) {
        issue('lc142_link_dates', 'manual_links', 'Datas de vínculo inconsistentes.');
      } else if (link.start_date <= dibIso) {
        intervalos.push([link.start_date, link.end_date < dibIso ? link.end_date : dibIso]);
      }
    }
  }
  if (nascimento !== null) {
    const nascimentoIso = calculation.identity.birth_date;
    if (intervalos.some(([inicio]) => inicio < nascimentoIso)) {
      issue(
        'lc142_period_before_birth',
        'cnis.links',
        'Período anterior ao nascimento; corrija a origem/hipótese.'
      );
    }
  }
  const merged = mergePeriods(intervalos);
  if (merged.length === 0) {
    issue(
      'lc142_no_periods',
      'cnis.links',
      'Nenhum período de contribuição declarado.'
    );
  }

  // 8. Índices e limites indexados -----------------------------------------
  const { rates, limits } = indexSnapshot(policy.snapshot);
  const limiteCorrente = limits.get(policy.correction_month);
  if (!limiteCorrente) {
    issue(
      'lc142_limits',
      'snapshot.limits',
      'Piso/teto do mês de referência não estão disponíveis.'
    );
    return blockedEnvelope(blockers, []);
  }
  if (blockers.length > 0) {
    return blockedEnvelope(blockers, []);
  }

  // 9. Salários manuais exigem livro aplicado e rastreável ------------------
  const manualSalaries = Array.isArray(calculation.manual_salaries) ? calculation.manual_salaries : [];
  if (!review && manualSalaries.length > 0) {
    issue(
      'lc142_unreviewed_salaries',
      'manual_salaries',
      'Salários manuais exigem um livro de contribuições aplicado e rastreável; não serão ignorados nem substituirão a origem silenciosamente.'
    );
    return blockedEnvelope(blockers, []);
  }

  // 10. Mapa de salários por competência -----------------------------------
  const salarios = new Map();
  if (review) {
    for (const salary of manualSalaries) {
      if (salarios.has(salary.competence)) {
        throw new Lc142Error('Salário duplicado exige consolidação documental.');
      }
      salarios.set(salary.competence, {
        valor: parseDec(fromCentavosParaDecimal(salary.amount)),
        origem: LC142_ORIGEM.LIVRO_REVISADO
      });
    }
  } else {
    for (const [competence, month] of Object.entries(cnisSalaryMonths)) {
      salarios.set(competence, {
        valor: parseDec(fromCentavosParaDecimal(month.amount_sum_centavos)),
        origem: LC142_ORIGEM.IMPORTADO
      });
    }
  }

  // 11. PBC ----------------------------------------------------------------
  const primeiraCompetencia = [...salarios.keys()].sort().find(month => month >= LC142_PBC_INICIO);
  if (!primeiraCompetencia) throw new Lc142Error('Sem salários no PBC suportado.');
  const dibMes = companyMonth(dib);
  const mesDib = `${dibMes.year}-${pad2(dibMes.month)}`;
  const linhas = [];
  let preenchidosMinimo = 0;
  let projecoes = 0;
  let cursor = primeiraCompetencia;
  while (cursor < mesDib) {
    if (linhas.length >= LC142_LIMITS.maxCompetenciasPbc) {
      throw new Lc142Error('PBC excede 1.200 competências.');
    }
    const dentro = merged.some(([inicio, fim]) => {
      const inicioMes = inicio.slice(0, 7);
      const fimMes = fim.slice(0, 7);
      return inicioMes <= cursor && cursor <= fimMes;
    });
    if (!dentro) {
      cursor = nextCompetence(cursor);
      continue;
    }
    const competenciaConhecida = cursor > policy.correction_month
      ? policy.correction_month
      : cursor;
    const limite = limits.get(competenciaConhecida);
    if (!limite) throw new Lc142Error('Snapshot sem piso/teto da competência; não extrapolar.');
    const teto = parseHipoteseDecimal(limite.ceiling);
    const piso = parseHipoteseDecimal(limite.minimum);

    let nominal;
    let origem;
    const salarioConhecido = salarios.get(cursor);
    if (salarioConhecido) {
      nominal = salarioConhecido.valor;
      origem = salarioConhecido.origem;
    } else if (cursor < policy.correction_month) {
      if (!policy.fill_missing_minimum || policy.missing_salary_evidence.trim() === '') {
        issue(
          'lc142_missing_salary',
          'competencias',
          'Há competência sem salário; escolha e documente a hipótese antes de preencher.'
        );
        break;
      }
      preenchidosMinimo += 1;
      nominal = piso;
      origem = LC142_ORIGEM.MINIMO_DECLARADO;
    } else {
      if (!policy.project_at_known_ceiling || policy.projection_evidence.trim() === '') {
        issue(
          'lc142_projection',
          'projection',
          'Salário futuro exige projeção explícita; não é contribuição observada.'
        );
        break;
      }
      projecoes += 1;
      const tetoCorrente = parseHipoteseDecimal(limiteCorrente.ceiling);
      nominal = tetoCorrente;
      origem = LC142_ORIGEM.PROJECAO_DECLARADA;
    }
    if (cmp(nominal, ZERO) < 0) throw new Lc142Error('Salário negativo não é suportado.');
    const considerado = cmp(nominal, teto) <= 0 ? nominal : teto;
    const fator = fatorDeCorrecao(
      cursor,
      policy.correction_month,
      rates,
      policy,
      nextCompetence
    );
    const corrigido = roundTo(mul(considerado, fator), 2, 'half-up');
    linhas.push({
      competencia: cursor,
      salario: money2(nominal),
      teto: money2(teto),
      considerado: money2(considerado),
      indice: fatorTruncado6(fator),
      corrigido: money2(corrigido),
      origem,
      dias: salaryDays30_360(merged, cursor),
      fonte: policy.snapshot.source_url
    });
    cursor = nextCompetence(cursor);
  }
  if (blockers.length > 0) return blockedEnvelope(blockers, []);
  if (linhas.length === 0) throw new Lc142Error('Sem parcelas no PBC.');
  const consideradas = Math.trunc((linhas.length * LC142_PERCENTUAL_CONSIDERADO) / 100);
  if (consideradas === 0) throw new Lc142Error('PBC insuficiente para a média de 80%.');

  // 12. Seleção dos 80% maiores, desempate cronológico ----------------------
  const ordenado = linhas
    .map((linha, indice) => ({ indice, valor: parseDec(linha.corrigido) }))
    .sort((a, b) => {
      const comparacao = cmp(b.valor, a.valor);
      return comparacao !== 0 ? comparacao : a.indice - b.indice;
    });
  const selecionadas = new Set(ordenado.slice(0, consideradas).map(item => item.indice));
  let soma = ZERO;
  const descartadas = [];
  for (let indice = 0; indice < linhas.length; indice += 1) {
    const linha = linhas[indice];
    const escolhida = selecionadas.has(indice);
    linha.descartada = !escolhida;
    if (escolhida) {
      soma = add(soma, parseDec(linha.corrigido));
    } else {
      descartadas.push(linha.competencia);
    }
  }
  const media = roundTo(divisaoExata(soma, consideradas), 2, 'half-up');

  // 13. Tempo, carência e elegibilidade ------------------------------------
  const tempoTotal = durationUntil(merged, dibIso);
  const tempoSemProjecao = durationUntil(merged, typeof policy.calculation_date === 'string' ? policy.calculation_date : dibIso);
  const competenciasCobertas = coveredCompetences(merged);
  const elegivel =
    tempoTotal.days_30_360 >= anosExigidos * 360 && competenciasCobertas.size >= LC142_CARENCIA_MESES;

  // 14. RMI: piso/teto do mês de correção -----------------------------------
  const tetoCorrente = parseHipoteseDecimal(limiteCorrente.ceiling);
  const pisoCorrente = parseHipoteseDecimal(limiteCorrente.minimum);
  let rmi = cmp(media, tetoCorrente) <= 0 ? media : tetoCorrente;
  if (cmp(rmi, pisoCorrente) < 0) rmi = pisoCorrente;

  const warnings = avisosDoPerfil({
    filledMinimumCount: preenchidosMinimo,
    projectionCount: projecoes
  });

  // 15. Envelope experimental ----------------------------------------------
  const nativeResult = {
    engine_id: LC142_ENGINE_ID,
    resumo: {
      competencias: linhas.length,
      carencia_meses: competenciasCobertas.size,
      soma_salarios: money2(soma),
      salario_beneficio: money2(media),
      coeficiente: LC142_COEFICIENTE,
      rmi_bruta: money2(media),
      rmi: elegivel ? money2(rmi) : null,
      teto: money2(tetoCorrente),
      piso: money2(pisoCorrente)
    },
    parametros: {
      divisor: consideradas,
      correcao_ativa: true,
      referencia_correcao: policy.correction_month,
      descarte_aplicado: true,
      divisor_minimo_aplicado: false,
      coeficiente: LC142_COEFICIENTE
    },
    correcao: {
      referencia: policy.correction_month,
      pbc: linhas.length,
      consideradas,
      descartadas: descartadas.length,
      parcelas: linhas,
      parcelas_descartadas: descartadas,
      soma_considerada: money2(soma),
      media: money2(media),
      salario_beneficio: money2(media),
      descarte_aplicado: true
    },
    tempo: {
      total: tempoTotal,
      sem_projecao: tempoSemProjecao,
      carencia_meses: competenciasCobertas.size,
      convention: 'declared_30_360_inclusive_union',
      vinculos: merged.map(([inicio, fim]) => ({
        inicio,
        fim,
        dias_30_360: periodDays30_360(inicio, fim)
      }))
    },
    pcd: {
      grau,
      anos_exigidos: anosExigidos,
      tempo_atingido_no_cenario: elegivel,
      calculation_date: policy.calculation_date,
      projection_count: projecoes,
      filled_minimum_count: preenchidosMinimo,
      source_sha256: cnis?.metadata?.source_sha256 ?? null,
      snapshot_sha256: policy.snapshot.response_sha256,
      disability_evidence: policy.disability_evidence,
      review_evidence: policy.review_evidence,
      assumptions_confirmed: true,
      actual_entitlement_verified: false
    },
    memoria: [
      {
        tipo: 'regra',
        descricao:
          'LC 142, grau constante; média dos 80% maiores salários e coeficiente declarado de 100%',
        valor: money2(media)
      }
    ],
    avisos: warnings
  };

  return {
    status: 'experimental',
    legal_validation_performed: false,
    rule_review_status: LC142_RULE_REVIEW_STATUS,
    warnings,
    data: { native_result: nativeResult }
  };
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function companyMonth(date) {
  return { year: date.year, month: date.month };
}

function textoNaoVazio(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * Converte centavos inteiros em string decimal oficial ("123456" -> "1234.56").
 */
function fromCentavosParaDecimal(cents) {
  const value = typeof cents === 'bigint' ? cents : BigInt(Math.trunc(Number(cents)));
  const negativo = value < 0n;
  const absoluto = negativo ? -value : value;
  const inteiro = absoluto / 100n;
  const fracao = absoluto % 100n;
  return `${negativo ? '-' : ''}${inteiro}.${fracao.toString().padStart(2, '0')}`;
}

/**
 * Divisão exata no domínio decimal escalado.
 *
 * `dividendo` já está na escala de 18 casas; `div` preserva a escala e devolve
 * um quociente de 18 casas. O arredondamento monetário (2 casas, meio afastado
 * de zero) é aplicado depois, uma única vez, pelo chamador.
 */
function divisaoExata(dividendo, divisor) {
  return div(dividendo, divisor);
}

/**
 * Ponto de entrada compatível com `calculate_case` do motor de origem:
 * resolve `options.rule_policy` e despacha para o perfil LC 142 quando presente.
 */
export function calculateCase(calculation) {
  const policy = parseRulePolicy(calculation?.options?.rule_policy);
  if (policy?.lc142) return calculateLc142(calculation, policy.lc142);
  // Sem política LC 142 explícita não há cálculo silencioso neste motor.
  const blockers = [];
  if (policy?.version !== 'rgps-core-observational-v1') {
    blockers.push(
      bloqueio(
        'case_policy_missing',
        'options.rule_policy',
        'Informar JSON de política versionada e evidência de revisão; não inferir do nome do cenário.'
      )
    );
  }
  blockers.push(
    bloqueio(
      'lc142_policy_missing',
      'options.rule_policy.lc142',
      'Cenário não declara o perfil LC 142 de grau constante; este motor não calcula outro perfil.'
    )
  );
  return blockedEnvelope(blockers, []);
}

export { valorEmCentavos, projectContributionReview, toFixedString, sub, UM };
