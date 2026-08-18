import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sql = await readFile(path.join(root, 'supabase/migrations/202608170001_secure_rls.sql'), 'utf8');
const tables = ['workspaces', 'workspace_members', 'monitored_terms', 'sources', 'processes', 'intimations', 'tasks', 'agenda_events', 'audit_logs'];

for (const table of tables) {
  assert(sql.includes(`alter table public.${table} enable row level security;`), `RLS não foi habilitado em ${table}.`);
  assert(new RegExp(`create policy [^\n]+ on public\\.${table} `).test(sql), `Nenhuma política encontrada para ${table}.`);
}
const policyLines = sql.split(/\r?\n/).filter(line => line.startsWith('create policy'));
for (const line of policyLines) assert(line.includes('public.is_aal2()'), `Política sem exigência AAL2: ${line.split(' on ')[0]}.`);
assert(sql.includes('revoke all on all tables in schema public from anon;'), 'O papel anon não foi revogado.');
assert(!/grant .* on .* to anon;/i.test(sql), 'Foi encontrado grant explícito para anon.');
assert(!/create policy .*audit.* for (update|delete)/i.test(sql), 'Auditoria permite alteração ou exclusão.');
assert(sql.includes('security definer set search_path ='), 'Funções auxiliares não fixam search_path.');
console.log(`RLS test aprovado: ${tables.length} tabelas, ${policyLines.length} políticas, AAL2 obrigatório e anon revogado.`);

function assert(condition, message) { if (!condition) throw new Error(message); }
