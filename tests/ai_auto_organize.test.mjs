import assert from 'node:assert/strict';
import { applyAreaEvidence, deriveAreaEvidence } from '../lib/jev-beta/area-evidence.mjs';
import { applyAutoOrganize, planAutoOrganize } from '../lib/ai/auto-organize.mjs';

console.log('--- Iniciando Testes: área por evidência e organização automática ---');

// Evidência objetiva
const inss = deriveAreaEvidence({ record: { parties: 'Cliente Teste - INSTITUTO NACIONAL DO SEGURO SOCIAL - INSS', process: '0000000-00.2026.4.04.7105' } });
assert.equal(inss.area, 'previdenciario');
assert.equal(deriveAreaEvidence({ record: { process: '0000000-00.2026.5.04.0601' } }).area, 'trabalhista', 'Segmento 5 do CNJ é Justiça do Trabalho.');
assert.equal(deriveAreaEvidence({ record: { source: 'INPI', id: 'inpi:1' } }).area, 'marcas');
assert.equal(deriveAreaEvidence({ record: {}, process: { number: '0000000-00.2026.8.21.0001', actionClass: 'Ação Penal - Procedimento Ordinário' } }).area, 'criminal');
assert.equal(deriveAreaEvidence({ record: {}, process: { number: '0000000-00.2026.8.21.0001', actionClass: 'Execução Fiscal' } }).area, 'tributario');
assert.equal(deriveAreaEvidence({ record: {}, process: { number: '0000000-00.2026.8.21.0001', title: 'Procedimento do Juizado Especial da Fazenda Pública' } }).area, 'fazenda');
assert.equal(deriveAreaEvidence({ record: { text: 'Processo distribuído para a 1ª Vara.' }, process: { number: '0000000-00.2026.8.21.0001' } }), null, 'Sem evidência não há palpite.');
assert.equal(deriveAreaEvidence({ record: { text: 'A parte falou em aposentadoria ao longo do depoimento.', process: '0000000-00.2026.8.21.0001' } }), null, 'Citação de passagem no teor não define a área.');

// Aplicação sobre a sugestão do modelo
const lowConfidence = { area: 'criminal', areaConfidence: 0.29, action: 'review', reason: 'modelo' };
const fixed = applyAreaEvidence(lowConfidence, inss);
assert.equal(fixed.area, 'previdenciario', 'Evidência forte corrige palpite fraco.');
assert.equal(fixed.areaSource, 'evidencia');
assert.equal(lowConfidence.area, 'criminal', 'Não altera a entrada guardada.');
const firm = { area: 'civil', areaConfidence: 0.97, action: 'suggest' };
assert.equal(applyAreaEvidence(firm, inss), firm, 'Modelo mais confiante que a evidência fica como está.');
assert.equal(applyAreaEvidence(lowConfidence, null), lowConfidence);
assert.equal(applyAreaEvidence({ area: 'previdenciario', areaConfidence: 0.5, action: 'abstain' }, inss).areaConfidence, 0.94);

// Organização automática
const now = new Date(2026, 10, 2, 12);
const state = () => ({
  settings: { kanbanColumns: [{ id: 'triagem' }, { id: 'prioridade' }] },
  configuration: { actionGroups: [{ name: 'Cível' }, { name: 'Previdenciário' }, { name: 'Trabalhista' }] },
  processes: [
    { id: 'p1', number: '0000000-00.2026.4.04.7105', opposingParty: 'INSS', responsible: 'Advogada Teste, Outro Teste', actionGroup: '' },
    { id: 'p2', number: '0000000-00.2026.8.21.0001', actionGroup: 'Cível' },
    { id: 'p3', number: '0000001-00.2026.8.21.0001', actionGroup: '' }
  ],
  intimations: [],
  tasks: [
    { id: 't-perto', status: 'triagem', deadline: '2026-11-04', process: '0000000-00.2026.4.04.7105' },
    { id: 't-atrasada', status: 'triagem', fatalDeadline: '2026-10-30', responsible: 'Pessoa Teste' },
    { id: 't-longe', status: 'triagem', deadline: '2026-12-20', responsible: 'Pessoa Teste' },
    { id: 't-andamento', status: 'andamento', deadline: '2026-11-03', responsible: 'Pessoa Teste' },
    { id: 't-concluida', status: 'concluida', deadline: '2026-11-03' },
    { id: 't-absorvida', status: 'triagem', deadline: '2026-11-03', absorbedInto: 't-perto' },
    { id: 't-sem-prazo', status: 'triagem' }
  ],
  audit: []
});

{
  const current = state();
  const before = JSON.stringify(current.tasks.map(task => [task.deadline, task.fatalDeadline]));
  const plan = planAutoOrganize({ state: current, members: [{ displayName: 'Titular Teste', status: 'active' }], now });
  const byId = Object.fromEntries(plan.taskChanges.map(change => [change.id, change]));
  assert.equal(byId['t-perto'].status, 'prioridade');
  assert.equal(byId['t-perto'].responsible, 'Advogada Teste', 'Herda o responsável do processo.');
  assert.equal(byId['t-atrasada'].status, 'prioridade');
  assert.equal(byId['t-longe'], undefined, 'Prazo distante fica onde está.');
  assert.equal(byId['t-andamento'], undefined, 'Tarefa já em andamento não é movida.');
  assert.equal(byId['t-concluida'], undefined);
  assert.equal(byId['t-absorvida'], undefined);
  assert.equal(byId['t-sem-prazo'].responsible, 'Titular Teste', 'Com um único membro, a tarefa é dele.');
  assert.equal(byId['t-sem-prazo'].status, undefined);
  assert.deepEqual(plan.processChanges, [{ id: 'p1', actionGroup: 'Previdenciário' }], 'Só preenche grupo vazio com evidência.');

  const outcome = applyAutoOrganize(current, plan, { nowIso: '2026-11-02T15:00:00.000Z' });
  assert.deepEqual(outcome, { prioritized: 2, assigned: 2, grouped: 1, total: 5 });
  assert.equal(JSON.stringify(current.tasks.map(task => [task.deadline, task.fatalDeadline])), before, 'Prazo nunca muda.');
  assert.equal(current.processes[0].actionGroupSource, 'atrium-ia');
  assert.equal(current.audit[0].actor, 'Atrium IA');

  // A pessoa devolveu a tarefa para a triagem e tirou o responsável: fica como ela deixou.
  const moved = current.tasks.find(task => task.id === 't-perto');
  moved.status = 'triagem';
  moved.responsible = '';
  const second = planAutoOrganize({ state: current, members: [{ displayName: 'Titular Teste', status: 'active' }], now });
  assert.equal(second.taskChanges.find(change => change.id === 't-perto'), undefined, 'Decisão humana posterior vence.');
  assert.equal(applyAutoOrganize(current, { taskChanges: [], processChanges: [] }).total, 0);
  assert.equal(current.audit.length, 1, 'Sem mudança, sem auditoria.');
}

{
  // Com mais de um membro, sem responsável no processo, não escolhe ninguém.
  const plan = planAutoOrganize({ state: state(), members: [{ displayName: 'A Teste' }, { displayName: 'B Teste' }], now });
  assert.equal(plan.taskChanges.find(change => change.id === 't-sem-prazo'), undefined);
}

{
  // Escritório sem a coluna Prioridade não ganha movimentação.
  const current = state();
  current.settings.kanbanColumns = [{ id: 'triagem' }, { id: 'feito' }];
  const plan = planAutoOrganize({ state: current, members: [], now });
  assert.equal(plan.taskChanges.some(change => change.status), false);
}

console.log('[PASS] Área por evidência e organização automática dentro dos limites.');
