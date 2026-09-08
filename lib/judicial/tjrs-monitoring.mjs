import { assertTjrsCnj, reconcileTjrsSnapshot } from './tjrs-sidecar-client.mjs';

export async function refreshMonitoredTjrsProcesses({
  processes = [],
  userId = '',
  credentialManager,
  client,
  onProgress = () => {}
} = {}) {
  if (!credentialManager?.getProcessAccessKey || !client?.getProcess || !client?.getDiff) {
    throw new TypeError('Dependências do monitoramento TJRS são obrigatórias.');
  }

  const nextProcesses = (Array.isArray(processes) ? processes : []).map(item => structuredClone(item));
  const candidates = [];
  const failures = [];

  for (let index = 0; index < nextProcesses.length; index += 1) {
    const process = nextProcesses[index];
    if (process?.monitoring === 'inactive' || !isTjrsProcess(process)) continue;
    let cnj;
    try {
      cnj = assertTjrsCnj(process?.number);
    } catch {
      continue;
    }
    try {
      const accessKey = await credentialManager.getProcessAccessKey(cnj, userId);
      if (accessKey) candidates.push({ index, cnj, accessKey });
    } catch {
      failures.push({ processNumber: cnj, code: 'CREDENTIAL_ERROR' });
    }
  }

  if (!candidates.length) return buildSummary(nextProcesses, { failures });

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
  for (const candidate of candidates) {
    try {
      onProgress({ current: checked + 1, total: candidates.length, number: candidate.cnj });
      const options = { accessKey: candidate.accessKey };
      const [snapshot, diff] = await Promise.all([
        client.getProcess(candidate.cnj, options),
        client.getDiff(candidate.cnj, options)
      ]);
      const reconciliation = reconcileTjrsSnapshot(nextProcesses[candidate.index], snapshot, diff);
      checked += 1;
      newMovements += reconciliation.summary.newMovements;
      if (reconciliation.changed) {
        nextProcesses[candidate.index] = reconciliation.process;
        updated += 1;
      }
    } catch (error) {
      failures.push({ processNumber: candidate.cnj, code: safeCode(error) });
    }
  }

  return buildSummary(nextProcesses, {
    configured: candidates.length,
    checked,
    updated,
    newMovements,
    failures
  });
}

function buildSummary(processes, {
  configured = 0,
  checked = 0,
  updated = 0,
  newMovements = 0,
  failures = []
} = {}) {
  return {
    processes,
    configured,
    checked,
    updated,
    newMovements,
    failed: failures.length,
    failures
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
