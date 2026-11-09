/**
 * Test Suite: Eproc CNJ Routing & Candidate Resolution Engine
 */

import assert from 'node:assert/strict';
import { parseCnj, resolveEprocCandidates } from '../lib/judicial/eproc/cnj-resolver.mjs';

console.log('=== TESTE DO MOTOR DE ROTEAMENTO CNJ EPROC ===\n');

// 1. Parsing de CNJ
const parsedJfrs = parseCnj('5001234-56.2024.4.04.7100');
assert.equal(parsedJfrs.sequential, '5001234');
assert.equal(parsedJfrs.checkDigits, '56');
assert.equal(parsedJfrs.year, 2024);
assert.equal(parsedJfrs.justiceBranchCode, 4);
assert.equal(parsedJfrs.tribunalRegionCode, '04');
assert.equal(parsedJfrs.courtCode, '4.04');
assert.equal(parsedJfrs.originUnit, '7100');

// 2. Roteamento JFRS (71xx -> RS)
const candJfrs = resolveEprocCandidates('5001234-56.2024.4.04.7100');
assert.ok(candJfrs.length > 0, 'Deve retornar candidatos para 4.04');
assert.equal(candJfrs[0].portalId, 'jfrs-eproc-1g', 'Top candidate para vara 7100 deve ser JFRS 1G');
assert.equal(candJfrs[0].confidence, 0.98);

// 3. Roteamento JFSC (72xx -> SC)
const candJfsc = resolveEprocCandidates('5009999-11.2024.4.04.7200');
assert.equal(candJfsc[0].portalId, 'jfsc-eproc-1g', 'Top candidate para vara 7200 deve ser JFSC 1G');

// 4. Roteamento JFPR (70xx -> PR)
const candJfpr = resolveEprocCandidates('5008888-22.2024.4.04.7000');
assert.equal(candJfpr[0].portalId, 'jfpr-eproc-1g', 'Top candidate para vara 7000 deve ser JFPR 1G');

// 5. Roteamento TRF4 2G (0000 -> Tribunal)
const candTrf4 = resolveEprocCandidates('5000001-00.2024.4.04.0000');
assert.equal(candTrf4[0].portalId, 'trf4-eproc-2g', 'Top candidate para origem 0000 deve ser TRF4 2G');

// 6. Roteamento TJRS (8.21 -> RS)
const candTjrs = resolveEprocCandidates('5001111-22.2024.8.21.0001');
assert.ok(candTjrs.some(c => c.portalId === 'tjrs-eproc-1g'));
assert.equal(candTjrs[0].court, 'TJRS');
assert.equal(candTjrs[0].confidence, 0.95);

// 7. Roteamento TJSP (8.26 -> SP com status partial)
const candTjsp = resolveEprocCandidates('1002222-33.2024.8.26.0100');
assert.ok(candTjsp.some(c => c.portalId === 'tjsp-eproc-1g'));
assert.equal(candTjsp[0].status, 'partial', 'TJSP deve manter status partial');
assert.equal(candTjsp[0].confidence, 0.65, 'Tribunal híbrido não deve prometer 100% de certeza');

// 8. Roteamento TRF2 (4.02 -> RJ/ES)
const candTrf2 = resolveEprocCandidates('5003333-44.2024.4.02.5101');
assert.ok(candTrf2.some(c => c.court === 'TRF2' || c.court === 'JFRJ'));

// 9. Roteamento TRF6 (4.06 -> MG)
const candTrf6 = resolveEprocCandidates('5004444-55.2024.4.06.3800');
assert.ok(candTrf6.some(c => c.court === 'TRF6' || c.court === 'JFMG'));

// 10. CNJ inválido
assert.deepEqual(resolveEprocCandidates('12345'), []);
assert.deepEqual(resolveEprocCandidates(''), []);

console.log('✓ Motor de roteamento CNJ validado: 100% de assertividade nas 10 regras de inferência jurisdicional.');
