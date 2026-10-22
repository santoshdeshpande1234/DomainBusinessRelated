-- Phase 3: competitor analysis, financial models and website previews, all per selected prospect.
--
-- Competitors are observations (listing facts and website checks with their source and time).
-- Financial models store the inputs with how each was obtained (actual, benchmark or assumption)
-- and a snapshot of the results the code computed from them. Previews are content drafts shown on a
-- private staging link; a share link works only after a member turns it on.

create table public.competitors (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  prospect_id  uuid not null references public.prospects (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 200),
  category     text,
  address      text,
  city         text,
  website      text,
  website_host text,
  phone        text,
  reviews      integer check (reviews >= 0),
  rating       numeric check (rating between 0 and 5),
  origin       text not null check (origin in ('campaign', 'google_places', 'manual')),
  origin_ref   text,
  origin_url   text,
  detail       jsonb not null default '{}'::jsonb,  -- e.g. search query and position, with the date seen
  audit        jsonb,
  audited_at   timestamptz,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create unique index competitors_unique_host on public.competitors (prospect_id, website_host) where website_host is not null;
create unique index competitors_unique_ref on public.competitors (prospect_id, origin_ref) where origin_ref is not null;
create index competitors_campaign_idx on public.competitors (campaign_id);

create table public.financial_models (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  prospect_id  uuid not null unique references public.prospects (id) on delete cascade,
  model        text not null default 'lead_gen' check (model in ('lead_gen', 'ecommerce')),
  inputs       jsonb not null default '{}'::jsonb,   -- { key: { value, basis: actual|benchmark|assumption, source_url, note } }
  results      jsonb not null default '{}'::jsonb,   -- computed by the app; never typed in
  confidence   integer check (confidence between 0 and 100),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.website_previews (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  campaign_id   uuid not null references public.campaigns (id) on delete cascade,
  prospect_id   uuid not null unique references public.prospects (id) on delete cascade,
  domain_id     uuid references public.domains (id) on delete set null,  -- proposed, never implied to be owned
  token         text not null unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  status        text not null default 'draft' check (status in ('draft', 'ready', 'archived')),
  share_enabled boolean not null default false,
  theme         text not null default 'harbor',
  layout        text not null default 'split' check (layout in ('split', 'centered')),
  content       jsonb not null default '{}'::jsonb,
  created_by    uuid references auth.users (id) on delete set null,
  updated_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------- triggers

create trigger financial_models_touch before update on public.financial_models for each row execute function public.touch_updated_at();
create trigger website_previews_touch before update on public.website_previews for each row execute function public.touch_updated_at();

-- Children of a prospect must sit in that prospect's campaign; ids and parents never change.
create or replace function public.guard_prospect_child() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.prospect_id <> old.prospect_id) then
    raise exception 'prospect cannot be changed';
  end if;
  if not exists (select 1 from public.prospects p where p.id = new.prospect_id and p.campaign_id = new.campaign_id) then
    raise exception 'prospect does not belong to this campaign';
  end if;
  return new;
end $$;

create or replace function public.guard_preview_domain() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.domain_id is not null and not exists (select 1 from public.domains d where d.id = new.domain_id and d.campaign_id = new.campaign_id) then
    raise exception 'domain does not belong to this campaign';
  end if;
  if tg_op = 'UPDATE' and new.token <> old.token and new.share_enabled then
    raise exception 'turn sharing off before replacing the link';
  end if;
  return new;
end $$;

create trigger competitors_guard before insert or update on public.competitors for each row execute function public.guard_campaign_child();
create trigger competitors_guard_p before insert or update on public.competitors for each row execute function public.guard_prospect_child();
create trigger financial_models_guard before insert or update on public.financial_models for each row execute function public.guard_campaign_child();
create trigger financial_models_guard_p before insert or update on public.financial_models for each row execute function public.guard_prospect_child();
create trigger website_previews_guard before insert or update on public.website_previews for each row execute function public.guard_campaign_child();
create trigger website_previews_guard_p before insert or update on public.website_previews for each row execute function public.guard_prospect_child();
create trigger website_previews_guard_d before insert or update on public.website_previews for each row execute function public.guard_preview_domain();

-- Audit what changes a decision: model inputs, and a preview's status, sharing and link.
create trigger financial_models_audit after insert or update of inputs, model on public.financial_models for each row execute function public.audit_change();
create trigger website_previews_audit after insert or update of status, share_enabled, token, domain_id on public.website_previews for each row execute function public.audit_change();

revoke execute on function public.guard_prospect_child(), public.guard_preview_domain() from public, anon, authenticated;

-- ---------------------------------------------------------------- row-level security

alter table public.competitors      enable row level security;
alter table public.financial_models enable row level security;
alter table public.website_previews enable row level security;

create policy cmp_read on public.competitors for select to authenticated using (workspace_id = public.my_workspace());
create policy cmp_write on public.competitors for insert to authenticated
  with check (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'));
create policy cmp_update on public.competitors for update to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'))
  with check (workspace_id = public.my_workspace());
create policy cmp_delete on public.competitors for delete to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'));

create policy fin_read on public.financial_models for select to authenticated using (workspace_id = public.my_workspace());
create policy fin_write on public.financial_models for insert to authenticated
  with check (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'));
create policy fin_update on public.financial_models for update to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'))
  with check (workspace_id = public.my_workspace());
create policy fin_delete on public.financial_models for delete to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'));

create policy web_read on public.website_previews for select to authenticated using (workspace_id = public.my_workspace());
create policy web_write on public.website_previews for insert to authenticated
  with check (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'));
create policy web_update on public.website_previews for update to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'))
  with check (workspace_id = public.my_workspace());
create policy web_delete on public.website_previews for delete to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'));

revoke all on public.competitors, public.financial_models, public.website_previews from anon;
revoke truncate, trigger, references on public.competitors, public.financial_models, public.website_previews from authenticated;
