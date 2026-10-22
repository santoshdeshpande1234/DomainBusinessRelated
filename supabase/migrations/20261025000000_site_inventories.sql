-- What a prospect's own website contains, page by page: the source inventory the proposed website is
-- built from. Additive only. Content is text extracted from public pages, kept with its URL; it is
-- internal research and is never served to client-facing pages as-is.

-- The blueprint of the last generation: each original page's outcome and where each Growth Plan item is built.
alter table public.website_previews add column blueprint jsonb;

create table public.site_inventories (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  campaign_id  uuid not null references public.campaigns (id) on delete cascade,
  prospect_id  uuid not null unique references public.prospects (id) on delete cascade,
  status       text not null default 'crawling' check (status in ('crawling', 'complete')),
  inventory    jsonb not null default '{}'::jsonb,   -- { root, brand, pages: [{ url, kind, status, ... }], queue }
  crawled_at   timestamptz not null default now(),
  created_by   uuid references auth.users (id) on delete set null,
  updated_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger site_inventories_touch before update on public.site_inventories for each row execute function public.touch_updated_at();
create trigger site_inventories_guard before insert or update on public.site_inventories for each row execute function public.guard_campaign_child();
create trigger site_inventories_guard_p before insert or update on public.site_inventories for each row execute function public.guard_prospect_child();

alter table public.site_inventories enable row level security;

create policy inv_read on public.site_inventories for select to authenticated using (workspace_id = public.my_workspace());
create policy inv_write on public.site_inventories for insert to authenticated
  with check (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'));
create policy inv_update on public.site_inventories for update to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'))
  with check (workspace_id = public.my_workspace());
create policy inv_delete on public.site_inventories for delete to authenticated
  using (workspace_id = public.my_workspace() and public.my_role() in ('admin', 'member'));

revoke all on public.site_inventories from anon;
revoke truncate, trigger, references on public.site_inventories from authenticated;
