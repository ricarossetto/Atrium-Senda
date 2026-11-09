import assert from 'node:assert/strict';
import { classifyLink, describeLinkSafety } from '../js/core/link-safety.js';

console.log('\n=== SEGURANÇA DE LINKS EXTERNOS (ANTI-PHISHING) ===\n');

// Domínios oficiais brasileiros: sem aviso.
for (const url of [
  'https://www.cnj.jus.br/',
  'https://pje.tjrs.jus.br/pje/',
  'https://www.planalto.gov.br/ccivil_03/leis/l9503compilado.htm',
  'https://www.gov.br/receitafederal/pt-br',
  'https://www12.senado.leg.br/',
  'https://www.mpf.mp.br/'
]) {
  const result = describeLinkSafety(url);
  assert.equal(result.kind, 'official', `${url} deve ser oficial.`);
  assert.equal(result.warn, false, `${url} não pode gerar aviso.`);
  assert.equal(result.label, '');
}
assert.equal(classifyLink('https://jus.br/').kind, 'official', 'O sufixo exato também é oficial.');
console.log('✓ jus.br, gov.br, leg.br e mp.br classificados como oficiais.');

// Domínio externo: aviso informativo.
const external = describeLinkSafety('https://portal-sintetico.example.test/comunicado');
assert.equal(external.kind, 'external');
assert.equal(external.warn, true);
assert.equal(external.label, 'Domínio externo');
assert.equal(external.host, 'portal-sintetico.example.test');
assert.match(external.reason, /fora dos endereços oficiais/);
console.log('✓ Domínio fora dos oficiais recebe aviso, sem bloquear.');

// Sinais de risco: http, IP, credenciais, punycode, porta não padrão.
const cases = [
  ['http://www.cnj.jus.br/', 'http'],
  ['https://192.168.0.10/processo', 'ip'],
  ['https://usuario:senha@portal.example.test/', 'credenciais'],
  ['https://xn--jus-br-8ya.example.test/', 'punycode'],
  ['https://portal.example.test:8443/', 'porta']
];
for (const [url, marker] of cases) {
  const result = describeLinkSafety(url);
  assert.equal(result.kind, 'unsafe', `${url} (${marker}) deve ser suspeito.`);
  assert.equal(result.warn, true);
  assert.equal(result.label, 'Link suspeito');
  assert.ok(result.reason.length > 10, 'Motivo deve ser explicado ao usuário.');
}
assert.equal(describeLinkSafety('https://[2001:db8::1]/').kind, 'unsafe', 'IPv6 literal é suspeito.');
console.log('✓ http, IP, credenciais, punycode e porta não padrão classificados como suspeitos.');

// Entradas vazias ou inválidas nunca quebram a renderização.
assert.equal(classifyLink('').kind, 'invalid');
assert.equal(classifyLink('   ').kind, 'invalid');
assert.equal(classifyLink('não é url').kind, 'invalid');
assert.equal(classifyLink('javascript:alert(1)').kind, 'unsafe', 'Esquema executável nunca é aceito como link comum.');
assert.equal(classifyLink('data:text/html,unsafe').kind, 'unsafe');
assert.equal(describeLinkSafety('').warn, false, 'Endereço inválido não gera aviso de link.');
console.log('✓ Entradas inválidas e esquemas executáveis tratados sem aviso falso.');

// Fronteira: domínio oficial com aparência enganosa continua externo/suspeito.
assert.equal(classifyLink('https://jus.br.evil.example.test/').kind, 'external', 'Sufixo falso não pode virar oficial.');
assert.equal(classifyLink('https://cnj.jus.br.example.test/').kind, 'external');
console.log('✓ Domínio que apenas imita o sufixo oficial permanece externo.');

console.log('\n>>> SEGURANÇA DE LINKS EXTERNOS: PASS <<<\n');
