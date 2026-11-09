import { parseDec, add, sub, mul, min, max, toCents, fromCents, toFixedString, percentOf } from './decimal.mjs';

export class TabelaFiscalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TabelaFiscalError';
  }
}

function money(cents) {
  return toFixedString(fromCents(cents), 2);
}

export const VIGENCIAS_FISCAIS = Object.freeze({
  2026: Object.freeze({
    ano: 2026,
    salarioMinimo: '1621.00',
    tetoSalarioContribuicao: '8475.55',
    contribuicaoMaxima: '988.09',
    inss: Object.freeze([
      Object.freeze({ limite: '1621.00', aliquota: '7.5' }),
      Object.freeze({ limite: '2902.84', aliquota: '9' }),
      Object.freeze({ limite: '4354.27', aliquota: '12' }),
      Object.freeze({ limite: '8475.55', aliquota: '14' })
    ]),
    irrf: Object.freeze([
      Object.freeze({ limite: '2428.80', aliquota: '0', deducao: '0' }),
      Object.freeze({ limite: '2826.65', aliquota: '7.5', deducao: '182.16' }),
      Object.freeze({ limite: '3751.05', aliquota: '15', deducao: '394.16' }),
      Object.freeze({ limite: '4664.68', aliquota: '22.5', deducao: '675.49' }),
      Object.freeze({ limite: null, aliquota: '27.5', deducao: '908.73' })
    ]),
    deducaoDependente: '189.59',
    descontoSimplificado: '607.20',
    redutor: Object.freeze({ teto: '7350.00', a: '978.62', b: '0.133145' }),
    fontes: Object.freeze([
      'INSS: Portaria Interministerial MPS/MF nº 13/2026 (tabela de contribuição mensal).',
      'Salário mínimo: Decreto nº 12.797/2025.',
      'IRRF progressivo: Lei nº 15.191/2025.',
      'Redutor do IRRF (isenção até R$ 5.000, decrescente até R$ 7.350): Lei nº 15.270/2025, art. 2º (art. 3º-A da Lei nº 9.250/1995).',
      'Dedução por dependente e desconto simplificado: tabelas do IRPF 2026 (Receita Federal).',
      'Referência funcional cruzada: CaniveteMEI/tabelas-mei-clt (MIT).'
    ])
  })
});

export function vigenciaFiscal(ano) {
  const entry = VIGENCIAS_FISCAIS[ano];
  if (!entry) {
    throw new TabelaFiscalError(`Vigência fiscal não cadastrada para ${ano}. Informe os descontos manualmente ou cadastre a vigência conferida na fonte oficial.`);
  }
  return entry;
}

export function calcularInss(salario, ano = 2026) {
  const vigencia = vigenciaFiscal(ano);
  const bruto = parseDec(salario);
  if (bruto < 0n) throw new TabelaFiscalError('Salário de contribuição não pode ser negativo.');
  const detalhe = [];
  let anterior = 0n;
  let total = 0n;
  for (const faixa of vigencia.inss) {
    const limite = parseDec(faixa.limite);
    if (bruto <= anterior) break;
    const base = min(bruto, limite) - anterior;
    if (base <= 0n) break;
    const valor = percentOf(base, faixa.aliquota);
    total = add(total, valor);
    detalhe.push({
      aliquota: `${Number(faixa.aliquota).toFixed(1).replace('.', ',')}%`,
      faixaAte: money(toCents(limite)),
      base: money(toCents(base)),
      valor: money(toCents(valor))
    });
    anterior = limite;
    if (bruto <= limite) break;
  }
  return { total: money(toCents(total)), detalhe, vigencia: vigencia.ano };
}

export function calcularRedutorIrrf(rendimento, ano = 2026) {
  const vigencia = vigenciaFiscal(ano);
  const renda = parseDec(rendimento);
  if (renda <= 0n) return parseDec('0');
  if (renda > parseDec(vigencia.redutor.teto)) return parseDec('0');
  const limite = sub(parseDec(vigencia.redutor.a), mul(parseDec(vigencia.redutor.b), renda));
  return limite < 0n ? parseDec('0') : limite;
}

export function calcularIrrf({ rendimento, inss = '0', dependentes = 0, pensao = '0', outrasDeducoes = '0', metodo = 'automatico', ano = 2026 }) {
  const vigencia = vigenciaFiscal(ano);
  const renda = parseDec(rendimento);
  if (renda < 0n) throw new TabelaFiscalError('Rendimento tributável não pode ser negativo.');
  if (!['automatico', 'legal', 'simplificado'].includes(metodo)) {
    throw new TabelaFiscalError(`Método de IRRF inválido: ${metodo}.`);
  }
  if (!Number.isInteger(dependentes) || dependentes < 0 || dependentes > 20) {
    throw new TabelaFiscalError(`Dependentes inválidos: ${dependentes}.`);
  }
  const baseLegal = max(parseDec('0'), sub(sub(sub(renda, parseDec(inss)), mul(parseDec(vigencia.deducaoDependente), parseDec(String(dependentes)))), add(parseDec(pensao), parseDec(outrasDeducoes))));
  const baseSimplificada = max(parseDec('0'), sub(renda, parseDec(vigencia.descontoSimplificado)));
  const metodoAplicado = metodo === 'automatico' ? (baseSimplificada <= baseLegal ? 'simplificado' : 'legal') : metodo;
  const base = metodoAplicado === 'simplificado' ? baseSimplificada : baseLegal;
  let irrfTabela = 0n;
  let aliquotaAplicada = '0';
  if (base > 0n) {
    for (const faixa of vigencia.irrf) {
      const limite = faixa.limite === null ? null : parseDec(faixa.limite);
      if (limite === null || base <= limite) {
        irrfTabela = max(parseDec('0'), sub(percentOf(base, faixa.aliquota), parseDec(faixa.deducao)));
        aliquotaAplicada = faixa.aliquota;
        break;
      }
    }
  }
  const redutor = min(irrfTabela, calcularRedutorIrrf(renda, ano));
  const irrf = max(parseDec('0'), sub(irrfTabela, redutor));
  return {
    base: money(toCents(base)),
    metodo: metodoAplicado,
    aliquota: `${Number(aliquotaAplicada).toFixed(1).replace('.', ',')}%`,
    irrfTabela: money(toCents(irrfTabela)),
    redutor: money(toCents(redutor)),
    irrf: money(toCents(irrf)),
    isento: irrf === 0n,
    vigencia: vigencia.ano
  };
}

export function calcularIrrfExclusivo({ rendimento, inss = '0', dependentes = 0, ano = 2026 }) {
  const vigencia = vigenciaFiscal(ano);
  const renda = parseDec(rendimento);
  if (renda < 0n) throw new TabelaFiscalError('Rendimento exclusivo não pode ser negativo.');
  if (!Number.isInteger(dependentes) || dependentes < 0 || dependentes > 20) {
    throw new TabelaFiscalError(`Dependentes inválidos: ${dependentes}.`);
  }
  const base = max(parseDec('0'), sub(sub(renda, parseDec(inss)), mul(parseDec(vigencia.deducaoDependente), parseDec(String(dependentes)))));
  let irrfTabela = 0n;
  let aliquotaAplicada = '0';
  if (base > 0n) {
    for (const faixa of vigencia.irrf) {
      const limite = faixa.limite === null ? null : parseDec(faixa.limite);
      if (limite === null || base <= limite) {
        irrfTabela = max(parseDec('0'), sub(percentOf(base, faixa.aliquota), parseDec(faixa.deducao)));
        aliquotaAplicada = faixa.aliquota;
        break;
      }
    }
  }
  const redutor = min(irrfTabela, calcularRedutorIrrf(renda, ano));
  const irrf = max(parseDec('0'), sub(irrfTabela, redutor));
  return {
    base: money(toCents(base)),
    metodo: 'legal',
    aliquota: `${Number(aliquotaAplicada).toFixed(1).replace('.', ',')}%`,
    irrfTabela: money(toCents(irrfTabela)),
    redutor: money(toCents(redutor)),
    irrf: money(toCents(irrf)),
    isento: irrf === 0n,
    vigencia: vigencia.ano
  };
}

export function vigenciaResumo(ano = 2026) {
  const vigencia = vigenciaFiscal(ano);
  return {
    ano: vigencia.ano,
    salarioMinimo: vigencia.salarioMinimo,
    tetoSalarioContribuicao: vigencia.tetoSalarioContribuicao,
    contribuicaoMaxima: vigencia.contribuicaoMaxima,
    dependente: vigencia.deducaoDependente,
    descontoSimplificado: vigencia.descontoSimplificado,
    fontes: vigencia.fontes
  };
}
