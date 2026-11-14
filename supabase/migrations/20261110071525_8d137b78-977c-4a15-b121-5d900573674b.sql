create table public.platform_notices (
  id uuid primary key default gen_random_uuid(),
  client_key text not null unique,
  title text not null,
  body text not null,
  scope text not null,
  org_ids uuid[] not null default '{}',
  school_ids uuid[] not null default '{}',
  roles text[] not null default '{}',
  recipients int not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now()
);
grant all on public.platform_notices to service_role;
alter table public.platform_notices enable row level security;

create or replace function public.platform_notice_send(_key text, _title text, _body text, _scope text, _orgs uuid[], _schools uuid[], _roles text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare _id uuid; _n int := 0; r record; _ex public.platform_notices;
begin
  if not public.is_platform_admin() then raise exception 'غير مسموح' using errcode = '42501'; end if;
  select * into _ex from public.platform_notices where client_key = _key;
  if found then return jsonb_build_object('id', _ex.id, 'recipients', _ex.recipients); end if;
  _title := btrim(coalesce(_title,'')); _body := btrim(coalesce(_body,''));
  if length(_title) < 2 or length(_title) > 150 then raise exception 'العنوان مطلوب (حتى 150 حرفًا)'; end if;
  if length(_body) < 2 or length(_body) > 2000 then raise exception 'نص الإشعار مطلوب (حتى 2000 حرف)'; end if;
  if _scope not in ('all','orgs','schools') then raise exception 'نطاق غير صالح'; end if;
  if _scope = 'orgs' and coalesce(array_length(_orgs,1),0) = 0 then raise exception 'اختر مجموعة واحدة على الأقل'; end if;
  if _scope = 'schools' and coalesce(array_length(_schools,1),0) = 0 then raise exception 'اختر فرعًا واحدًا على الأقل'; end if;
  if coalesce(array_length(_roles,1),0) = 0 then raise exception 'اختر فئة مستلمين واحدة على الأقل'; end if;
  insert into public.platform_notices(client_key,title,body,scope,org_ids,school_ids,roles,created_by)
  values (_key,_title,_body,_scope,coalesce(_orgs,'{}'),coalesce(_schools,'{}'),_roles,auth.uid()) returning id into _id;
  for r in
    select distinct on (m.user_id) m.user_id, m.school_id
    from public.memberships m
    left join public.schools s on s.id = m.school_id
    where m.is_active and m.role::text = any(_roles)
      and (s.id is null or s.is_active)
      and case _scope
        when 'all' then true
        when 'orgs' then m.org_id = any(_orgs)
        else (m.school_id = any(_schools) or (m.school_id is null and m.role = 'org_owner' and m.org_id in (select org_id from public.schools where id = any(_schools))))
      end
    order by m.user_id, m.school_id nulls last
  loop
    perform public._notify(r.user_id, r.school_id, 'platform_notice', _title, _body, '/app/notifications', 'pn:' || _id);
    _n := _n + 1;
  end loop;
  update public.platform_notices set recipients = _n where id = _id;
  return jsonb_build_object('id', _id, 'recipients', _n);
end $$;

create or replace function public.platform_notices_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'غير مسموح' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc) from (select * from public.platform_notices order by created_at desc limit 50) n), '[]'::jsonb);
end $$;

revoke all on function public.platform_notice_send(text,text,text,text,uuid[],uuid[],text[]) from public, anon;
revoke all on function public.platform_notices_list() from public, anon;
grant execute on function public.platform_notice_send(text,text,text,text,uuid[],uuid[],text[]) to authenticated;
grant execute on function public.platform_notices_list() to authenticated;