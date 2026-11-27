// Gerador de Memoriais de Cálculo em PDF com Identidade Visual ATRIUM.
//
// Cobre todas as ferramentas da Central Cível e Financeira, Trabalhista e
// Previdenciário sobre os resultados já apurados pelos motores oficiais (sem
// aritmética em ponto flutuante: apenas manipulação de strings e BigInt/texto).

import { createHash } from 'node:crypto';
import { plural } from '../../plural.mjs';
import { paginate, PdfWriter } from './pdf-writer.mjs';

export class CalcPdfError extends Error {
  constructor(message, { statusCode = 400 } = {}) {
    super(message);
    this.name = 'CalcPdfError';
    this.statusCode = statusCode;
  }
}

const MONTHS_PT = Object.freeze([
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
]);

const SPECIES_LABELS = Object.freeze({
  debito: 'Débito',
  amortizacao: 'Amort.',
  custas: 'Custas',
  despesa: 'Despesa',
  desconto: 'Desconto'
});

const DESLIGAMENTO_LABELS = Object.freeze({
  sem_justa_causa: 'Dispensa sem justa causa',
  pedido_demissao: 'Pedido de demissão',
  acordo_484a: 'Acordo (art. 484-A CLT)',
  justa_causa: 'Justa causa',
  termino_contrato: 'Término de contrato'
});

const MANDATORY_DISCLAIMER = 'Memorial técnico de apoio à conferência humana (ATRIUM). Não substitui revisão jurídica nem produz ciência ou prazo processual.';
const MAX_DETAIL_ROWS = 480;

function isDecimalString(value) {
  return typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim());
}

export function formatBrDecimal(raw, { fixedDecimals = null } = {}) {
  if (raw == null || raw === '') return '—';
  const text = String(raw).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return text;
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  let [intPart, fracPart = ''] = unsigned.split('.');
  if (fixedDecimals != null) {
    if (fracPart.length < fixedDecimals) fracPart = fracPart.padEnd(fixedDecimals, '0');
    else if (fracPart.length > fixedDecimals) fracPart = fracPart.slice(0, fixedDecimals);
  }
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped}${fracPart ? `,${fracPart}` : ''}`;
}

export function formatBrMoney(raw) {
  if (raw == null || raw === '') return '—';
  const str = String(raw).trim();
  if (isDecimalString(str)) return `R$ ${formatBrDecimal(str, { fixedDecimals: 2 })}`;
  return str;
}

export function formatBrPct(raw, decimals = 4) {
  if (raw == null || raw === '') return '—';
  return `${formatBrDecimal(raw, { fixedDecimals: decimals })}%`;
}

export function formatIsoDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim());
  if (!m) return value ? String(value) : '—';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function formatBrLongDate(date) {
  const day = date.getUTCDate();
  const month = MONTHS_PT[date.getUTCMonth()] || '';
  const year = date.getUTCFullYear();
  return `${day} de ${month} de ${year}`;
}

function formatTimestampBr(date) {
  const pad = n => String(n).padStart(2, '0');
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function resolveDate(geradoEm) {
  if (geradoEm instanceof Date && !Number.isNaN(geradoEm.getTime())) return geradoEm;
  if (typeof geradoEm === 'string' && geradoEm.trim()) {
    const parsed = new Date(geradoEm.includes('T') ? geradoEm : `${geradoEm}T12:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function sumMoneyStrings(values) {
  let cents = 0n;
  for (const val of values) {
    const s = String(val ?? '0').trim();
    if (!isDecimalString(s)) continue;
    const neg = s.startsWith('-');
    const u = neg ? s.slice(1) : s;
    const [i, f = ''] = u.split('.');
    const padded = (f + '00').slice(0, 2);
    const cur = BigInt(i) * 100n + BigInt(padded);
    cents += neg ? -cur : cur;
  }
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const intStr = (abs / 100n).toString();
  const fracStr = (abs % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}${intStr}.${fracStr}`;
}

function detectMode(aba, resultado, tempoResultado) {
  if (aba === 'trabalhista') return 'trabalhista';
  if (aba === 'previdenciario') {
    if (tempoResultado && !resultado) return 'prev_tempo';
    return 'prev_rmi';
  }
  if (resultado?.modalidade === 'correcao_monetaria') return 'correcao';
  if (resultado?.modalidade === 'amortizacao_price_sac') return 'amortizacao';
  if (resultado?.modalidade === 'financiamento_sfh') return 'sfh';
  if (resultado?.modalidade === 'juros_tvm') return 'tvm';
  if (resultado?.modalidade === 'reajuste_aluguel') return 'reajuste';
  if (resultado?.modalidade === 'auditoria_htm') return 'htm';
  return 'civel_judicial';
}

const MODE_LABELS = Object.freeze({
  civel_judicial: { badge: 'PLANILHA JUDICIAL CÍVEL', title: 'Memorial de Atualização Judicial' },
  correcao: { badge: 'CORREÇÃO E DEFLAÇÃO', title: 'Demonstrativo de Correção Monetária' },
  amortizacao: { badge: 'TABELAS PRICE E SAC', title: 'Planilha Analítica de Amortização' },
  sfh: { badge: 'FINANCIAMENTO SFH', title: 'Demonstrativo de Financiamento Imobiliário' },
  tvm: { badge: 'EQUIVALÊNCIA E TVM', title: 'Demonstrativo de Taxas e Valor do Dinheiro no Tempo' },
  reajuste: { badge: 'REAJUSTE CONTRATUAL', title: 'Memorial de Reajuste de Locação e Contratos' },
  htm: { badge: 'AUDITORIA .HTM LEGADA', title: 'Diagnóstico de Planilha Legada .HTM' },
  trabalhista: { badge: 'RESCISÃO TRABALHISTA', title: 'Memorial de Verbas Rescisórias' },
  prev_rmi: { badge: 'PREVIDENCIÁRIO · RMI', title: 'Demonstrativo de Salário de Benefício e RMI' },
  prev_tempo: { badge: 'TEMPO E CARÊNCIA', title: 'Apuração de Tempo de Contribuição e Graça' }
});

function buildOfficeContext(escritorio = {}) {
  const esc = escritorio && typeof escritorio === 'object' ? escritorio : {};
  const officeName = String(esc.officeName || '').trim() || 'ATRIUM · Memorial de Cálculo';
  const lawyerName = String(esc.lawyerName || '').trim();
  const lawyerOab = String(esc.lawyerOab || '').trim();
  const slogan = String(esc.officeSlogan || '').trim();
  const address = String(esc.lawyerAddress || '').trim();
  const city = String(esc.city || '').trim();

  const subParts = [];
  if (lawyerName && lawyerName !== officeName) {
    subParts.push(lawyerOab ? `${lawyerName} (${lawyerOab})` : lawyerName);
  } else if (lawyerOab) {
    subParts.push(lawyerOab);
  }
  if (slogan && slogan !== officeName) subParts.push(slogan);

  return {
    officeName,
    lawyerName,
    lawyerOab,
    address,
    city,
    subline: subParts.join(' · ') || 'Cálculos Judiciais e Financeiros Auditáveis'
  };
}

function hasProcessMeta(processo = {}) {
  if (!processo || typeof processo !== 'object') return false;
  return Boolean(processo.numero || processo.autor || processo.reu || processo.vara || processo.observacoes);
}

function appendProcessBlock(flow, sectionNum, processo = {}, extraPairs = []) {
  const pairs = [];
  if (processo?.numero) pairs.push(['Processo / Autos', String(processo.numero).trim()]);
  if (processo?.vara) pairs.push(['Juízo / Vara', String(processo.vara).trim()]);
  if (processo?.autor) pairs.push(['Exequente / Autor', String(processo.autor).trim()]);
  if (processo?.reu) pairs.push(['Executado / Réu', String(processo.reu).trim()]);
  for (const pair of extraPairs) pairs.push(pair);

  if (!pairs.length) return sectionNum;
  flow.sectionTitle(sectionNum, 'Identificação e Critérios do Cálculo');
  flow.keyValueBlock(pairs, { columns: 2, labelWidth: 112 });
  if (processo?.observacoes && String(processo.observacoes).trim()) {
    flow.calloutBox('Notas / Observações do Processo', String(processo.observacoes).trim(), { tone: 'parchment' });
  }
  flow.space(4);
  return sectionNum + 1;
}

function jurosLabel(juros = {}) {
  const map = {
    sem: 'Sem juros',
    'taxa-legal': 'Taxa Legal (Res. CMN 5.171/2024)',
    'transicao-lei-14905': 'Transição Lei 14.905/2024 (CC/1916 · CC/2002 · Taxa Legal)',
    'percentual-fixo': `Percentual fixo (${formatBrDecimal(juros.percentual || '0')}% a.m.)`,
    'serie-mensal': `Série mensal (${juros.serie || 'SELIC'})`
  };
  const base = map[juros.tipo] || String(juros.tipo || 'Sem juros');
  return juros.capitalizacao === 'composto' ? `${base} · Capitalização composta` : base;
}

function correcaoLabel(correcao = {}) {
  if (!correcao || correcao.tipo === 'sem') return 'Sem correção monetária';
  if (Array.isArray(correcao.timeline) && correcao.timeline.length) {
    return `Linha do tempo (${correcao.timeline.length} ${plural(correcao.timeline.length, 'faixa', 'faixas')})`;
  }
  return String(correcao.serie || 'IPCA');
}

function renderJudicialSection(flow, resultado, { processo, conferencia, office, dateLong }) {
  const r = resultado.resumo || {};
  const itens = Array.isArray(resultado.itens) ? resultado.itens : [];
  const originalSum = sumMoneyStrings(itens.filter(i => i.especie === 'debito').map(i => i.valorOriginal));

  flow.heroBanner({
    eyebrow: 'TOTAL GERAL APURADO',
    total: formatBrMoney(r.total),
    subtitle: `Atualização até ${formatIsoDate(resultado.atualizacaoAte)} · ${itens.length} ${plural(itens.length, 'lançamento', 'lançamentos')}`,
    secondaryLabel: 'PRINCIPAL ORIGINAL',
    secondaryValue: formatBrMoney(originalSum),
    tertiaryText: correcaoLabel(resultado.parametros?.correcao)
  });

  const kpis = [
    { label: 'Débitos atualizados', value: formatBrMoney(r.debitosAtualizados), tone: 'accent' },
    { label: 'Juros moratórios', value: formatBrMoney(r.juros), tone: 'neutral' },
    ...(r.jurosCompensatorios ? [{ label: 'Juros compensatórios', value: formatBrMoney(r.jurosCompensatorios), tone: 'accent' }] : []),
    { label: 'Multa', value: formatBrMoney(r.multa), tone: 'neutral' },
    ...(r.multaContratual ? [{ label: 'Multa contratual', value: formatBrMoney(r.multaContratual), tone: 'accent' }] : []),
    ...(r.multaArt523 ? [{ label: 'Multa art. 523 §1º', value: formatBrMoney(r.multaArt523), tone: 'accent' }] : []),
    ...(r.honorariosArt523 ? [{ label: 'Honorários art. 523 §1º', value: formatBrMoney(r.honorariosArt523), tone: 'accent' }] : []),
    { label: 'Honorários', value: formatBrMoney(r.honorarios), tone: 'neutral' },
    ...(r.custasFinais ? [{ label: 'Custas finais fixas', value: formatBrMoney(r.custasFinais), tone: 'neutral' }] : []),
    { label: 'Abatimentos', value: formatBrMoney(r.abatimentos), tone: 'danger' }
  ];
  flow.kpiGrid(kpis, { columns: 4 });

  let sec = 1;
  const params = [
    ['Atualizar até', formatIsoDate(resultado.atualizacaoAte)],
    ['Correção monetária', correcaoLabel(resultado.parametros?.correcao)],
    ['Regime de juros', jurosLabel(resultado.parametros?.juros)]
  ];
  if (resultado.parametros?.multa) {
    params.push(['Multa aplicada', `${formatBrDecimal(resultado.parametros.multa.percentual, { fixedDecimals: 2 })}% (${resultado.parametros.multa.base})`]);
  }
  if (resultado.parametros?.honorarios) {
    params.push(['Honorários aplicados', `${formatBrDecimal(resultado.parametros.honorarios.percentual, { fixedDecimals: 2 })}% (${resultado.parametros.honorarios.base})`]);
  }
  sec = appendProcessBlock(flow, sec, processo, params);

  flow.sectionTitle(sec++, 'Quadro Consolidado de Lançamentos');
  const itemRows = itens.map(it => [
    SPECIES_LABELS[it.especie] || it.especie,
    it.descricao || it.id || '—',
    formatIsoDate(it.data),
    formatBrDecimal(it.valorOriginal, { fixedDecimals: 2 }),
    formatBrDecimal(it.fatorCorrecao),
    formatBrDecimal(it.valorCorrigido, { fixedDecimals: 2 }),
    formatBrDecimal(it.juros, { fixedDecimals: 2 }),
    formatBrDecimal(it.total, { fixedDecimals: 2 })
  ]);
  const footerItens = [
    'TOTAIS',
    `${itens.length} ${plural(itens.length, 'item', 'itens')}`,
    '',
    formatBrDecimal(originalSum, { fixedDecimals: 2 }),
    '',
    formatBrDecimal(r.debitosAtualizados, { fixedDecimals: 2 }),
    formatBrDecimal(r.juros, { fixedDecimals: 2 }),
    formatBrDecimal(r.total, { fixedDecimals: 2 })
  ];
  flow.table({
    columns: [
      { label: 'Espécie', width: 48 },
      { label: 'Descrição', width: 117 },
      { label: 'Data-base', width: 54 },
      { label: 'Orig. (R$)', width: 54, align: 'right' },
      { label: 'Fator', width: 62, align: 'right' },
      { label: 'Corrig. (R$)', width: 54, align: 'right' },
      { label: 'Juros (R$)', width: 52, align: 'right' },
      { label: 'Total (R$)', width: 58, align: 'right' }
    ],
    rows: itemRows,
    footerRow: footerItens,
    fontSize: 7.2,
    styleVariant: 'atrium'
  });

  const memoria = Array.isArray(resultado.memoria) ? resultado.memoria : [];
  if (memoria.length) {
    flow.sectionTitle(sec++, 'Memória Analítica de Cálculo');
    for (const entry of memoria) {
      if (entry.tipo === 'correcao') {
        flow.subheading(`Correção — ${entry.itemId} · fator ${formatBrDecimal(entry.fator)} (${formatBrMoney(entry.valorAntes)} -> ${formatBrMoney(entry.valorDepois)})`);
        if (Array.isArray(entry.segmentos) && entry.segmentos.length) {
          flow.table({
            columns: [
              { label: 'Série', width: 169 },
              { label: 'Início', width: 100 },
              { label: 'Término', width: 100 },
              { label: 'Fator do Segmento', width: 130, align: 'right' }
            ],
            rows: entry.segmentos.map(s => [s.serie, s.de, s.ate, formatBrDecimal(s.fator)]),
            fontSize: 7.4,
            styleVariant: 'atrium'
          });
        }
      } else if (entry.tipo === 'juros' || entry.tipo === 'juros-compensatorios') {
        const prefixo = entry.tipo === 'juros-compensatorios' ? 'Juros compensatórios' : 'Juros moratórios';
        const cap = entry.capitalizacao === 'composto' ? ' (capitalização composta)' : ' (capitalização simples)';
        flow.subheading(`${prefixo}${cap} — ${entry.itemId} · ${formatBrDecimal(entry.taxaTotal)}% s/ ${formatBrMoney(entry.base)} = ${formatBrMoney(entry.valor)}`);
        const meses = Array.isArray(entry.meses) ? entry.meses : [];
        if (meses.length) {
          const slice = meses.slice(0, MAX_DETAIL_ROWS);
          flow.table({
            columns: [
              { label: 'Competência', width: 64 },
              { label: 'Dias', width: 54, align: 'right' },
              { label: 'Taxa (% a.m.)', width: 78, align: 'right' },
              { label: 'Aplicada (%)', width: 88, align: 'right' },
              { label: 'Regime / Critério', width: 215 }
            ],
            rows: slice.map(m => [
              m.periodo,
              `${m.dias}/${m.diasNoMes}`,
              formatBrDecimal(m.taxa),
              formatBrDecimal(m.taxaAplicada),
              m.regime || entry.criterio || '—'
            ]),
            fontSize: 7.2,
            styleVariant: 'atrium'
          });
          if (meses.length > MAX_DETAIL_ROWS) {
            flow.paragraph(`Nota: exibidas as primeiras ${MAX_DETAIL_ROWS} de ${meses.length} competências mensais deste item; o valor apurado (${formatBrMoney(entry.valor)}) reflete a série completa.`);
          }
        } else {
          flow.paragraph(`Critério: ${entry.criterio}${cap} — período ${formatIsoDate(entry.de)} a ${formatIsoDate(entry.ate)}.`);
        }
      } else if (['multa', 'honorarios', 'multa-contratual', 'multa-art523', 'honorarios-art523'].includes(entry.tipo)) {
        const names = {
          multa: 'Multa',
          honorarios: 'Honorários advocatícios',
          'multa-contratual': 'Multa contratual',
          'multa-art523': 'Multa art. 523 §1º CPC',
          'honorarios-art523': 'Honorários art. 523 §1º CPC'
        };
        flow.bullets([`${names[entry.tipo] || entry.tipo}: ${formatBrDecimal(entry.percentual, { fixedDecimals: 2 })}% sobre ${({ 'debitos-atualizados': 'débitos atualizados', 'debitos-com-juros': 'débitos com juros', 'total-atualizado': 'total atualizado (com custas)' })[entry.base] || `base "${entry.base}"`} = ${formatBrMoney(entry.valor)}`]);
      } else if (entry.tipo === 'custas-finais') {
        flow.bullets([`Custas finais fixas adicionadas: ${formatBrMoney(entry.valor)}`]);
      } else if (entry.tipo === 'abatimento') {
        flow.bullets([`Abatimentos / amortizações imputadas (${(entry.itens || []).join(', ')}): - ${formatBrMoney(entry.valor)}`]);
      }
    }
  }

  if (conferencia && Array.isArray(conferencia.fontes) && conferencia.fontes.length) {
    flow.sectionTitle(sec++, 'Conferência Oficial de Índices (Fábrica de Cálculos · TRF3)');
    const stLabels = { confere: 'Confere', divergente: 'Divergente', 'sem-dado': 'Sem dado', 'sem-fonte': 'Sem fonte', ignorado: 'Ignorado' };
    flow.table({
      columns: [
        { label: 'Série', width: 75 },
        { label: 'Janela', width: 110 },
        { label: 'Fator ATRIUM', width: 88, align: 'right' },
        { label: 'Fator Oficial', width: 88, align: 'right' },
        { label: 'Dif. / Situação', width: 138 }
      ],
      rows: conferencia.fontes.map(f => [
        f.serie || '—',
        `${f.de || '—'} a ${f.ate || '—'}`,
        f.fatorAtrium != null ? String(f.fatorAtrium) : '—',
        f.fatorOficial != null ? String(f.fatorOficial) : '—',
        `${stLabels[f.status] || f.status}${f.diferencaPercentual != null ? ` (${f.diferencaPercentual}%)` : ''}`
      ]),
      fontSize: 7.2,
      styleVariant: 'atrium'
    });
  }

  const fontes = Array.isArray(resultado.fontes) ? resultado.fontes : [];
  if (fontes.length) {
    flow.sectionTitle(sec++, 'Fontes Oficiais dos Índices');
    flow.table({
      columns: [
        { label: 'Série Oficial / Origem', width: 239 },
        { label: 'Competência Inicial', width: 130 },
        { label: 'Competência Final', width: 130 }
      ],
      rows: fontes.map(s => [s.serie, s.de, s.ate]),
      fontSize: 7.4,
      styleVariant: 'atrium'
    });
  }

  flow.calloutBox('Nota Técnica e Responsabilidade', MANDATORY_DISCLAIMER);
  flow.signatureBlock({
    city: office.city,
    dateLong,
    lawyerName: office.lawyerName,
    lawyerOab: office.lawyerOab,
    officeName: office.officeName,
    address: office.address
  });
}

function renderCorrecaoSection(flow, resultado, { processo, office, dateLong }) {
  const r = resultado.resumo || {};
  flow.heroBanner({
    eyebrow: resultado.direcao === 'reversa' ? 'VALOR DESATUALIZADO (REVERSA)' : 'VALOR ATUALIZADO FINAL',
    total: formatBrMoney(r.total),
    subtitle: `${resultado.serie} · ${formatIsoDate(resultado.dataInicial)} a ${formatIsoDate(resultado.dataFinal)} (${resultado.diasCorridos ?? 0} dias corridos)`,
    secondaryLabel: 'FATOR ACUMULADO',
    secondaryValue: formatBrDecimal(r.fatorCorrecao),
    tertiaryText: `Variação ${formatBrPct(r.percentualCorrecao, 4)}`
  });
  flow.kpiGrid([
    { label: 'Valor Original', value: formatBrMoney(r.valorOriginal), tone: 'neutral' },
    { label: 'Valor Corrigido', value: formatBrMoney(r.valorCorrigido), tone: 'accent' },
    { label: 'Juros Aplicados', value: formatBrMoney(r.juros), tone: 'neutral' },
    { label: 'Multa + Honorários', value: formatBrMoney(sumMoneyStrings([r.multa, r.honorarios])), tone: 'neutral' }
  ], { columns: 4 });

  let sec = appendProcessBlock(flow, 1, processo, [
    ['Índice adotado', String(resultado.serie || '—')],
    ['Modalidade', resultado.direcao === 'reversa' ? 'Deflação reversa (1 / fator)' : 'Correção monetária direta'],
    ['Pró-rata exponencial', resultado.proRata ? 'Sim (dias corridos)' : 'Não (competência cheia)'],
    ['Expurgo de deflação', resultado.expurgarDeflacao ? 'Aplicado (piso zero)' : 'Não']
  ]);

  if (Array.isArray(resultado.comparativo) && resultado.comparativo.length) {
    flow.sectionTitle(sec++, 'Quadro Comparativo Entre Índices');
    flow.table({
      columns: [
        { label: 'Índice', width: 95 },
        { label: 'Situação', width: 85 },
        { label: 'Fator', width: 95, align: 'right' },
        { label: 'Variação (%)', width: 94, align: 'right' },
        { label: 'Valor Corrigido', width: 130, align: 'right' }
      ],
      rows: resultado.comparativo.map(c => c.ok
        ? [c.serie, 'Apurado', formatBrDecimal(c.fator), `${formatBrDecimal(c.percentual, { fixedDecimals: 4 })}%`, formatBrMoney(c.valorCorrigido)]
        : [c.serie, 'Indisponível', '—', '—', c.erro || 'Sem dados']
      ),
      fontSize: 7.4,
      styleVariant: 'atrium'
    });
  }

  const passos = Array.isArray(resultado.passos) ? resultado.passos : [];
  if (passos.length) {
    flow.sectionTitle(sec++, 'Evolução Mensal da Série');
    const slice = passos.slice(0, MAX_DETAIL_ROWS);
    flow.table({
      columns: [
        { label: 'Competência', width: 72 },
        { label: 'Dias', width: 58, align: 'right' },
        { label: 'Variação Mês (%)', width: 90, align: 'right' },
        { label: 'Aplicada (%)', width: 90, align: 'right' },
        { label: 'Fator Mês', width: 92, align: 'right' },
        { label: 'Fator Acumulado', width: 97, align: 'right' }
      ],
      rows: slice.map(p => [
        p.periodo,
        `${p.diasCobertos}/${p.diasNoMes}`,
        formatBrDecimal(p.variacaoMensalPct),
        formatBrDecimal(p.variacaoAplicadaPct),
        formatBrDecimal(p.fatorMes),
        formatBrDecimal(p.fatorAcumulado)
      ]),
      fontSize: 7.2,
      styleVariant: 'atrium'
    });
  }

  flow.calloutBox('Nota Técnica', MANDATORY_DISCLAIMER);
  flow.signatureBlock({ city: office.city, dateLong, lawyerName: office.lawyerName, lawyerOab: office.lawyerOab, officeName: office.officeName, address: office.address });
}

function renderAmortizacaoSection(flow, resultado, { processo, office, dateLong }) {
  const r = resultado.resumo || {};
  flow.heroBanner({
    eyebrow: `SISTEMA ${resultado.sistemaAtivo || 'PRICE'} · TOTAL PAGO`,
    total: formatBrMoney(r.total),
    subtitle: `Economia estimada de juros no SAC: ${formatBrMoney(r.economiaJurosSac)} · CET ${formatBrDecimal(r.cetSimplificadoMensalPct, { fixedDecimals: 4 })}% a.m.`,
    secondaryLabel: 'TOTAL DE JUROS',
    secondaryValue: formatBrMoney(r.totalJuros),
    tertiaryText: `1ª Parc. ${formatBrMoney(r.primeiraPrestacao)}`
  });
  flow.kpiGrid([
    { label: 'Valor Financiado', value: formatBrMoney(r.valorFinanciadoBase), tone: 'neutral' },
    { label: '1ª Prestação', value: formatBrMoney(r.primeiraPrestacao), tone: 'accent' },
    { label: 'Última Prestação', value: formatBrMoney(r.ultimaPrestacao), tone: 'neutral' },
    { label: 'Taxa Efetiva a.a.', value: formatBrPct(r.taxaAnualEquivalentePct, 4), tone: 'neutral' }
  ], { columns: 4 });

  let sec = appendProcessBlock(flow, 1, processo, [
    ['Sistema principal', String(resultado.sistemaAtivo || 'PRICE')],
    ['Saldo após carência', formatBrMoney(r.saldoAposCarencia)],
    ['Taxa efetiva mensal', formatBrPct(r.taxaMensalEfetivaPct, 4)],
    ['CET mensal simplificado', formatBrPct(r.cetSimplificadoMensalPct, 4)]
  ]);

  if (resultado.comparativo?.price && resultado.comparativo?.sac) {
    flow.sectionTitle(sec++, 'Comparativo Analítico PRICE × SAC');
    const p = resultado.comparativo.price.resumo;
    const s = resultado.comparativo.sac.resumo;
    flow.table({
      columns: [
        { label: 'Indicador', width: 179 },
        { label: 'Tabela PRICE', width: 106, align: 'right' },
        { label: 'Sistema SAC', width: 106, align: 'right' },
        { label: 'Diferença (SAC)', width: 108, align: 'right' }
      ],
      rows: [
        ['1ª Prestação', formatBrMoney(p.primeiraPrestacao), formatBrMoney(s.primeiraPrestacao), '—'],
        ['Última Prestação', formatBrMoney(p.ultimaPrestacao), formatBrMoney(s.ultimaPrestacao), '—'],
        ['Total de Juros', formatBrMoney(p.totalJuros), formatBrMoney(s.totalJuros), `- ${formatBrMoney(resultado.comparativo.economiaJurosSac)}`],
        ['Total Amortizado', formatBrMoney(p.totalAmortizado), formatBrMoney(s.totalAmortizado), formatBrMoney('0.00')],
        ['Total Geral Pago', formatBrMoney(p.total), formatBrMoney(s.total), '—']
      ],
      fontSize: 7.4,
      styleVariant: 'atrium'
    });
  }

  const crono = Array.isArray(resultado.cronograma) ? resultado.cronograma : [];
  if (crono.length) {
    flow.sectionTitle(sec++, `Cronograma de Amortização (${crono.length} parcelas)`);
    const slice = crono.slice(0, MAX_DETAIL_ROWS);
    flow.table({
      columns: [
        { label: 'Parc.', width: 38, align: 'right' },
        { label: 'Fase', width: 65 },
        { label: 'Saldo Inic.', width: 82, align: 'right' },
        { label: 'Juros', width: 76, align: 'right' },
        { label: 'Amortiz.', width: 76, align: 'right' },
        { label: 'Prestação', width: 80, align: 'right' },
        { label: 'Saldo Final', width: 82, align: 'right' }
      ],
      rows: slice.map(row => [
        String(row.parcela),
        row.fase === 'carencia' ? 'Carência' : 'Amort.',
        formatBrDecimal(row.saldoInicial, { fixedDecimals: 2 }),
        formatBrDecimal(row.juros, { fixedDecimals: 2 }),
        formatBrDecimal(row.amortizacao, { fixedDecimals: 2 }),
        formatBrDecimal(row.prestacao, { fixedDecimals: 2 }),
        formatBrDecimal(row.saldoFinal, { fixedDecimals: 2 })
      ]),
      footerRow: [
        'TOTAIS',
        `${crono.length}m`,
        '',
        formatBrDecimal(r.totalJuros, { fixedDecimals: 2 }),
        formatBrDecimal(r.totalAmortizado, { fixedDecimals: 2 }),
        formatBrDecimal(r.total, { fixedDecimals: 2 }),
        '0,00'
      ],
      fontSize: 7.2,
      styleVariant: 'atrium'
    });
  }

  flow.calloutBox('Nota Técnica', MANDATORY_DISCLAIMER);
  flow.signatureBlock({ city: office.city, dateLong, lawyerName: office.lawyerName, lawyerOab: office.lawyerOab, officeName: office.officeName, address: office.address });
}

function renderSfhSection(flow, resultado, { processo, office, dateLong }) {
  const r = resultado.resumo || {};
  flow.heroBanner({
    eyebrow: `FINANCIAMENTO IMOBILIÁRIO SFH (${resultado.sistemaAtivo || 'SACRE'})`,
    total: formatBrMoney(r.total),
    subtitle: `${resultado.prazoMeses || 0} meses · Imóvel ${formatBrMoney(r.valorImovel)} · LTV ${formatBrDecimal(r.ltvPct, { fixedDecimals: 1 })}%`,
    secondaryLabel: 'TOTAL DE JUROS',
    secondaryValue: formatBrMoney(r.totalJuros),
    tertiaryText: `1ª Prest. ${formatBrMoney(r.primeiraPrestacaoTotal)}`
  });
  flow.kpiGrid([
    { label: 'Valor Financiado', value: formatBrMoney(r.valorFinanciado), tone: 'neutral' },
    { label: '1ª Prestação Total', value: formatBrMoney(r.primeiraPrestacaoTotal), tone: 'accent' },
    { label: 'Maior Prestação', value: formatBrMoney(r.maiorPrestacaoTotal), tone: 'neutral' },
    { label: 'Última Prestação', value: formatBrMoney(r.ultimaPrestacaoTotal), tone: 'neutral' },
    { label: 'Correção TR Acum.', value: formatBrMoney(r.totalCorrecaoTr), tone: 'neutral' },
    { label: 'Total Amortizado', value: formatBrMoney(r.totalAmortizado), tone: 'neutral' },
    { label: 'Seguros (MIP/DFI) + TCA', value: formatBrMoney(r.totalSegurosETaxas), tone: 'neutral' },
    { label: 'Taxa Nominal a.a. / TR', value: `${formatBrDecimal(r.taxaJurosAnualNominalPct, { fixedDecimals: 2 })}% / ${formatBrDecimal(r.trMensalPct, { fixedDecimals: 2 })}%`, tone: 'accent' }
  ], { columns: 4 });

  let sec = appendProcessBlock(flow, 1, processo, [
    ['Sistema adotado', String(resultado.sistemaAtivo || 'SACRE')],
    ['Prazo contratual', `${resultado.prazoMeses || 0} meses`],
    ['Taxa nominal anual', formatBrPct(r.taxaJurosAnualNominalPct, 2)],
    ['TR mensal informada', formatBrPct(r.trMensalPct, 4)]
  ]);

  if (resultado.comparativo?.sacre && resultado.comparativo?.sac && resultado.comparativo?.price) {
    flow.sectionTitle(sec++, 'Comparativo Triplo SFH (SACRE × SAC × PRICE)');
    const c = resultado.comparativo;
    flow.table({
      columns: [
        { label: 'Indicador', width: 169 },
        { label: 'SACRE', width: 110, align: 'right' },
        { label: 'SAC', width: 110, align: 'right' },
        { label: 'PRICE', width: 110, align: 'right' }
      ],
      rows: [
        ['1ª Prestação Total', formatBrMoney(c.sacre.resumo.primeiraPrestacaoTotal), formatBrMoney(c.sac.resumo.primeiraPrestacaoTotal), formatBrMoney(c.price.resumo.primeiraPrestacaoTotal)],
        ['Última Prestação Total', formatBrMoney(c.sacre.resumo.ultimaPrestacaoTotal), formatBrMoney(c.sac.resumo.ultimaPrestacaoTotal), formatBrMoney(c.price.resumo.ultimaPrestacaoTotal)],
        ['Total de Juros', formatBrMoney(c.sacre.resumo.totalJuros), formatBrMoney(c.sac.resumo.totalJuros), formatBrMoney(c.price.resumo.totalJuros)],
        ['Total Pago (com Encargos)', formatBrMoney(c.sacre.resumo.total), formatBrMoney(c.sac.resumo.total), formatBrMoney(c.price.resumo.total)]
      ],
      fontSize: 7.4,
      styleVariant: 'atrium'
    });
  }

  const crono = Array.isArray(resultado.cronograma) ? resultado.cronograma : [];
  if (crono.length) {
    flow.sectionTitle(sec++, `Cronograma Analítico SFH — Valores em R$ (${crono.length} meses)`);
    const slice = crono.slice(0, MAX_DETAIL_ROWS);
    flow.table({
      columns: [
        { label: 'Mês', width: 32, align: 'right' },
        { label: 'Saldo c/ TR', width: 64, align: 'right' },
        { label: 'Amort.', width: 54, align: 'right' },
        { label: 'Juros', width: 54, align: 'right' },
        { label: 'MIP', width: 44, align: 'right' },
        { label: 'DFI', width: 44, align: 'right' },
        { label: 'TCA', width: 43, align: 'right' },
        { label: 'Prestação', width: 74, align: 'right' },
        { label: 'Saldo Final', width: 90, align: 'right' }
      ],
      rows: slice.map(row => [
        String(row.mes),
        formatBrDecimal(row.saldoAtualizadoTr, { fixedDecimals: 2 }),
        formatBrDecimal(row.amortizacao, { fixedDecimals: 2 }),
        formatBrDecimal(row.juros, { fixedDecimals: 2 }),
        formatBrDecimal(row.seguroMip, { fixedDecimals: 2 }),
        formatBrDecimal(row.seguroDfi, { fixedDecimals: 2 }),
        formatBrDecimal(row.taxaAdm, { fixedDecimals: 2 }),
        formatBrDecimal(row.prestacaoTotal, { fixedDecimals: 2 }),
        formatBrDecimal(row.saldoDevedorFinal, { fixedDecimals: 2 })
      ]),
      footerRow: [
        'SUM',
        '',
        formatBrDecimal(r.totalAmortizado, { fixedDecimals: 2 }),
        formatBrDecimal(r.totalJuros, { fixedDecimals: 2 }),
        '',
        '',
        '',
        formatBrDecimal(r.total, { fixedDecimals: 2 }),
        '0,00'
      ],
      fontSize: 6.9,
      styleVariant: 'atrium'
    });
    if (crono.length > MAX_DETAIL_ROWS) {
      flow.paragraph(`Nota: exibidas as primeiras ${MAX_DETAIL_ROWS} de ${crono.length} parcelas; os totais refletem integralmente o contrato.`);
    }
  }

  flow.calloutBox('Nota Técnica SFH', MANDATORY_DISCLAIMER);
  flow.signatureBlock({ city: office.city, dateLong, lawyerName: office.lawyerName, lawyerOab: office.lawyerOab, officeName: office.officeName, address: office.address });
}

function renderTvmSection(flow, resultado, { processo, office, dateLong }) {
  const tvm = resultado.tvm;
  const r = resultado.resumo || {};
  const solvedLabel = tvm ? `TVM · INCÓGNITA ${String(tvm.solvedField || '').toUpperCase()} (${tvm.capitalizacao === 'simples' ? 'SIMPLES' : 'COMPOSTA'})` : 'EQUIVALÊNCIA DE TAXAS';
  const heroVal = tvm
    ? (tvm.solvedField === 'rate'
        ? `${formatBrDecimal(tvm.ratePct, { fixedDecimals: 6 })}%`
        : tvm.solvedField === 'nper'
          ? `${formatBrDecimal(tvm.nper, { fixedDecimals: 2 })} períodos`
          : formatBrMoney(tvm[tvm.solvedField] ?? r.total))
    : `${formatBrDecimal(r.taxaBasePct, { fixedDecimals: 6 })}% (${r.baseTemporal || 'mês'})`;

  flow.heroBanner({
    eyebrow: solvedLabel,
    total: heroVal,
    subtitle: tvm ? `Juros estimados: ${formatBrMoney(tvm.totalJurosEstimado)} · Regime ${tvm.timing === 'antecipado' ? 'Antecipado' : 'Postecipado'}` : 'Conversão exata em 7 bases temporais',
    secondaryLabel: 'TAXA BASE',
    secondaryValue: `${formatBrDecimal(r.taxaBasePct, { fixedDecimals: 6 })}%`,
    tertiaryText: `Base temporal: ${r.baseTemporal || 'mes'}`
  });

  if (tvm) {
    flow.kpiGrid([
      { label: 'Valor Presente (PV)', value: formatBrMoney(tvm.pv), tone: 'neutral' },
      { label: 'Prestação (PMT)', value: formatBrMoney(tvm.pmt), tone: 'neutral' },
      { label: 'Valor Futuro (FV)', value: formatBrMoney(tvm.fv), tone: 'accent' },
      { label: 'Taxa / Prazo', value: `${formatBrDecimal(tvm.ratePct, { fixedDecimals: 4 })}% · ${formatBrDecimal(tvm.nper, { fixedDecimals: 2 })}p`, tone: 'neutral' }
    ], { columns: 4 });
  }

  let sec = appendProcessBlock(flow, 1, processo, []);
  const compEq = resultado.equivalencia?.composto?.equivalents || [];
  const simpEq = resultado.equivalencia?.simples?.equivalents || [];
  if (compEq.length) {
    flow.sectionTitle(sec++, 'Tabela de Equivalência e Conversão de Taxas (7 Bases)');
    flow.table({
      columns: [
        { label: 'Base Temporal', width: 239 },
        { label: 'Capitalização Composta (%)', width: 130, align: 'right' },
        { label: 'Capitalização Simples (%)', width: 130, align: 'right' }
      ],
      rows: compEq.map((e, idx) => [
        e.label,
        formatBrDecimal(e.ratePct, { fixedDecimals: 6 }),
        formatBrDecimal(simpEq[idx]?.ratePct, { fixedDecimals: 6 })
      ]),
      fontSize: 7.4,
      styleVariant: 'atrium'
    });
  }

  flow.calloutBox('Nota Técnica', MANDATORY_DISCLAIMER);
  flow.signatureBlock({ city: office.city, dateLong, lawyerName: office.lawyerName, lawyerOab: office.lawyerOab, officeName: office.officeName, address: office.address });
}

function renderReajusteSection(flow, resultado, { processo, office, dateLong }) {
  const r = resultado.resumo || {};
  flow.heroBanner({
    eyebrow: `ALUGUEL REAJUSTADO (${resultado.serie || 'IGP-M'})`,
    total: formatBrMoney(r.valorAtual),
    subtitle: `${r.totalCiclos ?? 0} ${plural(r.totalCiclos ?? 0, 'ciclo', 'ciclos')} · Acumulado ${formatBrPct(r.percentualAcumuladoTotal, 4)} (fator ${formatBrDecimal(r.fatorAcumuladoTotal)})`,
    secondaryLabel: 'VALOR INICIAL',
    secondaryValue: formatBrMoney(r.valorInicial),
    tertiaryText: resultado.congelarDeflacao ? 'Piso anti-deflação ativo' : 'Sem trava de deflação'
  });
  flow.kpiGrid([
    { label: 'Valor Inicial', value: formatBrMoney(r.valorInicial), tone: 'neutral' },
    { label: 'Valor Reajustado', value: formatBrMoney(r.valorAtual), tone: 'accent' },
    { label: 'Variação Acumulada', value: formatBrPct(r.percentualAcumuladoTotal, 4), tone: 'neutral' },
    { label: 'Periodicidade', value: `${resultado.periodicidadeMeses || 12} meses`, tone: 'neutral' }
  ], { columns: 4 });

  let sec = appendProcessBlock(flow, 1, processo, [
    ['Índice pactuado', String(resultado.serie || '—')],
    ['Competências', `${resultado.competenciaInicio || '—'} a ${resultado.competenciaFim || '—'}`]
  ]);

  const ciclos = Array.isArray(resultado.ciclos) ? resultado.ciclos : [];
  if (ciclos.length) {
    flow.sectionTitle(sec++, 'Ciclos de Reajuste Apurados');
    flow.table({
      columns: [
        { label: 'Ciclo', width: 42, align: 'right' },
        { label: 'Período', width: 95 },
        { label: 'Valor Anterior', width: 88, align: 'right' },
        { label: 'Variação (%)', width: 72, align: 'right' },
        { label: 'Fator', width: 92, align: 'right' },
        { label: 'Novo Valor', width: 110, align: 'right' }
      ],
      rows: ciclos.map(c => [
        String(c.ciclo),
        `${c.deCompetencia} a ${c.ateCompetencia}`,
        formatBrMoney(c.valorAnterior),
        `${formatBrDecimal(c.percentualCiclo, { fixedDecimals: 4 })}%${c.deflacaoCongelada ? ' (piso 0%)' : ''}`,
        formatBrDecimal(c.fatorCiclo),
        formatBrMoney(c.valorReajustado)
      ]),
      fontSize: 7.4,
      styleVariant: 'atrium'
    });
  }

  if (resultado.notificacaoTexto) {
    flow.sectionTitle(sec++, 'Minuta de Notificação Contratual');
    flow.calloutBox('Texto sugerido para envio formal', resultado.notificacaoTexto, { tone: 'parchment' });
  }

  flow.calloutBox('Nota Técnica', MANDATORY_DISCLAIMER);
  flow.signatureBlock({ city: office.city, dateLong, lawyerName: office.lawyerName, lawyerOab: office.lawyerOab, officeName: office.officeName, address: office.address });
}

function renderHtmSection(flow, resultado, { processo, office, dateLong }) {
  const items = Array.isArray(resultado.extractedItems) ? resultado.extractedItems : [];
  flow.heroBanner({
    eyebrow: 'DIAGNÓSTICO DE PLANILHA .HTM LEGADA',
    total: `${items.length} ${plural(items.length, 'parcela', 'parcelas')} ${plural(items.length, 'extraída', 'extraídas')}`,
    subtitle: resultado.pageTitle || 'Documento HTML analisado pelo auditor ATRIUM',
    secondaryLabel: 'LINKS HTTP REPARADOS',
    secondaryValue: String(resultado.detectedHttpLegacyUrls ?? 0),
    tertiaryText: resultado.affectedByPre2023SslBug ? 'Convertidos para HTTPS' : 'Sem links HTTP legados'
  });

  let sec = appendProcessBlock(flow, 1, processo, [
    ['Título da página', resultado.pageTitle || '—'],
    ['Codificação detectada', resultado.detectedCharsetHint || '—']
  ]);

  if (items.length) {
    flow.sectionTitle(sec++, 'Itens Extraídos da Planilha');
    flow.table({
      columns: [
        { label: 'Data-base', width: 75 },
        { label: 'Descrição', width: 294 },
        { label: 'Valor Extraído', width: 130, align: 'right' }
      ],
      rows: items.slice(0, MAX_DETAIL_ROWS).map(it => [formatIsoDate(it.data), it.descricao || 'Parcela extraída', formatBrMoney(it.valor)]),
      fontSize: 7.4,
      styleVariant: 'atrium'
    });
  }

  if (Array.isArray(resultado.avisos) && resultado.avisos.length) {
    flow.calloutBox('Observações da Auditoria', resultado.avisos.join('\n'), { tone: 'parchment' });
  }
  flow.signatureBlock({ city: office.city, dateLong, lawyerName: office.lawyerName, lawyerOab: office.lawyerOab, officeName: office.officeName, address: office.address });
}

function renderTrabalhistaSection(flow, resultado, { processo, office, dateLong }) {
  const r = resultado.resumo || {};
  const p = resultado.parametros || {};
  flow.heroBanner({
    eyebrow: 'LÍQUIDO RESCISÓRIO A PAGAR',
    total: formatBrMoney(r.liquido),
    subtitle: `${DESLIGAMENTO_LABELS[resultado.tipoDesligamento] || resultado.tipoDesligamento} · ${formatIsoDate(resultado.admissao)} a ${formatIsoDate(resultado.desligamento)}`,
    secondaryLabel: 'TOTAL DE PROVENTOS',
    secondaryValue: formatBrMoney(r.proventos),
    tertiaryText: `Descontos: ${formatBrMoney(r.descontos)}`
  });
  flow.kpiGrid([
    { label: 'Proventos Brutos', value: formatBrMoney(r.proventos), tone: 'accent' },
    { label: 'Descontos', value: formatBrMoney(r.descontos), tone: 'danger' },
    { label: 'Aviso Prévio', value: formatBrMoney(r.aviso), tone: 'neutral' },
    { label: 'Multa FGTS', value: formatBrMoney(r.multaFgts), tone: 'accent' }
  ], { columns: 4 });

  let sec = appendProcessBlock(flow, 1, processo, [
    ['Anos completos', String(p.anosCompletos ?? 0)],
    ['Aviso prévio', `${p.aviso || '—'} (${p.avisoDias ?? 0} dias)`],
    ['Projeção do aviso', p.projecaoAte ? formatIsoDate(p.projecaoAte) : 'Sem projeção'],
    ['Avos 13º / Férias', p.avos ? `${p.avos.decimo}/12 e ${p.avos.ferias}/12` : '—']
  ]);

  const verbas = Array.isArray(resultado.verbas) ? resultado.verbas : [];
  if (verbas.length) {
    flow.sectionTitle(sec++, 'Discriminação de Verbas Rescisórias');
    flow.table({
      columns: [
        { label: 'Natureza', width: 66 },
        { label: 'Verba', width: 168 },
        { label: 'Fundamento Legal', width: 175 },
        { label: 'Valor', width: 90, align: 'right' }
      ],
      rows: verbas.map(v => [
        v.natureza === 'desconto' ? 'Desconto (-)' : 'Provento (+)',
        v.descricao,
        v.fundamento || '—',
        formatBrMoney(v.valor)
      ]),
      footerRow: ['LÍQUIDO', `${verbas.length} ${plural(verbas.length, 'verba', 'verbas')}`, 'Proventos menos descontos', formatBrMoney(r.liquido)],
      fontSize: 7.3,
      styleVariant: 'atrium'
    });
  }

  if (Array.isArray(resultado.avisos) && resultado.avisos.length) {
    flow.calloutBox('Ressalvas e Parâmetros Legais', resultado.avisos.join('\n'));
  }
  flow.signatureBlock({ city: office.city, dateLong, lawyerName: office.lawyerName, lawyerOab: office.lawyerOab, officeName: office.officeName, address: office.address });
}

function renderPrevidenciarioSection(flow, resultado, tempoResultado, { processo, office, dateLong }) {
  let sec = 1;
  if (resultado) {
    const r = resultado.resumo || {};
    const p = resultado.parametros || {};
    flow.heroBanner({
      eyebrow: 'RENDA MENSAL INICIAL (RMI) ESTIMADA',
      total: formatBrMoney(r.rmi),
      subtitle: `${resultado.sexo === 'masculino' ? 'Segurado masculino' : 'Segurada feminina'} · ${r.competencias ?? 0} competências (${resultado.primeiraCompetencia} a ${resultado.ultimaCompetencia})`,
      secondaryLabel: 'SALÁRIO DE BENEFÍCIO',
      secondaryValue: formatBrMoney(r.salarioBeneficio),
      tertiaryText: `Coeficiente ${formatBrDecimal(r.coeficiente, { fixedDecimals: 2 })}%`
    });
    flow.kpiGrid([
      { label: 'Competências / Carência', value: String(r.competencias ?? 0), tone: 'neutral' },
      { label: 'Divisor Apurado', value: String(p.divisor ?? 0), tone: 'neutral' },
      { label: 'RMI Bruta', value: formatBrMoney(r.rmiBruta), tone: 'neutral' },
      { label: 'Limite Aplicado', value: r.limiteAplicado || 'Nenhum', tone: 'accent' }
    ], { columns: 4 });

    sec = appendProcessBlock(flow, sec, processo, [
      ['Corrigir pelo INPC', p.correcaoAtiva ? `Sim (ref. ${p.referenciaCorrecao || '—'})` : 'Não'],
      ['Descarte dos 20% menores', p.descarteAplicado ? 'Aplicado' : 'Não aplicado']
    ]);

    if (Array.isArray(resultado.memoria) && resultado.memoria.length) {
      flow.sectionTitle(sec++, 'Memória do Cálculo da RMI');
      flow.table({
        columns: [
          { label: 'Etapa', width: 95 },
          { label: 'Descrição', width: 294 },
          { label: 'Resultado', width: 110, align: 'right' }
        ],
        rows: resultado.memoria.map(m => [m.tipo, m.descricao, isDecimalString(String(m.valor)) ? formatBrMoney(m.valor) : String(m.valor)]),
        fontSize: 7.4,
        styleVariant: 'atrium'
      });
    }

    if (resultado.transicoes && Array.isArray(resultado.transicoes.regras)) {
      flow.sectionTitle(sec++, 'Regras de Transição (EC 103/2019)');
      flow.table({
        columns: [
          { label: 'Regra / Fundamento', width: 235 },
          { label: 'Elegibilidade', width: 78 },
          { label: 'RMI Estimada', width: 96, align: 'right' },
          { label: 'Observação', width: 90 }
        ],
        rows: resultado.transicoes.regras.map(reg => [
          `${reg.nome} (${reg.fundamento})`,
          reg.elegivel ? 'Elegível' : 'Não elegível',
          reg.rmi != null ? formatBrMoney(reg.rmi) : '—',
          reg.observacao || '—'
        ]),
        fontSize: 7.2,
        styleVariant: 'atrium'
      });
    }

    const parcelas = resultado.correcao?.parcelas || [];
    if (parcelas.length) {
      flow.sectionTitle(sec++, `Salários de Contribuição Corrigidos (${parcelas.length} competências)`);
      const descartadas = new Set(resultado.correcao?.parcelasDescartadas || []);
      flow.table({
        columns: [
          { label: 'Competência', width: 65 },
          { label: 'Nominal (R$)', width: 84, align: 'right' },
          { label: 'Teto Época', width: 84, align: 'right' },
          { label: 'Fator INPC', width: 82, align: 'right' },
          { label: 'Corrigido (R$)', width: 94, align: 'right' },
          { label: 'Situação PBC', width: 90 }
        ],
        rows: parcelas.slice(0, MAX_DETAIL_ROWS).map(pc => [
          pc.competencia,
          formatBrDecimal(pc.salario, { fixedDecimals: 2 }),
          formatBrDecimal(pc.teto, { fixedDecimals: 2 }),
          formatBrDecimal(pc.indice),
          formatBrDecimal(pc.corrigido, { fixedDecimals: 2 }),
          descartadas.has(pc.competencia) ? 'Descartada (20%)' : 'Considerada'
        ]),
        fontSize: 7.2,
        styleVariant: 'atrium'
      });
    }
  }

  if (tempoResultado?.tempo) {
    const t = tempoResultado.tempo;
    const q = tempoResultado.qualidade;
    if (!resultado) {
      flow.heroBanner({
        eyebrow: 'TEMPO DE CONTRIBUIÇÃO E QUALIDADE DE SEGURADO',
        total: `${t.total.anos}a ${t.total.meses}m ${t.total.dias}d`,
        subtitle: `Carência estimada: ${t.carenciaMeses} meses · ${t.totalDiasEfetivos} dias efetivos`,
        secondaryLabel: 'QUALIDADE DE SEGURADO',
        secondaryValue: q?.mantemQualidade === true ? 'Mantém' : q?.mantemQualidade === false ? 'Perdeu' : 'Apurada',
        tertiaryText: q?.fimPeriodo ? `Graça até ${formatIsoDate(q.fimPeriodo)}` : ''
      });
      sec = appendProcessBlock(flow, sec, processo, []);
    }
    if (Array.isArray(t.vinculos) && t.vinculos.length) {
      flow.sectionTitle(sec++, 'Vínculos Computados');
      flow.table({
        columns: [
          { label: 'Empresa / Origem', width: 155 },
          { label: 'Início', width: 68 },
          { label: 'Fim', width: 68 },
          { label: 'Fator', width: 48, align: 'right' },
          { label: 'Dias Efetivos', width: 70, align: 'right' },
          { label: 'Observação', width: 90 }
        ],
        rows: t.vinculos.map(v => [
          v.empresa || 'Vínculo informado',
          formatIsoDate(v.inicio),
          formatIsoDate(v.fim),
          String(v.fator || '1.00'),
          String(v.diasEfetivos ?? v.dias ?? 0),
          v.concomitante ? 'Concomitante' : 'Integral'
        ]),
        fontSize: 7.2,
        styleVariant: 'atrium'
      });
    }
  }

  flow.calloutBox('Nota Técnica Previdenciária', MANDATORY_DISCLAIMER);
  flow.signatureBlock({ city: office.city, dateLong, lawyerName: office.lawyerName, lawyerOab: office.lawyerOab, officeName: office.officeName, address: office.address });
}

export function renderCalcReportPdf({
  aba = 'civel',
  resultado = null,
  tempoResultado = null,
  conferencia = null,
  processo = {},
  escritorio = {},
  geradoEm = null
} = {}) {
  const hasRes = resultado && typeof resultado === 'object' && !Array.isArray(resultado);
  const hasTempo = tempoResultado && typeof tempoResultado === 'object' && !Array.isArray(tempoResultado);
  if (!hasRes && !hasTempo) {
    throw new CalcPdfError('Nenhum resultado de cálculo informado para gerar o memorial em PDF.');
  }

  const normalizedAba = ['civel', 'trabalhista', 'previdenciario'].includes(aba) ? aba : 'civel';
  const mode = detectMode(normalizedAba, hasRes ? resultado : null, hasTempo ? tempoResultado : null);
  const modeMeta = MODE_LABELS[mode] || MODE_LABELS.civel_judicial;
  const generatedAt = resolveDate(geradoEm);
  const dateLong = formatBrLongDate(generatedAt);
  const office = buildOfficeContext(escritorio);

  const hashHex = createHash('sha256')
    .update(JSON.stringify({ aba: normalizedAba, mode, resultado: hasRes ? resultado : null, tempoResultado: hasTempo ? tempoResultado : null }))
    .digest('hex');
  const shortId = hashHex.slice(0, 12).toUpperCase();

  const header = {
    eyebrow: 'ATRIUM · MEMORIAL DE CÁLCULO JUDICIAL',
    officeName: office.officeName,
    officeSubline: office.subline,
    badge: modeMeta.badge,
    emittedAt: `Emitido em ${formatTimestampBr(generatedAt)}`,
    hashLabel: `Cód. Verificação: ATR-${shortId}`,
    runningTitle: hasProcessMeta(processo) && processo.numero
      ? `${office.officeName} · Proc. ${processo.numero}`
      : `${office.officeName} · ${modeMeta.title}`,
    runningRight: `${modeMeta.badge} · ATR-${shortId}`
  };

  const footer = {
    left: 'ATRIUM Gestão Jurídica · Documento de apoio sujeito à conferência humana nos autos.',
    right: `Verificação: ATR-${shortId}`
  };

  const info = {
    title: `${modeMeta.title} — ${office.officeName}`,
    author: office.lawyerName || office.officeName,
    subject: processo?.numero ? `Memorial de cálculo — Processo ${processo.numero}` : modeMeta.title,
    creator: 'ATRIUM Central de Cálculos',
    producer: 'ATRIUM PDF Engine',
    creationDate: generatedAt
  };

  const writer = new PdfWriter(info);
  const rendered = paginate((flow) => {
    if (mode === 'civel_judicial') {
      renderJudicialSection(flow, resultado, { processo, conferencia, office, dateLong });
    } else if (mode === 'correcao') {
      renderCorrecaoSection(flow, resultado, { processo, office, dateLong });
    } else if (mode === 'amortizacao') {
      renderAmortizacaoSection(flow, resultado, { processo, office, dateLong });
    } else if (mode === 'sfh') {
      renderSfhSection(flow, resultado, { processo, office, dateLong });
    } else if (mode === 'tvm') {
      renderTvmSection(flow, resultado, { processo, office, dateLong });
    } else if (mode === 'reajuste') {
      renderReajusteSection(flow, resultado, { processo, office, dateLong });
    } else if (mode === 'htm') {
      renderHtmSection(flow, resultado, { processo, office, dateLong });
    } else if (mode === 'trabalhista') {
      renderTrabalhistaSection(flow, resultado, { processo, office, dateLong });
    } else {
      renderPrevidenciarioSection(flow, hasRes ? resultado : null, hasTempo ? tempoResultado : null, { processo, office, dateLong });
    }
  }, { writer, header, footer, info, brandStyle: 'atrium' });

  const stamp = generatedAt.toISOString().slice(0, 10);
  const safeSlug = mode.replace(/[^a-z0-9_-]/gi, '-');
  return {
    bytes: rendered.bytes,
    pageCount: rendered.pageCount,
    totalPages: rendered.totalPages,
    sha256: hashHex,
    filename: `atrium-memorial-${safeSlug}-${stamp}.pdf`
  };
}
