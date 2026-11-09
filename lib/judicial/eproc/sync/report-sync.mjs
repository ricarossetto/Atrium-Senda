/**
 * ATRIUM Sovereign Judicial Connectivity — Eproc Report-First Sync
 *
 * Implements the operator-defined Report-First ingestion axis for eproc:
 *
 *   login mTLS+A1/TOTP -> Painel do Advogado -> "Gerar Planilha"
 *   -> XLS oficial (OLE/BIFF8) -> parser resiliente -> snapshot -> diff
 *   -> NEW / UPDATED / UNCHANGED / REMOVED_OR_INACTIVE
 *   -> enrichment apenas do NEW/UPDATED (com orçamento por execução)
 *   -> capa + Chave do Processo -> cofre cifrado do workspace
 *
 * Regras invariantes:
 * - O relatório oficial é a fonte primária da carteira; a DOM do painel é fallback.
 * - UNCHANGED nunca é reenriquecido; REMOVED_OR_INACTIVE é apenas sinal de auditoria.
 * - Nenhuma chave de acesso é gravada no snapshot ou no estado em texto claro.
 * - Snapshots são por workspace e gravados de forma atômica (tmp + rename).
 */

import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { downloadEprocSpreadsheet } from '../importers/spreadsheet-downloader.mjs';
import { parseEprocProcessReportXls } from '../importers/spreadsheet-importer.mjs';
import { computeEprocProcessDelta } from './delta-sync.mjs';
import { discoverEprocReportTrigger, navigateToEprocProcessReport } from '../../../../collector/adapters/eproc.mjs';

export { computeEprocProcessDelta } from './delta-sync.mjs';
import { getEprocPortalById } from '../portal-registry.mjs';
import { processMatchesPortal, STRICT_PORTAL_MATCHES } from './portal-process-match.mjs';

export const EPROC_REPORT_STATUS = Object.freeze({
  OBTAINED: 'OBTAINED',
  EMPTY: 'EMPTY',
  UNAVAILABLE: 'UNAVAILABLE',
  SKIPPED: 'SKIPPED'
});

export const EPROC_DISCOVERY_SOURCE = Object.freeze({
  REPORT_XLS: 'REPORT_XLS',
  PANEL_DOM_FALLBACK: 'PANEL_DOM_FALLBACK',
  TARGET_PROCESS: 'TARGET_PROCESS'
});

export const EPROC_REPORT_SNAPSHOT_FILE = 'eproc-report-snapshots.json';

const GENERIC_CLIENT_RE = /^(?:cliente\s+)?(?:geral|n[ãa]o\s+informado|n[ãa]o\s+identificado|modelo|do\s+escrit[óo]rio|sigilo|n\/?i|sem\s+cliente)$/i;

export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

function isGenericClient(value) {
  const clean = String(value || '').trim();
  return !clean || GENERIC_CLIENT_RE.test(clean);
}

export function reportRecordFingerprint(record) {
  const identity = [
    record?.portalId || '',
    digitsOnly(record?.cnj || record?.number),
    String(record?.lastEvent || '').trim().toLowerCase(),
    String(record?.rawLastEventDate || record?.lastEventAt || '').trim(),
    String(record?.actionClass || '').trim().toLowerCase(),
    String(record?.judicialUnit || '').trim().toLowerCase(),
    String(record?.caseValue || '').trim()
  ].join('|');
  return createHash('sha256').update(identity).digest('hex');
}

export function normalizeReportRecord(record, portalId) {
  const cnj = digitsOnly(record?.cnj || record?.number);
  return {
    cnj,
    number: String(record?.number || '').trim() || cnj,
    judicialUnit: String(record?.judicialUnit || '').trim(),
    actionClass: String(record?.actionClass || '').trim(),
    plaintiff: String(record?.plaintiff || '').trim(),
    defendant: String(record?.defendant || '').trim(),
    courtLocation: String(record?.courtLocation || '').trim(),
    subject: String(record?.subject || '').trim(),
    lastEvent: String(record?.lastEvent || '').trim(),
    rawLastEventDate: String(record?.rawLastEventDate || '').trim(),
    lastEventAt: record?.lastEventAt || null,
    rawDistributionDate: String(record?.rawDistributionDate || '').trim(),
    distributionAt: record?.distributionAt || null,
    caseValue: String(record?.caseValue || '').trim(),
    publicUrl: String(record?.publicUrl || '').trim(),
    portalId,
    provenance: 'EPROC_REPORT_XLS',
    fingerprint: reportRecordFingerprint({ ...record, portalId })
  };
}

/**
 * Baseline estável para o diff: usa a fotografia do relatório já persistida quando
 * existir e, na primeira migração, os campos oficiais atuais do processo.
 */
export function buildEprocReportBaseline(processes = [], portalId) {
  const baseline = [];
  const portal = getEprocPortalById(portalId);
  const useStrictMatch = STRICT_PORTAL_MATCHES.has(portalId);
  for (const proc of Array.isArray(processes) ? processes : []) {
    const cnj = digitsOnly(proc?.number || proc?.cnj);
    if (cnj.length !== 20) continue;
    // O baseline só contém processos do portal corrente: jamais transformar a carteira
    // de outro tribunal em falso sinal de ausência.
    const belongsToPortal = useStrictMatch && portal
      ? processMatchesPortal(proc, portal)
      : (!proc?.portalId || proc.portalId === portalId)
        && (!proc?.source || String(proc.source).startsWith('eproc') || proc.source === `eproc-${portalId}`);
    if (!belongsToPortal) continue;
    const report = proc?.eprocReport || {};
    baseline.push({
      id: proc.id,
      portalId: proc.portalId || portalId,
      cnj,
      number: proc.number || cnj,
      lastEvent: report.lastEvent ?? proc.lastEvent ?? '',
      lastEventAt: report.lastEventAt ?? proc.lastEventAt ?? '',
      rawLastEventDate: report.rawLastEventDate ?? proc.rawLastEventDate ?? '',
      actionClass: report.actionClass ?? proc.actionClass ?? '',
      judicialUnit: report.judicialUnit ?? proc.judicialUnit ?? '',
      caseValue: report.caseValue ?? proc.caseValue ?? proc.value ?? '',
      enrichmentStatus: proc.enrichmentStatus || (proc.hasAccessKey ? 'COMPLETE' : null),
      hasAccessKey: Boolean(proc.hasAccessKey),
      needsEnrichment: Boolean(proc.needsEnrichment),
      // Proveniência do sigilo: necessária para o delta agendar a revisão única de
      // marca legada (sem tag de origem) sem reabrir processos já reconciliados.
      secrecy: proc.secrecy === true,
      secrecyManual: proc.secrecyManual === true,
      secrecyReviewedAt: proc.secrecyReviewedAt || '',
      tags: Array.isArray(proc.tags) ? proc.tags : []
    });
  }
  return baseline;
}

/**
 * Mescla, de forma não destrutiva, o inventário oficial no estado oficial.
 * - Nunca sobrescreve cliente/relação manual.
 * - Nunca transforma parte adversa em cliente.
 * - Mantém a fotografia eprocReport para diffs estáveis.
 */
export function mergeEprocReportInventory(state, { portalId, portalLabel, records = [], collectedAt, source = 'REPORT_XLS' } = {}) {
  if (!state || typeof state !== 'object') throw new Error('Estado oficial é obrigatório para a mesclagem do relatório eproc.');
  state.processes = Array.isArray(state.processes) ? state.processes : [];
  const counts = { created: 0, updated: 0, untouched: 0 };

  for (const record of records) {
    const cnj = digitsOnly(record?.cnj);
    if (cnj.length !== 20) continue;
    const report = { ...record, portalId, source, collectedAt };
    let proc = state.processes.find(candidate => digitsOnly(candidate?.number || candidate?.cnj) === cnj);

    if (!proc) {
      proc = {
        id: `proc:eproc:${cnj}`,
        number: record.number || cnj,
        client: '',
        court: portalLabel,
        actionClass: record.actionClass || 'Classe não informada',
        judicialUnit: record.judicialUnit || '',
        subject: record.subject || '',
        opposingParty: record.defendant || '',
        caseValue: record.caseValue || '',
        value: record.caseValue || '',
        lastEvent: record.lastEvent || '',
        lastEventAt: record.lastEventAt || null,
        lastMovement: record.lastEvent || 'Importado do eproc',
        lastMovementAt: record.lastEventAt || null,
        distributionDate: record.rawDistributionDate || '',
        status: 'ATIVO',
        source: `eproc-${portalId}`,
        system: 'eproc',
        portalId,
        publicUrl: record.publicUrl || '',
        tags: ['eproc', 'relatorio-processos', portalId],
        enrichmentStatus: 'PENDING',
        createdAt: collectedAt,
        updatedAt: collectedAt,
        eprocReport: report
      };
      state.processes.unshift(proc);
      counts.created += 1;
      continue;
    }

    let changed = false;
    const setIfMissing = (key, value) => {
      if (value && !proc[key]) { proc[key] = value; changed = true; }
    };

    if (proc.portalId !== portalId) { proc.portalId = portalId; changed = true; }
    setIfMissing('judicialUnit', record.judicialUnit);
    if (!proc.actionClass || /classe não informada/i.test(String(proc.actionClass))) {
      if (record.actionClass && proc.actionClass !== record.actionClass) { proc.actionClass = record.actionClass; changed = true; }
    }
    setIfMissing('subject', record.subject);
    setIfMissing('court', portalLabel);
    if (!proc.caseValue && record.caseValue) { proc.caseValue = record.caseValue; changed = true; }
    if (!proc.value && record.caseValue) { proc.value = record.caseValue; changed = true; }
    setIfMissing('opposingParty', record.defendant);
    setIfMissing('publicUrl', record.publicUrl);
    setIfMissing('distributionDate', record.rawDistributionDate);
    // Movimento nunca retrocede: o relatório não pode sobrescrever um andamento mais
    // recente já consolidado por outro pipeline.
    const incomingAt = record.lastEventAt || null;
    const currentAt = proc.lastEventAt || null;
    const incomingIsNewer = !currentAt || !incomingAt || String(incomingAt) >= String(currentAt);
    if (incomingIsNewer) {
      if (record.lastEvent && proc.lastEvent !== record.lastEvent) { proc.lastEvent = record.lastEvent; changed = true; }
      if (record.lastEventAt && proc.lastEventAt !== record.lastEventAt) { proc.lastEventAt = record.lastEventAt; changed = true; }
      if (record.lastEventAt && String(proc.lastMovementAt || '') !== String(record.lastEventAt)) {
        proc.lastMovement = record.lastEvent || proc.lastMovement || '';
        proc.lastMovementAt = record.lastEventAt;
        changed = true;
      }
    }

    proc.tags = Array.isArray(proc.tags) ? proc.tags : [];
    for (const tag of ['eproc', 'relatorio-processos', portalId]) {
      if (!proc.tags.includes(tag)) { proc.tags.push(tag); changed = true; }
    }
    proc.eprocReport = report;

    if (changed) {
      proc.updatedAt = collectedAt;
      counts.updated += 1;
    } else {
      counts.untouched += 1;
    }
  }

  return counts;
}

function enrichmentPriority(record) {
  const client = String(record?.client || '').trim();
  const secrecy = Boolean(record?.secrecy) || /sigilo|segredo/i.test(client);
  const missingClient = isGenericClient(client);
  let score = 0;
  if (secrecy) score += 10;
  if (missingClient) score += 8;
  if (record?.deltaType === 'UPDATED') score += 3;
  if (record?.deltaType === 'NEW') score += 1;
  if (record?.enrichmentStatus === 'PENDING' || record?.enrichmentStatus === 'RETRYABLE_ERROR') score += 2;
  return score;
}

/**
 * Seleciona alvos de enriquecimento apenas entre NEW/UPDATED (e backlog pendente),
 * respeitando o orçamento por execução. Sempre determina o que ficou diferido.
 */
export function selectEprocReportEnrichmentTargets(delta, { maxProcesses = 4 } = {}) {
  const candidates = Array.isArray(delta?.enrichmentCandidates) ? [...delta.enrichmentCandidates] : [];
  const limit = Number.isFinite(Number(maxProcesses)) ? Math.max(0, Number(maxProcesses)) : 0;
  candidates.sort((a, b) => enrichmentPriority(b) - enrichmentPriority(a));
  const selected = limit > 0 ? candidates.slice(0, limit) : [];
  const deferred = candidates.slice(selected.length);
  return { selected, deferred, totalCandidates: candidates.length };
}

export class EprocReportSnapshotStore {
  constructor({ dataDirectory, fileName = EPROC_REPORT_SNAPSHOT_FILE, securityManager = null, logger = console } = {}) {
    if (!dataDirectory) {
      throw Object.assign(new Error('Diretório de dados do workspace é obrigatório para os snapshots do relatório eproc.'), {
        code: 'EPROC_SNAPSHOT_STORE_REQUIRED'
      });
    }
    this.dataDirectory = dataDirectory;
    this.filePath = path.join(dataDirectory, fileName);
    this.securityManager = securityManager;
    this.logger = logger;
    this._cache = null;
  }

  async read() {
    if (this._cache) return this._cache;
    if (!existsSync(this.filePath)) {
      this._cache = { version: 1, portals: {} };
      return this._cache;
    }
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8'));
      if (parsed?.encrypted) {
        if (typeof this.securityManager?.decrypt !== 'function') {
          this.logger.warn?.('[EprocReportSnapshot] Snapshot cifrado sem chave disponível neste contexto.');
          this._cache = { version: 1, portals: {} };
          return this._cache;
        }
        const decrypted = JSON.parse(this.securityManager.decrypt(parsed.encrypted));
        this._cache = {
          version: Number(decrypted?.version) || 1,
          portals: decrypted?.portals && typeof decrypted.portals === 'object' ? decrypted.portals : {}
        };
      } else {
        this._cache = {
          version: Number(parsed?.version) || 1,
          portals: parsed?.portals && typeof parsed.portals === 'object' ? parsed.portals : {}
        };
      }
    } catch (error) {
      this.logger.warn?.(`[EprocReportSnapshot] Snapshot ilegível será recriado: ${error.message}`);
      this._cache = { version: 1, portals: {} };
    }
    return this._cache;
  }

  async getPortalSnapshot(portalId) {
    const store = await this.read();
    return store.portals[portalId] || null;
  }

  async savePortalSnapshot(portalId, { collectedAt, source = 'REPORT_XLS', sourceFile = null, sourceSha256 = null, records = [] } = {}) {
    const store = await this.read();
    store.version = 1;
    store.portals[portalId] = {
      portalId,
      collectedAt,
      source,
      sourceFile,
      sourceSha256,
      count: records.length,
      records
    };
    await this._writeAtomic(store);
    return store.portals[portalId];
  }

  async _writeAtomic(store) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const payload = typeof this.securityManager?.encrypt === 'function'
      ? {
          version: 2,
          algorithm: 'aes-256-gcm',
          updatedAt: new Date().toISOString(),
          encrypted: this.securityManager.encrypt(JSON.stringify(store))
        }
      : store;
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
    await rename(tempPath, this.filePath);
    this._cache = store;
  }
}

/**
 * Baixa o Relatório de Processos oficial ("Gerar Planilha") e o normaliza.
 * Não hardcodeia hashes/parâmetros efêmeros: descobre o comando real na página autenticada.
 */
export async function acquireEprocProcessReportXls(page, options = {}) {
  const logger = options.logger || console;
  // O comando oficial de exportação vive na Relação de Processos; a navegação é
  // best-effort (a descoberta segue fail-closed para o comando em si).
  try {
    await navigateToEprocProcessReport(page);
  } catch (error) {
    logger.warn?.(`[EprocReportSync] Navegação ao Relatório de Processos indisponível: ${error.message}`);
  }
  const discovered = await discoverEprocReportTrigger(page, {
    labelPattern: options.labelPattern,
    denyPattern: options.denyPattern
  });
  if (!discovered) {
    throw Object.assign(new Error('Comando oficial de exportação ("Gerar Planilha") não localizado na página autenticada do eproc.'), {
      code: 'EPROC_REPORT_TRIGGER_NOT_FOUND'
    });
  }
  const artifact = await downloadEprocSpreadsheet(page, {
    selector: discovered.descriptor.cssPath,
    triggerLocator: discovered.locator,
    documentRoot: discovered.frame,
    timeoutMs: options.timeoutMs || 45_000,
    logger
  });
  const rawRecords = parseEprocProcessReportXls(artifact.buffer, { portalId: options.portalId });
  const records = rawRecords.map(record => normalizeReportRecord(record, options.portalId));
  return { artifact, records, trigger: discovered.descriptor };
}

/**
 * Executa o eixo Report-First completo (download -> parse -> snapshot -> diff -> merge),
 * devolvendo telemetria honesta. Falhas do relatório não geram falso sucesso: o chamador
 * decide entre fallback de painel e resultado parcial.
 */
export async function runEprocProcessReportInventory({
  page,
  portalId,
  state,
  snapshotStore = null,
  collectedAt,
  logger = console,
  timeoutMs,
  onProgress
} = {}) {
  const portal = getEprocPortalById(portalId) || { court: 'eproc', level: 1 };
  const portalLabel = `${portal.court} ${portal.level === 2 ? '2G' : '1G'}`;
  const at = collectedAt || new Date().toISOString();
  onProgress?.({
    phase: 'report_download',
    determinate: false,
    progress: null,
    action: `Gerando planilha oficial do Relatório de Processos (${portalLabel})...`,
    log: 'Relatório de Processos: solicitando exportação oficial "Gerar Planilha".'
  });

  try {
    const { artifact, records } = await acquireEprocProcessReportXls(page, { portalId, logger, timeoutMs });
    const sourceSha256 = createHash('sha256').update(artifact.buffer).digest('hex');
    let snapshotError = null;
    if (snapshotStore) {
      try {
        await snapshotStore.savePortalSnapshot(portalId, {
          collectedAt: at,
          source: 'REPORT_XLS',
          sourceFile: artifact.suggestedFilename || null,
          sourceSha256,
          records
        });
      } catch (error) {
        snapshotError = error.message;
        logger.warn?.(`[EprocReportSync] Falha ao persistir snapshot do relatório: ${error.message}`);
      }
    }

    const baseline = buildEprocReportBaseline(state?.processes, portalId);
    if (records.length === 0 && baseline.length > 0) {
      // Relatório reconhecido porém vazio para uma carteira ativa: sinal de filtro,
      // layout novo ou indisponibilidade parcial. Nada é marcado como ausente.
      return {
        ok: false,
        status: EPROC_REPORT_STATUS.EMPTY,
        portalId,
        collectedAt: at,
        code: 'EPROC_REPORT_EMPTY_SUSPICIOUS',
        error: 'O relatório oficial não retornou processos para uma carteira ativa; nenhum registro foi marcado como ausente.',
        artifact: { source: artifact.source, size: artifact.size, suggestedFilename: artifact.suggestedFilename || null, sha256: sourceSha256 },
        delta: computeEprocProcessDelta(records, baseline, { portalId })
      };
    }
    const delta = computeEprocProcessDelta(records, baseline, { portalId });
    const merge = mergeEprocReportInventory(state, {
      portalId,
      portalLabel,
      records,
      collectedAt: at,
      source: 'REPORT_XLS'
    });

    onProgress?.({
      phase: 'report_diff',
      determinate: true,
      progress: 100,
      completed: records.length,
      total: records.length,
      action: `Relatório oficial processado: ${delta.newCount} novo(s), ${delta.updatedCount} atualizado(s), ${delta.unchangedCount} inalterado(s).`,
      log: `Relatório de Processos: ${records.length} registro(s) oficiais; ${delta.newCount} novo(s), ${delta.updatedCount} atualizado(s), ${delta.unchangedCount} inalterado(s), ${delta.inactiveCount} ausente(s) (auditoria).`
    });

    return {
      ok: true,
      status: records.length ? EPROC_REPORT_STATUS.OBTAINED : EPROC_REPORT_STATUS.EMPTY,
      portalId,
      collectedAt: at,
      artifact: {
        source: artifact.source,
        size: artifact.size,
        suggestedFilename: artifact.suggestedFilename || null,
        sha256: sourceSha256
      },
      records,
      delta,
      merge,
      snapshotError
    };
  } catch (error) {
    return {
      ok: false,
      status: EPROC_REPORT_STATUS.UNAVAILABLE,
      portalId,
      collectedAt: at,
      error: String(error?.message || error),
      code: error?.code || null
    };
  }
}
