/**
 * Rotas do estado do escritório (/api/state).
 *
 * Movidas de server.mjs sem mudar o comportamento. As dependências entram por parâmetro.
 */
import { createHash } from 'node:crypto';

export const STATE_ROUTE_MISS = Symbol('state-route-miss');

const PREFIXES = ['/api/state'];

export function isStateRoute(url) {
  return PREFIXES.some(prefix => url.pathname === prefix || url.pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`));
}

export async function handleStateRoute(ctx, req, res, url) {
  const {
    APP_VERSION,
    MAX_CLIENT_STATE_BYTES,
    appStateFile,
    applyMonitoringScopes,
    applySecurityHeaders,
    applySourceDeadlineTaskConsolidation,
    applyTaskCompletionTreatment,
    assertAdmin,
    assertAuthenticated,
    buildProcessIndex,
    canSessionAccessPublication,
    canWriteFinancial,
    discardedFinanceCollections,
    existsSync,
    filterOfficeState,
    filterPrivateScopeState,
    json,
    keepNewestSourceChecks,
    mergePrivateScopeState,
    mergeVisibleClientState,
    monitoringTermsById,
    officeStats,
    ownerMatchesUser,
    planSourceDeadlineTaskConsolidation,
    planTaskCompletionTreatment,
    preserveCanonicalTreatment,
    privateOwnerForRecord,
    randomBytes,
    readAppStateEnvelope,
    readJson,
    readPublicAppStateEnvelope,
    restoreRecordsUnseenByClient,
    runStateMigrations,
    sanitizeArray,
    saveAppStateDirect,
    saveClientAppState,
    security,
    stateHealth
  } = ctx;

  if (req.method === 'GET' && url.pathname === '/api/state') {
    const session = assertAuthenticated(req);
    const envelope = await readPublicAppStateEnvelope();
    const accessMode = security.officeProfile(session.workspaceId).accessMode;
    const teams = security.listTeams(session.workspaceId);
    let visibleState = envelope.state ? applyMonitoringScopes(envelope.state) : envelope.state;
    if (visibleState) visibleState = filterPrivateScopeState(visibleState, session, { teams });
    if (visibleState && accessMode === 'enforced') visibleState = filterOfficeState(visibleState, session, { teams });
    const payload = envelope.state ? { ...envelope, state: visibleState, officeStats: officeStats(visibleState) } : envelope;
    // A resposta é projetada por principal (escopo privado/papéis). O ETag precisa
    // incluir identidade e modo de acesso: sem isso, um 304 reutilizaria o corpo
    // filtrado de outro membro a partir do cache do navegador (mesma URL, sem Vary).
    const principalTag = `${session.workspaceId || ''}:${session.username || ''}:${accessMode}:${session.officeRoleId || ''}:${session.isPrincipal ? '1' : '0'}:${(session.teamIds || []).join(',')}`;
    const etag = payload.revision
      ? `"${createHash('sha256').update(`${payload.revision}:${principalTag}`).digest('hex').slice(0, 32)}"`
      : null;
    if (etag) {
      res.setHeader('ETag', etag);
      const existingVary = res.getHeader('Vary');
      const varyValue = existingVary ? `${existingVary}, Cookie` : 'Cookie';
      res.setHeader('Vary', varyValue);
      const ifNoneMatch = req.headers['if-none-match'];
      if (ifNoneMatch && (ifNoneMatch === etag || ifNoneMatch === `W/${etag}`)) {
        applySecurityHeaders(res);
        res.writeHead(304, { 'Cache-Control': 'no-cache, private', ETag: etag, Vary: varyValue });
        return res.end();
      }
    }
    return json(res, 200, payload, etag ? { ETag: etag, 'Cache-Control': 'no-cache, private' } : {});
  }

  if (req.method === 'POST' && url.pathname === '/api/state') {
    const session = assertAuthenticated(req, true);
    const body = await readJson(req, MAX_CLIENT_STATE_BYTES);
    const current = await readAppStateEnvelope();
    const accessMode = security.officeProfile(session.workspaceId).accessMode;
    const teams = security.listTeams(session.workspaceId);
    const sessionId = String(session.id || session.userId || session.username || '');
    if (body.state && Array.isArray(body.state.terms)) {
      body.state.terms = body.state.terms.map(term => {
        const scope = String(term?.scope || '').toLowerCase() === 'private' ? 'private' : 'office';
        return {
          ...term,
          scope,
          ...(scope === 'private'
            ? (() => {
              const existingOwner = String(term?.privateOwnerUserId || term?.ownerUserId || '').trim();
              const owner = ownerMatchesUser(existingOwner, session) ? existingOwner : sessionId;
              return { privateOwnerUserId: owner, ownerUserId: owner };
            })()
            : { privateOwnerUserId: undefined, ownerUserId: undefined })
        };
      });
    }
    let nextState = body.state;
    // Quem não grava financeiro tem o corpo revertido à versão oficial. A tentativa de
    // escrita precisa ser medida no corpo cru do cliente, antes da fusão de acesso —
    // depois dela as coleções já estão iguais às oficiais. Guardamos as coleções
    // descartadas para a resposta: é o contrato que impede a tela de fingir sucesso.
    const financeDiscarded = canWriteFinancial(session)
      ? []
      : discardedFinanceCollections({
        submitted: body.state,
        official: current.state,
        user: session,
        teams,
        visibleOnly: accessMode === 'enforced'
      });
    if (current.state) {
      nextState = accessMode === 'enforced'
        ? mergeVisibleClientState(current.state, nextState, session, { teams })
        : mergePrivateScopeState(current.state, nextState, session, { teams });
    }
    nextState = applyMonitoringScopes(nextState);
    nextState = preserveCanonicalTreatment(current.state, nextState);
    if (nextState && current.state) nextState.sources = keepNewestSourceChecks(current.state.sources, nextState.sources);
    // Isolamento de escopo privado no flush: nas coleções de escrita do cliente,
    // um registro com dono privado diferente da sessão só é válido se já existia
    // no estado oficial (registro oculto re-adicionado pela mesclagem). Registros
    // novos com dono alheio são descartados — não dá para "plantar" na área de outro.
    if (nextState && typeof nextState === 'object') {
      const privateIndex = buildProcessIndex(nextState.processes);
      const privateTerms = monitoringTermsById(nextState.terms);
      for (const name of ['processes', 'tasks', 'intimations', 'communications', 'contacts', 'agenda', 'documents', 'leads', 'terms']) {
        if (!Array.isArray(nextState[name])) continue;
        const canonicalById = new Map((current.state?.[name] || []).map(record => [String(record?.id || ''), record]));
        nextState[name] = nextState[name].flatMap(record => {
          if (!record || typeof record !== 'object') return [record];
          const owner = privateOwnerForRecord(record, { termsById: privateTerms, processIndex: privateIndex });
          if (!owner || ownerMatchesUser(owner, session)) return [record];
          const canonical = canonicalById.get(String(record.id || ''));
          if (!canonical) return []; // registro novo com dono alheio: descarta (plantio)
          const canonicalOwner = privateOwnerForRecord(canonical, { termsById: privateTerms, processIndex: privateIndex });
          if (canonicalOwner && !ownerMatchesUser(canonicalOwner, session)) return [record]; // oculto legítimo re-adicionado
          return [canonical]; // id oficial do próprio autor: restaura o oficial (não aceita dono forjado)
        });
      }
    }
    // O flush substitui as coleções inteiras. Um registro que este navegador não recebeu não
    // pode sumir porque não voltou no corpo, e publicação só muda pelas rotas oficiais.
    if (nextState && typeof nextState === 'object' && current.state) {
      let readView = applyMonitoringScopes({ ...current.state, intimations: sanitizeArray(current.state.intimations).filter(item => !item?.mergedInto) });
      readView = filterPrivateScopeState(readView, session, { teams });
      if (accessMode === 'enforced') readView = filterOfficeState(readView, session, { teams });
      const { removed } = restoreRecordsUnseenByClient(current.state, nextState, readView);
      if (removed.length) {
        nextState.audit = [{
          id: `audit-flush-${randomBytes(6).toString('hex')}`,
          at: new Date().toISOString(),
          action: 'Registros removidos ao salvar',
          detail: removed.map(entry => `${entry.collection}: ${entry.count}`).join(', '),
          actor: session.displayName || session.username || 'Usuário autenticado'
        }, ...(Array.isArray(nextState.audit) ? nextState.audit : [])];
      }
    }
    // Concluir tarefa vinculada encerra a triagem da publicação (autoridade do servidor):
    // o cliente aplica a mesma regra para refletir na hora e o save converge qualquer
    // cliente antigo ou edição feita fora do painel.
    if (nextState && Array.isArray(nextState.tasks)) {
      const treatmentPlan = planTaskCompletionTreatment({
        previousTasks: current.state?.tasks || [],
        nextTasks: nextState.tasks,
        intimations: nextState.intimations || []
      });
      // A derivação casa tarefa↔publicação por id, sem checar acesso. Só quem
      // pode ler a publicação pode encerrar sua triagem (mesmo predicado da rota
      // oficial de tratamento). Publicações fora do acesso são descartadas.
      if (treatmentPlan.treatments.length) {
        const publicationsById = new Map();
        for (const publication of nextState.intimations || []) {
          for (const key of [publication?.id, publication?.externalId]) {
            const value = String(key || '').trim();
            if (value && !publicationsById.has(value)) publicationsById.set(value, publication);
          }
        }
        treatmentPlan.treatments = treatmentPlan.treatments.filter(treatment => {
          const publication = publicationsById.get(String(treatment.publicationId));
          if (!publication) return false;
          // Espelha a leitura: escopo privado sempre; RBAC de escritório só em `enforced`.
          const owner = privateOwnerForRecord(publication, { termsById: monitoringTermsById(nextState.terms), processIndex: buildProcessIndex(nextState.processes) });
          if (owner && !ownerMatchesUser(owner, session)) return false;
          return accessMode === 'enforced' ? canSessionAccessPublication(session, nextState, publication) : true;
        });
      }
      if (treatmentPlan.treatments.length) {
        applyTaskCompletionTreatment(nextState, treatmentPlan, {
          actor: session.displayName || session.username || 'Sistema',
          nowIso: new Date().toISOString()
        });
      }
    }
    // Duplicatas do mesmo prazo da fonte convergem também no save do cliente (não só no sync):
    // só tarefa projetada e intocada é absorvida; curadoria humana permanece.
    if (nextState && Array.isArray(nextState.tasks) && nextState.tasks.length > 1) {
      applySourceDeadlineTaskConsolidation(nextState, planSourceDeadlineTaskConsolidation({
        tasks: nextState.tasks,
        intimations: nextState.intimations || []
      }), { actor: session.displayName || session.username || 'Sincronização', nowIso: new Date().toISOString() });
    }
    const saved = await saveClientAppState(nextState, body.revision ?? null, session, { discardedFinance: financeDiscarded });
    return json(res, 200, {
      ok: true,
      ...saved,
      // Contrato: o flush é 200 e continua gravando o resto do estado, mas quando o
      // financeiro foi descartado a tela precisa saber — sem isso ela anunciava
      // sucesso de uma alteração que o servidor recusou.
      ...(financeDiscarded.length ? { discardedCollections: financeDiscarded } : {})
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/state/import-legacy') {
    assertAdmin(req, true, 'Apenas o administrador principal pode importar dados legados.');
    if (stateHealth().status !== 'NEW_INSTALL' || existsSync(appStateFile())) {
      throw Object.assign(new Error('A importação legada só é permitida em uma instalação nova, antes da criação do estado principal.'), { statusCode: 409 });
    }
    const body = await readJson(req, 4_000_000);
    const legacy = body.legacyState;
    if (!legacy || typeof legacy !== 'object') throw Object.assign(new Error('Estado legado inválido.'), { statusCode: 400 });
    const migrationResult = runStateMigrations(legacy, APP_VERSION);
    const saved = await saveAppStateDirect(migrationResult.state, null);
    return json(res, 200, { ok: true, message: 'Estado legado importado e migrado com sucesso!', ...saved });
  }

  return STATE_ROUTE_MISS;
}
