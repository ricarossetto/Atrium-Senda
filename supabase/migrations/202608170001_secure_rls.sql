-- Keller Central Jurídica — estrutura inicial protegida por workspace.
-- Execute somente em um projeto Supabase novo ou após revisão de compatibilidade.

create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'lawyer', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.monitored_terms (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null, registration text, term_type text not null default 'oab', active boolean not null default true,
  created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  external_id text, name text not null, method text, status text not null default 'off', detail text, last_check timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (workspace_id, external_id)
);
create table if not exists public.processes (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  cnj_number text not null, client_name text, court text, secrecy boolean not null default false, monitoring text not null default 'active',
  last_movement text, last_movement_at date, created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (workspace_id, cnj_number)
);
create table if not exists public.intimations (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  external_id text, process_id uuid references public.processes(id) on delete set null, source_id uuid references public.sources(id) on delete set null,
  title text not null, original_text text, court text, client_name text, status text not null default 'nova', unread boolean not null default true,
  published_at date, captured_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (workspace_id, external_id)
);
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  intimation_id uuid references public.intimations(id) on delete set null, process_id uuid references public.processes(id) on delete set null,
  title text not null, description text, status text not null default 'triagem', priority text not null default 'normal', deadline date,
  responsible_user_id uuid references auth.users(id) on delete set null, created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.agenda_events (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
  external_id text, process_id uuid references public.processes(id) on delete set null, title text not null, description text,
  starts_at timestamptz not null, ends_at timestamptz, source text, created_by uuid default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (workspace_id, external_id)
);
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_id uuid default auth.uid() references auth.users(id) on delete set null, action text not null, entity_type text, entity_id text,
  detail jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);

create or replace function public.is_workspace_member(target_workspace uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.workspace_members m where m.workspace_id = target_workspace and m.user_id = auth.uid());
$$;
create or replace function public.is_workspace_owner(target_workspace uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.workspaces w where w.id = target_workspace and w.owner_id = auth.uid());
$$;
create or replace function public.is_aal2()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;
revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.is_workspace_owner(uuid) from public;
revoke all on function public.is_aal2() from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_owner(uuid) to authenticated;
grant execute on function public.is_aal2() to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.monitored_terms enable row level security;
alter table public.sources enable row level security;
alter table public.processes enable row level security;
alter table public.intimations enable row level security;
alter table public.tasks enable row level security;
alter table public.agenda_events enable row level security;
alter table public.audit_logs enable row level security;

create policy "workspaces_select_member" on public.workspaces for select to authenticated using (public.is_aal2() and (public.is_workspace_member(id) or owner_id = auth.uid()));
create policy "workspaces_insert_owner" on public.workspaces for insert to authenticated with check (public.is_aal2() and owner_id = auth.uid());
create policy "workspaces_update_owner" on public.workspaces for update to authenticated using (public.is_aal2() and owner_id = auth.uid()) with check (public.is_aal2() and owner_id = auth.uid());
create policy "workspaces_delete_owner" on public.workspaces for delete to authenticated using (public.is_aal2() and owner_id = auth.uid());

create policy "members_select_member" on public.workspace_members for select to authenticated using (public.is_aal2() and (public.is_workspace_member(workspace_id) or public.is_workspace_owner(workspace_id)));
create policy "members_insert_owner" on public.workspace_members for insert to authenticated with check (public.is_aal2() and public.is_workspace_owner(workspace_id));
create policy "members_update_owner" on public.workspace_members for update to authenticated using (public.is_aal2() and public.is_workspace_owner(workspace_id)) with check (public.is_aal2() and public.is_workspace_owner(workspace_id));
create policy "members_delete_owner" on public.workspace_members for delete to authenticated using (public.is_aal2() and public.is_workspace_owner(workspace_id));

create policy "terms_select_member" on public.monitored_terms for select to authenticated using (public.is_aal2() and public.is_workspace_member(workspace_id));
create policy "terms_insert_member" on public.monitored_terms for insert to authenticated with check (public.is_aal2() and public.is_workspace_member(workspace_id) and created_by = auth.uid());
create policy "terms_update_member" on public.monitored_terms for update to authenticated using (public.is_aal2() and public.is_workspace_member(workspace_id)) with check (public.is_aal2() and public.is_workspace_member(workspace_id));
create policy "terms_delete_admin" on public.monitored_terms for delete to authenticated using (public.is_aal2() and public.is_workspace_owner(workspace_id));

create policy "sources_select_member" on public.sources for select to authenticated using (public.is_aal2() and public.is_workspace_member(workspace_id));
create policy "sources_insert_member" on public.sources for insert to authenticated with check (public.is_aal2() and public.is_workspace_member(workspace_id));
create policy "sources_update_member" on public.sources for update to authenticated using (public.is_aal2() and public.is_workspace_member(workspace_id)) with check (public.is_aal2() and public.is_workspace_member(workspace_id));
create policy "sources_delete_owner" on public.sources for delete to authenticated using (public.is_aal2() and public.is_workspace_owner(workspace_id));

create policy "processes_select_member" on public.processes for select to authenticated using (public.is_aal2() and public.is_workspace_member(workspace_id));
create policy "processes_insert_member" on public.processes for insert to authenticated with check (public.is_aal2() and public.is_workspace_member(workspace_id) and created_by = auth.uid());
create policy "processes_update_member" on public.processes for update to authenticated using (public.is_aal2() and public.is_workspace_member(workspace_id)) with check (public.is_aal2() and public.is_workspace_member(workspace_id));
create policy "processes_delete_owner" on public.processes for delete to authenticated using (public.is_aal2() and public.is_workspace_owner(workspace_id));

create policy "intimations_select_member" on public.intimations for select to authenticated using (public.is_aal2() and public.is_workspace_member(workspace_id));
create policy "intimations_insert_member" on public.intimations for insert to authenticated with check (public.is_aal2() and public.is_workspace_member(workspace_id));
create policy "intimations_update_member" on public.intimations for update to authenticated using (public.is_aal2() and public.is_workspace_member(workspace_id)) with check (public.is_aal2() and public.is_workspace_member(workspace_id));
create policy "intimations_delete_owner" on public.intimations for delete to authenticated using (public.is_aal2() and public.is_workspace_owner(workspace_id));

create policy "tasks_select_member" on public.tasks for select to authenticated using (public.is_aal2() and public.is_workspace_member(workspace_id));
create policy "tasks_insert_member" on public.tasks for insert to authenticated with check (public.is_aal2() and public.is_workspace_member(workspace_id) and created_by = auth.uid());
create policy "tasks_update_member" on public.tasks for update to authenticated using (public.is_aal2() and public.is_workspace_member(workspace_id)) with check (public.is_aal2() and public.is_workspace_member(workspace_id));
create policy "tasks_delete_owner_or_creator" on public.tasks for delete to authenticated using (public.is_aal2() and (public.is_workspace_owner(workspace_id) or created_by = auth.uid()));

create policy "agenda_select_member" on public.agenda_events for select to authenticated using (public.is_aal2() and public.is_workspace_member(workspace_id));
create policy "agenda_insert_member" on public.agenda_events for insert to authenticated with check (public.is_aal2() and public.is_workspace_member(workspace_id) and (created_by is null or created_by = auth.uid()));
create policy "agenda_update_member" on public.agenda_events for update to authenticated using (public.is_aal2() and public.is_workspace_member(workspace_id)) with check (public.is_aal2() and public.is_workspace_member(workspace_id));
create policy "agenda_delete_member" on public.agenda_events for delete to authenticated using (public.is_aal2() and public.is_workspace_member(workspace_id));

create policy "audit_select_member" on public.audit_logs for select to authenticated using (public.is_aal2() and public.is_workspace_member(workspace_id));
create policy "audit_insert_member" on public.audit_logs for insert to authenticated with check (public.is_aal2() and public.is_workspace_member(workspace_id) and (actor_id is null or actor_id = auth.uid()));
-- Audit logs intentionally have no UPDATE or DELETE policy.

create index if not exists workspace_members_user_idx on public.workspace_members(user_id);
create index if not exists monitored_terms_workspace_idx on public.monitored_terms(workspace_id, active);
create index if not exists processes_workspace_idx on public.processes(workspace_id, cnj_number);
create index if not exists intimations_workspace_date_idx on public.intimations(workspace_id, published_at desc);
create index if not exists tasks_workspace_status_idx on public.tasks(workspace_id, status, deadline);
create index if not exists agenda_workspace_start_idx on public.agenda_events(workspace_id, starts_at);
create index if not exists audit_workspace_created_idx on public.audit_logs(workspace_id, created_at desc);

revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.workspaces, public.workspace_members, public.monitored_terms, public.sources, public.processes, public.intimations, public.tasks, public.agenda_events to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- O primeiro workspace deve ser criado pelo usuário autenticado, seguido da associação owner:
-- insert into public.workspaces(name, owner_id) values ('Keller Advogados', auth.uid());
-- insert into public.workspace_members(workspace_id, user_id, role) values (<workspace_id>, auth.uid(), 'owner');
