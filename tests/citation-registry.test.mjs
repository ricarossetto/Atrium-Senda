import assert from 'node:assert/strict';
import {
  buildCitationRegistry,
  citationKey,
  evaluateCitationReview,
  extractCitationEntries
} from '../lib/legal-intelligence/citation-registry.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — REGISTRO DE CITACOES (GROUNDING DE MINUTAS)          ');
console.log('===============================================================\n');

const extracted = extractCitationEntries(
  'Conforme a Súmula 331 do TST e o Tema 1.234 do STJ, bem como o REsp 1.234.567/RS, o pedido procede.\nSúmula 999 [CONFERIR EM FONTE OFICIAL].'
);
assert.deepEqual(extracted.map(item => item.kind), ['sumula', 'tema', 'precedente-superior', 'sumula']);
assert.equal(extracted[0].digits, '331');
assert.equal(extracted[0].court, 'TST', 'Qualificador de tribunal e capturado apos a referencia.');
assert.equal(extracted[1].digits, '1234');
assert.equal(extracted[1].court, 'STJ');
assert.equal(extracted[2].digits, '1234567');
assert.equal(extracted[2].court, '', 'Precedente sem tribunal explicito nao inventa qualificador.');
assert.equal(extracted[3].pending, true, 'Marcador de conferencia e reconhecido.');
assert.equal(extracted[0].pending, false);
assert.equal(citationKey('sumula', '1.234'), 'sumula:1234');
console.log('✓ Extracao de tema, sumula e precedente com tribunal e marcador.');

const baseDraft = [
  'A Súmula 331 do TST sustenta o pedido.',
  'O Tema 1234 do STJ foi citado.',
  'A Súmula 999 [CONFERIR EM FONTE OFICIAL] aguarda conferência.',
  'O REsp 1.234.567/RS não consta nas fontes.'
].join('\n');

const registry = buildCitationRegistry({
  draft: baseDraft,
  documents: [{ id: 'D1', name: 'Sentença', text: 'Restou aplicada a Súmula 331 do TST ao caso.' }],
  message: 'O Tema 1234 do STJ será discutido.',
  research: { status: 'discovery', results: [{ query: 'recurso especial', ok: true, jurisprudence: { count: 1, sample: [{ identificador: 'REsp 1.234.567/RS' }] } }] }
});
assert.equal(registry.entries.length, 4);
assert.equal(registry.entries[0].status, 'verified', 'Citacao presente em documento e verificada.');
assert.deepEqual(registry.entries[0].groundedIn.map(item => item.ref), ['D1']);
assert.equal(registry.entries[1].status, 'verified', 'Citacao presente na mensagem e verificada.');
assert.deepEqual(registry.entries[1].groundedIn.map(item => item.type), ['mensagem']);
assert.equal(registry.entries[2].status, 'pending', 'Marcador sem fonte vira pendente.');
assert.equal(registry.entries[3].status, 'unverified', 'Discovery nao confirma como autoridade.');
assert.equal(registry.entries[3].groundedIn[0].type, 'pesquisa');
assert.match(registry.entries[3].note, /discovery/i);
assert.deepEqual(registry.counts, { total: 4, verified: 2, conflict: 0, pending: 1, unverified: 1 });
console.log('✓ Grounding: fonte fornecida verifica, discovery apenas sinaliza.');

const conflictRegistry = buildCitationRegistry({
  draft: 'A Súmula 331 do STF autoriza a terceirização.',
  documents: [{ id: 'D2', name: 'Acórdão', text: 'A Súmula 331 do TST trata da terceirização.' }]
});
assert.equal(conflictRegistry.entries[0].status, 'conflict', 'Tribunal divergente na fonte vira conflito.');
assert.match(conflictRegistry.entries[0].note, /TST/);
const noCourtRegistry = buildCitationRegistry({
  draft: 'A Súmula 331 autoriza a terceirização.',
  documents: [{ id: 'D2', name: 'Acórdão', text: 'A Súmula 331 do TST trata da terceirização.' }]
});
assert.equal(noCourtRegistry.entries[0].status, 'verified', 'Sem tribunal no rascunho nao ha conflito a declarar.');
console.log('✓ Conflito de tribunal na fonte e bloqueante; ausencia de qualificador nao conflita.');

const review = evaluateCitationReview(registry);
assert.equal(review.status, 'FAIL');
assert.equal(review.ready, false);
assert.equal(review.blockers.length, 1, 'Somente a citacao obrigatoria nao confirmada bloqueia.');
assert.match(review.blockers[0].raw, /REsp 1\.234\.567/);
assert.equal(review.warnings.length, 1, 'Pendente vira ressalva, nunca bloqueio.');
const shortOverride = evaluateCitationReview(registry, { override: { justification: 'ok' } });
assert.equal(shortOverride.ready, false, 'Justificativa curta nao vale como override.');
const overridden = evaluateCitationReview(registry, { override: { justification: 'Referência conferida manualmente no site oficial do STJ em 20/09/2026.', actor: 'Advogada Teste', at: '2026-09-20T10:00:00.000Z' } });
assert.equal(overridden.ready, true);
assert.equal(overridden.status, 'PASS_WITH_WARNINGS');
assert.equal(overridden.overrideApplied, true);
assert.equal(overridden.override.actor, 'Advogada Teste');
assert.equal(overridden.blockers.length, 1, 'Override nao esconde o bloqueio; apenas permite a exportacao auditada.');

const clean = evaluateCitationReview(buildCitationRegistry({
  draft: 'A Súmula 331 do TST e o Tema 1234 do STJ.',
  documents: [{ id: 'D1', text: 'Súmula 331 do TST. Tema 1234 do STJ.' }]
}));
assert.equal(clean.status, 'PASS');
assert.equal(clean.ready, true);
assert.deepEqual(clean.blockers, []);
const empty = evaluateCitationReview(buildCitationRegistry({ draft: 'Sem referencias especificas neste texto.' }));
assert.equal(empty.status, 'PASS');
assert.equal(empty.counts.total, 0);
console.log('✓ Revisao final: bloqueios, ressalvas, override auditado e texto limpo.');

console.log('\n>>> REGISTRO DE CITACOES: PASS <<<\n');
