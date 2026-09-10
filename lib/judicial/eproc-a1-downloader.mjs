import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

import { createModernizedPfx } from './a1-sandbox.mjs';
import { SecurityManager, generateTotp } from '../security.mjs';
import { EncryptedLocalDocumentStorageProvider } from '../documents/document-storage-provider.mjs';
import { JudicialCredentialManager } from './credential-manager.mjs';
import {
  authenticateEprocWithCertAndTotp,
  openEprocProcessDetails,
  extractProcessDetails,
  downloadAndOrganizeProcessDocuments,
  collectEprocDeadlines
} from '../../collector/adapters/eproc.mjs';
import { parseBrDateToIso } from './eproc-downloads-ingester.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.dirname(path.dirname(path.dirname(__filename)));
const DATA_DIR = path.join(ROOT, 'data');
const APP_STATE_FILE = path.join(DATA_DIR, 'app-state.json');

async function cleanStaleProfileLocks(profileDir) {
  try {
    for (const lockFile of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lockfile']) {
      const lockPath = path.join(profileDir, lockFile);
      if (existsSync(lockPath)) {
        await rm(lockPath, { force: true }).catch(() => {});
      }
    }
  } catch {}
}

export async function downloadProcessWithA1({
  cnj,
  pfxPath,
  passphrase,
  totpSecret,
  headed = false,
  securityManager,
  documentStorage: injectedDocStorage,
  readStateEnvelope,
  saveState
}) {
  if (!cnj) throw new Error('O número CNJ do processo é obrigatório.');

  const sec = securityManager || new SecurityManager({
    dataDirectory: DATA_DIR,
    sessionSecret: process.env.AUTH_SESSION_SECRET,
    encryptionKey: process.env.AUTH_ENCRYPTION_KEY
  });
  if (!securityManager) await sec.init();

  const credManager = new JudicialCredentialManager({
    dataDirectory: DATA_DIR,
    securityManager: sec
  });
  await credManager.init();
  const rawSecrets = await credManager.readRawSecrets();

  // 1. Resolução do Certificado A1
  let certPath = pfxPath || rawSecrets.certificate?.path || process.env.A1_PFX_PATH;
  let certPass = passphrase || rawSecrets.certificate?.passphrase || process.env.A1_PFX_PASSPHRASE;

  if (certPath && !path.isAbsolute(certPath)) {
    certPath = path.resolve(ROOT, certPath);
  }

  if (!certPath || !existsSync(certPath)) {
    throw Object.assign(
      new Error('Certificado Digital A1 não encontrado. Acesse o menu "Cobertura Judicial" (Etapa 1) e vincule seu arquivo .pfx.'),
      { statusCode: 412, code: 'A1_CERT_MISSING' }
    );
  }

  if (!certPass) {
    throw Object.assign(
      new Error('Senha do Certificado Digital A1 não informada. Atualize o certificado no menu "Cobertura Judicial".'),
      { statusCode: 412, code: 'A1_PASSPHRASE_MISSING' }
    );
  }

  // 2. Resolução do Segredo TOTP (2FA)
  let activeTotpSecret = totpSecret
    || rawSecrets.totpSecrets?.['eproc-tjrs-1g']?.secret
    || rawSecrets.totpSecrets?.['tjrs-eproc-1g']?.secret;

  if (!activeTotpSecret) {
    // Procura por qualquer segredo TOTP configurado para eproc
    const eprocKey = Object.keys(rawSecrets.totpSecrets || {}).find(k => /eproc|tjrs/i.test(k));
    if (eprocKey) activeTotpSecret = rawSecrets.totpSecrets[eprocKey].secret;
  }

  if (!activeTotpSecret) {
    throw Object.assign(
      new Error('Segundo fator (2FA TOTP) do eproc TJRS não configurado. Acesse o menu "Cobertura Judicial" (Etapa 3) e vincule seu QR Code do TJRS.'),
      { statusCode: 412, code: 'TOTP_2FA_MISSING' }
    );
  }

  // 3. Gera código TOTP atual
  const totpCode = generateTotp(activeTotpSecret);

  // 4. Moderniza o certificado temporariamente para o Node/Playwright
  const modernCert = await createModernizedPfx({ pfxPath: certPath, passphrase: certPass });

  const profileDir = path.join(DATA_DIR, 'browser-profiles', 'agent-eproc-worker');
  await mkdir(profileDir, { recursive: true });
  await cleanStaleProfileLocks(profileDir);

  const clientCerts = [
    { origin: 'https://eproc1g.tjrs.jus.br', pfxPath: modernCert.modernPath, passphrase: modernCert.modernPassphrase },
    { origin: 'https://keycloak-httpd-mtls.tjrs.jus.br', pfxPath: modernCert.modernPath, passphrase: modernCert.modernPassphrase }
  ];

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: !headed,
    viewport: { width: 1440, height: 960 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    acceptDownloads: true,
    clientCertificates: clientCerts
  });

  const page = context.pages()[0] || (await context.newPage());

  try {
    // 5. Autenticação no eproc TJRS
    const authResult = await authenticateEprocWithCertAndTotp(page, 'https://eproc1g.tjrs.jus.br/eproc/', {
      totpSecret: activeTotpSecret
    });
    if (!authResult.ok) {
      throw new Error('Falha na autenticação do eproc TJRS com o Certificado A1 e TOTP.');
    }

    // 6. Abre processo no eproc
    await openEprocProcessDetails(page, cnj);
    const details = await extractProcessDetails(page);
    const clientName = details.clientName || '';

    // 7. Download das peças reais
    const safeClient = (clientName || 'Processos').replace(/[^\w.-]/g, '_');
    const safeCnj = cnj.replace(/[^\w.-]/g, '_');
    const targetDir = path.join(DATA_DIR, 'storage', 'processos', safeClient, safeCnj);

    const downloadResult = await downloadAndOrganizeProcessDocuments(page, {
      cnj: details.number || cnj,
      clientName,
      targetBaseDir: targetDir,
      maxPieces: 100
    });

    // 8. Ingestão Canônica e Criptográfica no ATRIUM
    const docStorage = injectedDocStorage || new EncryptedLocalDocumentStorageProvider({
      dataDirectory: DATA_DIR,
      securityManager: sec
    });
    if (!injectedDocStorage) await docStorage.init();

    let state;
    let envelopeRevision = null;

    if (readStateEnvelope) {
      const envelope = await readStateEnvelope();
      state = structuredClone(envelope?.state || envelope || {});
      envelopeRevision = envelope?.revision || null;
    } else {
      const raw = JSON.parse(await readFile(APP_STATE_FILE, 'utf8'));
      state = JSON.parse(sec.decrypt(raw.encrypted));
      envelopeRevision = raw.revision || raw.updatedAt || null;
    }

    if (!state || typeof state !== 'object') state = {};
    state.processes = Array.isArray(state.processes) ? state.processes : [];
    state.documents = Array.isArray(state.documents) ? state.documents : [];

    const normDigits = cnj.replace(/\D/g, '');
    let proc = state.processes.find(p =>
      (p.number && p.number.replace(/\D/g, '') === normDigits) ||
      (p.id && p.id.replace(/\D/g, '').includes(normDigits))
    );
    const procId = proc ? proc.id : `proc-${normDigits}`;
    const nowIso = new Date().toISOString();

    if (!proc) {
      proc = {
        id: procId,
        number: details.number || cnj,
        client: clientName,
        clientDocument: details.clientDocument || '',
        clientPosition: details.clientPosition || '',
        opposingParty: details.opposingParty || '',
        opposingPartyDocument: details.opposingPartyDocument || '',
        opposingPosition: details.opposingPosition || '',
        title: `${clientName} — ${details.actionClass || 'Processo Judicial'} (eproc A1)`,
        court: details.court || 'TJRS · eproc 1º grau',
        judge: details.judge || '',
        actionClass: details.actionClass || '',
        competence: details.competence || '',
        caseValue: details.caseValue || '',
        value: details.caseValue || '',
        secrecy: Boolean(details.secrecy),
        secrecyLevel: details.secrecyLevel || '',
        distributionDate: details.distributionDate || '',
        status: details.status || 'ATIVO',
        source: 'eproc-tjrs',
        system: 'eproc',
        movementsCount: details.movementsCount || 0,
        movements: details.movements || [],
        tags: ['eproc', 'tjrs', 'certificado-a1', 'autos-integrais'],
        createdAt: nowIso,
        updatedAt: nowIso
      };
      if (details.secrecy) proc.tags.push('segredo-de-justica');
      if (details.accessKey) proc.tags.push('chave-disponivel');
      state.processes.unshift(proc);
    } else {
      proc.client = clientName || proc.client;
      if (details.clientDocument) proc.clientDocument = details.clientDocument;
      if (details.clientPosition) proc.clientPosition = details.clientPosition;
      if (details.opposingParty) proc.opposingParty = details.opposingParty;
      if (details.opposingPartyDocument) proc.opposingPartyDocument = details.opposingPartyDocument;
      if (details.opposingPosition) proc.opposingPosition = details.opposingPosition;
      if (details.caseValue) {
        proc.caseValue = details.caseValue;
        proc.value = details.caseValue;
      }
      if (details.accessKey) {
        if (!Array.isArray(proc.tags)) proc.tags = [];
        if (!proc.tags.includes('chave-disponivel')) proc.tags.push('chave-disponivel');
      }
      if (details.secrecy) {
        proc.secrecy = true;
        proc.secrecyLevel = details.secrecyLevel || proc.secrecyLevel || 'Segredo de Justiça (Nível 1)';
        if (!Array.isArray(proc.tags)) proc.tags = [];
        if (!proc.tags.includes('segredo-de-justica')) proc.tags.push('segredo-de-justica');
      }
      proc.court = details.court || proc.court;
      proc.judge = details.judge || proc.judge;
      proc.actionClass = details.actionClass || proc.actionClass;
      proc.competence = details.competence || proc.competence;
      proc.movementsCount = details.movementsCount || proc.movementsCount;
      if (Array.isArray(details.movements) && details.movements.length > 0) {
        proc.movements = details.movements;
      }
      proc.lastSyncAt = nowIso;
      proc.updatedAt = nowIso;
    }

    // Salva no cofre de credenciais para que o coletor leve do TJRS possa consultar sem A1
    if (details.accessKey) {
      const userIdsToSave = new Set([
        'admin',
        ...(state.users || []).map(u => u.username || u.id).filter(Boolean)
      ]);
      for (const uid of userIdsToSave) {
        try {
          await credManager.saveProcessAccessKey(proc.number, {
            accessKey: details.accessKey,
            userId: uid
          });
        } catch (err) {
          console.warn(`[eproc download] Aviso ao salvar chave no cofre para ${uid}: ${err.message}`);
        }
      }
    }

    // Ingestão das peças baixadas
    let ingestedCount = 0;
    for (const f of downloadResult.files) {
      const fileBinary = await readFile(f.path);
      const { checksum } = await docStorage.put(fileBinary);

      const existingDoc = state.documents.find(
        d => (d.ownerId === procId || d.ownerId === proc.number) && d.name === f.name
      );

      const isIndice = f.type === 'indice';
      const docType = isIndice ? 'Índice de Autos Oficiais' : 'Peça Processual (eproc A1)';

      if (existingDoc) {
        existingDoc.checksum = checksum;
        existingDoc.size = fileBinary.length;
        existingDoc.updatedAt = nowIso;
        existingDoc.documentType = docType;
        existingDoc.metadata = {
          ...(existingDoc.metadata || {}),
          origin: 'eproc TJRS (Certificado A1)',
          localPath: f.path,
          summary: f.name.replace(/\.pdf$/i, ''),
          context: 'Peça oficial extraída dos autos integrais do eproc TJRS via Certificado Digital A1.'
        };
      } else {
        state.documents.push({
          id: `doc-eproc-${randomBytes(6).toString('hex')}`,
          name: f.name,
          originalName: f.name,
          mime: 'application/pdf',
          size: fileBinary.length,
          createdAt: nowIso,
          updatedAt: nowIso,
          documentDate: nowIso.slice(0, 10),
          ownerType: 'process',
          ownerId: procId,
          documentType: docType,
          metadata: {
            origin: 'eproc TJRS (Certificado A1)',
            tags: ['eproc', 'autos', 'tjrs', 'a1', 'peca-oficial'],
            localPath: f.path,
            summary: f.name.replace(/\.pdf$/i, ''),
            context: 'Peça oficial extraída dos autos integrais do eproc TJRS via Certificado Digital A1.'
          },
          derivation: {
            kind: 'eproc-autos-download',
            downloadedAt: nowIso
          },
          deletedAt: null,
          checksum
        });
      }
      ingestedCount++;
    }

    // Registro de Auditoria
    state.audit = Array.isArray(state.audit) ? state.audit : [];
    state.audit.unshift({
      id: `audit-eproc-autos-${randomBytes(6).toString('hex')}`,
      at: nowIso,
      action: 'Autos oficiais baixados (eproc A1)',
      detail: `${cnj} · ${clientName} · ${downloadResult.totalFiles} peça(s) oficial(is) arquivada(s)`,
      actor: 'Certificado A1 / eproc'
    });

    // Salva o estado
    let nextRevision = envelopeRevision;
    if (saveState) {
      const savedResult = await saveState(state, envelopeRevision);
      nextRevision = savedResult?.revision || envelopeRevision;
    } else {
      const raw = JSON.parse(await readFile(APP_STATE_FILE, 'utf8'));
      raw.encrypted = sec.encrypt(JSON.stringify(state));
      raw.updatedAt = nowIso;
      raw.revision = (raw.revision || 0) + 1;
      nextRevision = raw.revision;
      await writeFile(APP_STATE_FILE, JSON.stringify(raw, null, 2), 'utf8');
    }

    return {
      ok: true,
      cnj: details.number || cnj,
      client: clientName,
      court: details.court,
      totalFiles: downloadResult.totalFiles,
      piecesCount: ingestedCount,
      documents: state.documents,
      revision: nextRevision
    };
  } finally {
    if (modernCert?.cleanup) await modernCert.cleanup().catch(() => {});
    await context.close().catch(() => {});
  }
}

/**
 * Varredura A1: Desvenda processos com Segredo de Justiça no eproc TJRS,
 * vincula clientes não identificados e preenche dados faltantes (juiz, comarca, vara, classe).
 */
export async function sweepAndEnrichProcessesWithA1({
  processNumber,
  securityManager,
  readStateEnvelope,
  saveState,
  maxProcesses = 50,
  headed = false
} = {}) {
  const sec = securityManager || new SecurityManager({
    dataDirectory: DATA_DIR,
    sessionSecret: process.env.AUTH_SESSION_SECRET,
    encryptionKey: process.env.AUTH_ENCRYPTION_KEY
  });
  if (!securityManager) await sec.init();

  let state;
  let envelopeRevision = null;

  if (readStateEnvelope) {
    const envelope = await readStateEnvelope();
    state = structuredClone(envelope?.state || envelope || {});
    envelopeRevision = envelope?.revision || null;
  } else {
    const raw = JSON.parse(await readFile(APP_STATE_FILE, 'utf8'));
    state = JSON.parse(sec.decrypt(raw.encrypted));
    envelopeRevision = raw.revision || raw.updatedAt || null;
  }

  if (!state || typeof state !== 'object') state = {};
  state.processes = Array.isArray(state.processes) ? state.processes : [];
  state.contacts = Array.isArray(state.contacts) ? state.contacts : [];
  state.audit = Array.isArray(state.audit) ? state.audit : [];
  state.intimations = Array.isArray(state.intimations) ? state.intimations : [];
  state.tasks = Array.isArray(state.tasks) ? state.tasks : [];
  state.events = Array.isArray(state.events) ? state.events : [];

  // Filtra processos TJRS
  const tjrsProcesses = state.processes.filter(p => {
    const num = String(p.number || '');
    const court = String(p.court || '').toUpperCase();
    return num.includes('.8.21.') || court.includes('TJRS') || p.source === 'eproc-tjrs';
  });

  let targets = [];
  if (processNumber) {
    const norm = String(processNumber).replace(/\D/g, '');
    const specific = tjrsProcesses.filter(p => (p.number || '').replace(/\D/g, '').includes(norm));
    if (specific.length > 0) {
      targets = specific;
    }
  }

  if (targets.length === 0) {
    const candidates = tjrsProcesses.filter(p => {
      const client = String(p.client || '').trim();
      const isSigilo = client.toUpperCase() === 'SIGILO' || p.secrecy === true || (p.tags && p.tags.includes('segredo-de-justica'));
      const isMissingClient = !client || client === 'undefined' || client === 'null' ||
        /^(?:cliente\s+)?(?:geral|n[aã]o\s+informado|n[aã]o\s+identificado|modelo|do\s+escrit[oó]rio|sigilo|n\/?i|sem\s+cliente)$/i.test(client);
      const isMissingData = !p.judge || !p.court || !p.actionClass;
      const isMissingKey = !p.accessKey && !p.chaveAcesso;
      const isMissingOpposing = !p.opposingParty;
      return isSigilo || isMissingClient || isMissingData || isMissingKey || isMissingOpposing;
    });

    // Ordena priorizando segredos de justiça, clientes ausentes e chaves faltantes
    candidates.sort((a, b) => {
      const aClient = String(a.client || '').trim().toLowerCase();
      const bClient = String(b.client || '').trim().toLowerCase();
      const aMissing = !aClient || aClient === 'undefined' || /geral|n[aã]o|sigilo/i.test(aClient);
      const bMissing = !bClient || bClient === 'undefined' || /geral|n[aã]o|sigilo/i.test(bClient);
      const aScore = (aClient === 'sigilo' ? 10 : 0) + (aMissing ? 8 : 0) + (!a.accessKey ? 4 : 0);
      const bScore = (bClient === 'sigilo' ? 10 : 0) + (bMissing ? 8 : 0) + (!b.accessKey ? 4 : 0);
      return bScore - aScore;
    });

    targets = candidates.slice(0, maxProcesses);
  }

  console.log(`[eproc sweep] ${targets.length} processo(s) TJRS necessitam de enriquecimento cadastral.`);

  // Resolução de credenciais A1 + 2FA
  const credManager = new JudicialCredentialManager({
    dataDirectory: DATA_DIR,
    securityManager: sec
  });
  await credManager.init();
  const rawSecrets = await credManager.readRawSecrets();

  let certPath = rawSecrets.certificate?.path || process.env.A1_PFX_PATH;
  let certPass = rawSecrets.certificate?.passphrase || process.env.A1_PFX_PASSPHRASE;

  if (certPath && !path.isAbsolute(certPath)) {
    certPath = path.resolve(ROOT, certPath);
  }

  if (!certPath || !existsSync(certPath)) {
    throw Object.assign(
      new Error('Certificado Digital A1 não encontrado. Acesse o menu "Cobertura Judicial" (Etapa 1) e vincule seu arquivo .pfx.'),
      { statusCode: 412, code: 'A1_CERT_MISSING' }
    );
  }

  if (!certPass) {
    throw Object.assign(
      new Error('Senha do Certificado Digital A1 não informada. Atualize o certificado no menu "Cobertura Judicial".'),
      { statusCode: 412, code: 'A1_PASSPHRASE_MISSING' }
    );
  }

  let activeTotpSecret = rawSecrets.totpSecrets?.['eproc-tjrs-1g']?.secret
    || rawSecrets.totpSecrets?.['tjrs-eproc-1g']?.secret;

  if (!activeTotpSecret) {
    const eprocKey = Object.keys(rawSecrets.totpSecrets || {}).find(k => /eproc|tjrs/i.test(k));
    if (eprocKey) activeTotpSecret = rawSecrets.totpSecrets[eprocKey].secret;
  }

  if (!activeTotpSecret) {
    throw Object.assign(
      new Error('Segundo fator (2FA TOTP) do eproc TJRS não configurado. Acesse o menu "Cobertura Judicial" (Etapa 3) e vincule seu QR Code do TJRS.'),
      { statusCode: 412, code: 'TOTP_2FA_MISSING' }
    );
  }

  const modernCert = await createModernizedPfx({ pfxPath: certPath, passphrase: certPass });
  const profileDir = path.join(DATA_DIR, 'browser-profiles', 'agent-eproc-worker');
  await mkdir(profileDir, { recursive: true });
  await cleanStaleProfileLocks(profileDir);

  const clientCerts = [
    { origin: 'https://eproc1g.tjrs.jus.br', pfxPath: modernCert.modernPath, passphrase: modernCert.modernPassphrase },
    { origin: 'https://keycloak-httpd-mtls.tjrs.jus.br', pfxPath: modernCert.modernPath, passphrase: modernCert.modernPassphrase }
  ];

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: !headed,
    viewport: { width: 1440, height: 960 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    acceptDownloads: false,
    clientCertificates: clientCerts
  });

  const page = context.pages()[0] || (await context.newPage());
  const updatedProcesses = [];

  try {
    const authResult = await authenticateEprocWithCertAndTotp(page, 'https://eproc1g.tjrs.jus.br/eproc/', {
      totpSecret: activeTotpSecret
    });
    if (!authResult.ok) {
      throw new Error('Falha na autenticação do eproc TJRS com o Certificado A1 e TOTP.');
    }

    const nowIso = new Date().toISOString();
    let newIntimationsCount = 0;
    let newTasksCount = 0;

    // Coleta intimações e prazos em aberto do Painel do Advogado
    try {
      console.log('[eproc sweep] Coletando prazos em aberto e intimações do painel do advogado no eproc TJRS...');
      const eprocDeadlines = await collectEprocDeadlines(page).catch(e => {
        console.warn(`[eproc sweep] Aviso ao ler prazos do painel: ${e.message}`);
        return { openDeadlines: [], pendingIntimations: [] };
      });
      const allIntimations = [...(eprocDeadlines.pendingIntimations || []), ...(eprocDeadlines.openDeadlines || [])];
      state.intimations = Array.isArray(state.intimations) ? state.intimations : [];
      state.tasks = Array.isArray(state.tasks) ? state.tasks : [];
      state.processes = Array.isArray(state.processes) ? state.processes : [];

      for (const item of allIntimations) {
        if (!item.processNumber) continue;
        const cnjNorm = item.processNumber.replace(/\D/g, '');
        const isoSent = parseBrDateToIso(item.sentAt || item.startsAt) || nowIso.slice(0, 10);
        const isoDeadline = parseBrDateToIso(item.deadlineAt);

        // Deduplicação de intimação por CNJ + data/evento/assunto
        const intExists = state.intimations.some(i => {
          const iCnj = (i.processNumber || i.process || '').replace(/\D/g, '');
          if (iCnj !== cnjNorm) return false;
          if (i.date && (i.date === isoSent || i.date === item.sentAt)) return true;
          return i.event === item.event || i.description === item.subject || i.title === item.subject;
        });

        const intimationId = `intimation:eproc:${cnjNorm}-${(isoSent || 'hoje').replace(/\D/g, '')}-${randomBytes(3).toString('hex')}`;

        if (!intExists) {
          state.intimations.unshift({
            id: intimationId,
            externalId: intimationId,
            processNumber: item.processNumber,
            process: item.processNumber,
            source: 'eproc TJRS',
            court: 'TJRS · eproc 1º grau',
            event: item.event || 'Intimação eletrônica',
            title: item.subject || item.event || 'Intimação eproc TJRS',
            description: `${item.subject || item.className || 'Intimação eproc'} — ${item.processDetails || ''}`.trim(),
            date: isoSent,
            publishedAt: isoSent,
            deadline: isoDeadline,
            deadlineAt: isoDeadline,
            status: item.deadlineAt ? 'aberta' : 'pendente',
            unread: true,
            createdAt: nowIso
          });
          newIntimationsCount++;
        }

        // Lança como tarefa e prazo judicial na lista de Tarefas e Prazos
        if (isoDeadline || item.deadlineAt) {
          const deadlineToUse = isoDeadline || nowIso.slice(0, 10);
          const taskExists = state.tasks.some(t => {
            const tProc = (t.process || t.processNumber || '').replace(/\D/g, '');
            if (tProc !== cnjNorm) return false;
            return t.deadline === deadlineToUse || t.fatalDeadline === deadlineToUse || t.intimationId === intimationId;
          });

          if (!taskExists) {
            const isFatalOrSoon = deadlineToUse <= nowIso.slice(0, 10);
            state.tasks.unshift({
              id: `task:eproc:${cnjNorm}-${deadlineToUse.replace(/\D/g, '')}-${randomBytes(3).toString('hex')}`,
              title: `Cumprir Prazo — ${item.subject || item.event || 'Intimação eproc TJRS'}: ${item.processNumber}`,
              description: `Prazo apurado via eproc TJRS (Painel do Advogado).\nProcesso: ${item.processNumber}\nEvento: ${item.event || 'Intimação'}\nAssunto: ${item.subject || item.className || 'Prazo em aberto'}\nDetalhes: ${item.processDetails || '—'}`.trim(),
              process: item.processNumber,
              processNumber: item.processNumber,
              deadline: deadlineToUse,
              fatalDeadline: deadlineToUse,
              priority: isFatalOrSoon ? 'urgente' : 'high',
              status: 'triagem', // Entrada & triagem do Kanban
              category: 'Prazo Judicial',
              source: 'eproc TJRS',
              intimationId: intimationId,
              metadata: {
                origin: 'eproc TJRS - Painel do Advogado',
                tags: ['eproc', 'prazo-judicial', 'tjrs']
              },
              createdAt: nowIso,
              updatedAt: nowIso
            });
            newTasksCount++;
          }
        }

        // Se o processo ainda não constar na lista de processos, cadastra-o automaticamente
        const procExists = state.processes.some(p => (p.number || '').replace(/\D/g, '') === cnjNorm);
        if (!procExists) {
          state.processes.unshift({
            id: `proc:eproc:${cnjNorm}`,
            number: item.processNumber,
            title: `${item.subject || item.className || 'Processo Judicial'} (TJRS)`,
            client: '',
            court: 'TJRS · eproc 1º grau',
            actionClass: item.className || 'Procedimento Comum',
            status: 'ATIVO',
            source: 'eproc-tjrs',
            tags: ['eproc', 'tjrs', 'painel-advogado'],
            createdAt: nowIso,
            updatedAt: nowIso
          });
        }
      }

      if (newIntimationsCount > 0 || newTasksCount > 0) {
        console.log(`[eproc sweep] ✓ ${newIntimationsCount} nova(s) intimação(ões) e ${newTasksCount} novo(s) prazo(s) adicionados às Tarefas do sistema.`);
        state.audit.unshift({
          id: `aud-${Date.now()}-${randomBytes(4).toString('hex')}`,
          at: nowIso,
          action: 'Sincronização Painel eproc TJRS',
          detail: `Painel do Advogado: +${newIntimationsCount} intimação(ões) e +${newTasksCount} prazo(s) judicial(is) cadastrados automaticamente.`,
          actor: 'Certificado Digital A1'
        });
      }
    } catch (intimationErr) {
      console.warn(`[eproc sweep] Aviso na leitura de intimações: ${intimationErr.message}`);
    }

    for (const proc of targets) {
      try {
        console.log(`[eproc sweep] Varrendo processo: ${proc.number}`);
        await page.waitForTimeout(1_500); // Cadência conservadora
        await openEprocProcessDetails(page, proc.number);
        const details = await extractProcessDetails(page);

        let modified = false;

        // Revela cliente sob segredo ou preenche cliente ausente
        const isClientMissingOrGeneric = !proc.client ||
          proc.client === 'undefined' ||
          proc.client === 'null' ||
          /^(?:cliente\s+)?(?:geral|n[aã]o\s+informado|n[aã]o\s+identificado|modelo|do\s+escrit[oó]rio|sigilo|n\/?i|sem\s+cliente)$/i.test(String(proc.client || '').trim()) ||
          Boolean(proc.secrecy) ||
          String(proc.client || '').toUpperCase() === 'SIGILO';

        if (details.clientName && !/^(?:cliente\s+)?(?:geral|modelo|do\s+escrit[oó]rio)$/i.test(details.clientName)) {
          if (isClientMissingOrGeneric || !proc.client) {
            proc.client = details.clientName;
            modified = true;

            // Propaga cliente real para tarefas e intimações vinculadas
            const pNorm = (proc.number || '').replace(/\D/g, '');
            (state.tasks || []).forEach(t => {
              const tNorm = (t.process || t.processNumber || '').replace(/\D/g, '');
              if (t.processId === proc.id || (pNorm && tNorm === pNorm)) {
                if (!t.client || /^(?:cliente\s+)?(?:geral|n[aã]o\s+informado|n[aã]o\s+identificado|modelo|do\s+escrit[oó]rio|sigilo|sem\s+cliente)$/i.test(t.client)) {
                  t.client = details.clientName;
                }
              }
            });
            (state.intimations || []).forEach(i => {
              const iNorm = (i.process || i.processNumber || '').replace(/\D/g, '');
              if (i.processId === proc.id || (pNorm && iNorm === pNorm)) {
                if (!i.client || /^(?:cliente\s+)?(?:geral|n[aã]o\s+informado|n[aã]o\s+identificado|modelo|do\s+escrit[oó]rio|sigilo|sem\s+cliente)$/i.test(i.client)) {
                  i.client = details.clientName;
                }
              }
            });
          }
        }

        if (details.clientDocument && (!proc.clientDocument || proc.clientDocument !== details.clientDocument)) {
          proc.clientDocument = details.clientDocument;
          modified = true;
        }

        if (details.clientPosition && (!proc.clientPosition || proc.clientPosition !== details.clientPosition)) {
          proc.clientPosition = details.clientPosition;
          modified = true;
        }

        if (details.opposingParty && (!proc.opposingParty || proc.opposingParty !== details.opposingParty)) {
          proc.opposingParty = details.opposingParty;
          modified = true;
        }

        if (details.opposingPartyDocument && (!proc.opposingPartyDocument || proc.opposingPartyDocument !== details.opposingPartyDocument)) {
          proc.opposingPartyDocument = details.opposingPartyDocument;
          modified = true;
        }

        if (details.opposingPosition && (!proc.opposingPosition || proc.opposingPosition !== details.opposingPosition)) {
          proc.opposingPosition = details.opposingPosition;
          modified = true;
        }

        if (details.caseValue && (!proc.caseValue || proc.caseValue !== details.caseValue)) {
          proc.caseValue = details.caseValue;
          proc.value = details.caseValue;
          modified = true;
        }

        if (details.accessKey) {
          if (!proc.accessKey || proc.accessKey !== details.accessKey || !proc.chaveAcesso) {
            proc.accessKey = details.accessKey;
            proc.chaveAcesso = details.accessKey;
            modified = true;
          }
          if (!Array.isArray(proc.tags)) proc.tags = [];
          if (!proc.tags.includes('chave-disponivel')) {
            proc.tags.push('chave-disponivel');
            modified = true;
          }

          // Salva no cofre de credenciais para que o coletor leve do TJRS possa consultar sem A1
          const userIdsToSave = new Set([
            'admin',
            ...(state.users || []).map(u => u.username || u.id).filter(Boolean)
          ]);
          for (const uid of userIdsToSave) {
            try {
              await credManager.saveProcessAccessKey(proc.number, {
                accessKey: details.accessKey,
                userId: uid
              });
            } catch (err) {
              console.warn(`[eproc sweep] Aviso ao salvar chave no cofre para ${uid}: ${err.message}`);
            }
          }
        }

        if (details.secrecy) {
          if (!proc.secrecy || !proc.secrecyLevel) {
            proc.secrecy = true;
            proc.secrecyLevel = details.secrecyLevel || 'Segredo de Justiça (Nível 1)';
            modified = true;
          }
        }

        if (details.judge && (!proc.judge || proc.judge !== details.judge)) {
          proc.judge = details.judge;
          modified = true;
        }

        if (details.court && (!proc.court || proc.court.length < details.court.length)) {
          proc.court = details.court;
          modified = true;
        }

        if (details.actionClass && (!proc.actionClass || proc.actionClass !== details.actionClass)) {
          proc.actionClass = details.actionClass;
          modified = true;
        }

        if (details.competence && (!proc.competence || proc.competence !== details.competence)) {
          proc.competence = details.competence;
          modified = true;
        }

        if (details.distributionDate && !proc.distributionDate) {
          proc.distributionDate = details.distributionDate;
          modified = true;
        }

        if (details.status && (!proc.status || proc.status === 'ATIVO')) {
          proc.status = details.status;
          modified = true;
        }

        if (details.movementsCount && details.movementsCount > (proc.movementsCount || 0)) {
          proc.movementsCount = details.movementsCount;
          if (Array.isArray(details.movements) && details.movements.length > 0) {
            proc.movements = details.movements;
          }
          modified = true;
        }

        if (modified) {
          proc.title = `${proc.client} — ${proc.actionClass || 'Processo Judicial'} (TJRS)`;
          proc.lastSyncAt = nowIso;
          proc.updatedAt = nowIso;
          if (!Array.isArray(proc.tags)) proc.tags = [];
          if (!proc.tags.includes('eproc')) proc.tags.push('eproc');
          if (!proc.tags.includes('tjrs')) proc.tags.push('tjrs');
          if (!proc.tags.includes('varredura-a1')) proc.tags.push('varredura-a1');
          if (details.accessKey && !proc.tags.includes('chave-disponivel')) proc.tags.push('chave-disponivel');
          if (details.secrecy && !proc.tags.includes('segredo-de-justica')) proc.tags.push('segredo-de-justica');

          // Reconcilia contatos do cliente
          if (proc.client && proc.client !== 'SIGILO' && !proc.client.includes('Geral')) {
            const normClient = proc.client.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
            let contact = state.contacts.find(c => (c.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() === normClient);
            if (!contact) {
              contact = {
                id: `contact:eproc-a1:${Date.now()}-${randomBytes(4).toString('hex')}`,
                name: proc.client,
                contactRole: 'cliente',
                document: details.clientDocument || '',
                cpf: details.clientDocument || '',
                source: 'eproc TJRS (Varredura Certificado A1)',
                relatedProcessNumbers: [proc.number],
                registeredAt: nowIso.slice(0, 10),
                collectedAt: nowIso
              };
              state.contacts.push(contact);
            } else {
              contact.relatedProcessNumbers = Array.isArray(contact.relatedProcessNumbers) ? contact.relatedProcessNumbers : [];
              if (!contact.relatedProcessNumbers.includes(proc.number)) {
                contact.relatedProcessNumbers.push(proc.number);
              }
              if (details.clientDocument && !contact.document) {
                contact.document = details.clientDocument;
                contact.cpf = details.clientDocument;
              }
            }
            proc.contactId = contact.id;
          }

          // Reconcilia parte contrária (adversa)
          if (details.opposingParty) {
            const normOpp = details.opposingParty.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
            let oppContact = state.contacts.find(c => (c.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase() === normOpp);
            if (!oppContact) {
              oppContact = {
                id: `contact:eproc-adverso:${Date.now()}-${randomBytes(4).toString('hex')}`,
                name: details.opposingParty,
                contactRole: 'adverso',
                document: details.opposingPartyDocument || '',
                cpf: details.opposingPartyDocument || '',
                source: 'eproc TJRS (Varredura Certificado A1)',
                relatedProcessNumbers: [proc.number],
                registeredAt: nowIso.slice(0, 10),
                collectedAt: nowIso
              };
              state.contacts.push(oppContact);
            } else {
              oppContact.relatedProcessNumbers = Array.isArray(oppContact.relatedProcessNumbers) ? oppContact.relatedProcessNumbers : [];
              if (!oppContact.relatedProcessNumbers.includes(proc.number)) {
                oppContact.relatedProcessNumbers.push(proc.number);
              }
              if (details.opposingPartyDocument && !oppContact.document) {
                oppContact.document = details.opposingPartyDocument;
                oppContact.cpf = details.opposingPartyDocument;
              }
            }
          }

          // Auditoria
          state.audit.unshift({
            id: `aud-${Date.now()}-${randomBytes(4).toString('hex')}`,
            at: nowIso,
            action: 'Varredura A1 eproc TJRS',
            detail: `Processo ${proc.number} enriquecido: cliente "${proc.client}" (${proc.clientDocument || 'sem doc'}), parte contrária "${proc.opposingParty || '—'}" (${proc.opposingPartyDocument || '—'}), chave protegida no cofre local, valor "${proc.caseValue || '—'}"`,
            actor: 'Certificado Digital A1'
          });

          updatedProcesses.push({
            number: proc.number,
            client: proc.client,
            clientDocument: proc.clientDocument,
            opposingParty: proc.opposingParty,
            opposingPartyDocument: proc.opposingPartyDocument,
            judge: proc.judge,
            court: proc.court,
            actionClass: proc.actionClass,
            caseValue: proc.caseValue
          });

          // Persistência incremental por processo enriquecido
          if (saveState) {
            try {
              if (readStateEnvelope) {
                const fresh = await readStateEnvelope().catch(() => null);
                if (fresh?.revision) envelopeRevision = fresh.revision;
              }
              const saved = await saveState(state, envelopeRevision);
              if (saved?.revision) envelopeRevision = saved.revision;
            } catch (saveErr) {
              console.warn(`[eproc sweep] Aviso ao persistir processo ${proc.number}: ${saveErr.message}`);
            }
          }
        }
      } catch (err) {
        console.warn(`[eproc sweep] Erro ao varrer processo ${proc.number}: ${err.message}`);
      }
    }

    // Salva o estado final consolidado
    let nextRevision = envelopeRevision;
    if (updatedProcesses.length > 0 || newIntimationsCount > 0 || newTasksCount > 0) {
      state.audit = state.audit.slice(0, 1000);
      if (saveState) {
        if (readStateEnvelope) {
          const fresh = await readStateEnvelope().catch(() => null);
          if (fresh?.revision) envelopeRevision = fresh.revision;
        }
        const savedResult = await saveState(state, envelopeRevision).catch(err => {
          console.warn(`[eproc sweep] Aviso no save final: ${err.message}`);
          return null;
        });
        nextRevision = savedResult?.revision || envelopeRevision;
      } else {
        const raw = JSON.parse(await readFile(APP_STATE_FILE, 'utf8'));
        raw.encrypted = sec.encrypt(JSON.stringify(state));
        raw.updatedAt = new Date().toISOString();
        raw.revision = (raw.revision || 0) + 1;
        nextRevision = raw.revision;
        await writeFile(APP_STATE_FILE, JSON.stringify(raw, null, 2), 'utf8');
      }
    }

    return {
      ok: true,
      sweptCount: targets.length,
      enrichedCount: updatedProcesses.length,
      newIntimationsCount,
      newTasksCount,
      updatedProcesses,
      revision: nextRevision,
      message: `✓ Sincronização eproc concluída: ${newIntimationsCount} intimação(ões), ${newTasksCount} prazo(s) lançados em tarefas, ${updatedProcesses.length} processo(s) enriquecido(s).`
    };
  } finally {
    if (modernCert?.cleanup) await modernCert.cleanup().catch(() => {});
    await context.close().catch(() => {});
  }
}

