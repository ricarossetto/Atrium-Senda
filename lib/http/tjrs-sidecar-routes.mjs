import { randomUUID } from 'node:crypto';
import { assertTjrsCnj, formatCnj, reconcileTjrsSnapshot, TjrsSidecarError } from '../judicial/tjrs-sidecar-client.mjs';
import { createProcessAutosArtifacts } from '../judicial/tjrs-autos-service.mjs';

export function createTjrsSidecarHttpHandler({
  client,
  assertAuthenticated,
  readJson,
  readStateEnvelope,
  saveState,
  documentStorage = null,
  credentialManager = null,
  json
} = {}) {
  if (!client || typeof assertAuthenticated !== 'function' || typeof readJson !== 'function' || typeof readStateEnvelope !== 'function' || typeof saveState !== 'function' || typeof json !== 'function') {
    throw new TypeError('Dependências das rotas do sidecar TJRS são obrigatórias.');
  }

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
      assertAuthenticated(req);
      const body = await readJson(req, 10_000);
      const cnj = assertTjrsCnj(body.processNumber);
      const accessKey = safeAccessKey(body.accessKey || body.chaveAcesso);
      try {
        await client.health();
        const snapshot = await client.getProcess(cnj, accessKey ? { accessKey } : undefined);
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
          message: 'Snapshot local encontrado. Revise os dados antes de cadastrar o processo.'
        });
        return true;
      } catch (error) {
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
        await client.getProcess(cnj, { accessKey });
        await credentialManager.saveProcessAccessKey(cnj, { accessKey, userId: sessionIdentity(session) });
        json(res, 200, { ok: true, configured: true, message: 'Chave de acesso validada e guardada no cofre cifrado.' });
      } catch (error) {
        if (!(error instanceof TjrsSidecarError)) throw error;
        const operational = operationalError(error);
        json(res, operational.statusCode, { ok: false, state: operational.state, message: operational.message });
      }
      return true;
    }

    if (req.method === 'POST' && url.pathname === '/api/integrations/tjrs-sidecar/processes/sync') {
      const session = assertAuthenticated(req, true);
      const body = await readJson(req, 50_000);
      const processId = safeIdentifier(body.processId);
      const cnj = assertTjrsCnj(body.processNumber);
      if (!processId) throw Object.assign(new Error('Processo local não informado.'), { statusCode: 400 });
      if (!body.revision) throw Object.assign(new Error('Revisão de estado obrigatória.'), { statusCode: 409 });

      try {
        const suppliedAccessKey = safeAccessKey(body.accessKey || body.chaveAcesso);
        const storedAccessKey = credentialManager?.getProcessAccessKey
          ? await credentialManager.getProcessAccessKey(cnj, sessionIdentity(session))
          : '';
        const accessKey = suppliedAccessKey || storedAccessKey || '';
        await client.health();
        const options = accessKey ? { accessKey } : undefined;
        const [snapshot, diff] = await Promise.all([client.getProcess(cnj, options), client.getDiff(cnj, options)]);
        if (suppliedAccessKey && credentialManager?.saveProcessAccessKey) {
          await credentialManager.saveProcessAccessKey(cnj, { accessKey: suppliedAccessKey, userId: sessionIdentity(session) });
        }
        const envelope = await readStateEnvelope();
        if (!envelope?.state) throw Object.assign(new Error('O estado local ainda não foi inicializado.'), { statusCode: 409 });
        if (body.revision !== envelope.revision) {
          throw Object.assign(new Error('Os dados foram atualizados em outra aba. Recarregue antes de importar o snapshot TJRS.'), { statusCode: 409 });
        }
        const processes = Array.isArray(envelope.state.processes) ? envelope.state.processes : [];
        const index = processes.findIndex(item => String(item?.id) === processId);
        if (index < 0) throw Object.assign(new Error('Processo não encontrado no acervo local.'), { statusCode: 404 });
        if (assertTjrsCnj(processes[index]?.number) !== cnj) {
          throw Object.assign(new Error('O número CNJ informado diverge do processo local.'), { statusCode: 409 });
        }

        const reconciliation = reconcileTjrsSnapshot(processes[index], snapshot, diff);
        if (!reconciliation.changed) {
          json(res, 200, {
            ok: true,
            readOnly: true,
            state: 'AVAILABLE',
            idempotent: true,
            revision: envelope.revision,
            process: processes[index],
            summary: reconciliation.summary,
            message: 'O processo já está atualizado com o último snapshot local do TJRS.'
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
          detail: `${reconciliation.process.number} · ${reconciliation.summary.movements} andamento(s) · ${reconciliation.summary.parties} parte(s)`,
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
          process: reconciliation.process,
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
      const body = await readJson(req, 20_000);
      const processId = safeIdentifier(body.processId);
      const cnj = assertTjrsCnj(body.processNumber);
      if (!processId) throw Object.assign(new Error('Processo local não informado.'), { statusCode: 400 });
      if (!body.revision) throw Object.assign(new Error('Revisão de estado obrigatória.'), { statusCode: 409 });
      if (!documentStorage?.put) throw Object.assign(new Error('O acervo documental cifrado está indisponível.'), { statusCode: 503 });
      try {
        const suppliedAccessKey = safeAccessKey(body.accessKey || body.chaveAcesso);
        const storedAccessKey = credentialManager?.getProcessAccessKey
          ? await credentialManager.getProcessAccessKey(cnj, sessionIdentity(session))
          : '';
        const accessKey = suppliedAccessKey || storedAccessKey || '';
        await client.health();
        const snapshot = await client.getProcess(cnj, accessKey ? { accessKey } : undefined);
        if (suppliedAccessKey && credentialManager?.saveProcessAccessKey) {
          await credentialManager.saveProcessAccessKey(cnj, { accessKey: suppliedAccessKey, userId: sessionIdentity(session) });
        }
        const envelope = await readStateEnvelope();
        if (!envelope?.state) throw Object.assign(new Error('O estado local ainda não foi inicializado.'), { statusCode: 409 });
        if (body.revision !== envelope.revision) throw Object.assign(new Error('Os dados foram atualizados em outra aba. Recarregue antes de gerar o caderno processual.'), { statusCode: 409 });
        const processItem = (envelope.state.processes || []).find(item => String(item?.id) === processId);
        if (!processItem) throw Object.assign(new Error('Processo não encontrado no acervo local.'), { statusCode: 404 });
        if (assertTjrsCnj(processItem.number) !== cnj) throw Object.assign(new Error('O número CNJ informado diverge do processo local.'), { statusCode: 409 });

        const artifacts = createProcessAutosArtifacts({ processItem, snapshot });
        const nextState = structuredClone(envelope.state);
        nextState.documents = Array.isArray(nextState.documents) ? nextState.documents : [];
        const registered = [];
        const snapshotTimestamp = snapshot.provenance?.queryTimestamp || new Date().toISOString();
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
              context: 'PDF derivado do snapshot de consulta; não substitui a peça original do tribunal.',
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
        if (!registered.length) {
          json(res, 200, {
            ok: true,
            idempotent: true,
            revision: envelope.revision,
            totalPieces: artifacts.pieces.length,
            registeredDocumentsCount: 0,
            documents: nextState.documents,
            message: 'O caderno deste snapshot já está no acervo documental.'
          });
          return true;
        }
        nextState.audit = Array.isArray(nextState.audit) ? nextState.audit : [];
        nextState.audit.unshift({
          id: `audit-tjrs-caderno-${randomUUID()}`,
          at: new Date().toISOString(),
          action: 'Caderno processual TJRS gerado',
          detail: `${formatCnj(cnj)} · ${artifacts.pieces.length} andamento(s) · ${registered.length} PDF(s) cifrado(s)`,
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
          documents: nextState.documents,
          message: `${registered.length} PDF(s) derivados foram gerados e guardados no acervo cifrado do processo.`
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
  if (code === 'NOT_FOUND') return { state: 'STALE', statusCode: 404, message: 'O coletor está disponível, mas ainda não possui snapshot local deste processo.' };
  if (code === 'UNAVAILABLE') return { state: 'UNAVAILABLE', statusCode: 503, message: 'O coletor TJRS local está indisponível. Os dados atuais foram preservados.' };
  if (code === 'STALE') return { state: 'STALE', statusCode: 503, message: 'O coletor TJRS local não está pronto. Os dados atuais foram preservados.' };
  if (code === 'INVALID_CNJ') return { state: 'ERROR', statusCode: 400, message: 'Este processo não possui um número CNJ válido do TJRS.' };
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
