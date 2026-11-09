// ATRIUM — deduplicação de contatos (offline, por workspace).
//
// Uso (no servidor, com o serviço PARADO):
//   node scripts/dedupe-contacts.mjs --data-dir <diretório-de-dados> [--tenant <id|slug>] [--execute] [--json]
//
// Sem --execute: somente diagnóstico (dry-run), sem tocar em nada.
// Com --execute: backup automático do workspace (cp -a), fusão dos grupos
// automáticos, religação de referências, auditoria e salvamento com revisão.
//
// Regra de segurança: funde automaticamente só grupos com documento ou
// externalId compartilhado, ou mesmo nome + canal/vínculo compartilhado
// (processo, telefone ou e-mail). Homônimos sem vínculo vão para revisão
// humana e NÃO são tocados.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { contactGroupKey, mergeDuplicateGroup, normalizeContactDocument, normalizeContactName, pickKeeperIndex, rewireContactReferences } from '../js/core/contact-identity.js';
import { SecurityManager } from '../lib/security.mjs';
import { TenantManager } from '../lib/tenant/tenant-manager.mjs';
import { CURRENT_SCHEMA_VERSION, validateAppState } from '../lib/state-migrations.mjs';

function parseArgs(argv) {
  const args = { dataDir: null, envFile: null, tenants: [], execute: false, json: false };
  for (let i = 2; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--execute') args.execute = true;
    else if (flag === '--json') args.json = true;
    else if (flag === '--data-dir') args.dataDir = argv[++i];
    else if (flag === '--env-file') args.envFile = argv[++i];
    else if (flag === '--tenant') args.tenants.push(argv[++i]);
    else throw new Error(`Flag desconhecida: ${flag}`);
  }
  return args;
}

function channelSet(record) {
  const channels = new Set();
  for (const value of [...(record?.relatedProcessNumbers || [])]) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits) channels.add(`proc:${digits}`);
  }
  for (const value of [record?.mobile, record?.phone, record?.email]) {
    const normalized = normalizeContactName(value);
    if (normalized) channels.add(`chan:${normalized}`);
  }
  return channels;
}

// Plano puro (sem I/O): agrupa e classifica. Testável sem servidor.
export function planWorkspace(state) {
  const contacts = Array.isArray(state?.contacts) ? state.contacts : [];
  const byKey = new Map();
  contacts.forEach((record, index) => {
    if (!record || typeof record !== 'object') return;
    const key = contactGroupKey(record);
    if (!key) return;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(index);
  });
  const autoGroups = [];
  const reviewGroups = [];
  for (const [key, indexes] of byKey) {
    if (indexes.length < 2) continue;
    const members = indexes.map(i => contacts[i]);
    const docs = new Set(members.map(m => normalizeContactDocument(m?.document || m?.cpf || m?.cnpj)).filter(Boolean));
    const exts = new Set(members.map(m => String(m?.externalId || '').trim()).filter(Boolean));
    const sample = members.slice(0, 2).map(m => String(m?.name || '').slice(0, 80));
    if (docs.size === 1 || exts.size === 1) {
      autoGroups.push({ key, size: indexes.length, sample, basis: docs.size === 1 ? 'documento' : 'externalId' });
      continue;
    }
    if (key.startsWith('name:')) {
      const channels = members.map(channelSet);
      const shared = channels.slice(1).every(set => [...set].some(channel => channels[0].has(channel)));
      const anyChannel = channels.some(set => set.size > 0);
      if (anyChannel && shared) {
        autoGroups.push({ key, size: indexes.length, sample, basis: 'nome+vínculo' });
        continue;
      }
    }
    reviewGroups.push({ key, size: indexes.length, sample });
  }
  const loserIdSet = new Set();
  for (const group of autoGroups) {
    const indexes = byKey.get(group.key);
    const keeperIndex = pickKeeperIndex(contacts, indexes);
    group.keeperId = String(contacts[keeperIndex]?.id || '');
    group.removedIds = indexes.filter(i => i !== keeperIndex).map(i => String(contacts[i]?.id || '')).filter(Boolean);
    for (const id of group.removedIds) loserIdSet.add(id);
  }
  let refsToMove = 0;
  if (loserIdSet.size) {
    const has = value => value !== '' && loserIdSet.has(String(value || ''));
    for (const process of state?.processes || []) if (process && has(process.contactId)) refsToMove++;
    for (const collection of [state?.tasks, state?.agenda, state?.events]) {
      for (const record of collection || []) {
        if (!record) continue;
        if (has(record.contactId)) refsToMove++;
        if (has(record.clientContactId)) refsToMove++;
      }
    }
    for (const document of state?.documents || []) {
      if (!document) continue;
      if (document.ownerType === 'contact' && has(document.ownerId)) refsToMove++;
      if (has(document.contactId)) refsToMove++;
    }
  }
  return {
    total: contacts.length,
    autoGroups,
    reviewGroups,
    autoRemoveCount: autoGroups.reduce((sum, group) => sum + group.removedIds.length, 0),
    reviewCount: reviewGroups.reduce((sum, group) => sum + group.size, 0),
    refsToMove
  };
}

// Aplica o plano (muta o estado em memória). Devolve resumo aplicado.
export function applyPlan(state, plan) {
  let removed = 0;
  let moved = 0;
  let keepers = 0;
  for (const group of plan.autoGroups) {
    const indexes = [];
    (state.contacts || []).forEach((record, index) => {
      if (String(record?.id || '') === group.keeperId || group.removedIds.includes(String(record?.id || ''))) indexes.push(index);
    });
    if (indexes.length < 2) continue;
    const { keeper, removedIds } = mergeDuplicateGroup(state.contacts, indexes);
    const doomed = new Set(removedIds.map(String));
    state.contacts = (state.contacts || []).filter(record => !doomed.has(String(record?.id || '')));
    const at = (state.contacts || []).findIndex(record => String(record?.id) === String(keeper.id));
    if (at >= 0) state.contacts[at] = keeper;
    else state.contacts.unshift(keeper);
    moved += rewireContactReferences(state, String(keeper.id), removedIds);
    removed += removedIds.length;
    keepers++;
  }
  state.contacts = Array.isArray(state.contacts) ? state.contacts : [];
  return { removed, moved, keepers };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.envFile) process.loadEnvFile(args.envFile);
  else if (existsSync(path.resolve('.env'))) process.loadEnvFile(path.resolve('.env'));
  if (!process.env.AUTH_ENCRYPTION_KEY) throw new Error('AUTH_ENCRYPTION_KEY ausente: informe --env-file com o .env do servidor.');

  const dataDir = path.resolve(args.dataDir || path.join(process.cwd(), 'data'));
  const manager = new TenantManager({ dataDirectory: dataDir });
  await manager.init();
  let tenants = manager.listTenants();
  if (args.tenants.length) {
    const wanted = new Set(args.tenants.map(String));
    tenants = tenants.filter(t => wanted.has(t.id) || wanted.has(t.slug));
    if (!tenants.length) throw new Error('Nenhum tenant corresponde ao filtro.');
  }

  const report = { mode: args.execute ? 'execute' : 'dry-run', tenants: [] };
  for (const tenant of tenants) {
    const workspaceDir = manager.getTenantDataDir(tenant.id);
    const security = new SecurityManager({ dataDirectory: workspaceDir });
    await security.init();
    const file = path.join(workspaceDir, 'app-state.json');
    if (!existsSync(file)) {
      report.tenants.push({ id: tenant.id, slug: tenant.slug, skipped: 'sem app-state.json' });
      continue;
    }
    const envelope = JSON.parse(readFileSync(file, 'utf8'));
    const state = JSON.parse(security.decrypt(envelope.encrypted));
    const plan = planWorkspace(state);
    const entry = { id: tenant.id, slug: tenant.slug, total: plan.total, autoGroups: plan.autoGroups.length, autoRemoveCount: plan.autoRemoveCount, reviewGroups: plan.reviewGroups.length, reviewCount: plan.reviewCount, refsToMove: plan.refsToMove, backup: null, applied: null };
    if (!args.json) {
      console.log(`\n== ${tenant.slug} (${tenant.id}): ${plan.total} contatos ==`);
      console.log(`Automáticos: ${plan.autoGroups.length} grupos, ${plan.autoRemoveCount} registros, ${plan.refsToMove} referências.`);
      for (const group of plan.autoGroups.slice(0, 20)) {
        console.log(`  - [${group.basis}] ${group.size}x <- ${group.sample.join(' | ')}`);
      }
      if (plan.autoGroups.length > 20) console.log(`  ... e mais ${plan.autoGroups.length - 20} grupos.`);
      console.log(`Revisão humana: ${plan.reviewGroups.length} grupos, ${plan.reviewCount} registros.`);
    }
    if (args.execute && plan.autoRemoveCount > 0) {
      const backupDir = path.join('/tmp', `atrium-dedupe-backup-${Date.now()}`);
      mkdirSync(backupDir, { recursive: true });
      cpSync(workspaceDir, path.join(backupDir, tenant.id), { recursive: true });
      entry.backup = path.join(backupDir, tenant.id);
      const applied = applyPlan(state, plan);
      state.audit = Array.isArray(state.audit) ? state.audit : [];
      state.audit.unshift({
        id: `aud-dedupe-${Date.now()}-${randomBytes(4).toString('hex')}`,
        at: new Date().toISOString(),
        action: 'Deduplicação de contatos',
        detail: `${applied.removed} duplicado(s) fundidos em ${applied.keepers} registro(s); ${applied.moved} referência(s) religada(s).`,
        actor: 'Sistema'
      });
      state.schemaVersion = CURRENT_SCHEMA_VERSION;
      validateAppState(state, CURRENT_SCHEMA_VERSION);
      const nextRevision = randomBytes(12).toString('hex');
      const next = { version: CURRENT_SCHEMA_VERSION, encrypted: security.encrypt(JSON.stringify(state)), updatedAt: new Date().toISOString(), revision: nextRevision };
      writeFileSync(file, JSON.stringify(next, null, 2), 'utf8');
      entry.applied = { ...applied, revision: nextRevision };
      if (!args.json) console.log(`Aplicado: ${applied.removed} removidos, ${applied.moved} religados. Backup: ${entry.backup}. Revisão: ${nextRevision}.`);
    }
    report.tenants.push(entry);
  }
  if (args.json) console.log(JSON.stringify(report, null, 2));
  if (!args.execute) console.log('\nDry-run: nada foi alterado. Rode com --execute para aplicar (com backup automático).');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
if (isMain) {
  main().catch(error => { console.error(`Falha: ${error.message}`); process.exit(1); });
}
