import { randomUUID } from 'node:crypto';
import { assertCnj, formatCnj, resolveCourtFromCnj } from './contracts.mjs';
import { computeSha256 } from './fingerprint.mjs';

const prefix = '/api/integrations/';
const fail = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const canonicalHash = canonical => computeSha256({
  metadata: canonical.metadata, parties: canonical.parties, movements: canonical.movements,
  documents: canonical.documents || [], publications: canonical.publications || []
});

export function createOmniHttpHandler({ hub: fixedHub, storage: fixedStorage, resolveServices, assertAuthenticated, readJson, readStateEnvelope, saveState, json } = {}) {
  if ((!fixedHub && typeof resolveServices !== 'function') || !assertAuthenticated || !readJson || !json) throw new TypeError('Dependências Omni obrigatórias.');
  return async function handleOmniRequest(req, res, url) {
    const legacy = url.pathname.startsWith(prefix + 'tjrs-sidecar/');
    const omni = url.pathname.startsWith(prefix + 'omni/');
    if (!legacy && !omni) return false;
    // Authentication establishes the server-owned workspace context before a
    // workspace-specific cache or provider is selected.
    assertAuthenticated(req);
    const services = typeof resolveServices === 'function' ? await resolveServices() : { hub: fixedHub, storage: fixedStorage };
    const { hub, storage } = services;
    const route = url.pathname.slice((prefix + (legacy ? 'tjrs-sidecar/' : 'omni/')).length);
    if (req.method === 'GET' && route === 'status') {
      assertAuthenticated(req);
      const health = await hub.health();
      json(res, 200, { ok: true, readOnly: true, state: 'AVAILABLE', engine: 'internal',
        collectorVersion: '2.1', health, providers: health.providers, timestamp: health.timestamp });
      return true;
    }
    if (req.method === 'POST' && ['processes/preview', 'processes/sync'].includes(route)) {
      const sync = route === 'processes/sync';
      const actor = assertAuthenticated(req, sync);
      const body = await readJson(req, sync ? 50_000 : 10_000);
      const cnj = assertCnj(body.processNumber);
      const resolvedCourt = resolveCourtFromCnj(cnj);
      if (legacy && resolvedCourt !== 'TJRS') throw fail('Informe um CNJ do TJRS.', 400);
      if (body.court && String(body.court).toUpperCase() !== resolvedCourt) throw fail('Tribunal divergente do CNJ.', 400);
      let envelope, existing, index;
      if (sync) {
        if (!body.processId) throw fail('Processo local não informado.', 400);
        envelope = await readStateEnvelope();
        if (!body.revision || !envelope?.state || body.revision !== envelope.revision) {
          throw fail('Os dados foram atualizados. Recarregue antes de importar.', 409);
        }
        index = (envelope.state.processes || []).findIndex(p => String(p?.id) === String(body.processId));
        if (index < 0) throw fail('Processo não encontrado no acervo local.', 404);
        existing = envelope.state.processes[index];
        if (assertCnj(existing.number) !== cnj) throw fail('O CNJ informado diverge do processo local.', 409);
      }
      try {
        // The cache must not mutate before the canonical Store accepts the import.
        const result = await hub.syncProcess(cnj, { explicitCourt: resolvedCourt, persist: false });
        const c = result.canonical;
        const hash = canonicalHash(c);
        if (assertCnj(c.cnj) !== cnj) throw fail('O provedor retornou outro processo.', 409);
        const movements = Array.isArray(c.movements) ? c.movements : [];
        const parties = Array.isArray(c.parties) ? c.parties : [];
        const latest = movements.slice().sort((a,b) => String(b?.date || '').localeCompare(String(a?.date || '')))[0];
        const draft = {
          number: formatCnj(cnj), client: '', court: c.metadata.court || resolvedCourt,
          county: c.metadata.district || '', courtUnit: c.metadata.judicialUnit || '',
          actionType: c.metadata.processClass || '', subject: c.metadata.subject || '',
          lastMovement: latest?.description || '', lastMovementAt: latest?.date || '',
          judicialParties: parties, judicialMovements: movements, source: result.source
        };
        const summary = { movementsCount: movements.length, partiesCount: parties.length,
          movements: movements.length, parties: parties.length,
          newMovements: result.diff.newMovements.length, changedMovements: result.diff.changedMovements.length };
        if (!sync) {
          json(res, 200, { ok: true, readOnly: true, state: 'AVAILABLE', draft, summary,
            message: 'Consulta concluída. Revise os dados antes de cadastrar; nenhum dado foi salvo.' });
          return true;
        }
        if (existing.judicialSnapshot?.payloadHash === hash) {
          json(res, 200, { ok: true, readOnly: true, state: 'AVAILABLE', idempotent: true,
            process: existing, revision: envelope.revision, summary, message: 'O processo já está atualizado.' });
          return true;
        }
        const updated = { ...existing };
        for (const key of ['court','county','courtUnit','actionType','subject']) {
          if (!updated[key]) updated[key] = draft[key];
        }
        const allMovements = new Map();
        for (const movement of [...(existing.movements || []), ...movements]) {
          if (!movement) continue;
          const key = computeSha256({ date: movement.date || '', description: movement.description || movement.text || '' });
          allMovements.set(key, movement);
        }
        updated.movements = [...allMovements.values()];
        updated.judicialParties = parties;
        // Never infer or replace client/contactId from the party list.
        const last = updated.movements.slice().sort((a,b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
        if (last?.description) { updated.lastMovement = last.description; updated.lastMovementAt = last.date; }
        updated.judicialSnapshot = { ...c, payloadHash: hash, source: result.source,
          court: c.metadata.court, syncedAt: new Date().toISOString(), movementsCount: movements.length, diff: result.diff };
        const nextState = structuredClone(envelope.state);
        nextState.processes[index] = updated;
        nextState.audit = [{ id: 'audit-omni-' + randomUUID(), at: new Date().toISOString(),
          action: 'Snapshot judicial importado', detail: 'Consulta supervisionada, sem ato processual.',
          actor: String(actor?.displayName || actor?.username || 'Usuário autenticado') },
          ...(Array.isArray(nextState.audit) ? nextState.audit : [])].slice(0,1000);
        const saved = await saveState(nextState, envelope.revision);
        let cacheWarning = false;
        if (storage) {
          try { storage.saveObservation(c, result.diff, storage.getLatestSnapshot(cnj)?.id); }
          catch { cacheWarning = true; }
        }
        json(res, 200, { ok: true, readOnly: true, state: 'AVAILABLE', idempotent: false,
          process: updated, revision: saved.revision, summary, cacheWarning,
          message: cacheWarning ? 'Processo salvo; cache do coletor indisponível.' : 'Dados judiciais incorporados ao processo.' });
      } catch (error) {
        const human = error.challengeStatus === 'HUMAN_ACTION_REQUIRED';
        json(res, error.statusCode || 502, { ok: false, readOnly: true,
          state: human ? 'HUMAN_ACTION_REQUIRED' : 'UNAVAILABLE', challengeStatus: human ? 'HUMAN_ACTION_REQUIRED' : 'NONE',
          message: human ? 'O tribunal exige ação humana. A consulta foi interrompida.'
            : error.statusCode === 409 ? error.message : 'Consulta indisponível. Nenhuma alteração foi confirmada nesta operação.' });
      }
      return true;
    }
    if (!omni) return false;
    if (req.method === 'POST' && route === 'discover/oab') {
      assertAuthenticated(req, true);
      const body = await readJson(req, 10_000);
      const oab = String(body.oab || '');
      const uf = String(body.uf || '').toUpperCase();
      if (!/^\d{1,10}$/.test(oab) || !['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].includes(uf)) {
        throw fail('Informe OAB e UF válidas.', 400);
      }
      const result = await hub.discoverByOab({ oab, uf, court: body.court });
      json(res, result.success ? 200 : 502, { ...result, ok: result.success,
        error: result.success ? undefined : 'Descoberta indisponível; nenhuma importação realizada.' });
      return true;
    }
    if (req.method === 'GET' && route === 'watchlist') {
      assertAuthenticated(req);
      const items = storage?.getWatchlist() || [];
      json(res, 200, { ok: true, count: items.length, items });
      return true;
    }
    if (req.method === 'POST' && route === 'watchlist') {
      assertAuthenticated(req, true);
      const body = await readJson(req, 10_000);
      const cnj = assertCnj(body.cnj);
      if (!storage) throw fail('Cache indisponível.',503);
      storage.addToWatchlist({ cnj, court: resolveCourtFromCnj(cnj) || 'GENERIC' });
      json(res, 200, { ok: true, message: 'Processo incluído na lista de consultas manuais.' });
      return true;
    }
    if (req.method === 'POST' && route === 'runs/daily') {
      assertAuthenticated(req, true);
      json(res, 200, { ok: true, run: await hub.runDailyMonitoring() });
      return true;
    }
    return false;
  };
}
