import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { auditOutput } from '../scripts/build-cloud-frontend.mjs';

console.log('\n=== BUILD CLOUD FRONTEND: REJEIÇÃO DE SYMLINKS NO DIST ===\n');

const directory = await mkdtemp(path.join(os.tmpdir(), 'atrium-dist-symlink-'));

try {
  await mkdir(path.join(directory, 'js'), { recursive: true });
  await writeFile(path.join(directory, 'js', 'portal.js'), '// sintético\n', 'utf8');

  let linkCreated = false;
  try {
    await symlink(path.join(directory, 'js', 'portal.js'), path.join(directory, 'js', 'alias.js'));
    linkCreated = true;
  } catch (error) {
    if (!['EPERM', 'EACCES', 'UNKNOWN'].includes(error?.code)) throw error;
  }

  if (!linkCreated) {
    console.log('! Criação de symlink indisponível nesta sessão do Windows; cenário declarado como pendente.');
  } else {
    await assert.rejects(
      () => auditOutput(directory),
      error => /Symlink não permitido no artefato/.test(String(error?.message || '')),
      'A auditoria do dist deve rejeitar symlinks mesmo sob prefixo permitido.'
    );
    console.log('✓ Symlink sob js/ rejeitado pela auditoria do artefato.');
  }
  console.log('\n>>> BUILD CLOUD FRONTEND SYMLINK: PASS <<<\n');
} finally {
  await rm(directory, { recursive: true, force: true }).catch(() => {});
}
