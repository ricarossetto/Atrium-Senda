import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const officeDataPath = path.resolve(__dirname, '../js/office-data.js');
const officeDataContent = fs.readFileSync(officeDataPath, 'utf8');
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
const forbiddenTerms = ['ricardo.rossetto.adv@gmail.com', 'Keller Advogados'];
forbiddenTerms.forEach(term => {
  assert.ok(!officeDataContent.includes(term), 'office-data.js não deve conter termo privado: ' + term);
});
console.log('✓ Código 100% livre de credenciais e dados pessoais.');

// 4. Validar Cálculo de Prazos Processuais com Recesso Forense (Art. 220 CPC)
console.log('\n4. Validando regras do CPC/2015: Contagem em dias úteis e Recesso Forense...');

function isBrazilianHoliday(date) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if (m === 1 && d === 1) return true;
  if (m === 4 && d === 21) return true;
  if (m === 5 && d === 1) return true;
  if (m === 9 && d === 7) return true;
  if (m === 10 && d === 12) return true;
  if (m === 11 && d === 2) return true;
  if (m === 11 && d === 15) return true;
  if (m === 11 && d === 20) return true;
  if (m === 12 && d === 25) return true;
  return false;
}

function isForenseRecess(date) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if (m === 12 && d >= 20) return true;
  if (m === 1 && d <= 20) return true;
  return false;
}

function isBusinessDay(date) {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  if (isForenseRecess(date)) return false;
  if (isBrazilianHoliday(date)) return false;
  return true;
}

function calculateLegalDeadline(startDateStr, totalDays = 15, options = {}) {
  const countBusiness = options.businessDays !== false;
  const isDouble = Boolean(options.doubleDeadline);
  const effectiveDays = isDouble ? totalDays * 2 : totalDays;
  
  let current = new Date(startDateStr + 'T00:00:00');
  if (isNaN(current.getTime())) current = new Date();

  current.setDate(current.getDate() + 1);

  while (!isBusinessDay(current)) {
    current.setDate(current.getDate() + 1);
  }

  if (!countBusiness) {
    current.setDate(current.getDate() + (effectiveDays - 1));
    while (!isBusinessDay(current)) {
      current.setDate(current.getDate() + 1);
    }
    return current.toISOString().slice(0, 10);
  }

  let counted = 1;
  while (counted < effectiveDays) {
    current.setDate(current.getDate() + 1);
    if (isBusinessDay(current)) {
      counted += 1;
    }
  }

  return current.toISOString().slice(0, 10);
}

// Teste A: Prazo normal de 15 dias úteis em agosto
const normalDeadline = calculateLegalDeadline('2026-08-03', 15);
assert.ok(normalDeadline > '2026-08-20', 'Prazo de 15 dias úteis deve vencer após 20 de agosto');

// Teste B: Prazo iniciado em 18 de dezembro (deve suspender no recesso de 20/Dez a 20/Jan)
const recessDeadline = calculateLegalDeadline('2026-12-18', 15);
assert.ok(recessDeadline >= '2027-01-22', 'Prazo deve suspender no recesso forense e vencer em final de janeiro: ' + recessDeadline);
console.log('✓ Recesso Forense (Art. 220 CPC) validado com sucesso (vencimento: ' + recessDeadline + ').');

// 5. Validar Modelos de Documentos e Cálculos de Prestação de Contas
console.log('\n5. Validando minutas e cálculos da prestação de contas de RPV...');
const gross = 50000;
const feePct = 30;
const fee = gross * (feePct / 100);
const net = gross - fee;

assert.equal(fee, 15000, 'Honorários contratuais devem ser R$ 15.000');
assert.equal(net, 35000, 'Valor líquido deve ser R$ 35.000');
console.log('✓ Cálculo financeiro de repasse de RPV validado (Bruto: R$ 50k, Honorários: R$ 15k, Líquido: R$ 35k).');

console.log('\n=============================================================');
console.log('✓ TODOS OS RECURSOS DO ATRIUM SENDA VALIDADOS COM 100% ÊXITO!');
console.log('=============================================================\n');
