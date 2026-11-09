import assert from 'node:assert/strict';
import {
  TrabalhistaError,
  TIPOS_DESLIGAMENTO,
  buildTrabalhistaCalculation,
  describeTrabalhistaInput
} from '../lib/calc/trabalhista.mjs';

assert.deepEqual([...TIPOS_DESLIGAMENTO], ['sem_justa_causa', 'pedido_demissao', 'acordo_484a', 'justa_causa', 'termino_contrato']);

const semJustaCausa = buildTrabalhistaCalculation({
  salario: '3000.00',
  admissao: '2024-03-10',
  desligamento: '2026-04-15',
  tipoDesligamento: 'sem_justa_causa',
  diasTrabalhados: 15,
  aviso: 'indenizado',
  feriasVencidas: 1,
  saldoFgts: '10000.00'
});
assert.equal(semJustaCausa.parametros.anosCompletos, 2);
assert.equal(semJustaCausa.parametros.avisoDiasBase, 36);
assert.equal(semJustaCausa.parametros.projecaoAte, '2026-05-21');
assert.deepEqual(semJustaCausa.parametros.avos, { decimo: 5, ferias: 3 });
assert.equal(semJustaCausa.resumo.saldo, '1500.00');
assert.equal(semJustaCausa.resumo.decimo, '1250.00');
assert.equal(semJustaCausa.resumo.feriasProporcionais, '1000.00');
assert.equal(semJustaCausa.resumo.feriasVencidas, '4000.00');
assert.equal(semJustaCausa.resumo.aviso, '3600.00');
assert.equal(semJustaCausa.resumo.multaFgts, '4000.00');
assert.equal(semJustaCausa.resumo.proventos, '15350.00');
assert.equal(semJustaCausa.resumo.descontos, '0.00');
assert.equal(semJustaCausa.resumo.liquido, '15350.00');
assert.equal(semJustaCausa.verbas.length, 6);
assert.ok(semJustaCausa.memoria.every(entry => entry.tipo !== 'verba' || entry.fundamento));
assert.doesNotThrow(() => JSON.stringify(semJustaCausa));

const pedido = buildTrabalhistaCalculation({
  salario: '2000.00',
  admissao: '2025-01-05',
  desligamento: '2026-02-10',
  tipoDesligamento: 'pedido_demissao',
  diasTrabalhados: 10,
  aviso: 'descontado',
  feriasVencidas: 0,
  saldoFgts: '5000.00'
});
assert.equal(pedido.parametros.avisoDias, 30);
assert.equal(pedido.parametros.projecaoAte, null);
assert.equal(pedido.resumo.saldo, '666.67');
assert.equal(pedido.resumo.decimo, '166.67');
assert.equal(pedido.resumo.feriasProporcionais, '222.22');
assert.equal(pedido.resumo.aviso, '0.00');
assert.equal(pedido.resumo.multaFgts, '0.00');
assert.equal(pedido.resumo.proventos, '1055.56');
assert.equal(pedido.resumo.descontos, '2000.00');
assert.equal(pedido.resumo.liquido, '-944.44', 'Líquido negativo deve ser exposto sem mascaramento.');
assert.ok(pedido.memoria.some(entry => entry.tipo === 'verba' && entry.natureza === 'desconto'));

const acordo = buildTrabalhistaCalculation({
  salario: '4000.00',
  admissao: '2023-06-01',
  desligamento: '2026-06-30',
  tipoDesligamento: 'acordo_484a',
  diasTrabalhados: 30,
  aviso: 'indenizado',
  feriasVencidas: 0,
  saldoFgts: '20000.00'
});
assert.equal(acordo.parametros.avisoDiasBase, 39);
assert.equal(acordo.parametros.projecaoAte, '2026-07-19');
assert.equal(acordo.parametros.multaPercentual, '20');
assert.equal(acordo.resumo.saldo, '4000.00');
assert.equal(acordo.resumo.decimo, '2333.33');
assert.equal(acordo.resumo.feriasProporcionais, '888.89');
assert.equal(acordo.resumo.aviso, '2600.00', 'Aviso do acordo paga metade.');
assert.equal(acordo.resumo.multaFgts, '4000.00');
assert.equal(acordo.resumo.liquido, '13822.22');

const justaCausa = buildTrabalhistaCalculation({
  salario: '2500.00',
  admissao: '2025-08-01',
  desligamento: '2026-09-10',
  tipoDesligamento: 'justa_causa',
  diasTrabalhados: 10,
  feriasVencidas: 0,
  saldoFgts: '3000.00'
});
assert.equal(justaCausa.resumo.saldo, '833.33');
assert.equal(justaCausa.resumo.decimo, '0.00');
assert.equal(justaCausa.resumo.feriasProporcionais, '0.00');
assert.equal(justaCausa.resumo.aviso, '0.00');
assert.equal(justaCausa.resumo.multaFgts, '0.00');
assert.equal(justaCausa.resumo.liquido, '833.33');
assert.deepEqual(justaCausa.parametros.avos, { decimo: 0, ferias: 0 });
assert.ok(justaCausa.parametros.restricaoJustaCausa);
assert.equal(justaCausa.avisos.length, 3);

const comDescontos = buildTrabalhistaCalculation({
  salario: '3000.00',
  admissao: '2024-03-10',
  desligamento: '2026-04-15',
  tipoDesligamento: 'sem_justa_causa',
  saldoFgts: '10000.00',
  descontos: [{ descricao: 'INSS informado', valor: '120.00' }, { descricao: 'IRRF informado', valor: '80.00' }]
});
assert.equal(comDescontos.resumo.descontos, '200.00');
assert.equal(comDescontos.resumo.liquido, '12650.00');

assert.equal(describeTrabalhistaInput({ salario: '1', admissao: '2026-01-01', desligamento: '2026-01-31', tipoDesligamento: 'pedido_demissao' }).aviso, 'descontado');
assert.equal(describeTrabalhistaInput({ salario: '1', admissao: '2026-01-01', desligamento: '2026-01-31', tipoDesligamento: 'sem_justa_causa', saldoFgts: '0' }).multaPercentual, '40');

assert.throws(() => buildTrabalhistaCalculation({
  salario: '3000.00', admissao: '2024-03-10', desligamento: '2026-04-15', tipoDesligamento: 'sem_justa_causa'
}), TrabalhistaError, 'Multa exige saldo do FGTS.');
assert.throws(() => buildTrabalhistaCalculation({
  salario: '3000.00', admissao: '2024-03-10', desligamento: '2026-04-15', tipoDesligamento: 'sem_justa_causa', saldoFgts: '1000', diasTrabalhados: 31
}), TrabalhistaError);
assert.throws(() => buildTrabalhistaCalculation({
  salario: '3000.00', admissao: '2026-04-15', desligamento: '2024-03-10', tipoDesligamento: 'sem_justa_causa', saldoFgts: '1000'
}), TrabalhistaError);
assert.throws(() => buildTrabalhistaCalculation({
  salario: '0', admissao: '2024-03-10', desligamento: '2026-04-15', tipoDesligamento: 'sem_justa_causa', saldoFgts: '1000'
}), TrabalhistaError);
assert.throws(() => buildTrabalhistaCalculation({
  salario: '3000.00', admissao: '2024-03-10', desligamento: '2026-04-15', tipoDesligamento: 'invalido', saldoFgts: '1000'
}), TrabalhistaError);
assert.throws(() => buildTrabalhistaCalculation({
  salario: '3000.00', admissao: '2024-03-10', desligamento: '2026-04-15', tipoDesligamento: 'sem_justa_causa', saldoFgts: '1000',
  descontos: [{ valor: '10' }]
}), TrabalhistaError);

const comTributacao = buildTrabalhistaCalculation({
  salario: '3000.00',
  admissao: '2024-03-10',
  desligamento: '2026-04-15',
  tipoDesligamento: 'sem_justa_causa',
  diasTrabalhados: 15,
  aviso: 'indenizado',
  feriasVencidas: 1,
  saldoFgts: '10000.00',
  tributacao: { ano: 2026 }
});
assert.equal(comTributacao.tributacao.ano, 2026);
assert.equal(comTributacao.tributacao.inss.saldo, '112.50', 'INSS de 1.500 = 7,5%.');
assert.equal(comTributacao.tributacao.irrf.saldo, '0.00', 'Saldo de 1.500 fica isento de IRRF.');
assert.equal(comTributacao.tributacao.inss.decimo, '93.75', 'INSS do 13º de 1.250 em separado.');
assert.equal(comTributacao.tributacao.irrf.decimo, '0.00');
assert.equal(comTributacao.resumo.descontos, '206.25');
assert.equal(comTributacao.resumo.liquido, '15143.75');
assert.ok(comTributacao.avisos.some(aviso => /Tributação automática/.test(aviso)));
assert.ok(comTributacao.verbas.some(verba => verba.descricao.includes('INSS sobre o saldo')));
assert.ok(comTributacao.verbas.some(verba => verba.descricao.includes('IRRF exclusivo sobre o 13º')));
assert.ok(comTributacao.tributacao.fontes.some(fonte => /15\.270/.test(fonte)));

const tributacaoAlta = buildTrabalhistaCalculation({
  salario: '6000.00',
  admissao: '2024-01-10',
  desligamento: '2026-03-31',
  tipoDesligamento: 'sem_justa_causa',
  diasTrabalhados: 30,
  aviso: 'indenizado',
  saldoFgts: '20000.00',
  tributacao: { ano: 2026 }
});
assert.equal(tributacaoAlta.parametros.projecaoAte, '2026-05-06');
assert.equal(tributacaoAlta.resumo.saldo, '6000.00');
assert.equal(tributacaoAlta.resumo.decimo, '2000.00', 'Maio com 6 dias não completa avo.');
assert.equal(tributacaoAlta.resumo.feriasProporcionais, '2666.67');
assert.equal(tributacaoAlta.resumo.aviso, '7200.00');
assert.equal(tributacaoAlta.tributacao.inss.saldo, '641.51');
assert.equal(tributacaoAlta.tributacao.metodoSaldo, 'legal');
assert.equal(tributacaoAlta.tributacao.irrf.saldo, '385.10', 'IRRF com redutor da Lei 15.270/2025.');
assert.equal(tributacaoAlta.tributacao.redutor.saldo, '179.75');
assert.equal(tributacaoAlta.tributacao.inss.decimo, '155.69');
assert.equal(tributacaoAlta.tributacao.irrf.decimo, '0.00');
assert.equal(tributacaoAlta.resumo.descontos, '1182.30');
assert.equal(tributacaoAlta.resumo.liquido, '24684.37');

assert.throws(() => buildTrabalhistaCalculation({
  salario: '3000.00', admissao: '2024-03-10', desligamento: '2026-04-15', tipoDesligamento: 'sem_justa_causa', saldoFgts: '1000',
  tributacao: { ano: 2025 }
}), TrabalhistaError, 'Vigência fiscal ausente precisa falhar com orientação.');
assert.throws(() => buildTrabalhistaCalculation({
  salario: '3000.00', admissao: '2024-03-10', desligamento: '2026-04-15', tipoDesligamento: 'sem_justa_causa', saldoFgts: '1000',
  tributacao: { ano: 2026, dependentes: 21 }
}), TrabalhistaError);
assert.equal(describeTrabalhistaInput({ salario: '1', admissao: '2026-01-01', desligamento: '2026-01-31', tipoDesligamento: 'sem_justa_causa', saldoFgts: '0' }).tributacao, null);

console.log('Motor trabalhista aprovado: aviso com projeção, 13º e férias por avos, justa causa, acordo 484-A, INSS/IRRF 2026 e memória PASS.');
