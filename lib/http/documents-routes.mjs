/**
 * Rotas de documentos e agenda externa.
 *
 * Movidas de server.mjs sem mudar o comportamento. As dependências entram por parâmetro.
 */
export const DOCUMENTS_ROUTE_MISS = Symbol('documents-route-miss');

const PREFIXES = ['/api/documents', '/api/calendar'];

export function isDocumentsRoute(url) {
  return PREFIXES.some(prefix => url.pathname === prefix || url.pathname.startsWith(prefix.endsWith('/') ? prefix : `${prefix}/`));
}

export async function handleDocumentsRoute(ctx, req, res, url) {
  const {
    appendDocumentAudit,
    applyMonitoringScopes,
    assertAdmin,
    assertAuthenticated,
    assertDocumentOwner,
    assertDocumentRevision,
    buildProcessIndex,
    calendarPayload,
    canAccessContact,
    canAccessDocument,
    canAccessProcess,
    createHash,
    decodeDocumentPayload,
    documentActor,
    documentNamingValues,
    documentResponseState,
    documentStorage,
    enqueueAppStateMutation,
    fetchCalendarSource,
    filterPrivateScopeState,
    json,
    mergeBy,
    monitoringTermsById,
    mutateRuntime,
    normalizeDocumentFilename,
    ownerMatchesUser,
    parseCalendar,
    privateOwnerForRecord,
    randomBytes,
    readAppStateEnvelope,
    readJson,
    resolveDocumentName,
    sanitizeDocumentFilename,
    saveAppState,
    saveAppStateDirectUnlocked,
    security,
    validateCalendarUrl
  } = ctx;

  if (req.method === 'GET' && url.pathname === '/api/documents') {
    const session = assertAuthenticated(req);
    const envelope = await readAppStateEnvelope();
    const ownerType = String(url.searchParams.get('ownerType') || '').trim();
    const ownerId = String(url.searchParams.get('ownerId') || '').trim();
    const includeDeleted = url.searchParams.get('includeDeleted') === 'true';
    let documents = Array.isArray(envelope.state?.documents) ? envelope.state.documents : [];
    const teams = security.listTeams(session.workspaceId);
    documents = filterPrivateScopeState(applyMonitoringScopes({ ...envelope.state, documents }), session, { teams }).documents || [];
    if (security.officeProfile(session.workspaceId).accessMode === 'enforced') {
      const index = buildProcessIndex(envelope.state?.processes);
      documents = documents.filter(item => canAccessDocument(session, item, index, teams));
    }
    if (ownerType) documents = documents.filter(item => item.ownerType === ownerType);
    if (ownerId) documents = documents.filter(item => item.ownerId === ownerId);
    if (!includeDeleted) documents = documents.filter(item => !item.deletedAt);
    return json(res, 200, { ok: true, documents, revision: envelope.revision });
  }

  if (req.method === 'POST' && url.pathname === '/api/documents') {
    const session = assertAuthenticated(req, true);
    const body = await readJson(req, 28_000_000);
    const binary = decodeDocumentPayload(body.contentBase64);
    const checksum = createHash('sha256').update(binary).digest('hex');
    const result = await enqueueAppStateMutation(async () => {
      const envelope = await readAppStateEnvelope();
      assertDocumentRevision(envelope, body.revision);
      const state = envelope.state || {};
      if (!Array.isArray(state.documents)) state.documents = [];
      const ownerType = String(body.ownerType || '').trim();
      const ownerId = String(body.ownerId || '').trim();
      const owner = assertDocumentOwner(state, ownerType, ownerId);
      // Autorização do vínculo: o upload não pode anexar a processo/contato que a
      // sessão não pode acessar. Escopo privado vale nos dois modos; o RBAC de
      // escritório vale no modo enforced (mesmo predicado da leitura em /api/documents).
      {
        const accessMode = security.officeProfile(session.workspaceId).accessMode;
        const processIndex = buildProcessIndex(state.processes);
        const sessionId = String(session.id || session.userId || session.username || '');
        const ownerPrivate = privateOwnerForRecord(owner, { termsById: monitoringTermsById(state.terms), processIndex });
        if (ownerPrivate && !ownerMatchesUser(ownerPrivate, session)) {
          throw Object.assign(new Error('Você não tem acesso ao proprietário selecionado para anexar o documento.'), { statusCode: 403 });
        }
        if (accessMode === 'enforced') {
          const teams = security.listTeams(session.workspaceId);
          const allowed = ownerType === 'process'
            ? canAccessProcess(session, owner, teams)
            : canAccessContact(session, owner, processIndex, teams);
          if (!allowed) {
            throw Object.assign(new Error('Você não tem acesso ao proprietário selecionado para anexar o documento.'), { statusCode: 403 });
          }
        }
      }
      const originalName = sanitizeDocumentFilename(body.originalName, 'documento');
      const documentDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.documentDate || ''))
        ? String(body.documentDate)
        : new Date().toISOString().slice(0, 10);
      const template = body.namingTemplate === undefined
        ? String(state.settings?.documentNamingTemplate || '')
        : String(body.namingTemplate || '');
      const name = resolveDocumentName({
        template,
        originalName,
        values: documentNamingValues({ state, ownerType, owner, documentType: body.documentType, documentDate })
      });
      const sameOwner = item => item?.ownerType === ownerType && item?.ownerId === ownerId;
      if (state.documents.some(item => sameOwner(item) && !item.deletedAt && item.checksum === checksum)) {
        throw Object.assign(new Error('Este mesmo conteúdo já está vinculado ao proprietário selecionado.'), { statusCode: 409 });
      }
      const normalizedName = normalizeDocumentFilename(name);
      if (state.documents.some(item => sameOwner(item) && !item.deletedAt && normalizeDocumentFilename(item.name) === normalizedName)) {
        throw Object.assign(new Error('Já existe um documento com este nome para o proprietário selecionado. Nenhum arquivo foi sobrescrito.'), { statusCode: 409 });
      }

      await documentStorage.put(binary);
      const nowIso = new Date().toISOString();
      const document = {
        id: `doc-${Date.now()}-${randomBytes(5).toString('hex')}`,
        name,
        originalName,
        mime: String(body.mime || 'application/octet-stream').slice(0, 120),
        size: binary.length,
        createdAt: nowIso,
        updatedAt: nowIso,
        documentDate,
        ownerType,
        ownerId,
        documentType: String(body.documentType || '').trim().slice(0, 100),
        metadata: {
          origin: 'Upload local', tags: [], summary: '', context: '', entities: [], relatedDocumentIds: [],
          classificationStatus: body.documentType ? 'reviewed' : 'unclassified'
        },
        deletedAt: null,
        deletedBy: null,
        checksum
      };
      state.documents.unshift(document);
      appendDocumentAudit(state, 'Documento adicionado', `${name} · ${ownerType}:${ownerId}`, session);
      const saved = await saveAppStateDirectUnlocked(state, envelope.revision || null);
      return { document, state, saved };
    });
    return json(res, 201, { ok: true, document: result.document, ...documentResponseState(result.state, result.saved, session) });
  }

  if (req.method === 'PATCH' && url.pathname === '/api/documents/settings') {
    const session = assertAdmin(req, true, 'Apenas administradores podem alterar o padrão de nomes de documentos.');
    const body = await readJson(req, 20_000);
    const template = String(body.template || '').trim();
    // Valida placeholders sem depender de dados reais.
    resolveDocumentName({ template, originalName: 'documento.pdf', values: {} });
    const result = await enqueueAppStateMutation(async () => {
      const envelope = await readAppStateEnvelope();
      assertDocumentRevision(envelope, body.revision);
      const state = envelope.state || {};
      if (!state.settings || typeof state.settings !== 'object') state.settings = {};
      state.settings.documentNamingTemplate = template;
      appendDocumentAudit(state, 'Padrão de nomes documentais atualizado', template || 'Nome original seguro', session);
      const saved = await saveAppStateDirectUnlocked(state, envelope.revision || null);
      return { state, saved };
    });
    return json(res, 200, { ok: true, template, revision: result.saved.revision, settings: result.state.settings });
  }

  if (req.method === 'POST' && url.pathname === '/api/calendar/configure') {
    // A agenda externa vale para o escritório inteiro: só quem administra configura.
    const session = assertAdmin(req, true, 'Só quem administra o escritório pode configurar a agenda externa.');
    const body = await readJson(req);
    const requestedCalendarUrl = String(body.calendarUrl || '').trim();
    const calendarUrl = requestedCalendarUrl ? (await validateCalendarUrl(requestedCalendarUrl)).toString() : '';

    const envelope = await readAppStateEnvelope().catch(() => ({ state: {} }));
    const state = envelope?.state || {};
    let importedCount = 0;
    let errorDetail = null;
    let errorStage = null;
    let parsedCalendar = null;
    if (calendarUrl) {
      try {
        parsedCalendar = calendarPayload(parseCalendar(await fetchCalendarSource(calendarUrl)));
        importedCount = parsedCalendar.events.length;
      } catch (err) {
        errorDetail = err.message;
        errorStage = 'fetch';
      }
    }

    state.settings ||= {};
    state.settings.calendarUrl = calendarUrl;
    state.settings.externalCalendarUrl = calendarUrl;
    state.settings.calendarConfigured = Boolean(calendarUrl);
    if (!Array.isArray(state.audit)) state.audit = [];
    state.audit.unshift({
      id: `aud-${Date.now()}-${randomBytes(4).toString('hex')}`,
      at: new Date().toISOString(),
      action: 'Agenda externa configurada',
      detail: 'Configuração da agenda externa atualizada.',
      actor: documentActor(session)
    });
    state.audit = state.audit.slice(0, 1000);
    // Clientes legados não enviavam revisão. Usar a revisão lida nesta mesma
    // operação mantém compatibilidade sem desabilitar o lock otimista do save.
    const expectedRevision = body.revision ?? envelope.revision ?? null;
    const saveResult = await saveAppState(state, expectedRevision);

    if (parsedCalendar) {
      try {
        await mutateRuntime(runtime => ({
          ...runtime,
          events: mergeBy(runtime.events, parsedCalendar.events),
          tasks: mergeBy(runtime.tasks, parsedCalendar.tasks),
          sources: mergeBy(runtime.sources, [{
            id: 'external-calendar',
            name: 'Agenda Externa',
            short: 'CAL',
            method: 'Webcal/iCal',
            status: 'ok',
            lastCheck: new Date().toISOString(),
            detail: `${parsedCalendar.events.length} compromisso(s) sincronizado(s)`
          }], 'id'),
          updatedAt: new Date().toISOString()
        }));
      } catch (err) {
        errorDetail = errorDetail || err.message;
        errorStage = errorStage || 'runtime';
      }
    }

    return json(res, 200, {
      ok: !errorDetail,
      partial: Boolean(errorDetail),
      calendarUrl,
      externalCalendarUrl: calendarUrl,
      calendarConfigured: Boolean(calendarUrl),
      revision: saveResult.revision,
      imported: importedCount,
      error: errorDetail,
      errorStage,
      message: errorDetail
        ? errorStage === 'runtime'
          ? `URL salva, mas os eventos não puderam ser incorporados à agenda: ${errorDetail}`
          : `URL salva, mas a leitura da agenda retornou: ${errorDetail}`
        : `Agenda configurada com sucesso! ${importedCount} evento(s) sincronizado(s).`
    });
  }

  return DOCUMENTS_ROUTE_MISS;
}
