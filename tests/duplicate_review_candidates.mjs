import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { groupDuplicateCandidates } from '../lib/publications/intimation-identity.mjs';
import { duplicateReviewPairs } from '../lib/publications/duplicate-review.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

console.log('--- Iniciando Testes Unitários: Pares de duplicata provável (revisão humana) ---');

const CNJ = '5001234-56.2026.8.21.0001';
const textoLongo = 'Intimação sintética para conferência. '.repeat(8);
const cauda = sufixo => `${textoLongo}${sufixo}`;

// A) Igualdade apenas de prefixo (fallback) precisa aparecer para revisão -------------------
{
  const intimations = [
    { id: 'eproc:a', externalId: 'eproc:tjrs-eproc-1g:aaa', source: 'eproc', process: CNJ, event: 'Intimação A', sourceReportedAt: '2026-09-25', text: cauda('desfecho A') },
    { id: 'eproc:b', externalId: 'eproc:tjrs-eproc-1g:bbb', source: 'eproc', process: CNJ, event: 'Intimação B', sourceReportedAt: '2026-09-25', text: cauda('desfecho B') }
  ];
  const grouped = groupDuplicateCandidates(intimations);
  assert.equal(grouped.pairs.length, 0, 'fallback não é chave de fusão automática');
  assert.equal(grouped.fallbackCandidates.length, 1, 'agrupador expõe o candidato de fallback');
  const pairs = duplicateReviewPairs({ intimations, groupDuplicateCandidates, limit: 10 });
  assert.equal(pairs.length, 1, 'candidato de fallback precisa aparecer no painel de conferência');
  assert.equal(pairs[0].pairType, 'fallback');
  assert.equal(pairs[0].autoSafe, false, 'fallback nunca é auto-seguro');
  assert.equal(pairs[0].aSource, 'eproc');
  assert.ok(pairs[0].key.includes('|'), 'par tem chave oficial');
  console.log('  OK: candidato por prefixo (fallback) entra no painel como revisão humana.');
}

// B) Tolerância de ±1 dia precisa aparecer para revisão -------------------------------------
{
  const intimations = [
    { id: 'djen:1', externalId: 'djen:111', source: 'djen', process: CNJ, event: 'Intimação · Decisão', publishedAt: '2026-09-24', text: 'Teor sintético idêntico para conferência.' },
    { id: 'eproc:2', externalId: 'eproc:tjrs-eproc-1g:ccc', source: 'eproc', process: CNJ, event: 'Intimação · Decisão', sourceReportedAt: '2026-09-25', text: 'Teor sintético idêntico para conferência.' }
  ];
  const grouped = groupDuplicateCandidates(intimations);
  assert.equal(grouped.nearDateCandidates.length, 1, 'agrupador expõe o candidato de data próxima');
  const pairs = duplicateReviewPairs({ intimations, groupDuplicateCandidates, limit: 10 });
  assert.equal(pairs.length, 1, 'candidato de ±1 dia precisa aparecer no painel de conferência');
  assert.equal(pairs[0].pairType, 'near-date');
  assert.equal(pairs[0].autoSafe, false);
  assert.equal(pairs[0].dayGap, 1);
  assert.ok(pairs[0].aId && pairs[0].bId, 'os dois lados resolvem para registros reais');
  console.log('  OK: par de ±1 dia entra no painel com o motivo e o intervalo.');
}

// C) Chave forte continua auto-segura e não duplica entrada --------------------------------
{
  const intimations = [
    { id: 'djen:10', externalId: 'djen:1010', source: 'djen', process: CNJ, event: 'Intimação · Sentença', publishedAt: '2026-09-20', text: 'Teor A.' },
    { id: 'eproc:10', externalId: 'eproc:tjrs-eproc-1g:ddd', source: 'eproc', process: CNJ, event: 'Intimação · Sentença', sourceReportedAt: '2026-09-20', text: 'Teor B.' }
  ];
  const pairs = duplicateReviewPairs({ intimations, groupDuplicateCandidates, limit: 10 });
  assert.equal(pairs.length, 1, 'chave forte forma um par');
  assert.equal(pairs[0].autoSafe, true, 'par auto-seguro continua marcado como tal');
  assert.equal(pairs[0].aId && pairs[0].bId ? 1 : 0, 1);
  console.log('  OK: par auto-seguro segue no painel sem duplicar entrada.');
}

// D) Registro já absorvido não entra na conferência (6.7.7) --------------------------------
{
  const intimations = [
    { id: 'eproc:x', externalId: 'eproc:tjrs-eproc-1g:eee', source: 'eproc', process: CNJ, event: 'Intimação X', sourceReportedAt: '2026-09-22', text: cauda('X'), mergedInto: 'eproc:y' },
    { id: 'eproc:y', externalId: 'eproc:tjrs-eproc-1g:fff', source: 'eproc', process: CNJ, event: 'Intimação Y', sourceReportedAt: '2026-09-22', text: cauda('Y') }
  ];
  assert.equal(duplicateReviewPairs({ intimations, groupDuplicateCandidates, limit: 10 }).length, 0, 'absorvido não gera par');
  console.log('  OK: registro absorvido fica fora da conferência.');
}

// E) Guarda estática: o caminho de "Confirmar tudo" não pode voltar a referenciar identificador
//    inexistente (o bug que derrubava o clique com ReferenceError em produção, 29/09).
{
  const fonte = fs.readFileSync(path.join(ROOT, 'js', 'features', 'publications.js'), 'utf8');
  assert.doesNotMatch(fonte, /escapeHtml:\s*safeEscape/, 'publications.js não pode passar safeEscape (inexistente) ao alerta de risco.');
  assert.match(fonte, /createRiskConfirm\(\{\s*documentRef,\s*escapeHtml\s*\}\)/, 'o alerta de risco deve receber o helper de escape do próprio módulo.');
  console.log('  OK: alerta de risco usa o helper de escape existente.');
}

console.log('\n[PASS] Pares de duplicata provável validados (fallback, ±1 dia, auto-seguro e absorvido).');
