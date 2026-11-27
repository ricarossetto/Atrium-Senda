/** A causa do PJE-ERROR vai para o registro do servidor sem dado pessoal nem query de URL. */
import assert from 'node:assert/strict';
import { sanitizePjeErrorForLog } from '../lib/judicial/pje/sync/pje-sync-service.mjs';

const message = 'Falha ao abrir https://pje.trt4.jus.br/primeirograu/login.seam?token=abc&cpf=00000000000 para teste@example.test no processo 0000000-00.2026.5.04.0000';
const clean = sanitizePjeErrorForLog(new Error(message));
assert.equal(clean, 'Falha ao abrir https://pje.trt4.jus.br/primeirograu/login.seam?… para [e-mail] no processo [número]');
assert.equal(sanitizePjeErrorForLog(null), 'sem mensagem');
assert.equal(sanitizePjeErrorForLog('x'.repeat(500)).length, 240);
assert.equal(sanitizePjeErrorForLog('Target page, context or browser has been closed'), 'Target page, context or browser has been closed');
console.log('ok - sanitizePjeErrorForLog');
