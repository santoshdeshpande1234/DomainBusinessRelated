-- Phase 4: proposals and outreach email drafts, one per selected prospect. Additive only.
--
-- "content" is the client-facing proposal; "emails" are drafts that are never sent from here (sending and
-- approvals arrive in Phase 5); "checks" are internal notes (what's missing before "ready", mismatches with
-- the financial model). Versions are snapshots taken before a rebuild or an edit.

create table public.proposals (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  prospect_id  uuid not null unique references public.prospects (id) on delete cascade,
  status       text not null default 'draft' check (status in ('draft', 'ready', 'archived')),
  content      jsonb not null default '{}'::jsonb,
  emails       jsonb not null default '[]'::jsonb,
  checks       jsonb not null default '{}'::jsonb,
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index proposals_campaign_idx on public.proposals (campaign_id);

create table public.proposal_versions (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  proposal_id  uuid not null references public.proposals (id) on delete cascade,
  version      integer not null check (version > 0),
  reason       text not null check (char_length(reason) between 1 and 200),
  content      jsonb not null,
  emails       jsonb not null,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (proposal_id, version)
);
create index proposal_versions_proposal_idx on public.proposal_versions (proposal_id, version desc);

create or replace function public.guard_proposal_version() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.proposals p where p.id = new.proposal_id and p.campaign_id = new.campaign_id) then
    raise exception 'proposal does not belong to this campaign';
  end if;
  return new;
end $$;

create trigger proposals_touch before update on public.proposals for each row execute function public.touch_updated_at();
create trigger proposals_guard before insert or update on public.proposals for each row execute function public.guard_campaign_child();
create trigger proposals_guard_p before insert or update on public.proposals for each row execute function public.guard_prospect_child();
create trigger proposals_audit after insert or update of status on public.proposals for each row execute function public.audit_change();
create trigger proposal_versions_guard before insert on public.proposal_versions for each row execute function public.guard_campaign_child();
create trigger proposal_versions_guard_p before insert on public.proposal_versions for each row execute function public.guard_proposal_version();
revoke execute on function public.guard_proposal_version() from public, anon, authenticated;

alter table public.proposals         enable row level security;
alter table public.proposal_versions enable row level security;

create policy prop_read on public.proposals for select to authenticated using (workspace_id = public.my_workspace());
create policy prop_write on public.proposals for insert to authenticated
  with check (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'));
create policy prop_update on public.proposals for update to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'))
  with check (workspace_id = public.my_workspace());
create policy prop_delete on public.proposals for delete to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'));

-- Versions are append-only snapshots; members may prune old ones.
create policy propv_read on public.proposal_versions for select to authenticated using (workspace_id = public.my_workspace());
create policy propv_write on public.proposal_versions for insert to authenticated
  with check (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member') and created_by = auth.uid());
create policy propv_delete on public.proposal_versions for delete to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'));

revoke all on public.proposals, public.proposal_versions from anon;
revoke truncate, trigger, references on public.proposals from authenticated;
revoke update, truncate, trigger, references on public.proposal_versions from authenticated;
