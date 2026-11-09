import assert from 'node:assert/strict';
import { generateTotp } from '../lib/security.mjs';
import { postJson, startTestServer } from './helpers.mjs';
// O teste verifica o estado sem chave: a chave da máquina não pode valer aqui.
delete process.env.GEMINI_API_KEY;

const SYNTHETIC_KEY = 'synthetic-legal-mcp-key-000000';
const PASSWORD = 'Intel-Juridica-Http-2026!';

console.log('\n===============================================================');
console.log('  ATRIUM — ROTAS HTTP DA INTELIGÊNCIA JURÍDICA');
console.log('===============================================================\n');

const server = await startTestServer({
  env: {
    ATRIUM_LEGAL_MCP_ENABLED: 'true',
    ATRIUM_LEGAL_MCP_BASE_URL: 'http://127.0.0.1:1/legal',
    ATRIUM_LEGAL_MCP_API_KEY: SYNTHETIC_KEY
  }
});

try {
  let response = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin.inteligencia.juridica',
    displayName: 'Administradora Inteligência Sintética',
    password: PASSWORD
  });
  const setup = await response.json();
  assert.equal(response.status, 200);
  response = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setup.setupToken,
    code: generateTotp(setup.manualSecret)
  });
  const verified = await response.json();
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const csrf = verified.csrfToken;
  assert.ok(cookie && csrf, 'Sessão de teste sem cookie ou CSRF.');

  const anonymous = await fetch(`${server.baseUrl}/api/legal-intelligence/status`);
  assert.equal(anonymous.status, 401, 'Status da inteligência jurídica exige autenticação.');
  const anonymousDraft = await postJson(`${server.baseUrl}/api/ai/draft`, { message: 'Elabore uma apelação.' });
  assert.equal(anonymousDraft.status, 401, 'Rascunho supervisionado exige autenticação.');
  console.log('  [1] Status e draft rejeitam requisição anônima (401).');

  const statusResponse = await fetch(`${server.baseUrl}/api/legal-intelligence/status`, { headers: { Cookie: cookie } });
  const status = await statusResponse.json();
  assert.equal(statusResponse.status, 200);
  assert.deepEqual(status.skills, { atrium: 9, lexIntelligentia: 7, total: 16 });
  assert.equal(status.recipes.total, 27);
  assert.equal(status.recipes.integrity, 'pinned');
  assert.equal(status.provider.configured, true);
  assert.equal(status.provider.hasApiKey, true);
  assert.ok(status.licenses.some(item => item.id === 'lex-intelligentia-skills' && item.license === 'MIT'));
  assert.ok(status.licenses.some(item => item.id === 'rom-agent' && item.license === 'LICENSE_REVIEW_REQUIRED'));
  assert.ok(status.licenses.some(item => item.id === 'biblioteca-prompts-juridicos' && item.license === 'NONE'));
  assert.ok(status.promptLibrary && status.promptLibrary.imported === false);
  assert.ok(!JSON.stringify(status).includes(SYNTHETIC_KEY), 'A chave do provider nunca pode aparecer na resposta de status.');
  console.log('  [2] Status autenticado expõe catálogo, licenças e integridade sem vazar credenciais.');

  const draftWithoutCsrf = await postJson(`${server.baseUrl}/api/ai/draft`, { message: 'Elabore uma apelação.' }, { Cookie: cookie });
  assert.equal(draftWithoutCsrf.status, 403, 'Draft sem X-CSRF-Token deve ser rejeitado.');
  const researchWithoutCsrf = await postJson(`${server.baseUrl}/api/legal-intelligence/research`, { claim: 'dano moral' }, { Cookie: cookie });
  assert.equal(researchWithoutCsrf.status, 403, 'Pesquisa sem X-CSRF-Token deve ser rejeitada.');
  console.log('  [3] Draft e pesquisa exigem CSRF (403 sem token).');

  const draftWithoutKey = await postJson(`${server.baseUrl}/api/ai/draft`, { message: 'Elabore uma apelação contra a sentença.' }, {
    Cookie: cookie,
    'X-CSRF-Token': csrf
  });
  const draftWithoutKeyBody = await draftWithoutKey.json();
  assert.equal(draftWithoutKey.status, 400);
  assert.match(draftWithoutKeyBody.message, /provedor de IA configurado/i);
  const legacyChatWithoutKey = await postJson(`${server.baseUrl}/api/ai/chat`, { message: 'Mensagem legada sintética', context: {}, history: [] }, {
    Cookie: cookie,
    'X-CSRF-Token': csrf
  });
  const legacyChatBody = await legacyChatWithoutKey.json();
  assert.equal(legacyChatWithoutKey.status, 400);
  assert.match(legacyChatBody.message, /provedor de IA configurado/i);
  console.log('  [4] Draft e chat legado com CSRF e sem provedor de IA falham com 400 e mensagem oficial (nenhuma chamada externa).');

  const research = await postJson(`${server.baseUrl}/api/legal-intelligence/research`, {
    claim: 'Responsabilidade civil por dano moral. CPF 123.456.789-00, CNPJ 12.345.678/0001-99, processo 0000000-00.2026.8.21.0001, variante 123456789-00 e 12 345 678 0001 99.'
  }, {
    Cookie: cookie,
    'X-CSRF-Token': csrf
  });
  const researchBody = await research.json();
  assert.equal(research.status, 200);
  assert.equal(researchBody.degraded, false);
  assert.equal(researchBody.ok, false, 'Provider inalcançável deve degradar sem derrubar a rota.');
  assert.ok(researchBody.results.length >= 1);
  assert.ok(researchBody.results.every(item => item.ok === false));
  assert.match(researchBody.claim, /\[CPF-REMOVIDO\]/);
  assert.match(researchBody.claim, /\[CNPJ-REMOVIDO\]/);
  assert.match(researchBody.claim, /\[PROCESSO-REMOVIDO\]/);
  assert.doesNotMatch(researchBody.claim, /123456789-00/, 'CPF sem pontuação oficial não pode vazar.');
  assert.doesNotMatch(researchBody.claim, /12 345 678 0001 99/, 'CNPJ com separadores não oficiais não pode vazar.');
  assert.ok(!JSON.stringify(researchBody).includes(SYNTHETIC_KEY));
  assert.match(researchBody.verification, /PENDENTE/);
  console.log('  [5] Pesquisa com provider indisponível degrada com 200, minimiza PII (inclusive não oficial) e não vaza a chave.');

  const skillsAsset = await fetch(`${server.baseUrl}/js/skills-data.js`);
  const skillsSource = await skillsAsset.text();
  assert.equal(skillsAsset.status, 200);
  assert.match(skillsSource, /lex-intelligentia/);
  assert.match(skillsSource, /rom|lex-intelligentia/);
  assert.ok(skillsSource.includes('"source": "lex-intelligentia"'));
  assert.ok(!skillsSource.includes(SYNTHETIC_KEY));
  assert.ok(!skillsSource.includes('ATRIUM_LEGAL_MCP'));
  const promptsAsset = await fetch(`${server.baseUrl}/js/prompts-data.js`);
  assert.equal(promptsAsset.status, 200);
  assert.ok(!(await promptsAsset.text()).includes(SYNTHETIC_KEY));
  const vendorProbe = await fetch(`${server.baseUrl}/vendor/legal-intelligence/UPSTREAM.json`);
  assert.equal(vendorProbe.status, 404, 'O material vendorado nunca pode ser servido como estático.');
  const catalogProbe = await fetch(`${server.baseUrl}/lib/legal-intelligence/catalog/skills-catalog.json`);
  assert.equal(catalogProbe.status, 404, 'O catálogo interno de runtime não pode ser servido como estático.');
  console.log('  [6] Catálogos públicos carregam as skills Lex; vendor e catálogo interno permanecem privados.');

  const statusAfter = await fetch(`${server.baseUrl}/api/legal-intelligence/status`, { headers: { Cookie: cookie } });
  assert.equal(statusAfter.status, 200, 'O Gerador permanece operacional após falha do provider externo.');
  console.log('  [7] O servidor permanece íntegro após a falha do provider externo.');

  // ── REVISÃO DE CITAÇÕES (GROUNDING) ──
  let stateResponse = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookie } });
  const stateEnvelope = await stateResponse.json();
  stateResponse = await postJson(`${server.baseUrl}/api/state`, { state: stateEnvelope.state || {} }, {
    Cookie: cookie,
    'X-CSRF-Token': csrf
  });
  const seededState = await stateResponse.json();
  assert.equal(stateResponse.status, 200, 'Estado sintético deve ser semeado para a auditoria do override.');
  const currentRevision = seededState.revision;

  const anonymousReview = await postJson(`${server.baseUrl}/api/legal-intelligence/citations/review`, { draft: 'A Súmula 999 do STJ.' });
  assert.equal(anonymousReview.status, 401, 'Revisão de citações exige autenticação.');
  const reviewWithoutCsrf = await postJson(`${server.baseUrl}/api/legal-intelligence/citations/review`, { draft: 'A Súmula 999 do STJ.' }, { Cookie: cookie });
  assert.equal(reviewWithoutCsrf.status, 403, 'Revisão de citações exige CSRF.');
  console.log('  [8] Revisão de citações exige sessão e CSRF.');

  const draftWithCitation = `${'Fundamentação sintética sobre o caso concreto. '.repeat(12)}\nA Súmula 999 do STJ sustenta integralmente o pedido.`;
  const reviewResponse = await postJson(`${server.baseUrl}/api/legal-intelligence/citations/review`, {
    draft: draftWithCitation,
    revision: currentRevision
  }, {
    Cookie: cookie,
    'X-CSRF-Token': csrf
  });
  const reviewBody = await reviewResponse.json();
  assert.equal(reviewResponse.status, 200);
  assert.equal(reviewBody.review.status, 'FAIL');
  assert.equal(reviewBody.review.ready, false);
  assert.equal(reviewBody.review.blockers.length, 1);
  assert.match(reviewBody.review.blockers[0].raw, /Súmula 999/);
  assert.equal(reviewBody.citations.counts.total, 1);
  assert.equal(reviewBody.citations.entries[0].status, 'unverified');
  console.log('  [9] Minuta com referência não confirmada reprova a revisão e lista o bloqueio.');

  const shortOverride = await postJson(`${server.baseUrl}/api/legal-intelligence/citations/review`, {
    draft: draftWithCitation,
    revision: currentRevision,
    override: { justification: 'ok' }
  }, {
    Cookie: cookie,
    'X-CSRF-Token': csrf
  });
  assert.equal(shortOverride.status, 400, 'Justificativa curta não pode valer como override.');
  console.log('  [10] Override exige justificativa mínima (400).');

  const groundedReview = await postJson(`${server.baseUrl}/api/legal-intelligence/citations/review`, {
    draft: 'A Súmula 331 do TST autoriza a terceirização.',
    message: 'A Súmula 331 do TST foi aplicada na sentença.',
    revision: currentRevision
  }, {
    Cookie: cookie,
    'X-CSRF-Token': csrf
  });
  const groundedBody = await groundedReview.json();
  assert.equal(groundedReview.status, 200);
  assert.equal(groundedBody.citations.entries[0].status, 'verified', 'Referência presente na mensagem é verificada.');
  assert.equal(groundedBody.review.ready, true);
  console.log('  [11] Referência confirmada na fonte fornecida passa sem bloqueio.');

  const overrideResponse = await postJson(`${server.baseUrl}/api/legal-intelligence/citations/review`, {
    draft: draftWithCitation,
    revision: currentRevision,
    override: { justification: 'Referência conferida manualmente no site oficial do STJ em 20/09/2026.' }
  }, {
    Cookie: cookie,
    'X-CSRF-Token': csrf
  });
  const overrideBody = await overrideResponse.json();
  assert.equal(overrideResponse.status, 200);
  assert.equal(overrideBody.review.ready, true);
  assert.equal(overrideBody.review.overrideApplied, true);
  assert.equal(overrideBody.review.blockers.length, 1, 'O bloqueio continua visível após o override.');
  assert.equal(overrideBody.review.override.actor, 'Administradora Inteligência Sintética');
  const stateAfterOverride = await (await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookie } })).json();
  const auditEntry = (stateAfterOverride.state?.audit || []).find(item => item.action === 'Revisão de citações com override');
  assert.ok(auditEntry, 'Override deve deixar registro de auditoria no workspace.');
  assert.match(auditEntry.detail, /1 bloqueio\(s\) assumido\(s\)/);
  assert.match(auditEntry.detail, /conferida manualmente/);
  assert.equal(auditEntry.actor, 'Administradora Inteligência Sintética');
  console.log('  [12] Override válido permite exportar com bloqueio assumido e gera auditoria.');

  // ── REVISÃO POR PARES (SEGUNDA PASSADA ADVERSARIAL) ──
  const anonymousDraftReview = await postJson(`${server.baseUrl}/api/legal-intelligence/reviews`, { draft: 'Minuta sintética.' });
  assert.equal(anonymousDraftReview.status, 401, 'Revisão por pares exige autenticação.');
  const draftReviewWithoutCsrf = await postJson(`${server.baseUrl}/api/legal-intelligence/reviews`, { draft: 'Minuta sintética.' }, { Cookie: cookie });
  assert.equal(draftReviewWithoutCsrf.status, 403, 'Revisão por pares exige CSRF.');
  const emptyDraftReview = await postJson(`${server.baseUrl}/api/legal-intelligence/reviews`, { draft: '   ' }, {
    Cookie: cookie,
    'X-CSRF-Token': csrf
  });
  assert.equal(emptyDraftReview.status, 400, 'Minuta vazia não pode ser revisada.');
  const unavailableProviderReview = await postJson(`${server.baseUrl}/api/legal-intelligence/reviews`, { draft: 'Minuta sintética com fundamentação.' }, {
    Cookie: cookie,
    'X-CSRF-Token': csrf
  });
  assert.equal(unavailableProviderReview.status, 400, 'Sem provedor de IA a revisão falha de forma honesta (400), nunca com sucesso presumido.');
  assert.match((await unavailableProviderReview.json()).message || '', /provedor de IA/i);
  console.log('  [13] Revisão por pares exige sessão, CSRF e minuta; sem provedor falha de forma honesta.');

  // ── PLANOS AGÊNTICOS SUPERVISIONADOS ──
  const planResponse = await postJson(`${server.baseUrl}/api/legal-intelligence/plans`, {
    message: 'Elabore a apelação e fundamente com jurisprudência do STJ.'
  }, {
    Cookie: cookie,
    'X-CSRF-Token': csrf
  });
  const planBody = await planResponse.json();
  assert.equal(planResponse.status, 200);
  assert.equal(planBody.plan.status, 'awaiting-approval');
  assert.equal(planBody.plan.steps.find(step => step.id === 'pesquisa').status, 'pending-approval');
  assert.equal(planBody.plan.steps.find(step => step.id === 'redacao').status, 'blocked');
  const planId = planBody.plan.id;
  assert.match(planId, /^plan-[a-z0-9-]+$/);

  const approvePlan = await postJson(`${server.baseUrl}/api/legal-intelligence/plans/${planId}/approve`, { stepId: 'pesquisa' }, {
    Cookie: cookie,
    'X-CSRF-Token': csrf
  });
  const approvedPlan = await approvePlan.json();
  assert.equal(approvePlan.status, 200);
  assert.equal(approvedPlan.plan.status, 'in_progress');
  assert.equal(approvedPlan.plan.steps.find(step => step.id === 'pesquisa').approvedBy, 'Administradora Inteligência Sintética');

  const runResearchStep = await postJson(`${server.baseUrl}/api/legal-intelligence/plans/${planId}/run`, { stepId: 'pesquisa' }, {
    Cookie: cookie,
    'X-CSRF-Token': csrf
  });
  const researchStepBody = await runResearchStep.json();
  assert.equal(runResearchStep.status, 200);
  assert.equal(researchStepBody.step.status, 'failed', 'Provider inalcançável deve falhar a etapa de pesquisa.');
  assert.match(researchStepBody.step.error, /pesquisa (error|unavailable)/);
  assert.equal(researchStepBody.plan.status, 'failed');

  const runDraftWithoutKey = await postJson(`${server.baseUrl}/api/legal-intelligence/plans/${planId}/run`, { stepId: 'redacao' }, {
    Cookie: cookie,
    'X-CSRF-Token': csrf
  });
  assert.equal(runDraftWithoutKey.status, 400, 'Redação sem provedor de IA configurado falha com 400.');

  const planDetailResponse = await fetch(`${server.baseUrl}/api/legal-intelligence/plans/${planId}`, { headers: { Cookie: cookie } });
  const planDetail = await planDetailResponse.json();
  assert.equal(planDetailResponse.status, 200);
  assert.equal(planDetail.artifacts.research.status, 'error');
  assert.equal(planDetail.artifacts.hasDraft, false);

  const planListResponse = await fetch(`${server.baseUrl}/api/legal-intelligence/plans`, { headers: { Cookie: cookie } });
  const planList = await planListResponse.json();
  assert.equal(planListResponse.status, 200);
  assert.ok(planList.plans.some(plan => plan.id === planId));

  const sseResponse = await fetch(`${server.baseUrl}/api/legal-intelligence/plans/${planId}/events`, { headers: { Cookie: cookie } });
  assert.equal(sseResponse.status, 200);
  assert.match(sseResponse.headers.get('content-type') || '', /text\/event-stream/);
  const sseText = await sseResponse.text();
  assert.match(sseText, /event: snapshot/, 'Plano terminal deve emitir snapshot e encerrar o stream.');

  const anonymousPlan = await postJson(`${server.baseUrl}/api/legal-intelligence/plans`, { message: 'Elabore a apelação.' });
  assert.equal(anonymousPlan.status, 401, 'Planos exigem sessão.');
  const planWithoutCsrf = await postJson(`${server.baseUrl}/api/legal-intelligence/plans`, { message: 'Elabore a apelação.' }, { Cookie: cookie });
  assert.equal(planWithoutCsrf.status, 403, 'Planos exigem CSRF.');
  console.log('  [13] Planos agênticos: criação supervisionada, aprovação, falha honesta, artefatos e SSE.');

  console.log('\n>>> LEGAL INTELLIGENCE HTTP: PASS <<<\n');
} finally {
  await server.stop();
}
