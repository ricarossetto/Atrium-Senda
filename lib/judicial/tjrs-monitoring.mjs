import { assertTjrsCnj, reconcileTjrsSnapshot } from './tjrs-sidecar-client.mjs';

export const TJRS_MONITORING_MAX_CONSECUTIVE_FAILURES = 10;
// O coletor só guarda a cópia do processo depois da primeira consulta ao portal. Fazer todas de
// uma vez travaria a sincronização, então cada ciclo faz um lote e o próximo continua de onde parou.
export const TJRS_MONITORING_MAX_FIRST_COLLECTIONS = 10;
// Chave recusada pelo portal não melhora sozinha: espera antes de tentar de novo, e a pessoa pode
// trocar a chave a qualquer momento (accessKeyUpdatedAt mais novo libera a nova tentativa).
export const TJRS_KEY_REJECTED_RETRY_MS = 30 * 24 * 60 * 60 * 1000;

export async function refreshMonitoredTjrsProcesses({
  processes = [],
  userId = '',
  credentialManager,
  client,
  onProgress = () => {},
  maxFirstCollections = TJRS_MONITORING_MAX_FIRST_COLLECTIONS,
  now = Date.now()
} = {}) {
  if (!credentialManager?.getProcessAccessKey || !client?.getProcess || !client?.getDiff) {
    throw new TypeError('Dependências do monitoramento TJRS são obrigatórias.');
  }

  const nextProcesses = (Array.isArray(processes) ? processes : []).map(item => structuredClone(item));
  const candidates = [];
  const failures = [];
  let keyRejectedKnown = 0;
  let keyRejected = 0;

  for (let index = 0; index < nextProcesses.length; index += 1) {
    const process = nextProcesses[index];
    if (process?.monitoring === 'inactive' || !isTjrsProcess(process)) continue;
    let cnj;
    try {
      cnj = assertTjrsCnj(process?.number);
    } catch {
      continue;
    }
    if (isKeyRejectionFresh(process, now)) {
      keyRejectedKnown += 1;
      continue;
    }
    try {
      const accessKey = await credentialManager.getProcessAccessKey(cnj, userId);
      if (accessKey) candidates.push({ index, cnj, accessKey });
    } catch {
      failures.push({ processNumber: cnj, code: 'CREDENTIAL_ERROR' });
    }
  }

  if (!candidates.length) return buildSummary(nextProcesses, { failures, keyRejected: keyRejectedKnown });

  try {
    await client.health();
  } catch (error) {
    return buildSummary(nextProcesses, {
      configured: candidates.length,
      failures: [...failures, ...candidates.map(({ cnj }) => ({ processNumber: cnj, code: safeCode(error) }))]
    });
  }

  let checked = 0;
  let updated = 0;
  let newMovements = 0;
  let consecutiveFailures = 0;
  let aborted = false;
  let firstCollections = 0;
  let pendingFirstCollection = 0;
  for (const candidate of candidates) {
    try {
      onProgress({ current: checked + 1, total: candidates.length, number: candidate.cnj });
      const options = { accessKey: candidate.accessKey };
      let snapshot;
      let diff = null;
      try {
        [snapshot, diff] = await Promise.all([
          client.getProcess(candidate.cnj, options),
          client.getDiff(candidate.cnj, options).catch(error => {
            // Processo com uma coleta só ainda não tem o que comparar.
            if (error?.code === 'NOT_FOUND') return null;
            throw error;
          })
        ]);
      } catch (error) {
        if (error?.code !== 'NOT_FOUND' || typeof client.collectProcess !== 'function') throw error;
        if (firstCollections >= maxFirstCollections) {
          pendingFirstCollection += 1;
          continue;
        }
        firstCollections += 1;
        snapshot = await client.collectProcess(candidate.cnj, { accessKey: candidate.accessKey, forceLive: true });
      }
      const reconciliation = reconcileTjrsSnapshot(nextProcesses[candidate.index], snapshot, diff);
      checked += 1;
      newMovements += reconciliation.summary.newMovements;
      if (reconciliation.changed) {
        nextProcesses[candidate.index] = reconciliation.process;
        updated += 1;
      }
      consecutiveFailures = 0;
    } catch (error) {
      if (error?.code === 'ACCESS_KEY_REJECTED') {
        // É resposta do portal sobre esta chave, não serviço fora do ar: registra e segue.
        nextProcesses[candidate.index].tjrsKeyRejectedAt = new Date(now).toISOString();
        keyRejected += 1;
        continue;
      }
      failures.push({ processNumber: candidate.cnj, code: safeCode(error) });
      consecutiveFailures += 1;
      // Serviço fora do ar: insistir só atrasa a sincronização inteira, processo a processo.
      if (consecutiveFailures >= TJRS_MONITORING_MAX_CONSECUTIVE_FAILURES) {
        aborted = true;
        break;
      }
    }
  }

  return buildSummary(nextProcesses, {
    configured: candidates.length,
    checked,
    updated,
    newMovements,
    failures,
    aborted,
    firstCollections,
    pendingFirstCollection,
    keyRejected: keyRejected + keyRejectedKnown
  });
}

function isKeyRejectionFresh(process, now) {
  const rejectedAt = Date.parse(process?.tjrsKeyRejectedAt || '');
  if (!Number.isFinite(rejectedAt) || now - rejectedAt >= TJRS_KEY_REJECTED_RETRY_MS) return false;
  const keyUpdatedAt = Date.parse(process?.accessKeyUpdatedAt || '');
  return !(Number.isFinite(keyUpdatedAt) && keyUpdatedAt > rejectedAt);
}

function buildSummary(processes, {
  configured = 0,
  checked = 0,
  updated = 0,
  newMovements = 0,
  failures = [],
  aborted = false,
  firstCollections = 0,
  pendingFirstCollection = 0,
  keyRejected = 0
} = {}) {
  const codes = {};
  for (const failure of failures) codes[failure.code] = (codes[failure.code] || 0) + 1;
  return {
    processes,
    configured,
    checked,
    updated,
    newMovements,
    failed: failures.length,
    failures,
    failureCodes: codes,
    aborted,
    firstCollections,
    pendingFirstCollection,
    keyRejected
  };
}

function isTjrsProcess(process) {
  const number = String(process?.number || '');
  const court = String(process?.court || '').toUpperCase();
  return number.includes('.8.21.') || court.includes('TJRS');
}

function safeCode(error) {
  return String(error?.code || 'ERROR').replace(/[^A-Z0-9_-]/gi, '').slice(0, 40) || 'ERROR';
}
