import assert from 'node:assert/strict';
import { createErrorReportFeature } from '../js/features/error-report.js';

console.log('\n=== FEATURE DE RELATO DE ERRO (UI) ===\n');

function makeElement(id) {
  const listeners = new Map();
  return {
    id,
    textContent: '',
    dataset: {},
    disabled: false,
    style: {},
    classList: {
      values: new Set(['hidden']),
      add(...names) { names.forEach(name => this.values.add(name)); },
      remove(...names) { names.forEach(name => this.values.delete(name)); },
      contains(name) { return this.values.has(name); }
    },
    addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(handler); },
    dispatch(type, event = {}) { (listeners.get(type) || []).forEach(handler => handler(event)); },
    focus() { documentRef.activeElement = this; },
    setAttribute(name, value) { this.attributes = { ...(this.attributes || {}), [name]: value }; },
    removeAttribute(name) { if (this.attributes) delete this.attributes[name]; },
    getAttribute(name) { return this.attributes?.[name] ?? null; },
    getClientRects() { return [{}]; },
    querySelectorAll() { return []; },
    closest() { return null },
    isConnected: true
  };
}

const ids = [
  'errorReportBackdrop', 'errorReportClose', 'errorReportDismiss', 'errorReportCopy', 'errorReportSend',
  'errorReportCode', 'errorReportCodeHint', 'errorReportScope', 'errorReportMessage', 'errorReportWhen',
  'errorReportDetails', 'errorReportStatus', 'appShell'
];
const elements = new Map(ids.map(id => [id, makeElement(id)]));
let activeOverlay = null;
const documentRef = {
  activeElement: null,
  documentElement: { style: { overflow: '' } },
  body: { style: { overflow: '' } },
  getElementById: id => elements.get(id) || null,
  querySelector: selector => (selector.includes('.modal-backdrop:not(.hidden)') ? activeOverlay : null),
  createElement: () => makeElement('created')
};

const fetchCalls = [];
const toasts = [];
let fetchResponse = { ok: true, json: async () => ({ ok: true, code: 'ATR-20260921-DEADBEEF', emailStatus: 'sent', message: 'Relato enviado ao suporte da plataforma.' }) };
let clipboardValue = null;
const windowRef = {
  navigator: { clipboard: { writeText: async value => { if (clipboardValue === 'fail') throw new Error('negado'); clipboardValue = value; } } }
};

const feature = createErrorReportFeature({
  documentRef,
  windowRef,
  secureFetch: async (url, options) => { fetchCalls.push({ url, options, body: JSON.parse(options.body) }); return fetchResponse; },
  escapeHtml: value => String(value ?? ''),
  showToast: (message, type) => toasts.push({ message, type }),
  now: () => new Date('2026-09-21T01:37:41.000Z')
});

assert.equal(feature.init(), true);
assert.equal(feature.init(), false, 'init é idempotente.');

// Abertura com o painel de sincronização fechado.
assert.equal(await feature.open({ scope: 'Sincronização eproc · trf4-eproc-2g', message: '5 erro(s) durante a coleta eproc.', details: 'Job: job-123' }), true);
assert.equal(feature.isOpen, true);
assert.match(elements.get('errorReportCode').textContent, /^ATR-20260921-[0-9A-F]{8}$/);
assert.equal(elements.get('errorReportScope').textContent, 'Sincronização eproc · trf4-eproc-2g');
assert.equal(elements.get('errorReportMessage').textContent, '5 erro(s) durante a coleta eproc.');
assert.equal(elements.get('errorReportDetails').textContent, 'Job: job-123');
assert.equal(elements.get('errorReportBackdrop').classList.contains('hidden'), false);
assert.equal(elements.get('appShell').classList.contains('hidden'), true, 'appShell não tem hidden; controle é atributo.');
assert.equal(documentRef.activeElement, elements.get('errorReportClose'), 'Foco inicial vai para o fechamento.');
assert.equal(documentRef.body.style.overflow, 'hidden', 'Relato bloqueia o scroll do body.');
assert.equal(documentRef.documentElement.style.overflow, 'hidden', 'Relato bloqueia o scroll da janela.');
console.log('✓ Overlay abre com código, escopo, mensagem e prévia.');

// Não interrompe outro overlay aberto.
activeOverlay = { id: 'outro' };
feature.close({ restoreFocus: false });
assert.equal(documentRef.body.style.overflow, '', 'Fechamento restaura o scroll do body.');
assert.equal(documentRef.documentElement.style.overflow, '', 'Fechamento restaura o scroll da janela.');
assert.equal(await feature.open({ scope: 'Interface', message: 'Erro concorrente.' }), false);
assert.equal(feature.isOpen, false, 'Não pode empilhar overlay sobre overlay.');
activeOverlay = null;
console.log('✓ Overlay concorrente não é interrompido.');

// Copiar código.
await feature.open({ scope: 'Interface', message: 'Falha sintética.' });
assert.equal(await feature.copyCode(), true);
assert.match(clipboardValue, /^ATR-/);
assert.equal(elements.get('errorReportStatus').dataset.tone, 'success');
clipboardValue = 'fail';
assert.equal(await feature.copyCode(), false);
assert.equal(elements.get('errorReportStatus').dataset.tone, 'warning', 'Falha de cópia é declarada sem falso sucesso.');
console.log('✓ Cópia do código com fallback honesto.');

// Envio: rota oficial, código do servidor confirmado e status real.
assert.equal(await feature.send(), true);
assert.equal(fetchCalls.at(-1).url, '/api/system/error-report');
assert.equal(fetchCalls.at(-1).body.message, 'Falha sintética.');
assert.equal(elements.get('errorReportCode').textContent, 'ATR-20260921-DEADBEEF');
assert.match(elements.get('errorReportStatus').textContent, /enviado ao suporte/i);
assert.equal(elements.get('errorReportStatus').dataset.tone, 'success');
assert.ok(toasts.some(toast => toast.type === 'success'));
console.log('✓ Envio usa a rota oficial e adota o código definitivo.');

// Falha do envio é honesta.
fetchResponse = { ok: false, json: async () => ({ message: 'Muitos relatos de erro em sequência.' }) };
assert.equal(await feature.send(), false);
assert.equal(elements.get('errorReportStatus').dataset.tone, 'error');
assert.match(elements.get('errorReportStatus').textContent, /Muitos relatos/);
console.log('✓ Falha do envio declarada com a mensagem real.');

// Escape fecha; clique no backdrop fecha; foco retorna ao gatilho.
elements.get('errorReportBackdrop').dispatch('keydown', { key: 'Escape', preventDefault() {}, stopPropagation() {} });
assert.equal(feature.isOpen, false);
await feature.open({ scope: 'Interface', message: 'Segundo erro.' });
elements.get('errorReportBackdrop').dispatch('click', { target: elements.get('errorReportBackdrop') });
assert.equal(feature.isOpen, false);
const trigger = makeElement('trigger');
documentRef.activeElement = trigger;
await feature.open({ scope: 'Interface', message: 'Terceiro erro.' });
feature.close();
assert.equal(documentRef.activeElement, trigger, 'Fechar devolve o foco ao gatilho.');
console.log('✓ Escape, backdrop e restauração de foco funcionam.');

// Sem mensagem não abre.
assert.equal(await feature.open({ scope: 'Interface', message: '   ' }), false);
console.log('✓ Relato sem mensagem é recusado.');

console.log('\n>>> FEATURE DE RELATO DE ERRO: PASS <<<\n');
