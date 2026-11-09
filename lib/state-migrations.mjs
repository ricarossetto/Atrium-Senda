import { randomBytes } from 'node:crypto';
import { backfillDuplicateIntimations } from './publications/publication-merge-backfill.mjs';
import { CalculationRecordError, MAX_CALCULATIONS, validateCalculationRecord } from './calc/persistence.mjs';
import { derivePublicationDate } from './core/business-days.mjs';
import { MAX_SUSPENSIONS, normalizeSuspension } from '../js/core/suspension-calendar.js';

export const CURRENT_SCHEMA_VERSION = 12;
export const CURRENT_DATA_VERSION = 12;
export const CURRENT_RUNTIME_SCHEMA_VERSION = 2;
export const CURRENT_UI_SCHEMA_VERSION = 2;

export class FutureSchemaError extends Error {
  constructor(foundVersion, currentVersion) {
    super(`Estes dados foram criados por uma versão mais nova do ATRIUM (schema ${foundVersion} > ${currentVersion}). Atualize o ATRIUM para abrir este banco de dados.`);
    this.name = 'FutureSchemaError';
    this.foundVersion = foundVersion;
    this.currentVersion = currentVersion;
    this.statusCode = 422;
  }
}

export class CorruptedStateError extends Error {
  constructor(message, cause = null) {
    super(message);
    this.name = 'CorruptedStateError';
    this.cause = cause;
    this.statusCode = 500;
  }
}

function clone(obj) {
  if (typeof structuredClone === 'function') {
    return structuredClone(obj);
  }
  return JSON.parse(JSON.stringify(obj));
}

// -------------------------------------------------------------
// MIGRATIONS DETERMINÍSTICAS PURAS
// -------------------------------------------------------------

export function migrate1To2(oldState) {
  const next = clone(oldState);
  if (!Array.isArray(next.terms)) next.terms = [];
  next.terms = next.terms.map(t => {
    const term = { ...t };
    term.id = term.id || `term-${Date.now()}`;
    term.name = term.name || 'Advogado(a) Titular';
    term.registration = term.registration || 'OAB/UF 000000';
    if (!term.oabUf || term.oabUf === 'UF') {
      const match = term.registration.match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/i);
      term.oabUf = match ? match[1].toUpperCase() : '';
    }
    if (!term.oabNumber) {
      const match = term.registration.replace(/\D/g, '');
      term.oabNumber = (match && match !== '000000') ? match : '';
    }
    term.active = term.active !== false;
    term.primary = Boolean(term.primary);
    return term;
  });
  next.schemaVersion = 2;
  return next;
}

export function migrate2To3(oldState) {
  const next = clone(oldState);
  if (!Array.isArray(next.sources)) next.sources = [];

  next.sources = next.sources.map(s => {
    const src = { ...s };
    if (src.id === 'djen') src.id = 'djen-cnj';
    if (src.id === 'datajud') src.id = 'datajud-cnj';
    return src;
  });

  const canonicalSources = [
    { id: 'external-calendar', name: 'Agenda Externa (Webcal)', short: 'CAL', method: 'Webcal/iCal', status: 'planned', lastCheck: null, detail: 'Sincronize com Google Agenda, Outlook ou Apple' },
    { id: 'djen-cnj', name: 'DJEN / CNJ Oficial', short: 'CNJ', method: 'API pública oficial', status: 'planned', lastCheck: null, detail: 'Conector de diários e publicações' },
    { id: 'datajud-cnj', name: 'DataJud / CNJ', short: 'DJD', method: 'API pública oficial', status: 'planned', lastCheck: null, detail: 'Enriquecimento de andamentos processuais' },
    { id: 'a1', name: 'Portais com certificado A1 / PJe', short: 'A1', method: 'Agente local seguro', status: 'off', lastCheck: null, detail: 'Integração direta com tribunais' },
    { id: 'inpi-rpi', name: 'INPI / RPI Marcas', short: 'INPI', method: 'RPI Semanal (Terças)', status: 'ok', lastCheck: null, detail: 'Monitoramento semanal de marcas, despachos e termos' }
  ];

  for (const cs of canonicalSources) {
    if (!next.sources.some(s => s.id === cs.id)) {
      next.sources.push({ ...cs });
    }
  }

  const seen = new Set();
  next.sources = next.sources.filter(s => {
    if (!s?.id || seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });

  next.schemaVersion = 3;
  return next;
}

export function migrate3To4(oldState) {
  const next = clone(oldState);
  if (!Array.isArray(next.processes)) next.processes = [];

  next.processes = next.processes.map(p => {
    const proc = { ...p };
    // Normalizar campo financeiro oficial RPV
    if (proc.requisitionAmount === undefined) {
      proc.requisitionAmount = proc.rpvAmount ?? proc.economicValue ?? null;
    }
    // Normalizar status de quitação
    if (proc.feeStatus === 'pago' || proc.feeStatus === 'quitado') {
      proc.feeStatus = 'repassado';
    }
    if (proc.requisitionStatus === 'pago' || proc.requisitionStatus === 'quitado') {
      proc.requisitionStatus = 'repassado';
    }
    return proc;
  });

  next.schemaVersion = 4;
  return next;
}

export function migrate4To5(oldState) {
  const next = clone(oldState);
  if (!Array.isArray(next.tasks)) next.tasks = [];

  next.tasks = next.tasks.map(t => {
    const task = { ...t };
    task.id = task.id || `task-${Date.now()}-${randomBytes(3).toString('hex')}`;
    task.title = task.title || 'Tarefa sem título';
    task.status = task.status || 'triagem';
    task.priority = task.priority || 'normal';
    task.responsible = task.responsible || 'Advogado';
    task.createdAt = task.createdAt || new Date().toISOString();
    return task;
  });

  if (!Array.isArray(next.agenda)) next.agenda = [];
  next.agenda = next.agenda.map(a => {
    const item = { ...a };
    item.id = item.id || `agenda-${Date.now()}-${randomBytes(3).toString('hex')}`;
    item.title = item.title || 'Compromisso';
    item.date = item.date || new Date().toISOString().slice(0, 10);
    return item;
  });

  next.schemaVersion = 5;
  return next;
}

export function migrate5To6(oldState) {
  const next = clone(oldState);
  if (!next.settings || typeof next.settings !== 'object') next.settings = {};

  // Isolar chave de IA (removida do estado durável para ai-secrets.json)
  delete next.settings.geminiApiKey;

  if (!Array.isArray(next.contacts)) next.contacts = [];
  if (!Array.isArray(next.customPrompts)) next.customPrompts = [];
  if (!Array.isArray(next.customLinks)) next.customLinks = [];
  if (!Array.isArray(next.intimations)) next.intimations = [];

  next.schemaVersion = 6;
  return next;
}

export function migrate6To7(oldState) {
  const next = clone(oldState);

  if (!next.configuration || typeof next.configuration !== 'object') {
    next.configuration = {};
  }
  const configKeys = [
    'taskDefinitions', 'actionGroups', 'actionTypes', 'stages', 'goals',
    'origins', 'partners', 'inboxSections', 'notificationAssignments',
    'integrations', 'sourceProducts', 'users', 'monitoredTerms'
  ];
  for (const k of configKeys) {
    if (!Array.isArray(next.configuration[k])) {
      next.configuration[k] = [];
    }
  }

  if (!Array.isArray(next.audit)) next.audit = [];
  if (!Array.isArray(next.migrationHistory)) next.migrationHistory = [];

  next.schemaVersion = 7;
  next.dataVersion = 7;
  return next;
}

export function migrate7To8(oldState) {
  const next = clone(oldState);
  if (!Array.isArray(next.intimations)) next.intimations = [];

  next.intimations = next.intimations.map(item => {
    const intimation = { ...item };
    if (!intimation.treatmentStatus) {
      if (intimation.status === 'arquivada') {
        intimation.treatmentStatus = 'discarded';
        intimation.discardedAt = intimation.discardedAt || null;
        intimation.discardedBy = intimation.discardedBy || 'Sistema (Migração)';
      } else if (intimation.status === 'prazo' || intimation.status === 'tarefa') {
        intimation.treatmentStatus = 'treated';
        intimation.treatedAt = intimation.treatedAt || null;
        intimation.treatedBy = intimation.treatedBy || 'Sistema (Migração)';
      } else {
        intimation.treatmentStatus = 'untreated';
      }
    }
    intimation.treatmentStartedAt = intimation.treatmentStartedAt || null;
    intimation.treatmentStartedBy = intimation.treatmentStartedBy || null;
    intimation.treatedAt = intimation.treatedAt || null;
    intimation.treatedBy = intimation.treatedBy || null;
    intimation.discardedAt = intimation.discardedAt || null;
    intimation.discardedBy = intimation.discardedBy || null;
    intimation.treatmentNote = intimation.treatmentNote || null;
    if (!Array.isArray(intimation.linkedTaskIds)) {
      intimation.linkedTaskIds = intimation.linkedTaskId ? [intimation.linkedTaskId] : (intimation.taskId ? [intimation.taskId] : []);
    }
    return intimation;
  });

  next.schemaVersion = 8;
  next.dataVersion = 8;
  return next;
}

export function migrate8To9(oldState) {
  const next = clone(oldState);
  if (!Array.isArray(next.intimations)) next.intimations = [];

  next.intimations = next.intimations.map(item => {
    const intimation = { ...item };
    // Corrigir timestamps fabricados na migração legada
    if (intimation.treatedBy === 'Sistema (Migração)' && intimation.treatedAt && intimation.treatedAt === intimation.publishedAt) {
      intimation.treatedAt = null;
    }
    if (intimation.discardedBy === 'Sistema (Migração)' && intimation.discardedAt && intimation.discardedAt === intimation.publishedAt) {
      intimation.discardedAt = null;
    }
    return intimation;
  });

  next.schemaVersion = 9;
  next.dataVersion = 9;
  return next;
}

export function migrate9To10(oldState) {
  const next = clone(oldState);
  if (!Array.isArray(next.documents)) next.documents = [];
  if (!next.settings || typeof next.settings !== 'object' || Array.isArray(next.settings)) next.settings = {};
  if (typeof next.settings.documentNamingTemplate !== 'string') next.settings.documentNamingTemplate = '';
  next.schemaVersion = 10;
  next.dataVersion = 10;
  return next;
}

export function migrate10To11(oldState) {
  const next = clone(oldState);
  backfillDuplicateIntimations(next, { actor: 'Sistema (Migração)' });
  next.schemaVersion = 11;
  next.dataVersion = 11;
  return next;
}

/**
 * v11 → v12 — separa disponibilização de publicação nas intimações do DJEN.
 *
 * Até a v11, `publishedAt` do DJEN guardava a data de disponibilização informada pela
 * fonte. A partir da v12, `disponibilizadoEm` preserva a data da fonte e `publishedAt`
 * passa a ser o primeiro dia útil seguinte (Lei 11.419/2006, art. 4º, §3º; CPC, art.
 * 224, §2º; Res. CNJ 455/2022, art. 11, §3º). Registros de outras fontes não são
 * tocados: para eproc/PJe/INPI, `publishedAt` continua com o significado da fonte.
 */
export function migrate11To12(oldState) {
  const next = clone(oldState);
  if (Array.isArray(next.intimations)) {
    for (const intimation of next.intimations) {
      if (!intimation || typeof intimation !== 'object' || Array.isArray(intimation)) continue;
      const externalId = String(intimation.externalId || intimation.id || '');
      const isDjen = intimation.type === 'djen' || /^(?:djen:|intimation:djen:)/.test(externalId);
      if (!isDjen) continue;
      const availableAt = String(intimation.disponibilizadoEm || intimation.publishedAt || '').slice(0, 10);
      const derived = derivePublicationDate(availableAt);
      if (derived.availableAt) intimation.disponibilizadoEm = derived.availableAt;
      if (derived.publishedAt) intimation.publishedAt = derived.publishedAt;
    }
  }
  next.schemaVersion = 12;
  next.dataVersion = 12;
  return next;
}

export const MIGRATION_REGISTRY = {
  1: migrate1To2,
  2: migrate2To3,
  3: migrate3To4,
  4: migrate4To5,
  5: migrate5To6,
  6: migrate6To7,
  7: migrate7To8,
  8: migrate8To9,
  9: migrate9To10,
  10: migrate10To11,
  11: migrate11To12
};

// -------------------------------------------------------------
// VALIDAÇÃO ESTRITA DE ESTADO
// -------------------------------------------------------------

export function validateAppState(state, expectedVersion = CURRENT_SCHEMA_VERSION) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new CorruptedStateError('O estado da aplicação não é um objeto JSON válido.');
  }

  const foundVersion = Number(state.schemaVersion ?? state.version ?? 1);
  if (foundVersion > CURRENT_SCHEMA_VERSION) {
    throw new FutureSchemaError(foundVersion, CURRENT_SCHEMA_VERSION);
  }

  if (expectedVersion !== null && foundVersion < expectedVersion) {
    throw new CorruptedStateError(`Schema desatualizado: encontrado ${foundVersion}, esperado ${expectedVersion}. Migração pendente.`);
  }

  const arrayCollections = [
    'terms', 'sources', 'intimations', 'tasks', 'processes',
    'agenda', 'audit', 'contacts', 'documents', 'customPrompts', 'customLinks', 'officeExpenses', 'calculations',
    'communications'
  ];
  for (const col of arrayCollections) {
    if (state[col] !== undefined && !Array.isArray(state[col])) {
      throw new CorruptedStateError(`Coleção corrompida: '${col}' deve ser um Array.`);
    }
    if (Array.isArray(state[col]) && state[col].length > 100_000) {
      throw new CorruptedStateError(`Coleção '${col}' excede limite de segurança.`);
    }
  }

  for (const expense of state.officeExpenses || []) {
    if (!expense || typeof expense !== 'object' || Array.isArray(expense)
      || typeof expense.id !== 'string' || !expense.id
      || typeof expense.description !== 'string' || !expense.description.trim()
      || typeof expense.amount !== 'number' || !Number.isFinite(expense.amount) || expense.amount < 0
      || !['pendente', 'pago', 'reembolsado'].includes(expense.status)) {
      throw new CorruptedStateError('Despesa operacional inválida.');
    }
  }

  if (Array.isArray(state.calculations)) {
    if (state.calculations.length > MAX_CALCULATIONS) {
      throw new CorruptedStateError(`Coleção 'calculations' excede o limite de ${MAX_CALCULATIONS} cálculos salvos.`);
    }
    for (const record of state.calculations) {
      try {
        validateCalculationRecord(record);
      } catch (error) {
        if (error instanceof CalculationRecordError) throw new CorruptedStateError(error.message, error);
        throw error;
      }
    }
  }
  if (state.settings !== undefined && (typeof state.settings !== 'object' || Array.isArray(state.settings))) {
    throw new CorruptedStateError('Configuração "settings" deve ser um objeto.');
  }
  if (state.settings?.dashboardWidgets !== undefined) {
    const preferences = state.settings.dashboardWidgets;
    const knownIds = new Set(['attention', 'metrics', 'tasks', 'widgets', 'inbox', 'insights']);
    const valid = preferences && typeof preferences === 'object' && !Array.isArray(preferences)
      && typeof preferences.enabled === 'boolean'
      && Array.isArray(preferences.hidden)
      && preferences.hidden.length <= knownIds.size
      && preferences.hidden.every(id => typeof id === 'string' && knownIds.has(id));
    if (!valid) {
      throw new CorruptedStateError('Configuração "settings.dashboardWidgets" inválida (preferência do painel).');
    }
  }
  if (state.settings?.suspensions !== undefined) {    if (!Array.isArray(state.settings.suspensions)) {
      throw new CorruptedStateError('Configuração "settings.suspensions" deve ser um Array.');
    }
    if (state.settings.suspensions.length > MAX_SUSPENSIONS) {
      throw new CorruptedStateError(`Configuração "settings.suspensions" excede o limite de ${MAX_SUSPENSIONS} registros.`);
    }
    for (const entry of state.settings.suspensions) {
      if (!normalizeSuspension(entry)) {
        throw new CorruptedStateError('Configuração "settings.suspensions" contém registro inválido (início/fim).');
      }
    }
  }

  if (state.configuration !== undefined && (typeof state.configuration !== 'object' || Array.isArray(state.configuration))) {
    throw new CorruptedStateError('Configuração "configuration" deve ser um objeto.');
  }

  return {
    valid: true,
    schemaVersion: foundVersion,
    dataVersion: Number(state.dataVersion ?? foundVersion)
  };
}

// -------------------------------------------------------------
// EXECUTOR DE MIGRAÇÕES DETERMINÍSTICAS
// -------------------------------------------------------------

export function runStateMigrations(initialState, appVersion = '2.0.0-beta') {
  if (!initialState || typeof initialState !== 'object' || Array.isArray(initialState)) {
    throw new CorruptedStateError('Estado inicial inválido para migração.');
  }

  let state = clone(initialState);
  let currentVer = Number(state.schemaVersion ?? state.version ?? 1);

  if (currentVer > CURRENT_SCHEMA_VERSION) {
    throw new FutureSchemaError(currentVer, CURRENT_SCHEMA_VERSION);
  }

  const applied = [];
  const startVer = currentVer;

  while (currentVer < CURRENT_SCHEMA_VERSION) {
    const migrationFn = MIGRATION_REGISTRY[currentVer];
    if (!migrationFn) {
      throw new CorruptedStateError(`Migration não registrada para transição do schema ${currentVer}.`);
    }
    const nextVer = currentVer + 1;
    state = migrationFn(state);
    applied.push(`${currentVer}->${nextVer}`);
    currentVer = Number(state.schemaVersion);
    if (currentVer !== nextVer) {
      throw new CorruptedStateError(`Migration ${currentVer}->${nextVer} falhou ao atualizar schemaVersion.`);
    }
  }

  state.appVersion = appVersion;
  state.schemaVersion = CURRENT_SCHEMA_VERSION;
  state.dataVersion = CURRENT_DATA_VERSION;
  state.migratedAt = new Date().toISOString();

  if (!Array.isArray(state.migrationHistory)) {
    state.migrationHistory = [];
  }

  if (applied.length > 0) {
    state.migrationHistory.push({
      from: startVer,
      to: CURRENT_SCHEMA_VERSION,
      at: state.migratedAt,
      applied
    });
  }

  validateAppState(state, CURRENT_SCHEMA_VERSION);
  state = applySafeDefaults(state);

  return {
    state,
    migrated: applied.length > 0,
    fromVersion: startVer,
    toVersion: CURRENT_SCHEMA_VERSION,
    migrationsApplied: applied
  };
}

// -------------------------------------------------------------
// APLICAÇÃO SEGURA DE DEFAULTS (SEM PERDA OU DUPLICAÇÃO)
// -------------------------------------------------------------

export function applySafeDefaults(state) {
  const next = clone(state);

  if (next.configuration && typeof next.configuration === 'object' && !Array.isArray(next.configuration)) {
    const assignments = next.configuration.notificationAssignments;
    if (Array.isArray(assignments)) {
      next.configuration.notificationAssignments = assignments.map(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
        const responsibles = Array.isArray(item.responsibles)
          ? item.responsibles.map(value => String(value ?? '').trim()).filter(Boolean)
          : typeof item.responsibles === 'string'
            ? item.responsibles.split(/[,;]/).map(value => value.trim()).filter(Boolean)
            : [];
        return { ...item, responsibles };
      });
    }
    const integrations = next.configuration.integrations;
    if (Array.isArray(integrations) && integrations.length > 0) {
      const hasInpi = integrations.some(item => /inpi|rpi|marcas/i.test(item?.name || ''));
      if (!hasInpi) {
        integrations.push({
          name: 'INPI / RPI Marcas',
          status: 'Ativo',
          method: 'Varredura Semanal RPI (Terças)',
          syncFrequency: 'weekly',
          notes: 'Monitoramento semanal de marcas na Revista da Propriedade Industrial'
        });
      }
    }
  }

  if (!Array.isArray(next.terms) || next.terms.length === 0) {
    next.terms = [{
      id: 'term-principal',
      name: 'Advogado(a) Monitorado(a)',
      registration: 'OAB/UF 000000',
      oabNumber: '',
      oabUf: '',
      active: true,
      primary: true
    }];
  }

  if (!Array.isArray(next.sources) || next.sources.length === 0) {
    next.sources = [
      { id: 'external-calendar', name: 'Agenda Externa (Webcal)', short: 'CAL', method: 'Webcal/iCal', status: 'planned', lastCheck: null, detail: 'Sincronize com Google Agenda, Outlook ou Apple' },
      { id: 'djen-cnj', name: 'DJEN / CNJ Oficial', short: 'CNJ', method: 'API pública oficial', status: 'planned', lastCheck: null, detail: 'Conector de diários e publicações' },
      { id: 'datajud-cnj', name: 'DataJud / CNJ', short: 'DJD', method: 'API pública oficial', status: 'planned', lastCheck: null, detail: 'Enriquecimento de andamentos processuais' },
      { id: 'a1', name: 'Portais com certificado A1 / PJe', short: 'A1', method: 'Agente local seguro', status: 'off', lastCheck: null, detail: 'Integração direta com tribunais' },
      { id: 'inpi-rpi', name: 'INPI / RPI Marcas', short: 'INPI', method: 'RPI Semanal (Terças)', status: 'ok', lastCheck: null, detail: 'Monitoramento semanal de marcas, despachos e termos' }
    ];
  }

  if (!next.settings || typeof next.settings !== 'object') {
    next.settings = {};
  }
  if (typeof next.settings.documentNamingTemplate !== 'string') next.settings.documentNamingTemplate = '';
  if (!Array.isArray(next.documents)) next.documents = [];
  if (!Array.isArray(next.calculations)) next.calculations = [];
  const defaultSettings = {
    officeName: 'Meu Escritório',
    officeSlogan: 'Sociedade de Advogados',
    lawyerName: 'Advogado(a) Titular',
    lawyerOab: 'OAB/UF 000000',
    lawyerCpfCnpj: '',
    lawyerEmail: '',
    lawyerPhone: '',
    lawyerAddress: '',
    externalCalendarUrl: '',
    demoMode: false,
    calendarConfigured: false,
    collectorConfigured: false,
    dismissedBanner: false,
    suspensions: []
  };
  for (const [k, v] of Object.entries(defaultSettings)) {
    if (next.settings[k] === undefined) {
      next.settings[k] = v;
    }
  }

  return next;
}
