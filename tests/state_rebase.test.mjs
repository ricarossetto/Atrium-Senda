import assert from 'node:assert/strict';
import { rebaseClientState } from '../js/core/state-rebase.js';

console.log('--- Iniciando Testes: salvamento recusado reaplica a alteração local ---');

const base = {
  revision: 'r1',
  settings: { officeSlogan: 'Base', theme: 'light' },
  tasks: [{ id: 't1', title: 'Tarefa Teste', status: 'triagem' }, { id: 't2', title: 'Outra Teste', status: 'triagem' }],
  processes: [{ id: 'p1', client: 'Cliente Teste', stage: 'inicial' }],
  intimations: [{ id: 'i1', treatmentStatus: 'untreated' }]
};
const clone = value => structuredClone(value);

{
  // A varredura grava um processo e uma publicação; o usuário criou uma tarefa.
  const mine = clone(base);
  mine.tasks.unshift({ id: 't-nova', title: 'Criada na tela', status: 'triagem' });
  const theirs = clone(base);
  theirs.revision = 'r2';
  theirs.processes[0].client = 'Cliente Enriquecido Teste';
  theirs.intimations.unshift({ id: 'i2', treatmentStatus: 'untreated' });
  const { state, conflicts } = rebaseClientState({ base, mine, theirs });
  assert.deepEqual(conflicts, []);
  assert.equal(state.tasks[0].id, 't-nova', 'A tarefa criada na tela não pode ser perdida.');
  assert.equal(state.processes[0].client, 'Cliente Enriquecido Teste', 'O dado novo do servidor entra.');
  assert.equal(state.intimations.length, 2, 'A publicação nova do servidor entra.');
  assert.equal(state.revision, 'r2', 'Revisão vem do servidor.');
}

{
  // Campos diferentes do mesmo registro convivem.
  const mine = clone(base);
  mine.processes[0].stage = 'recurso';
  const theirs = clone(base);
  theirs.processes[0].client = 'Cliente Novo Teste';
  const { state, conflicts } = rebaseClientState({ base, mine, theirs });
  assert.deepEqual(conflicts, []);
  assert.deepEqual(state.processes[0], { id: 'p1', client: 'Cliente Novo Teste', stage: 'recurso' });
}

{
  // Mesmo campo com valores diferentes é conflito real, nunca sobrescrita silenciosa.
  const mine = clone(base);
  mine.settings.officeSlogan = 'Local';
  const theirs = clone(base);
  theirs.settings.officeSlogan = 'Outra tela';
  const { conflicts } = rebaseClientState({ base, mine, theirs });
  assert.deepEqual(conflicts, ['/settings/officeSlogan']);
}

{
  // Mesmo valor dos dois lados não é conflito.
  const mine = clone(base);
  mine.tasks[0].status = 'concluida';
  const theirs = clone(base);
  theirs.tasks[0].status = 'concluida';
  assert.deepEqual(rebaseClientState({ base, mine, theirs }).conflicts, []);
}

{
  // Remoção local vale; removido aqui e alterado no servidor, o servidor fica.
  const mine = clone(base);
  mine.tasks = mine.tasks.filter(task => task.id !== 't2');
  const theirsUntouched = clone(base);
  assert.equal(rebaseClientState({ base, mine, theirs: theirsUntouched }).state.tasks.length, 1);
  const theirsChanged = clone(base);
  theirsChanged.tasks[1].status = 'em-andamento';
  const kept = rebaseClientState({ base, mine, theirs: theirsChanged }).state.tasks;
  assert.equal(kept.find(task => task.id === 't2').status, 'em-andamento');
}

{
  // Sem alteração local, o resultado é exatamente o estado do servidor.
  const theirs = clone(base);
  theirs.tasks.push({ id: 't3', title: 'Do servidor', status: 'triagem' });
  assert.deepEqual(rebaseClientState({ base, mine: clone(base), theirs }).state, theirs);
}

console.log('[PASS] Salvamento recusado preserva a alteração local e não esconde conflito real.');
