import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';
import { serverSourceText } from './server-source.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — API DO FUNIL SEMANAL DE PUBLICACOES                 ');
console.log('===============================================================\n');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASSWORD = 'Senha-Funil-Semanal-2026!';

console.log('[C1] Contrato estrutural do servidor...');
const serverSource = serverSourceText;
assert.match(serverSource, /url\.pathname === '\/api\/publications\/funnel-weekly'/, 'GET do funil semanal deve existir.');
assert.match(serverSource, /recordPublicationFunnelSnapshot\(\)/, 'Ciclo de sincronização deve registrar o snapshot.');
assert.match(serverSource, /const officeIntimations = \(envelope\?\.state\?\.intimations \|\| \[\]\)[\s\S]{0,200}computePublicationFunnelSnapshot\(\{ intimations: officeIntimations \}\)/, 'Snapshot deve ler o estado público oficial.');
assert.match(serverSource, /publication-funnel-weekly\.json/, 'Histórico durável por workspace.');
console.log('  ✓ Rota, hook de sincronização e persistência presentes.');

const server = await startTestServer({});
try {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin.funil.semanal',
    displayName: 'Administradora Funil Sintética',
    email: 'funil@example.test',
    workspaceName: 'Funil Teste',
    password: PASSWORD
  });
  const pending = await response.json();
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: pending.setupToken,
    code: generateTotp(pending.manualSecret)
  });
  const session = await response.json();
  const cookie = response.headers.get('set-cookie').split(';')[0];
  assert.ok(session.csrfToken);

  console.log('[C2] Fronteira de segurança e semana corrente calculada...');
  response = await fetch(`${server.baseUrl}/api/publications/funnel-weekly`);
  assert.equal(response.status, 401, 'GET sem sessão deve ser negado.');
  response = await fetch(`${server.baseUrl}/api/publications/funnel-weekly`, { headers: { Cookie: cookie } });
  const empty = await response.json();
  assert.equal(response.status, 200);
  assert.equal(empty.ok, true);
  assert.equal(empty.weeks.length, 1, 'Instalação vazia retorna apenas a semana corrente.');
  assert.match(empty.weeks[0].week, /^\d{4}-W\d{2}$/);
  assert.match(empty.weeks[0].weekStart, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(empty.weeks[0].weekEnd, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(
    { received: empty.current.received, treated: empty.current.treated, discarded: empty.current.discarded, pending: empty.current.pending },
    { received: 0, treated: 0, discarded: 0, pending: 0 },
    'Sem publicações, o funil não inventa números.'
  );
  console.log('  ✓ Sessão obrigatória e semana corrente zerada sem dados.');

  console.log('[C3] Histórico durável preservado e GET estritamente de leitura...');
  const funnelFile = path.join(server.dataDirectory, 'publication-funnel-weekly.json');
  const seeded = {
    version: 1,
    updatedAt: '2026-09-20T07:00:00.000Z',
    weeks: [
      {
        week: '2026-W37',
        weekStart: '2026-09-07',
        weekEnd: '2026-09-13',
        received: 12,
        treated: 9,
        discarded: 2,
        pending: 4,
        at: '2026-09-13T19:00:00.000Z'
      },
      {
        week: '2026-W99',
        weekStart: '2026-09-14',
        weekEnd: '2026-09-20',
        received: 999,
        treated: 999,
        discarded: 999,
        pending: 999,
        at: '2026-09-20T19:00:00.000Z'
      }
    ]
  };
  await writeFile(funnelFile, JSON.stringify(seeded, null, 2), 'utf8');
  const seededRaw = await readFile(funnelFile, 'utf8');
  response = await fetch(`${server.baseUrl}/api/publications/funnel-weekly`, { headers: { Cookie: cookie } });
  const withHistory = await response.json();
  assert.equal(response.status, 200);
  const week37 = withHistory.weeks.find(entry => entry.week === '2026-W37');
  assert.ok(week37, 'Semana histórica deve ser preservada.');
  assert.equal(week37.received, 12);
  assert.equal(week37.treated, 9);
  assert.equal(week37.discarded, 2);
  const currentWeek = withHistory.weeks.find(entry => entry.week === withHistory.current.week);
  assert.ok(currentWeek, 'Semana corrente deve estar presente na resposta.');
  assert.equal(currentWeek.received, 0, 'Semana corrente é sempre recalculada do estado consolidado.');
  assert.equal(currentWeek.pending, 0);
  const staleWeek = withHistory.weeks.find(entry => entry.week === '2026-W99');
  assert.equal(staleWeek, undefined, 'Semana fora do padrão ISO não vaza para a resposta.');
  assert.equal(await readFile(funnelFile, 'utf8'), seededRaw, 'GET não pode gravar o arquivo do histórico.');
  console.log('  ✓ Histórico preservado, semana corrente recalculada e GET sem escrita.');

  console.log('\n>>> API DO FUNIL SEMANAL: PASS <<<\n');
} finally {
  await server.stop();
}
