import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeIntimationPairIntoState } from '../lib/publications/canonical-intimation-state.mjs';
import { serverSourceText } from './server-source.mjs';

console.log('--- Iniciando Testes Unitários: Fusão oficial de um par de publicações (confirmação humana) ---');

const CNJ = '5001234-56.2026.8.21.0001';
const INTIMATION_ID = 'intimation:eproc:50012345620268210001-20260911-962d77';
const EPROC_ID = 'eproc:tjrs-eproc-1g:deadbeefdeadbeefdeadbeefdeadbeef';

function legacyRecord(overrides = {}) {
  return {
    id: INTIMATION_ID,
    externalId: INTIMATION_ID,
    process: CNJ,
    processNumber: CNJ,
    source: 'eproc',
    event: 'Intimação · Decisão',
    title: 'Intimação eproc (importada)',
    text: 'Teor sintético importado.',
    sourceReportedAt: '2026-09-11',
    sourceReportedDeadlineAt: '2026-09-21',
    status: 'pendente',
    treatmentStatus: 'untreated',
    createdAt: '2026-09-11T10:00:00.000Z',
    ...overrides
  };
}

function collectedRecord(overrides = {}) {
  return {
    id: EPROC_ID,
    externalId: EPROC_ID,
    process: CNJ,
    processNumber: CNJ,
    source: 'eproc',
    portalId: 'tjrs-eproc-1g',
    event: 'Intimação · Decisão',
    title: 'Intimação eproc',
    sourceText: 'Texto integral sintético coletado no Painel do Advogado.',
    sourceReportedAt: '2026-09-11',
    sourceReportedDeadlineAt: '2026-09-21',
    sourceStatus: 'active',
    treatmentStatus: 'in_review',
    linkedTaskIds: ['task-keeper'],
    createdAt: '2026-09-11T09:00:00.000Z',
    ...overrides
  };
}

function stateWith(overrides = {}) {
  return {
    intimations: [legacyRecord(), collectedRecord()],
    tasks: [{
      id: 'task-loser',
      title: 'Conferir prazo',
      status: 'triagem',
      intimationId: INTIMATION_ID,
      sourceIntimationId: INTIMATION_ID,
      deadline: '2026-09-21'
    }],
    audit: [],
    ...overrides
  };
}

// A) Fusão de par confirmado por pessoa ---------------------------------------------------
{
  const state = stateWith();
  const result = mergeIntimationPairIntoState(state, INTIMATION_ID, EPROC_ID, {
    actor: 'Advogada Teste',
    nowIso: '2026-09-29T10:00:00.000Z'
  });
  assert.equal(result.merged, true);
  assert.equal(result.keeperId, EPROC_ID, 'keeper é o registro coletado (fonte oficial)');
  assert.equal(result.loserId, INTIMATION_ID);

  const keeper = state.intimations.find(item => item.id === EPROC_ID);
  const loser = state.intimations.find(item => item.id === INTIMATION_ID);
  assert.equal(state.intimations.length, 2, 'fusão nunca remove registro');
  assert.equal(loser.mergedInto, EPROC_ID, 'absorvido vira alias reversível');
  assert.equal(loser.mergeReviewedBy, 'Advogada Teste', 'autoria humana registrada no alias');
  assert.equal(keeper.mergedInto, undefined);
  assert.ok(keeper.text, 'conteúdo do perdedor enriquece o keeper quando aplicável');
  assert.equal(keeper.linkedTaskIds.includes('task-loser'), true, 'tarefa reapontada entra em linkedTaskIds');

  const task = state.tasks.find(item => item.id === 'task-loser');
  assert.equal(task.intimationId, EPROC_ID, 'tarefa reapontada para o keeper');
  assert.equal(task.sourceIntimationId, EPROC_ID);
  assert.equal(task.deadline, '2026-09-21', 'prazo existente da tarefa permanece intocado');

  assert.equal(state.audit.length, 1);
  assert.match(state.audit[0].action, /confirmação humana/);
  assert.equal(state.audit[0].actor, 'Advogada Teste');
  assert.ok(!JSON.stringify(state.audit[0]).includes('Teor sintético'), 'auditoria sem conteúdo');
  console.log('  OK: par confirmado é fundido com alias reversível, tarefas reapontadas e auditoria.');
}

// B) Idempotência e recusas explícitas ----------------------------------------------------
{
  const state = stateWith();
  mergeIntimationPairIntoState(state, INTIMATION_ID, EPROC_ID, { actor: 'Teste' });
  const again = mergeIntimationPairIntoState(state, INTIMATION_ID, EPROC_ID, { actor: 'Teste' });
  assert.equal(again.merged, false);
  assert.equal(again.reason, 'ja-fundido', 'segunda confirmação não funde de novo');
  assert.equal(state.audit.length, 1, 'auditoria não duplica');

  const missing = mergeIntimationPairIntoState(stateWith(), INTIMATION_ID, 'nao-existe');
  assert.equal(missing.reason, 'registro-ausente');
  const same = mergeIntimationPairIntoState(stateWith(), INTIMATION_ID, INTIMATION_ID);
  assert.equal(same.reason, 'mesmo-registro');
  const empty = mergeIntimationPairIntoState(null, INTIMATION_ID, EPROC_ID);
  assert.equal(empty.reason, 'estado-ausente');
  console.log('  OK: idempotente e recusa par ausente/repetido sem efeito colateral.');
}

// C) Conflito de tratamento impede a fusão automática do par ------------------------------
{
  const state = stateWith({ intimations: [legacyRecord({ treatmentStatus: 'treated', treatedAt: '2026-09-12T10:00:00.000Z' }), collectedRecord({ treatmentStatus: 'discarded', discardedAt: '2026-09-13T10:00:00.000Z' })] });
  const result = mergeIntimationPairIntoState(state, INTIMATION_ID, EPROC_ID, { actor: 'Teste' });
  assert.equal(result.merged, false);
  assert.equal(result.reason, 'treatment-conflict', 'tratada × descartada é decisão humana, não fusão');
  assert.equal(state.intimations.every(item => !item.mergedInto), true);
  console.log('  OK: conflito de tratamento bloqueia a fusão.');
}

// D) Contrato da rota: fusão oficial, autenticada e sem atalho administrativo ------------
{
  const review = readFileSync(new URL('../lib/publications/duplicate-review.mjs', import.meta.url), 'utf8');
  assert.match(review, /filter\(record => record && !record\.mergedInto\)/, 'pares com registro já absorvido não entram na conferência');
  const server = serverSourceText;
  const routeIndex = server.indexOf("url.pathname === '/api/publications/merge'");
  assert.ok(routeIndex > 0, 'rota de fusão confirmada existe');
  const block = server.slice(routeIndex, routeIndex + 4_000);
  assert.match(block, /assertAuthenticated\(req, true\)/, 'exige sessão e CSRF');
  assert.match(block, /mergeIntimationPairIntoState\(/, 'usa o motor oficial de fusão');
  assert.match(block, /saveAppStateDirect\(envelope\.state, envelope\.revision\)/, 'persiste com CAS na revisão lida no servidor');
  assert.doesNotMatch(block, /body\.revision !== envelope\.revision/, 'não exige a revisão da tela: o acervo é reescrito com frequência e o clique morria em 409');
  assert.doesNotMatch(block, /assertAdmin\(/, 'fusão é curadoria do acervo, não ato administrativo');
  const presenter = readFileSync(new URL('../js/views/ui-v2/publications-presenter.js', import.meta.url), 'utf8');
  assert.match(presenter, /data-duplicate-action="merge"/, 'painel oferece o botão de confirmar fusão');
  assert.match(presenter, /data-duplicate-action="merge-confirm"/, 'confirmação em dois passos existe');
  const feature = readFileSync(new URL('../js/features/publications.js', import.meta.url), 'utf8');
  assert.match(feature, /mergeDuplicatePair\(/, 'feature envia a fusão pelo POST oficial');
  assert.match(feature, /'\/api\/publications\/merge'/, 'rota correta no cliente');
  assert.match(feature, /data\.code !== 'MERGE_REFUSED'/, 'recusa do par não é confundida com revisão velha');
  assert.match(feature, /staleRevision && attempt === 1[\s\S]{0,60}await onSyncAppState\?\.\(\)[\s\S]{0,20}continue;/, 'revisão velha ressincroniza e repete uma vez');
  assert.match(feature, /ja-fundido/i, 'cliente explica quando o par já estava fundido');
  console.log('  OK: rota, painel e cliente usam a fusão confirmada sem atalhos.');
}

// E) Fusão sem recarregar: estado local, revisão adotada e saída suave ---------------------
{
  const feature = readFileSync(new URL('../js/features/publications.js', import.meta.url), 'utf8');
  const mergeBlock = feature.slice(
    feature.indexOf('async mergeDuplicatePair('),
    feature.indexOf('applyMergedPairLocally(keeperId, loserId, revision) {')
  );
  assert.match(mergeBlock, /this\.applyMergedPairLocally\(data\.keeperId, data\.loserId, data\.revision\)/, 'fusão bem-sucedida é aplicada no estado local');
  assert.doesNotMatch(mergeBlock, /await onSyncAppState\?\.\(\);\s*\n\s*toast/, 'a fusão não ressincroniza por reload no caminho de sucesso');
  assert.match(mergeBlock, /await this\.fadeDuplicatePair\(/, 'a linha do par sai com transição suave');
  assert.match(feature, /applyMergedPairLocally\(keeperId, loserId, revision\)/, 'aplicação local declara keeper/perdedor/revisão');
  assert.match(feature, /typeof store\.adoptServerRevision === 'function'/, 'revisão do servidor é adotada (com caminho alternativo para store.js antigo em cache)');
  assert.match(feature, /store\.persistedFingerprint = store\.persistenceFingerprint\(\);/, 'adoção marca o estado como persistido');
  assert.match(feature, /fadeDuplicatePair\(key\)/, 'saída suave implementada');
  assert.match(feature, /prefersReducedMotion\(\)/, 'quem pediu menos movimento não vê animação');

  const store = readFileSync(new URL('../js/core/store.js', import.meta.url), 'utf8');
  assert.match(store, /adoptServerRevision\(revision\) \{/, 'Store adota a revisão devolvida pela rota');
  assert.match(store, /this\.persistedFingerprint = this\.persistenceFingerprint\(\);/, 'adoção marca o estado como persistido');

  const portal = readFileSync(new URL('../js/portal.js', import.meta.url), 'utf8');
  const syncBlock = portal.slice(portal.indexOf('onSyncAppState:'), portal.indexOf('onSyncAppState:') + 400);
  assert.match(syncBlock, /await Store\.load\(\);/, 'ressincronização relê o estado consolidado');
  assert.match(syncBlock, /App\.renderAll\(\);/, 'ressincronização redesenha as views');
  assert.doesNotMatch(syncBlock, /location\.reload\(\)/, 'ressincronização NÃO recarrega a página');

  // Descartar sugestão e confirmação em lote no cliente -------------------------------------------------
  assert.match(feature, /'\/api\/ai-classifier\/duplicate-dismiss'/, 'descarte usa a rota oficial');
  assert.match(feature, /async dismissDuplicatePair\(/, 'feature expõe o descarte por par');
  assert.match(feature, /duplicateReview = \{ \.\.\.duplicateReview, pairs: duplicateReview\.pairs\.filter\(pair => pair\.key !== pairKey\) \}/, 'par descartado sai da lista local');
  assert.match(feature, /async confirmAllDuplicatePairs\(/, 'feature expõe a confirmação em lote');
  assert.match(feature, /pair\.verdict === 'mesma'/, 'lote só considera sugestões de mesma publicação');
  assert.match(feature, /const riskConfirm = getRiskConfirm\(\);[\s\S]{0,900}await riskConfirm\.open\(/, 'lote passa pelo alerta de riscos padrão Atrium');
  assert.match(feature, /from '\.\.\/components\/risk-confirm\.js\?v=/, 'alerta de riscos é componente compartilhado e versionado');
  console.log('  OK: fusão sem recarregar, descarte por par e lote com alerta de riscos.');
}

// F) Lote: recarrega a revisão de duplicatas ao terminar e a recusa fica sinalizada ----------
{
  const feature = readFileSync(new URL('../js/features/publications.js', import.meta.url), 'utf8');
  const batchBlock = feature.slice(
    feature.indexOf('async confirmAllDuplicatePairs('),
    feature.indexOf('renderDuplicateReview() {')
  );
  assert.match(
    batchBlock,
    /await this\.loadDuplicateReview\(\);[\s\S]{0,200}const confirmable = duplicateReview\.pairs\.filter\(pair => pair\.verdict === 'mesma'\)/,
    'o lote parte da revisão fresca da conferência'
  );
  assert.match(
    batchBlock,
    /finally \{[\s\S]{0,400}duplicateBulkRunning = false;[\s\S]{0,200}await this\.loadDuplicateReview\(\);[\s\S]{0,200}this\.renderDuplicateReview\(\);/,
    'o lote recarrega a revisão de duplicatas ao terminar'
  );
  assert.match(batchBlock, /outcome\?\.refusal\?\.alreadyMerged/, 'o resumo do lote distingue par já fundido de recusa com motivo');
  assert.match(feature, /function duplicateRefusalOf\(data, status\)/, 'a recusa é classificada num lugar só');
  assert.match(
    feature,
    /code === 'MERGE_REFUSED'[\s\S]{0,400}alreadyMerged: chave === 'ja-fundido'/,
    'recusa definitiva (409 com MERGE_REFUSED) é reconhecida pelo motivo do servidor'
  );
  assert.match(
    feature,
    /if \(refusal\?\.alreadyMerged\) \{[\s\S]{0,300}pairs: duplicateReview\.pairs\.filter\(pair => pair\.key !== pairKey\)/,
    'par já fundido sai da conferência na hora'
  );
  assert.match(
    feature,
    /else if \(refusal\) \{[\s\S]{0,500}duplicateReviewRefusals\.set\(pairKey, refusal\);/,
    'conflito de teor permanece na conferência marcado com o motivo'
  );
  assert.match(feature, /const presentes = new Set\(duplicateReview\.pairs\.map\(pair => pair\.key\)\)/, 'a marca de recusa é podada pela lista vigente');
  assert.match(feature, /for \(const key of \[\.\.\.duplicateReviewRefusals\.keys\(\)\]\)/, 'a podagem varre as marcas registradas');
  assert.match(feature, /refusal: duplicateReviewRefusals\.get\(pair\.key\) \|\| null/, 'o modelo do painel entrega a recusa do par');

  const presenter = readFileSync(new URL('../js/views/ui-v2/publications-presenter.js', import.meta.url), 'utf8');
  assert.match(presenter, /class="duplicate-refusal"/, 'o painel renderiza o motivo da recusa');
  const css = readFileSync(new URL('../css/views/ui-v2/publications.css', import.meta.url), 'utf8');
  assert.match(css, /\.duplicate-refusal \{/, 'a marca de recusa tem estilo próprio (light/dark pelos tokens)');
  console.log('  OK: lote recarrega a revisão ao terminar e a recusa permanece marcada com o motivo.');
}

console.log('\n[PASS] Fusão de par de duplicatas validada.');
