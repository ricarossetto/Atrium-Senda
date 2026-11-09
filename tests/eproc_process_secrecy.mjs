import assert from 'node:assert/strict';
import { extractProcessSecrecy, extractProcessSecrecyLevel, describeProcessSecrecy } from '../lib/judicial/eproc/parsers/process-secrecy.mjs';
import { reconcileSourceSecrecy } from '../lib/judicial/eproc-a1-downloader.mjs';
import { computeEprocProcessDelta } from '../lib/judicial/eproc/sync/delta-sync.mjs';

console.log('\n=== SIGILO DO PROCESSO (EPROC) — DETECÇÃO E RECONCILIAÇÃO ===\n');

// A fonte: nível do processo, nunca rótulos por documento/anexo.
assert.equal(extractProcessSecrecyLevel('<div>Nível de Sigilo: 0 (Público)</div>'), 0);
assert.equal(extractProcessSecrecyLevel('<div>Nível de Sigilo: 2</div>'), 2);
assert.equal(extractProcessSecrecyLevel('<div>Nível de sigilo deste processo (1)</div>'), 1);
assert.equal(extractProcessSecrecyLevel('<input id="txtNivelSigilo" value="3">'), 3);
assert.equal(extractProcessSecrecyLevel('<input value="4" id="nivelSigilo">'), 4);
assert.equal(extractProcessSecrecyLevel(`
  <table><tr><td>Sem Sigilo (Nível 0)</td></tr><tr><td>Segredo de Justiça (Nível 1)</td></tr></table>`), 0, 'Anexos não definem o sigilo do processo.');
assert.equal(extractProcessSecrecyLevel('<div>Processos com nível de sigilo superior a 1 devem ser enviados</div>'), 0);
assert.equal(extractProcessSecrecyLevel(''), 0);
assert.equal(describeProcessSecrecy(0), '');
assert.equal(describeProcessSecrecy(2), 'Segredo de Justiça (Nível 2)');
console.log('✓ Nível do processo extraído sem contaminação de anexos.');

// Evidência explícita: nível 0 declarado é evidência; ausência de texto não é.
assert.deepEqual(extractProcessSecrecy('<div>Nível de Sigilo: 0 (Público)</div>'), { level: 0, explicit: true });
assert.deepEqual(extractProcessSecrecy('<div>Sem menção de nível</div>'), { level: 0, explicit: false });
assert.deepEqual(extractProcessSecrecy(''), { level: 0, explicit: false });
console.log('✓ Nível declarado é distinguido de nível ausente.');

// Reconciliação com a fonte oficial.
const marked = { id: 'p1', number: '0000001-58.2099.8.21.0000', secrecy: false, secrecyLevel: '', tags: ['eproc'] };
assert.equal(reconcileSourceSecrecy(marked, { secrecy: true, secrecyLevel: 'Segredo de Justiça (Nível 2)' }), true);
assert.equal(marked.secrecy, true);
assert.equal(marked.secrecyLevel, 'Segredo de Justiça (Nível 2)');
assert.ok(marked.tags.includes('segredo-de-justica'));
assert.ok(marked.secrecyReviewedAt, 'Sigilo confirmado pela fonte sai da fila de revisão única.');

// Fonte confirmou nível 0 explícito: limpa a marcação de origem.
assert.equal(reconcileSourceSecrecy(marked, { secrecy: false, secrecyLevel: '', secrecyExplicit: true }), true);
assert.equal(marked.secrecy, false);
assert.equal(marked.secrecyLevel, '');
assert.equal(marked.tags.includes('segredo-de-justica'), false);

// Marca legada sem tag (anterior à proveniência) também é limpa quando a fonte
// declara nível 0 — era o caso dos processos marcados pela detecção antiga.
const legacy = { id: 'p4', number: '0000004-58.2099.8.21.0000', secrecy: true, secrecyLevel: 'Segredo de Justiça', tags: ['eproc'] };
assert.equal(reconcileSourceSecrecy(legacy, { secrecy: false, secrecyExplicit: true }), true);
assert.equal(legacy.secrecy, false, 'Marca legada de origem é limpa com nível 0 explícito.');
assert.equal(legacy.secrecyLevel, '');

// Sem nível declarado não há evidência: a marca é mantida e registra revisão única.
const unverifiable = { id: 'p5', number: '0000005-58.2099.8.21.0000', secrecy: true, secrecyLevel: 'Segredo de Justiça', tags: ['eproc'] };
assert.equal(reconcileSourceSecrecy(unverifiable, { secrecy: false, secrecyExplicit: false }), true);
assert.equal(unverifiable.secrecy, true, 'Sem evidência, a marca permanece.');
assert.ok(unverifiable.secrecyReviewedAt, 'Revisão registrada para não repetir a leitura.');
assert.equal(reconcileSourceSecrecy(unverifiable, { secrecy: false, secrecyExplicit: false }), true, 'Segunda leitura sem evidência limpa o resíduo legado.');
assert.equal(unverifiable.secrecy, false, 'Segunda leitura sem evidência limpa o resíduo legado.');
assert.equal((unverifiable.tags || []).includes('segredo-de-justica'), false);

// Marcação manual do usuário prevalece sobre a fonte.
const manual = { id: 'p2', number: '0000002-58.2099.8.21.0000', secrecy: true, secrecyLevel: 'Manual', secrecyManual: true, tags: ['eproc'] };
assert.equal(reconcileSourceSecrecy(manual, { secrecy: false, secrecyExplicit: true }), false);
assert.equal(manual.secrecy, true, 'Marcação manual permanece.');
assert.equal(manual.secrecyLevel, 'Manual');

// Registro público que segue público não é alterado.
const publicProcess = { id: 'p3', number: '0000003-58.2099.8.21.0000', secrecy: false, tags: ['eproc'] };
assert.equal(reconcileSourceSecrecy(publicProcess, { secrecy: false }), false);
console.log('✓ Reconciliação marca, limpa origem (inclusive legada) e preserva marcação manual.');

// O sweep precisa reler uma vez a marca legada, mesmo em processo UNCHANGED.
const incoming = [{ number: '0000009-58.2099.8.21.0000', lastEvent: 'PETIÇÃO PROTOCOLADA' }];
const base = { number: '0000009-58.2099.8.21.0000', lastEvent: 'PETIÇÃO PROTOCOLADA', id: 'proc-9' };
const legacyDelta = computeEprocProcessDelta(incoming, [{ ...base, secrecy: true, tags: ['eproc'] }], { portalId: 'eproc-1g' });
assert.equal(legacyDelta.legacySecrecyReviewCount, 1);
assert.equal(legacyDelta.enrichmentCandidates.length, 1, 'Marca legada entra como candidato de releitura.');
assert.equal(legacyDelta.enrichmentCandidates[0].enrichmentStatus, 'PENDING');

const manualDelta = computeEprocProcessDelta(incoming, [{ ...base, secrecy: true, secrecyManual: true, tags: ['eproc'] }], { portalId: 'eproc-1g' });
assert.equal(manualDelta.legacySecrecyReviewCount, 0, 'Marcação manual não é relida.');
assert.equal(manualDelta.enrichmentCandidates.length, 0);

// Marca com tag de origem também é relida uma vez enquanto não houver confirmação
// registrada (marcas legadas do downloader antigo carregam a tag e nunca foram
// confirmadas contra a página).
const taggedDelta = computeEprocProcessDelta(incoming, [{ ...base, secrecy: true, tags: ['eproc', 'segredo-de-justica'] }], { portalId: 'eproc-1g' });
assert.equal(taggedDelta.legacySecrecyReviewCount, 1, 'Marca com tag sem confirmação registrada entra na revisão única.');

const confirmedDelta = computeEprocProcessDelta(incoming, [{
  ...base,
  secrecy: true,
  secrecyReviewedAt: '2026-09-21T00:00:00.000Z',
  tags: ['eproc', 'segredo-de-justica']
}], { portalId: 'eproc-1g' });
assert.equal(confirmedDelta.legacySecrecyReviewCount, 0, 'Marca confirmada pela fonte (revisada) não é relida.');

const reviewedDelta = computeEprocProcessDelta(incoming, [{ ...base, secrecy: true, secrecyReviewedAt: '2026-09-21T00:00:00.000Z', tags: ['eproc'] }], { portalId: 'eproc-1g' });
assert.equal(reviewedDelta.legacySecrecyReviewCount, 0, 'Revisão única não se repete.');
console.log('✓ Delta agenda releitura única para toda marca sem confirmação registrada.');


// Normalizacao do residuo legado: duas leituras oficiais sem evidencia de sigilo
// limpam a marca de origem (a capa real nao declara nivel de sigilo em texto).
{
  const residuo = { secrecy: true, secrecyLevel: 'Segredo de Justi?a (N?vel 1)', tags: ['segredo-de-justica'] };
  assert.equal(reconcileSourceSecrecy(residuo, { secrecy: false, secrecyExplicit: false }), true, 'Primeira leitura revisa sem limpar.');
  assert.equal(residuo.secrecy, true, 'Sem evidencia a marca fica ate a segunda leitura.');
  assert.ok(residuo.secrecyReviewedAt);
  assert.equal(reconcileSourceSecrecy(residuo, { secrecy: false, secrecyExplicit: false }), true, 'Segunda leitura sem evidencia limpa o residuo.');
  assert.equal(residuo.secrecy, false);
  assert.equal((residuo.tags || []).includes('segredo-de-justica'), false);
  assert.equal('secrecyReviewedAt' in residuo, false);

  const manual = { secrecy: true, secrecyManual: true, secrecyReviewedAt: '2026-09-22T00:00:00.000Z', tags: ['segredo-de-justica'] };
  assert.equal(reconcileSourceSecrecy(manual, { secrecy: false, secrecyExplicit: false }), false, 'Marca manual nunca e normalizada.');
  assert.equal(manual.secrecy, true);

  const confirmado = { secrecy: true, tags: ['segredo-de-justica'] };
  assert.equal(reconcileSourceSecrecy(confirmado, { secrecy: true, secrecyLevel: 'Segredo de Justi?a (N?vel 2)' }), true);
  assert.equal(confirmado.secrecy, true, 'Sigilo confirmado pela fonte permanece.');
  assert.ok(confirmado.secrecyReviewedAt, 'Confirmado sai da fila de revisao.');
}
console.log('OK: normalizacao do residuo legado em duas leituras, manual preservada.');
console.log('\n>>> SIGILO DO PROCESSO: PASS <<<\n');
