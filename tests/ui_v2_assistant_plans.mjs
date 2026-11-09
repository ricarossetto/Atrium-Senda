import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAssistantFeature } from '../js/features/assistant.js';

console.log('\n===============================================================');
console.log('  ATRIUM — PLANOS AGENTICOS NO ASSISTENTE (UI V2)               ');
console.log('===============================================================\n');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [assistantSource, indexSource, cssSource] = await Promise.all([
  readFile(path.join(ROOT, 'js/features/assistant.js'), 'utf8'),
  readFile(path.join(ROOT, 'index.html'), 'utf8'),
  readFile(path.join(ROOT, 'css/views/ui-v2/assistant.css'), 'utf8')
]);

assert.match(assistantSource, /planAgenticDraft/, 'Feature deve criar planos supervisionados.');
assert.match(assistantSource, /data-plan-action/, 'Painel deve expor ações do plano.');
assert.match(assistantSource, /subscribePlanEvents/, 'Progresso por SSE deve existir no assistente.');
assert.match(assistantSource, /secureFetch\(`\/api\/legal-intelligence\/plans\//, 'Ações devem usar a rota oficial de planos.');
assert.match(indexSource, /id="btnAiPlan"/, 'Compositor deve ter a ação Planejar.');
assert.match(indexSource, /Planejar a peça em etapas/, 'Ação precisa de nome acessível.');
assert.match(cssSource, /agentic-plan-panel/, 'Estilos do plano devem viver no módulo do assistente.');
assert.doesNotMatch(assistantSource, /\bfetch\s*\(/, 'Assistente usa apenas secureFetch injetado.');
console.log('✓ Contrato de wiring, ação no compositor e estilos presentes.');

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

function fakeElement(tag = 'div') {
  return {
    tag,
    className: '',
    dataset: {},
    innerHTML: '',
    textContent: '',
    value: '',
    style: {},
    disabled: false,
    children: [],
    scrollTop: 0,
    scrollHeight: 0,
    appendChild(child) { this.children.push(child); return child; },
    querySelector(selector) {
      const match = /\[data-plan-id="([^"]+)"\]/.exec(selector);
      if (match) return this.children.find(child => child.dataset?.planId === match[1]) || null;
      return null;
    },
    setAttribute() {},
    removeAttribute() {}
  };
}

const elements = new Map();
elements.set('aiChatInput', fakeElement('textarea'));
elements.set('aiChatMessages', fakeElement());
elements.set('btnAiPlan', fakeElement('button'));

const toasts = [];
const fetchCalls = [];
let planResponse = null;
let streamFrames = null;
const feature = createAssistantFeature({
  documentRef: {
    getElementById: id => elements.get(id) || null,
    createElement: tag => fakeElement(tag),
    querySelector: () => null,
    documentElement: { dataset: { ui: 'v2' } }
  },
  windowRef: {},
  secureFetch: async (url, options = {}) => {
    fetchCalls.push({ url, options });
    if (url.endsWith('/events')) {
      const frames = streamFrames || [];
      let index = 0;
      const encoder = new TextEncoder();
      return {
        ok: true,
        body: {
          getReader: () => ({
            read: async () => index < frames.length
              ? { value: encoder.encode(frames[index++]), done: false }
              : { value: undefined, done: true }
          })
        }
      };
    }
    return { ok: true, json: async () => planResponse || {} };
  },
  escapeHtml,
  showToast: (message, type) => toasts.push({ message, type })
});

const basePlan = {
  id: 'plan-20260921100000-abc123',
  status: 'awaiting-approval',
  supervision: true,
  pieceType: 'apelacao',
  steps: [
    { id: 'analise', label: 'Triagem da solicitação', status: 'done', requiresApproval: false, summary: 'apelacao · civel' },
    { id: 'pesquisa', label: 'Pesquisa externa (discovery)', status: 'pending-approval', requiresApproval: true, approvedBy: null, summary: null },
    { id: 'redacao', label: 'Redação supervisionada', status: 'blocked', requiresApproval: false, summary: null },
    { id: 'revisao-citacoes', label: 'Revisão de citações', status: 'blocked', requiresApproval: false, summary: null },
    { id: 'conferencia-humana', label: 'Conferência humana final', status: 'blocked', requiresApproval: false, summary: null }
  ],
  updatedAt: '2026-09-21T10:00:00.000Z'
};

assert.equal(await feature.planAgenticDraft(), false, 'Sem mensagem não cria plano.');
assert.equal(fetchCalls.length, 0);
assert.equal(toasts.at(-1).type, 'error');
elements.get('aiChatInput').value = 'Elabore a apelação com jurisprudência.';
planResponse = { ok: true, plan: basePlan, analysis: { active: true, pieceType: 'apelacao' } };
assert.equal(await feature.planAgenticDraft(), true);
assert.equal(fetchCalls.filter(call => !call.url.endsWith('/events')).length, 1);
assert.equal(fetchCalls[0].url, '/api/legal-intelligence/plans');
assert.match(JSON.parse(fetchCalls[0].options.body).message, /apelação/);
const container = elements.get('aiChatMessages');
assert.equal(container.children.length, 1);
const panelHtml = container.children[0].innerHTML;
assert.match(panelHtml, /Plano · apelacao/);
assert.match(panelHtml, /Aguarda aprovação/);
assert.match(panelHtml, /data-plan-action="approve"/);
assert.doesNotMatch(panelHtml, /data-plan-action="run"/, 'Sem etapa executável não há botão de execução.');
console.log('✓ Criação do plano renderiza etapas e aprovação pendente.');

planResponse = {
  ok: true,
  plan: {
    ...basePlan,
    status: 'awaiting-human',
    steps: basePlan.steps.map(step => step.id === 'pesquisa'
      ? { ...step, status: 'done', approvedBy: 'Advogada Teste', summary: '2 fonte(s) · 3 item(ns)' }
      : step.id === 'redacao' ? { ...step, status: 'done', summary: '1200 caractere(s) · gates PASS_WITH_WARNINGS' }
        : step.id === 'revisao-citacoes' ? { ...step, status: 'done', summary: '1 bloqueio(s) — conferência humana exigida' }
          : step.id === 'conferencia-humana' ? { ...step, status: 'pending' } : step)
  },
  draft: '# Minuta sintética\n\nConteúdo supervisionado.'
};
assert.equal(await feature.runPlanAction('plan-20260921100000-abc123', 'run'), true);
const runCall = fetchCalls.at(-1);
assert.equal(runCall.url, '/api/legal-intelligence/plans/plan-20260921100000-abc123/run');
const renderedAfterRun = container.children[0].innerHTML;
assert.match(renderedAfterRun, /Aguarda conferência humana/);
assert.match(renderedAfterRun, /data-plan-action="confirm"/);
assert.match(renderedAfterRun, /Minuta gerada \(/);
assert.match(renderedAfterRun, /Conteúdo supervisionado/);
assert.equal(toasts.at(-1).type, 'success');
console.log('✓ Execução atualiza o painel, mostra a minuta e habilita a conferência.');

planResponse = { ok: true, plan: { ...basePlan, status: 'done', steps: basePlan.steps.map(step => ({ ...step, status: 'done' })) } };
assert.equal(await feature.runPlanAction('plan-20260921100000-abc123', 'confirm'), true);
assert.equal(fetchCalls.at(-1).url, '/api/legal-intelligence/plans/plan-20260921100000-abc123/confirm');
assert.match(container.children[0].innerHTML, /Concluído/);
assert.equal(await feature.runPlanAction('plan-x', 'desconhecida'), false, 'Ação fora da allowlist não chama a rota.');

streamFrames = [
  'event: snapshot\ndata: {"id":"plan-20260921100000-abc123","status":"in_progress","pieceType":"apelacao","steps":[{"id":"pesquisa","label":"Pesquisa externa (discovery)","status":"running"}]}\n\n',
  'event: plan\ndata: {"id":"plan-20260921100000-abc123","status":"awaiting-human","pieceType":"apelacao","steps":[{"id":"conferencia-humana","label":"Conferência humana final","status":"pending"}]}\n\n'
];
assert.equal(feature.subscribePlanEvents('plan-20260921100000-abc123'), true);
await new Promise(resolve => setImmediate(resolve));
await new Promise(resolve => setImmediate(resolve));
const streamed = container.children[0].innerHTML;
assert.match(streamed, /Aguarda conferência humana/, 'Evento SSE atualiza o painel do plano.');
console.log('✓ SSE aplica eventos do plano no painel.');

console.log('\n>>> PLANOS AGENTICOS NO ASSISTENTE: PASS <<<\n');
