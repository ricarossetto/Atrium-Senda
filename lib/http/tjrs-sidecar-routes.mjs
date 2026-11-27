import { randomUUID } from 'node:crypto';
import { plural } from '../plural.mjs';
import { assertTjrsCnj, formatCnj, reconcileTjrsSnapshot, TjrsSidecarError } from '../judicial/tjrs-sidecar-client.mjs';
import { createProcessAutosArtifacts } from '../judicial/tjrs-autos-service.mjs';
import { redactEprocSecrets } from '../judicial/eproc/key-redaction.mjs';
import { buildContactIndex, buildProcessIndex, canAccessDocument, filterPrivateScopeState, isSuppressedRecord } from '../office/access-control.mjs';
import { ownerMatchesUser, privateOwnerForRecord } from '../office/monitoring-scope.mjs';

export function createTjrsSidecarHttpHandler({
  client,
  assertAuthenticated,
  readJson,
  readStateEnvelope,
  saveState,
  documentStorage = null,
  credentialManager = null,
  canAccessProcess = null,
  requireAccessKeyForPreview = null,
  // A consulta ao TJRS por chave foi desativada no produto (22/11/2026). As rotas de
  // chave continuam: a chave salva serve à varredura do eproc com A1.
  consultationDisabled = false,
  json
} = {}) {
  if (!client || typeof assertAuthenticated !== 'function' || typeof readJson !== 'function' || typeof readStateEnvelope !== 'function' || typeof saveState !== 'function' || typeof json !== 'function') {
    throw new TypeError('Dependências das rotas do sidecar TJRS são obrigatórias.');
  }


  const respondDisabled = res => {
    json(res, 410, {
      ok: false,
      readOnly: true,
      state: 'TJRS_KEY_CONSULTATION_DISABLED',
      message: 'A consulta ao TJRS por chave foi desativada. Os processos do TJRS são atualizados pelo eproc com o Certificado A1.'
    });
    return true;
  };

  return async function handleTjrsSidecarRequest(req, res, url) {
    if (!url.pathname.startsWith('/api/integrations/tjrs-sidecar/')) return false;

    if (req.method === 'GET' && url.pathname === '/api/integrations/tjrs-sidecar/status') {
      assertAuthenticated(req);
      try {
        const health = await client.health();
        json(res, 200, { ok: true, readOnly: true, ...health });
        return true;
      } catch (error) {
        if (error?.code === 'UNAVAILABLE') return false;
        const operational = operationalError(error);
        json(res, operational.statusCode, { ok: false, readOnly: true, state: operational.state, message: operational.message });
        return true;
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/integrations/tjrs-sidecar/processes/preview') {
      assertAuthenticated(req, true);
      if (consultationDisabled) return respondDisabled(res);
      const body = await readJson(req, 10_000);
      const cnj = assertTjrsCnj(body.processNumber);
      const accessKey = safeAccessKey(body.accessKey || body.chaveAcesso);
      if (!accessKey && typeof requireAccessKeyForPreview === 'function' && requireAccessKeyForPreview()) {
        json(res, 403, {
          ok: false,
          readOnly: true,
          state: 'ACCESS_KEY_REQUIRED',
          message: 'A consulta de snapshot compartilhado exige a chave de acesso deste processo para o seu escritório.'
        });
        return true;
      }
      try {
        await client.health();
        let snapshot;
        try {
          snapshot = await client.getProcess(cnj, accessKey ? { accessKey } : undefined);
        } catch (getErr) {
          if (getErr?.code === 'NOT_FOUND') {
            snapshot = await client.collectProcess(cnj, { accessKey, forceLive: true });
          } else {
            throw getErr;
          }
        }
        const reconciliation = reconcileTjrsSnapshot({
          number: formatCnj(cnj),
          client: '',
          monitoring: 'active'
        }, snapshot);
        json(res, 200, {
          ok: true,
          readOnly: true,
          state: 'AVAILABLE',
          draft: { ...reconciliation.process, source: 'TJRS_PUBLIC' },
          summary: reconciliation.summary,
          message: 'Consulta ao TJRS concluída com sucesso. Revise os dados antes de cadastrar o processo.'
        });
        return true;
      } catch (error) {
        if (error?.code === 'UNAVAILABLE') return false;
        if (!(error instanceof TjrsSidecarError)) throw error;
        const operational = operationalError(error);
        json(res, operational.statusCode, {
          ok: false,
          readOnly: true,
          state: operational.state,
          message: operational.message
        });
        return true;
      }
    }

    if (req.method === 'POST' && url.pathname === '/api/integrations/tjrs-sidecar/processes/access-key') {
      const session = assertAuthenticated(req, true);
      const body = await readJson(req, 10_000);
      const cnj = assertTjrsCnj(body.processNumber);
      const accessKey = safeAccessKey(body.accessKey || body.chaveAcesso);
      if (!accessKey) throw Object.assign(new Error('Informe a chave de acesso do processo.'), { statusCode: 400 });
      if (!credentialManager?.saveProcessAccessKey) throw Object.assign(new Error('O cofre judicial local está indisponível.'), { statusCode: 503 });
      try {
        await client.health();
        await client.collectProcess(cnj, { accessKey, forceLive: true });
        await credentialManager.saveProcessAccessKey(cnj, { accessKey, userId: sessionIdentity(session) });
        json(res, 200, { ok: true, configured: true, collected: true, message: 'Chave validada. A primeira consulta ao TJRS foi concluída e a chave ficou guardada no cofre cifrado.' });
      } catch (error) {
        if (!(error instanceof TjrsSidecarError)) throw error;
        const operational = operationalError(error);
        json(res, operational.statusCode, { ok: false, state: operational.state, message: operational.message });
      }
      return true;
    }

    // Consulta pura: a chave legada no estado é apenas sinalizada como presente.
    // A cópia para o cofre passou a exigir POST com CSRF.
    if (req.method === 'GET' && url.pathname === '/api/integrations/tjrs-sidecar/processes/access-key/status') {
      const session = assertAuthenticated(req);
      const cnj = assertTjrsCnj(url.searchParams.get('processNumber'));
      const accessCheck = await resolveCnjAccessForSession(cnj, session, readStateEnvelope, canAccessProcess);
      if (accessCheck.denied) {
        json(res, 200, { ok: true, configured: false });
        return true;
      }
      const stored = credentialManager?.getProcessAccessKey
        ? await credentialManager.getProcessAccessKey(cnj, sessionIdentity(session))
        : null;
      const configured = Boolean(stored || accessCheck.legacyKey);
      json(res, 200, { ok: true, configured });
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/integrations/tjrs-sidecar/processes/access-key/status') {
      const session = assertAuthenticated(req, true);
      let body = {};
      try { body = await readJson(req, 10_000); } catch {}
      const cnj = assertTjrsCnj(body.processNumber || url.searchParams.get('processNumber'));
      const accessCheck = await resolveCnjAccessForSession(cnj, session, readStateEnvelope, canAccessProcess);
      if (accessCheck.denied) {
        json(res, 200, { ok: true, configured: false });
        return true;
      }
      let configured = Boolean(credentialManager?.getProcessAccessKey
        ? await credentialManager.getProcessAccessKey(cnj, sessionIdentity(session))
        : false);
      if (!configured && credentialManager?.saveProcessAccessKey && accessCheck.legacyKey) {
        await credentialManager.saveProcessAccessKey(cnj, { accessKey: accessCheck.legacyKey, userId: sessionIdentity(session) });
        configured = true;
      }
      json(res, 200, { ok: true, configured });
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/integrations/tjrs-sidecar/processes/sync') {
      const session = assertAuthenticated(req, true);
      if (consultationDisabled) return respondDisabled(res);
      const teams = (Array.isArray(session.teamIds) ? session.teamIds : []).map(id => ({
        id: String(id),
        memberIds: [String(session.id || ''), String(session.username || '')].filter(Boolean)
      }));
      const body = await readJson(req, 50_000);
      const processId = safeIdentifier(body.processId);
      const cnj = assertTjrsCnj(body.processNumber);
      if (!processId) throw Object.assign(new Error('Processo local não informado.'), { statusCode: 400 });
      if (!body.revision) throw Object.assign(new Error('Revisão de estado obrigatória.'), { statusCode: 409 });

      try {
        // Validação oficial do acervo antes de tocar o sidecar compartilhado:
        // processo de outro escritório responde 404, sem revelar a exigência de chave.
        const envelope = await readStateEnvelope();
        if (!envelope?.state) throw Object.assign(new Error('O estado local ainda não foi inicializado.'), { statusCode: 409 });
        if (body.revision !== envelope.revision) {
          throw Object.assign(new Error('Os dados foram atualizados em outra aba. Recarregue antes de incorporar a consulta do TJRS.'), { statusCode: 409 });
        }
        const processes = Array.isArray(envelope.state.processes) ? envelope.state.processes : [];
        // A resolução usa só o acervo visível à sessão; o índice de escrita continua
        // no estado bruto para não remover registros privados de outras pessoas.
        const visibleState = filterPrivateScopeState(envelope.state, session, { teams });
        const visibleProcesses = Array.isArray(visibleState.processes) ? visibleState.processes : [];
        const visibleProcess = visibleProcesses.find(item => String(item?.id) === processId);
        if (!visibleProcess) {
          const rawMatch = processes.some(item => String(item?.id) === processId);
          throw Object.assign(new Error(rawMatch
            ? 'Processo não encontrado no acervo acessível ao seu perfil.'
            : 'Processo não encontrado no acervo local.'), { statusCode: 404 });
        }
        const index = processes.findIndex(item => String(item?.id) === processId);
        const existing = index >= 0 ? processes[index] : null;
        if (!existing || isSuppressedRecord(existing) || (typeof canAccessProcess === 'function' && !canAccessProcess(session, envelope.state, existing))) {
          throw Object.assign(new Error('Processo não encontrado no acervo acessível ao seu perfil.'), { statusCode: 404 });
        }
        if (normalizeDigits(existing?.number) !== cnj) {
          throw Object.assign(new Error('O número CNJ informado diverge do processo local.'), { statusCode: 409 });
        }

        const suppliedAccessKey = safeAccessKey(body.accessKey || body.chaveAcesso);
        const storedAccessKey = credentialManager?.getProcessAccessKey
          ? await credentialManager.getProcessAccessKey(cnj, sessionIdentity(session))
          : '';
        const accessKey = suppliedAccessKey || storedAccessKey || '';
        if (!accessKey && typeof requireAccessKeyForPreview === 'function' && requireAccessKeyForPreview()) {
          json(res, 403, {
            ok: false,
            readOnly: true,
            state: 'ACCESS_KEY_REQUIRED',
            message: 'A sincronização de snapshot compartilhado exige a chave de acesso deste processo para o seu escritório.'
          });
          return true;
        }
        await client.health();
        const options = accessKey ? { accessKey } : undefined;
        let snapshot;
        let diff = null;
        try {
          if (body.forceLive) {
            snapshot = await client.collectProcess(cnj, { accessKey, forceLive: true });
            diff = await client.getDiff(cnj, options).catch(() => null);
          } else {
            [snapshot, diff] = await Promise.all([client.getProcess(cnj, options), client.getDiff(cnj, options)]);
          }
        } catch (getErr) {
          if (getErr?.code === 'NOT_FOUND' || !snapshot) {
            snapshot = await client.collectProcess(cnj, { accessKey, forceLive: true });
            diff = await client.getDiff(cnj, options).catch(() => null);
          } else {
            throw getErr;
          }
        }
        if (suppliedAccessKey && credentialManager?.saveProcessAccessKey) {
          await credentialManager.saveProcessAccessKey(cnj, { accessKey: suppliedAccessKey, userId: sessionIdentity(session) });
        }

        const reconciliation = reconcileTjrsSnapshot(processes[index], snapshot, diff);
        if (!reconciliation.changed) {
          json(res, 200, {
            ok: true,
            readOnly: true,
            state: 'AVAILABLE',
            idempotent: true,
            revision: envelope.revision,
            process: redactEprocSecrets(processes[index]),
            summary: reconciliation.summary,
            message: 'O processo já está atualizado com os dados mais recentes disponíveis no TJRS.'
          });
          return true;
        }

        const nextState = structuredClone(envelope.state);
        nextState.processes[index] = reconciliation.process;
        nextState.audit = Array.isArray(nextState.audit) ? nextState.audit : [];
        nextState.audit.unshift({
          id: `audit-tjrs-${randomUUID()}`,
          at: new Date().toISOString(),
          action: 'Snapshot TJRS importado',
          detail: `${reconciliation.process.number} · ${reconciliation.summary.movements} ${plural(reconciliation.summary.movements, 'andamento', 'andamentos')} · ${reconciliation.summary.parties} ${plural(reconciliation.summary.parties, 'parte', 'partes')}`,
          actor: String(session?.displayName || session?.username || 'Usuário autenticado').slice(0, 100)
        });
        nextState.audit = nextState.audit.slice(0, 1000);
        const saved = await saveState(nextState, envelope.revision);
        json(res, 200, {
          ok: true,
          readOnly: true,
          state: 'AVAILABLE',
          idempotent: false,
          revision: saved.revision,
          updatedAt: saved.updatedAt,
          process: redactEprocSecrets(reconciliation.process),
          summary: reconciliation.summary,
          message: 'Snapshot local do TJRS incorporado ao processo.'
        });
      } catch (error) {
        if (error?.code === 'UNAVAILABLE') return false;
        if (!(error instanceof TjrsSidecarError)) throw error;
        const operational = operationalError(error);
        json(res, operational.statusCode, {
          ok: false,
          readOnly: true,
          state: operational.state,
          message: operational.message
        });
      }
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/integrations/tjrs-sidecar/processes/download-autos') {
      const session = assertAuthenticated(req, true);
      if (consultationDisabled) return respondDisabled(res);
      // Espelha a projeção de GET /api/state: o corpo da requisição nunca decide
      // quais processos e documentos a sessão enxerga. Equipes vêm da sessão
      // autenticada, não do payload.
      const teams = (Array.isArray(session.teamIds) ? session.teamIds : []).map(id => ({
        id: String(id),
        memberIds: [String(session.id || ''), String(session.username || '')].filter(Boolean)
      }));
      const body = await readJson(req, 20_000);
      const processId = safeIdentifier(body.processId);
      const cnj = assertTjrsCnj(body.processNumber);
      if (!processId) throw Object.assign(new Error('Processo local não informado.'), { statusCode: 400 });
      if (!body.revision) throw Object.assign(new Error('Revisão de estado obrigatória.'), { statusCode: 409 });
      if (!documentStorage?.put) throw Object.assign(new Error('O acervo documental cifrado está indisponível.'), { statusCode: 503 });
      try {
        // Validação oficial do acervo antes de tocar o sidecar compartilhado:
        // processo de outro escritório responde 404, sem revelar a exigência de chave.
        const envelope = await readStateEnvelope();
        if (!envelope?.state) throw Object.assign(new Error('O estado local ainda não foi inicializado.'), { statusCode: 409 });
        if (body.revision !== envelope.revision) throw Object.assign(new Error('Os dados foram atualizados em outra aba. Recarregue antes de gerar o caderno processual.'), { statusCode: 409 });
        const visibleState = filterPrivateScopeState(envelope.state, session, { teams });
        const visibleProcesses = Array.isArray(visibleState.processes) ? visibleState.processes : [];
        const rawProcesses = Array.isArray(envelope.state.processes) ? envelope.state.processes : [];
        const processItem = visibleProcesses.find(item => String(item?.id) === processId);
        if (!processItem) {
          const rawMatch = rawProcesses.some(item => String(item?.id) === processId);
          throw Object.assign(new Error(rawMatch
            ? 'Processo não encontrado no acervo acessível ao seu perfil.'
            : 'Processo não encontrado no acervo local.'), { statusCode: 404 });
        }
        if (isSuppressedRecord(processItem) || (typeof canAccessProcess === 'function' && !canAccessProcess(session, envelope.state, processItem))) {
          throw Object.assign(new Error('Processo não encontrado no acervo acessível ao seu perfil.'), { statusCode: 404 });
        }
        if (normalizeDigits(processItem.number) !== cnj) throw Object.assign(new Error('O número CNJ informado diverge do processo local.'), { statusCode: 409 });

        const suppliedAccessKey = safeAccessKey(body.accessKey || body.chaveAcesso);
        const storedAccessKey = credentialManager?.getProcessAccessKey
          ? await credentialManager.getProcessAccessKey(cnj, sessionIdentity(session))
          : '';
        const accessKey = suppliedAccessKey || storedAccessKey || '';
        if (!accessKey && typeof requireAccessKeyForPreview === 'function' && requireAccessKeyForPreview()) {
          json(res, 403, {
            ok: false,
            readOnly: true,
            state: 'ACCESS_KEY_REQUIRED',
            message: 'O caderno processual com snapshot compartilhado exige a chave de acesso deste processo para o seu escritório.'
          });
          return true;
        }
        let snapshot = null;
        try {
          await client.health();
          snapshot = await client.getProcess(cnj, accessKey ? { accessKey } : undefined);
          if (suppliedAccessKey && credentialManager?.saveProcessAccessKey) {
            await credentialManager.saveProcessAccessKey(cnj, { accessKey: suppliedAccessKey, userId: sessionIdentity(session) });
          }
        } catch {
          // Se o sidecar não tiver snapshot específico deste processo ou estiver inacessível,
          // o caderno em PDF é gerado a partir do histórico já armazenado no processo
          snapshot = null;
        }

        const artifacts = createProcessAutosArtifacts({ processItem, snapshot });
        const nextState = structuredClone(envelope.state);
        nextState.documents = Array.isArray(nextState.documents) ? nextState.documents : [];
        const registered = [];
        const snapshotTimestamp = snapshot?.provenance?.queryTimestamp || processItem?.lastMovementAt || processItem?.updatedAt || new Date().toISOString();
        for (const artifact of artifacts.all) {
          const duplicate = nextState.documents.find(item => item.ownerType === 'process' && item.ownerId === processId && !item.deletedAt && item.checksum === artifact.checksum);
          if (duplicate) continue;
          await documentStorage.put(artifact.binary);
          const nowIso = new Date().toISOString();
          const document = {
            id: `doc-tjrs-${randomUUID()}`,
            name: uniqueDocumentName(nextState.documents, processId, artifact.fileName),
            originalName: artifact.fileName,
            mime: 'application/pdf',
            size: artifact.size,
            createdAt: nowIso,
            updatedAt: nowIso,
            documentDate: /^\d{4}-\d{2}-\d{2}$/.test(artifact.date) ? artifact.date : nowIso.slice(0, 10),
            ownerType: 'process',
            ownerId: processId,
            documentType: artifact === artifacts.index ? 'Índice processual derivado' : 'Andamento processual derivado',
            metadata: {
              origin: 'Snapshot TJRS',
              tags: ['tjrs', 'caderno-processual', 'derivado'],
              summary: artifact.title,
              context: 'PDF derivado dos dados consultados; não substitui a peça original do tribunal.',
              entities: [],
              relatedDocumentIds: [],
              classificationStatus: 'reviewed'
            },
            derivation: {
              kind: 'tjrs-snapshot-caderno',
              snapshotTimestamp,
              sourceMovementFingerprint: artifact.sourceMovementFingerprint || ''
            },
            deletedAt: null,
            deletedBy: null,
            checksum: artifact.checksum
          };
          nextState.documents.push(document);
          registered.push(document);
        }
        // O caderno é montado sobre o estado inteiro; só sai daqui o que a sessão
        // também enxergaria em GET /api/state, inclusive quanto a documento privado.
        // Os índices vêm do estado bruto: o filtro privado removeria justamente os
        // vínculos que precisam ser avaliados antes do atalho de permissão.
        const visibleNextState = filterPrivateScopeState(nextState, session, { teams });
        const documentIndex = buildProcessIndex(nextState.processes);
        const contactIndex = buildContactIndex(nextState.contacts);
        const visibleDocuments = (Array.isArray(visibleNextState.documents) ? visibleNextState.documents : [])
          .filter(document => canAccessDocument(session, document, documentIndex, teams, contactIndex));
        if (!registered.length) {
          json(res, 200, {
            ok: true,
            idempotent: true,
            revision: envelope.revision,
            totalPieces: artifacts.pieces.length,
            registeredDocumentsCount: 0,
            documents: visibleDocuments,
            message: 'O caderno desta consulta já está no acervo documental.'
          });
          return true;
        }
        nextState.audit = Array.isArray(nextState.audit) ? nextState.audit : [];
        nextState.audit.unshift({
          id: `audit-tjrs-caderno-${randomUUID()}`,
          at: new Date().toISOString(),
          action: 'Caderno processual TJRS gerado',
          detail: `${formatCnj(cnj)} · ${artifacts.pieces.length} ${plural(artifacts.pieces.length, 'andamento', 'andamentos')} · ${registered.length} ${plural(registered.length, 'PDF', 'PDFs')} ${plural(registered.length, 'cifrado', 'cifrados')}`,
          actor: String(session?.displayName || session?.username || 'Usuário autenticado').slice(0, 100)
        });
        nextState.audit = nextState.audit.slice(0, 1000);
        const saved = await saveState(nextState, envelope.revision);
        json(res, 200, {
          ok: true,
          idempotent: false,
          revision: saved.revision,
          updatedAt: saved.updatedAt,
          totalPieces: artifacts.pieces.length,
          registeredDocumentsCount: registered.length,
          documents: visibleDocuments,
          message: `${registered.length} ${plural(registered.length, 'PDF derivado foi gerado e guardado', 'PDFs derivados foram gerados e guardados')} no acervo cifrado do processo.`
        });
      } catch (error) {
        if (!(error instanceof TjrsSidecarError)) throw error;
        const operational = operationalError(error);
        json(res, operational.statusCode, { ok: false, state: operational.state, message: operational.message });
      }
      return true;
    }

    json(res, 404, { message: 'Recurso do sidecar TJRS não encontrado.' });
    return true;
  };
}

export function operationalError(error) {
  const code = String(error?.code || 'ERROR');
  if (code === 'NOT_FOUND') return { state: 'STALE', statusCode: 404, message: 'O coletor está funcionando, mas este processo ainda não foi consultado e baixado para o ATRIUM. Informe a chave, quando necessária, para iniciar a primeira consulta ao TJRS.' };
  if (code === 'UNAVAILABLE') return { state: 'UNAVAILABLE', statusCode: 503, message: 'O coletor TJRS local está indisponível. Os dados atuais foram preservados.' };
  if (code === 'STALE') return { state: 'STALE', statusCode: 503, message: 'O coletor TJRS local não está pronto. Os dados atuais foram preservados.' };
  if (code === 'INVALID_CNJ') return { state: 'ERROR', statusCode: 400, message: 'Este processo não possui um número CNJ válido do TJRS.' };
  if (code === 'ACCESS_KEY_REJECTED') return { state: 'ERROR', statusCode: 422, message: 'O TJRS não aceitou a chave informada. Confira os caracteres exatamente como aparecem no eproc e tente novamente.' };
  if (code === 'PROCESS_NOT_FOUND') return { state: 'ERROR', statusCode: 404, message: 'O TJRS não localizou este processo com o número e a chave informados. Confira o número CNJ e copie novamente a chave do eproc.' };
  if (code === 'COLLECTION_TIMEOUT') return { state: 'ERROR', statusCode: 504, message: 'A consulta ao TJRS demorou mais de dois minutos e foi interrompida. A chave não foi guardada; aguarde um instante e tente novamente.' };
  if (code === 'HUMAN_ACTION_REQUIRED') return { state: 'ACTION_REQUIRED', statusCode: 409, message: 'O TJRS pediu uma confirmação manual no navegador antes de liberar este processo. Conclua essa etapa e tente novamente.' };
  if (code === 'COLLECTION_FAILED') return { state: 'ERROR', statusCode: 503, message: 'A chave foi enviada com segurança, mas o coletor não conseguiu concluir a primeira consulta ao TJRS. Tente novamente em alguns instantes; os dados atuais foram preservados.' };
  return { state: 'ERROR', statusCode: Number(error?.statusCode) || 502, message: 'Não foi possível validar a resposta do coletor TJRS. Os dados atuais foram preservados.' };
}

function safeIdentifier(value) {
  return String(value || '').trim().slice(0, 200);
}

function safeAccessKey(value) {
  return String(value || '').trim().slice(0, 500);
}

function sessionIdentity(session) {
  return String(session?.username || session?.userId || session?.id || '').trim();
}

async function resolveCnjAccessForSession(cnj, session, readStateEnvelope, canAccessProcess) {
  try {
    const envelope = await readStateEnvelope();
    const state = envelope?.state || envelope;
    const targetDigits = String(cnj).replace(/\D/g, '');
    const matching = (Array.isArray(state?.processes) ? state.processes : [])
      .filter(item => String(item?.number || '').replace(/\D/g, '') === targetDigits);
    if (!matching.length) {
      return { denied: false, legacyKey: '' };
    }
    const visibleState = filterPrivateScopeState({ ...state, processes: matching }, session);
    const visibleIds = new Set((visibleState?.processes || []).map(item => String(item?.id || '')));
    const accessible = matching.filter(proc => {
      if (isSuppressedRecord(proc)) return false;
      const owner = privateOwnerForRecord(proc);
      if (owner && !ownerMatchesUser(owner, session)) return false;
      if (typeof canAccessProcess === 'function') return canAccessProcess(session, state, proc);
      return visibleIds.has(String(proc?.id || ''));
    });
    if (!accessible.length) {
      return { denied: true, legacyKey: '' };
    }
    const procWithKey = accessible.find(item => Boolean(item?.accessKey || item?.chaveAcesso));
    return { denied: false, legacyKey: String(procWithKey?.accessKey || procWithKey?.chaveAcesso || '') };
  } catch {
    return { denied: false, legacyKey: '' };
  }
}

function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function uniqueDocumentName(documents, ownerId, requestedName) {
  const used = new Set((documents || [])
    .filter(item => item.ownerType === 'process' && item.ownerId === ownerId && !item.deletedAt)
    .map(item => String(item.name || '').toLocaleLowerCase('pt-BR')));
  if (!used.has(String(requestedName).toLocaleLowerCase('pt-BR'))) return requestedName;
  const base = requestedName.replace(/\.pdf$/i, '');
  let suffix = 2;
  while (used.has(`${base} (${suffix}).pdf`.toLocaleLowerCase('pt-BR'))) suffix += 1;
  return `${base} (${suffix}).pdf`;
}
