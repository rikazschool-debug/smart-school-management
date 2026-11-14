create or replace function public._support_route_ok(_school uuid, _ticket uuid) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare t support_tickets; begin
  if auth.uid() is null or school_org(_school) is null then return false; end if;
  if _ticket is null then return _support_ok(_school, 'create'); end if;
  select * into t from support_tickets where id=_ticket;
  if t.id is null or t.scope<>'school' or not _support_tcan(t, 'assign') then return false; end if;
  if t.school_id=_school then return true; end if;
  -- another branch: explicit cross-branch assignment, needs the referral (transfer) right
  return school_org(_school)=t.org_id and exists(select 1 from schools s where s.id=_school and s.is_active)
    and (is_org_owner(t.org_id) or _support_ok(_school,'transfer'));
end $$;

create or replace function public._support_assign_target(t support_tickets, _uid uuid) returns text
language sql stable security definer set search_path=public as $$
  -- 'same' = active staff of the ticket branch; 'cross' = active staff of another active branch the caller may refer to; null = not allowed
  select case
    when exists(select 1 from memberships m where m.user_id=_uid and m.school_id=t.school_id and m.is_active and m.role not in ('student','guardian','org_owner')) then 'same'
    when exists(select 1 from memberships m join schools s on s.id=m.school_id and s.is_active
                where m.user_id=_uid and s.org_id=t.org_id and m.is_active and m.role not in ('student','guardian','org_owner')
                  and (is_org_owner(t.org_id) or _support_ok(m.school_id,'transfer'))) then 'cross'
  end $$;
revoke all on function public._support_assign_target(support_tickets, uuid) from public, anon, authenticated;

create or replace function public._support_patch(_fn regprocedure, _pairs text[]) returns void language plpgsql set search_path=public as $p$
declare d text := pg_get_functiondef(_fn); i int; begin
  for i in 1..array_length(_pairs,1) by 2 loop
    if position(_pairs[i] in d) = 0 then raise exception 'patch % did not match: %', _fn, left(_pairs[i], 80); end if;
    d := replace(d, _pairs[i], _pairs[i+1]);
  end loop;
  execute d;
end $p$;

select _support_patch('public.support_action(uuid,text,integer,text,text)'::regprocedure, array[
  'if nu is not null and not exists(select 1 from _people_pool(''support_assign'', t.school_id, null, t.id) p where p.user_id=nu) then
      raise exception ''لا يمكن الإسناد لهذا الشخص (خارج المؤسسة أو موقوف)''; end if;',
  'if nu is not null and nu = t.requester then raise exception ''لا يُسند الطلب لمقدّمه''; end if;
    if nu is not null and _support_assign_target(t, nu) is null then
      raise exception ''لا يمكن الإسناد لهذا الشخص: خارج الفرع ولا تملك صلاحية الإحالة لفرعه، أو الحساب موقوف'' using errcode=''42501''; end if;
    if nu is not null and _support_assign_target(t, nu) = ''cross'' then
      d := d || jsonb_build_object(''cross_branch'', true, ''to_school'', (select string_agg(distinct s.name, ''، '') from memberships m join schools s on s.id=m.school_id
        where m.user_id=nu and m.is_active and s.org_id=t.org_id and s.id<>t.school_id)); end if;'
]);
drop function public._support_patch(regprocedure, text[]);