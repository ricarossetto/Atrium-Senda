// Sincronização bidirecional com o Google Agenda, uma conexão por pessoa.
// Tokens e o mapa de eventos ficam em cofre cifrado por escritório, fora do Store e do backup.
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GoogleCalendarError } from './google-calendar-api.mjs';
import {
  PERSONAL_SOURCE,
  WINDOW_FUTURE_DAYS,
  WINDOW_PAST_DAYS,
  addDays,
  agendaFields,
  comparable,
  desiredItems,
  eventBody,
  eventIdFor,
  fieldsFromEvent,
  isLockedAgenda,
  outboundSignature,
  privateRecordId,
  recordPatchFromEvent
} from './google-calendar-mapping.mjs';

const VAULT_FILE = 'google-calendar.json';
const PENDING_TTL_MS = 10 * 60 * 1000;
const WRITE_LIMIT_PER_RUN = 200;
const PAGE_LIMIT = 40;
export const PULL_INTERVAL_MS = 2 * 60 * 1000;

const PRIVACY = new Set(['full', 'reduced']);
const TASK_SCOPE = new Set(['all', 'mine']);

function serviceError(statusCode, message, code) {
  return Object.assign(new Error(message), { statusCode, ...(code ? { code } : {}) });
}

function todayInBrazil(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function createGoogleCalendarService({
  api,
  security,
  dataDirectoryFor,
  withWorkspace,
  readState,
  mutateState,
  visibleStateFor,
  findUser,
  redirectUriFor,
  log = () => {},
  now = () => new Date()
}) {
  const pendingAuthorizations = new Map();
  const pendingConnections = new Map();
  const dirtyWorkspaces = new Set();
  const userLocks = new Map();
  const vaultTails = new Map();

  const vaultPath = workspaceId => path.join(dataDirectoryFor(workspaceId), VAULT_FILE);

  async function readVault(workspaceId) {
    const file = vaultPath(workspaceId);
    if (!existsSync(file)) return { version: 1, connections: {} };
    const envelope = JSON.parse(await readFile(file, 'utf8'));
    const state = JSON.parse(security.decrypt(envelope.encrypted));
    return { version: 1, connections: state?.connections || {} };
  }

  async function writeVault(workspaceId, vault) {
    const file = vaultPath(workspaceId);
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp-${randomBytes(6).toString('hex')}`;
    const envelope = { version: 1, algorithm: 'aes-256-gcm', updatedAt: now().toISOString(), encrypted: security.encrypt(JSON.stringify(vault)) };
    try {
      await writeFile(temporary, JSON.stringify(envelope), { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, file);
    } catch (error) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
  }

  // Duas pessoas do mesmo escritório podem gravar ao mesmo tempo: a fila evita perder uma delas.
  function updateVault(workspaceId, operation) {
    const previous = vaultTails.get(workspaceId) || Promise.resolve();
    const queued = previous.then(async () => {
      const vault = await readVault(workspaceId);
      const result = await operation(vault);
      await writeVault(workspaceId, vault);
      return result;
    });
    vaultTails.set(workspaceId, queued.catch(() => {}));
    return queued;
  }

  const saveConnection = (workspaceId, userId, connection) => updateVault(workspaceId, vault => { vault.connections[userId] = connection; });

  function withUserLock(workspaceId, userId, operation) {
    const key = `${workspaceId}|${userId}`;
    const previous = userLocks.get(key) || Promise.resolve();
    const queued = previous.then(operation, operation);
    const tail = queued.catch(() => {});
    userLocks.set(key, tail);
    tail.then(() => { if (userLocks.get(key) === tail) userLocks.delete(key); });
    return queued;
  }

  function sweepPending() {
    const limit = now().getTime();
    for (const map of [pendingAuthorizations, pendingConnections]) {
      for (const [id, entry] of map) if (entry.expiresAt <= limit) map.delete(id);
    }
  }

  async function accessTokenFor(connection) {
    if (connection.accessToken && Number(connection.accessExpiresAt || 0) - now().getTime() > 60_000) return connection.accessToken;
    const token = await api.refreshAccessToken(connection.refreshToken);
    connection.accessToken = token.access_token;
    connection.accessExpiresAt = now().getTime() + Number(token.expires_in || 3600) * 1000;
    return connection.accessToken;
  }

  /** Lê o que mudou no Google. Chave de sincronização vencida faz a leitura completa da janela. */
  async function pullEvents(connection, accessToken) {
    const today = todayInBrazil(now());
    const fullWindow = {
      timeMin: `${addDays(today, -WINDOW_PAST_DAYS)}T00:00:00-03:00`,
      timeMax: `${addDays(today, WINDOW_FUTURE_DAYS)}T23:59:59-03:00`
    };
    let syncToken = connection.syncToken || '';
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const events = [];
        let pageToken = '';
        let nextSyncToken = '';
        let account = '';
        for (let page = 0; page < PAGE_LIMIT; page += 1) {
          const response = await api.listEvents(accessToken, { ...(syncToken ? { syncToken } : fullWindow), pageToken });
          events.push(...(response.items || []));
          account = response.summary || account;
          pageToken = response.nextPageToken || '';
          nextSyncToken = response.nextSyncToken || nextSyncToken;
          if (!pageToken) break;
        }
        return { events, nextSyncToken, account };
      } catch (error) {
        if (error instanceof GoogleCalendarError && error.status === 410 && syncToken) { syncToken = ''; continue; }
        throw error;
      }
    }
    return { events: [], nextSyncToken: '', account: '' };
  }

  function findEntryForEvent(connection, event) {
    // A marca vem do evento, e a agenda pode ser compartilhada: só vale se o id for o desta conexão.
    const byProperty = event.extendedProperties?.private?.atriumKey;
    if (byProperty && connection.items[byProperty]?.eventId === event.id) return { key: byProperty, entry: connection.items[byProperty] };
    if (byProperty) return { key: byProperty, entry: null };
    for (const [key, entry] of Object.entries(connection.items)) {
      if (entry.eventId === event.id) return { key, entry };
    }
    return { key: '', entry: null };
  }

  function appendAudit(state, action, detail, actor) {
    if (!Array.isArray(state.audit)) state.audit = [];
    state.audit.unshift({ id: `aud-${Date.now()}-${randomBytes(4).toString('hex')}`, at: now().toISOString(), action, detail: String(detail).slice(0, 500), actor });
    state.audit = state.audit.slice(0, 1000);
  }

  /** Aplica ao estado o que veio do Google. Prazo e compromisso de tribunal nunca mudam por aqui. */
  function applyPulledEvents(state, { events, connection, userId, actor, counts }) {
    const agenda = Array.isArray(state.agenda) ? state.agenda : (state.agenda = []);
    const today = todayInBrazil(now());
    const windowFrom = addDays(today, -WINDOW_PAST_DAYS);
    const windowTo = addDays(today, WINDOW_FUTURE_DAYS);
    let changed = false;

    const removeRecord = id => {
      const index = agenda.findIndex(item => item?.id === id);
      if (index >= 0) { agenda.splice(index, 1); changed = true; return true; }
      return false;
    };

    for (const event of events) {
      if (!event?.id) continue;
      const cancelled = event.status === 'cancelled';
      const { key, entry } = findEntryForEvent(connection, event);

      if (!key) {
        if (cancelled || (event.eventType && event.eventType !== 'default')) continue;
        const fields = fieldsFromEvent(event);
        if (!fields || fields.date < windowFrom || fields.date > windowTo) continue;
        const id = privateRecordId(userId, event.id);
        if (agenda.some(item => item?.id === id)) continue;
        const stamp = event.updated || now().toISOString();
        const record = {
          id,
          externalId: `google:${id}`,
          title: fields.summary || 'Compromisso pessoal',
          date: fields.date,
          time: fields.time,
          ...(fields.endTime ? { endTime: fields.endTime } : {}),
          ...(fields.endDate ? { endDate: fields.endDate } : {}),
          location: fields.location,
          description: fields.description,
          source: PERSONAL_SOURCE,
          scope: 'private',
          privateOwnerUserId: userId,
          ownerUserId: userId,
          createdAt: stamp,
          updatedAt: stamp
        };
        agenda.push(record);
        changed = true;
        counts.received += 1;
        const saved = agendaFields(record, { privacy: connection.privacy, origin: 'google' });
        connection.items[`agenda:${id}`] = { eventId: event.id, origin: 'google', snapshot: comparable(saved), signature: outboundSignature(saved), date: saved.date, fields: saved };
        continue;
      }

      if (!entry) continue;
      if (key.startsWith('task:')) {
        if (cancelled || comparable(fieldsFromEvent(event) || {}) !== entry.snapshot) {
          entry.forcePush = true;
          entry.wasCancelled = cancelled;
          counts.restored += 1;
        }
        continue;
      }
      const recordId = key.slice('agenda:'.length);
      const record = agenda.find(item => item?.id === recordId);

      if (cancelled) {
        if (entry.origin === 'google') {
          if (record) { removeRecord(recordId); counts.removed += 1; }
          delete connection.items[key];
        } else if (!record || isLockedAgenda(record)) {
          entry.forcePush = true;
          entry.wasCancelled = true;
          counts.restored += 1;
        } else {
          // Apagar na agenda de uma pessoa não some com o compromisso para o escritório.
          entry.keptDeleted = true;
          counts.keptDeleted += 1;
          appendAudit(state, 'Compromisso apagado na agenda pessoal', `${record.title || 'Compromisso'}: continua no ATRIUM e não será recriado nessa agenda.`, actor);
          changed = true;
        }
        continue;
      }

      const incoming = fieldsFromEvent(event);
      if (!incoming || comparable(incoming) === entry.snapshot) continue;
      if (!record || isLockedAgenda(record)) {
        entry.forcePush = true;
        counts.restored += 1;
        continue;
      }
      const current = agendaFields(record, { privacy: connection.privacy, origin: entry.origin });
      const changedHereToo = comparable(current) !== entry.snapshot;
      const eventIsNewer = Date.parse(event.updated || 0) >= Date.parse(record.updatedAt || 0);
      if (changedHereToo && !eventIsNewer) continue; // a versão do ATRIUM é a mais recente e vai para o Google.
      const patch = recordPatchFromEvent(incoming, entry.fields, { privacy: connection.privacy, origin: entry.origin, record });
      if (Object.keys(patch).length) {
        Object.assign(record, patch, { updatedAt: event.updated || now().toISOString() });
        changed = true;
        counts.received += 1;
        if (entry.origin === 'atrium') {
          appendAudit(state, 'Compromisso alterado pela agenda pessoal', `${record.title || 'Compromisso'} · ${record.date}`, actor);
        }
      }
      const saved = agendaFields(record, { privacy: connection.privacy, origin: entry.origin });
      entry.snapshot = comparable(incoming);
      entry.fields = incoming;
      entry.date = saved.date;
    }
    return changed;
  }

  /** Grava no Google o que mudou no ATRIUM. Devolve false se parou no limite desta rodada. */
  async function pushChanges({ connection, accessToken, userId, state, user, counts }) {
    if (!state) throw new Error('Estado do escritório indisponível.');
    const desired = desiredItems(visibleStateFor(state, user), {
      user,
      privacy: connection.privacy,
      taskScope: connection.taskScope,
      today: todayInBrazil(now())
    });
    let writes = 0;
    const budgetLeft = () => writes < WRITE_LIMIT_PER_RUN;

    for (const item of desired.values()) {
      if (!budgetLeft()) return false;
      const entry = connection.items[item.key];
      if (entry?.keptDeleted) continue;
      const signature = outboundSignature(item.fields);
      if (entry && entry.signature === signature && !entry.forcePush) continue;
      if (!entry && !item.inWindow) continue;
      const body = eventBody(item.fields, { key: item.key, locked: item.locked, origin: item.origin });
      const eventId = entry?.eventId || eventIdFor(userId, item.key);
      writes += 1;
      try {
        if (entry) {
          await api.patchEvent(accessToken, eventId, entry.wasCancelled && item.origin === 'atrium' ? { ...body, status: 'confirmed' } : body);
          counts.updated += 1;
        } else {
          await api.insertEvent(accessToken, { ...body, id: eventId });
          counts.created += 1;
        }
      } catch (error) {
        if (!(error instanceof GoogleCalendarError)) throw error;
        if (!entry && error.status === 409) {
          // Já existe (rodada interrompida ou evento apagado): o mesmo id volta a valer.
          await api.patchEvent(accessToken, eventId, body);
          counts.updated += 1;
        } else if (entry && (error.status === 404 || error.status === 410)) {
          if (item.origin === 'google') { delete connection.items[item.key]; continue; }
          await api.insertEvent(accessToken, { ...body, id: eventId });
          counts.created += 1;
        } else {
          throw error;
        }
      }
      connection.items[item.key] = { eventId, origin: item.origin, snapshot: comparable(item.fields), signature, date: item.fields.date, fields: item.fields };
    }

    // Saiu do ATRIUM ou deixou de ser visível: tira da agenda pessoal. Só mexe em evento já ligado.
    const oldestKept = addDays(todayInBrazil(now()), -WINDOW_PAST_DAYS);
    const linked = Object.entries(connection.items);
    const toRemove = linked.filter(([key, entry]) => !desired.has(key) && !entry.keptDeleted && !(entry.date && entry.date < oldestKept));
    // Trava: estado vazio ou lido pela metade nunca pode limpar a agenda pessoal de uma vez.
    if (toRemove.length > 20 && toRemove.length > linked.length / 2 && !connection.allowMassRemoval) {
      counts.removalBlocked = toRemove.length;
      return true;
    }
    connection.allowMassRemoval = false;
    for (const [key, entry] of linked) {
      if (desired.has(key) || entry.keptDeleted) continue;
      if (entry.date && entry.date < oldestKept) { delete connection.items[key]; continue; }
      if (!budgetLeft()) return false;
      writes += 1;
      try {
        await api.deleteEvent(accessToken, entry.eventId);
      } catch (error) {
        if (!(error instanceof GoogleCalendarError) || ![404, 410].includes(error.status)) throw error;
      }
      delete connection.items[key];
      counts.deleted += 1;
    }
    return true;
  }

  async function runSync(workspaceId, userId) {
    return withUserLock(workspaceId, userId, async () => {
      const vault = await readVault(workspaceId);
      const connection = vault.connections[userId];
      if (!connection) return null;
      const user = findUser(workspaceId, userId);
      if (!user || (user.status || 'active') !== 'active') return connection;
      connection.items ||= {};
      const counts = { received: 0, removed: 0, restored: 0, keptDeleted: 0, created: 0, updated: 0, deleted: 0 };
      const actor = `${user.displayName || user.username || 'Membro'} (agenda pessoal)`;
      connection.lastAttemptAt = now().toISOString();
      try {
        const accessToken = await accessTokenFor(connection);
        const { events, nextSyncToken, account } = await pullEvents(connection, accessToken);
        if (account) connection.account = account;
        if (events.length) {
          const changed = await mutateState(workspaceId, state => applyPulledEvents(state, { events, connection, userId, actor, counts }));
          if (changed) connection.lastInboundAt = now().toISOString();
        }
        if (nextSyncToken) connection.syncToken = nextSyncToken;
        // A leitura já foi aplicada: guardar agora evita aplicá-la de novo se o envio falhar.
        await saveConnection(workspaceId, userId, connection);
        const finished = await pushChanges({ connection, accessToken, userId, state: await readState(workspaceId), user, counts });
        connection.status = 'connected';
        connection.lastError = counts.removalBlocked
          ? `${counts.removalBlocked} eventos deixariam a sua agenda de uma vez. Nada foi apagado; confira a Agenda do ATRIUM.`
          : '';
        connection.lastSyncAt = now().toISOString();
        connection.partial = !finished;
        connection.lastCounts = counts;
        if (!finished) dirtyWorkspaces.add(workspaceId);
      } catch (error) {
        if (error instanceof GoogleCalendarError && error.needsReconnect) {
          connection.status = 'reconnect_needed';
          connection.lastError = 'A autorização do Google terminou. Conecte a agenda de novo.';
        } else {
          connection.status ||= 'connected';
          // Acesso recusado: a próxima rodada renova, e só aí se sabe se a autorização acabou.
          if (error instanceof GoogleCalendarError && error.status === 401) connection.accessToken = '';
          connection.lastError = error instanceof GoogleCalendarError
            ? error.message
            : 'Não foi possível concluir a sincronização. O ATRIUM tenta de novo em instantes.';
          if (!(error instanceof GoogleCalendarError)) log('Falha na sincronização do Google Agenda:', error?.message || error);
        }
      }
      await saveConnection(workspaceId, userId, connection);
      return connection;
    });
  }

  const publicStatus = connection => ({
    configured: Boolean(api),
    connected: Boolean(connection),
    status: connection?.status || 'disconnected',
    account: connection?.account || '',
    privacy: connection?.privacy || 'full',
    taskScope: connection?.taskScope || 'all',
    connectedAt: connection?.connectedAt || null,
    lastSyncAt: connection?.lastSyncAt || null,
    lastInboundAt: connection?.lastInboundAt || null,
    lastError: connection?.lastError || '',
    partial: Boolean(connection?.partial),
    keptDeleted: connection ? Object.values(connection.items || {}).filter(entry => entry.keptDeleted).length : 0,
    lastCounts: connection?.lastCounts || null
  });

  return Object.freeze({
    configured: Boolean(api),

    markDirty(workspaceId) {
      if (api && workspaceId) dirtyWorkspaces.add(workspaceId);
    },

    async status(workspaceId, userId) {
      const vault = await readVault(workspaceId);
      return publicStatus(vault.connections[userId]);
    },

    beginConnection({ workspaceId, userId, req }) {
      if (!api) throw serviceError(503, 'A ligação com o Google Agenda ainda não está disponível neste servidor.', 'GOOGLE_CALENDAR_NOT_CONFIGURED');
      sweepPending();
      const state = randomBytes(32).toString('base64url');
      const redirectUri = redirectUriFor(req);
      pendingAuthorizations.set(state, { workspaceId, userId, redirectUri, expiresAt: now().getTime() + PENDING_TTL_MS });
      return { authorizationUrl: api.authorizationUrl({ state, redirectUri }) };
    },

    /**
     * Volta do Google, sem sessão: o cookie é SameSite=Strict e não acompanha o redirecionamento.
     * Por isso só guarda o resultado. Quem liga a agenda à conta é `confirmConnection`, com sessão.
     */
    async finishAuthorization({ state, code }) {
      sweepPending();
      const pending = pendingAuthorizations.get(String(state || ''));
      if (!pending) throw serviceError(400, 'O pedido de conexão venceu. Tente conectar de novo.');
      pendingAuthorizations.delete(String(state));
      const token = await api.exchangeCode({ code, redirectUri: pending.redirectUri });
      if (!token?.refresh_token) throw serviceError(502, 'O Google não liberou o acesso contínuo. Tente conectar de novo.');
      const id = randomBytes(24).toString('base64url');
      pendingConnections.set(id, { ...pending, token, expiresAt: now().getTime() + PENDING_TTL_MS });
      return id;
    },

    async confirmConnection({ workspaceId, userId, connectionId }) {
      sweepPending();
      const pending = pendingConnections.get(String(connectionId || ''));
      if (!pending || pending.workspaceId !== workspaceId || pending.userId !== userId) {
        throw serviceError(403, 'Este pedido de conexão não pertence à sua conta. Conecte a agenda de novo.');
      }
      pendingConnections.delete(String(connectionId));
      const connection = await withUserLock(workspaceId, userId, async () => {
        const previous = (await readVault(workspaceId)).connections[userId];
        const next = {
          ...(previous || {}),
          refreshToken: pending.token.refresh_token,
          accessToken: pending.token.access_token,
          accessExpiresAt: now().getTime() + Number(pending.token.expires_in || 3600) * 1000,
          status: 'connected',
          lastError: '',
          privacy: previous?.privacy || 'full',
          taskScope: previous?.taskScope || 'all',
          connectedAt: previous?.connectedAt || now().toISOString(),
          items: previous?.items || {}
        };
        await saveConnection(workspaceId, userId, next);
        return next;
      });
      withWorkspace(workspaceId, () => runSync(workspaceId, userId)).catch(error => log('Primeira sincronização do Google Agenda falhou:', error?.message || error));
      return publicStatus(connection);
    },

    async updateSettings(workspaceId, userId, { privacy, taskScope } = {}) {
      const connection = await withUserLock(workspaceId, userId, async () => {
        const vault = await readVault(workspaceId);
        const current = vault.connections[userId];
        if (!current) throw serviceError(404, 'Conecte o Google Agenda antes de escolher as opções.');
        if (privacy !== undefined) {
          if (!PRIVACY.has(privacy)) throw serviceError(400, 'Escolha como os títulos devem aparecer.');
          current.privacy = privacy;
        }
        if (taskScope !== undefined) {
          if (!TASK_SCOPE.has(taskScope)) throw serviceError(400, 'Escolha quais prazos devem aparecer.');
          // Trocar para "só os meus" tira muitos prazos de uma vez, e aqui isso foi pedido.
          if (current.taskScope !== taskScope) current.allowMassRemoval = true;
          current.taskScope = taskScope;
        }
        await saveConnection(workspaceId, userId, current);
        return current;
      });
      dirtyWorkspaces.add(workspaceId);
      return publicStatus(connection);
    },

    async syncNow(workspaceId, userId) {
      const connection = await runSync(workspaceId, userId);
      if (!connection) throw serviceError(404, 'Conecte o Google Agenda antes de sincronizar.');
      return publicStatus(connection);
    },

    /** Tira as cópias do ATRIUM da agenda pessoal e os compromissos pessoais do ATRIUM. */
    async disconnect(workspaceId, userId) {
      return withUserLock(workspaceId, userId, async () => {
        const vault = await readVault(workspaceId);
        const connection = vault.connections[userId];
        if (!connection) return { ...publicStatus(null), removedCopies: 0, keptCopies: 0 };
        const entries = Object.entries(connection.items || {});
        let removedCopies = 0;
        let keptCopies = 0;
        try {
          const accessToken = await accessTokenFor(connection);
          for (const [, entry] of entries) {
            if (entry.origin !== 'atrium' || entry.keptDeleted) continue;
            try {
              await api.deleteEvent(accessToken, entry.eventId);
              removedCopies += 1;
            } catch (error) {
              if (error instanceof GoogleCalendarError && [404, 410].includes(error.status)) removedCopies += 1;
              else keptCopies += 1;
            }
          }
        } catch {
          keptCopies = entries.filter(([, entry]) => entry.origin === 'atrium' && !entry.keptDeleted).length;
        }
        const privateIds = new Set(entries.filter(([, entry]) => entry.origin === 'google').map(([key]) => key.slice('agenda:'.length)));
        if (privateIds.size) {
          await mutateState(workspaceId, state => {
            const before = (state.agenda || []).length;
            state.agenda = (state.agenda || []).filter(item => !privateIds.has(item?.id));
            return state.agenda.length !== before;
          });
        }
        await api.revoke(connection.refreshToken);
        await updateVault(workspaceId, current => { delete current.connections[userId]; });
        return { ...publicStatus(null), removedCopies, keptCopies };
      });
    },

    /** Uma passada do agendador: envia logo o que mudou aqui e lê o Google a cada intervalo. */
    async tick(workspaceId) {
      if (!api || !existsSync(vaultPath(workspaceId))) return;
      const dirty = dirtyWorkspaces.delete(workspaceId);
      const vault = await readVault(workspaceId);
      const limit = now().getTime() - PULL_INTERVAL_MS;
      for (const [userId, connection] of Object.entries(vault.connections)) {
        if (connection.status === 'reconnect_needed') continue;
        if (dirty || Date.parse(connection.lastAttemptAt || 0) <= limit) await runSync(workspaceId, userId);
      }
    }
  });
}
