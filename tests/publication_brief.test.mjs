import assert from 'node:assert/strict';
import { buildPublicationBrief, publicationTodayReason } from '../js/core/publication-brief.js';
import { classifyIntimationAct, publicationTaskDeadline } from '../js/features/publications.js';

console.log('\n===============================================================');
console.log('  ATRIUM - LEITURA RÁPIDA DA PUBLICAÇÃO                      ');
console.log('===============================================================\n');

const act = { category: 'Recurso', priority: 'importante', label: 'Recurso', css: 'recurso' };
const item = {
  id: 'pub-brief',
  process: '5009754-74.2026.8.21.9000',
  text: 'RECURSO DE MEDIDA CAUTELAR N&ordm; 5009754-74.2026.8.21.9000/RS TIPO DE A&Ccedil;&Atilde;O: CNH RELATORA: JUÍZA MIRNA RECORRENTE: JOSELITO EMENTA DIREITO PROCESSUAL CIVIL. RECURSO DESPROVIDO. A Turma negou provimento ao recurso.',
  sourceReportedDeadlineAt: '2026-11-10',
  sourceReportedDeadlineSource: 'eproc'
};
const classifier = {
  enabled: true,
  action: 'suggest',
  area: 'civil',
  areaConfidence: 0.9,
  priority: 'alta',
  deadlineSignal: 'sim',
  deadlineDays: 'd15'
};

const brief = buildPublicationBrief({ item, act, classifier });
assert.match(brief.what, /RECURSO DESPROVIDO/);
assert.equal(brief.what.includes('TIPO DE AÇÃO'), false, 'O cabeçalho não pode virar o resumo.');
assert.match(brief.action, /Analisar para recorrer/);
assert.match(brief.action, /Conferir o prazo informado pela fonte/);
assert.match(brief.piece, /Recurso/);
assert.equal(brief.pieceKind, 'peca');
assert.equal(brief.source, 'Atrium IA');
assert.equal(brief.priority, 'alta');
assert.equal(brief.tone, 'urgent');
assert.equal(brief.confidence, 0.9);

const sentenceAct = { category: 'Sentença / Acórdão', priority: 'importante', label: 'Sentença', css: 'recurso' };
const sentenceBrief = buildPublicationBrief({ item, act: sentenceAct, classifier });
assert.equal(sentenceBrief.pieceKind, 'providencia');
assert.match(sentenceBrief.action, /Conferir a intimação e definir a providência/);

assert.equal(classifyIntimationAct('Fica a parte autora intimada para apresentar contestação em 15 dias.').category, 'Contestação');
assert.equal(classifyIntimationAct('Intimação para manifestação sobre a sentença.').category, 'Manifestação');
assert.equal(classifyIntimationAct('Audiência de instrução designada para 10/11.').category, 'Audiência');
assert.equal(classifyIntimationAct('Sentença publicada. Intimem-se.').category, 'Sentença / Acórdão');
assert.equal(classifyIntimationAct('RECORRENTE: FULANO. Intimação para manifestação sobre a sentença.').category, 'Manifestação');
assert.equal(classifyIntimationAct('RECORRIDO: BELTRANO. Fica intimada a parte para apresentar contestação.').category, 'Contestação');
assert.equal(classifyIntimationAct('RECORRENTE: X. Despacho: intimem-se.').category, 'Despacho');

const oneLineBrief = buildPublicationBrief({
  item: { ...item, text: 'FULANO RECORRENTE: FULANO ADVOGADO: BELTRANO RECURSO DESPROVIDO e a Turma negou.' },
  act,
  classifier
});
assert.match(oneLineBrief.what, /^RECURSO DESPROVIDO/);
assert.equal(oneLineBrief.what.includes('RECORRENTE'), false, 'O cabeçalho não pode entrar no resumo de uma linha.');

const headerOnlyBrief = buildPublicationBrief({
  item: { ...item, text: 'PROCESSO Nº 1 TIPO DE AÇÃO: X ADVOGADO: Y' },
  act,
  classifier
});
assert.equal(headerOnlyBrief.what, '', 'Uma linha só de cabeçalho não vira resumo.');

const reviewBrief = buildPublicationBrief({
  item,
  act,
  classifier: { ...classifier, action: 'review', areaConfidence: 0.4, priority: 'normal' }
});
assert.match(reviewBrief.action, /^Conferir antes de agir/);
assert.equal(reviewBrief.tone, 'review');

const noAi = buildPublicationBrief({ item, act, classifier: null });
assert.equal(noAi.source, 'Leitura do teor');
assert.match(noAi.action, /Analisar para recorrer/);

const entityItem = {
  ...item,
  text: 'RECURSO DESPROVIDO. TIPO DE A&Ccedil;&Atilde;O: CNH N&ordm; 1.'
};
const entityBrief = buildPublicationBrief({ item: entityItem, act, classifier });
assert.match(entityBrief.what, /TIPO DE AÇÃO: CNH Nº 1/);
assert.equal(entityBrief.what.includes('&ordm;'), false);
assert.equal(entityBrief.what.includes('&Ccedil;'), false);

const now = new Date(2026, 9, 30, 12, 0, 0);
assert.equal(publicationTodayReason({ urgent: true }, { now }), 'urgente');
assert.equal(publicationTodayReason({}, { classifier: { priority: 'alta' }, now }), 'prioridade alta');
assert.equal(publicationTodayReason({ sourceReportedDeadlineAt: '2026-10-30', sourceReportedDeadlineSource: 'eproc' }, { now }), 'prazo hoje');
assert.equal(publicationTodayReason({ sourceReportedDeadlineAt: '2026-11-01', sourceReportedDeadlineSource: 'pje' }, { now }), 'prazo em 2 dias');
assert.equal(publicationTodayReason({ sourceReportedDeadlineAt: '2026-10-30', sourceReportedDeadlineSource: 'domicilio' }, { now }), '', 'Domicílio é referência, não prazo.');
assert.equal(publicationTodayReason({ deadline: '2026-10-28' }, { now }), 'vencido há 2 dias');
assert.equal(publicationTodayReason({ deadline: '2026-10-10' }, { now }), '', 'Prazo muito antigo não entra na fila do dia.');
assert.equal(publicationTodayReason({ fatalDeadline: 'a confirmar', sourceReportedDeadlineAt: '2026-11-01', sourceReportedDeadlineSource: 'eproc' }, { now }), 'prazo em 2 dias');
assert.equal(publicationTodayReason({ fatalDeadline: '2026-10-01', deadline: '2026-10-31' }, { now }), 'prazo em 1 dia', 'Fatal fora da janela não esconde a data próxima.');
assert.equal(publicationTodayReason({ fatalDeadline: '2026-12-01', deadline: '2026-10-30' }, { now }), 'prazo hoje');
assert.equal(publicationTodayReason({ deadline: '2026-10-30', sourceReportedDeadlineSource: 'domicilio' }, { now }), '', 'Domicílio via deadline não vira prazo.');
assert.equal(publicationTodayReason({ deadline: '2026-10-30', deadlineSource: 'domicilio' }, { now }), '', 'Domicílio via deadlineSource não vira prazo.');
assert.equal(publicationTodayReason({ sourceReportedDeadlineAt: '2026-10-30', deadlineSource: 'domicilio' }, { now }), '', 'Domicílio no deadlineSource também exclui a data da fonte.');
assert.equal(publicationTodayReason({ deadline: '2026-10-31', deadlineSource: 'manual', sourceReportedDeadlineSource: 'domicilio' }, { now }), 'prazo em 1 dia', 'Data humana confirmada continua valendo.');
assert.equal(publicationTodayReason({ treatmentStatus: 'treated' }, { classifier: { priority: 'alta' }, now }), '', 'Tratada não entra na fila do dia.');
assert.equal(publicationTodayReason({}, { classifier: { action: 'review', areaConfidence: 0.4 }, now }), 'revisar');
assert.equal(publicationTodayReason({}, { classifier: { action: 'suggest', areaConfidence: 0.9 }, now }), '');

const domicilioBrief = buildPublicationBrief({
  item: { ...item, sourceReportedDeadlineAt: '2026-11-02', sourceReportedDeadlineSource: 'domicilio' },
  act,
  classifier
});
assert.match(domicilioBrief.action, /data de referência do Domicílio/);
assert.equal(domicilioBrief.action.includes('prazo informado pela fonte'), false);

const combinedDomicilioBrief = buildPublicationBrief({
  item: { ...item, sourceReportedDeadlineAt: '2026-11-02', sourceReportedDeadlineSource: 'eproc', deadlineSource: 'domicilio' },
  act,
  classifier
});
assert.match(combinedDomicilioBrief.action, /data de referência do Domicílio/);
assert.equal(combinedDomicilioBrief.action.includes('prazo informado pela fonte'), false);

const humanOverDomicilioBrief = buildPublicationBrief({
  item: { ...item, sourceReportedDeadlineAt: '2026-11-02', sourceReportedDeadlineSource: 'domicilio', deadline: '2026-11-05', deadlineSource: 'manual' },
  act,
  classifier
});
assert.match(humanOverDomicilioBrief.action, /prazo registrado no ATRIUM/);

assert.deepEqual(publicationTaskDeadline({ sourceReportedDeadlineAt: '2026-11-10', sourceReportedDeadlineSource: 'domicilio' }), { deadline: '', deadlineSource: '' });
assert.deepEqual(publicationTaskDeadline({ deadline: '2026-11-10', deadlineSource: 'domicilio' }), { deadline: '', deadlineSource: '' }, 'Domicílio no deadlineSource também não pode preencher a tarefa genérica.');
assert.deepEqual(publicationTaskDeadline({ deadline: '2026-11-05', deadlineSource: 'manual', sourceReportedDeadlineSource: 'domicilio' }), { deadline: '2026-11-05', deadlineSource: 'manual' });
assert.deepEqual(publicationTaskDeadline({ sourceReportedDeadlineAt: '2026-11-10', sourceReportedDeadlineSource: 'eproc' }), { deadline: '2026-11-10', deadlineSource: 'eproc' });
assert.deepEqual(publicationTaskDeadline({ sourceReportedDeadlineAt: '2026-11-10', sourceReportedDeadlineSource: 'eproc' }, { deadlineMode: 'manual' }), { deadline: '', deadlineSource: '' });

console.log('V Resumo extraído do teor, peça, ação, entidades e critérios da fila do dia.');
console.log('\n>>> LEITURA RÁPIDA DA PUBLICAÇÃO: PASS <<<\n');
