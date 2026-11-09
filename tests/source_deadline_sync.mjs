import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  taskDeadlineOwnership,
  resolveSourceDeadlineValue,
  sourceDeadlineLabel,
  planSourceDeadlineSync,
  applySourceDeadlineSync
} from '../lib/publications/source-deadline-sync.mjs';
import { serverSourceText } from './server-source.mjs';

console.log('--- Iniciando Testes Unitários: Propagação do prazo declarado pela fonte oficial ---');

const INTIMATION_ID = 'eproc:tjrs-eproc-1g:deadbeefdeadbeefdeadbeefdeadbeef';
const CNJ = '5001234-56.2024.8.21.0001';

function intimation(overrides = {}) {
  return {
    id: INTIMATION_ID,
    externalId: INTIMATION_ID,
    process: CNJ,
    source: 'eproc',
    sourceReportedDeadlineAt: '2026-09-20',
    sourceDeadlineChangedAt: '2026-09-20T10:00:00.000Z',
    sourceReportedDeadlinePrevious: '2026-09-10',
    ...overrides
  };
}

function task(overrides = {}) {
  return {
    id: 'task-1',
    title: 'Prazo eproc — Manifestação',
    process: CNJ,
    intimationId: INTIMATION_ID,
    sourceIntimationId: INTIMATION_ID,
    ...overrides
  };
}

function applyOnce(state, { deadlineMode = 'auto' } = {}) {
  const plan = planSourceDeadlineSync({ tasks: state.tasks, intimations: state.intimations, deadlineMode });
  const applied = applySourceDeadlineSync(state, plan, { actor: 'Teste', nowIso: '2026-09-21T12:00:00.000Z' });
  return { plan, applied };
}

// --- A) Origem do prazo é derivada do dado -------------------------------------------------
assert.equal(taskDeadlineOwnership(task()), 'empty', 'Sem prazo, a fonte pode preencher em modo auto.');
assert.equal(taskDeadlineOwnership(task({ deadline: '2026-09-20', sourceReportedDeadlineAt: '2026-09-20' })), 'source');
assert.equal(taskDeadlineOwnership(task({ deadline: '2026-09-20' })), 'human', 'Sem valor declarado pela fonte, o prazo é humano.');
assert.equal(
  taskDeadlineOwnership(task({ deadline: '2026-09-21', sourceReportedDeadlineAt: '2026-09-20', deadlineSource: 'eproc' })),
  'human',
  'Uma flag antiga de origem não autoriza tratar valor divergente como da fonte.'
);
assert.equal(resolveSourceDeadlineValue(intimation()), '2026-09-20');
assert.equal(resolveSourceDeadlineValue(intimation({ sourceReportedDeadlineAt: '' })), '');
assert.equal(sourceDeadlineLabel(intimation({ sourceReportedDeadlineSource: 'domicilio' })), 'domicilio');
assert.equal(sourceDeadlineLabel({ source: 'pje' }), 'pje');
assert.equal(sourceDeadlineLabel({}), 'fonte oficial');
console.log('  OK: origem do prazo derivada do dado (fonte × humana × vazia).');

// --- B) Plano: atualização da fonte em modo auto e preenchimento ---------------------------
{
  const state = { intimations: [intimation()], tasks: [task({ deadline: '2026-09-10', deadlineSource: 'eproc', sourceReportedDeadlineAt: '2026-09-10' })] };
  const { plan, applied } = applyOnce(state);
  assert.equal(plan.updates.length, 1, 'Mudança de prazo declarada pela fonte deve gerar atualização.');
  assert.equal(plan.conflicts.length, 0);
  assert.equal(plan.updates[0].previousValue, '2026-09-10');
  assert.equal(plan.updates[0].sourceValue, '2026-09-20');
  assert.equal(plan.updates[0].source, 'eproc');
  assert.equal(applied.changed, true);
  assert.equal(applied.updated, 1);
  const updated = state.tasks[0];
  assert.equal(updated.deadline, '2026-09-20');
  assert.equal(updated.deadlineSource, 'eproc');
  assert.equal(updated.sourceReportedDeadlineAt, '2026-09-20');
  assert.equal(updated.sourceDeadlineSyncAt, '2026-09-21T12:00:00.000Z');
  assert.equal(updated.history.at(-1).action, 'Prazo atualizado pela fonte (2026-09-10 → 2026-09-20)');
  assert.equal(applied.auditEntries.length, 1);
  assert.match(applied.auditEntries[0].action, /Prazo atualizado pela fonte oficial/);
  assert.equal(applied.auditEntries[0].actor, 'Teste');
  console.log('  OK: suspensão/retificação da fonte atualiza a tarefa com histórico e audit.');
}

{
  const state = { intimations: [intimation()], tasks: [task()] };
  const { plan, applied } = applyOnce(state);
  assert.equal(plan.updates.length, 1, 'Tarefa sem prazo recebe o prazo declarado pela fonte.');
  assert.equal(state.tasks[0].deadline, '2026-09-20');
  assert.equal(applied.updated, 1);
  console.log('  OK: tarefa sem prazo é preenchida pela fonte em modo auto.');
}

{
  const state = { intimations: [intimation()], tasks: [task({ deadline: '', sourceReportedDeadlineAt: '2026-09-20' })] };
  applyOnce(state);
  assert.equal(state.tasks[0].deadline, '2026-09-20', 'Uma referência já gravada não impede preencher tarefa sem prazo.');
}

// --- B2) Domicílio é referência, nunca prazo operacional --------------------------------
{
  const domic = intimation({ id: 'domicilio:1', externalId: 'domicilio:1', source: 'domicilio', sourceReportedDeadlineSource: 'domicilio' });
  const state = { intimations: [domic], tasks: [task({ intimationId: 'domicilio:1', sourceIntimationId: 'domicilio:1' })] };
  const { plan, applied } = applyOnce(state);
  assert.equal(plan.updates.length, 0, 'Domicílio não pode preencher deadline.');
  assert.equal(plan.conflicts.length, 0, 'Referência de domicílio não vira conflito de prazo.');
  assert.equal(applied.changed, false);
  assert.equal(state.tasks[0].deadline, undefined);
  assert.equal(state.tasks[0].sourceReportedDeadlineAt, undefined);
}

{
  const referencia = intimation({ id: 'domicilio:2', externalId: 'domicilio:2', source: 'pje', sourceReportedDeadlineSource: 'domicilio' });
  const state = { intimations: [referencia], tasks: [task({ intimationId: 'domicilio:2', sourceIntimationId: 'domicilio:2', deadline: '2026-09-18' })] };
  const { plan } = applyOnce(state);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.conflicts.length, 0, 'Fonte de referência não gera aviso de conflito.');
  assert.equal(state.tasks[0].deadline, '2026-09-18');
}
console.log('  OK: domicílio permanece referência e nunca vira prazo operacional.');

// --- C) Idempotência ----------------------------------------------------------------------
{
  const state = { intimations: [intimation()], tasks: [task({ deadline: '2026-09-10', sourceReportedDeadlineAt: '2026-09-10' })] };
  applyOnce(state);
  const second = applyOnce(state);
  assert.equal(second.plan.updates.length, 0, 'Plano reaplicado não pode repetir atualização.');
  assert.equal(second.applied.changed, false, 'Segunda aplicação não altera o estado.');
  assert.equal(state.tasks[0].history.length, 1, 'Histórico não pode duplicar entrada idempotente.');
  console.log('  OK: propagação idempotente (mesmo valor não reescreve nem duplica histórico).');
}

// --- D) Prazo humano prevalece e a divergência fica visível --------------------------------
{
  const state = { intimations: [intimation()], tasks: [task({ deadline: '2026-09-18', sourceReportedDeadlineAt: '2026-09-10' })] };
  const { plan, applied } = applyOnce(state);
  assert.equal(plan.updates.length, 0, 'Prazo humano nunca é sobrescrito pela fonte.');
  assert.equal(plan.conflicts.length, 1);
  assert.equal(applied.updated, 0);
  assert.equal(applied.conflicts, 1);
  const conflictTask = state.tasks[0];
  assert.equal(conflictTask.deadline, '2026-09-18', 'Valor editado por pessoa permanece.');
  assert.equal(conflictTask.deadlineConflict.source, 'eproc');
  assert.equal(conflictTask.deadlineConflict.sourceValue, '2026-09-20');
  assert.equal(conflictTask.deadlineConflict.humanValue, '2026-09-18');
  assert.equal(conflictTask.deadlineConflict.previousSourceValue, '2026-09-10');
  assert.equal(conflictTask.deadlineConflict.mode, 'auto');
  assert.equal(applied.auditEntries.length, 1);
  assert.match(applied.auditEntries[0].action, /Divergência de prazo/);
  const repeat = applyOnce(state);
  assert.equal(repeat.applied.auditEntries.length, 0, 'Aviso repetido não gera audit duplicado.');
  assert.equal(repeat.applied.changed, false);
  console.log('  OK: prazo humano prevalece e a divergência vira aviso único de conferência.');
}

{
  const state = { intimations: [intimation()], tasks: [task({ deadline: '2026-09-18', sourceReportedDeadlineAt: '2026-09-10' })] };
  applyOnce(state);
  state.intimations[0].sourceReportedDeadlineAt = '2026-09-18';
  const converged = applyOnce(state);
  assert.equal(converged.plan.updates.length, 0);
  assert.equal(Object.hasOwn(state.tasks[0], 'deadlineConflict'), false, 'Aviso desaparece quando os valores convergem.');
  assert.equal(converged.applied.changed, true);
  console.log('  OK: aviso de divergência é removido quando os valores convergem.');
}

// --- E) Modo manual nunca escreve ---------------------------------------------------------
{
  const state = { intimations: [intimation()], tasks: [task({ deadline: '2026-09-10', sourceReportedDeadlineAt: '2026-09-10' })] };
  const { plan, applied } = applyOnce(state, { deadlineMode: 'manual' });
  assert.equal(plan.auto, false);
  assert.equal(plan.updates.length, 0, 'Modo manual mantém a data apenas como referência.');
  assert.equal(plan.conflicts.length, 1);
  assert.equal(plan.conflicts[0].manual, true);
  assert.equal(plan.conflicts[0].mode, 'manual');
  assert.equal(state.tasks[0].deadline, '2026-09-10');
  assert.equal(applied.updated, 0);
  assert.equal(state.tasks[0].deadlineConflict.mode, 'manual');
  console.log('  OK: modo manual mantém o prazo vigente e só informa a data da fonte.');
}

// --- F) Fonte sem prazo e referências ausentes ---------------------------------------------
{
  const state = { intimations: [intimation({ sourceReportedDeadlineAt: '' })], tasks: [task({ deadline: '2026-09-10', sourceReportedDeadlineAt: '2026-09-10', deadlineConflict: { source: 'eproc', sourceValue: '2026-09-20', humanValue: '2026-09-10', mode: 'auto' } })] };
  const { plan, applied } = applyOnce(state);
  assert.equal(plan.updates.length, 0, 'Sem data declarada pela fonte, nada é escrito.');
  assert.equal(plan.conflicts.length, 0);
  assert.equal(state.tasks[0].deadline, '2026-09-10', 'Prazo existente nunca é apagado pela ausência da fonte.');
  assert.equal(Object.hasOwn(state.tasks[0], 'deadlineConflict'), false, 'Aviso obsoleto é limpo quando a fonte deixa de declarar prazo.');
  assert.equal(applied.changed, true);
  console.log('  OK: fonte sem prazo não apaga nem inventa nada.');
}

{
  const state = { intimations: [intimation()], tasks: [task({ id: 'task-orfa', intimationId: 'outro-id', sourceIntimationId: '', publicationId: '', deadline: '2026-09-10' })] };
  const { plan } = applyOnce(state);
  assert.equal(plan.updates.length, 0);
  assert.equal(plan.conflicts.length, 0);
  assert.equal(state.tasks[0].deadline, '2026-09-10');
  console.log('  OK: tarefa sem publicação correspondente é ignorada.');
}

{
  const state = { intimations: [intimation()], tasks: [task({ id: 'task-pub', intimationId: '', sourceIntimationId: '', publicationId: INTIMATION_ID })] };
  const { plan } = applyOnce(state);
  assert.equal(plan.updates.length, 1, 'Referência por publicationId também identifica a tarefa.');
  assert.equal(state.tasks[0].deadline, '2026-09-20');
  console.log('  OK: referência por publicationId é reconhecida.');
}

// --- G) Contrato de integração no servidor e no coletor ------------------------------------
const serverSource = serverSourceText;
const persistSource = serverSource.slice(
  serverSource.indexOf('async function persistExternalCollectionsToCanonical'),
  serverSource.indexOf('async function waitForActiveEprocSync')
);
assert.match(persistSource, /applySourceDeadlineSync\(/, 'Persistência oficial de coleções externas deve propagar o prazo da fonte.');
assert.match(persistSource, /planSourceDeadlineSync\(/, 'A decisão de propagação deve vir do módulo puro.');
assert.ok(
  persistSource.indexOf('mergeDuplicateIntimationsIntoState') < persistSource.indexOf('applySourceDeadlineSync('),
  'A propagação roda depois da fusão oficial (tarefas já apontam para o keeper).'
);
assert.match(
  serverSource,
  /task\.sourceReportedDeadlineAt = sourceDeadline;/,
  'Tarefa criada de publicação marca a origem do prazo quando o valor veio da fonte oficial.'
);

const downloaderSource = readFileSync(new URL('../lib/judicial/eproc-a1-downloader.mjs', import.meta.url), 'utf8');
assert.match(downloaderSource, /from '\.\.\/publications\/source-deadline-sync\.mjs'/, 'Coletor compartilha a mesma regra de origem do prazo.');
assert.match(downloaderSource, /sourceDeadlineChangedAt: collectedAt/, 'Coletor registra quando a fonte mudou o prazo.');
assert.match(downloaderSource, /sourceReportedDeadlinePrevious/, 'Coletor guarda o valor anterior para auditoria.');
assert.match(downloaderSource, /deadlineConflict = \{/, 'Coletor sinaliza divergência em vez de sobrescrever prazo humano.');
assert.doesNotMatch(
  downloaderSource,
  /deadline: sourceReportedDeadlineAt \|\| task\?\.deadline \|\| ''/,
  'Sobrescrita incondicional do prazo da tarefa não pode voltar.'
);
console.log('  OK: servidor e coletor usam o mesmo contrato de propagação.');

console.log('\n[PASS] Todos os cenários de propagação de prazo passaram.');
