import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { startTestServer, postJson } from './helpers.mjs';
import { generateTotp, SecurityManager } from '../lib/security.mjs';
import { NotificationDatabase } from '../lib/notifications/db.mjs';
import { applyCanonicalIntimationMerge } from '../lib/publications/canonical-intimation-state.mjs';
import { absorbedIntimationKeys, selectNewPublicationEvents } from '../lib/publications/intimation-merge-engine.mjs';

console.log('--- Iniciando Testes de Wiring: Fusão no caminho de sincronização ---');

const ENCRYPTION_KEY = randomBytes(32).toString('base64');
const SESSION_SECRET = randomBytes(48).toString('base64url');
const CNJ = '5034567-89.2026.8.21.0004';
const EVENT = 'Intimação · Decisão';
const KEEPER_ID = 'eproc:tjrs:sync-canonical';
const LEGACY_ID = 'djen:sync-legacy';
const ADMIN_PASSWORD = 'Admin-Password-Sync-Merge-12345!';

const server = await startTestServer({
  env: { AUTH_ENCRYPTION_KEY: ENCRYPTION_KEY, AUTH_SESSION_SECRET: SESSION_SECRET }
});
const security = new SecurityManager({
  dataDirectory: server.dataDirectory,
  sessionSecret: SESSION_SECRET,
  encryptionKey: ENCRYPTION_KEY
});

async function readCanonicalEnvelope() {
  const envelope = JSON.parse(await readFile(path.join(server.dataDirectory, 'app-state.json'), 'utf8'));
  return { revision: envelope.revision, state: JSON.parse(security.decrypt(envelope.encrypted)) };
}

async function readCanonicalState() {
  return (await readCanonicalEnvelope()).state;
}

let notificationDb = null;
const readPairEvents = () => notificationDb.db.prepare(
  "SELECT payload FROM notification_events WHERE event_type = 'PUBLICATION_NEW'"
).all()
  .map(row => JSON.parse(notificationDb.decryptField(row.payload)))
  .filter(item => String(item.process || '').includes('5034567'));

try {
  const setupRes = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_sync_merge',
    displayName: 'Administrador Sync Teste',
    email: 'admin.sync.merge@example.test',
    password: ADMIN_PASSWORD
  });
  assert.equal(setupRes.status, 200);
  const setupData = await setupRes.json();
  const verifyRes = await postJson(`${server.baseUrl}/api/auth/setup/verify`, {
    setupToken: setupData.setupToken,
    code: generateTotp(setupData.manualSecret)
  });
  assert.equal(verifyRes.status, 200);
  const verified = await verifyRes.json();
  const cookie = verifyRes.headers.get('set-cookie').split(';')[0];
  const csrf = verified.csrfToken;
  const authHeaders = { Cookie: cookie, 'X-CSRF-Token': csrf };

  // 0. Estado oficial inicial (o envelope só existe depois do primeiro save).
  const seedRes = await postJson(`${server.baseUrl}/api/state`, {
    state: { intimations: [], tasks: [], processes: [], contacts: [], settings: {} },
    revision: null
  }, authHeaders);
  assert.equal(seedRes.status, 200, `seed oficial deve gravar (HTTP ${seedRes.status})`);

  // 1. Coletor entrega duas representações da mesma publicação (eproc + DJEN).
  // Ids `demo-*` impedem o enriquecimento DataJud no /api/sync (sem rede no teste).
  const ingestRes = await postJson(`${server.baseUrl}/api/ingest`, {
    intimations: [
      {
        id: 'demo-sync-canonical',
        externalId: KEEPER_ID,
        portalId: 'tjrs-eproc-1g',
        process: CNJ,
        processNumber: CNJ,
        source: 'eproc',
        event: EVENT,
        title: 'Intimação eproc da sincronização',
        text: 'Teor integral coletado no painel eproc.',
        sourceReportedAt: '2026-09-16',
        sourceReportedDeadlineAt: '2026-09-26',
        sourceStatus: 'active',
        treatmentStatus: 'untreated',
        createdAt: '2026-09-16T08:00:00.000Z',
        updatedAt: '2026-09-16T08:00:00.000Z'
      },
      {
        id: 'demo-sync-legacy',
        externalId: LEGACY_ID,
        process: CNJ,
        source: 'DJEN',
        event: EVENT,
        title: 'Publicação DJEN da sincronização',
        text: 'Mesma publicação com recorte parcial.',
        publishedAt: '2026-09-16',
        treatmentStatus: 'untreated',
        createdAt: '2026-09-16T07:00:00.000Z',
        updatedAt: '2026-09-16T07:00:00.000Z'
      }
    ]
  }, { Authorization: `Bearer ${server.collectorToken}` });
  assert.equal(ingestRes.status, 200, `ingest deve aceitar coleções sintéticas (HTTP ${ingestRes.status})`);

  // 1b. O digest da ingestão não pode anunciar o perdedor do par cross-source: o
  // runtime-only grava o par, e as chaves absorvidas vêm do plano de fusão sobre
  // estado consolidado + lote recebido. Exatamente um evento, do keeper.
  notificationDb = new NotificationDatabase({
    dbPath: path.join(server.dataDirectory, 'notifications.sqlite'),
    securityManager: security
  });
  await new Promise(resolve => setTimeout(resolve, 500));
  const pairEventsAfterIngest = readPairEvents();
  assert.equal(pairEventsAfterIngest.length, 1, 'ingest do par cross-source anuncia exatamente um evento');
  assert.equal(pairEventsAfterIngest[0].id, 'demo-sync-canonical', 'evento anunciado é o keeper eproc');
  assert.ok(
    !pairEventsAfterIngest.some(event => String(event.id || '').includes('legacy')),
    'perdedor DJEN não pode ser anunciado pelo digest da ingestão'
  );

  // 2. /api/sync persiste no estado consolidado e funde as duplicatas dentro do fluxo.
  const syncRes = await postJson(`${server.baseUrl}/api/sync`, {}, authHeaders);
  assert.equal(syncRes.status, 200, `sync deve concluir (HTTP ${syncRes.status})`);
  const canonical = await readCanonicalState();
  const canonicalIntimations = canonical.intimations || [];
  const keeper = canonicalIntimations.find(item => item.id === 'demo-sync-canonical');
  const alias = canonicalIntimations.find(item => item.id === 'demo-sync-legacy');
  assert.ok(keeper, 'keeper eproc persistido pelo caminho de sync');
  assert.ok(alias, 'perdedor preservado como alias no caminho de sync');
  assert.equal(alias.mergedInto, 'demo-sync-canonical');
  assert.equal(alias.mergeReason, 'duplicate-identity');
  assert.match(String(alias.mergedAt || ''), /^\d{4}-\d{2}-\d{2}T/, 'alias possui mergedAt');
  const mergeAudit = (canonical.audit || []).filter(entry => entry.action === 'Publicações duplicadas fundidas');
  assert.equal(mergeAudit.length, 1, 'audit de fusão gravado pelo caminho de sync');
  assert.equal(canonical.tasks === undefined || Array.isArray(canonical.tasks), true, 'estado consolidado íntegro');
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(readPairEvents().length, 1, 'sync não reanuncia o par já notificado pela ingestão');

  // 3. Painel público mostra somente o keeper e resolve o id absorvido nas rotas.
  const publicRes = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookie } });
  assert.equal(publicRes.status, 200);
  const publicState = await publicRes.json();
  const visible = (publicState.state.intimations || []).filter(item => String(item.process || '').includes('5034567'));
  assert.equal(visible.length, 1, 'painel exibe apenas o keeper após o sync');
  assert.equal(visible[0].id, 'demo-sync-canonical');
  const lookupRes = await postJson(
    `${server.baseUrl}/api/intimations/${encodeURIComponent(LEGACY_ID)}/treatment`,
    { action: 'start_review', revision: publicState.revision },
    authHeaders
  );
  assert.equal(lookupRes.status, 200, 'id absorvido resolve para o keeper após sync');
  assert.equal((await lookupRes.json()).intimation.id, 'demo-sync-canonical');

  // 4. Replay de sync é idempotente: não duplica alias, keeper nem audit de fusão.
  const before = await readCanonicalEnvelope();
  const syncAgainRes = await postJson(`${server.baseUrl}/api/sync`, {}, authHeaders);
  assert.equal(syncAgainRes.status, 200, `segundo sync deve concluir (HTTP ${syncAgainRes.status})`);
  const after = await readCanonicalEnvelope();
  const tally = state => ({
    mergeAudit: (state.audit || []).filter(entry => entry.action === 'Publicações duplicadas fundidas').length,
    pair: (state.intimations || [])
      .filter(item => ['demo-sync-canonical', 'demo-sync-legacy'].includes(String(item.id || '')))
      .map(item => `${item.id}:${item.mergedInto || 'vivo'}`)
      .sort()
  });
  assert.deepEqual(tally(after.state), tally(before.state), 'replay do sync não duplica registros nem audit');
  assert.equal(tally(after.state).mergeAudit, 1, 'audit de fusão permanece único no replay');
  assert.deepEqual(tally(after.state).pair, ['demo-sync-canonical:vivo', 'demo-sync-legacy:demo-sync-canonical']);

  // 5. Caminho do sweep eproc A1: o save oficial passa pelo mesmo fluxo (fusão +
  // reaplicação de alias + digest pós-fusão). Um par cross-source novo não deixa dois
  // vivos e o digest anuncia somente o keeper, com replay idempotente.
  {
    const eprocPairCnj = '5056789-01.2026.8.21.0006';
    const eprocEvent = 'Intimação · Decisão';
    const sharedText = 'Mesmo teor integral normalizado dos autos.';
    const djenRecord = {
      id: 'djen:eproc-save-legacy',
      externalId: 'djen:eproc-save-legacy',
      process: eprocPairCnj,
      source: 'DJEN',
      event: eprocEvent,
      title: 'Publicação DJEN pré-existente',
      text: sharedText,
      publishedAt: '2026-09-17',
      treatmentStatus: 'untreated',
      createdAt: '2026-09-17T07:00:00.000Z',
      updatedAt: '2026-09-17T07:00:00.000Z'
    };
    const eprocRecord = {
      id: 'eproc:tjrs-eproc-1g:save-flow',
      externalId: 'eproc:tjrs-eproc-1g:save-flow',
      portalId: 'tjrs-eproc-1g',
      process: eprocPairCnj,
      processNumber: eprocPairCnj,
      source: 'eproc',
      event: eprocEvent,
      title: 'Intimação eproc nova do painel',
      text: sharedText,
      sourceReportedAt: '2026-09-17',
      sourceStatus: 'active',
      treatmentStatus: 'untreated',
      unread: true,
      createdAt: '2026-09-17T08:00:00.000Z',
      updatedAt: '2026-09-17T08:00:00.000Z'
    };
    const previousIntimations = [djenRecord];
    // O sweep monta o estado completo: intimações reconciliadas + as já persistidas.
    const sweepState = { intimations: [eprocRecord, structuredClone(djenRecord)], tasks: [], audit: [] };
    const mergeOutcome = applyCanonicalIntimationMerge(sweepState, previousIntimations, {
      actor: 'Varredura eproc A1'
    });
    assert.equal(mergeOutcome.changed, true, 'par cross-source novo deve ser fundido pelo save do sweep');
    assert.equal(mergeOutcome.merges.length, 1, 'exatamente um perdedor absorvido');
    const visibleAfterMerge = sweepState.intimations.filter(item => !item.mergedInto);
    assert.equal(visibleAfterMerge.length, 1, 'save do eproc não pode deixar dois registros vivos');
    assert.equal(visibleAfterMerge[0].id, eprocRecord.id, 'keeper eproc prevalece no par com DJEN');
    const absorbedDjen = sweepState.intimations.find(item => item.id === djenRecord.id);
    assert.equal(absorbedDjen.mergedInto, eprocRecord.id, 'DJEN absorvido como alias reversível');

    // Digest pós-fusão: somente o keeper vira novidade; o perdedor nunca é anunciado.
    const previousKeys = new Set(previousIntimations.map(item => item.id));
    const events = selectNewPublicationEvents(sweepState.intimations, {
      previousKeys,
      absorbedKeys: absorbedIntimationKeys(mergeOutcome.merges)
    });
    assert.equal(events.length, 1, 'digest do save eproc anuncia exatamente um evento');
    assert.equal(events[0].id, eprocRecord.id, 'evento anunciado é o keeper');
    assert.ok(!events.some(event => event.id === djenRecord.id), 'perdedor absorvido não é anunciado');

    // Replay do mesmo save: sem mudança, sem nova fusão e sem novo evento.
    const replayState = structuredClone(sweepState);
    const replayOutcome = applyCanonicalIntimationMerge(replayState, sweepState.intimations, {
      actor: 'Varredura eproc A1'
    });
    assert.equal(replayOutcome.changed, false, 'replay do save não muda o estado consolidado');
    assert.equal(replayOutcome.merges.length, 0, 'replay não repete a fusão');
    const replayEvents = selectNewPublicationEvents(replayState.intimations, {
      previousKeys: new Set(sweepState.intimations.map(item => item.id)),
      absorbedKeys: absorbedIntimationKeys(replayOutcome.merges)
    });
    assert.equal(replayEvents.length, 0, 'replay não anuncia novidade');
    assert.equal(replayState.intimations.filter(item => !item.mergedInto).length, 1, 'painel segue com um visível no replay');
  }

  console.log('✓ Sync: fusão oficial persistida, painel sem alias, id absorvido resolvido e gate de novidade validados.');
} finally {
  if (notificationDb) notificationDb.close();
  await server.stop();
}

console.log('\n[PASS] Caminho de sincronização da fusão de publicações validado.');
