import { randomUUID } from 'node:crypto';
import { assertTjrsCnj, reconcileTjrsSnapshot, TjrsSidecarError } from '../judicial/tjrs-sidecar-client.mjs';

export function createTjrsSidecarHttpHandler({
  client,
  assertAuthenticated,
  readJson,
  readStateEnvelope,
  saveState,
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
      } catch (error) {
        const operational = operationalError(error);
        json(res, operational.statusCode, { ok: false, readOnly: true, state: operational.state, message: operational.message });
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
        await client.health();
        const [snapshot, diff] = await Promise.all([client.getProcess(cnj), client.getDiff(cnj)]);
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
