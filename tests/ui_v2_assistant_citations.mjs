import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAssistantFeature } from '../js/features/assistant.js';

console.log('\n===============================================================');
console.log('  ATRIUM — REVISAO DE CITACOES NO ASSISTENTE (UI V2)           ');
console.log('===============================================================\n');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [assistantSource, cssSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/assistant.js'), 'utf8'),
  readFile(path.join(ROOT, 'css/views/ui-v2/assistant.css'), 'utf8')
]);

assert.match(assistantSource, /data-citation-review-id/, 'Botao de revisao deve existir no assistente.');
assert.match(assistantSource, /data-citation-override/, 'Acao de override deve existir no painel.');
assert.match(assistantSource, /renderCitationReview/, 'Painel de revisao deve ser renderizado pela feature.');
assert.match(assistantSource, /secureFetch\('\/api\/legal-intelligence\/citations\/review'/, 'Override deve usar a rota canonica via secureFetch.');
assert.match(assistantSource, /data-draft-review-id/, 'Botao de revisao por pares deve existir no assistente.');
assert.match(assistantSource, /secureFetch\('\/api\/legal-intelligence\/reviews'/, 'Revisao por pares deve usar a rota canonica via secureFetch.');
assert.match(assistantSource, /renderDraftReview/, 'Painel de revisao por pares deve ser renderizado pela feature.');
assert.match(cssSource, /citation-review-panel/, 'Estilos do painel devem viver no modulo do assistente.');
assert.match(cssSource, /draft-review-panel/, 'Estilos da revisao por pares devem viver no modulo do assistente.');
console.log('✓ Contrato de wiring e estilos presente.');

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function makeSlot() {
  const elements = new Map();
  return {
    hidden: true,
    innerHTML: '',
    dataset: {},
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, { value: '', disabled: false });
      return elements.get(selector);
    }
  };
}
const slots = new Map();
const toasts = [];
const fetchCalls = [];
let draftReviewResponse = {
  ok: true,
  json: async () => ({
    ok: true,
    review: {
      verdict: 'changes_required',
      summary: 'Risco processual identificado na segunda leitura.',
      findings: [
        { severity: 'blocking', category: 'processual', excerpt: 'prazo de 15 dias', recommendation: 'Conferir o prazo na fonte oficial.' },
        { severity: 'low', category: 'clareza', excerpt: 'pedido genérico', recommendation: 'Detalhar o pedido.' }
      ],
      parsed: true,
      model: 'modelo-sintetico'
    }
  })
};
let overrideResponse = {
  ok: true,
  json: async () => ({
    ok: true,
    citations: {
      entries: [
        { id: 'C1', kind: 'sumula', raw: 'Súmula 999 do STJ', status: 'unverified', policy: 'required', groundedIn: [], note: 'Sem confirmação.' }
      ],
      counts: { total: 1, verified: 0, conflict: 0, pending: 0, unverified: 1 }
    },
    review: {
      status: 'PASS_WITH_WARNINGS',
      ready: true,
      counts: { total: 1, verified: 0, conflict: 0, pending: 0, unverified: 1 },
      blockers: [{ id: 'C1', raw: 'Súmula 999 do STJ', status: 'unverified', message: 'Referência específica sem verificação nem marcador de conferência: Súmula 999 do STJ.' }],
      warnings: [],
      overrideApplied: true,
      override: { justification: 'Conferida manualmente no site oficial.', actor: 'Advogada Teste', at: '2026-09-20T10:00:00.000Z' }
    }
  })
};
const feature = createAssistantFeature({
  documentRef: {
    getElementById: () => null,
    querySelector: selector => {
      const match = /\[data-(?:citation|draft-review)-slot="([^"]+)"\]/.exec(selector);
      if (!match) return null;
      if (!slots.has(match[1])) slots.set(match[1], makeSlot());
      return slots.get(match[1]);
    }
  },
  secureFetch: async (url, options) => {
    fetchCalls.push({ url, body: JSON.parse(options.body) });
    return String(url).includes('/reviews') ? draftReviewResponse : overrideResponse;
  },
  escapeHtml,
  showToast: (message, type) => toasts.push({ message, type })
});

const intelligence = {
  active: true,
  modules: [{ id: 'legal-draft-br' }],
  research: { status: 'unavailable' },
  gates: { status: 'FAIL' },
  citations: {
    entries: [
      { id: 'C1', kind: 'sumula', raw: 'Súmula 999 do STJ', status: 'unverified', policy: 'required', groundedIn: [], note: 'Sem confirmação nas fontes fornecidas; conferir em fonte oficial antes de exportar.' }
    ],
    review: {
      status: 'FAIL',
      ready: false,
      counts: { total: 1, verified: 0, conflict: 0, pending: 0, unverified: 1 },
      blockers: [{ id: 'C1', raw: 'Súmula 999 do STJ', status: 'unverified', message: 'Referência específica sem verificação nem marcador de conferência: Súmula 999 do STJ.' }],
      warnings: [],
      overrideApplied: false,
      override: null
    }
  }
};

const note = feature.describeIntelligence(intelligence, 'A Súmula 999 do STJ sustenta o pedido.');
assert.match(note, /Inteligência jurídica: pesquisa externa indisponível · revisão adversarial/);
assert.match(note, /1 citação: 0 verificadas · 0 pendentes · 1 não verificada/);
assert.match(note, /data-citation-review-id="cr-1"/);
assert.match(note, /Revisar citações \(1 bloqueio\)/);
assert.equal(feature.describeIntelligence({ active: true, modules: [], citations: { entries: [] } }), '', 'Sem módulos e sem citações não há nota.');
const noCitations = feature.describeIntelligence({ active: true, modules: [{ id: 'legal-draft-br' }], citations: null });
assert.match(noCitations, /Inteligência jurídica/);
assert.doesNotMatch(noCitations, /ai-citation-review/);
const partialNote = feature.describeIntelligence({ active: true, modules: [], research: { status: 'discovery', partial: true }, citations: null });
assert.match(partialNote, /pesquisa parcial \(fonte em falha\)/, 'Pesquisa multi-fonte parcial precisa ser declarada.');
console.log('✓ Nota com resumo, contagem de bloqueios e degradação sem citações.');

assert.equal(feature.toggleCitationReview('cr-1'), true);
const slot = slots.get('cr-1');
assert.equal(slot.hidden, false);
assert.match(slot.innerHTML, /citation-review-panel/);
assert.match(slot.innerHTML, /Súmula 999 do STJ/);
assert.match(slot.innerHTML, /Não verificada/);
assert.match(slot.innerHTML, /Bloqueios para exportação/);
assert.match(slot.innerHTML, /data-citation-justification/);
assert.match(slot.innerHTML, /data-citation-override="cr-1"/);
assert.equal(feature.toggleCitationReview('cr-1'), true);
assert.equal(slot.hidden, true, 'Segundo clique recolhe o painel.');
assert.equal(feature.toggleCitationReview('inexistente'), false);
console.log('✓ Painel expande, recolhe e lista status/bloqueios.');

slot.hidden = false;
slot.querySelector('[data-citation-justification]').value = 'curta';
assert.equal(await feature.submitCitationOverride('cr-1'), false);
assert.equal(fetchCalls.length, 0, 'Justificativa curta não pode chamar a rota.');
assert.equal(toasts.at(-1).type, 'error');
slot.querySelector('[data-citation-justification]').value = 'Referência conferida manualmente no site oficial do STJ em 20/09/2026.';
assert.equal(await feature.submitCitationOverride('cr-1'), true);
assert.equal(fetchCalls.length, 1);
assert.equal(fetchCalls[0].url, '/api/legal-intelligence/citations/review');
assert.match(fetchCalls[0].body.draft, /Súmula 999 do STJ/);
assert.match(fetchCalls[0].body.override.justification, /conferida manualmente/);
assert.equal(toasts.at(-1).type, 'success');
assert.match(slot.innerHTML, /Override registrado por Advogada Teste/);
assert.match(slot.innerHTML, /Bloqueios para exportação/, 'Override não esconde o bloqueio assumido.');
assert.match(feature.renderCitationReview({ id: 'sem-bloqueio', citations: { entries: [], review: { blockers: [] } } }), /Nenhum bloqueio: a minuta pode ser exportada/);
console.log('✓ Override exige justificativa, chama a rota e atualiza o painel.');

overrideResponse = { ok: false, json: async () => ({ message: 'Auditoria da revisão indisponível.' }) };
slot.querySelector('[data-citation-justification]').value = 'Nova tentativa de conferência manual registrada agora.';
assert.equal(await feature.submitCitationOverride('cr-1'), false);
assert.equal(toasts.at(-1).type, 'error');
assert.match(toasts.at(-1).message, /Auditoria da revisão indisponível/);
console.log('✓ Falha da rota é honesta: toast de erro, sem sucesso presumido.');

// ── REVISÃO POR PARES (SEGUNDA LEITURA ADVERSARIAL) ──
const draftNote = feature.describeIntelligence(intelligence, 'Minuta sintética com pedido e fundamentação.');
const draftReviewId = /data-draft-review-id="([^"]+)"/.exec(draftNote)?.[1];
assert.ok(draftReviewId, 'Minuta gera o botão de revisão por pares.');
assert.match(draftNote, /Revisar minuta/);
assert.doesNotMatch(feature.describeIntelligence(intelligence, ''), /data-draft-review-id/, 'Sem minuta o botão não é oferecido.');
assert.equal(await feature.runDraftReview(draftReviewId), true);
const draftSlot = slots.get(draftReviewId);
assert.equal(draftSlot.hidden, false);
assert.equal(fetchCalls.at(-1).url, '/api/legal-intelligence/reviews');
assert.match(fetchCalls.at(-1).body.draft, /Minuta sintética com pedido/);
assert.match(draftSlot.innerHTML, /draft-review-panel/);
assert.match(draftSlot.innerHTML, /Requer alterações antes do protocolo/);
assert.match(draftSlot.innerHTML, /Bloqueante/);
assert.match(draftSlot.innerHTML, /prazo de 15 dias/);
assert.match(draftSlot.innerHTML, /Conferir o prazo na fonte oficial/);
assert.match(draftSlot.innerHTML, /nada foi alterado automaticamente/);
assert.match(draftSlot.innerHTML, /modelo-sintetico/);
assert.equal(await feature.runDraftReview(draftReviewId), true);
assert.equal(draftSlot.hidden, true, 'Segundo clique recolhe a revisão por pares.');
assert.equal(await feature.runDraftReview('inexistente'), false);
assert.match(feature.renderDraftReview({ verdict: 'unparsed', findings: [], parsed: false, raw: 'texto bruto do revisor' }), /Resposta não estruturada/);
assert.match(feature.renderDraftReview({ verdict: 'unparsed', findings: [], parsed: false, raw: 'texto bruto do revisor' }), /texto bruto do revisor/);
assert.match(feature.renderDraftReview({ verdict: 'approved', findings: [] }), /Aprovada na segunda leitura/);
console.log('✓ Revisão por pares chama a rota, renderiza achados e recolhe sem alterar a minuta.');

draftReviewResponse = { ok: false, json: async () => ({ message: 'Provedor de IA indisponível.' }) };
draftSlot.hidden = false;
draftSlot.dataset.state = 'error';
assert.equal(await feature.runDraftReview(draftReviewId), false);
assert.equal(toasts.at(-1).type, 'error');
assert.match(toasts.at(-1).message, /Provedor de IA indisponível/);
assert.match(draftSlot.innerHTML, /Provedor de IA indisponível/);
console.log('✓ Falha da revisão por pares é declarada, sem sucesso presumido.');

console.log('\n>>> REVISAO DE CITACOES NO ASSISTENTE: PASS <<<\n');
