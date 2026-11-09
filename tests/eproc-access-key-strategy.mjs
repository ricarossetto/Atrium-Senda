import assert from 'node:assert/strict';
import { AccessKeyEnrichmentStrategy, ENRICHMENT_STATUS } from '../lib/judicial/eproc/enrichment/access-key-strategy.mjs';
import { computeEprocProcessDelta } from '../lib/judicial/eproc/sync/delta-sync.mjs';

async function runAccessKeyStrategyTest() {
  console.log('=== TESTE FOCAL: ACCESS KEY ENRICHMENT STRATEGY (WAVE D) ===\n');

  // Scenario 1: Key exists in vault and is valid
  const vault1 = new Map([['50000010020268210016', 'valid_vault_key_111']]);
  const strategy1 = new AccessKeyEnrichmentStrategy({
    credentialManager: {
      getProcessAccessKey: async (cnj) => vault1.get(cnj),
      saveProcessAccessKey: async (cnj, { accessKey }) => vault1.set(cnj, accessKey)
    },
    publicSearchClient: {
      searchByProcessKey: async ({ cnj, accessKey }) => {
        return { ok: true, data: { cnj, accessKey, source: 'PUBLIC_SEARCH' } };
      }
    }
  });

  const res1 = await strategy1.enrichProcess({ cnj: '5000001-00.2026.8.21.0016', portalId: 'tjrs-eproc-1g' });
  assert.equal(res1.ok, true);
  assert.equal(res1.strategy, 'VAULT_KEY_PUBLIC_SEARCH');
  assert.equal(res1.keyRefreshed, false);
  console.log('✓ 1. Cenário 1: Chave do cofre utilizada diretamente na consulta pública (zero overhead de sessão).');

  // Scenario 2: Key in vault expired -> ONE authenticated refresh -> Updates vault -> Public search
  const vault2 = new Map([['50000020020268210016', 'expired_key_222']]);
  let sessionCallCount = 0;
  let publicCallCount = 0;

  const strategy2 = new AccessKeyEnrichmentStrategy({
    credentialManager: {
      getProcessAccessKey: async (cnj) => vault2.get(cnj),
      saveProcessAccessKey: async (cnj, { accessKey }) => vault2.set(cnj, accessKey)
    },
    publicSearchClient: {
      searchByProcessKey: async ({ cnj, accessKey }) => {
        publicCallCount++;
        if (accessKey === 'expired_key_222') {
          return { ok: false, reason: 'KEY_EXPIRED', error: 'Chave expirada ou revogada pelo cartório.' };
        }
        return { ok: true, data: { cnj, accessKey, source: 'PUBLIC_SEARCH_AFTER_REFRESH' } };
      }
    },
    sessionObserver: {
      fetchProcessAccessKey: async ({ cnj }) => {
        sessionCallCount++;
        return { ok: true, accessKey: 'fresh_refreshed_key_333' };
      }
    }
  });

  const res2 = await strategy2.enrichProcess({ cnj: '5000002-00.2026.8.21.0016', portalId: 'tjrs-eproc-1g' });
  assert.equal(res2.ok, true);
  assert.equal(res2.strategy, 'REFRESHED_KEY_PUBLIC_SEARCH');
  assert.equal(res2.keyRefreshed, true);
  assert.equal(sessionCallCount, 1, 'Deve realizar exatamente UMA tentativa de renovação');
  assert.equal(publicCallCount, 2, 'Deve consultar a chave antiga e depois a renovada');
  assert.equal(vault2.get('50000020020268210016'), 'fresh_refreshed_key_333', 'Cofre atualizado atomicamente');
  console.log('✓ 2. Cenário 2: Chave expirada renovada atomicamente em uma única tentativa de sessão.');

  // Scenario 3: Key absent from vault -> Extracted via session -> Saved in vault
  const vault3 = new Map();
  const strategy3 = new AccessKeyEnrichmentStrategy({
    credentialManager: {
      getProcessAccessKey: async (cnj) => vault3.get(cnj),
      saveProcessAccessKey: async (cnj, { accessKey }) => vault3.set(cnj, accessKey)
    },
    publicSearchClient: {
      searchByProcessKey: async ({ cnj, accessKey }) => ({ ok: true, data: { cnj, accessKey } })
    },
    sessionObserver: {
      fetchProcessAccessKey: async ({ cnj }) => ({ ok: true, accessKey: 'newly_discovered_key_444' })
    }
  });

  const res3 = await strategy3.enrichProcess({ cnj: '5000003-00.2026.8.21.0016', portalId: 'tjrs-eproc-1g' });
  assert.equal(res3.ok, true);
  assert.equal(res3.strategy, 'AUTHENTICATED_EXTRACTION_PUBLIC_SEARCH');
  assert.equal(vault3.get('50000030020268210016'), 'newly_discovered_key_444');
  console.log('✓ 3. Cenário 3: Processo sem chave extraído via sessão e persistido no cofre.');

  // Scenario 4: Protection against loops when refresh fails
  const strategy4 = new AccessKeyEnrichmentStrategy({
    credentialManager: {
      getProcessAccessKey: async () => null,
      saveProcessAccessKey: async () => {}
    },
    sessionObserver: {
      fetchProcessAccessKey: async () => ({ ok: false, error: 'Processo em segredo de justiça absoluto' })
    }
  });

  const res4 = await strategy4.enrichProcess({ cnj: '5000004-00.2026.8.21.0016', portalId: 'tjrs-eproc-1g' });
  assert.equal(res4.ok, false);
  assert.equal(res4.strategy, 'EXTRACTION_FAILED');
  assert.ok(res4.error.includes('segredo de justiça'));
  console.log('✓ 4. Cenário 4: Erro controlado sem looping infinito.');

  // Scenario 5 (P1): Batch enrichment with AT MOST ONE session & bootstrap budget limit
  let acquiredSessionsCount = 0;
  let closedSessionsCount = 0;
  const vault5 = new Map([
    ['50000100020268210016', 'key_proc_10'],
    ['50000110020268210016', 'key_proc_11']
  ]);

  const strategy5 = new AccessKeyEnrichmentStrategy({
    credentialManager: {
      getProcessAccessKey: async (cnj) => vault5.get(cnj),
      saveProcessAccessKey: async (cnj, { accessKey }) => vault5.set(cnj, accessKey)
    },
    publicSearchClient: {
      searchByProcessKey: async ({ cnj, accessKey }) => ({ ok: true, data: { cnj, accessKey } })
    },
    sessionObserver: {
      acquireSession: async () => {
        acquiredSessionsCount++;
        return {
          close: async () => { closedSessionsCount++; }
        };
      },
      fetchProcessAccessKey: async ({ cnj }) => ({ ok: true, accessKey: `extracted_key_for_${cnj}` })
    }
  });

  const sampleBatch = [
    { cnj: '50000010020268210016', deltaType: 'UNCHANGED' },
    { cnj: '50000020020268210016', deltaType: 'UNCHANGED' },
    { cnj: '50000100020268210016', deltaType: 'NEW' }, // In vault -> zero session
    { cnj: '50000110020268210016', deltaType: 'UPDATED' }, // In vault -> zero session
    { cnj: '50000200020268210016', deltaType: 'NEW' }, // Needs extraction
    { cnj: '50000210020268210016', deltaType: 'NEW' }, // Needs extraction
    { cnj: '50000220020268210016', deltaType: 'NEW' }, // Exceeds budget -> deferred
    { cnj: '50000230020268210016', deltaType: 'NEW' }  // Exceeds budget -> deferred
  ];

  const batchSummary = await strategy5.enrichProcessBatch({
    processes: sampleBatch,
    portalId: 'tjrs-eproc-1g',
    maxPerBatch: 2, // Strict budget: at most 2 case opens per run
    delayBetweenMs: 0
  });

  assert.equal(batchSummary.totalCandidateProcesses, 8);
  assert.equal(batchSummary.unchangedSkipped, 2, '2 processos inalterados ignorados sem requisição');
  assert.equal(batchSummary.vaultResolvedWithoutSession, 2, '2 processos resolvidos via cofre sem abrir sessão');
  assert.equal(batchSummary.authenticatedCaseOpens, 2, 'Exatamente 2 aberturas dentro do limite orçamentário');
  assert.equal(batchSummary.pendingDeferredForNextRuns, 2, '2 processos postergados de forma resumível para a próxima execução');
  assert.equal(acquiredSessionsCount, 1, 'Exatamente UMA sessão aberta para todo o lote');
  assert.equal(closedSessionsCount, 1, 'Sessão fechada após o encerramento do lote');
  console.log('✓ 5. Cenário 5: Batch enrichment com UMA única sessão autenticada, rate limiting e orçamento de bootstrap comprovado.');

  // Scenario 6: Persistent Enrichment Backlog across UNCHANGED sync diffs
  // 10 NEW processes -> maxPerBatch=5 -> First run enriches 5, defers 5.
  // Inventory is persisted.
  // Second run: incoming spreadsheet is unchanged -> report diff classifies all 10 as UNCHANGED.
  // The persistent backlog ensures the 5 deferred processes are still enriched in run 2! Zero lost!
  const vault6 = new Map();
  let sessionOpensRun1 = 0;
  let sessionOpensRun2 = 0;

  const strategy6 = new AccessKeyEnrichmentStrategy({
    credentialManager: {
      getProcessAccessKey: async (cnj) => vault6.get(cnj),
      saveProcessAccessKey: async (cnj, { accessKey }) => vault6.set(cnj, accessKey)
    },
    sessionObserver: {
      acquireSession: async () => ({ close: async () => {} }),
      fetchProcessAccessKey: async ({ cnj }) => {
        return { ok: true, accessKey: `key_for_${cnj}` };
      }
    }
  });

  // 10 new incoming processes
  const initialIncoming = Array.from({ length: 10 }, (_, i) => ({
    cnj: `5000100-0${i}.2026.8.21.0001`,
    lastEvent: 'Distribuição realizada',
    lastEventAt: '2026-09-14 07:00:00',
    actionClass: 'Procedimento Comum'
  }));

  // Initial diff against empty inventory -> all 10 NEW
  const diff1 = computeEprocProcessDelta(initialIncoming, [], { portalId: 'tjrs-eproc-1g' });
  assert.equal(diff1.newCount, 10);
  assert.equal(diff1.enrichmentCandidates.length, 10);

  // Run 1: Batch size 5
  const run1Summary = await strategy6.enrichProcessBatch({
    processes: diff1.enrichmentCandidates,
    portalId: 'tjrs-eproc-1g',
    maxPerBatch: 5,
    delayBetweenMs: 0
  });

  assert.equal(run1Summary.authenticatedCaseOpens, 5, 'Primeiro batch enriquece exatamente 5');
  assert.equal(run1Summary.pendingDeferredForNextRuns, 5, '5 processos postergados no backlog');

  // Persist inventory (combining enriched items with deferred items)
  const persistedInventory = diff1.enrichmentCandidates.map(p => ({
    ...p,
    accessKey: vault6.get(p.cnj.replace(/\D/g, '')) || null,
    enrichmentStatus: p.enrichmentStatus || (vault6.has(p.cnj.replace(/\D/g, '')) ? ENRICHMENT_STATUS.COMPLETE : ENRICHMENT_STATUS.PENDING)
  }));

  const completeCount1 = persistedInventory.filter(p => p.enrichmentStatus === ENRICHMENT_STATUS.COMPLETE).length;
  const pendingCount1 = persistedInventory.filter(p => p.enrichmentStatus === ENRICHMENT_STATUS.PENDING).length;
  assert.equal(completeCount1, 5, '5 processos com status COMPLETE no cofre/inventário');
  assert.equal(pendingCount1, 5, '5 processos com status PENDING no inventário');

  // Next sync: identical incoming report (zero movements in tribunal)
  const diff2 = computeEprocProcessDelta(initialIncoming, persistedInventory, { portalId: 'tjrs-eproc-1g' });
  assert.equal(diff2.unchangedCount, 10, 'Todos os 10 processos aparecem como UNCHANGED no diff');
  assert.equal(diff2.newCount, 0, 'Zero novos processos');
  assert.equal(diff2.pendingBacklogCount, 5, 'Exatamente 5 processos pendentes detectados no backlog');
  assert.equal(diff2.enrichmentCandidates.length, 5, 'Candidatos a enriquecimento contêm os 5 do backlog');

  // Run 2: Batch size 5 consumes the remaining backlog
  const run2Summary = await strategy6.enrichProcessBatch({
    processes: diff2.enrichmentCandidates,
    portalId: 'tjrs-eproc-1g',
    maxPerBatch: 5,
    delayBetweenMs: 0
  });

  assert.equal(run2Summary.authenticatedCaseOpens, 5, 'Segundo batch consome os 5 restantes do backlog');
  assert.equal(run2Summary.pendingDeferredForNextRuns, 0, 'Zero processos pendentes restantes');

  // Final inventory check: all 10 processes now enriched!
  for (const p of initialIncoming) {
    const cleanCnj = p.cnj.replace(/\D/g, '');
    assert.ok(vault6.has(cleanCnj), `Processo ${p.cnj} deve possuir chave no cofre`);
  }
  assert.equal(vault6.size, 10, 'Todos os 10 processos do bootstrap foram enriquecidos');
  console.log('✓ 6. Cenário 6: Backlog persistente comprovado: 10 NEW -> batch 5 enriquece 5 -> 2º diff UNCHANGED -> batch 5 enriquece os 5 restantes sem perda de processos.');

  console.log('\n>>> ACCESS KEY ENRICHMENT STRATEGY TEST PASSED! <<<\n');
}

runAccessKeyStrategyTest().catch(err => {
  console.error('Falha no teste de estratégia de chaves:', err);
  process.exit(1);
});
