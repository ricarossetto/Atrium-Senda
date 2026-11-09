/**
 * Perfil versionado `lc142-constant-grade-v1` — constantes e contrato do cenário.
 *
 * Cada constante aqui é uma decisão jurídica observada no motor de referência.
 * Não são preferências de implementação. Alterar qualquer uma exige nova versão
 * de metodologia e novo oráculo, nunca ajuste silencioso para um teste passar.
 *
 * Este perfil é CONVENÇÃO COMPARATIVA VERSIONADA. Não certifica concessão,
 * deficiência, carência jurídica nem direito adquirido.
 */

export const LC142_ENGINE_ID = 'lc142-constant-grade-v1';
export const LC142_POLICY_VERSION = 'rgps-core-observational-v1';

/** Tempo mínimo de contribuição na condição de PcD, em anos completos. */
export const LC142_TEMPO_EXIGIDO = Object.freeze({
  grave: Object.freeze({ masculino: 25, feminino: 20 }),
  moderada: Object.freeze({ masculino: 29, feminino: 24 }),
  leve: Object.freeze({ masculino: 33, feminino: 28 })
});

export const LC142_CARENCIA_MESES = 180;
export const LC142_GRAUS = Object.freeze(['leve', 'moderada', 'grave']);
export const LC142_SEXOS = Object.freeze(['masculino', 'feminino']);

/** Início do PBC suportado. Competências anteriores não entram na média. */
export const LC142_PBC_INICIO = '1994-07';

/** Percentual de parcelas consideradas na média (parte inteira, truncada). */
export const LC142_PERCENTUAL_CONSIDERADO = 80;

/** Cortes históricos da série de correção composta do perfil. */
export const LC142_CORTE_IPC_R = '1995-06';
export const LC142_CORTE_IGPDI = '2004-01';
export const LC142_INICIO_INPC_INSS = '1996-04';
export const LC142_CORTE_NEGATIVA_HISTORICA = '1999-12';

/** Políticas de tratamento de variações negativas publicadas. */
export const LC142_POLITICAS_NEGATIVAS = Object.freeze(['preserve', 'floor_before_1999_12']);

/** Prefixo HTTPS obrigatório da proveniência do snapshot público de índices. */
export const LC142_SNAPSHOT_URL_PREFIX = 'https://fabrica-de-calculos.app.trf3.jus.br/indices/api/v1/';

/** Limites declarados do cenário. */
export const LC142_LIMITS = Object.freeze({
  maxVinculos: 2000,
  maxSalarios: 2400,
  maxCompetenciasPbc: 1200,
  maxSnapshotCompetencias: 3000,
  maxUrlSnapshot: 500,
  maxFundamento: 2000,
  maxDecimalPublico: 80,
  maxDecimalHipotese: 40
});

/** Faixa operacional de datas do perfil. */
export const LC142_ANO_MIN = 1900;
export const LC142_ANO_MAX = 2100;

/** Códigos de bloqueio, na grafia do motor de origem. */
export const LC142_BLOCKERS = Object.freeze({
  KIND: 'lc142_kind',
  REVIEW: 'lc142_review',
  DISABILITY_PERIODS: 'lc142_disability_periods',
  REGIME: 'lc142_regime',
  PARAMETERS: 'lc142_parameters',
  BIRTH: 'lc142_birth',
  REFERENCE: 'lc142_reference',
  METHOD: 'lc142_method',
  WORKSPACE_OPTIONS: 'workspace_options_unsupported',
  SNAPSHOT: 'lc142_snapshot',
  SNAPSHOT_DATE: 'lc142_snapshot_date',
  SOURCE: 'lc142_source',
  CTC: 'lc142_ctc',
  SALARY_COLUMN: 'lc142_salary_column',
  LINK_START: 'lc142_link_start',
  OPEN_END: 'lc142_open_end',
  LINK_DATES: 'lc142_link_dates',
  MANUAL_LINK_REVIEW: 'lc142_manual_link_review',
  PERIOD_BEFORE_BIRTH: 'lc142_period_before_birth',
  NO_PERIODS: 'lc142_no_periods',
  LIMITS: 'lc142_limits',
  UNREVIEWED_SALARIES: 'lc142_unreviewed_salaries',
  MISSING_SALARY: 'lc142_missing_salary',
  PROJECTION: 'lc142_projection',
  CONTRIBUTION_REVIEW_UNAPPLIED: 'contribution_review_unapplied'
});

/** Origem declarada de cada parcela do PBC. */
export const LC142_ORIGEM = Object.freeze({
  IMPORTADO: 'imported',
  MINIMO_DECLARADO: 'declared_missing_minimum',
  PROJECAO_DECLARADA: 'declared_projection',
  LIVRO_REVISADO: 'reviewed_overlay'
});

export const LC142_RULE_REVIEW_STATUS = 'declared_scenario_assumptions';
export const LC142_COEFICIENTE = '100.00';

/**
 * Resolve o valor de tempo exigido para sexo e grau declarados.
 * Retorna `null` quando a combinação não é suportada — o chamador gera
 * o bloqueio `lc142_parameters`, nunca inventa um grau ou sexo.
 */
export function tempoExigidoAnos(grau, sexo) {
  const tabelaGrau = LC142_TEMPO_EXIGIDO[grau];
  if (!tabelaGrau) return null;
  const valor = tabelaGrau[sexo];
  return Number.isInteger(valor) ? valor : null;
}

/**
 * Normaliza um texto de sexo ou grau. Retorna string vazia quando ausente,
 * para que o chamador decida bloquear em vez de assumir um padrão.
 */
export function normalizarTexto(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/** Avisos fixos do perfil, na ordem do motor de origem. */
export function avisosDoPerfil({ filledMinimumCount = 0, projectionCount = 0 } = {}) {
  return [
    'SIMULAÇÃO com premissas declaradas, não concessão ou validação jurídica.',
    'LC 142: apenas grau constante em todos os períodos; não suporta conversões por graus mistos, atividade especial, CTC automática ou fator previdenciário.',
    `${filledMinimumCount} competências preenchidas por hipótese de mínimo; ${projectionCount} projetadas pelo teto conhecido. Não são salários extraídos.`,
    'Períodos abertos são continuados somente por hipótese explícita. Limites futuros são congelados no snapshot conhecido, não valores oficiais futuros.',
    'Contagem de tempo adota convenção declarada 30/360 inclusiva, com união das sobreposições; revisar a aplicação profissional.'
  ];
}
