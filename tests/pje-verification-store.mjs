import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PjeVerificationStore, sanitizePjeEvidence, PJE_RUNTIME_STATUSES } from '../lib/judicial/pje/verification-store.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — EVIDÊNCIA DE VERIFICAÇÃO PJe POR RUNTIME/WORKSPACE ');
console.log('===============================================================\n');

const rootDir = await mkdtemp(path.join(tmpdir(), 'atrium-pje-verify-'));

try {
  console.log('[T1] Evidência é sanitizada e nunca guarda segredo...');
  const sanitized = sanitizePjeEvidence({
    sampleCount: 3.9,
    expedienteCount: 12,
    origins: ['https://pje.tjmt.jus.br/pje/Painel/x.seam?token=abc', 'https://pje.tjmt.jus.br/'],
    secret: 'NAO-PODE',
    cookie: 'session=NAO-PODE',
    note: 'login real com A1'
  });
  assert.equal(sanitized.sampleCount, 3);
  assert.equal(sanitized.expedienteCount, 12);
  assert.deepEqual(sanitized.origins, ['https://pje.tjmt.jus.br']);
  assert.ok(!('secret' in sanitized) && !('cookie' in sanitized));
  assert.equal(sanitized.note, 'login real com A1');
  console.log('  ✓ Somente contagens/origens/nota; query e segredos descartados.');

  console.log('[T2] Registro e leitura por portal, runtime e dimensão...');
  const store = new PjeVerificationStore({ rootDir });
  assert.equal(await store.isVerified('pje-tjmt-1g', 'server', 'auth'), false);
  await store.record('pje-tjmt-1g', 'server', 'auth', { sampleCount: 1, origins: ['https://pje.tjmt.jus.br/pje/Painel/novo?x=1'] });
  assert.equal(await store.isVerified('pje-tjmt-1g', 'server', 'auth'), true);
  assert.equal(await store.isVerified('pje-tjmt-1g', 'server', 'expedientes'), false, 'Login não pode marcar Expedientes.');
  assert.equal(await store.isVerified('pje-tjmt-1g', 'server', 'acervo'), false, 'Login não pode marcar Acervo.');
  await store.record('pje-tjmt-1g', 'server', 'expedientes', { expedienteCount: 7 });
  await store.record('pje-tjmt-1g', 'server', 'acervo', { acervoCount: 109 });
  const serverEvidence = await store.get('pje-tjmt-1g', 'server');
  assert.equal(serverEvidence.expedientes.evidence.expedienteCount, 7);
  assert.equal(serverEvidence.acervo.evidence.acervoCount, 109);
  console.log('  ✓ Dimensões auth/expedientes/acervo registradas separadamente.');

  console.log('[T3] Runtimes e workspaces não se misturam...');
  await store.record('pje-tjmt-1g', 'local_sidecar', 'auth', { sampleCount: 1 });
  const serverAuth = await store.get('pje-tjmt-1g', 'server');
  const sidecarAuth = await store.get('pje-tjmt-1g', 'local_sidecar');
  assert.equal(serverAuth.acervo.evidence.acervoCount, 109);
  assert.equal(sidecarAuth.expedientes, undefined, 'Evidência do server não pode vazar para o sidecar.');
  const otherWorkspace = new PjeVerificationStore({ rootDir: path.join(rootDir, 'outro-workspace') });
  assert.equal(await otherWorkspace.isVerified('pje-tjmt-1g', 'server', 'auth'), false);
  console.log('  ✓ Evidência isolada por runtime e por diretório do workspace.');

  console.log('[T4] Listagem filtra por runtime/dimensão...');
  const verified = await store.listVerified({ runtime: 'server', dimension: 'acervo' });
  assert.equal(verified.length, 1);
  assert.equal(verified[0].portalId, 'pje-tjmt-1g');
  assert.equal(verified[0].runtime, 'server');
  console.log('  ✓ listVerified devolve apenas evidências reais.');

  console.log('[T5] Dimensão/runtime inválidos falham fechado...');
  await assert.rejects(store.record('pje-tjmt-1g', 'server', 'ciencia', {}), /Dimensão de verificação PJe inválida/);
  await assert.rejects(store.record('pje-tjmt-1g', 'navegador', 'auth', {}), /Runtime PJe inválido/);
  assert.throws(() => new PjeVerificationStore({}), /rootDir/);
  console.log('  ✓ Nenhuma dimensão fora de auth/expedientes/acervo é aceita.');

  console.log('[T6] Status de runtime registrado de forma honesta...');
  await store.recordRuntimeStatus('pje-tjmt-1g', 'server', 'server_unverified', { reason: 'PJeOffice local ausente na VPS' });
  const runtimeStatus = await store.getRuntimeStatus('pje-tjmt-1g', 'server');
  assert.equal(runtimeStatus.status, 'server_unverified');
  assert.equal(runtimeStatus.reason, 'PJeOffice local ausente na VPS');
  await store.recordRuntimeStatus('pje-tjmt-1g', 'local_sidecar', 'verified', { reason: 'login live na máquina do escritório' });
  assert.equal((await store.getRuntimeStatus('pje-tjmt-1g', 'local_sidecar')).status, 'verified');
  await assert.rejects(store.recordRuntimeStatus('pje-tjmt-1g', 'server', 'otimo', {}), /Status de runtime PJe inválido/);
  assert.ok(PJE_RUNTIME_STATUSES.includes('degraded'));
  console.log('  ✓ verified/server_unverified/degraded/blocked auditáveis por runtime.');

  console.log('[T7] Arquivo persistido é JSON versionado e sem segredos...');
  const raw = await readFile(path.join(rootDir, 'pje', 'verification.json'), 'utf8');
  const parsed = JSON.parse(raw);
  assert.equal(parsed.version, 1);
  assert.ok(parsed.portals['pje-tjmt-1g'].server.auth.verifiedAt);
  assert.ok(!raw.includes('token=abc'));
  console.log('  ✓ Estado versionado e auditável.');

  console.log('\n>>> EVIDÊNCIA DE VERIFICAÇÃO PJe F0: PASS <<<\n');
} finally {
  await rm(rootDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
