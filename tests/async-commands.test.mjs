import assert from 'node:assert/strict';
import { createAsyncCommandRegistry, newAsyncCommandId, projectAsyncCommand } from '../lib/http/async-commands.mjs';

console.log('\n=== COMANDOS ASSÍNCRONOS (202 + idCommand) ===\n');

const settle = () => new Promise(resolve => setImmediate(resolve));

// Identidade: formato estável e sem colisão em sequência.
const firstId = newAsyncCommandId(1700000000000);
assert.match(firstId, /^cmd-[a-z0-9]+-[a-z0-9]+-[a-z0-9]{6}$/);
const ids = new Set(Array.from({ length: 200 }, () => newAsyncCommandId()));
assert.equal(ids.size, 200, 'IDs de comando não podem colidir.');
console.log('✓ IDs únicos e determinísticos no formato cmd-*.');

// Ciclo de vida: running -> done com o resultado real projetado.
let clock = 1_700_000_000_000;
const registry = createAsyncCommandRegistry({ ttlMs: 60_000, maxCommands: 2, now: () => clock });
const running = registry.start({ kind: 'teste', workspaceId: 'ws-1', run: async () => ({ records: 3 }) });
assert.equal(running.status, 'running');
assert.equal(running.phase, 'running');
assert.equal(projectAsyncCommand(running).status, 'running');
await settle();
const done = registry.get(running.id, 'ws-1');
assert.equal(done.status, 'done');
assert.equal(done.percent, 100);
assert.deepEqual(done.result, { records: 3 });
assert.ok(done.finishedAt);
console.log('✓ Comando conclui com o resultado real, sem sucesso fabricado.');

// Falha real: status error com a mensagem, nunca done.
const failing = registry.start({ kind: 'teste', workspaceId: 'ws-1', run: async () => { throw new Error('Falha sintética do comando.'); } });
await settle();
assert.equal(failing.status, 'error');
assert.equal(failing.error, 'Falha sintética do comando.');
assert.equal(failing.result, null);
console.log('✓ Falha do comando é registrada como erro real.');

// Escopo por workspace: comando de outro escritório não é visível.
assert.equal(registry.get(failing.id, 'ws-2'), null, 'Comando não pode vazar entre workspaces.');
assert.ok(registry.get(failing.id, 'ws-1'));
assert.ok(registry.get(failing.id), 'Consulta sem workspace enxerga o comando (uso interno).');
assert.equal(registry.get('cmd-inexistente', 'ws-1'), null);
console.log('✓ Consulta escopada por workspace e ausência devolve null.');

// TTL: comando concluído expira e é podado.
clock += 61_000;
assert.equal(registry.get(failing.id, 'ws-1'), null, 'Comando expirado não pode ser servido.');
console.log('✓ TTL remove comandos antigos.');

// Teto: o mais antigo é podado quando o limite é excedido.
const bounded = createAsyncCommandRegistry({ maxCommands: 2 });
const a = bounded.start({ kind: 'teste', run: async () => 'a' });
clock += 1;
const b = bounded.start({ kind: 'teste', run: async () => 'b' });
clock += 1;
const c = bounded.start({ kind: 'teste', run: async () => 'c' });
assert.equal(bounded.size(), 2, 'Teto de comandos respeitado.');
assert.equal(bounded.get(a.id), null, 'Comando mais antigo é podado primeiro.');
assert.ok(bounded.get(b.id) && bounded.get(c.id));
console.log('✓ Teto de comandos com poda do mais antigo.');

// Contrato: run obrigatório e projeção nunca inclui campos internos de tempo.
assert.throws(() => bounded.start({ kind: 'teste' }), /run é obrigatório/);
const projected = projectAsyncCommand(bounded.get(c.id));
assert.deepEqual(Object.keys(projected).sort(), ['error', 'finishedAt', 'id', 'kind', 'percent', 'phase', 'result', 'startedAt', 'status'].sort());
assert.equal(projectAsyncCommand(null), null);
console.log('✓ Projeção pública estável, sem campos internos.');

console.log('\n>>> COMANDOS ASSÍNCRONOS: PASS <<<\n');
