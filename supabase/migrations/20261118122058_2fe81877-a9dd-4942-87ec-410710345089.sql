create or replace function public._adm_duty_view(_school uuid) returns boolean language sql stable security definer set search_path to 'public'
as $$ select case when _perm_owner(auth.uid(), school_org(_school)) then true else _ws_view(_school,'duty_rosters') end $$;
create or replace function public._adm_duty_manage(_school uuid) returns boolean language sql stable security definer set search_path to 'public'
as $$ select case when _perm_owner(auth.uid(), school_org(_school)) then true else _ws_ok(_school,'duty_rosters','edit') end $$;
create or replace function public._adm_duty_setup(_school uuid) returns boolean language sql stable security definer set search_path to 'public'
as $$ select case when _perm_owner(auth.uid(), school_org(_school)) then true else _ws_ok(_school,'duty_setup','edit') end $$;
create or replace function public._adm_duty_setup_view(_school uuid) returns boolean language sql stable security definer set search_path to 'public'
as $$ select case when _perm_owner(auth.uid(), school_org(_school)) then true else _ws_view(_school,'duty_setup') end $$;
alter table public.adm_duty_posts drop constraint adm_duty_posts_kind_check;
alter table public.adm_duty_posts add constraint adm_duty_posts_kind_check check (kind = any (array['break','gate','corridor','prayer','bus','classroom','other']));