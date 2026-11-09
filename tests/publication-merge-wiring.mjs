import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { startTestServer, postJson } from './helpers.mjs';
import { generateTotp, SecurityManager } from '../lib/security.mjs';
import { serverSourceText } from './server-source.mjs';

console.log('--- Iniciando Testes de Wiring: Fusão de Publicações Duplicadas ---');

const ENCRYPTION_KEY = randomBytes(32).toString('base64');
const SESSION_SECRET = randomBytes(48).toString('base64url');
const EVENT = 'Intimação · Decisão';
const CNJ = '5009876-54.2026.8.21.0001';
const CNJ_DIGITS = CNJ.replace(/\D/g, '');
const CANONICAL_ID = 'eproc:tjrs-eproc-1g:abcdefabcdefabcdefabcdefabcdefab';
const LEGACY_ID = `intimation:eproc:${CNJ_DIGITS}`;
const DJEN_ID = 'djen:777001';
const CLIENT = 'Cliente Confidencial Teste';
const ADMIN_PASSWORD = 'Admin-Password-Merge-12345!';

const server = await startTestServer({
  env: { AUTH_ENCRYPTION_KEY: ENCRYPTION_KEY, AUTH_SESSION_SECRET: SESSION_SECRET }
});
const security = new SecurityManager({
  dataDirectory: server.dataDirectory,
  sessionSecret: SESSION_SECRET,
  encryptionKey: ENCRYPTION_KEY
});

async function readCanonicalState() {
  const envelope = JSON.parse(await readFile(path.join(server.dataDirectory, 'app-state.json'), 'utf8'));
  return JSON.parse(security.decrypt(envelope.encrypted));
}

function seedState() {
  return {
    intimations: [
      {
        id: CANONICAL_ID,
        externalId: CANONICAL_ID,
        portalId: 'tjrs-eproc-1g',
        process: CNJ,
        processNumber: CNJ,
        source: 'eproc',
        event: EVENT,
        title: 'Intimação eproc',
        text: 'Teor resumido coletado do Painel do Advogado.',
        sourceText: 'Texto integral do painel.',
        sourceReportedAt: '2026-09-10',
        sourceReportedDeadlineAt: '2026-09-20',
        sourceStatus: 'active',
        sourceProvenance: { system: 'eproc', portalId: 'tjrs-eproc-1g', itemType: 'open_deadline' },
        sourceEvidence: [{ status: 'active', collectedAt: '2026-09-11T09:00:00.000Z', sourceText: 'evidência oficial' }],
        treatmentStatus: 'treated',
        treatedAt: '2026-09-12T10:00:00.000Z',
        treatedBy: 'Administrador Tratamento Teste',
        client: CLIENT,
        linkedTaskIds: ['task-keeper'],
        taskId: 'task-keeper',
        status: 'pendente',
        unread: false,
        createdAt: '2026-09-11T08:00:00.000Z',
        updatedAt: '2026-09-12T10:00:00.000Z'
      },
      {
        id: LEGACY_ID,
        externalId: LEGACY_ID,
        process: CNJ,
        source: 'eproc',
        event: EVENT,
        title: 'Despacho legado',
        text: 'Texto legado com menos detalhes.',
        sourceReportedAt: '2026-09-10',
        treatmentStatus: 'in_review',
        treatmentStartedAt: '2026-09-09T09:00:00.000Z',
        client: CLIENT,
        linkedTaskIds: ['task-legacy'],
        taskId: 'task-legacy',
        createdAt: '2026-09-10T12:00:00.000Z',
        updatedAt: '2026-09-10T12:00:00.000Z'
      },
      {
        id: DJEN_ID,
        externalId: DJEN_ID,
        process: CNJ,
        source: 'DJEN',
        event: EVENT,
        title: 'Intimação oficial DJEN',
        text: 'Texto oficial completo publicado no DJEN.',
        rawHtml: '<p>Texto oficial completo publicado no DJEN.</p>',
        publishedAt: '2026-09-10',
        client: 'Recipient DJEN',
        treatmentStatus: 'untreated',
        unread: true,
        createdAt: '2026-09-10T07:00:00.000Z',
        updatedAt: '2026-09-10T07:00:00.000Z'
      }
    ],
    tasks: [
      {
        id: 'task-keeper',
        title: 'Providência oficial',
        intimationId: CANONICAL_ID,
        sourceIntimationId: CANONICAL_ID,
        publicationId: CANONICAL_ID,
        status: 'triagem'
      },
      {
        id: 'task-legacy',
        title: 'Providência legada',
        intimationId: LEGACY_ID,
        sourceIntimationId: LEGACY_ID,
        publicationId: LEGACY_ID,
        status: 'triagem'
      }
    ],
    processes: [],
    contacts: []
  };
}

try {
  const setupRes = await postJson(`${server.baseUrl}/api/auth/setup`, {
    username: 'admin_merge',
    displayName: 'Administrador Tratamento Teste',
    email: 'admin.merge@example.test',
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

  async function readPublicState() {
    const res = await fetch(`${server.baseUrl}/api/state`, { headers: { Cookie: cookie } });
    assert.equal(res.status, 200);
    return res.json();
  }

  // 1. Seed: o flush do cliente já funde oficial + legado + DJEN dentro da mesma revisão.
  const seedRes = await postJson(`${server.baseUrl}/api/state`, { state: seedState(), revision: null }, authHeaders);
  assert.equal(seedRes.status, 200, `seed deve salvar (HTTP ${seedRes.status})`);
  const seeded = await seedRes.json();
  assert.ok(seeded.revision);

  const canonical = await readCanonicalState();
  const canonicalIntimations = canonical.intimations || [];
  assert.equal(canonicalIntimations.length, 3, 'nenhum registro pode ser removido fisicamente');
  const keeper = canonicalIntimations.find(item => item.id === CANONICAL_ID);
  assert.ok(keeper, 'keeper oficial preservado');
  const aliases = canonicalIntimations.filter(item => item.mergedInto);
  assert.equal(aliases.length, 2, 'oficial absorve legado e DJEN como aliases');
  assert.ok(aliases.every(item => item.mergedInto === CANONICAL_ID));
  assert.ok(aliases.some(item => item.id === LEGACY_ID && item.mergeReason === 'duplicate-identity' && item.mergedAt));
  assert.equal(keeper.text, 'Texto oficial completo publicado no DJEN.', 'texto DJEN prevalece');
  assert.deepEqual(keeper.linkedTaskIds.sort(), ['task-keeper', 'task-legacy']);
  assert.equal(keeper.treatmentStatus, 'treated', 'tratamento do keeper preservado (evento mais recente)');
  assert.ok(Array.isArray(keeper.sourceAliases) && keeper.sourceAliases.includes(LEGACY_ID));
  assert.equal(canonical.tasks.length, 2, 'tarefas nunca são apagadas');
  const legacyTask = canonical.tasks.find(task => task.id === 'task-legacy');
  assert.equal(legacyTask.intimationId, CANONICAL_ID, 'tarefa do legado reaponta para o keeper');
  assert.equal(legacyTask.sourceIntimationId, CANONICAL_ID);
  assert.equal(legacyTask.publicationId, CANONICAL_ID);

  // 2. Painel/API pública não mostra alias.
  let publicEnv = await readPublicState();
  assert.equal(publicEnv.state.intimations.length, 1, 'painel mostra apenas o keeper');
  assert.equal(publicEnv.state.intimations[0].id, CANONICAL_ID);
  assert.equal(publicEnv.state.intimations[0].text, 'Texto oficial completo publicado no DJEN.');

  // 3. Audit de fusão sem PII (ids/fontes/motivo apenas).
  const mergeEntries = publicEnv.state.audit.filter(entry => entry.action === 'Publicações duplicadas fundidas');
  assert.equal(mergeEntries.length, 2, 'uma entrada de audit por registro absorvido');
  for (const entry of mergeEntries) {
    assert.match(
      entry.detail,
      /^Oficial [A-Za-z0-9:._-]+ absorveu [A-Za-z0-9:._-]+ \(fontes (?:djen|eproc|desconhecida)\+(?:djen|eproc|desconhecida); motivo duplicate-identity\)$/,
      'detalhe do audit contém apenas ids, fontes e motivo'
    );
    assert.ok(!entry.detail.includes(CLIENT), 'audit de fusão não contém nome de cliente');
    assert.ok(!entry.detail.includes('@'), 'audit de fusão não contém e-mail');
    assert.equal(entry.actor, 'Administrador Tratamento Teste', 'actor do audit vem da sessão autenticada');
  }

  // 4. Rota de tratamento com id antigo resolve o alias (nunca 404).
  const reopenRes = await postJson(
    `${server.baseUrl}/api/intimations/${encodeURIComponent(LEGACY_ID)}/treatment`,
    { action: 'reopen', revision: seeded.revision },
    authHeaders
  );
  assert.equal(reopenRes.status, 200, 'tratamento pelo id legado deve funcionar');
  const reopened = await reopenRes.json();
  assert.equal(reopened.intimation.id, CANONICAL_ID, 'tratamento recai no keeper oficial');
  assert.equal(reopened.intimation.treatmentStatus, 'in_review');
  let currentRevision = reopened.revision;

  // 5. 409/revision preservados e 404 real para id inexistente.
  const noRevisionRes = await postJson(
    `${server.baseUrl}/api/intimations/${encodeURIComponent(LEGACY_ID)}/treatment`,
    { action: 'mark_treated' },
    authHeaders
  );
  assert.equal(noRevisionRes.status, 409, 'revision obrigatória preservada');
  const badRevisionRes = await postJson(
    `${server.baseUrl}/api/intimations/${encodeURIComponent(LEGACY_ID)}/treatment`,
    { action: 'mark_treated', revision: 'revisao-obsoleta' },
    authHeaders
  );
  assert.equal(badRevisionRes.status, 409, 'revision divergente preservada');
  const missingRes = await postJson(
    `${server.baseUrl}/api/intimations/eproc:inexistente/treatment`,
    { action: 'mark_treated', revision: currentRevision },
    authHeaders
  );
  assert.equal(missingRes.status, 404, 'id inexistente continua 404');

  // 6. Rota de tarefa pelo id antigo cria tarefa apontando para o keeper.
  const taskRes = await postJson(
    `${server.baseUrl}/api/publications/${encodeURIComponent(LEGACY_ID)}/task`,
    { task: { id: 'task-wiring-new', title: 'Nova providência do legado' }, revision: currentRevision },
    authHeaders
  );
  assert.equal(taskRes.status, 201, `criação de tarefa pelo id legado deve funcionar (HTTP ${taskRes.status})`);
  const taskData = await taskRes.json();
  assert.equal(taskData.task.intimationId, CANONICAL_ID);
  assert.equal(taskData.publication.id, CANONICAL_ID);
  currentRevision = taskData.revision;

  // 7. Providência operacional pelo id antigo resolve o alias.
  const workRes = await postJson(
    `${server.baseUrl}/api/publications/${encodeURIComponent(LEGACY_ID)}/work-actions`,
    { action: { id: 'work-note-1', type: 'note', notes: 'Nota da providência' }, revision: currentRevision },
    authHeaders
  );
  assert.equal(workRes.status, 201, `providência pelo id legado deve funcionar (HTTP ${workRes.status})`);
  const workData = await workRes.json();
  assert.equal(workData.publication.id, CANONICAL_ID);
  assert.ok(workData.publication.workNotes.some(note => note.id === 'note-work-note-1'));
  currentRevision = workData.revision;

  // 8. E-mail individual e em lote resolvem o alias (SMTP mockado e configurado).
  const configureRes = await postJson(`${server.baseUrl}/api/integrations/email/configure`, {
    host: 'smtp.example.test',
    port: 465,
    secure: true,
    user: 'transporte@example.test',
    password: 'senha-sintetica',
    fromName: 'ATRIUM Teste',
    fromAddress: 'transporte@example.test'
  }, authHeaders);
  assert.equal(configureRes.status, 200, `SMTP mockado deve configurar (HTTP ${configureRes.status})`);
  const emailRes = await postJson(
    `${server.baseUrl}/api/intimations/email`,
    { publicationId: LEGACY_ID, recipient: 'destinatario@example.test' },
    authHeaders
  );
  assert.equal(emailRes.status, 200, `envio individual pelo id legado deve resolver o keeper (HTTP ${emailRes.status})`);
  const batchRes = await postJson(
    `${server.baseUrl}/api/publications/email/batch`,
    { publicationIds: [LEGACY_ID, CANONICAL_ID], recipient: 'destinatario@example.test' },
    authHeaders
  );
  assert.equal(batchRes.status, 200, `boletim pelo id legado deve resolver o keeper (HTTP ${batchRes.status})`);

  // 9. Flush do navegador sem aliases não remove o alias nem duplica o keeper.
  publicEnv = await readPublicState();
  const flushRes = await postJson(
    `${server.baseUrl}/api/state`,
    { state: publicEnv.state, revision: publicEnv.revision },
    authHeaders
  );
  assert.equal(flushRes.status, 200);
  const afterFlushCanonical = await readCanonicalState();
  assert.equal((afterFlushCanonical.intimations || []).length, 3, 'flush sem aliases preserva o alias no oficial');
  const afterFlushPublic = await readPublicState();
  assert.equal(afterFlushPublic.state.intimations.length, 1, 'painel continua com um registro visível');
  const aliasMergeEntries = afterFlushPublic.state.audit.filter(entry => entry.action === 'Publicações duplicadas fundidas');
  assert.equal(aliasMergeEntries.length, 2, 'flush idempotente não repete o audit de fusão');

  // 10. Aba obsoleta que ressuscita o perdedor é absorvida pelo keeper.
  const staleState = structuredClone(afterFlushPublic.state);
  const resurrected = {
    id: LEGACY_ID,
    externalId: LEGACY_ID,
    process: CNJ,
    source: 'eproc',
    event: EVENT,
    title: 'Despacho legado ressuscitado',
    text: 'Texto legado ressuscitado.',
    sourceReportedAt: '2026-09-10',
    treatmentStatus: 'untreated',
    createdAt: '2026-09-10T12:00:00.000Z',
    updatedAt: '2026-09-10T12:00:00.000Z'
  };
  staleState.intimations.push(resurrected);
  const staleRes = await postJson(
    `${server.baseUrl}/api/state`,
    { state: staleState, revision: afterFlushPublic.revision },
    authHeaders
  );
  assert.equal(staleRes.status, 200);
  const afterStaleCanonical = await readCanonicalState();
  const liveLegacy = (afterStaleCanonical.intimations || []).filter(item => item.id === LEGACY_ID && !item.mergedInto);
  assert.equal(liveLegacy.length, 0, 'perdedor ressuscitado não permanece vivo no oficial');
  const afterStalePublic = await readPublicState();
  assert.equal(afterStalePublic.state.intimations.length, 1, 'painel continua com um registro visível após flush obsoleto');
  const staleLookupRes = await postJson(
    `${server.baseUrl}/api/intimations/${encodeURIComponent(LEGACY_ID)}/treatment`,
    { action: 'mark_treated', revision: afterStalePublic.revision },
    authHeaders
  );
  assert.equal(staleLookupRes.status, 200, 'id antigo continua resolvendo para o keeper');
  assert.equal((await staleLookupRes.json()).intimation.id, CANONICAL_ID);

  // 11. Flush que omite o keeper restaura o keeper oficial (alias nunca fica órfão).
  {
    publicEnv = await readPublicState();
    const omitKeeperState = structuredClone(publicEnv.state);
    omitKeeperState.intimations = (omitKeeperState.intimations || []).filter(item => item.id !== CANONICAL_ID);
    const omitRes = await postJson(
      `${server.baseUrl}/api/state`,
      { state: omitKeeperState, revision: publicEnv.revision },
      authHeaders
    );
    assert.equal(omitRes.status, 200);
    const afterOmitCanonical = await readCanonicalState();
    const liveAfterOmit = (afterOmitCanonical.intimations || []).filter(item => !item.mergedInto);
    assert.equal(liveAfterOmit.length, 1, 'keeper omitido é restaurado a partir do estado consolidado');
    assert.equal(liveAfterOmit[0].id, CANONICAL_ID);
    const afterOmitPublic = await readPublicState();
    assert.equal(afterOmitPublic.state.intimations.length, 1, 'painel não perde a publicação quando o flush omite o keeper');
    assert.equal(afterOmitPublic.state.intimations[0].id, CANONICAL_ID);
    const resolveAfterOmit = await postJson(
      `${server.baseUrl}/api/intimations/${encodeURIComponent(LEGACY_ID)}/treatment`,
      { action: 'reopen', revision: afterOmitPublic.revision },
      authHeaders
    );
    assert.equal(resolveAfterOmit.status, 200);
    assert.equal((await resolveAfterOmit.json()).intimation.id, CANONICAL_ID);
  }

  // 12. Cadeia de aliases A→B→C: fusão posterior reaponta o keeper intermediário e o id
  // mais antigo continua resolvendo para o keeper final; tarefa do intermediário persiste.
  {
    const chainCnj = '5012345-67.2026.8.21.0002';
    const chainEvent = 'Intimação · Decisão';
    const chainA = {
      id: 'djen:chain-a',
      externalId: 'djen:chain-a',
      process: chainCnj,
      source: 'DJEN',
      event: chainEvent,
      title: 'Publicação da cadeia A',
      text: 'Texto da cadeia.',
      publishedAt: '2026-09-15',
      treatmentStatus: 'untreated',
      createdAt: '2026-09-15T08:00:00.000Z',
      updatedAt: '2026-09-15T08:00:00.000Z'
    };
    const chainB = {
      id: 'eproc:tjrs:chain-b',
      externalId: 'eproc:tjrs:chain-b',
      portalId: 'tjrs-eproc-1g',
      process: chainCnj,
      processNumber: chainCnj,
      source: 'eproc',
      event: chainEvent,
      title: 'Publicação da cadeia B',
      text: 'Texto da cadeia.',
      sourceReportedAt: '2026-09-15',
      sourceStatus: 'active',
      treatmentStatus: 'untreated',
      createdAt: '2026-09-15T09:00:00.000Z',
      updatedAt: '2026-09-15T09:00:00.000Z'
    };
    let chainEnv = await readPublicState();
    const chainState = structuredClone(chainEnv.state);
    chainState.intimations = [...(chainState.intimations || []), chainA, chainB];
    const chainRes1 = await postJson(
      `${server.baseUrl}/api/state`,
      { state: chainState, revision: chainEnv.revision },
      authHeaders
    );
    assert.equal(chainRes1.status, 200);
    chainEnv = await readPublicState();
    assert.equal(chainEnv.state.intimations.filter(item => String(item.process || '').includes('5012345')).length, 1, 'primeira fusão mantém apenas o keeper B');

    const chainC = {
      id: 'eproc:tjrs:chain-c',
      externalId: 'eproc:tjrs:chain-c',
      portalId: 'tjrs-eproc-1g',
      process: chainCnj,
      processNumber: chainCnj,
      source: 'eproc',
      event: chainEvent,
      title: 'Publicação da cadeia C',
      text: 'Texto da cadeia.',
      sourceReportedAt: '2026-09-15',
      sourceStatus: 'active',
      treatmentStatus: 'treated',
      treatedAt: '2026-09-16T10:00:00.000Z',
      treatedBy: 'Administrador Tratamento Teste',
      createdAt: '2026-09-15T10:00:00.000Z',
      updatedAt: '2026-09-16T10:00:00.000Z'
    };
    const secondState = structuredClone(chainEnv.state);
    secondState.intimations = [...(secondState.intimations || []), chainC];
    secondState.tasks = [
      ...(secondState.tasks || []),
      { id: 'task-chain-b', title: 'Providência da cadeia', intimationId: 'eproc:tjrs:chain-b', status: 'triagem' }
    ];
    const chainRes2 = await postJson(
      `${server.baseUrl}/api/state`,
      { state: secondState, revision: chainEnv.revision },
      authHeaders
    );
    assert.equal(chainRes2.status, 200);
    const chainCanonical = await readCanonicalState();
    const aliasA = chainCanonical.intimations.find(item => item.id === 'djen:chain-a');
    const aliasB = chainCanonical.intimations.find(item => item.id === 'eproc:tjrs:chain-b');
    assert.equal(aliasA.mergedInto, 'eproc:tjrs:chain-b', 'alias A aponta para o keeper intermediário');
    assert.equal(aliasB.mergedInto, 'eproc:tjrs:chain-c', 'keeper intermediário virou alias do keeper final');
    assert.equal(
      chainCanonical.tasks.find(task => task.id === 'task-chain-b').intimationId,
      'eproc:tjrs:chain-c',
      'tarefa do keeper intermediário é reapontada e persiste'
    );
    const chainPublic = await readPublicState();
    const chainVisible = chainPublic.state.intimations.filter(item => String(item.process || '').includes('5012345'));
    assert.equal(chainVisible.length, 1, 'painel mostra apenas o keeper final');
    assert.equal(chainVisible[0].id, 'eproc:tjrs:chain-c');
    const chainLookup = await postJson(
      `${server.baseUrl}/api/intimations/${encodeURIComponent('djen:chain-a')}/treatment`,
      { action: 'reopen', revision: chainPublic.revision },
      authHeaders
    );
    assert.equal(chainLookup.status, 200, 'id mais antigo da cadeia continua resolvendo');
    assert.equal((await chainLookup.json()).intimation.id, 'eproc:tjrs:chain-c');
  }

  // 13. Audit de fusão é server-side e não é truncado pelo cap de 100 entradas do cliente.
  {
    const capCnj = '5023456-78.2026.8.21.0003';
    const capD = {
      id: 'djen:audit-d',
      externalId: 'djen:audit-d',
      process: capCnj,
      source: 'DJEN',
      event: EVENT,
      title: 'Publicação do cap D',
      text: 'Texto do cap.',
      publishedAt: '2026-09-16',
      createdAt: '2026-09-16T08:00:00.000Z',
      updatedAt: '2026-09-16T08:00:00.000Z'
    };
    const capE = {
      id: 'eproc:tjrs:audit-e',
      externalId: 'eproc:tjrs:audit-e',
      process: capCnj,
      processNumber: capCnj,
      source: 'eproc',
      event: EVENT,
      title: 'Publicação do cap E',
      text: 'Texto do cap.',
      sourceReportedAt: '2026-09-16',
      createdAt: '2026-09-16T09:00:00.000Z',
      updatedAt: '2026-09-16T09:00:00.000Z'
    };
    const capEnv = await readPublicState();
    const capState = structuredClone(capEnv.state);
    capState.intimations = [...(capState.intimations || []), capD, capE];
    capState.audit = [
      ...(capState.audit || []),
      ...Array.from({ length: 120 }, (_, index) => ({
        id: `aud-client-camp-${index}`,
        at: new Date().toISOString(),
        action: 'Alteração sintética de teste',
        detail: `Entrada sintética ${index}`
      }))
    ];
    const capRes = await postJson(
      `${server.baseUrl}/api/state`,
      { state: capState, revision: capEnv.revision },
      authHeaders
    );
    assert.equal(capRes.status, 200);
    const capCanonical = await readCanonicalState();
    const capMergeEntries = (capCanonical.audit || []).filter(
      entry => entry.action === 'Publicações duplicadas fundidas' && entry.detail.includes('audit-d')
    );
    assert.equal(capMergeEntries.length, 1, 'audit de fusão sobrevive ao cap de 100 do cliente');
    assert.ok((capCanonical.audit || []).length <= 1000, 'cap global de 1000 continua respeitado');
    const clientEntries = (capCanonical.audit || []).filter(entry => String(entry.id || '').startsWith('aud-client-camp-'));
    assert.equal(clientEntries.length, 100, 'entradas do cliente continuam limitadas a 100 por flush');
  }

  // 14. Contrato de wiring no server (guardas de regressão).
  const serverSource = serverSourceText;
  assert.match(serverSource, /mergeDuplicateIntimationsIntoState\(next/, 'persistência oficial deve fundir duplicatas antes de salvar');
  assert.match(serverSource, /withoutMergedIntimationAliases\(redactEprocSecrets/, 'envelope público deve filtrar aliases');
  assert.match(serverSource, /state: withoutMergedIntimationAliases/, 'envelope público deve filtrar aliases na resposta READY');
  assert.match(serverSource, /const canonicalPublication = resolveIntimationAlias\(intimations, publicationId\)/, 'envio individual deve resolver alias');
  assert.match(serverSource, /publicationsById.get\(id\) \|\| resolveIntimationAlias\(intimations, id\)/, 'boletim deve resolver alias');

  // 15. Save do sweep eproc/PJe passa pelo fluxo oficial compartilhado e o digest usa
  // as chaves absorvidas (sem isso o par ficaria vivo e o perdedor seria anunciado).
  const saveWithEventsStart = serverSource.indexOf('async function saveAppStateWithNotificationEvents(');
  const saveWithEventsEnd = serverSource.indexOf('\nasync function recordSyncDigestEvents(', saveWithEventsStart);
  assert.ok(saveWithEventsStart > 0 && saveWithEventsEnd > saveWithEventsStart, 'save oficial de eventos deve existir em server.mjs');
  const saveWithEventsBlock = serverSource.slice(saveWithEventsStart, saveWithEventsEnd);
  assert.match(
    saveWithEventsBlock,
    /applyCanonicalIntimationMerge\(value, previous\.state\?\.intimations/,
    'save do sweep deve reaplicar aliases e fundir duplicatas antes de gravar'
  );
  assert.match(
    saveWithEventsBlock,
    /absorbedKeys: absorbedIntimationKeys\(mergeOutcome\.merges\)/,
    'digest do save do sweep deve excluir perdedores absorvidos'
  );
  assert.match(
    serverSource,
    /saveState: async \(state, expectedRevision\) => saveAppStateWithNotificationEvents\(/,
    'sweep eproc A1 deve salvar pelo save oficial com eventos'
  );
  assert.doesNotMatch(
    saveWithEventsBlock,
    /saveAppStateDirect\(value, expectedRevision\)[\s\S]*?selectNewPublicationEvents\(value\?\.intimations, \{ previousKeys: previousIds \}\)/,
    'caminho antigo sem absorbedKeys não pode permanecer'
  );

  console.log('✓ Wiring: fusão oficial, painel sem alias, tarefas reapontadas, rotas por id antigo e audit sem PII validados.');
} finally {
  await server.stop();
}

console.log('\n[PASS] Todos os cenários de wiring da fusão passaram.');
