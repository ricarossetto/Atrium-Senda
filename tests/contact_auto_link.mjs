import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  normalizeContactName,
  documentDigits,
  isGenericClientName,
  isClientRole,
  planContactAutoLinks,
  applyContactAutoLinks
} from '../lib/contacts/auto-link.mjs';
import { serverSourceText } from './server-source.mjs';

console.log('--- Iniciando Testes Unitários: Vínculo automático conservador de cliente ---');

const CNJ_A = '5001234-56.2026.8.21.0001';
const CNJ_B = '5009876-54.2026.8.21.0002';

function contact(overrides = {}) {
  return { id: 'contact-1', name: 'José da Silva', contactRole: 'cliente', document: '', ...overrides };
}

function processRecord(overrides = {}) {
  return { id: 'proc-1', number: CNJ_A, client: 'José da Silva', ...overrides };
}

// --- A) Identidade -------------------------------------------------------------------------
assert.equal(normalizeContactName('  JOSÉ   da Silva '), 'jose da silva');
assert.equal(documentDigits('123.456.789-01'), '12345678901');
assert.equal(isGenericClientName('SIGILO'), true);
assert.equal(isGenericClientName('Não informado'), true);
assert.equal(isGenericClientName('Cliente'), true);
assert.equal(isGenericClientName('José da Silva'), false);
assert.equal(isClientRole('adverso'), false);
assert.equal(isClientRole('parte contrária'), false);
assert.equal(isClientRole('cliente'), true);
assert.equal(isClientRole(''), true);
console.log('  OK: identidade normalizada e papéis (cliente x adverso) definidos.');

// --- B) Plano ------------------------------------------------------------------------------
{
  const plan = planContactAutoLinks({
    contacts: [contact({ name: 'José da Silva', document: '123.456.789-01' })],
    processes: [processRecord({ client: 'JOSE DA SILVA', clientDocument: '12345678901' })],
    intimations: []
  });
  assert.equal(plan.links.length, 1);
  assert.equal(plan.links[0].matchedBy, 'documento');
  assert.equal(plan.links[0].contactId, 'contact-1');
  assert.equal(plan.ambiguous.length, 0);
  console.log('  OK: documento idêntico vincula (mesmo sem o nome bater exatamente).');
}

{
  const plan = planContactAutoLinks({
    contacts: [contact({ name: 'José da Silva' })],
    processes: [processRecord({ client: 'JOSÉ  DA SILVA' })],
    intimations: [{ id: 'pub-1', client: 'José da Silva', process: CNJ_A }]
  });
  assert.equal(plan.links.length, 2, 'processo e publicação homônimos exatos vinculam');
  assert.equal(plan.links[0].matchedBy, 'nome');
  assert.equal(plan.links[1].id, 'pub-1');
  console.log('  OK: nome normalizado idêntico vincula processo e publicação.');
}

{
  const plan = planContactAutoLinks({
    contacts: [contact({ id: 'c1', name: 'Maria Souza' }), contact({ id: 'c2', name: 'MARIA SOUZA' })],
    processes: [processRecord({ client: 'Maria Souza' })]
  });
  assert.equal(plan.links.length, 0, 'homônimos nunca são vinculados automaticamente');
  assert.equal(plan.ambiguous.length, 1);
  assert.equal(plan.ambiguous[0].matchedBy, 'nome');
  assert.deepEqual(plan.ambiguous[0].candidates, ['c1', 'c2']);
  console.log('  OK: homônimos viram pendência de conferência (nunca vínculo).');
}

{
  const plan = planContactAutoLinks({
    contacts: [contact({ id: 'c1', document: '11122233344' }), contact({ id: 'c2', document: '111.222.333-44' })],
    processes: [processRecord({ client: 'Outro nome', clientDocument: '11122233344' })]
  });
  assert.equal(plan.links.length, 0);
  assert.equal(plan.ambiguous.length, 1);
  assert.equal(plan.ambiguous[0].matchedBy, 'documento');
  console.log('  OK: documento duplicado entre contatos é ambiguidade, não vínculo.');
}

{
  const plan = planContactAutoLinks({
    contacts: [contact({ name: 'SIGILO' })],
    processes: [processRecord({ client: 'SIGILO' })]
  });
  assert.equal(plan.links.length, 0);
  assert.equal(plan.skipped[0].reason, 'cliente-generico');
  console.log('  OK: nome genérico/sigiloso nunca vincula.');
}

{
  const plan = planContactAutoLinks({
    contacts: [contact({ id: 'adverso-1', name: 'Empresa Adversa', contactRole: 'adverso' })],
    processes: [processRecord({ client: 'Empresa Adversa' })]
  });
  assert.equal(plan.links.length, 0, 'contato adverso não é candidato a cliente');
  console.log('  OK: parte adversa nunca é vinculada como cliente.');
}

{
  const plan = planContactAutoLinks({
    contacts: [contact()],
    processes: [
      processRecord({ id: 'proc-ok', contactId: 'contact-1' }),
      processRecord({ id: 'proc-externo', contactId: 'contato-de-outro-workspace' }),
      processRecord({ id: 'proc-sem', client: 'Fulano Desconhecido' })
    ]
  });
  assert.equal(plan.links.length, 0);
  const reasons = plan.skipped.map(entry => `${entry.id}:${entry.reason}`).sort();
  assert.deepEqual(reasons, ['proc-externo:vinculo-externo', 'proc-ok:ja-vinculado', 'proc-sem:sem-candidato']);
  console.log('  OK: alvo já vinculado ou sem candidato único é preservado.');
}

// --- C) Aplicação --------------------------------------------------------------------------
{
  const state = {
    contacts: [contact({ name: 'José da Silva', document: '12345678901' })],
    processes: [
      processRecord({ id: 'proc-empty', client: '', number: CNJ_A, clientDocument: '12345678901' }),
      processRecord({ id: 'proc-mesmo', client: 'José da Silva', number: CNJ_B }),
      processRecord({ id: 'proc-outro', client: 'Outra Pessoa', number: CNJ_B })
    ],
    intimations: [],
    audit: []
  };
  const plan = planContactAutoLinks(state);
  const result = applyContactAutoLinks(state, plan, { actor: 'Teste', nowIso: '2026-09-28T12:00:00.000Z' });
  assert.equal(result.changed, true);
  assert.equal(result.linked, 2, 'preenche cliente vazio e confirma cliente já igual');
  const filled = state.processes.find(item => item.id === 'proc-empty');
  assert.equal(filled.contactId, 'contact-1');
  assert.equal(filled.client, 'José da Silva', 'cliente vazio é preenchido com o nome do contato');
  assert.equal(filled.autoLinkedBy, 'correspondência exata (documento)');
  const outro = state.processes.find(item => item.id === 'proc-outro');
  assert.equal(outro.contactId || '', '', 'cliente divergente nunca é sobrescrito');
  assert.equal(result.auditEntries.length, 2);
  assert.match(result.auditEntries[0].action, /Vínculo automático de cliente/);
  assert.equal(state.contacts.length, 1, 'nenhum contato é criado pelo vínculo');

  const again = applyContactAutoLinks(state, planContactAutoLinks(state), { actor: 'Teste' });
  assert.equal(again.changed, false, 'vínculo é idempotente');
  assert.equal(again.auditEntries.length, 0, 'reaplicação não duplica audit');
  console.log('  OK: aplicação preenche, preserva divergência, é idempotente e não cria contato.');
}

// --- D) Contrato de integração no servidor --------------------------------------------------
const serverSource = serverSourceText;
const persistSource = serverSource.slice(
  serverSource.indexOf('async function persistExternalCollectionsToCanonical'),
  serverSource.indexOf('async function waitForActiveEprocSync')
);
assert.match(persistSource, /planContactAutoLinks\(/, 'persistência oficial deve planejar o vínculo automático');
assert.match(persistSource, /applyContactAutoLinks\(/, 'persistência oficial deve aplicar o plano de vínculo');
assert.ok(
  persistSource.indexOf('mergeDuplicateIntimationsIntoState') < persistSource.indexOf('applyContactAutoLinks('),
  'o vínculo roda depois da fusão oficial de duplicatas'
);
assert.match(serverSource, /from '\.\/lib\/contacts\/auto-link\.mjs'/, 'servidor importa o módulo de vínculo');
console.log('  OK: servidor usa o módulo de vínculo no fluxo oficial.');

console.log('\n[PASS] Todos os cenários de vínculo automático conservador passaram.');
