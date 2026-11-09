/**
 * Test Suite: Real Sanitized Eproc Fixtures Validation & Compatibility Audit
 *
 * Tests the shared eproc core against sanitized real HTML markups from TRF4 & JFRS.
 * Computes programmatic PARSER_COMPATIBILITY metrics.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  parseEprocPanelProcesses,
  parseEprocCaseDetails,
  parseEprocParties,
  parseEprocMovements,
  parseEprocDocuments,
  extractEprocAccessKey
} from '../lib/judicial/eproc/index.mjs';

console.log('=== TESTE DE FIXTURES REAIS SANITIZADAS (TRF4 & JFRS) ===\n');

// 1. Audit Panel Parser on TRF4 Process List
const oabHtml = fs.readFileSync(path.resolve('tests/fixtures/real/trf4-sanitized-oab.html'), 'utf8');
const panelProcs = parseEprocPanelProcesses(oabHtml);

console.log('[1] Painel / Lista de Processos TRF4 (trf4-sanitized-oab.html):');
assert.equal(panelProcs.length, 2, 'Deve extrair 2 processos da lista do TRF4');

const expectedFieldsPanel = ['number', 'cnj', 'actionClass', 'plaintiff', 'defendant', 'courtLocation', 'selectHref'];
let correctFieldsPanel = 0;

if (panelProcs[0].number === '5001234-56.2024.4.04.7100') correctFieldsPanel++;
if (panelProcs[0].cnj === '50012345620244047100') correctFieldsPanel++;
if (panelProcs[0].actionClass === 'PROCEDIMENTO COMUM CÍVEL / Previdenciário') correctFieldsPanel++;
if (panelProcs[0].plaintiff === 'SEGURADO FICTÍCIO TESTE') correctFieldsPanel++;
if (panelProcs[0].defendant === 'INSTITUTO NACIONAL DO SEGURO SOCIAL - INSS') correctFieldsPanel++;
if (panelProcs[0].courtLocation === '1ª Vara Federal de Porto Alegre') correctFieldsPanel++;
if (panelProcs[0].selectHref && panelProcs[0].selectHref.includes('processo_seleciona_publica')) correctFieldsPanel++;

const panelCompatibility = correctFieldsPanel / expectedFieldsPanel.length;
console.log(`    Campos esperados: ${expectedFieldsPanel.length}, Corretos: ${correctFieldsPanel}`);
console.log(`    Compatibilidade do Panel Parser: ${(panelCompatibility * 100).toFixed(1)}%`);
assert.equal(panelCompatibility, 1.0, 'Panel Parser deve ter 100% de compatibilidade na fixture real');

// 2. Audit Case Details & Cover on TRF4 Process Details
const processHtml = fs.readFileSync(path.resolve('tests/fixtures/real/trf4-sanitized-process.html'), 'utf8');
const caseDetails = parseEprocCaseDetails(processHtml);

console.log('\n[2] Capa e Detalhes do Processo TRF4 (trf4-sanitized-process.html):');
assert.ok(caseDetails, 'Deve extrair objeto de detalhes do processo');

const expectedFieldsCase = ['number', 'cnj', 'actionClass', 'judicialUnit', 'competence', 'distributionDate', 'caseValue', 'secrecyLevel', 'accessKey'];
let correctFieldsCase = 0;

if (caseDetails.number === '5001234-56.2024.4.04.7100') correctFieldsCase++;
if (caseDetails.cnj === '50012345620244047100') correctFieldsCase++;
if (caseDetails.actionClass === 'PROCEDIMENTO COMUM CÍVEL') correctFieldsCase++;
if (caseDetails.judicialUnit === '1ª Vara Federal de Porto Alegre') correctFieldsCase++;
if (caseDetails.competence === 'Previdenciário') correctFieldsCase++;
if (caseDetails.distributionDate === '10/01/2024 14:00:00') correctFieldsCase++;
if (caseDetails.caseValue === 'R$ 82.500,00') correctFieldsCase++;
if (caseDetails.secrecyLevel === 0) correctFieldsCase++;
if (caseDetails.accessKey === '987654321012') correctFieldsCase++;

const caseCompatibility = correctFieldsCase / expectedFieldsCase.length;
console.log(`    Campos esperados: ${expectedFieldsCase.length}, Corretos: ${correctFieldsCase}`);
console.log(`    Compatibilidade do Case Parser: ${(caseCompatibility * 100).toFixed(1)}%`);
assert.equal(caseCompatibility, 1.0, 'Case Parser deve ter 100% de compatibilidade na fixture real');

// 3. Audit Parties Parser on TRF4
const parties = parseEprocParties(processHtml);
console.log('\n[3] Partes e Representantes TRF4:');
assert.equal(parties.length, 3, 'Deve extrair 3 partes (Autor, Advogado, Réu)');
assert.equal(parties[0].pole, 'ACTIVE');
assert.equal(parties[0].documentNumber, '000.000.000-00');
assert.equal(parties[1].pole, 'ATTORNEY');
assert.equal(parties[1].oab, 'RS123456');
assert.equal(parties[2].pole, 'PASSIVE');
console.log('    ✓ Autor (Polo Ativo, CPF), Advogado (OAB/RS) e Réu (Polo Passivo) mapeados.');

// 4. Audit Movements & Events Timeline on TRF4
const movements = parseEprocMovements(processHtml);
console.log('\n[4] Eventos e Movimentações TRF4:');
assert.equal(movements.length, 5, 'Deve extrair 5 movimentações ordenadas');
assert.equal(movements[0].sequence, 5);
assert.equal(movements[0].description, 'CONCLUSÃO PARA SENTENÇA');
assert.equal(movements[4].sequence, 1);
assert.equal(movements[4].description, 'DISTRIBUIÇÃO POR SORTEIO');
assert.equal(movements[4].occurredAt, '2024-01-10T14:22:10.000Z');
console.log('    ✓ 5 eventos extraídos com ordem cronológica e timestamps ISO 8601.');

// 5. Audit Documents on TRF4
const docs = parseEprocDocuments(processHtml);
console.log('\n[5] Documentos do Processo TRF4:');
assert.ok(docs.length >= 3, 'Deve extrair ao menos 3 documentos');
const docIds = docs.map(d => d.id);
assert.ok(docIds.includes('DOC101') || docIds.includes('INIC1'));
assert.ok(docIds.includes('DOC102') || docIds.includes('DEC2'));
assert.ok(docIds.includes('DOC104') || docIds.includes('CONT4'));
console.log(`    ✓ ${docs.length} documentos identificados com URLs de acesso e metadados.`);

// 6. Audit Access Key Search Markup (JFRS)
const keySearchHtml = fs.readFileSync(path.resolve('tests/fixtures/real/jfrs-sanitized-key-search.html'), 'utf8');
const extractedKey = extractEprocAccessKey(keySearchHtml);
console.log('\n[6] Consulta Pública por Chave de Acesso (jfrs-sanitized-key-search.html):');
assert.equal(extractedKey, '987654321012', 'Deve extrair a chave de acesso do formulário da JFRS');
console.log('    ✓ Chave de acesso 987654321012 extraída com sucesso da consulta pública JFRS.');

console.log('\n================================================================');
console.log('✓ TODAS AS VALIDAÇÕES EM FIXTURES REAIS SANITIZADAS FORAM APROVADAS!');
console.log('================================================================');
