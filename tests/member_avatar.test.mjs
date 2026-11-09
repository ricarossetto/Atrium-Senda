import assert from 'node:assert/strict';
import { isAvatarDataUrl, memberInitials, memberAvatarHtml } from '../js/core/member-avatar.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

console.log('\n===============================================================');
console.log('  ATRIUM — AVATAR DE INTEGRANTE (HELPER CANÔNICO)');
console.log('===============================================================\n');

assert.equal(isAvatarDataUrl(PNG), true);
assert.equal(isAvatarDataUrl('data:image/webp;base64,AAAA'), true);
assert.equal(isAvatarDataUrl('https://example.test/foto.png'), false, 'Somente data URL de imagem entra.');
assert.equal(isAvatarDataUrl('data:text/html;base64,AAAA'), false);
assert.equal(isAvatarDataUrl('data:image/svg+xml;base64,AAAA'), false);
assert.equal(isAvatarDataUrl(''), false);
assert.equal(isAvatarDataUrl('x'.repeat(700001)), false, 'Acima do teto do cofre não entra.');

assert.equal(memberInitials('Ricardo Teste'), 'RR');
assert.equal(memberInitials('  advogada   teste  '), 'AT');
assert.equal(memberInitials('Advogada'), 'A');
assert.equal(memberInitials(''), '?');

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const withPhoto = memberAvatarHtml({ displayName: 'Ricardo Teste', avatar: PNG }, escapeHtml);
assert.match(withPhoto, /class="member-avatar"/);
assert.match(withPhoto, /class="member-avatar-image"/);
assert.ok(withPhoto.includes(PNG), 'A foto do integrante entra no markup.');
const withoutPhoto = memberAvatarHtml({ displayName: 'Ricardo Teste' }, escapeHtml);
assert.match(withoutPhoto, />RR</);
assert.equal(withoutPhoto.includes('<img'), false, 'Sem foto, mantém iniciais.');
const hostile = memberAvatarHtml({ displayName: '<b>X</b>', avatar: 'data:text/html;base64,AAAA' }, escapeHtml);
assert.equal(hostile.includes('<img'), false, 'Avatar inválido não vira imagem.');
assert.equal(hostile.includes('<b>'), false, 'HTML do nome não entra cru.');
assert.ok(hostile.includes('&lt;'), 'Inicial do nome hostil é escapada.');

console.log('✓ Avatar de integrante: valida foto, rejeita esquema estranho, mantém iniciais e escapa o nome.');
