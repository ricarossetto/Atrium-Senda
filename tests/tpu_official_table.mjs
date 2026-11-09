import assert from 'node:assert/strict';
import {
  MOVEMENT_CATEGORIES,
  TPU_TABLE_STATUS,
  categorizeMovementName,
  listTpuMovements,
  lookupTpuClass,
  lookupTpuDocument,
  lookupTpuMovement,
  lookupTpuSubject,
  tpuTableInfo
} from '../lib/judicial-intelligence/process-intelligence/tpu-table.mjs';
import { classifyMovement } from '../lib/judicial-intelligence/process-intelligence/movement-classifier.mjs';

console.log('\n=== TABELA TPU OFICIAL (CNJ/SGT) ===\n');

const info = tpuTableInfo();
assert.equal(info.status, TPU_TABLE_STATUS, 'A tabela oficial versionada deve estar disponível.');
assert.equal(info.tableVersion, '83');
assert.match(info.sourceHash, /^[0-9a-f]{64}$/, 'Hash das fontes deve ser SHA-256.');
assert.ok(info.counts.movements > 900, `Movimentos oficiais insuficientes: ${info.counts.movements}`);
assert.ok(info.counts.classes > 800, `Classes oficiais insuficientes: ${info.counts.classes}`);
assert.ok(info.counts.subjects > 5000, `Assuntos oficiais insuficientes: ${info.counts.subjects}`);
assert.ok(info.counts.documents > 1000, `Documentos oficiais insuficientes: ${info.counts.documents}`);
console.log(`✓ Tabela oficial v${info.tableVersion}: ${JSON.stringify(info.counts)}`);

// Códigos de referência usados pelo próprio CNJ (movimento 26 = distribuição).
const distribution = lookupTpuMovement(26);
assert.equal(distribution.name, 'Distribuição');
assert.equal(distribution.category, MOVEMENT_CATEGORIES.DISTRIBUICAO);
assert.equal(distribution.verified, true);
assert.equal(distribution.method, 'tpu');
assert.equal(distribution.source, 'sgt');
assert.equal(distribution.active, true);

const procedural = lookupTpuClass(7);
assert.equal(procedural.name, 'Procedimento Comum Cível', 'Classe 7 é Procedimento Comum Cível na TPU.');
assert.ok(lookupTpuSubject(195), 'Assunto 195 (Direito Previdenciário) deve existir.');
assert.ok(lookupTpuDocument(1), 'Documento 1 deve existir.');

// Código inexistente cai na curadoria (fallback) ou em null.
assert.equal(lookupTpuMovement(999999), null, 'Código inexistente não pode ser inventado.');
assert.equal(lookupTpuMovement(26, { table: { 26: { code: 26, name: 'Curadoria', category: MOVEMENT_CATEGORIES.OUTRO, verified: false } } }).name, 'Curadoria', 'Tabela customizada preserva o contrato antigo.');
console.log('✓ Códigos oficiais, hierarquia e fallback conferem.');

// Categorização é taxonomia do produto derivada do nome oficial.
assert.equal(categorizeMovementName('Distribuição'), MOVEMENT_CATEGORIES.DISTRIBUICAO);
assert.equal(categorizeMovementName('Sentença'), MOVEMENT_CATEGORIES.SENTENCA);
assert.equal(categorizeMovementName('Trânsito em Julgado'), MOVEMENT_CATEGORIES.TRANSITO_JULGADO);
assert.equal(categorizeMovementName('Nome sem padrão conhecido'), MOVEMENT_CATEGORIES.OUTRO);
console.log('✓ Categorização por nome oficial.');

// Classificador usa o código oficial como método primário.
const classified = classifyMovement({ tpuCode: 26, description: 'Distribuição' });
assert.equal(classified.method, 'tpu');
assert.equal(classified.category, MOVEMENT_CATEGORIES.DISTRIBUICAO);
assert.ok(classified.confidence >= 0.98);
assert.match(classified.basis[0], /^TPU:26:Distribuição$/);

const fallback = classifyMovement({ tpuCode: null, description: 'Publicação de despacho' });
assert.equal(fallback.method, 'lexicon', 'Sem código, o léxico continua como fallback explícito.');
console.log('✓ Classificador TPU-first com fallback explícito.');

const list = listTpuMovements({ category: MOVEMENT_CATEGORIES.DISTRIBUICAO, activeOnly: true });
assert.ok(list.length > 0 && list.every(entry => entry.category === MOVEMENT_CATEGORIES.DISTRIBUICAO));
console.log(`✓ Listagem filtrada (${list.length} movimentos de distribuição ativos).`);

console.log('\n>>> TPU OFICIAL: PASS <<<\n');
