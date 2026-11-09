/**
 * ATRIUM — Comandos assíncronos (202 + idCommand)
 *
 * Registro em memória por processo para operações longas que não devem segurar
 * a conexão HTTP: a rota responde 202 com `idCommand` e o cliente consulta
 * `GET /api/commands/:idCommand` até `done`/`error`. O resultado é exatamente o
 * payload que a rota síncrona devolveria — nunca um sucesso fabricado.
 *
 * Limites: TTL padrão de 30 minutos e teto de 50 comandos por processo; a
 * consulta é escopada por workspace. Nada aqui é persistido em disco.
 */

const DEFAULT_TTL_MS = 30 * 60_000;
const DEFAULT_MAX_COMMANDS = 50;

let idSequence = 0;

export function newAsyncCommandId(now = Date.now()) {
  idSequence = (idSequence + 1) % 1_000_000;
  return `cmd-${now.toString(36)}-${idSequence.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createAsyncCommandRegistry({ ttlMs = DEFAULT_TTL_MS, maxCommands = DEFAULT_MAX_COMMANDS, now = () => Date.now() } = {}) {
  const commands = new Map();

  const prune = () => {
    const reference = now();
    for (const [id, command] of commands) {
      const expired = command.finishedAtMs
        ? reference - command.finishedAtMs > ttlMs
        : reference - command.startedAtMs > ttlMs;
      if (expired) commands.delete(id);
    }
    if (commands.size > maxCommands) {
      const oldest = [...commands.values()].sort((a, b) => a.startedAtMs - b.startedAtMs);
      while (commands.size > maxCommands && oldest.length) {
        commands.delete(oldest.shift().id);
      }
    }
  };

  return {
    start({ kind, workspaceId = '', run }) {
      if (typeof run !== 'function') throw new TypeError('run é obrigatório para um comando assíncrono.');
      const startedAtMs = now();
      const command = {
        id: newAsyncCommandId(startedAtMs),
        kind: String(kind || 'comando'),
        workspaceId: String(workspaceId || ''),
        status: 'running',
        phase: 'running',
        percent: null,
        startedAt: new Date(startedAtMs).toISOString(),
        startedAtMs,
        finishedAt: null,
        finishedAtMs: 0,
        result: null,
        error: null
      };
      commands.set(command.id, command);
      prune();
      Promise.resolve()
        .then(() => run())
        .then(result => {
          command.status = 'done';
          command.phase = 'done';
          command.percent = 100;
          command.result = result ?? null;
          command.finishedAtMs = now();
          command.finishedAt = new Date(command.finishedAtMs).toISOString();
        })
        .catch(error => {
          command.status = 'error';
          command.phase = 'error';
          command.error = String(error?.message || error);
          command.finishedAtMs = now();
          command.finishedAt = new Date(command.finishedAtMs).toISOString();
        });
      return command;
    },

    get(id, workspaceId = '') {
      prune();
      const command = commands.get(String(id || ''));
      if (!command) return null;
      if (workspaceId && command.workspaceId && command.workspaceId !== String(workspaceId)) return null;
      return command;
    },

    size() {
      return commands.size;
    }
  };
}

export function projectAsyncCommand(command) {
  if (!command) return null;
  return {
    id: command.id,
    kind: command.kind,
    status: command.status,
    phase: command.phase,
    percent: command.percent,
    startedAt: command.startedAt,
    finishedAt: command.finishedAt,
    result: command.result,
    error: command.error
  };
}
