import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accessAuditPage, financePortfolio, mergeScopedTerms, officeStats, orphanTeamAssignments, restoreProcessFinanceFields } from '../lib/office/office-insights.mjs';
import { mergeVisibleClientState } from '../lib/office/access-control.mjs';
import { serverSourceText } from './server-source.mjs';

console.log('--- Iniciando Testes: consultas do escritório e dívidas da frente ---');

// Auditoria de acesso paginada
const audit = [
  { action: 'Membro do escritório atualizado', at: '1' },
  { action: 'Tarefa concluída', at: '2' },
  { action: 'Equipe excluída', at: '3' },
  { action: 'Titularidade transferida', at: '4' }
];
const firstPage = accessAuditPage({ audit }, { page: 1, pageSize: 2 });
assert.equal(firstPage.total, 3, 'Só eventos de acesso.');
assert.equal(firstPage.totalPages, 2);
assert.equal(firstPage.events.length, 2);
assert.equal(accessAuditPage({ audit }, { page: 99, pageSize: 2 }).page, 2);
assert.equal(accessAuditPage({}, {}).total, 0);

// Higiene de equipes órfãs
assert.deepEqual(orphanTeamAssignments({ processes: [
  { id: 'p1', assignedTeamIds: ['t1', 't-apagada'] },
  { id: 'p2', assignedTeamIds: ['t1'] },
  { id: 'p3' }
] }, [{ id: 't1' }]), [{ processId: 'p1', teamIds: ['t-apagada'] }]);

// Carteira do sócio
const portfolio = financePortfolio({ processes: [
  { responsible: 'Advogada Teste, Outra Teste', feeType: 'fixo', feeAmount: 1000 },
  { responsible: 'Advogada Teste', feeType: 'mensal', feeMonthly: 200, requisitionAmount: 500 },
  { responsible: '', feeAmount: '50' },
  { responsible: 'Sem Valor Teste' }
] });
assert.equal(portfolio.rows[0].responsible, 'Advogada Teste');
assert.equal(portfolio.rows[0].fees, 1200);
assert.equal(portfolio.rows[0].requisitions, 500);
assert.equal(portfolio.rows[1].responsible, 'Sem responsável');
assert.deepEqual(portfolio.totals, { processes: 3, fees: 1250, requisitions: 500 });

// Contadores do painel
assert.deepEqual(officeStats({
  processes: [{ id: 'p' }],
  tasks: [
    { status: 'triagem', deadline: '2026-01-01' },
    { status: 'triagem', deadline: '2099-01-01' },
    { status: 'concluida', deadline: '2026-01-01' },
    { status: 'triagem', active: false },
    { status: 'triagem', absorbedInto: 'x' }
  ],
  intimations: [{ treatmentStatus: 'untreated' }, { treatmentStatus: 'treated' }, { mergedInto: 'a' }, {}]
}, { now: new Date('2026-06-01T12:00:00Z') }), { processes: 1, openTasks: 2, overdueTasks: 1, untreatedPublications: 2 });

// Financeiro aninhado no processo não grava sem permissão
{
  const processes = [{ id: 'p1', feeAmount: 999, client: 'Mudou Teste' }, { id: 'p2', feeStatus: 'pago' }];
  const outcome = restoreProcessFinanceFields(processes, [{ id: 'p1', feeAmount: 100, client: 'Cliente Teste' }, { id: 'p2' }]);
  assert.equal(outcome.changed, true);
  assert.equal(processes[0].feeAmount, 100);
  assert.equal(processes[0].client, 'Mudou Teste', 'O restante do processo continua editável.');
  assert.equal('feeStatus' in processes[1], false);
}

// Termos por escopo
{
  const current = [
    { id: 'office-1', scope: 'office', oabNumber: '111', oabUf: 'RS' },
    { id: 'meu', scope: 'private', privateOwnerUserId: 'u1', oabNumber: '222', oabUf: 'RS' },
    { id: 'dele', scope: 'private', privateOwnerUserId: 'u2', oabNumber: '333', oabUf: 'RS' }
  ];
  const mine = mergeScopedTerms(current, [{ oabNumber: '444', oabUf: 'rs', privateOwnerUserId: 'u2' }], { scope: 'private', ownerId: 'u1' });
  assert.ok(mine.some(term => term.id === 'dele'), 'Termo de outro membro não é tocado.');
  assert.ok(mine.some(term => term.id === 'office-1'));
  assert.ok(!mine.some(term => term.id === 'meu'), 'O termo fora da lista enviada sai.');
  const created = mine.find(term => term.oabNumber === '444');
  assert.equal(created.privateOwnerUserId, 'u1', 'O dono vem da sessão, não do corpo.');
  assert.equal(created.registration, 'OAB/RS 444');
  const office = mergeScopedTerms(current, [{ id: 'office-1', oabNumber: '111', oabUf: 'RS', active: false }], { scope: 'office' });
  assert.equal(office.find(term => term.id === 'office-1').active, false);
  assert.equal(office.filter(term => term.scope === 'private').length, 2);
  assert.throws(() => mergeScopedTerms(current, [{ oabNumber: '1', oabUf: 'RS' }], { scope: 'office' }), /número e a seccional/);
}

// Id repetido no mesmo lote do cliente não vira duas linhas
{
  const user = { id: 'u1', username: 'u1@example.test', permissions: ['office.manage'] };
  const merged = mergeVisibleClientState(
    { processes: [], tasks: [], intimations: [], communications: [], contacts: [], agenda: [], documents: [], leads: [], terms: [] },
    { processes: [{ id: 'p1' }, { id: 'p1' }], tasks: [{ id: 't1' }, { id: 't1' }], intimations: [], communications: [], contacts: [], agenda: [], documents: [], leads: [], terms: [] },
    user
  );
  assert.equal(merged.processes.length, 1);
  assert.equal(merged.tasks.length, 1);
}

// Contrato: toda auditoria financeira do cliente começa com o prefixo que o servidor reconhece
{
  const financial = readFileSync(new URL('../js/features/financial.js', import.meta.url), 'utf8');
  const server = serverSourceText;
  const narrative = new RegExp(server.match(/const FINANCE_AUDIT_NARRATIVE = \/(.+?)\/i;/)[1], 'i');
  const literals = [...financial.matchAll(/store\.audit\(([^,]+),/g)].flatMap(match => [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]));
  assert.ok(literals.length >= 3, 'O contrato precisa enxergar os textos.');
  for (const text of literals) assert.match(text, narrative, `Texto sem o prefixo do servidor: ${text}`);
}

console.log('[PASS] Consultas do escritório e dívidas da frente cobertas.');
