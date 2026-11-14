-- Support desk is run by the platform owner: every ticket (any role, any org) goes straight to platform admins, who route/assign it.
-- Only the requester, platform admins, the assignee and followers read a ticket; school managers no longer manage tickets.
create or replace function public._support_ok(_school uuid, _action text) returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and _school is not null
    and (is_platform_admin()
         or (_action = 'create' and (is_org_owner(school_org(_school)) or _perm_allows_user(_school, auth.uid(), 'support', _action))))
$$;
create or replace function public._support_tcan(_t support_tickets, _action text) returns boolean language sql stable security definer set search_path=public as $$
  select _t.id is not null and is_platform_admin()
$$;
create or replace function public._support_notify(_t support_tickets, _to_managers boolean, _kind text, _title text, _key text) returns void language plpgsql security definer set search_path=public as $$
declare u uuid; begin
  if _to_managers then
    for u in select pa.user_id from platform_admins pa union select _t.assignee where _t.assignee is not null loop
      if u <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) then
        perform _notify(u, _t.school_id, 'support', _title, 'تذكرة ' || _t.ref, '/app/support?t=' || _t.id, _key || ':' || _t.id);
      end if;
    end loop;
  elsif _t.requester <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) then
    perform _notify(_t.requester, _t.school_id, 'support', _title, 'تذكرة ' || _t.ref, '/app/support?t=' || _t.id, _key || ':' || _t.id);
  end if;
end $$;
-- Assignee of any ticket scope may read (and, via support_handler, reply and change status).
create or replace function public.support_can_read(_ticket uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from support_tickets t where t.id=_ticket and (t.requester=auth.uid() or support_manager(t)
    or (t.assignee=auth.uid() and exists(select 1 from memberships m where m.user_id=auth.uid() and m.org_id=t.org_id and m.is_active and m.role not in ('student','guardian')))
    or _support_is_follower(t)))
$$;