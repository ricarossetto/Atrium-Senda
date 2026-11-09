import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';

// E-1c pelo caminho HTTP: o flush de estado (`POST /api/state`) só altera
// `officeExpenses`/`financialEntries` para quem tem `finance.write` ou
// `office.manage`. Quem apenas lê continua vendo o lançamento, mas a versão
// oficial prevalece por inteiro — inclusive no modo `shadow`, que não aplica
// o filtro de leitura do escritório.
// Fixtures estritamente sintéticas: Advogada Teste, Cliente Teste, CNJ 5021000-*.

const PRINCIPAL_PASSWORD = 'Senha-Titular-Financeiro-2026!';
const ASSOCIATE_PASSWORD = 'Senha-Associada-Financeiro-2026!';
const FINANCE_PASSWORD = 'Senha-Financeiro-Financeiro-2026!';
const PROC_NUMBER = '5021000-09.2026.8.21.0001';

console.log('\n===============================================================');
console.log('  ATRIUM — GRAVAÇÃO FINANCEIRA EXIGE finance.write              ');
console.log('===============================================================\n');

const dataDirectory = await mkdtemp(path.join(tmpdir(), 'tmp-e1c-finance-write-'));
const server = await startTestServer({ dataDirectory });
const auth = (cookie, csrf) => ({ Cookie: cookie, 'X-CSRF-Token': csrf, Accept: 'application/json' });
const jsonHeaders = (cookie, csrf) => ({ ...auth(cookie, csrf), 'Content-Type': 'application/json' });
const readState = async headers => (await fetch(`${server.baseUrl}/api/state`, { headers })).json();
const flush = async (headers, revision, state) => {
  const response = await fetch(`${server.baseUrl}/api/state`, {
    method: 'POST',
    headers: jsonHeaders(headers.cookie, headers.csrf),
    body: JSON.stringify({ revision, state })
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

async function loginWithTotp({ username, password, manualSecret, setupToken }) {
  let response = await postJson(`${server.baseUrl}/api/auth/register/verify`, { setupToken, code: generateTotp(manualSecret) });
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  response = await postJson(`${server.baseUrl}/api/auth/login`, { username, password, code: generateTotp(manualSecret) });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return { cookie: response.headers.get('set-cookie').split(';')[0], csrf: body.csrfToken, id: body.user?.id };
}

async function joinAs(principal, { username, displayName, email, password, officeRoleId }) {
  let response = await postJson(`${server.baseUrl}/api/auth/invitations`, { displayName, email, officeRoleId, sendEmail: false }, auth(principal.cookie, principal.csrf));
  const invited = await response.json();
  assert.equal(response.status, 201, JSON.stringify(invited));
  response = await postJson(`${server.baseUrl}/api/auth/invitations/accept`, { inviteToken: invited.inviteToken, username, password });
  const accepted = await response.json();
  assert.equal(response.status, 200, JSON.stringify(accepted));
  return loginWithTotp({ username, password, manualSecret: accepted.manualSecret, setupToken: accepted.setupToken });
}

try {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'titular_financeiro',
    displayName: 'Advogada Teste Titular',
    email: 'teste@example.test',
    oab: 'OAB/RS 000000',
    oabUf: 'RS',
    password: PRINCIPAL_PASSWORD,
    workspaceName: 'Escritório Teste Financeiro'
  });
  const setup = await response.json();
  assert.equal(response.status, 200, JSON.stringify(setup));
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, { setupToken: setup.setupToken, code: generateTotp(setup.manualSecret) });
  const verified = await response.json();
  assert.equal(response.status, 200, JSON.stringify(verified));
  const principal = { cookie: response.headers.get('set-cookie').split(';')[0], csrf: verified.csrfToken, id: verified.user?.id };

  const associate = await joinAs(principal, {
    username: 'associada_financeiro',
    displayName: 'Advogada Teste Associada',
    email: 'associada.financeiro@example.test',
    password: ASSOCIATE_PASSWORD,
    officeRoleId: 'associate'
  });
  const finance = await joinAs(principal, {
    username: 'financeiro_financeiro',
    displayName: 'Advogada Teste Financeiro',
    email: 'financeiro.financeiro@example.test',
    password: FINANCE_PASSWORD,
    officeRoleId: 'finance'
  });
  assert.ok(associate.id && finance.id, 'membros sintéticos devem existir');

  // Estado oficial: um processo da associada e um lançamento de escritório vinculado.
  const envelope = await readState(auth(principal.cookie, principal.csrf));
  const officialEntry = {
    id: 'fin-official-e1c',
    description: 'Despesa sintética oficial',
    amount: 300,
    status: 'pendente',
    date: '2026-10-01',
    processId: 'proc-finance-e1c',
    createdAt: new Date().toISOString()
  };
  const baseState = {
    ...(envelope.state || {}),
    processes: [{
      id: 'proc-finance-e1c',
      number: PROC_NUMBER,
      client: 'Cliente Teste',
      scope: 'office',
      assignmentStatus: 'assigned',
      responsibleUserIds: [associate.id],
      assignedTeamIds: [],
      accessGrants: []
    }],
    officeExpenses: [officialEntry],
    financialEntries: [{ ...officialEntry, id: 'fin-official-e1c-2' }]
  };
  let saved = await flush(principal, envelope.revision, baseState);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));

  // 1. Quem não grava continua vendo o lançamento do processo que lhe pertence.
  const associateView = await readState(auth(associate.cookie, associate.csrf));
  assert.equal(
    (associateView.state.officeExpenses || []).some(entry => entry.id === 'fin-official-e1c'),
    true,
    'a visibilidade do leitor não regrediu'
  );

  // 2. Alteração pelo flush de quem não tem finance.write: versão oficial prevalece.
  const tampered = {
    ...associateView.state,
    officeExpenses: [
      { ...officialEntry, amount: 9999, description: 'Alterado pelo leitor' },
      { id: 'fin-planted-e1c', description: 'Lançamento plantado', amount: 1, processId: 'proc-finance-e1c' }
    ],
    financialEntries: [
      { ...officialEntry, id: 'fin-official-e1c-2', amount: 8888 }
    ],
    // Cliente antigo registrava a auditoria antes do flush: essa é a entrada fantasma.
    audit: [
      { id: 'audit-phantom-e1c', at: new Date().toISOString(), action: 'Lançamento financeiro atualizado', detail: 'Fantasma sintético', actor: 'Advogada Teste Associada' },
      ...(Array.isArray(associateView.state?.audit) ? associateView.state.audit : [])
    ]
  };
  saved = await flush(associate, associateView.revision, tampered);
  assert.equal(saved.status, 200, 'o flush do leitor não é recusado; apenas não grava o financeiro');
  assert.deepEqual(
    [...(saved.body.discardedCollections || [])].sort(),
    ['financialEntries', 'officeExpenses'],
    'o servidor anuncia as duas coleções financeiras descartadas para o leitor'
  );

  const afterReader = await readState(auth(principal.cookie, principal.csrf));
  const officialAfter = (afterReader.state.officeExpenses || []).find(entry => entry.id === 'fin-official-e1c');
  assert.equal(officialAfter?.amount, 300, 'valor oficial prevalece sobre a edição do leitor');
  assert.equal(officialAfter?.description, 'Despesa sintética oficial');
  assert.equal(
    (afterReader.state.officeExpenses || []).some(entry => entry.id === 'fin-planted-e1c'),
    false,
    'o leitor não planta lançamento pelo flush'
  );
  assert.equal(
    (afterReader.state.financialEntries || []).find(entry => entry.id === 'fin-official-e1c-2')?.amount,
    300,
    'a regra vale também para financialEntries'
  );
  assert.equal(
    (afterReader.state.audit || []).some(entry => /^Lançamento financeiro/.test(String(entry?.action || ''))),
    false,
    'alteração financeira descartada não deixa entrada de auditoria'
  );

  // 3. Leitor que reenvia o próprio estado visível sem mexer no financeiro não recebe
  // anúncio nenhum: flush legítimo não vira ruído.
  const associateCleanView = await readState(auth(associate.cookie, associate.csrf));
  saved = await flush(associate, associateCleanView.revision, associateCleanView.state);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(
    Object.prototype.hasOwnProperty.call(saved.body, 'discardedCollections'),
    false,
    'flush do leitor sem divergência financeira não anuncia descarte'
  );

  // 4. Quem tem finance.write grava pelo mesmo caminho.
  const financeView = await readState(auth(finance.cookie, finance.csrf));
  saved = await flush(finance, financeView.revision, {
    ...financeView.state,
    officeExpenses: (financeView.state.officeExpenses || [])
      .map(entry => (entry.id === 'fin-official-e1c' ? { ...entry, amount: 450 } : entry))
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(
    Object.prototype.hasOwnProperty.call(saved.body, 'discardedCollections'),
    false,
    'flush de quem tem finance.write não anuncia descarte'
  );
  const afterWriter = await readState(auth(principal.cookie, principal.csrf));
  assert.equal(
    (afterWriter.state.officeExpenses || []).find(entry => entry.id === 'fin-official-e1c')?.amount,
    450,
    'finance.write grava pelo flush'
  );

  console.log('  OK: leitor vê e não grava; finance.write grava; versão oficial prevalece no flush.');
  console.log('\n[PASS] Gravação financeira exige finance.write.');
} finally {
  await server.stop();
  await rm(dataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
}
process.exit(0);
