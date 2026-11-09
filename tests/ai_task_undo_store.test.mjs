import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createAiTaskUndoStore } from '../lib/ai/ai-task-undo-store.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM - COFRE DE DESFAZER DA TAREFA DA SUGESTÃO           ');
console.log('===============================================================\n');

const directory = await mkdtemp(path.join(os.tmpdir(), 'atrium-ai-undo-store-'));
const file = path.join(directory, 'ai-task-undo.json');
try {
  const storeA = createAiTaskUndoStore({ file });
  const storeB = createAiTaskUndoStore({ file });
  await Promise.all(Array.from({ length: 20 }, (_, index) => (index % 2 ? storeA : storeB).set(`task-${index}`, {
    publicationId: `pub-${index}`,
    createdBy: 'usuario.teste',
    createdAt: new Date(2026, 9, 30, 12, 0, index).toISOString()
  })));
  const found = await Promise.all(Array.from({ length: 20 }, (_, index) => (index % 2 ? storeB : storeA).get(`task-${index}`)));
  assert.equal(found.filter(Boolean).length, 20, 'Gravações concorrentes não podem perder registros, mesmo com instâncias distintas.');
  assert.equal((await storeA.get('task-7')).publicationId, 'pub-7');

  assert.equal(await storeA.remove('task-7'), true);
  assert.equal(await storeB.get('task-7'), null);
  assert.equal(await storeA.remove('task-7'), false);

  const secureFile = path.join(directory, 'ai-task-undo-secure.json');
  const secure = createAiTaskUndoStore({
    file: secureFile,
    encrypt: value => ({ cipher: Buffer.from(String(value), 'utf8').toString('base64') }),
    decrypt: payload => Buffer.from(String(payload.cipher || ''), 'base64').toString('utf8')
  });
  await secure.set('task-secure', {
    publicationId: 'pub-secure',
    createdBy: 'usuario.sigiloso',
    createdAt: '2026-10-30T12:00:00.000Z'
  });
  const secureRaw = await readFile(secureFile, 'utf8');
  assert.equal(secureRaw.includes('usuario.sigiloso'), false, 'O conteúdo do registro não pode ficar em texto puro.');
  assert.equal((await secure.get('task-secure')).createdBy, 'usuario.sigiloso');

  const legacyFile = path.join(directory, 'ai-task-undo-legacy.json');
  await writeFile(legacyFile, JSON.stringify({
    version: 1,
    entries: { 'task-legacy': { taskId: 'task-legacy', createdAt: '2026-10-01T00:00:00.000Z', createdBy: 'usuario.legado', publicationId: 'pub-legacy' } }
  }), 'utf8');
  const sealer = createAiTaskUndoStore({
    file: legacyFile,
    encrypt: value => ({ cipher: Buffer.from(String(value), 'utf8').toString('base64') }),
    decrypt: payload => Buffer.from(String(payload.cipher || ''), 'base64').toString('utf8')
  });
  await sealer.set('task-nova', { createdBy: 'usuario.nova', createdAt: '2026-10-30T00:00:00.000Z' });
  const sealedRaw = await readFile(legacyFile, 'utf8');
  assert.equal(sealedRaw.includes('usuario.legado'), false, 'A primeira escrita sela a entrada legada em texto puro.');
  assert.equal((await sealer.get('task-legacy')).createdBy, 'usuario.legado', 'A entrada selada continua legível pelo dono.');

  await writeFile(file, '{ registro quebrado', 'utf8');
  await assert.rejects(() => storeA.get('task-1'), /JSON|Unexpected|Registro/i, 'Arquivo corrompido não pode virar silenciosamente um cofre vazio.');

  console.log('V Gravação concorrente entre instâncias, criptografia, selo do legado, remoção e corrupção explícita.');
  console.log('\n>>> COFRE DE DESFAZER: PASS <<<\n');
} finally {
  await rm(directory, { recursive: true, force: true }).catch(() => {});
}
