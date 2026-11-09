// Relatórios PDF das sete famílias do perfil previdenciário LC 142/2013
// (grau constante), montados exclusivamente sobre o resultado oficial do
// motor (`resultado.data.native_result`) e metadados de proveniência.
//
// Regras duras:
// - o renderer NÃO recalcula nada: todo valor monetário chega como string
//   decimal já formatada pelo motor ("2550.00") e aqui só é convertido para a
//   apresentação pt-BR por manipulação de string (separador de milhar "." e
//   decimal ","). Nenhum Number participa de aritmética financeira.
// - identificação do segurado é desligada por padrão; só aparece quando o
//   chamador passa `identificacao: { habilitada: true, ... }`.
// - toda família carrega o aviso de simulação e `actual_entitlement_verified:
//   false`, além da proveniência do snapshot/cenário.

import { createHash } from 'node:crypto';
import { paginate, PdfWriter, LAYOUT } from './pdf-writer.mjs';
import { TYPE, SPACING } from './pdf-theme.mjs';

export const LC142_REPORT_FAMILIES = Object.freeze([
  'detailed',
  'summary',
  'periods',
  'salaries',
  'memory',
  'transitions',
  'indicators'
]);

const FAMILY_TITLES = Object.freeze({
  detailed: 'Relatório detalhado',
  summary: 'Resumo executivo',
  periods: 'Vínculos e períodos',
  salaries: 'Parcelas do PBC e salários',
  memory: 'Memória de cálculo',
  transitions: 'Transições, avisos e premissas',
  indicators: 'Indicadores e proveniência'
});

export const LC142_MANDATORY_WARNING = 'SIMULAÇÃO com premissas declaradas, não concessão ou validação jurídica.';

const IDENTIFICATION_OMITTED = 'Identificação do segurado omitida por opção do operador. '
  + 'Este relatório descreve apenas o cenário declarado, sem nome, CPF, NIT ou documento de pessoa real.';

// Catálogo de códigos de bloqueio declarado no contrato do perfil (§8). É
// documentação do contrato, não estado deste cálculo: a família `transitions`
// só é gerada para resultado `experimental`.
const BLOCKING_CODES = Object.freeze([
  'lc142_kind', 'lc142_review', 'lc142_disability_periods', 'lc142_regime',
  'lc142_parameters', 'lc142_birth', 'lc142_reference', 'lc142_method',
  'workspace_options_unsupported', 'lc142_snapshot', 'lc142_snapshot_date',
  'lc142_source', 'lc142_ctc', 'lc142_salary_column', 'lc142_link_start',
  'lc142_open_end', 'lc142_link_dates', 'lc142_manual_link_review',
  'lc142_period_before_birth', 'lc142_no_periods', 'lc142_limits',
  'lc142_unreviewed_salaries', 'lc142_missing_salary', 'lc142_projection',
  'contribution_review_unapplied'
]);

// ---------------------------------------------------------------------------
// Formatação (somente string; nunca aritmética financeira)
// ---------------------------------------------------------------------------

function isDecimalString(value) {
  return typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim());
}

/** '2550.00' -> '2.550,00'. Opera por manipulação de string, sem Number. */
export function formatBrDecimal(raw, { fixedDecimals = null } = {}) {
  if (raw == null) return '—';
  const text = String(raw).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return text;
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  let [integerPart, fractionPart = ''] = unsigned.split('.');
  if (fixedDecimals != null) {
    if (fractionPart.length < fixedDecimals) {
      fractionPart = fractionPart.padEnd(fixedDecimals, '0');
    } else if (fractionPart.length > fixedDecimals) {
      fractionPart = fractionPart.slice(0, fixedDecimals);
    }
  }
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped}${fractionPart ? `,${fractionPart}` : ''}`;
}

export function formatBrMoney(raw) {
  if (!isDecimalString(raw)) return raw == null ? '—' : String(raw);
  return `R$ ${formatBrDecimal(raw, { fixedDecimals: 2 })}`;
}

/**
 * RMI declarada. O motor devolve `null` quando tempo exigido ou carência não
 * foram atingidos; nesse caso o relatório diz "Não apurada" e explica — nunca
 * apresenta R$ 0,00 nem reaproveita a média como se fosse RMI.
 */
export function formatRmi(raw) {
  if (raw == null || raw === '') return 'Não apurada';
  return formatBrMoney(raw);
}

function rmiExplanation(ctx) {
  if (ctx.resumo.rmi != null && ctx.resumo.rmi !== '') return null;
  const motivos = [];
  if (ctx.pcd.tempo_atingido_no_cenario === false) motivos.push('tempo de contribuição exigido não atingido no cenário');
  const carencia = Number(ctx.resumo.carencia_meses ?? ctx.tempo.carencia_meses ?? 0);
  if (carencia < 180) motivos.push(`carência declarada de ${formatBrCount(carencia)} competências, inferior a 180`);
  const detalhe = motivos.length ? motivos.join('; ') : 'requisito de elegibilidade não satisfeito no cenário';
  return `RMI não apurada porque ${detalhe}. A média/salário de benefício (${formatBrMoney(ctx.resumo.salario_beneficio ?? ctx.correcao.media)}) `
    + 'é apresentada apenas como aritmética do PBC e não é RMI — o motor devolve null nesse caso.';
}

function formatBrCount(value) {
  if (value == null) return '—';
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function orDash(value) {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'sim' : 'não';
  return String(value);
}

function formatIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  if (!match) return orDash(value);
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function formatCompetence(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value ?? ''));
  if (!match) return orDash(value);
  return `${match[2]}/${match[1]}`;
}

function shortHash(hash) {
  const text = String(hash ?? '');
  if (!/^[0-9a-fA-F]{16,}$/.test(text)) return text || '—';
  return `${text.slice(0, 12)}…${text.slice(-8)}`;
}

function sha256Hex(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

const ORIGIN_LABELS = Object.freeze({
  imported: 'Extraído',
  declared_missing_minimum: 'Hipótese (piso)',
  declared_projection: 'Projeção (teto)'
});

function originLabel(origin) {
  return ORIGIN_LABELS[origin] || orDash(origin);
}

function compactIsoStamp(date) {
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`
    + `-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
}

function resolveGeneratedAt(geradoEm) {
  if (geradoEm instanceof Date) {
    if (Number.isNaN(geradoEm.getTime())) throw new Error('Data de geração inválida para o relatório LC 142.');
    return geradoEm;
  }
  if (typeof geradoEm === 'string' && geradoEm.trim()) {
    const parsed = new Date(geradoEm);
    if (Number.isNaN(parsed.getTime())) throw new Error('Data de geração inválida para o relatório LC 142.');
    return parsed;
  }
  if (geradoEm != null) throw new Error('Data de geração inválida para o relatório LC 142.');
  return new Date();
}

function formatDisplayTimestamp(date) {
  const pad = (number) => String(number).padStart(2, '0');
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} `
    + `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

// ---------------------------------------------------------------------------
// Contrato de entrada
// ---------------------------------------------------------------------------

function assertFamily(familia) {
  if (!LC142_REPORT_FAMILIES.includes(familia)) {
    throw new Error(
      `Família de relatório LC 142 inválida: ${String(familia)}. `
      + `Famílias válidas: ${LC142_REPORT_FAMILIES.join(', ')}.`
    );
  }
}

function assertExperimental(resultado) {
  if (!resultado || typeof resultado !== 'object') {
    throw new Error('Relatório PDF exige o envelope experimental do cálculo LC 142; nenhum resultado foi informado.');
  }
  if (resultado.status === 'blocked') {
    throw new Error('Relatório PDF indisponível: o cálculo está bloqueado. PDF de bloqueio não é relatório de cálculo.');
  }
  if (resultado.status !== 'experimental') {
    throw new Error(
      `Relatório PDF indisponível: o resultado não está no estado experimental (status recebido: ${String(resultado.status)}).`
      + ' PDF de bloqueio não é relatório de cálculo.'
    );
  }
  const native = resultado.data?.native_result;
  if (!native || typeof native !== 'object') {
    throw new Error('Relatório PDF indisponível: o envelope experimental não contém data.native_result.');
  }
  if (!native.resumo || typeof native.resumo !== 'object') {
    throw new Error('Relatório PDF indisponível: native_result sem resumo oficial.');
  }
  if (!native.correcao || !Array.isArray(native.correcao.parcelas)) {
    throw new Error('Relatório PDF indisponível: native_result sem correcao.parcelas.');
  }
  if (!native.tempo || !Array.isArray(native.tempo.vinculos)) {
    throw new Error('Relatório PDF indisponível: native_result sem tempo.vinculos.');
  }
  return native;
}

function buildContext({ familia, resultado, metadados, identificacao, geradoEm }) {
  const native = assertExperimental(resultado);
  const generatedAt = resolveGeneratedAt(geradoEm);
  const meta = metadados && typeof metadados === 'object' ? metadados : {};
  const parcelas = native.correcao.parcelas;
  const firstSource = parcelas.find(parcela => parcela.fonte)?.fonte ?? null;

  const cenarioHash = meta.cenarioHash
    || meta.hashCenario
    || meta.resultadoHash
    || sha256Hex(JSON.stringify({ engine_id: native.engine_id ?? null, data: native }));

  const provenance = {
    engineId: native.engine_id ?? orDash(meta.engineId),
    cenarioId: meta.cenarioId ?? meta.cenario ?? '—',
    cenarioRotulo: meta.cenarioRotulo ?? meta.rotulo ?? null,
    cenarioHash,
    snapshotSha256: meta.snapshotSha256 ?? native.pcd?.snapshot_sha256 ?? null,
    sourceUrl: meta.sourceUrl ?? firstSource ?? null,
    through: meta.through ?? native.parametros?.referencia_correcao ?? null,
    retrievedAt: meta.retrievedAt ?? null,
    generatedAt,
    geradoEmTexto: formatDisplayTimestamp(generatedAt),
    familia
  };

  const identification = normalizeIdentification(identificacao);

  return {
    familia,
    familyTitle: FAMILY_TITLES[familia],
    native,
    resumo: native.resumo,
    parametros: native.parametros || {},
    correcao: native.correcao,
    parcelas,
    descartadas: Array.isArray(native.correcao.parcelas_descartadas) ? native.correcao.parcelas_descartadas : [],
    tempo: native.tempo,
    vinculos: native.tempo.vinculos,
    pcd: native.pcd || {},
    memoria: Array.isArray(native.memoria) ? native.memoria : [],
    avisos: Array.isArray(native.avisos) ? native.avisos : [],
    warnings: Array.isArray(resultado.warnings) ? resultado.warnings : [],
    ruleReviewStatus: resultado.rule_review_status ?? 'declared_scenario_assumptions',
    legalValidationPerformed: resultado.legal_validation_performed === true,
    provenance,
    identification,
    meta
  };
}

function normalizeIdentification(identificacao) {
  if (identificacao == null) return { habilitada: false, campos: [] };
  if (typeof identificacao !== 'object') {
    throw new Error('Identificação inválida: informe null ou um objeto com { habilitada, nome, cpf, ... }.');
  }
  if (identificacao.habilitada !== true) return { habilitada: false, campos: [] };
  const labels = {
    nome: 'Nome',
    cpf: 'CPF',
    nit: 'NIT',
    dataNascimento: 'Data de nascimento',
    nomeMae: 'Nome da mãe',
    documento: 'Documento',
    observacao: 'Observação'
  };
  const campos = [];
  for (const [key, label] of Object.entries(labels)) {
    const value = identificacao[key];
    if (value == null || value === '') continue;
    campos.push([label, key === 'dataNascimento' ? formatIsoDate(value) : String(value)]);
  }
  if (!campos.length) {
    throw new Error('Identificação habilitada sem nenhum campo preenchido (nome, cpf, nit, dataNascimento).');
  }
  return { habilitada: true, campos };
}

// ---------------------------------------------------------------------------
// Blocos compartilhados
// ---------------------------------------------------------------------------

function mandatoryWarnings(flow) {
  flow.note(LC142_MANDATORY_WARNING, { tone: 'danger', title: 'Aviso obrigatório' });
  flow.note(
    'actual_entitlement_verified: false — o direito ao benefício não foi verificado. '
    + 'O resultado é aritmética declarada sobre dados sintéticos ou fornecidos pelo operador, '
    + 'sujeita a conferência humana antes de qualquer uso.',
    { tone: 'neutral', title: 'Estado de validação' }
  );
}

/**
 * Bloco de identidade do resultado, presente em todas as famílias. Garante que
 * qualquer relatório carregue o valor declarado (RMI/média) já formatado, sem
 * depender de a família ser financeira.
 */
function resultStamp(flow, ctx) {
  const total = ctx.tempo.total || {};
  const carencia = Number(ctx.resumo.carencia_meses ?? ctx.tempo.carencia_meses ?? 0);
  const elegivel = ctx.pcd.tempo_atingido_no_cenario !== false && carencia >= 180;
  flow.table({
    columns: [
      { label: elegivel ? 'RMI declarada' : 'RMI (não apurada)', width: 118, align: 'right' },
      { label: 'Média / salário de benefício', width: 128, align: 'right' },
      { label: 'Soma considerada', width: 108, align: 'right' },
      { label: 'Tempo 30/360', width: 82, align: 'right' },
      { label: 'Grau', width: 63 }
    ],
    rows: [[
      formatRmi(ctx.resumo.rmi),
      formatBrMoney(ctx.resumo.salario_beneficio ?? ctx.correcao.media),
      formatBrMoney(ctx.resumo.soma_salarios),
      formatBrCount(total.days_30_360),
      orDash(ctx.pcd.grau)
    ]],
    fontSize: 7.6,
    after: 4
  });
  const explicacao = rmiExplanation(ctx);
  flow.note(
    explicacao ?? 'Valores declarados pelo motor para este cenário; leitura de apoio, não concessão.',
    { tone: explicacao ? 'aviso' : 'neutral' }
  );
}

function identificationBlock(flow, ctx) {
  if (!ctx.identification.habilitada) {
    flow.note(IDENTIFICATION_OMITTED, { tone: 'neutral', title: 'Identificação do segurado (omitida)' });
    return;
  }
  flow.subheading('Identificação do segurado');
  flow.keyValueBlock(ctx.identification.campos, { labelWidth: 150 });
}

function provenancePairs(ctx) {
  const { provenance, pcd } = ctx;
  const pairs = [
    ['Motor', provenance.engineId],
    ['Cenário', provenance.cenarioId === '—' ? '—' : String(provenance.cenarioId)],
    ['Hash do cenário (sha256)', provenance.cenarioHash],
    ['Snapshot (sha256)', provenance.snapshotSha256 ?? '—'],
    ['Fonte dos índices', provenance.sourceUrl ?? '—'],
    ['Cobertura do snapshot (through)', provenance.through ?? '—'],
    ['Snapshot recuperado em', displayTimestamp(ctx.meta.retrievedAt) ?? displayTimestamp(provenance.retrievedAt) ?? '—'],
    ['Data de cálculo declarada', formatIsoDate(pcd.calculation_date)],
    ['Relatório gerado em', provenance.geradoEmTexto]
  ];
  return pairs;
}

function provenanceSection(flow, ctx, { full = true } = {}) {
  flow.heading('Proveniência e rastreabilidade');
  flow.keyValueBlock(full ? provenancePairs(ctx) : provenancePairs(ctx).slice(0, 6), { labelWidth: 178 });
  flow.note(
    'Hashes identificam o cenário, o motor e o snapshot usados. '
    + 'São a âncora de auditoria do relatório: qualquer alteração de dado muda o hash.',
    { tone: 'neutral' }
  );
}

function summaryValueRows(ctx) {
  const { resumo, pcd, parametros } = ctx;
  return [
    ['RMI declarada (teto/piso do mês de correção)', formatRmi(resumo.rmi), resumo.rmi == null ? 'não apurada: requisito não atingido' : 'não é concessão nem validação jurídica'],
    ['Média / salário de benefício', formatBrMoney(resumo.salario_beneficio ?? resumo.media), 'média aritmética declarada'],
    ['RMI bruta', formatBrMoney(resumo.rmi_bruta), 'antes de limites'],
    ['Coeficiente declarado', `${formatBrDecimal(resumo.coeficiente)}%`, 'declarado, não calculado por mérito'],
    ['Soma dos salários considerados', formatBrMoney(resumo.soma_salarios), 'considerados na média'],
    ['Quantidade no PBC', formatBrCount(resumo.competencias), 'competências no período base'],
    ['Descartes aplicados', `${formatBrCount(ctx.correcao.descartadas ?? 0)} de ${formatBrCount(resumo.competencias)}`, parametros.descarte_aplicado ? 'regra dos 80% maiores' : 'sem descarte'],
    ['Divisor da média', formatBrCount(parametros.divisor), `PBC=${formatBrCount(ctx.correcao.pbc ?? resumo.competencias)}`],
    ['Teto da competência de correção', formatBrMoney(resumo.teto), 'limite superior declarado'],
    ['Piso da competência de correção', formatBrMoney(resumo.piso), 'limite inferior declarado'],
    ['Carência', `${formatBrCount(resumo.carencia_meses ?? ctx.tempo.carencia_meses)} competências`, 'contagem declarada'],
    ['Grau e tempo exigido', `${orDash(pcd.grau)} · ${formatBrCount(pcd.anos_exigidos)} anos`, pcd.tempo_atingido_no_cenario ? 'tempo atingido no cenário' : 'tempo não atingido no cenário']
  ];
}

function formatDuration(total) {
  const years = total.years ?? 0;
  const months = total.months ?? 0;
  const days = total.days ?? 0;
  const plural = (value, singular, pluralForm) => `${formatBrCount(value)} ${value === 1 ? singular : pluralForm}`;
  return `${plural(years, 'ano', 'anos')}, ${plural(months, 'mês', 'meses')} e ${plural(days, 'dia', 'dias')}`;
}

function displayTimestamp(value) {
  if (value == null || value === '') return null;
  const parsed = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return formatDisplayTimestamp(parsed);
}

function tempoPairs(ctx) {
  const total = ctx.tempo.total || {};
  const semProjecao = ctx.tempo.sem_projecao || {};
  return [
    ['Convenção de contagem', orDash(ctx.tempo.convention)],
    ['Dias 30/360 (total)', formatBrCount(total.days_30_360)],
    ['Duração total', formatDuration(total)],
    ['Dias 30/360 (sem projeção)', formatBrCount(semProjecao.days_30_360)],
    ['Duração sem projeção', formatDuration(semProjecao)],
    ['Carência declarada', `${formatBrCount(ctx.tempo.carencia_meses ?? ctx.resumo.carencia_meses)} competências`]
  ];
}

function noticeCounts(ctx) {
  const filled = ctx.pcd.filled_minimum_count ?? 0;
  const projected = ctx.pcd.projection_count ?? 0;
  return { filled, projected };
}

// ---------------------------------------------------------------------------
// Famílias
// ---------------------------------------------------------------------------

function renderSummary(flow, ctx) {
  flow.start();
  mandatoryWarnings(flow);
  identificationBlock(flow, ctx);
  resultStamp(flow, ctx);

  flow.heading('Síntese do cenário');
  flow.paragraph(
    `Perfil LC 142/2013 de grau constante, grau ${orDash(ctx.pcd.grau)}, `
    + `com referência de correção ${formatCompetence(ctx.parametros.referencia_correcao)} e `
    + `${formatBrCount(ctx.resumo.competencias)} competências no PBC. `
    + `A RMI declarada é ${formatRmi(ctx.resumo.rmi)}. `
    + 'Este resumo não substitui o relatório detalhado nem a conferência humana.'
  );
  flow.table({
    columns: [
      { label: 'Indicador', width: 196 },
      { label: 'Valor', width: 118, align: 'right' },
      { label: 'Leitura', width: 185 }
    ],
    rows: summaryValueRows(ctx)
  });

  flow.heading('Tempo de contribuição');
  flow.keyValueBlock(tempoPairs(ctx).slice(0, 3), { labelWidth: 168 });

  const { filled, projected } = noticeCounts(ctx);
  if (filled || projected) {
    flow.heading('Hipóteses que sustentam o cenário');
    flow.bullets([
      filled ? `${formatBrCount(filled)} competência(s) preenchida(s) por hipótese de piso mínimo declarada.` : null,
      projected ? `${formatBrCount(projected)} competência(s) projetada(s) pelo teto conhecido do snapshot.` : null,
      'Nenhuma dessas competências é salário extraído do CNIS; são hipóteses declaradas.'
    ].filter(Boolean), { style: TYPE.bodySmall });
  }

  flow.heading('Avisos do cálculo');
  flow.bullets(ctx.avisos.slice(0, 5), { style: TYPE.bodySmall });

  provenanceSection(flow, ctx, { full: false });
}

function renderPeriods(flow, ctx) {
  flow.start();
  mandatoryWarnings(flow);
  identificationBlock(flow, ctx);
  resultStamp(flow, ctx);

  flow.heading('Tempo de contribuição apurado');
  flow.keyValueBlock([
    ...tempoPairs(ctx),
    ['Grau declarado', orDash(ctx.pcd.grau)],
    ['Tempo exigido', `${formatBrCount(ctx.pcd.anos_exigidos)} anos`],
    ['Tempo atingido no cenário', ctx.pcd.tempo_atingido_no_cenario ? 'sim' : 'não'],
    ['Carência exigida', '180 competências'],
    ['RMI declarada', formatRmi(ctx.resumo.rmi)]
  ], { labelWidth: 186, columns: 2 });
  flow.note(
    'Convenção declarada 30/360 inclusiva, com união de períodos sobrepostos ou adjacentes. '
    + 'A contagem é aritmética declarada e não substitui a certificação de tempo do INSS.',
    { tone: 'neutral' }
  );

  flow.heading(`Vínculos considerados (${formatBrCount(ctx.vinculos.length)})`);
  flow.table({
    columns: [
      { label: '#', width: 24, align: 'center' },
      { label: 'Início', width: 78 },
      { label: 'Fim', width: 78 },
      { label: 'Dias 30/360', width: 76, align: 'right' },
      { label: 'Situação', width: 90 },
      { label: 'Observação', width: 153 }
    ],
    rows: ctx.vinculos.map((vinculo, index) => [
      String(index + 1),
      formatIsoDate(vinculo.inicio),
      vinculo.fim == null ? 'em aberto' : formatIsoDate(vinculo.fim),
      formatBrCount(vinculo.dias_30_360),
      vinculo.fim == null ? 'Aberto (hipótese)' : 'Encerrado',
      vinculo.fim == null
        ? 'Continuidade por hipótese explícita do operador'
        : 'Período unido ao conjunto'
    ])
  });

  flow.heading('Como a união de períodos foi tratada');
  flow.bullets([
    'Períodos sobrepostos ou adjacentes são unidos antes de somar dias.',
    'O tempo total soma trechos até a data de cálculo declarada.',
    'Vínculo aberto só entra com hipótese explícita de continuidade registrada.',
    'Nenhuma sobreposição é contada duas vezes na carência.'
  ], { style: TYPE.bodySmall });
}

function renderSalaries(flow, ctx) {
  flow.start();
  mandatoryWarnings(flow);
  identificationBlock(flow, ctx);
  resultStamp(flow, ctx);

  flow.heading('Período base de cálculo (PBC)');
  flow.keyValueBlock([
    ['Referência de correção', formatCompetence(ctx.parametros.referencia_correcao)],
    ['Competências no PBC', formatBrCount(ctx.correcao.pbc ?? ctx.resumo.competencias)],
    ['Parcelas consideradas', formatBrCount(ctx.correcao.consideradas ?? '—')],
    ['Parcelas descartadas', formatBrCount(ctx.correcao.descartadas ?? ctx.descartadas.length)],
    ['Descarte aplicado', ctx.parametros.descarte_aplicado ? 'sim' : 'não'],
    ['Divisor da média', formatBrCount(ctx.parametros.divisor)],
    ['Regra do descarte', ctx.parametros.descarte_aplicado ? '80% maiores' : 'sem descarte'],
    ['Soma considerada (oficial)', ctx.correcao.soma_considerada ?? '—'],
    ['Média (oficial)', ctx.correcao.media ?? '—']
  ], { labelWidth: 190, columns: 2 });
  flow.note(
    'A coluna "Considerado" já reflete o limite de teto da competência. '
    + 'O índice é exibido truncado em 6 casas (formato do motor); a multiplicação usa o fator integral.',
    { tone: 'neutral' }
  );

  flow.heading(`Parcelas do PBC (${formatBrCount(ctx.parcelas.length)})`);
  flow.table({
    columns: [
      { label: 'Competência', width: 56 },
      { label: 'Salário', width: 58, align: 'right' },
      { label: 'Teto', width: 52, align: 'right' },
      { label: 'Considerado', width: 60, align: 'right' },
      { label: 'Índice', width: 50, align: 'right' },
      { label: 'Corrigido', width: 64, align: 'right' },
      { label: 'Dias', width: 26, align: 'right' },
      { label: 'Origem', width: 80 },
      { label: 'Situação', width: 53 }
    ],
    rows: ctx.parcelas.map(parcela => [
      formatCompetence(parcela.competencia),
      formatBrDecimal(parcela.salario, { fixedDecimals: 2 }),
      formatBrDecimal(parcela.teto, { fixedDecimals: 2 }),
      formatBrDecimal(parcela.considerado, { fixedDecimals: 2 }),
      formatBrDecimal(parcela.indice, { fixedDecimals: 6 }),
      formatBrDecimal(parcela.corrigido, { fixedDecimals: 2 }),
      formatBrCount(parcela.dias),
      originLabel(parcela.origem),
      parcela.descartada ? 'Descartada' : 'Considerada'
    ]),
    fontSize: 7.2
  });

  flow.heading('Parcelas descartadas');
  if (ctx.descartadas.length) {
    flow.bullets(ctx.descartadas.map(item => `Competência ${formatCompetence(item)} — fora da média por aplicação do descarte declarado.`), { style: TYPE.bodySmall });
  } else {
    flow.paragraph('Nenhuma parcela foi descartada neste cenário.');
  }

  // A legenda é curta por natureza; como nota corrida ela fecha a família na
  // mesma página em vez de empurrar uma tabela de 3 linhas para uma página nova.
  flow.note(
    'imported = salário extraído da base de contribuições declarada; '
    + 'declared_missing_minimum = competência preenchida com o piso, por hipótese declarada; '
    + 'declared_projection = competência projetada pelo teto do snapshot, por hipótese declarada.',
    { tone: 'neutral', title: 'Legenda de origem das parcelas' }
  );
}

function renderMemory(flow, ctx) {
  flow.start();
  mandatoryWarnings(flow);
  identificationBlock(flow, ctx);
  resultStamp(flow, ctx);

  flow.heading('Decisões registradas pelo motor');
  if (ctx.memoria.length) {
    flow.table({
      columns: [
        { label: 'Tipo', width: 70 },
        { label: 'Descrição', width: 311 },
        { label: 'Valor', width: 118, align: 'right' }
      ],
      rows: ctx.memoria.map(item => [orDash(item.tipo), orDash(item.descricao), orDash(item.valor)])
    });
  } else {
    flow.paragraph('O motor não registrou entradas de memória para este cenário.');
  }
  flow.note(
    'A coluna "Valor" reproduz a string literal emitida pelo motor, sem conversão. '
    + 'A mesma quantia aparece em pt-BR no bloco de valores oficiais abaixo.',
    { tone: 'neutral' }
  );

  flow.heading('Seleção das parcelas');
  flow.keyValueBlock([
    ['PBC declarado', formatBrCount(ctx.correcao.pbc ?? ctx.resumo.competencias)],
    ['Parcelas disponíveis', formatBrCount(ctx.parcelas.length)],
    ['Parcelas consideradas', formatBrCount(ctx.correcao.consideradas ?? '—')],
    ['Parcelas descartadas', formatBrCount(ctx.correcao.descartadas ?? ctx.descartadas.length)],
    ['Divisor da média', formatBrCount(ctx.parametros.divisor)],
    ['Divisor mínimo aplicado', ctx.parametros.divisor_minimo_aplicado ? 'sim' : 'não'],
    ['Descarte aplicado', ctx.parametros.descarte_aplicado ? 'sim' : 'não'],
    ['Coeficiente declarado', `${formatBrDecimal(ctx.parametros.coeficiente)}%`]
  ], { labelWidth: 186, columns: 2 });

  flow.heading('Hipóteses declaradas');
  const { filled, projected } = noticeCounts(ctx);
  flow.keyValueBlock([
    ['Data de cálculo declarada', formatIsoDate(ctx.pcd.calculation_date)],
    ['Premissas confirmadas', ctx.pcd.assumptions_confirmed ? 'sim' : 'não'],
    ['Evidência de incapacidade', orDash(ctx.pcd.disability_evidence)],
    ['Evidência de revisão', orDash(ctx.pcd.review_evidence)],
    ['Competências por piso declarado', formatBrCount(filled)],
    ['Competências projetadas', formatBrCount(projected)],
    ['Grau declarado', orDash(ctx.pcd.grau)],
    ['Tempo atingido no cenário', ctx.pcd.tempo_atingido_no_cenario ? 'sim' : 'não']
  ], { labelWidth: 186, columns: 2 });

  flow.heading('Valores oficiais do motor (strings originais)');
  flow.table({
    columns: [
      { label: 'Campo', width: 230 },
      { label: 'String oficial', width: 150, align: 'right' },
      { label: 'Apresentação pt-BR', width: 119, align: 'right' }
    ],
    rows: [
      ['correcao.media', ctx.correcao.media ?? '—', formatBrDecimal(ctx.correcao.media, { fixedDecimals: 2 })],
      ['correcao.soma_considerada', ctx.correcao.soma_considerada ?? '—', formatBrDecimal(ctx.correcao.soma_considerada, { fixedDecimals: 2 })],
      ['resumo.salario_beneficio', ctx.resumo.salario_beneficio ?? '—', formatBrDecimal(ctx.resumo.salario_beneficio, { fixedDecimals: 2 })],
      ['resumo.rmi', ctx.resumo.rmi ?? '—', formatBrDecimal(ctx.resumo.rmi, { fixedDecimals: 2 })],
      ['resumo.rmi_bruta', ctx.resumo.rmi_bruta ?? '—', formatBrDecimal(ctx.resumo.rmi_bruta, { fixedDecimals: 2 })]
    ],
    fontSize: 7.4
  });
  flow.note(
    'As strings oficiais são a saída literal do motor e a autoridade do cálculo; '
    + 'a coluna pt-BR é apenas apresentação. O renderer não refaz nenhuma operação.',
    { tone: 'neutral' }
  );

  provenanceSection(flow, ctx);
}

function renderTransitions(flow, ctx) {
  flow.start();
  mandatoryWarnings(flow);
  identificationBlock(flow, ctx);
  resultStamp(flow, ctx);

  flow.heading('Perfil declarado');
  flow.keyValueBlock([
    ['Perfil', 'LC 142/2013 — grau constante'],
    ['Grau', orDash(ctx.pcd.grau)],
    ['Tempo exigido', `${formatBrCount(ctx.pcd.anos_exigidos)} anos`],
    ['Carência exigida', '180 competências'],
    ['Convenção de tempo', orDash(ctx.tempo.convention)],
    ['Data de cálculo declarada', formatIsoDate(ctx.pcd.calculation_date)],
    ['Referência de correção', formatCompetence(ctx.parametros.referencia_correcao)],
    ['Coeficiente declarado', `${formatBrDecimal(ctx.parametros.coeficiente)}%`]
  ], { labelWidth: 190 });

  flow.heading('Avisos do cálculo');
  if (ctx.avisos.length) {
    flow.bullets(ctx.avisos, { style: TYPE.bodySmall });
  } else {
    flow.paragraph('O motor não emitiu avisos para este cenário.');
  }

  if (ctx.warnings.length) {
    flow.heading('Avisos gerais');
    flow.bullets(ctx.warnings, { style: TYPE.bodySmall });
  }

  flow.heading('Limitações deste perfil');
  flow.bullets([
    'Somente grau constante em todos os períodos; conversões por graus mistos não são suportadas.',
    'Atividade especial, CTC automática e fator previdenciário não são aplicados.',
    'Percentual e coeficiente são declarados, não apurados por mérito.',
    'Projeção de competências futuras usa o teto do snapshot conhecido, não valor oficial futuro.',
    'Preenchimento de lacuna usa o piso da competência, por hipótese explícita.',
    'O resultado está no estado experimental e exige conferência humana.'
  ], { style: TYPE.bodySmall });

  flow.heading('Códigos de bloqueio do perfil');
  flow.paragraph(
    'Quando uma premissa falta, o motor devolve envelope bloqueado e nenhum valor financeiro. '
    + 'Nesse caso não existe relatório de cálculo — este documento só é gerado para resultado experimental. '
    + 'Códigos previstos no contrato do perfil:'
  );
  flow.paragraph(BLOCKING_CODES.join(', '), { style: TYPE.bodySmall });

  flow.heading('O que este relatório não afirma');
  flow.bullets([
    'Não afirma concessão, reconhecimento de tempo, carência ou direito ao benefício.',
    'Não afirma ciência, prazo, ato processual ou eficácia jurídica.',
    'Não substitui laudo pericial, perícia médica ou conferência do INSS.',
    'Não valida a estratégia processual nem a tese previdenciária.'
  ], { style: TYPE.bodySmall });

  provenanceSection(flow, ctx);
}

function renderIndicators(flow, ctx) {
  flow.start();
  mandatoryWarnings(flow);
  identificationBlock(flow, ctx);
  resultStamp(flow, ctx);

  flow.heading('Índices usados e limites');
  flow.keyValueBlock([
    ['Snapshot (sha256)', ctx.provenance.snapshotSha256 ?? '—'],
    ['Fonte (source_url)', ctx.provenance.sourceUrl ?? '—'],
    ['Cobertura (through)', ctx.provenance.through ?? '—'],
    ['Recuperado em (retrieved_at)', orDash(ctx.meta.retrievedAt)],
    ['Referência de correção', formatCompetence(ctx.parametros.referencia_correcao)],
    ['Correção ativa', ctx.parametros.correcao_ativa ? 'sim' : 'não']
  ], { labelWidth: 190 });

  flow.heading('Índices aplicados por competência');
  flow.table({
    columns: [
      { label: 'Competência', width: 62 },
      { label: 'Índice', width: 64, align: 'right' },
      { label: 'Teto', width: 62, align: 'right' },
      { label: 'Origem', width: 84 },
      { label: 'Fonte', width: 227 }
    ],
    rows: ctx.parcelas.map(parcela => [
      formatCompetence(parcela.competencia),
      formatBrDecimal(parcela.indice, { fixedDecimals: 6 }),
      formatBrDecimal(parcela.teto, { fixedDecimals: 2 }),
      originLabel(parcela.origem),
      parcela.fonte ? String(parcela.fonte) : '—'
    ]),
    fontSize: 7.2
  });

  flow.heading('Limites da competência de correção');
  flow.keyValueBlock([
    ['Piso', formatBrMoney(ctx.resumo.piso)],
    ['Teto', formatBrMoney(ctx.resumo.teto)],
    ['Média final (após piso/teto)', formatRmi(ctx.resumo.rmi)],
    ['Divisor mínimo aplicado', ctx.parametros.divisor_minimo_aplicado ? 'sim' : 'não']
  ], { labelWidth: 190 });

  flow.heading('Identificadores de auditoria');
  flow.keyValueBlock([
    ['Motor (engine_id)', ctx.provenance.engineId],
    ['Cenário', ctx.provenance.cenarioId === '—' ? '—' : String(ctx.provenance.cenarioId)],
    ['Hash do cenário (sha256)', ctx.provenance.cenarioHash],
    ['Status do resultado', 'experimental'],
    ['Revisão de regra', orDash(ctx.ruleReviewStatus)],
    ['Validação jurídica realizada', ctx.legalValidationPerformed ? 'sim' : 'não'],
    ['actual_entitlement_verified', 'false'],
    ['Relatório gerado em', ctx.provenance.geradoEmTexto]
  ], { labelWidth: 190 });

  const fonteUnica = [...new Set(ctx.parcelas.map(parcela => parcela.fonte).filter(Boolean))];
  if (fonteUnica.length) {
    flow.heading('Fontes declaradas');
    flow.bullets(fonteUnica, { style: TYPE.bodySmall });
  }

  flow.note(
    'Este bloco é a proveniência do relatório: snapshot, fonte, cobertura (through), '
    + 'recuperação (retrieved_at), hash do cenário e motor. Sem esses campos o cálculo não é auditável.',
    { tone: 'neutral' }
  );
}

function renderDetailed(flow, ctx) {
  flow.start();
  mandatoryWarnings(flow);
  identificationBlock(flow, ctx);
  resultStamp(flow, ctx);

  flow.heading('1. Síntese do cenário');
  flow.paragraph(
    `Perfil LC 142/2013 de grau constante, grau ${orDash(ctx.pcd.grau)}, `
    + `referência de correção ${formatCompetence(ctx.parametros.referencia_correcao)}, `
    + `${formatBrCount(ctx.resumo.competencias)} competências no PBC e `
    + `${formatBrCount(ctx.vinculos.length)} vínculo(s) considerado(s). `
    + `RMI declarada: ${formatRmi(ctx.resumo.rmi)}.`
  );
  flow.table({
    columns: [
      { label: 'Indicador', width: 196 },
      { label: 'Valor', width: 118, align: 'right' },
      { label: 'Leitura', width: 185 }
    ],
    rows: summaryValueRows(ctx)
  });

  flow.heading('2. Tempo de contribuição e vínculos');
  flow.keyValueBlock(tempoPairs(ctx), { labelWidth: 190 });
  flow.table({
    columns: [
      { label: '#', width: 24, align: 'center' },
      { label: 'Início', width: 78 },
      { label: 'Fim', width: 78 },
      { label: 'Dias 30/360', width: 76, align: 'right' },
      { label: 'Situação', width: 90 },
      { label: 'Observação', width: 153 }
    ],
    rows: ctx.vinculos.map((vinculo, index) => [
      String(index + 1),
      formatIsoDate(vinculo.inicio),
      vinculo.fim == null ? 'em aberto' : formatIsoDate(vinculo.fim),
      formatBrCount(vinculo.dias_30_360),
      vinculo.fim == null ? 'Aberto (hipótese)' : 'Encerrado',
      vinculo.fim == null ? 'Continuidade por hipótese explícita' : 'Período unido ao conjunto'
    ])
  });

  flow.heading('3. Parcelas do PBC');
  flow.keyValueBlock([
    ['PBC declarado', formatBrCount(ctx.correcao.pbc ?? ctx.resumo.competencias)],
    ['Consideradas', formatBrCount(ctx.correcao.consideradas ?? '—')],
    ['Descartadas', formatBrCount(ctx.correcao.descartadas ?? ctx.descartadas.length)],
    ['Divisor da média', formatBrCount(ctx.parametros.divisor)],
    ['Soma considerada (oficial)', ctx.correcao.soma_considerada ?? '—'],
    ['Média (oficial)', ctx.correcao.media ?? '—']
  ], { labelWidth: 190 });
  flow.table({
    columns: [
      { label: 'Competência', width: 56 },
      { label: 'Salário', width: 58, align: 'right' },
      { label: 'Teto', width: 52, align: 'right' },
      { label: 'Considerado', width: 60, align: 'right' },
      { label: 'Índice', width: 50, align: 'right' },
      { label: 'Corrigido', width: 64, align: 'right' },
      { label: 'Dias', width: 26, align: 'right' },
      { label: 'Origem', width: 80 },
      { label: 'Situação', width: 53 }
    ],
    rows: ctx.parcelas.map(parcela => [
      formatCompetence(parcela.competencia),
      formatBrDecimal(parcela.salario, { fixedDecimals: 2 }),
      formatBrDecimal(parcela.teto, { fixedDecimals: 2 }),
      formatBrDecimal(parcela.considerado, { fixedDecimals: 2 }),
      formatBrDecimal(parcela.indice, { fixedDecimals: 6 }),
      formatBrDecimal(parcela.corrigido, { fixedDecimals: 2 }),
      formatBrCount(parcela.dias),
      originLabel(parcela.origem),
      parcela.descartada ? 'Descartada' : 'Considerada'
    ]),
    fontSize: 7.2
  });
  if (ctx.descartadas.length) {
    flow.paragraph(
      `Competências descartadas: ${ctx.descartadas.map(formatCompetence).join(', ')}. `
      + 'O descarte segue a regra declarada dos 80% maiores salários corrigidos.'
    );
  }

  flow.heading('4. Memória das decisões');
  if (ctx.memoria.length) {
    flow.table({
      columns: [
        { label: 'Tipo', width: 70 },
        { label: 'Descrição', width: 311 },
        { label: 'Valor', width: 118, align: 'right' }
      ],
      rows: ctx.memoria.map(item => [orDash(item.tipo), orDash(item.descricao), orDash(item.valor)])
    });
  }
  flow.keyValueBlock([
    ['Data de cálculo declarada', formatIsoDate(ctx.pcd.calculation_date)],
    ['Premissas confirmadas', ctx.pcd.assumptions_confirmed ? 'sim' : 'não'],
    ['Evidência de incapacidade', orDash(ctx.pcd.disability_evidence)],
    ['Evidência de revisão', orDash(ctx.pcd.review_evidence)],
    ['Competências por piso declarado', formatBrCount(ctx.pcd.filled_minimum_count ?? 0)],
    ['Competências projetadas', formatBrCount(ctx.pcd.projection_count ?? 0)],
    ['Descarte aplicado', ctx.parametros.descarte_aplicado ? 'sim' : 'não'],
    ['Coeficiente declarado', `${formatBrDecimal(ctx.parametros.coeficiente)}%`]
  ], { labelWidth: 190 });

  flow.heading('5. Avisos e limitações');
  flow.bullets(ctx.avisos, { style: TYPE.bodySmall });
  // Limitações estruturais do perfil. As que o motor já emitiu em `avisos`
  // (ex.: convenção 30/360) não são repetidas aqui: relatório não duplica aviso.
  const avisosTexto = ctx.avisos.join(' ').toLowerCase();
  const limitacoes = [
    ['conversões por graus mistos', 'Somente grau constante; conversões por graus mistos, atividade especial, CTC e fator previdenciário não são suportados.'],
    ['percentual', 'Percentual e coeficiente são declarados; o resultado não valida direito adquirido.'],
    ['projeç', 'Projeções usam teto do snapshot conhecido; lacunas usam piso por hipótese explícita.'],
    ['30/360', 'Contagem de tempo segue convenção 30/360 inclusiva com união de sobreposições.']
  ]
    .filter(([chave]) => !avisosTexto.includes(chave))
    .map(([, texto]) => texto);
  if (limitacoes.length) flow.bullets(limitacoes, { style: TYPE.bodySmall });

  flow.heading('6. Indicadores e proveniência');
  flow.table({
    columns: [
      { label: 'Competência', width: 62 },
      { label: 'Índice', width: 64, align: 'right' },
      { label: 'Teto', width: 62, align: 'right' },
      { label: 'Origem', width: 84 },
      { label: 'Fonte', width: 227 }
    ],
    rows: ctx.parcelas.map(parcela => [
      formatCompetence(parcela.competencia),
      formatBrDecimal(parcela.indice, { fixedDecimals: 6 }),
      formatBrDecimal(parcela.teto, { fixedDecimals: 2 }),
      originLabel(parcela.origem),
      parcela.fonte ? String(parcela.fonte) : '—'
    ]),
    fontSize: 7.2
  });
  provenanceSection(flow, ctx);
}

const RENDERERS = Object.freeze({
  detailed: renderDetailed,
  summary: renderSummary,
  periods: renderPeriods,
  salaries: renderSalaries,
  memory: renderMemory,
  transitions: renderTransitions,
  indicators: renderIndicators
});

// ---------------------------------------------------------------------------
// Entrada pública
// ---------------------------------------------------------------------------

/**
 * Gera o PDF de uma família do relatório LC 142.
 *
 * @param {object} params
 * @param {string} params.familia uma de LC142_REPORT_FAMILIES
 * @param {object} params.resultado envelope experimental completo
 * @param {object} [params.metadados] proveniência (cenarioId, cenarioHash, snapshotSha256, sourceUrl, through, retrievedAt, ...)
 * @param {object|null} [params.identificacao] { habilitada, nome, cpf, ... } — desligada por padrão
 * @param {Date|string|null} [params.geradoEm]
 * @returns {{ bytes: Buffer, filename: string, contentType: 'application/pdf' }}
 */
export function renderLc142Report({ familia, resultado, metadados = {}, identificacao = null, geradoEm = null } = {}) {
  assertFamily(familia);
  const ctx = buildContext({ familia, resultado, metadados, identificacao, geradoEm });
  const renderer = RENDERERS[familia];

  const header = {
    title: `${ctx.familyTitle} — Perfil LC 142/2013 (grau constante)`,
    family: 'SIMULAÇÃO — PREVIDENCIÁRIO / LC 142',
    rightLines: [
      `Cenário: ${ctx.provenance.cenarioId === '—' ? 'não identificado' : ctx.provenance.cenarioId}`,
      `Motor: ${ctx.provenance.engineId}`,
      `Gerado: ${ctx.provenance.geradoEmTexto}`
    ]
  };
  const footer = {
    left: 'ATRIUM · SIMULAÇÃO com premissas declaradas · actual_entitlement_verified: false',
    right: `cenário ${shortHash(ctx.provenance.cenarioHash)}`
  };

  const writer = new PdfWriter({
    title: `${ctx.familyTitle} — LC 142/2013`,
    author: 'ATRIUM',
    subject: `Simulação previdenciária LC 142 — ${ctx.provenance.cenarioId === '—' ? 'cenário não identificado' : ctx.provenance.cenarioId}`,
    creator: 'ATRIUM Cálculos',
    producer: 'ATRIUM',
    creationDate: ctx.provenance.generatedAt
  });

  const { bytes, pageCount } = paginate(flow => renderer(flow, ctx), { writer, header, footer });

  return {
    bytes,
    filename: `lc142-${familia}-${compactIsoStamp(ctx.provenance.generatedAt)}.pdf`,
    contentType: 'application/pdf',
    pageCount
  };
}

export { LAYOUT, SPACING };
