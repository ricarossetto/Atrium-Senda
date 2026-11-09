import assert from 'node:assert/strict';
import { assertMemberKindMatchesRole, registerOfficeRoles, roleById } from '../lib/office/role-catalog.mjs';

console.log('--- Iniciando Testes: papel próprio só vale no escritório dono ---');

registerOfficeRoles([{ id: 'role-sintetico', workspaceId: 'ws-a', name: 'Papel Teste', memberKinds: ['lawyer'], defaultPermissions: [] }]);
assert.ok(roleById('role-sintetico', 'ws-a'));
assert.equal(roleById('role-sintetico', 'ws-b'), null);
assert.equal(assertMemberKindMatchesRole('role-sintetico', 'lawyer', 'ws-a'), true);
assert.throws(() => assertMemberKindMatchesRole('role-sintetico', 'lawyer', 'ws-b'), error => error.statusCode === 400 && /Papel do escritório inválido/.test(error.message));
assert.equal(assertMemberKindMatchesRole('associate', 'lawyer', 'ws-b'), true, 'Papel de fábrica vale em qualquer escritório.');
registerOfficeRoles([]);

console.log('[PASS] Papel próprio restrito ao escritório dono.');
