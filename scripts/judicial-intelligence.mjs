#!/usr/bin/env node
import process from 'node:process';
import { BETA_FLAGS, readBetaFlags, betaFlagsEnvironmentSummary, isBetaFlagEnabled } from '../lib/judicial-intelligence/beta/feature-flags.mjs';
import { BetaStatusRegistry, MODULE_STATUS } from '../lib/judicial-intelligence/beta/beta-status.mjs';
import { createDefaultHealthProbes } from '../lib/judicial-intelligence/beta/health-probes.mjs';
import { VERIFICATION_STATES } from '../lib/judicial-intelligence/core/verification-state.mjs';
import { automationPolicy, assertAutomationsEnabled, AUTOMATION_KILL_SWITCH } from '../lib/judicial-intelligence/beta/automation-guard.mjs';
import { COLLECTOR_VERSION } from '../lib/judicial-intelligence/core/provenance.mjs';
import { toPublicError } from '../lib/judicial-intelligence/core/errors.mjs';

const COMMANDS = ['health', 'flags', 'version', 'pdpj-probe', 'datajud-check', 'help'];

const args = process.argv.slice(2);
const command = args[0] ?? 'help';
const strict = args.includes('--strict');

if (!COMMANDS.includes(command)) {
  process.stderr.write(`Comando desconhecido: ${command}\n`);
  printHelp(process.stderr);
  process.exit(2);
}

if (command === 'help') {
  printHelp(process.stdout);
  process.exit(0);
}

if (command === 'version') {
  process.stdout.write(`${JSON.stringify({
    module: 'judicial-intelligence',
    collectorVersion: COLLECTOR_VERSION,
    isolation: 'beta-namespace',
    automationPolicy: automationPolicy(process.env)
  }, null, 2)}\n`);
  process.exit(0);
}

if (command === 'flags') {
  const flags = readBetaFlags(process.env);
  for (const flag of flags) {
    process.stdout.write(`${flag.enabled ? 'ON ' : 'OFF'}  ${flag.id.padEnd(28)} ${flag.surface.padEnd(10)} ${flag.label}\n`);
  }
  process.stdout.write(`\n${JSON.stringify({
    ...betaFlagsEnvironmentSummary(process.env),
    automation: automationPolicy(process.env)
  }, null, 2)}\n`);
  process.exit(0);
}

if (command === 'pdpj-probe') {
  await runPdpjProbe(args);
} else if (command === 'datajud-check') {
  await runDatajudCheck(args);
} else {
  const registry = new BetaStatusRegistry({ env: process.env, modules: buildModules() });
  const probes = strict ? createDefaultHealthProbes({ env: process.env }) : {};
  const snapshot = {
    ...await registry.snapshot({ probes }),
    probeMode: strict ? 'strict' : 'declared',
    automation: automationPolicy(process.env)
  };
  process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);

  if (strict) {
    const troubled = Object.entries(snapshot.modules)
      .filter(([, status]) => status === MODULE_STATUS.DEGRADED || status === MODULE_STATUS.UNAVAILABLE);
    if (troubled.length > 0) {
      process.stderr.write(`Módulos em estado degradado/indisponível: ${troubled.map(([id]) => id).join(', ')}\n`);
      process.exitCode = 1;
    }
  }
}

async function runPdpjProbe(argv) {
  if (!isBetaFlagEnabled('BETA_PDPJ_PROVIDER', process.env)) {
    process.stderr.write('BETA_PDPJ_PROVIDER=false; defina a flag apenas para a execução local.\n');
    process.exitCode = 1;
    return;
  }
  try {
    assertAutomationsEnabled(process.env, { operation: 'polling', provider: 'pdpj' });
  } catch (error) {
    process.stderr.write(`${JSON.stringify(toPublicError(error), null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  const cnjIndex = argv.indexOf('--cnj');
  const cnj = cnjIndex >= 0 ? argv[cnjIndex + 1] : null;
  if (!cnj) {
    process.stderr.write('Uso: node scripts/judicial-intelligence.mjs pdpj-probe --cnj <numero-cnj>\n');
    process.exitCode = 2;
    return;
  }
  const { createPdpjProvider } = await import('../lib/judicial-intelligence/providers/pdpj/index.mjs');
  const provider = createPdpjProvider({ env: process.env });
  try {
    const health = await provider.health();
    const found = await provider.findProcesses(cnj, { limit: 5 });
    const process = found.candidates.length > 0 ? await provider.getProcess(cnj) : null;
    const output = {
      health,
      verificationState: health.verificationState ?? 'UNVERIFIED',
      found: found.candidates.length,
      total: found.total,
      searchAfter: found.searchAfter ? 'present' : null,
      candidate: found.candidates[0]
        ? {
          cnj: found.candidates[0].cnj,
          court: found.candidates[0].court,
          processClass: found.candidates[0].processClass,
          isSecret: found.candidates[0].isSecret
        }
        : null,
      process: process
        ? {
          judicialUnit: process.metadata?.judicialUnit ?? null,
          subject: process.metadata?.subject ?? null,
          parties: process.parties.length,
          movements: process.movements.length,
          documents: process.documents.length,
          provenance: { source: process.provenance.source, collectedAt: process.provenance.collectedAt }
        }
        : null
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify(toPublicError(error), null, 2)}\n`);
    process.exitCode = 1;
  }
}

async function runDatajudCheck(argv) {
  if (!isBetaFlagEnabled('BETA_PROCESS_INTELLIGENCE', process.env)) {
    process.stderr.write('BETA_PROCESS_INTELLIGENCE=false; defina a flag apenas para a execução local.\n');
    process.exitCode = 1;
    return;
  }
  try {
    assertAutomationsEnabled(process.env, { operation: 'polling', provider: 'datajud' });
  } catch (error) {
    process.stderr.write(`${JSON.stringify(toPublicError(error), null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  const cnjIndex = argv.indexOf('--cnj');
  const raw = cnjIndex >= 0 ? argv[cnjIndex + 1] : null;
  const cnjs = String(raw ?? '').split(',').map(value => value.trim()).filter(Boolean);
  if (cnjs.length === 0) {
    process.stderr.write('Uso: node scripts/judicial-intelligence.mjs datajud-check --cnj <cnj1,cnj2,...> [--strict]\n');
    process.exitCode = 2;
    return;
  }
  const { createDatajudProvider } = await import('../lib/judicial-intelligence/providers/datajud/index.mjs');
  const provider = createDatajudProvider({ env: process.env });
  const results = [];
  let missing = 0;
  let errorCount = 0;
  for (const cnj of cnjs) {
    try {
      const process = await provider.getProcess(cnj);
      if (!process) {
        missing += 1;
        results.push({ cnj, status: 'NOT_FOUND', verificationState: VERIFICATION_STATES.UNVERIFIED });
        continue;
      }
      const methods = { tpu: 0, lexicon: 0, other: 0 };
      for (const movement of process.movements) {
        const method = movement.classification?.method ?? 'none';
        if (method.startsWith('tpu')) methods.tpu += 1;
        else if (method === 'lexicon') methods.lexicon += 1;
        else methods.other += 1;
      }
      const lastMovement = [...process.movements]
        .map(movement => movement.date)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null;
      results.push({
        cnj: process.cnj,
        status: 'FOUND',
        court: process.metadata?.court ?? null,
        judicialUnit: process.metadata?.judicialUnit ?? null,
        processClass: process.metadata?.processClass ?? null,
        subject: process.metadata?.subject ?? null,
        distributionDate: process.metadata?.distributionDate ?? null,
        isSecret: process.metadata?.isSecret ?? null,
        movementCount: process.movements.length,
        lastMovementAt: lastMovement,
        classificationMethods: methods,
        verificationState: VERIFICATION_STATES.LIVE_PARTIAL,
        verificationNote: 'Endpoint público respondeu e normalizou; comparação manual com a fonte oficial ainda pendente.'
      });
    } catch (error) {
      errorCount += 1;
      results.push({ cnj, status: 'ERROR', error: toPublicError(error, { provider: 'datajud', operation: 'getProcess' }) });
    }
  }
  process.stdout.write(`${JSON.stringify({
    provider: 'datajud',
    generatedAt: new Date().toISOString(),
    count: results.length,
    missing,
    results
  }, null, 2)}\n`);
  if (strict && (missing > 0 || errorCount > 0)) process.exitCode = 1;
}

function buildModules() {
  const rows = [];
  if (isBetaFlagEnabled('BETA_PDPJ_PROVIDER', process.env)) {
    rows.push({ id: 'pdpj', label: BETA_FLAGS.BETA_PDPJ_PROVIDER.label, flag: 'BETA_PDPJ_PROVIDER', maturity: 'experimental', verificationState: 'UNVERIFIED' });
    rows.push({ id: 'mni', label: BETA_FLAGS.BETA_PDPJ_PROVIDER.label, flag: 'BETA_PDPJ_PROVIDER', maturity: 'experimental', verificationState: 'UNVERIFIED' });
  }
  if (isBetaFlagEnabled('BETA_PROCESS_INTELLIGENCE', process.env)) {
    rows.push({ id: 'datajud', label: BETA_FLAGS.BETA_PROCESS_INTELLIGENCE.label, flag: 'BETA_PROCESS_INTELLIGENCE', maturity: 'experimental', verificationState: VERIFICATION_STATES.UNVERIFIED });
    rows.push({ id: 'process_intelligence', label: BETA_FLAGS.BETA_PROCESS_INTELLIGENCE.label, flag: 'BETA_PROCESS_INTELLIGENCE', maturity: 'experimental', verificationState: VERIFICATION_STATES.UNVERIFIED });
  }
  if (isBetaFlagEnabled('BETA_DOCUMENT_ACQUISITION', process.env)) {
    rows.push({ id: 'documents', label: BETA_FLAGS.BETA_DOCUMENT_ACQUISITION.label, flag: 'BETA_DOCUMENT_ACQUISITION', maturity: 'experimental', verificationState: VERIFICATION_STATES.UNVERIFIED });
  }
  if (isBetaFlagEnabled('BETA_DUE_DILIGENCE', process.env)) {
    rows.push({ id: 'certificates', label: BETA_FLAGS.BETA_DUE_DILIGENCE.label, flag: 'BETA_DUE_DILIGENCE', maturity: 'experimental', verificationState: VERIFICATION_STATES.UNVERIFIED });
  }
  if (isBetaFlagEnabled('BETA_PRIVACY_AUDIT', process.env)) {
    rows.push({ id: 'privacy_audit', label: BETA_FLAGS.BETA_PRIVACY_AUDIT.label, flag: 'BETA_PRIVACY_AUDIT', maturity: 'experimental', verificationState: VERIFICATION_STATES.UNVERIFIED });
  }
  if (isBetaFlagEnabled('BETA_LEGAL_RAG', process.env)) {
    rows.push({ id: 'rag', label: BETA_FLAGS.BETA_LEGAL_RAG.label, flag: 'BETA_LEGAL_RAG', maturity: 'experimental', verificationState: VERIFICATION_STATES.UNVERIFIED });
  }
  if (rows.length === 0) return undefined;
  return rows;
}

function printHelp(stream) {
  stream.write([
    'ATRIUM — Judicial Intelligence Beta (isolado, read-only, sem rota HTTP)',
    '',
    'Uso:',
    '  node scripts/judicial-intelligence.mjs health [--strict]',
    '  node scripts/judicial-intelligence.mjs flags',
    '  node scripts/judicial-intelligence.mjs version',
    '  node scripts/judicial-intelligence.mjs pdpj-probe --cnj <numero-cnj>',
    '  node scripts/judicial-intelligence.mjs datajud-check --cnj <cnj1,cnj2,...> [--strict]',
    '',
    'Todas as flags BETA_* são desativadas por padrão; nenhuma superfície é exposta a usuários.',
    `Automações (varredura, download massivo, lote de certidões, polling) exigem ${AUTOMATION_KILL_SWITCH}=false explícito.`,
    'pdpj-probe exige BETA_PDPJ_PROVIDER=true e PDPJ_ACCESS_TOKEN capturado manualmente;',
    'o token nunca é persistido, impresso ou enviado a log.',
    'datajud-check usa apenas a chave pública do CNJ e imprime métodos de classificação (TPU/léxico/outro) e o estado de verificação.'
  ].join('\n') + '\n');
}
