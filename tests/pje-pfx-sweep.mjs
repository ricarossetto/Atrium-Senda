import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { sweepStaleModernizedPfx } from '../lib/judicial/a1-sandbox.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — SWEEP DE PFX MODERNIZADO TEMPORÁRIO (A1 SANDBOX)   ');
console.log('===============================================================\n');

const HOUR_MS = 60 * 60 * 1000;
const tempDir = await mkdtemp(path.join(tmpdir(), 'atrium-pfx-sweep-test-'));

try {
  console.log('[T1] PFX antigo é removido e arquivos recentes/não relacionados permanecem...');
  const stalePath = path.join(tempDir, 'atrium-modern-stale.pfx');
  const freshPath = path.join(tempDir, 'atrium-modern-fresh.pfx');
  const unrelatedPath = path.join(tempDir, 'atrium-a1-unrelated.pem');
  await writeFile(stalePath, 'synthetic-stale-pfx');
  await writeFile(freshPath, 'synthetic-fresh-pfx');
  await writeFile(unrelatedPath, 'synthetic-unrelated');
  const oldDate = new Date(Date.now() - 2 * HOUR_MS);
  await utimes(stalePath, oldDate, oldDate);

  const summary = await sweepStaleModernizedPfx({ tmpRoot: tempDir, maxAgeMs: HOUR_MS });

  const remaining = await readdir(tempDir);
  assert.ok(!remaining.includes('atrium-modern-stale.pfx'), 'PFX temporário antigo deve ser removido.');
  assert.ok(remaining.includes('atrium-modern-fresh.pfx'), 'PFX temporário recente deve permanecer.');
  assert.ok(remaining.includes('atrium-a1-unrelated.pem'), 'Arquivo não relacionado deve permanecer.');
  assert.equal(summary.removed, 1);
  console.log('  ✓ TTL de 1h remove apenas o PFX antigo dentro do padrão atrium-modern-*.pfx.');

  console.log('[T2] Falha ao remover um item não lança e não interrompe o sweep...');
  const lockedPath = path.join(tempDir, 'atrium-modern-locked.pfx');
  await mkdir(lockedPath);
  await utimes(lockedPath, oldDate, oldDate);
  const lockedSummary = await sweepStaleModernizedPfx({ tmpRoot: tempDir, maxAgeMs: HOUR_MS });
  assert.equal(lockedSummary.removed, 0);
  assert.ok((await readdir(tempDir)).includes('atrium-modern-locked.pfx'));
  console.log('  ✓ Item não removível é ignorado silenciosamente, sem lançar.');

  console.log('[T3] Diretório temporário inexistente não lança...');
  const missingSummary = await sweepStaleModernizedPfx({
    tmpRoot: path.join(tempDir, 'does-not-exist'),
    maxAgeMs: HOUR_MS
  });
  assert.deepEqual(missingSummary, { scanned: 0, removed: 0 });
  console.log('  ✓ Sweep degrada para resumo vazio quando o tmpRoot não existe.');

  console.log('\n>>> SWEEP PFX A1: PASS <<<\n');
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
