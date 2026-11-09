import assert from 'node:assert/strict';
import {
  LEGAL_MCP_PROVIDER_LIMIT,
  isSafeLegalMcpBaseUrl,
  resolveLegalMcpProviderConfigs,
  summarizeLegalMcpProviders
} from '../lib/legal-intelligence/providers/provider-registry.mjs';
import {
  dedupeResearchItems,
  detectResearchKind,
  normalizeResearchItem,
  rankResearchItems
} from '../lib/legal-intelligence/research-normalizer.mjs';
import { createResearchCache, researchCacheKey, runMultiSourceResearch } from '../lib/legal-intelligence/research-service.mjs';
import { runResearch } from '../lib/legal-intelligence/pipeline.mjs';
import { detectPieceIntent } from '../lib/legal-intelligence/router.mjs';

console.log('\n===============================================================');
console.log('  ATRIUM — PESQUISA JURIDICA MULTI-FONTE (FASE 2)               ');
console.log('===============================================================\n');

console.log('[C1] Registry de provedores...');
assert.equal(isSafeLegalMcpBaseUrl('https://api.mcp.ai/api/legal'), true);
assert.equal(isSafeLegalMcpBaseUrl('http://api.mcp.ai/api/legal'), false, 'HTTP não é aceito.');
assert.equal(isSafeLegalMcpBaseUrl('https://localhost/legal'), false);
assert.equal(isSafeLegalMcpBaseUrl('https://127.0.0.1/legal'), false);
assert.equal(isSafeLegalMcpBaseUrl('https://10.0.0.5/legal'), false);
assert.equal(isSafeLegalMcpBaseUrl('https://user:pass@api.mcp.ai/legal'), false, 'Credencial na URL não é aceita.');
assert.deepEqual(resolveLegalMcpProviderConfigs({}).providers, []);

const legacy = resolveLegalMcpProviderConfigs({ ATRIUM_LEGAL_MCP_ENABLED: 'true', ATRIUM_LEGAL_MCP_BASE_URL: 'https://api.mcp.ai/api/legal', ATRIUM_LEGAL_MCP_API_KEY: 'chave-sintetica' });
assert.equal(legacy.providers.length, 1);
assert.equal(legacy.providers[0].id, 'legal-mcp');
assert.deepEqual(legacy.providers[0].tools, ['jurisprudencia_buscar', 'jurisprudencia_sumulas']);
const legacyInsecure = resolveLegalMcpProviderConfigs({ ATRIUM_LEGAL_MCP_ENABLED: 'true', ATRIUM_LEGAL_MCP_BASE_URL: 'http://localhost:8080/legal' });
assert.equal(legacyInsecure.providers.length, 0);
assert.ok(legacyInsecure.issues.some(issue => issue.code === 'INVALID_BASE_URL'));

const multi = resolveLegalMcpProviderConfigs({
  ATRIUM_LEGAL_MCP_PROVIDERS: JSON.stringify([
    { id: 'juscraper', label: 'juscraper (FGV)', baseUrl: 'https://juris.example.test/api', courts: ['tjsp', 'tjrs'], tools: ['jurisprudencia_buscar'] },
    { id: 'brlaw', baseUrl: 'https://brlaw.example.test/mcp', tools: ['jurisprudencia_buscar', 'jurisprudencia_sumulas', 'natjus_buscar'] },
    { id: 'juscraper', baseUrl: 'https://outro.example.test/api' },
    { id: 'invalido', baseUrl: 'http://inseguro.example.test/api' }
  ])
});
assert.deepEqual(multi.providers.map(provider => provider.id), ['juscraper', 'brlaw']);
assert.deepEqual(multi.providers[0].courts, ['TJSP', 'TJRS']);
assert.deepEqual(multi.providers[1].tools, ['jurisprudencia_buscar', 'jurisprudencia_sumulas', 'natjus_buscar']);
assert.ok(multi.issues.some(issue => issue.code === 'DUPLICATE_PROVIDER'));
assert.ok(multi.issues.some(issue => issue.code === 'INVALID_PROVIDER'));

const overflow = resolveLegalMcpProviderConfigs({
  ATRIUM_LEGAL_MCP_PROVIDERS: JSON.stringify(Array.from({ length: LEGAL_MCP_PROVIDER_LIMIT + 3 }, (_, index) => ({
    id: `provedor-${index}`,
    baseUrl: `https://provedor-${index}.example.test/api`
  })))
});
assert.equal(overflow.providers.length, LEGAL_MCP_PROVIDER_LIMIT);
assert.ok(overflow.issues.some(issue => issue.code === 'PROVIDER_LIMIT'));
assert.ok(!JSON.stringify(summarizeLegalMcpProviders(multi.providers.map(provider => ({ ...provider, provider: null })))).includes('chave'));
console.log('  ✓ Legado, multi-provider, validação de URL, dedupe, limite e resumo sem segredo.');

console.log('[C2] Normalização de tipos e identidades...');
assert.equal(detectResearchKind('Súmula 331 do TST'), 'sumula');
assert.equal(detectResearchKind('Súmula Vinculante 14'), 'sumula-vinculante');
assert.equal(detectResearchKind('Tema 1234 do STJ'), 'tema');
assert.equal(detectResearchKind('Recurso Especial Repetitivo 987'), 'repetitivo');
assert.equal(detectResearchKind('RG 123'), 'rg');
assert.equal(detectResearchKind('IAC 5'), 'iac');
assert.equal(detectResearchKind('PUIL 2'), 'puil');
assert.equal(detectResearchKind('Nota técnica NATJus 44'), 'natjus');
assert.equal(detectResearchKind('art. 489, § 1º, do CPC'), 'legislacao');
const sumula = normalizeResearchItem({ titulo: 'Súmula 331', ementa: 'Súmula 331 do TST sobre terceirização.', tribunal: 'TST', link: 'https://tst.jus.br/sumula-331', dataPublicacao: '2011-05-24' }, { sourceId: 'p1', tool: 'jurisprudencia_sumulas' });
assert.equal(sumula.kind, 'sumula');
assert.equal(sumula.identifier, '331');
assert.equal(sumula.court, 'TST');
assert.equal(sumula.sourceId, 'p1');
assert.equal(normalizeResearchItem('Súmula 331 do TST', { sourceId: 'p2' }).identifier, '331', 'Item textual também é normalizado.');
assert.equal(normalizeResearchItem({}, { sourceId: 'p3' }), null, 'Item vazio não vira registro.');
console.log('  ✓ Tipos, identificadores, tribunal e descarte de item vazio.');

console.log('[C3] Dedupe e rerank...');
const duplicated = dedupeResearchItems([
  normalizeResearchItem({ titulo: 'Súmula 331', ementa: 'Súmula 331 do TST.', tribunal: 'TST' }, { sourceId: 'p1' }),
  normalizeResearchItem({ titulo: 'Súmula 331 do TST', ementa: 'Súmula 331 do TST sobre terceirização e responsabilidade subsidiária.', tribunal: 'TST', link: 'https://tst.jus.br/331' }, { sourceId: 'p2' })
]);
assert.equal(duplicated.items.length, 1, 'Mesma identidade+tribunal não duplica.');
assert.equal(duplicated.duplicates, 1);
assert.match(duplicated.items[0].summary, /responsabilidade subsidiária/, 'Resumo mais completo prevalece.');
assert.deepEqual(duplicated.items[0].sources.sort(), ['p1', 'p2']);

const ranked = rankResearchItems([
  normalizeResearchItem({ titulo: 'Acórdão genérico sobre terceirização', ementa: 'Decisão isolada.', tribunal: 'TJSP' }, { sourceId: 'p1' }),
  normalizeResearchItem({ titulo: 'Súmula 331 do TST', ementa: 'Terceirização e responsabilidade subsidiária.', tribunal: 'TST' }, { sourceId: 'p2' }),
  normalizeResearchItem({ titulo: 'Tema 1234 do STJ', ementa: 'Terceirização lícita.', tribunal: 'STJ' }, { sourceId: 'p1' })
], { claim: 'terceirização e responsabilidade subsidiária', preferredCourts: ['STJ'] });
assert.equal(ranked[0].court, 'STJ', 'Tribunal preferido com identificador lidera.');
assert.equal(ranked.at(-1).court, 'TJSP', 'Acórdão genérico fica por último.');
console.log('  ✓ Dedupe por identidade e rerank determinístico por aderência.');

console.log('[C4] Fan-out, cobertura e cache...');
function fakeProvider(behavior, { configured = true } = {}) {
  const calls = [];
  return {
    calls,
    isConfigured: () => configured,
    async callTool(tool, params) {
      calls.push({ tool, params });
      const result = behavior[tool];
      if (!result) return { ok: false, error: { code: 'TOOL_NOT_ALLOWED' } };
      return typeof result === 'function' ? result(params) : result;
    }
  };
}
const providerA = fakeProvider({
  jurisprudencia_buscar: { ok: true, result: { items: [{ titulo: 'Súmula 331 do TST', ementa: 'Terceirização.', tribunal: 'TST' }] } },
  jurisprudencia_sumulas: { ok: true, result: { items: [{ titulo: 'Tema 1234 do STJ', ementa: 'Terceirização lícita.', tribunal: 'STJ' }] } }
});
const providerB = fakeProvider({
  jurisprudencia_buscar: { ok: true, result: { items: [{ titulo: 'Súmula 331', ementa: 'Súmula 331 do TST sobre terceirização e responsabilidade subsidiária.', tribunal: 'TST' }, { titulo: 'REsp 1.234.567/RS', ementa: 'Recurso especial repetitivo sobre terceirização.', tribunal: 'STJ' }] } },
  jurisprudencia_sumulas: { ok: false, error: { code: 'RATE_LIMIT' } }
});
const providerC = fakeProvider({}, { configured: false });

const research = await runMultiSourceResearch({
  claim: 'terceirização e responsabilidade subsidiária',
  queries: ['terceirização e responsabilidade subsidiária'],
  sources: [
    { id: 'p1', label: 'Provedor A', courts: ['TST'], tools: ['jurisprudencia_buscar', 'jurisprudencia_sumulas'], provider: providerA },
    { id: 'p2', label: 'Provedor B', courts: ['STJ', 'TST'], tools: ['jurisprudencia_buscar', 'jurisprudencia_sumulas'], provider: providerB },
    { id: 'p3', label: 'Provedor C', courts: [], tools: ['jurisprudencia_buscar'], provider: providerC }
  ]
});
assert.equal(research.status, 'discovery');
assert.equal(research.partial, true, 'Fonte parcialmente falha marca a pesquisa como parcial.');
assert.equal(research.sources.find(source => source.id === 'p1').status, 'ok');
assert.equal(research.sources.find(source => source.id === 'p2').partial, true);
assert.equal(research.sources.find(source => source.id === 'p2').error, 'RATE_LIMIT');
assert.equal(research.sources.find(source => source.id === 'p3').status, 'unconfigured');
assert.equal(research.items.length, 3, 'Súmula 331 deduplicada entre provedores.');
assert.deepEqual(research.items.find(item => item.identifier === '331').sources.sort(), ['p1', 'p2']);
assert.match(research.verification, /PENDENTE/);

const natjusGated = await runMultiSourceResearch({
  claim: 'incapacidade',
  queries: ['incapacidade'],
  tools: ['jurisprudencia_buscar', 'natjus_buscar'],
  sources: [{ id: 'p1', label: 'Provedor A', courts: [], tools: ['jurisprudencia_buscar'], provider: providerA }]
});
assert.equal(providerA.calls.filter(call => call.tool === 'natjus_buscar').length, 0, 'Ferramenta não declarada nunca é chamada.');
assert.equal(natjusGated.sources[0].skippedTools, 1);

const allFailed = await runMultiSourceResearch({
  claim: 'x',
  queries: ['x'],
  sources: [
    { id: 'p1', label: 'A', tools: ['jurisprudencia_buscar'], provider: fakeProvider({ jurisprudencia_buscar: { ok: false, error: { code: 'PROVIDER_NETWORK' } } }) },
    { id: 'p2', label: 'B', tools: ['jurisprudencia_buscar'], provider: fakeProvider({ jurisprudencia_buscar: { ok: false, error: { code: 'PROVIDER_TIMEOUT' } } }) }
  ]
});
assert.equal(allFailed.status, 'error');
const noneConfigured = await runMultiSourceResearch({ claim: 'x', queries: ['x'], sources: [{ id: 'p1', label: 'A', provider: providerC }] });
assert.equal(noneConfigured.status, 'unavailable');

let clock = 1_000;
const cache = createResearchCache({ ttlMs: 100, now: () => clock });
const key = researchCacheKey({ claim: 'Terceirização', tools: ['jurisprudencia_buscar'], providerIds: ['p1'] });
cache.set(key, { status: 'discovery' });
assert.ok(cache.get(key));
clock += 101;
assert.equal(cache.get(key), null, 'Cache expira no TTL.');
for (let index = 0; index < 220; index += 1) cache.set(`k${index}`, { index });
assert.ok(cache.size <= 200, 'Cache tem teto de entradas.');
console.log('  ✓ Cobertura por fonte, dedupe global, NATJus por declaração, falha total e cache.');

console.log('[C5] Pipeline em modo multi-fonte e legado preservado...');
const researchMessage = 'Elabore a apelação e fundamente com jurisprudência do STJ e súmulas aplicáveis.';
const intent = detectPieceIntent(researchMessage);
assert.equal(intent.needs.research, true);
const pipelineCache = createResearchCache();
const multiResult = await runResearch({
  intent,
  message: researchMessage,
  provider: providerA,
  providers: [
    { id: 'p1', label: 'A', courts: ['TST'], tools: ['jurisprudencia_buscar', 'jurisprudencia_sumulas'], provider: providerA },
    { id: 'p2', label: 'B', courts: ['STJ'], tools: ['jurisprudencia_buscar'], provider: providerB }
  ],
  cache: pipelineCache
});
assert.equal(multiResult.provider, 'multi');
assert.equal(multiResult.status, 'discovery');
assert.ok(Array.isArray(multiResult.items) && multiResult.items.length >= 3);
assert.ok(multiResult.results.every(entry => typeof entry.ok === 'boolean' && typeof entry.provider === 'string'));
const callsAfterFirst = providerA.calls.length + providerB.calls.length;
const cachedResult = await runResearch({
  intent,
  message: researchMessage,
  provider: providerA,
  providers: [
    { id: 'p1', label: 'A', courts: ['TST'], tools: ['jurisprudencia_buscar', 'jurisprudencia_sumulas'], provider: providerA },
    { id: 'p2', label: 'B', courts: ['STJ'], tools: ['jurisprudencia_buscar'], provider: providerB }
  ],
  cache: pipelineCache
});
assert.equal(providerA.calls.length + providerB.calls.length, callsAfterFirst, 'Segunda consulta idêntica usa o cache.');
assert.deepEqual(cachedResult.items.map(item => item.identifier).sort(), multiResult.items.map(item => item.identifier).sort());

let legacyCalls = 0;
const legacyProvider = { isConfigured: () => true, researchClaim: async () => { legacyCalls += 1; return { ok: true, jurisprudence: { ok: true, result: { items: [] } }, sumulas: { ok: true, result: { items: [] } } }; } };
const legacyResult = await runResearch({ intent, message: researchMessage, provider: legacyProvider });
assert.equal(legacyResult.status, 'discovery');
assert.equal(legacyCalls, legacyResult.queries.length, 'Modo legado mantém uma chamada por consulta.');
console.log('  ✓ Multi-fonte no pipeline, cache por claim e caminho legado intacto.');

console.log('\n>>> PESQUISA JURIDICA MULTI-FONTE: PASS <<<\n');
