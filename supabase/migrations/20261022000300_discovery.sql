-- Phase 2: domain discovery, prospect research and the evidence behind every score.
--
-- Every fact shown in the app is either a row in "evidence" (with its source URL and the time it was
-- observed) or a value the user typed in. Nothing is purchased or contacted from these tables.
-- Rows follow the campaign's workspace; members and admins write, viewers read.

create table public.domains (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  campaign_id      uuid not null references public.campaigns (id) on delete cascade,
  name             text not null check (name = lower(name) and name ~ '^[a-z0-9-]{1,63}(\.[a-z0-9-]{2,63})+$'),
  tld              text not null,
  origin           text not null check (origin in ('generated', 'manual')),
  keywords         text[] not null default '{}',
  -- Registry status from RDAP. "unregistered" means the registry has no record; only a registrar can
  -- confirm the name is actually purchasable (premium and reserved names exist).
  registry_status  text not null default 'unchecked'
                   check (registry_status in ('unchecked', 'registered', 'unregistered', 'unsupported', 'error')),
  registry_checked_at timestamptz,
  registry_source  text,
  price            numeric check (price >= 0),
  renewal_price    numeric check (renewal_price >= 0),
  price_currency   text,
  price_source     text,
  price_checked_at timestamptz,
  score            integer check (score between 0 and 100),
  confidence       integer check (confidence between 0 and 100),
  score_detail     jsonb not null default '{}'::jsonb,
  status           text not null default 'candidate' check (status in ('candidate', 'shortlisted', 'approved', 'rejected')),
  notes            text,
  created_by       uuid references auth.users (id) on delete set null,
  updated_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (campaign_id, name)
);
create index domains_campaign_score_idx on public.domains (campaign_id, score desc nulls last);

create table public.prospects (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  campaign_id    uuid not null references public.campaigns (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 200),
  category       text,
  address        text,
  city           text,
  region         text,
  country        text,
  website        text,
  website_host   text,              -- normalised host, used for duplicate detection
  phone          text,
  email          text,              -- public business address, with its source in evidence
  contact_name   text,
  contact_role   text,
  origin         text not null check (origin in ('google_places', 'csv', 'manual')),
  origin_ref     text,              -- e.g. Google place id
  origin_url     text,
  dedupe_key     text not null,     -- normalised name + city, for businesses without a website
  audit          jsonb,
  audited_at     timestamptz,
  score          integer check (score between 0 and 100),
  confidence     integer check (confidence between 0 and 100),
  score_detail   jsonb not null default '{}'::jsonb,
  status         text not null default 'new' check (status in ('new', 'selected', 'excluded')),
  notes          text,
  created_by     uuid references auth.users (id) on delete set null,
  updated_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index prospects_unique_host on public.prospects (campaign_id, website_host) where website_host is not null;
create unique index prospects_unique_ref on public.prospects (campaign_id, origin, origin_ref) where origin_ref is not null;
create unique index prospects_unique_key on public.prospects (campaign_id, dedupe_key) where website_host is null;
create index prospects_campaign_score_idx on public.prospects (campaign_id, score desc nulls last);

-- One sourced fact about a domain or a prospect. "assumption" marks values that are estimates, not observations.
create table public.evidence (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  domain_id    uuid references public.domains (id) on delete cascade,
  prospect_id  uuid references public.prospects (id) on delete cascade,
  kind         text not null,
  label        text not null,
  value        text,
  detail       jsonb not null default '{}'::jsonb,
  source_name  text not null,
  source_url   text,
  assumption   boolean not null default false,
  observed_at  timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  check (num_nonnulls(domain_id, prospect_id) = 1)
);
create index evidence_domain_idx on public.evidence (domain_id) where domain_id is not null;
create index evidence_prospect_idx on public.evidence (prospect_id) where prospect_id is not null;

-- Server-side response cache for external lookups (registry, business search). Never readable by browsers.
create table public.research_cache (
  key          text primary key,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  provider     text not null,
  payload      jsonb not null,
  fetched_at   timestamptz not null default now(),
  expires_at   timestamptz not null
);
create index research_cache_expires_idx on public.research_cache (expires_at);

alter table public.api_usage add column campaign_id uuid references public.campaigns (id) on delete set null;
create index api_usage_campaign_idx on public.api_usage (campaign_id) where campaign_id is not null;

-- ---------------------------------------------------------------- triggers

create trigger domains_touch before update on public.domains for each row execute function public.touch_updated_at();
create trigger prospects_touch before update on public.prospects for each row execute function public.touch_updated_at();

-- Rows never move between workspaces or campaigns, and must belong to the campaign's workspace.
create or replace function public.guard_campaign_child() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.id <> old.id or new.workspace_id <> old.workspace_id or new.campaign_id <> old.campaign_id) then
    raise exception 'id, workspace and campaign cannot be changed';
  end if;
  if not exists (select 1 from public.campaigns c where c.id = new.campaign_id and c.workspace_id = new.workspace_id) then
    raise exception 'campaign does not belong to this workspace';
  end if;
  return new;
end $$;
create trigger domains_guard before insert or update on public.domains for each row execute function public.guard_campaign_child();
create trigger prospects_guard before insert or update on public.prospects for each row execute function public.guard_campaign_child();
create trigger evidence_guard before insert on public.evidence for each row execute function public.guard_campaign_child();

-- Audit decisions (status changes), not every rescore.
create trigger domains_audit after update of status on public.domains for each row execute function public.audit_change();
create trigger prospects_audit after update of status on public.prospects for each row execute function public.audit_change();

revoke execute on function public.guard_campaign_child() from public, anon, authenticated;

-- ---------------------------------------------------------------- row-level security

alter table public.domains        enable row level security;
alter table public.prospects      enable row level security;
alter table public.evidence       enable row level security;
alter table public.research_cache enable row level security;

create policy dom_read  on public.domains for select to authenticated using (workspace_id = public.my_workspace());
create policy dom_write on public.domains for insert to authenticated
  with check (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'));
create policy dom_update on public.domains for update to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'))
  with check (workspace_id = public.my_workspace());
create policy dom_delete on public.domains for delete to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'));

create policy pro_read  on public.prospects for select to authenticated using (workspace_id = public.my_workspace());
create policy pro_write on public.prospects for insert to authenticated
  with check (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'));
create policy pro_update on public.prospects for update to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'))
  with check (workspace_id = public.my_workspace());
create policy pro_delete on public.prospects for delete to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'));

-- Evidence is append-only for users; corrections are new rows.
create policy ev_read  on public.evidence for select to authenticated using (workspace_id = public.my_workspace());
create policy ev_write on public.evidence for insert to authenticated
  with check (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member') and created_by = auth.uid());

revoke all on public.research_cache from anon, authenticated;
revoke all on public.domains, public.prospects, public.evidence from anon;
revoke update, delete, truncate, trigger, references on public.evidence from authenticated;
revoke truncate, trigger, references on public.domains, public.prospects from authenticated;
