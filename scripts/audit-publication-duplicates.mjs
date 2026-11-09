#!/usr/bin/env node
/**
 * ATRIUM — Auditoria read-only de publicações duplicadas (eproc×DJEN e intra-fonte).
 *
 * Uso:
 *   node scripts/audit-publication-duplicates.mjs [--data-dir=<dir>] [--masked-out=<arquivo>] [--help]
 *
 * Data dir (primeiro que existir):
 *   --data-dir=<dir> | ATRIUM_DATA_DIR | JURISFLOW_DATA_DIR | KELLER_DATA_DIR | <raiz>/data
 *
 * Chaves (lidas do ambiente ou de <raiz>/.env):
 *   AUTH_ENCRYPTION_KEY  — obrigatória, base64 de 32 bytes (AES-256-GCM).
 *   AUTH_SESSION_SECRET  — opcional; usada apenas para validar o construtor.
 *
 * Garantias:
 *   - SOMENTE LEITURA: abre os envelopes e usa security.decrypt; nunca chama
 *     init/save/encrypt de estado e jamais escreve no data dir auditado.
 *   - stdout emite apenas agregados: sem título, texto, cliente, OAB, e-mail
 *     ou CNJ completo. O portal é higienizado e truncado.
 *   - --masked-out grava a conferência do operador com CNJ/cliente mascarados e
 *     ids truncados. Esse arquivo NUNCA deve ser commitado.
 *
 * Validação local com fixture sintético (sem dados reais):
 *   1. Crie um diretório temporário fora do repositório com app-state.json
 *      criptografado por SecurityManager usando chaves sintéticas de teste,
 *      mais workspaces/<id>/app-state.json se quiser validar agregação.
 *   2. Rode:
 *      node scripts/audit-publication-duplicates.mjs --data-dir=<tmp> --masked-out=<tmp>/masked.txt
 *   3. Confira os agregados no stdout contra a fixture.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SecurityManager } from '../lib/security.mjs';
import { groupDuplicateCandidates, DATE_TOLERANCE_DAYS } from '../lib/publications/intimation-identity.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATUS_RANK = Object.freeze({ treated: 3, in_review: 2, untreated: 1, discarded: 0 });

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log(usage());
  process.exit(0);
}

await loadEnv(path.join(ROOT, '.env'));
const dataDir = resolveDataDir(options);
let security;
try {
  security = new SecurityManager({
    dataDirectory: dataDir,
    sessionSecret: process.env.AUTH_SESSION_SECRET || randomBytes(48).toString('base64url'),
    encryptionKey: process.env.AUTH_ENCRYPTION_KEY || ''
  });
} catch (error) {
  console.error(`[erro] Chaves inválidas para leitura dos envelopes: ${error.message}`);
  console.error('Defina AUTH_ENCRYPTION_KEY (32 bytes em base64) e, opcionalmente, AUTH_SESSION_SECRET.');
  process.exit(1);
}

const workspaceFiles = await discoverWorkspaceFiles(dataDir);
if (!workspaceFiles.length) {
  console.error(`[erro] Nenhum app-state.json encontrado em ${dataDir}.`);
  console.error('Use --data-dir=<dir> ou ATRIUM_DATA_DIR apontando para o diretório de dados.');
  process.exit(1);
}

const generatedAt = new Date().toISOString();
const totals = emptyTotals();
const analyzedWorkspaces = [];
let readableWorkspaces = 0;

for (const workspace of workspaceFiles) {
  try {
    const envelope = JSON.parse(await readFile(workspace.file, 'utf8'));
    if (!envelope?.encrypted) throw new Error('envelope sem payload criptografado');
    const state = JSON.parse(security.decrypt(envelope.encrypted));
    const analysis = analyzeState(state, workspace.label);
    accumulate(totals, analysis);
    analyzedWorkspaces.push(analysis);
    readableWorkspaces += 1;
  } catch (error) {
    console.error(`[aviso] workspace ${maskWorkspaceLabel(workspace.label)}: não foi possível ler o estado (${error.message}).`);
  }
}

if (!readableWorkspaces) {
  console.error('[erro] Nenhum estado pôde ser lido com as chaves informadas.');
  process.exit(1);
}

printReport(totals, analyzedWorkspaces, readableWorkspaces);

if (options.maskedOut) {
  const target = path.resolve(options.maskedOut);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, buildMaskedReport(totals, analyzedWorkspaces, generatedAt), 'utf8');
  console.log(`Conferência mascarada gravada em: ${target}`);
  if (target.startsWith(`${ROOT}${path.sep}`)) {
    console.log('[aviso] O arquivo mascarado está dentro do repositório: não o commite.');
  }
}

function parseArgs(argv) {
  const parsed = { dataDir: '', maskedOut: '', help: false };
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') parsed.help = true;
    else if (arg.startsWith('--data-dir=')) parsed.dataDir = arg.slice('--data-dir='.length);
    else if (arg.startsWith('--masked-out=')) parsed.maskedOut = arg.slice('--masked-out='.length);
    else {
      console.error(`[erro] Argumento desconhecido: ${arg}`);
      console.error(usage());
      process.exit(1);
    }
  }
  return parsed;
}

function usage() {
  return [
    'Uso: node scripts/audit-publication-duplicates.mjs [--data-dir=<dir>] [--masked-out=<arquivo>]',
    '',
    '  --data-dir=<dir>      diretório de dados (padrão: ATRIUM_DATA_DIR ou <raiz>/data)',
    '  --masked-out=<file>   grava conferência com CNJ/cliente mascarados (uso interno)',
    '  --help                exibe esta ajuda'
  ].join('\n');
}

function resolveDataDir(parsed) {
  return path.resolve(
    parsed.dataDir
    || process.env.ATRIUM_DATA_DIR
    || process.env.JURISFLOW_DATA_DIR
    || process.env.KELLER_DATA_DIR
    || path.join(ROOT, 'data')
  );
}

async function loadEnv(file) {
  if (!existsSync(file)) return;
  const source = await readFile(file, 'utf8');
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function discoverWorkspaceFiles(dataDir) {
  const files = [];
  const defaultFile = path.join(dataDir, 'app-state.json');
  if (existsSync(defaultFile)) files.push({ label: 'padrão', file: defaultFile });
  const workspacesRoot = path.join(dataDir, 'workspaces');
  if (existsSync(workspacesRoot)) {
    const entries = await readdir(workspacesRoot, { withFileTypes: true });
    for (const name of entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) {
      const file = path.join(workspacesRoot, name, 'app-state.json');
      if (existsSync(file)) files.push({ label: name, file });
    }
  }
  return files;
}

function analyzeState(state, label = '') {
  const allIntimations = Array.isArray(state?.intimations) ? state.intimations : [];
  const aliases = allIntimations.filter(item => item && item.mergedInto);
  const intimations = allIntimations.filter(item => !(item && item.mergedInto));
  const dedup = groupDuplicateCandidates(intimations);
  const groups = dedup.groups.map(group => {
    const members = group.members.map(member => ({
      ...member,
      record: intimations[member.index] && typeof intimations[member.index] === 'object' ? intimations[member.index] : {}
    }));
    const statuses = members.map(member => treatmentStatus(member.record));
    const flags = {
      nonUntreated: statuses.some(status => status !== 'untreated'),
      treated: statuses.includes('treated'),
      discarded: statuses.includes('discarded'),
      linkedTasks: members.some(member => linkedTaskIds(member.record).length > 0),
      rawHtml: members.some(member => Boolean(member.record.rawHtml)),
      reportedDeadline: members.some(member => Boolean(member.record.sourceReportedDeadlineAt))
    };
    const keeper = chooseKeeper(members);
    const tasksToRewrite = new Set();
    for (const member of members) {
      if (member.index === keeper.index) continue;
      for (const taskId of linkedTaskIds(member.record)) tasksToRewrite.add(taskId);
    }
    return { ...group, members, flags, keeperIndex: keeper.index, tasksToRewrite: tasksToRewrite.size };
  });
  return {
    dedup,
    groups,
    nearDateCandidates: dedup.nearDateCandidates,
    fallbackCandidates: dedup.fallbackCandidates,
    aliases: aliases.length,
    label
  };
}

function accumulate(totals, analysis) {
  totals.intimations += analysis.dedup.stats.total;
  totals.eligible += analysis.dedup.stats.eligible;
  totals.matchable += analysis.dedup.stats.matchable;
  totals.groups += analysis.groups.length;
  totals.grouped += analysis.dedup.stats.grouped;
  totals.nearDateCandidates += analysis.dedup.stats.nearDateCandidates;
  totals.fallbackCandidates += analysis.fallbackCandidates.length;
  totals.aliases += analysis.aliases;
  for (const key of Object.keys(totals.matrix)) totals.matrix[key] += analysis.dedup.sourceMatrix[key] || 0;
  for (const group of analysis.groups) {
    if (group.flags.nonUntreated) totals.nonUntreated += 1;
    if (group.flags.linkedTasks) totals.linkedTasks += 1;
    if (group.flags.rawHtml) totals.rawHtml += 1;
    if (group.flags.reportedDeadline) totals.reportedDeadline += 1;
    if (group.flags.treated && group.flags.discarded) totals.treatedDiscardedConflicts += 1;
    totals.tasksToRewrite += group.tasksToRewrite;
    const portalsInGroup = new Set();
    for (const member of group.members) {
      const portal = portalKey(member.record, member);
      portalsInGroup.add(portal);
      const entry = totals.portals.get(portal) || { groups: 0, records: 0 };
      entry.records += 1;
      totals.portals.set(portal, entry);
    }
    for (const portal of portalsInGroup) {
      const entry = totals.portals.get(portal) || { groups: 0, records: 0 };
      entry.groups += 1;
      totals.portals.set(portal, entry);
    }
  }
}

function emptyTotals() {
  return {
    intimations: 0,
    eligible: 0,
    matchable: 0,
    groups: 0,
    grouped: 0,
    nearDateCandidates: 0,
    fallbackCandidates: 0,
    aliases: 0,
    matrix: { 'djen×djen': 0, 'djen×eproc': 0, 'eproc×eproc': 0 },
    portals: new Map(),
    nonUntreated: 0,
    linkedTasks: 0,
    rawHtml: 0,
    reportedDeadline: 0,
    treatedDiscardedConflicts: 0,
    tasksToRewrite: 0
  };
}

function printReport(totals, analyses, readableWorkspaces) {
  console.log('=== ATRIUM — Auditoria read-only de publicações duplicadas ===');
  console.log(`Data dir: ${resolveDataDir(options)}`);
  console.log(`Workspaces lidos: ${readableWorkspaces}`);
  console.log('Envelope: AES-256-GCM; nenhuma escrita foi realizada no data dir.');
  console.log('');
  console.log('Resumo geral');
  console.log(`  Intimações analisadas: ${totals.intimations}`);
  console.log(`  Elegíveis djen/eproc: ${totals.eligible}`);
  console.log(`  Com identidade calculável: ${totals.matchable}`);
  console.log(`  Grupos duplicados (n>=2): ${totals.groups}`);
  console.log(`  Registros em grupos: ${totals.grouped}`);
  console.log(`  Matriz de pares: djen×djen=${totals.matrix['djen×djen']} | djen×eproc=${totals.matrix['djen×eproc']} | eproc×eproc=${totals.matrix['eproc×eproc']}`);
  console.log(`  Candidatos por ±${DATE_TOLERANCE_DAYS} dia (nunca auto-fusão): ${totals.nearDateCandidates}`);
  console.log(`  Candidatos por prefixo de 160 chars (nunca auto-fusão): ${totals.fallbackCandidates}`);
  console.log(`  Aliases de fusão (ocultos do painel): ${totals.aliases}`);
  console.log(`  Grupos com tratamento != untreated: ${totals.nonUntreated}`);
  console.log(`  Grupos com tarefa vinculada (linkedTaskIds/taskId): ${totals.linkedTasks}`);
  console.log(`  Grupos com rawHtml: ${totals.rawHtml}`);
  console.log(`  Grupos com prazo informado pela fonte: ${totals.reportedDeadline}`);
  console.log(`  Conflitos treated × discarded: ${totals.treatedDiscardedConflicts}`);
  console.log(`  Estimativa de tarefas a reescrever: ${totals.tasksToRewrite}`);
  console.log('');
  console.log('Por portal');
  const portals = [...totals.portals.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (!portals.length) console.log('  (nenhum grupo duplicado)');
  for (const [portal, entry] of portals) {
    console.log(`  ${portal.padEnd(28, ' ')} grupos=${entry.groups} registros=${entry.records}`);
  }
  console.log('');
  console.log('Por workspace');
  for (const analysis of analyses) {
    console.log(`  ${maskWorkspaceLabel(analysis.label).padEnd(28, ' ')} grupos=${analysis.groups.length} registros=${analysis.dedup.stats.grouped} candidatos±1d=${analysis.dedup.stats.nearDateCandidates} candidatosPrefixo=${analysis.fallbackCandidates.length} tarefasReescrever=${analysis.groups.reduce((sum, group) => sum + group.tasksToRewrite, 0)}`);
  }
}

function buildMaskedReport(totals, analyses, generatedAt) {
  const lines = [
    '# ATRIUM — conferência mascarada de publicações duplicadas',
    `# Gerado em: ${generatedAt}`,
    '# SOMENTE USO INTERNO — NUNCA COMMITAR.',
    '# CNJ e cliente mascarados; ids truncados e portais higienizados.',
    `# Tolerância de ±${DATE_TOLERANCE_DAYS} dia e prefixo de 160 chars são apenas candidatura humana; auto-fusão nunca ocorre.`,
    `# Totais: grupos=${totals.groups} registros=${totals.grouped} candidatos±1d=${totals.nearDateCandidates} candidatosPrefixo=${totals.fallbackCandidates} conflitos=${totals.treatedDiscardedConflicts} tarefasReescrever=${totals.tasksToRewrite}`
  ];
  for (const analysis of analyses) {
    lines.push('');
    lines.push(`## workspace ${maskWorkspaceLabel(analysis.label)} — grupos=${analysis.groups.length}`);
    if (!analysis.groups.length) lines.push('(sem grupos duplicados)');
    for (const group of analysis.groups) {
      const sharedKeys = [group.strongKeys.length ? 'strong' : '', group.fallbackKeys.length ? 'fallback' : ''].filter(Boolean).join('+') || 'transitiva';
      const conflict = group.flags.treated && group.flags.discarded ? 'sim' : 'não';
      lines.push(`[${group.id}] tamanho=${group.members.length} fontes=${group.sources.join('+')} par=${group.sourcePair} chaves=${sharedKeys} conflito=${conflict} keeper=${maskExternalId(group.members.find(member => member.index === group.keeperIndex)?.externalId || '')}`);
      for (const member of group.members) {
        const record = member.record;
        const tasks = linkedTaskIds(record).length;
        lines.push(`  - fonte=${member.source || '?'} id=${maskExternalId(member.externalId)} cnj=${maskCnj(member.cnj)} data=${member.dataISO || '?'} cliente=${maskClient(record.client) || '(vazio)'} tratamento=${treatmentStatus(record)} tarefas=${tasks} html=${record.rawHtml ? 'sim' : 'não'} prazoFonte=${record.sourceReportedDeadlineAt ? 'sim' : 'não'}`);
      }
    }
    if (analysis.nearDateCandidates.length) {
      lines.push('');
      lines.push(`## candidatos ±${DATE_TOLERANCE_DAYS} dia (revisão humana; auto-fusão proibida) — total=${analysis.nearDateCandidates.length}`);
      for (const candidate of analysis.nearDateCandidates) {
        lines.push(`  - ${maskExternalId(candidate.a.externalId)} (${candidate.a.dataISO}) <> ${maskExternalId(candidate.b.externalId)} (${candidate.b.dataISO}) motivo=${candidate.matchedBy} diaGap=${candidate.dayGap} autoSafe=${candidate.autoSafe ? 'sim' : 'não'}`);
      }
    }
    if (analysis.fallbackCandidates.length) {
      lines.push('');
      lines.push(`## candidatos por prefixo de 160 chars (revisão humana; auto-fusão proibida) — total=${analysis.fallbackCandidates.length}`);
      for (const candidate of analysis.fallbackCandidates) {
        lines.push(`  - ${maskExternalId(candidate.a.externalId)} (${candidate.a.dataISO}) <> ${maskExternalId(candidate.b.externalId)} (${candidate.b.dataISO}) motivo=${candidate.matchedBy} autoSafe=${candidate.autoSafe ? 'sim' : 'não'}`);
      }
    }
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function treatmentStatus(record) {
  return String(record?.treatmentStatus || 'untreated');
}

function linkedTaskIds(record) {
  const ids = new Set();
  if (Array.isArray(record?.linkedTaskIds)) {
    for (const id of record.linkedTaskIds) if (id) ids.add(String(id));
  }
  if (record?.taskId) ids.add(String(record.taskId));
  return [...ids];
}

function chooseKeeper(members) {
  return [...members].sort((a, b) =>
    (STATUS_RANK[treatmentStatus(b.record)] ?? 0) - (STATUS_RANK[treatmentStatus(a.record)] ?? 0)
    || linkedTaskIds(b.record).length - linkedTaskIds(a.record).length
    || String(a.record.createdAt || '').localeCompare(String(b.record.createdAt || ''))
    || String(a.externalId).localeCompare(String(b.externalId))
  )[0];
}

function portalKey(record, member) {
  if (member.source === 'djen' || record?.type === 'djen') return 'djen';
  const portalId = sanitizeLabel(record?.portalId);
  if (portalId) return `eproc:${portalId}`;
  return sanitizeLabel(record?.source || record?.type) || 'desconhecido';
}

function sanitizeLabel(value) {
  return String(value || '').replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 40);
}

function maskWorkspaceLabel(value) {
  const text = String(value || '');
  if (text === 'padrão') return text;
  return text.length > 18 ? `${text.slice(0, 18)}...` : text;
}

function maskExternalId(value) {
  const text = String(value || '');
  return text.length > 24 ? `${text.slice(0, 24)}...` : text;
}

function maskCnj(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '(sem-cnj)';
  if (digits.length !== 20) return `${digits.slice(0, 2)}${'*'.repeat(Math.max(1, digits.length - 2))}`;
  return `${digits.slice(0, 4)}****-**.${digits.slice(9, 13)}.*.*.*`;
}

function maskClient(value) {
  const tokens = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return '';
  return tokens.map(token => `${token[0]}${'*'.repeat(Math.max(1, token.length - 1))}`).join(' ');
}
