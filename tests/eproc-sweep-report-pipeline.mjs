import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { sweepAndEnrichProcessesWithA1, parseEprocCnj } from '../lib/judicial/eproc-a1-downloader.mjs';
import { mergeExternalIntimations } from '../lib/publications/intimation-merge.mjs';
import { WORKSPACE_ACCESS_KEY_OWNER } from '../lib/judicial/credential-manager.mjs';
import {
  buildEprocReportBaseline,
  computeEprocProcessDelta,
  mergeEprocReportInventory,
  normalizeReportRecord
} from '../lib/judicial/eproc/sync/report-sync.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempRoot = path.join(os.tmpdir(), `atrium-eproc-sweep-pipeline-${Date.now()}`);
const PORTAL_ID = 'tjrs-eproc-1g';

function buildRecord(cnj, overrides = {}) {
  return normalizeReportRecord({
    cnj,
    number: cnj.replace(/^(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})$/, '$1-$2.$3.$4.$5.$6'),
    judicialUnit: 'VARA SINTETICA',
    actionClass: 'PROCEDIMENTO SINTETICO',
    plaintiff: 'Autor Teste',
    defendant: 'Réu Teste',
    subject: 'Assunto Teste',
    lastEvent: 'Distribuição',
    rawLastEventDate: '01/09/2026 10:00:00',
    lastEventAt: '2026-09-01T10:00:00.000Z',
    caseValue: 'R$ 1.000,00',
    ...overrides
  }, PORTAL_ID);
}

function buildHarness({ records, reportAvailable = true, pendingIntimationNotFound = false, pendingIntimations = [] }) {
  const opened = [];
  const vaultWrites = [];
  const savedStates = [];
  const progress = [];

  const fakeContext = {
    pages: () => [{
      waitForTimeout: async () => {},
      url: () => 'https://eproc1g.tjrs.jus.br/eproc/controlador.php?acao=relatorio_processo_procurador_listar'
    }],
    close: async () => {}
  };

  const credentialManager = {
    dataDirectory: path.join(tempRoot, 'ws'),
    async init() { await mkdir(this.dataDirectory, { recursive: true }); },
    async readRawSecrets() {
      return {
        certificate: { path: path.join(tempRoot, 'synthetic.pfx'), passphrase: 'synthetic-passphrase' },
        totpSecrets: { 'tjrs-eproc': { secret: 'JBSWY3DPEHPK3PXP' } },
        processAccessKeys: {}
      };
    },
    async getPortalTotpSecret() { return 'JBSWY3DPEHPK3PXP'; },
    async saveProcessAccessKey(number, options) {
      vaultWrites.push({ number, ...options });
      return { ok: true, configured: true, keyId: 'synthetic' };
    }
  };

  const deps = {
    collectEprocSessions: async () => ({ sessions: [], collectionErrors: [], collectionStatus: { collected: false } }),
    createModernizedPfx: async () => ({ modernPath: 'synthetic-modern.pfx', modernPassphrase: 'x', cleanup: async () => {} }),
    launchPersistentContext: async () => fakeContext,
    authenticateEprocWithCertAndTotp: async () => ({ ok: true, state: 'CONNECTED' }),
    collectEprocDeadlines: async () => ({
      openDeadlines: [],
      pendingIntimations,
      collectionErrors: [],
      collectionStatus: {
        open_deadline: { discovered: true, collected: true, notFound: false },
        pending_intimation: pendingIntimationNotFound
          ? { discovered: false, collected: false, notFound: true }
          : { discovered: true, collected: true, notFound: false }
      }
    }),
    collectEprocHearings: async () => ({
      hearings: [{
        processNumber: '5000001-00.2026.8.21.0016',
        cnj: '50000010020268210016',
        portalId: PORTAL_ID,
        hearingDate: '18/09/2026',
        hearingTime: '14:30',
        scheduledAt: '2026-09-18T14:30:00',
        hearingType: 'CONCILIAÇÃO',
        status: 'DESIGNADA',
        modality: 'TELEPRESENCIAL',
        judicialUnit: 'Vara Sintética',
        notes: 'Audiência sintética'
      }],
      collectionErrors: [],
      collectionStatus: { discovered: true, collected: true },
      pages: 1
    }),
    runEprocProcessReportInventory: async ({ state, portalId, collectedAt, onProgress }) => {
      if (!reportAvailable) {
        return { ok: false, status: 'UNAVAILABLE', error: 'Comando oficial "Gerar Planilha" não localizado.', code: 'EPROC_REPORT_TRIGGER_NOT_FOUND' };
      }
      onProgress?.({ phase: 'report_download', determinate: false, progress: null, action: 'Gerando planilha oficial...' });
      const baseline = buildEprocReportBaseline(state.processes, portalId);
      const delta = computeEprocProcessDelta(records, baseline, { portalId });
      const merge = mergeEprocReportInventory(state, {
        portalId,
        portalLabel: 'TJRS 1G',
        records,
        collectedAt,
        source: 'REPORT_XLS'
      });
      onProgress?.({ phase: 'report_diff', determinate: true, progress: 100, completed: records.length, total: records.length, action: 'Relatório processado.' });
      return { ok: true, status: records.length ? 'OBTAINED' : 'EMPTY', records, delta, merge, artifact: { sha256: 'a'.repeat(64) } };
    },
    openEprocProcessDetails: async (_page, number) => {
      opened.push(String(number).replace(/\D/g, ''));
      return true;
    },
    extractProcessDetails: async () => ({
      number: '',
      clientName: 'Cliente Sintético Confirmado',
      clientPoleConfirmed: true,
      clientDocument: '***.***.***-**',
      clientPosition: 'AUTOR',
      opposingParty: 'Adverso Sintético',
      opposingPartyDocument: '',
      opposingPosition: 'RÉU',
      actionClass: 'PROCEDIMENTO SINTETICO',
      competence: 'Cível',
      distributionDate: '01/09/2026',
      court: '1ª Vara Sintética',
      judge: 'Juiz Sintético',
      status: 'Em andamento',
      caseValue: 'R$ 1.000,00',
      accessKey: 'CHAVE-SINTETICA-XYZ',
      secrecy: false,
      secrecyLevel: '',
      secrecyExplicit: true,
      movementsCount: 1,
      movements: [{ sequence: '1', date: '01/09/2026', description: 'Distribuição', documents: [] }]
    })
  };

  return { deps, credentialManager, opened, vaultWrites, savedStates, progress, fakeContext };
}

function buildState() {
  return { processes: [], intimations: [], tasks: [], contacts: [], documents: [], audit: [], users: [{ id: 'u1', username: 'advogada', displayName: 'Advogada Teste' }] };
}

async function run() {
  console.log('=== TESTE FOCAL: PIPELINE REPORT-FIRST -> DIFF -> ENRICHMENT -> PERSISTÊNCIA ===\n');
  await mkdir(tempRoot, { recursive: true });
  await writeFile(path.join(tempRoot, 'synthetic.pfx'), 'synthetic-not-a-pfx', 'utf8');

  const newCnj1 = '5000001-00.2026.8.21.0016';
  const newCnj2 = '5000002-00.2026.8.21.0016';
  const unchangedCnj = '5000003-00.2026.8.21.0016';
  const records = [buildRecord(newCnj1), buildRecord(newCnj2), buildRecord(unchangedCnj)];

  const firstState = buildState();
  firstState.sources = [{ id: 'eproc-tjrs-1g', name: 'TJRS · eproc 1º grau', status: 'attention', method: 'Coletor gerenciado (legado)', detail: 'Autenticação manual necessária.', lastCheck: '2026-09-15T21:38:00.000Z' }];
  firstState.processes.push({
    id: 'proc:eproc:50000030020268210016',
    number: unchangedCnj,
    client: 'Cliente Já Cadastrado',
    court: 'TJRS 1G',
    actionClass: 'PROCEDIMENTO SINTETICO',
    judicialUnit: 'VARA SINTETICA',
    caseValue: 'R$ 1.000,00',
    lastEvent: 'Distribuição',
    lastEventAt: '2026-09-01T10:00:00.000Z',
    rawLastEventDate: '01/09/2026 10:00:00',
    enrichmentStatus: 'COMPLETE',
    hasAccessKey: true,
    portalId: PORTAL_ID,
    eprocReport: records[2]
  });

  const harness = buildHarness({ records, reportAvailable: true });
  const firstResult = await sweepAndEnrichProcessesWithA1({
    portalId: PORTAL_ID,
    securityManager: { decrypt: v => v, encrypt: v => v },
    credentialManager: harness.credentialManager,
    readStateEnvelope: async () => ({ state: firstState, revision: 10 }),
    saveState: async (state, expectedRevision) => {
      harness.savedStates.push({ state: structuredClone(state), expectedRevision });
      return { revision: (Number(expectedRevision) || 0) + 1 };
    },
    maxProcesses: 5,
    onProgress: event => harness.progress.push(event),
    dependencies: harness.deps
  });

  assert.equal(firstResult.ok, true, `Primeira execução deve concluir: ${JSON.stringify(firstResult.errors)}`);
  assert.equal(firstResult.discoverySource, 'REPORT_XLS');
  assert.equal(firstResult.reportStatus, 'OBTAINED');
  assert.equal(firstResult.reportDelta.newCount, 2);
  assert.equal(firstResult.reportDelta.updatedCount, 0);
  assert.equal(firstResult.reportDelta.unchangedCount, 1);
  assert.equal(firstResult.sweptCount, 2, 'Somente NEW/UPDATED entram no enriquecimento');
  assert.equal(harness.opened.length, 2, 'UNCHANGED nunca reabre o processo no eproc');
  assert.ok(!harness.opened.includes(unchangedCnj.replace(/\D/g, '')));
  assert.equal(firstResult.enrichedCount, 2);
  assert.equal(firstResult.deferredEnrichmentCount, 0);
  console.log('✓ 1. Relatório oficial define a carteira e o enriquecimento só abre NEW/UPDATED.');

  const persistedState = harness.savedStates.at(-1).state;
  assert.equal(persistedState.processes.length, 3);
  const enriched = persistedState.processes.filter(proc => proc.number !== unchangedCnj);
  assert.equal(enriched.length, 2);
  for (const proc of enriched) {
    assert.equal(proc.hasAccessKey, true);
    assert.equal(proc.enrichmentStatus, 'COMPLETE');
    assert.equal(proc.client, 'Cliente Sintético Confirmado');
    assert.equal(proc.accessKey, undefined, 'Chave não pode ser persistida em texto claro');
    assert.equal(proc.chaveAcesso, undefined, 'Chave não pode ser persistida em texto claro');
    assert.ok(proc.eprocReport, 'Fotografia do relatório deve permanecer para diffs estáveis');
  }
  assert.ok(harness.vaultWrites.length >= 2, 'Chaves devem ser gravadas no cofre do workspace');
  assert.ok(harness.vaultWrites.every(write => write.userId === WORKSPACE_ACCESS_KEY_OWNER), 'Escopo de chave é o workspace');
  assert.ok(harness.vaultWrites.every(write => write.portalId === PORTAL_ID), 'Escopo de chave inclui portal/grau');
  assert.ok(!JSON.stringify(harness.savedStates).includes('CHAVE-SINTETICA-XYZ'), 'Nenhum estado salvo pode conter a chave');
  assert.ok(!JSON.stringify(firstResult.updatedProcesses).includes('CHAVE-SINTETICA-XYZ'), 'Telemetria não pode conter a chave');
  assert.ok(harness.progress.some(event => event.phase === 'report_download'));
  assert.equal(firstResult.hearingsCount, 1);
  assert.equal(firstResult.hearingsCreated, 1);
  assert.equal(persistedState.agenda.length, 1, 'Audiência coletada entra na Agenda oficial');
  assert.equal(persistedState.agenda[0].process, '5000001-00.2026.8.21.0016');
  assert.equal(persistedState.agenda[0].deadline, undefined, 'Audiência nunca cria prazo');
  assert.equal(persistedState.agenda[0].fatalDeadline, undefined);
  assert.equal(persistedState.agenda[0].sourceStatus, 'active');
  const portalSources = persistedState.sources.filter(source => /eproc-tjrs-1g|tjrs-eproc-1g/.test(String(source.id || '')));
  assert.equal(portalSources.length, 1, 'Fonte do portal deve ser única por pipeline oficial.');
  assert.equal(portalSources[0].status, 'ok', 'Fonte do portal deve refletir o resultado real da execução.');
  assert.match(portalSources[0].method, /Relatório oficial/);
  assert.doesNotMatch(portalSources[0].detail, /Autenticação manual necessária/, 'Estado legado não pode permanecer após execução oficial.');
  const a1Source = persistedState.sources.find(source => String(source.id).toLowerCase() === 'a1');
  assert.equal(a1Source?.status, 'ok', 'Fonte A1 deve refletir a autenticação real do pipeline oficial.');
  console.log('✓ 2. Cofre por workspace/portal recebe a chave; estado e telemetria ficam limpos; fonte do portal substitui estado legado.');

  const secondHarness = buildHarness({ records, reportAvailable: true });
  const secondResult = await sweepAndEnrichProcessesWithA1({
    portalId: PORTAL_ID,
    securityManager: { decrypt: v => v, encrypt: v => v },
    credentialManager: secondHarness.credentialManager,
    readStateEnvelope: async () => ({ state: persistedState, revision: 11 }),
    saveState: async state => {
      secondHarness.savedStates.push({ state: structuredClone(state) });
      return { revision: 12 };
    },
    maxProcesses: 5,
    dependencies: secondHarness.deps
  });
  assert.equal(secondResult.ok, true);
  assert.equal(secondResult.reportDelta.unchangedCount, 3, 'Segunda leitura idêntica é integralmente UNCHANGED');
  assert.equal(secondResult.sweptCount, 0);
  assert.equal(secondHarness.opened.length, 0, 'Nenhum processo é reaberto em execução sem mudanças');
  assert.equal(secondResult.enrichedCount, 0);
  assert.equal(secondResult.hearingsCreated, 0, 'Audiência idêntica não duplica na agenda');
  assert.equal(secondResult.hearingsCount, 1);
  assert.equal(persistedState.agenda.length, 1, 'Agenda permanece com um único evento após releitura idêntica');
  console.log('✓ 3. Reexecução idêntica não reenriquece, não abre processos e não duplica audiências.');

  const fallbackState = buildState();
  fallbackState.processes.push({
    id: 'proc:manual-1',
    number: '5000009-00.2026.8.21.0016',
    client: '',
    court: 'TJRS',
    portalId: PORTAL_ID,
    tags: ['eproc']
  });
  const fallbackHarness = buildHarness({ records, reportAvailable: false });
  const fallbackResult = await sweepAndEnrichProcessesWithA1({
    portalId: PORTAL_ID,
    securityManager: { decrypt: v => v, encrypt: v => v },
    credentialManager: fallbackHarness.credentialManager,
    readStateEnvelope: async () => ({ state: fallbackState, revision: 20 }),
    saveState: async state => ({ revision: 21, state }),
    maxProcesses: 5,
    dependencies: fallbackHarness.deps
  });
  assert.equal(fallbackResult.discoverySource, 'PANEL_DOM_FALLBACK');
  assert.equal(fallbackResult.reportStatus, 'UNAVAILABLE');
  assert.equal(fallbackResult.ok, false, 'Relatório obrigatório indisponível não pode ser sucesso pleno');
  assert.equal(fallbackResult.partial, true, 'Fallback que produziu dados úteis é parcial, não erro total');
  assert.ok(fallbackResult.errors.some(error => error.scope === 'process_report'));
  assert.ok(fallbackHarness.opened.includes('50000090020268210016'), 'Fallback de painel seleciona candidatos cadastrais');
  console.log('✓ 4. Falha do relatório oficial vira execução parcial com fallback registrado.');

  // Seção do Painel indisponível para o usuário é aviso, nunca erro do portal.
  const sectionHarness = buildHarness({ records, reportAvailable: true, pendingIntimationNotFound: true });
  const sectionState = buildState();
  const sectionResult = await sweepAndEnrichProcessesWithA1({
    portalId: PORTAL_ID,
    securityManager: { decrypt: v => v, encrypt: v => v },
    credentialManager: sectionHarness.credentialManager,
    readStateEnvelope: async () => ({ state: sectionState, revision: 50 }),
    saveState: async state => ({ revision: 51, state }),
    maxProcesses: 2,
    dependencies: sectionHarness.deps
  });
  assert.equal(sectionResult.ok, true, 'Seção indisponível não pode transformar o portal em erro.');
  assert.equal(sectionResult.partial, false);
  assert.equal(sectionResult.errorCount, undefined);
  assert.equal(sectionResult.errors.length, 0, 'Seção indisponível não pode gerar erro de coleta.');
  assert.equal(sectionResult.warnings.length, 1, 'Seção indisponível deve gerar aviso explícito.');
  assert.match(sectionResult.warnings[0], /Intimações pendentes/);
  assert.match(sectionResult.message, /Avisos:/);
  console.log('✓ 4b. Seção ausente no Painel é aviso explícito, sem selo de erro e sem marcar ausência.');

  // Conflito de revisão (outro fluxo do escritório gravou) é aviso, nunca erro de portal.
  const conflictHarness = buildHarness({ records, reportAvailable: true });
  const conflictState = buildState();
  const conflictResult = await sweepAndEnrichProcessesWithA1({
    portalId: PORTAL_ID,
    securityManager: { decrypt: v => v, encrypt: v => v },
    credentialManager: conflictHarness.credentialManager,
    readStateEnvelope: async () => ({ state: conflictState, revision: 60 }),
    saveState: async () => {
      throw Object.assign(new Error('Os dados foram atualizados em outra aba ou pelo importador. Recarregue a Central antes de salvar.'), { statusCode: 409 });
    },
    maxProcesses: 2,
    dependencies: conflictHarness.deps
  });
  assert.equal(conflictResult.ok, true, 'Conflito de revisão não pode transformar o portal em erro.');
  assert.equal(conflictResult.errors.length, 0, 'Conflito de revisão não pode gerar erro de persistência.');
  assert.equal(conflictResult.warnings.length, 1, 'Conflito de revisão deve ser registrado como aviso.');
  assert.match(conflictResult.warnings[0], /edição concorrente/);
  console.log('✓ 4c. Conflito de revisão é aviso explícito; edição concorrente preservada e pendente reprocessado.');

  const targetState = buildState();
  targetState.contacts.push({ id: 'contact-target', name: 'Cliente Existente', contactRole: 'cliente' });
  targetState.processes.push({
    id: 'proc-target',
    number: '5000001-00.2026.8.21.0016',
    client: 'Cliente Existente',
    contactId: 'contact-target',
    court: 'TJRS',
    portalId: PORTAL_ID
  });
  targetState.intimations.push(
    {
      id: 'intimation-curated',
      externalId: 'intimation-curated',
      processId: 'proc-target',
      process: '5000001-00.2026.8.21.0016',
      client: 'Cliente Curado',
      clientName: 'Cliente Curado',
      contactId: 'contact-curated',
      text: 'Teor curado da publicação anterior',
      treatmentStatus: 'treated',
      source: 'eproc'
    },
    {
      id: 'intimation-orphan',
      externalId: 'intimation-orphan',
      processId: 'proc-target',
      process: '5000001-00.2026.8.21.0016',
      source: 'eproc'
    }
  );
  const targetIntimations = [{
    processNumber: '5000001-00.2026.8.21.0016',
    event: 'Evento 9',
    subject: 'Intimação sintética do painel',
    sourceText: 'Teor sintético da intimação pendente',
    sentAt: '16/09/2026 09:00',
    sourceAction: 'citacao_intimacao_pendente_listar',
    sourcePath: '/eproc/controlador.php'
  }];
  const targetHarness = buildHarness({ records, reportAvailable: true, pendingIntimations: targetIntimations });
  let targetSavedState = null;
  const targetResult = await sweepAndEnrichProcessesWithA1({
    portalId: PORTAL_ID,
    processNumber: '5000001-00.2026.8.21.0016',
    securityManager: { decrypt: v => v, encrypt: v => v },
    credentialManager: targetHarness.credentialManager,
    readStateEnvelope: async () => ({ state: targetState, revision: 30 }),
    saveState: async state => {
      targetSavedState = structuredClone(state);
      return { revision: 31, state };
    },
    maxProcesses: 5,
    dependencies: targetHarness.deps
  });
  assert.equal(targetResult.discoverySource, 'TARGET_PROCESS');
  assert.equal(targetResult.sweptCount, 1);
  assert.deepEqual(targetHarness.opened, ['50000010020268210016'], 'Enriquecimento pontual abre apenas o processo solicitado');
  assert.equal(parseEprocCnj('5000001-00.2026.8.21.0016').justiceRegion, '821');
  assert.ok(targetSavedState, 'Enriquecimento pontual deve persistir o estado consolidado.');

  const reconciledIntimation = targetSavedState.intimations.find(item => String(item.externalId || '').startsWith(`eproc:${PORTAL_ID}:`) && item.processNumber === '5000001-00.2026.8.21.0016');
  assert.ok(reconciledIntimation, 'Intimação do painel deve ser criada com identidade externa estável.');
  assert.equal(reconciledIntimation.client, 'Cliente Existente', 'Reconcile deve copiar o cliente principal do processo para a publicação.');
  assert.equal(reconciledIntimation.clientName, 'Cliente Existente', 'Reconcile deve copiar o clientName oficial do processo.');
  assert.equal(reconciledIntimation.contactId, 'contact-target', 'Reconcile deve copiar o vínculo de contato oficial.');
  assert.equal(reconciledIntimation.text, 'Teor sintético da intimação pendente', 'Texto oficial deve ser materializado a partir da evidência coletada.');
  assert.ok(reconciledIntimation.text.length <= 4000, 'Texto oficial mantém a política de truncamento.');

  const orphanIntimation = targetSavedState.intimations.find(item => item.id === 'intimation-orphan');
  assert.equal(orphanIntimation.client, 'Cliente Existente', 'Vínculo confirmado deve retro-preencher publicações anteriores.');
  assert.equal(orphanIntimation.clientName, 'Cliente Existente');
  assert.equal(orphanIntimation.contactId, 'contact-target');
  assert.equal(orphanIntimation.text, undefined, 'Backfill não inventa texto sem evidência coletada.');

  const curatedIntimation = targetSavedState.intimations.find(item => item.id === 'intimation-curated');
  assert.equal(curatedIntimation.client, 'Cliente Curado', 'Curadoria de cliente não pode ser sobrescrita pelo enriquecimento.');
  assert.equal(curatedIntimation.clientName, 'Cliente Curado');
  assert.equal(curatedIntimation.contactId, 'contact-curated');
  assert.equal(curatedIntimation.text, 'Teor curado da publicação anterior');
  assert.equal(curatedIntimation.treatmentStatus, 'treated', 'Tratamento humano permanece intocado.');
  console.log('✓ 5. Enriquecimento pontual usa o mesmo pipeline, sem varredura completa, e vincula cliente/texto às publicações sem sobrescrever curadoria.');

  const additiveMerge = mergeExternalIntimations(
    [{
      externalId: 'eproc:tjrs-eproc-1g:merge-contract',
      client: 'Cliente Confirmado Sintético',
      clientName: 'Cliente Confirmado Sintético',
      contactId: 'contact-synthetic',
      text: 'Teor oficial preservado',
      treatmentStatus: 'in_review'
    }],
    [{
      externalId: 'eproc:tjrs-eproc-1g:merge-contract',
      client: '',
      clientName: '',
      contactId: '',
      text: '',
      treatmentStatus: 'untreated'
    }]
  );
  assert.equal(additiveMerge[0].client, 'Cliente Confirmado Sintético', 'Vazio não pode apagar o cliente principal.');
  assert.equal(additiveMerge[0].clientName, 'Cliente Confirmado Sintético', 'Vazio não pode apagar o clientName oficial.');
  assert.equal(additiveMerge[0].contactId, 'contact-synthetic', 'Vazio não pode apagar o contato oficial.');
  assert.equal(additiveMerge[0].text, 'Teor oficial preservado', 'Vazio não pode apagar o texto oficial.');
  assert.equal(additiveMerge[0].treatmentStatus, 'in_review', 'Tratamento humano permanece protegido no merge externo.');

  const replacedMerge = mergeExternalIntimations(
    [{ externalId: 'eproc:tjrs-eproc-1g:merge-update', client: 'Cliente Antigo', text: 'Teor antigo' }],
    [{ externalId: 'eproc:tjrs-eproc-1g:merge-update', client: 'Cliente Novo', text: 'Teor novo' }]
  );
  assert.equal(replacedMerge[0].client, 'Cliente Novo', 'Valor novo não vazio continua atualizando o registro externo.');
  assert.equal(replacedMerge[0].text, 'Teor novo');
  console.log('✓ 6. Merge externo de intimações é aditivo para vínculo e texto, sem false rewrite.');

  // Revisão única de marca legada de sigilo: UNCHANGED com marca sem proveniência é
  // relido uma vez e a fonte (nível 0 explícito) limpa; marcação manual é preservada.
  const secrecyState = buildState();
  secrecyState.processes.push(
    {
      id: 'proc:eproc:legacy-secrecy',
      number: unchangedCnj,
      client: 'Cliente Já Cadastrado',
      court: 'TJRS 1G',
      actionClass: 'PROCEDIMENTO SINTETICO',
      judicialUnit: 'VARA SINTETICA',
      caseValue: 'R$ 1.000,00',
      lastEvent: 'Distribuição',
      lastEventAt: '2026-09-01T10:00:00.000Z',
      rawLastEventDate: '01/09/2026 10:00:00',
      enrichmentStatus: 'COMPLETE',
      hasAccessKey: true,
      portalId: PORTAL_ID,
      secrecy: true,
      secrecyLevel: 'Segredo de Justiça',
      tags: ['eproc'],
      eprocReport: records[2]
    },
    {
      id: 'proc:eproc:manual-secrecy',
      number: newCnj1,
      client: 'Cliente Manual',
      court: 'TJRS 1G',
      actionClass: 'PROCEDIMENTO SINTETICO',
      judicialUnit: 'VARA SINTETICA',
      caseValue: 'R$ 1.000,00',
      lastEvent: 'Distribuição',
      lastEventAt: '2026-09-01T10:00:00.000Z',
      rawLastEventDate: '01/09/2026 10:00:00',
      enrichmentStatus: 'COMPLETE',
      hasAccessKey: true,
      portalId: PORTAL_ID,
      secrecy: true,
      secrecyLevel: 'Manual',
      secrecyManual: true,
      tags: ['eproc'],
      eprocReport: records[0]
    },
    {
      id: 'proc:eproc:plain',
      number: newCnj2,
      client: 'Cliente Sem Marca',
      court: 'TJRS 1G',
      actionClass: 'PROCEDIMENTO SINTETICO',
      judicialUnit: 'VARA SINTETICA',
      caseValue: 'R$ 1.000,00',
      lastEvent: 'Distribuição',
      lastEventAt: '2026-09-01T10:00:00.000Z',
      rawLastEventDate: '01/09/2026 10:00:00',
      enrichmentStatus: 'COMPLETE',
      hasAccessKey: true,
      portalId: PORTAL_ID,
      tags: ['eproc'],
      eprocReport: records[1]
    }
  );
  const secrecyHarness = buildHarness({ records, reportAvailable: true });
  let secrecySavedState = null;
  const secrecyResult = await sweepAndEnrichProcessesWithA1({
    portalId: PORTAL_ID,
    securityManager: { decrypt: v => v, encrypt: v => v },
    credentialManager: secrecyHarness.credentialManager,
    readStateEnvelope: async () => ({ state: secrecyState, revision: 60 }),
    saveState: async state => {
      secrecySavedState = structuredClone(state);
      return { revision: 61, state };
    },
    maxProcesses: 5,
    dependencies: secrecyHarness.deps
  });
  assert.equal(secrecyResult.ok, true, `Sweep de sigilo legado deve concluir: ${JSON.stringify(secrecyResult.errors)}`);
  assert.equal(secrecyResult.reportDelta.legacySecrecyReviewCount, 1, 'Somente a marca legada entra na revisão única.');
  assert.equal(secrecyResult.sweptCount, 1);
  assert.deepEqual(secrecyHarness.opened, [unchangedCnj.replace(/\D/g, '')], 'A releitura abre apenas a marca legada.');
  const clearedProcess = secrecySavedState.processes.find(proc => proc.number === unchangedCnj);
  assert.equal(clearedProcess.secrecy, false, 'Nível 0 explícito da fonte limpa a marca legada.');
  assert.equal(clearedProcess.secrecyLevel, '');
  assert.ok(!clearedProcess.tags.includes('segredo-de-justica'));
  assert.equal(clearedProcess.secrecyReviewedAt, undefined);
  const manualProcess = secrecySavedState.processes.find(proc => proc.number === newCnj1);
  assert.equal(manualProcess.secrecy, true, 'Marcação manual permanece após a coleta.');
  assert.equal(manualProcess.secrecyLevel, 'Manual');

  const secondSecrecyHarness = buildHarness({ records, reportAvailable: true });
  const secondSecrecyResult = await sweepAndEnrichProcessesWithA1({
    portalId: PORTAL_ID,
    securityManager: { decrypt: v => v, encrypt: v => v },
    credentialManager: secondSecrecyHarness.credentialManager,
    readStateEnvelope: async () => ({ state: secrecySavedState, revision: 61 }),
    saveState: async state => ({ revision: 62, state }),
    maxProcesses: 5,
    dependencies: secondSecrecyHarness.deps
  });
  assert.equal(secondSecrecyResult.reportDelta.legacySecrecyReviewCount, 0, 'Revisão única não se repete.');
  assert.equal(secondSecrecyResult.sweptCount, 0);
  assert.equal(secondSecrecyHarness.opened.length, 0, 'Processo já reconciliado não reabre.');
  console.log('✓ 7. Marca legada de sigilo é relida uma única vez, limpa com nível 0 explícito e a marcação manual é preservada.');

  console.log('\n>>> EPROC SWEEP REPORT-FIRST PIPELINE TEST PASSED! <<<\n');
}

run()
  .catch(error => {
    console.error('Falha no teste do pipeline do sweep:', error);
    process.exit(1);
  })
  .finally(async () => {
    await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  });
