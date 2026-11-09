import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

console.log('\n===============================================================');
console.log('  ATRIUM — UI PJe: RÓTULOS HUMANOS E FEEDBACK DE SYNC          ');
console.log('===============================================================\n');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(ROOT, 'js/features/judicial-integrations.js'), 'utf8');

assert.match(source, /const pjeFamilyLabels = \{/, 'mapa de famílias deve existir');
assert.match(source, /const pjeRuntimeLabels = \{/, 'mapa de runtimes deve existir');
assert.match(source, /const pjeJobStatusLabels = \{/, 'mapa de status de job deve existir');
assert.match(source, /const pjeErrorMessages = \{/, 'mapa de mensagens amigáveis deve existir');

for (const code of ['AUTH-TOTP-REQUIRED', 'AUTH-HELPER-REQUIRED', 'AUTH-HELPER-REJECTED', 'AUTH-MANUAL-REQUIRED', 'PROCESS_RESTARTED', 'PJE-RUNTIME-UNAVAILABLE']) {
  assert.ok(source.includes(`'${code}'`), `mensagens amigáveis devem cobrir ${code}`);
}

assert.match(source, /pjeJobStatusLabels\[last\.status\]/, 'card deve traduzir o status técnico do job');
assert.match(source, /pjeErrorText\(last\.errorCode\)/, 'card deve mostrar mensagem amigável do erro');
assert.match(source, /data-role="pje-status"/, 'card deve ter célula de status atualizável');
assert.match(source, /cardStatus\.textContent = 'Sincronizando/, 'sincronização deve atualizar o card imediatamente');
assert.doesNotMatch(source, /'Erro: ' \+ escapeHtml\(last\.errorCode\)/, 'código técnico não pode ser a mensagem principal');
assert.doesNotMatch(source, /'runtime ' \+ escapeHtml\(portal\.runtimePreference/, 'runtime técnico não pode aparecer cru');
assert.match(source, /pjeErrorText\(job\.errorCode\)/, 'toast de erro deve usar a mensagem amigável');

console.log('  ✓ Maps PT-BR presentes; card e toast sem código técnico cru; feedback imediato de sync ativo.');

console.log('\n>>> UI PJe RÓTULOS: PASS <<<\n');
