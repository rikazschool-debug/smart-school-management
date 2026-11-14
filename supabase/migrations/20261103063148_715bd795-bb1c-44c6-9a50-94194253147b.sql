create or replace function public.my_link_pending() returns boolean language sql stable security definer set search_path to 'public' as $$
  select auth.uid() is not null and not exists(select 1 from memberships m where m.user_id=auth.uid() and m.is_active)
    and (exists(select 1 from account_setup a where a.user_id=auth.uid())
      or exists(select 1 from auth.users u where u.id=auth.uid() and coalesce(u.email,'')=''))
$$;
revoke all on function public.my_link_pending() from public, anon;
grant execute on function public.my_link_pending() to authenticated;

create or replace function public.create_organization(_org_name text, _school_name text)
 returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare oid uuid; sid uuid;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول'; end if;
  if exists(select 1 from account_setup a where a.user_id=auth.uid())
     or exists(select 1 from auth.users u where u.id=auth.uid() and coalesce(u.email,'')='') then
    raise exception 'هذا الحساب أنشأته المدرسة ولا يمكنه تسجيل مؤسسة. تواصل مع الإدارة لاستكمال الربط';
  end if;
  if coalesce(trim(_org_name),'')='' or coalesce(trim(_school_name),'')='' then raise exception 'اسم المؤسسة والمدرسة مطلوبان'; end if;
  insert into organizations(name, created_by) values (trim(_org_name), auth.uid()) returning id into oid;
  insert into memberships(user_id, org_id, role) values (auth.uid(), oid, 'org_owner');
  insert into schools(org_id, name) values (oid, trim(_school_name)) returning id into sid;
  return oid;
end $function$;