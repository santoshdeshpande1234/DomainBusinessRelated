-- Website studio growth plans. Additive only: existing previews keep working without a plan.
--
-- "plan" is the internal gap-to-growth plan with its evidence (it can name competitors), so it is never
-- sent to client-facing pages; the client-safe part lives in "content". "generation" records the stages
-- of the last generation run. Versions are snapshots taken before a rebuild, refinement or edit.

alter table public.website_previews
  add column plan       jsonb,
  add column generation jsonb not null default '{}'::jsonb;  -- { result, stages: [{ key, status, note }], finished_at }

create table public.website_preview_versions (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  preview_id   uuid not null references public.website_previews (id) on delete cascade,
  version      integer not null check (version > 0),
  reason       text not null check (char_length(reason) between 1 and 200),
  content      jsonb not null,
  theme        text not null,
  layout       text not null,
  plan         jsonb,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (preview_id, version)
);
create index website_preview_versions_preview_idx on public.website_preview_versions (preview_id, version desc);

-- A version must belong to a preview in the same campaign.
create or replace function public.guard_preview_version() returns trigger
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from public.website_previews w where w.id = new.preview_id and w.campaign_id = new.campaign_id) then
    raise exception 'preview does not belong to this campaign';
  end if;
  return new;
end $$;

create trigger website_preview_versions_guard before insert on public.website_preview_versions for each row execute function public.guard_campaign_child();
create trigger website_preview_versions_guard_w before insert on public.website_preview_versions for each row execute function public.guard_preview_version();
revoke execute on function public.guard_preview_version() from public, anon, authenticated;

alter table public.website_preview_versions enable row level security;

-- Versions are append-only snapshots; members may prune old ones.
create policy wpv_read on public.website_preview_versions for select to authenticated using (workspace_id = public.my_workspace());
create policy wpv_write on public.website_preview_versions for insert to authenticated
  with check (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member') and created_by = auth.uid());
create policy wpv_delete on public.website_preview_versions for delete to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'));

revoke all on public.website_preview_versions from anon;
revoke update, truncate, trigger, references on public.website_preview_versions from authenticated;
