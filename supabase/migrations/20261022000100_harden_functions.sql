-- Security advisor fixes: pin search_path on trigger helpers and limit who can call functions over the API.
alter function public.touch_updated_at() set search_path = public;
alter function public.guard_immutable() set search_path = public;

-- Trigger functions run as part of table writes and never need to be callable directly.
revoke execute on function public.audit_change(), public.keep_one_admin(), public.touch_updated_at(), public.guard_immutable()
  from public, anon, authenticated;

-- RLS helpers and invite acceptance are for signed-in users only.
revoke execute on function public.my_workspace(), public.my_role(), public.accept_invite() from public, anon;
grant execute on function public.my_workspace(), public.my_role(), public.accept_invite() to authenticated;
