import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  AI_USAGE_LIMIT,
  classifyAiUsageError,
  emptyAiUsageHistory,
  normalizeAiUsageHistory,
  recordAiUsageEntry,
  summarizeAiUsage
} from '../lib/ai/ai-usage-ledger.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

console.log('\n===============================================================');
console.log('  ATRIUM — LEDGER DE USO DE IA E OCR                           ');
console.log('===============================================================\n');

assert.equal(classifyAiUsageError('Falha do provedor de IA (429): rate limit exceeded'), 'rate-limit');
assert.equal(classifyAiUsageError('Chave de API do Gemini inválida ou expirada.'), 'auth');
assert.equal(classifyAiUsageError('Tempo esgotado na consulta ao provedor de IA.'), 'timeout');
assert.equal(classifyAiUsageError('fetch failed'), 'network');
assert.equal(classifyAiUsageError('Tesseract OCR indisponível.'), 'engine');
assert.equal(classifyAiUsageError('Erro genérico do provedor.'), 'provider');
assert.equal(classifyAiUsageError(''), 'unknown');
console.log('✓ Classificação de falhas sem expor conteúdo.');

assert.deepEqual(normalizeAiUsageHistory('lixo'), emptyAiUsageHistory());
assert.equal(normalizeAiUsageHistory({ entries: [{ kind: 'ai' }, { kind: 'ocr' }, { kind: 'outro', at: 'x' }] }).entries.length, 0, 'Entradas sem tipo ou horário são descartadas.');
const normalized = normalizeAiUsageHistory({
  entries: [{ kind: 'ai', at: '2026-09-20T10:00:00.000Z', operation: 'op-invalida', promptTokens: '10', completionTokens: 5, ok: false }]
});
assert.equal(normalized.entries[0].operation, 'desconhecida');
assert.equal(normalized.entries[0].totalTokens, 15, 'Total é derivado quando o provedor não informa.');
assert.equal(normalized.entries[0].tokensReported, true);
assert.equal(normalized.entries[0].errorCategory, 'unknown', 'Falha sem categoria vira unknown, nunca sucesso.');
console.log('✓ Normalização fail-closed e derivação de tokens.');

let history = null;
for (let index = 0; index < AI_USAGE_LIMIT + 10; index += 1) {
  history = recordAiUsageEntry(history, {
    kind: 'ai', at: `2026-09-${String((index % 28) + 1).padStart(2, '0')}T10:00:00.000Z`,
    operation: 'assistente', provider: 'gemini', model: 'gemini-3.5-flash', ok: true, durationMs: 1200, totalTokens: 100
  });
}
assert.equal(history.entries.length, AI_USAGE_LIMIT, 'Ledger tem teto durável.');
console.log('✓ Teto do ledger respeitado.');

history = null;
history = recordAiUsageEntry(history, { kind: 'ai', at: '2026-09-20T10:00:00.000Z', operation: 'assistente', provider: 'gemini', model: 'gemini-3.5-flash', ok: true, durationMs: 900, promptTokens: 300, completionTokens: 200 });
history = recordAiUsageEntry(history, { kind: 'ai', at: '2026-09-20T11:00:00.000Z', operation: 'assistente', provider: 'gemini', model: 'gemini-3.5-flash', ok: false, errorCategory: 'rate-limit', durationMs: 200 });
history = recordAiUsageEntry(history, { kind: 'ai', at: '2026-09-20T12:00:00.000Z', operation: 'inteligencia-juridica', provider: 'openai', model: 'gpt-sintetico', ok: false, errorCategory: 'fallback' });
history = recordAiUsageEntry(history, { kind: 'ocr', at: '2026-09-20T13:00:00.000Z', operation: 'documento', engine: 'tesseract-local', ok: true, pages: 4, durationMs: 5200 });
history = recordAiUsageEntry(history, { kind: 'ocr', at: '2026-09-20T14:00:00.000Z', operation: 'anexo-assistente', engine: 'atrium-text-extractor', ok: false, errorCategory: 'engine' });
history = recordAiUsageEntry(history, { kind: 'ai', at: '2026-08-01T10:00:00.000Z', operation: 'assistente', provider: 'gemini', ok: true, totalTokens: 999 });

const summary = summarizeAiUsage(history, { now: '2026-09-21T00:00:00.000Z', days: 30 });
assert.equal(summary.windowDays, 30);
assert.equal(summary.ai.calls, 3, 'Chamadas fora da janela não entram no resumo.');
assert.equal(summary.ai.failures, 1, 'Fallback não é contado como falha de provedor.');
assert.equal(summary.ai.fallbacks, 1);
assert.equal(summary.ai.totalTokens, 500);
assert.equal(summary.ai.promptTokens, 300);
assert.equal(summary.ai.completionTokens, 200);
assert.equal(summary.ai.tokensReported, 1, 'Somente chamadas com tokens informados entram no total.');
assert.equal(summary.ai.byProvider[0].provider, 'gemini');
assert.equal(summary.ai.byProvider[0].calls, 2);
assert.equal(summary.ai.byProvider[0].failures, 1);
assert.equal(summary.ai.byProvider[0].totalTokens, 500);
assert.equal(summary.ocr.calls, 2);
assert.equal(summary.ocr.failures, 1);
assert.equal(summary.ocr.pages, 4);
assert.deepEqual(summary.ocr.byEngine.map(entry => entry.engine).sort(), ['atrium-text-extractor', 'tesseract-local']);
assert.equal(summary.ocr.byEngine.find(entry => entry.engine === 'tesseract-local').pages, 4);
assert.equal(summary.updatedAt, '2026-09-20T14:00:00.000Z');

const shortWindow = summarizeAiUsage(history, { now: '2026-09-20T14:30:00.000Z', days: 1 });
assert.equal(shortWindow.ai.calls, 3, 'Janela de 1 dia ainda cobre o mesmo dia civil do instante.');
console.log('✓ Resumo por janela, provedor, operação, engine e fallback separado.');

console.log('[C5] Contrato de wiring no servidor e no provedor...');
const [serverSource, providerSource] = await Promise.all([
  readFile(path.join(ROOT, 'server.mjs'), 'utf8'),
  readFile(path.join(ROOT, 'lib/ai/providers.mjs'), 'utf8')
]);
assert.match(serverSource, /function recordAiUsage\(/, 'Servidor deve ter o registrador do ledger.');
assert.match(serverSource, /aiUsageWriteChain/, 'Escritas do ledger devem ser serializadas.');
assert.match(serverSource, /operation: 'inteligencia-juridica'/, 'Fluxo de inteligência jurídica deve ser rotulado.');
assert.match(serverSource, /operation: 'conciliacao-clientes'/, 'Reconciliação por IA deve ser rotulada.');
assert.match(serverSource, /operation: 'teste-conexao'/, 'Teste de chave deve ser rotulado.');
assert.match(serverSource, /kind: 'ocr', operation: 'documento'/, 'OCR de documento deve ser registrado.');
assert.match(serverSource, /kind: 'ocr', operation: 'anexo-assistente'/, 'OCR de anexo deve ser registrado.');
assert.match(serverSource, /errorCategory: 'fallback'/, 'Degradação para o fluxo padrão deve ser registrada.');
assert.match(serverSource, /usageMetadata/, 'Gemini deve reportar tokens oficiais.');
assert.match(providerSource, /normalizeProviderUsage/, 'Provedores compatíveis devem extrair uso quando informado.');
console.log('✓ Wiring completo: provedores e hooks de IA/OCR.');

console.log('\n>>> LEDGER DE USO DE IA E OCR: PASS <<<\n');
