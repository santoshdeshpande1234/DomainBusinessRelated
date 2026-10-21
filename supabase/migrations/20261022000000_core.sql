-- Domain2Revenue AI, Phase 1 schema: workspaces, members, invites, campaigns, integrations,
-- exchange rates, API usage and an append-only audit log.
--
-- Security model: the browser talks to Supabase with the user's own session, so every table
-- has row-level security. A user belongs to exactly one workspace and can only see that
-- workspace's rows. Roles: admin (everything), member (campaigns), viewer (read only).
-- The audit log is written by triggers, never by clients.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- tables

create table public.workspaces (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null check (char_length(name) between 2 and 80),
  default_currency       text not null default 'USD',
  default_language       text not null default 'English',
  company_name           text not null default '',
  company_website        text not null default '',
  sender_name            text not null default '',
  monthly_api_budget_usd numeric check (monthly_api_budget_usd >= 0),
  service_pricing        jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create table public.memberships (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null unique references auth.users (id) on delete cascade,
  email        text not null,
  full_name    text,
  role         text not null check (role in ('admin', 'member', 'viewer')),
  status       text not null default 'active' check (status in ('active', 'disabled')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index memberships_workspace_idx on public.memberships (workspace_id);

create table public.invites (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email        text not null check (email = lower(email)),
  role         text not null check (role in ('admin', 'member', 'viewer')),
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_at  timestamptz
);
create unique index invites_one_pending_per_email on public.invites (email) where status = 'pending';

create table public.campaigns (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  name              text not null check (char_length(name) between 3 and 120),
  industry          text not null,
  custom_industry   text,
  country           text not null,
  region            text,
  city              text,
  service_area      text,
  language          text not null,
  currency          text not null,
  objectives        text[] not null check (cardinality(objectives) > 0),
  domain_budget     numeric not null check (domain_budget >= 0),
  prospect_budget   numeric not null check (prospect_budget >= 0),
  max_prospects     integer not null check (max_prospects between 1 and 1000),
  min_quality_score integer not null check (min_quality_score between 0 and 100),
  extensions        text[] not null check (cardinality(extensions) > 0),
  service_pricing   jsonb not null default '{}'::jsonb,
  limits            jsonb not null default '{}'::jsonb,
  notes             text,
  status            text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  fx                jsonb not null,
  progress          jsonb not null default '{}'::jsonb,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (industry <> 'custom' or coalesce(trim(custom_industry), '') <> '')
);
create index campaigns_workspace_updated_idx on public.campaigns (workspace_id, updated_at desc);

-- Provider credentials. "secret" is AES-256-GCM ciphertext made by the server with
-- ENCRYPTION_KEY; the database never holds plaintext keys. "hint" is the masked tail shown in the UI.
create table public.integrations (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  provider     text not null,
  secret       text,
  hint         jsonb not null default '{}'::jsonb,
  status       text not null check (status in ('saved_unverified', 'verified', 'failed')),
  updated_by   uuid references auth.users (id) on delete set null,
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, provider)
);

-- Shared exchange-rate cache (public data), refreshed by the server.
create table public.fx_rates (
  base        text primary key,
  rates       jsonb not null,
  provider    text not null,
  provider_updated_at text,
  fetched_at  timestamptz not null default now()
);

create table public.api_usage (
  id           bigint generated always as identity primary key,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  provider     text not null,
  operation    text not null,
  units        numeric,
  est_cost_usd numeric,
  status       text not null default 'ok',
  latency_ms   integer,
  actor_id     uuid,
  created_at   timestamptz not null default now()
);
create index api_usage_workspace_created_idx on public.api_usage (workspace_id, created_at desc);

create table public.audit_logs (
  id            bigint generated always as identity primary key,
  workspace_id  uuid references public.workspaces (id) on delete cascade,
  actor_id      uuid,
  actor_email   text,
  action        text not null,
  resource_type text not null,
  resource_id   text,
  detail        jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index audit_logs_workspace_created_idx on public.audit_logs (workspace_id, created_at desc);

-- ---------------------------------------------------------------- helpers

create or replace function public.my_workspace() returns uuid
language sql stable security definer set search_path = public as $$
  select workspace_id from public.memberships where user_id = auth.uid() and status = 'active'
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.memberships where user_id = auth.uid() and status = 'active'
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger workspaces_touch before update on public.workspaces for each row execute function public.touch_updated_at();
create trigger campaigns_touch before update on public.campaigns for each row execute function public.touch_updated_at();

-- Audit trail: one row per change, written with the caller's identity. Secrets are never copied.
create or replace function public.audit_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := to_jsonb(coalesce(new, old));
  old_rec jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  changed text[];
  ws uuid := coalesce((rec ->> 'workspace_id')::uuid, case when tg_table_name = 'workspaces' then (rec ->> 'id')::uuid end);
  -- Server-side writes run without a user session; they record the acting user in the row.
  actor uuid := coalesce(auth.uid(), (rec ->> 'updated_by')::uuid, (rec ->> 'created_by')::uuid, (rec ->> 'invited_by')::uuid);
begin
  if not exists (select 1 from public.workspaces where id = ws) then
    return coalesce(new, old);  -- the workspace itself is being deleted
  end if;
  if tg_op = 'UPDATE' then
    select array_agg(key order by key) into changed
    from jsonb_each(to_jsonb(new)) n
    where n.key not in ('updated_at', 'secret') and n.value is distinct from old_rec -> n.key;
    if changed is null then
      return new;
    end if;
  end if;
  insert into public.audit_logs (workspace_id, actor_id, actor_email, action, resource_type, resource_id, detail)
  values (
    ws, actor, coalesce(auth.jwt() ->> 'email', (select email from public.memberships where user_id = actor)),
    tg_table_name || '.' || lower(tg_op), tg_table_name,
    coalesce(rec ->> 'id', rec ->> 'provider', rec ->> 'user_id'),
    jsonb_strip_nulls(jsonb_build_object(
      'name', rec ->> 'name', 'email', rec ->> 'email', 'role', rec ->> 'role', 'status', rec ->> 'status',
      'changed', to_jsonb(changed),
      'from_status', case when tg_op = 'UPDATE' and old_rec ->> 'status' is distinct from rec ->> 'status' then old_rec ->> 'status' end))
  );
  return coalesce(new, old);
end $$;

create trigger workspaces_audit after update on public.workspaces for each row execute function public.audit_change();
create trigger memberships_audit after insert or update or delete on public.memberships for each row execute function public.audit_change();
create trigger invites_audit after insert or update on public.invites for each row execute function public.audit_change();
create trigger campaigns_audit after insert or update or delete on public.campaigns for each row execute function public.audit_change();
create trigger integrations_audit after insert or update or delete on public.integrations for each row execute function public.audit_change();

-- An admin cannot remove the last active admin (keeps every workspace manageable).
create or replace function public.keep_one_admin() returns trigger
language plpgsql security definer set search_path = public as $$
declare ws uuid := old.workspace_id;
begin
  if not exists (select 1 from public.workspaces where id = ws) then
    return coalesce(new, old);  -- cascading from a deleted workspace
  end if;
  if old.role = 'admin' and old.status = 'active'
     and (tg_op = 'DELETE' or new.role <> 'admin' or new.status <> 'active')
     and not exists (select 1 from public.memberships m where m.workspace_id = ws and m.role = 'admin'
                     and m.status = 'active' and m.user_id <> old.user_id) then
    raise exception 'A workspace needs at least one active admin';
  end if;
  return coalesce(new, old);
end $$;
create trigger memberships_keep_admin before update or delete on public.memberships for each row execute function public.keep_one_admin();

-- Members may edit only these campaign/workspace columns; ids and ownership never move.
create or replace function public.guard_immutable() returns trigger
language plpgsql as $$
begin
  if new.id <> old.id or (tg_table_name = 'campaigns' and (new.workspace_id <> old.workspace_id or new.created_by is distinct from old.created_by)) then
    raise exception 'id, workspace and creator cannot be changed';
  end if;
  return new;
end $$;
create trigger campaigns_guard before update on public.campaigns for each row execute function public.guard_immutable();

-- Accept a pending invite for the signed-in user's email (called after first sign-in).
create or replace function public.accept_invite() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv public.invites;
  uid uuid := auth.uid();
  mail text := lower(auth.jwt() ->> 'email');
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  if exists (select 1 from public.memberships where user_id = uid) then
    return (select workspace_id from public.memberships where user_id = uid);
  end if;
  select * into inv from public.invites where email = mail and status = 'pending' and expires_at > now()
  order by created_at desc limit 1;
  if inv.id is null then
    return null;
  end if;
  insert into public.memberships (workspace_id, user_id, email, full_name, role)
  values (inv.workspace_id, uid, mail, auth.jwt() -> 'user_metadata' ->> 'full_name', inv.role);
  update public.invites set status = 'accepted', accepted_at = now() where id = inv.id;
  return inv.workspace_id;
end $$;

-- ---------------------------------------------------------------- row-level security

alter table public.workspaces   enable row level security;
alter table public.memberships  enable row level security;
alter table public.invites      enable row level security;
alter table public.campaigns    enable row level security;
alter table public.integrations enable row level security;
alter table public.fx_rates     enable row level security;
alter table public.api_usage    enable row level security;
alter table public.audit_logs   enable row level security;

create policy ws_read  on public.workspaces for select to authenticated using (id = public.my_workspace());
create policy ws_admin on public.workspaces for update to authenticated
  using (id = public.my_workspace() and public.my_role() = 'admin') with check (id = public.my_workspace());

create policy mem_read  on public.memberships for select to authenticated using (workspace_id = public.my_workspace());
create policy mem_admin_update on public.memberships for update to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() = 'admin') with check (workspace_id = public.my_workspace());
create policy mem_admin_delete on public.memberships for delete to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() = 'admin');

create policy inv_admin on public.invites for all to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() = 'admin')
  with check (workspace_id = public.my_workspace() and public.my_role() = 'admin' and email = lower(email));

create policy cmp_read   on public.campaigns for select to authenticated using (workspace_id = public.my_workspace());
create policy cmp_insert on public.campaigns for insert to authenticated
  with check (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member') and created_by = auth.uid());
create policy cmp_update on public.campaigns for update to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'))
  with check (workspace_id = public.my_workspace());
create policy cmp_delete on public.campaigns for delete to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() = 'admin');

-- Everyone in the workspace sees which providers are configured (masked hint only). Writes go through
-- the server, which checks the admin role and encrypts the secret; browser sessions never see "secret".
create policy int_read on public.integrations for select to authenticated using (workspace_id = public.my_workspace());
revoke all on public.integrations from authenticated;
grant select (workspace_id, provider, hint, status, updated_by, updated_at) on public.integrations to authenticated;

create policy fx_read on public.fx_rates for select to authenticated using (true);

create policy usage_read on public.api_usage for select to authenticated using (workspace_id = public.my_workspace());
create policy audit_read on public.audit_logs for select to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() = 'admin');

-- Anonymous visitors get nothing; signed-in users only what the policies above allow.
revoke all on all tables in schema public from anon;
revoke insert, update, delete on public.fx_rates, public.api_usage, public.audit_logs from authenticated;
revoke execute on function public.accept_invite() from anon;
