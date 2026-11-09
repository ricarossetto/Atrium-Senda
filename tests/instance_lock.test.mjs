import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startTestServer } from './helpers.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — TRAVA DE INSTÂNCIA ÚNICA POR DIRETÓRIO DE DADOS     ');
console.log('===============================================================\n');

// 1. Dois servidores no MESMO data dir: o segundo deve recusar iniciar.
const first = await startTestServer({});
try {
  let refused = false;
  let refusalOutput = '';
  try {
    const second = await startTestServer({ dataDirectory: first.dataDirectory });
    await second.stop();
  } catch (error) {
    refused = true;
    refusalOutput = String(error?.message || '');
  }
  assert.equal(refused, true, 'Segundo servidor no mesmo data dir deve recusar iniciar.');
  assert.match(refusalOutput, /já está em execução neste diretório de dados/, 'Recusa deve ser explícita no boot.');
} finally {
  await first.stop();
}

// 2. Após encerrar o primeiro, o lock é liberado e o mesmo data dir volta a subir.
const restarted = await startTestServer({ dataDirectory: first.dataDirectory });
try {
  const health = await (await fetch(`${restarted.baseUrl}/api/health`)).json();
  assert.equal(health.ok, true, 'Mesmo data dir deve iniciar normalmente após o lock ser liberado.');
} finally {
  await restarted.stop();
}

const raceDir = await mkdtemp(path.join(tmpdir(), 'atrium-lock-race-'));
const lockFile = path.join(tmpdir(), `atrium-instance-${createHash('sha256').update(path.resolve(raceDir)).digest('hex').slice(0, 16)}.lock`);
try {
  await writeFile(lockFile, '999999999');
  const [a, b] = await Promise.allSettled([
    startTestServer({ dataDirectory: raceDir }),
    startTestServer({ dataDirectory: raceDir })
  ]);
  const winners = [a, b].filter(result => result.status === 'fulfilled').map(result => result.value);
  try {
    assert.equal(winners.length, 1, `Dois candidatos a lock órfão não podem iniciar juntos: ${[a, b].map(result => result.status === 'rejected' ? String(result.reason) : 'READY').join(' | ')}`);
    const health = await (await fetch(`${winners[0].baseUrl}/api/health`)).json();
    assert.equal(health.ok, true, 'Vencedor deve permanecer saudável após o rival sair.');
  } finally {
    await Promise.all(winners.map(server => server.stop()));
  }
  await writeFile(lockFile, '999999999');
  await mkdir(`${lockFile}.takeover`);
  try {
    await assert.rejects(startTestServer({ dataDirectory: raceDir }), error => /EEXIST|takeover/.test(String(error)), 'Lock de recuperação já ocupado deve falhar fechado.');
  } finally {
    await rm(`${lockFile}.takeover`, { recursive: true, force: true });
  }
} finally {
  await rm(lockFile, { force: true });
  await rm(raceDir, { recursive: true, force: true });
}

console.log('PASS trava de instância única: segundo processo recusado, takeover serializado e lock liberado.');
