create or replace function public._perm_staff(_org uuid, _user uuid)
 returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists(select 1 from memberships m where m.org_id=_org and m.user_id=_user and m.role not in ('student','guardian')
    and (m.is_active or exists(select 1 from account_setup a where a.user_id=_user and a.completed_at is null and m.id = any(coalesce(a.restore_ids, array[a.membership_id])))))
$function$;