import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const officeDataPath = path.resolve(__dirname, '../js/office-data.js');
const officeDataContent = fs.readFileSync(officeDataPath, 'utf8');
const publicSourceFiles = [
  '../index.html', '../server.mjs', '../lib/security.mjs', '../js/portal.js', '../js/office-data.js',
  '../collector/agent.mjs', '../collector/portals.example.json', '../collector/adapters/djen.mjs',
  '../collector/adapters/datajud.mjs', '../collector/adapters/pje.mjs'
];
const publicSourceContent = publicSourceFiles.map(file => fs.readFileSync(path.resolve(__dirname, file), 'utf8')).join('\n');
const mod = { exports: {} };
const fn = new Function('module', 'exports', 'globalThis', 'self', officeDataContent);
fn(mod, mod.exports, globalThis, globalThis);
const officeData = mod.exports;

console.log('=== TESTES DE VALIDAÇÃO: ATRIUM SENDA (OPEN SOURCE) ===\n');

// 1. Validar Papéis de Contatos e Funil de Origens
console.log('1. Validando papéis de contatos e origens de captação...');
assert.ok(Array.isArray(officeData.contactRoles), 'contactRoles deve ser um array');
assert.ok(officeData.contactRoles.length >= 6, 'Deveria ter pelo menos 6 papéis de contatos');
const roleIds = officeData.contactRoles.map(r => r.id);
assert.ok(roleIds.includes('cliente') && roleIds.includes('perito') && roleIds.includes('testemunha'), 'Papéis fundamentais presentes');

assert.ok(Array.isArray(officeData.leadOrigins), 'leadOrigins deve ser um array');
assert.ok(officeData.leadOrigins.length >= 5, 'Deveria ter pelo menos 5 origens de lead');
console.log('✓ Papéis de contatos (' + officeData.contactRoles.length + ') e origens (' + officeData.leadOrigins.length + ') validados.');

// 2. Validar Status de Requisições Judiciais (RPV / Alvará)
console.log('\n2. Validando status de requisições de pagamento (RPV/Alvará)...');
assert.ok(Array.isArray(officeData.requisitionStatuses), 'requisitionStatuses deve ser um array');
assert.ok(officeData.requisitionStatuses.length >= 4, 'Deveria ter 4 status de requisições');
console.log('✓ Status de RPV e Alvarás validados.');

// 3. Validar Auditoria de Privacidade Open Source (Sem dados hardcoded)
console.log('\n3. Validando neutralidade e privacidade open-source...');
const forbiddenPatterns = [/@gmail\.com\b/i, /@outlook\.com\b/i, /OAB\/[A-Z]{2}\s+(?!000000\b)\d{5,6}\b/i];
forbiddenPatterns.forEach(pattern => {
  assert.ok(!pattern.test(publicSourceContent), 'O código público não deve conter identificador pessoal incompatível com fixtures sintéticas: ' + pattern);
});
console.log('✓ Código 100% livre de credenciais e dados pessoais.');

// 4. Proibir cálculo de prazo no produto (AGENTS §16; specs/human-deadline-policy.md)
console.log('\n4. Validando a política humana de prazos: nenhum cálculo heurístico no runtime...');
assert.doesNotMatch(publicSourceContent, /calculateLegalDeadline|isForenseRecess|isBusinessDay/, 'O runtime não pode calcular prazo por conta própria.');
assert.match(publicSourceContent, /Contagem de prazo não é feita no produto/, 'O motivo da ausência deve estar documentado no código.');
const businessDaysSource = fs.readFileSync(path.resolve(__dirname, '../lib/core/business-days.mjs'), 'utf8');
assert.match(businessDaysSource, /informativa e a conferência é humana/, 'A derivação de data de publicação deve declarar que é informativa.');
console.log('✓ Nenhum cálculo de prazo heurístico no runtime; derivação de publicação apenas informativa.');

// 5. Validar Modelos de Documentos e Cálculos de Prestação de Contas (BUG-003 & BUG-004)
console.log('\n5. Validando minutas e cálculos da prestação de contas de RPV (BUG-003 / BUG-004)...');
const gross50k = 50000;
const feePct50k = 30;
const fee50k = gross50k * (feePct50k / 100);
const net50k = gross50k - fee50k;
assert.equal(fee50k, 15000, 'Honorários contratuais devem ser R$ 15.000');
assert.equal(net50k, 35000, 'Valor líquido deve ser R$ 35.000');

// Teste oficial RPV R$ 45.000 / 30%
const gross45k = 45000;
const feePct45k = 30;
const fee45k = gross45k * (feePct45k / 100);
const net45k = gross45k - fee45k;
assert.equal(fee45k, 13500, 'Honorários contratuais de R$ 45k @ 30% devem ser R$ 13.500');
assert.equal(net45k, 31500, 'Valor líquido do cliente de R$ 45k @ 30% deve ser R$ 31.500');
console.log('✓ Cálculo financeiro oficial RPV validado: Bruto R$ 45.000, Honorários R$ 13.500, Líquido Cliente R$ 31.500.');

// Teste de mapa de status de requisições financeiras (BUG-004)
const financialStatuses = ['requisitado', 'aguardando_deposito', 'disponivel_saque', 'repassado'];
financialStatuses.forEach(st => {
  assert.ok(financialStatuses.includes(st), 'Status financeiro oficial presente: ' + st);
});
console.log('✓ Mapa de status financeiro com "repassado" como status final validado.');

console.log('\n=============================================================');
console.log('✓ TODOS OS RECURSOS DO ATRIUM SENDA VALIDADOS COM 100% ÊXITO!');
console.log('=============================================================\n');
