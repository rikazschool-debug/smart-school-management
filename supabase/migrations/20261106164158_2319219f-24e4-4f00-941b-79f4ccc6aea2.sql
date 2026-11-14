alter function public.perm_catalog() rename to _perm_catalog_v2;
revoke all on function public._perm_catalog_v2() from public, anon, authenticated;
create or replace function public.perm_catalog() returns jsonb language sql immutable set search_path to 'public' as $$
  select jsonb_set(jsonb_set(b, '{areas}', (b->'areas') || jsonb_build_array(jsonb_build_object('key','support','label','الدعم الفني والمساعدة'))),
    '{sections}', (b->'sections') || jsonb_build_array(
      jsonb_build_object('key','support','label','تذاكر الدعم الداخلية','parent','support',
        'actions',jsonb_build_array('view','create','assign','transfer','status','follow','followers','export','settings'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('view','عرض صندوق التذاكر','create','إنشاء تذكرة داخلية','assign','الإسناد وإعادة الإسناد','transfer','التحويل بين الفروع',
          'status','إدارة الحالات والمعالجة','follow','متابعة تذكرة بنفسه','followers','إدارة المتابعين','export','التصدير','settings','الإعدادات والتصنيفات'))))
  from (select _perm_catalog_v2() b) x $$;
grant execute on function public.perm_catalog() to authenticated;

alter function public._perm_base(uuid, uuid, text, text) rename to _perm_base_v2;
revoke all on function public._perm_base_v2(uuid, uuid, text, text) from public, anon, authenticated;
create or replace function public._perm_base(_school uuid, _uid uuid, _section text, _action text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select case when _section = 'support'
    then _action in ('view','create','assign','status','follow','followers','export') and _perm_has_role(_uid,_school,'{principal}')
    else _perm_base_v2(_school,_uid,_section,_action) end $$;
revoke all on function public._perm_base(uuid, uuid, text, text) from public, anon, authenticated;

create or replace function public._support_ok(_school uuid, _action text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select auth.uid() is not null and _school is not null
    and (is_org_owner(school_org(_school)) or _perm_allows_user(_school, auth.uid(), 'support', _action)) $$;

create or replace function public._support_tcan(_t support_tickets, _action text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select case when _t.id is null then false when _t.scope='platform' then is_platform_admin() else _support_ok(_t.school_id, _action) end $$;

create or replace function public._support_settings_ok(_org uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select is_org_owner(_org) or (exists(select 1 from schools s where s.org_id=_org and s.is_active)
    and not exists(select 1 from schools s where s.org_id=_org and s.is_active and not _perm_allows_user(s.id, auth.uid(), 'support', 'settings'))) $$;

create table public.support_followers (
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  user_id uuid not null,
  added_by uuid,
  created_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);
create index on public.support_followers(user_id);
grant all on public.support_followers to service_role;
alter table public.support_followers enable row level security;

create or replace function public._support_staff_live(_t support_tickets, _u uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select _u is not null and _t.scope='school' and exists(select 1 from memberships m where m.user_id=_u and m.is_active
    and ((m.school_id=_t.school_id and m.role not in ('student','guardian')) or (m.org_id=_t.org_id and m.role='org_owner'))) $$;

create or replace function public._support_is_follower(_t support_tickets) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select auth.uid() is not null and exists(select 1 from support_followers f where f.ticket_id=_t.id and f.user_id=auth.uid())
    and _support_staff_live(_t, auth.uid()) $$;

create or replace function public.support_manager(_t support_tickets) returns boolean
language sql stable security definer set search_path to 'public' as $$ select _support_tcan(_t, 'view') $$;

create or replace function public.support_can_read(_ticket uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from support_tickets t where t.id=_ticket and (t.requester=auth.uid() or support_manager(t)
    or (t.assignee=auth.uid() and t.scope='school' and exists(select 1 from memberships m where m.user_id=auth.uid() and m.org_id=t.org_id and m.is_active and m.role not in ('student','guardian')))
    or _support_is_follower(t))) $$;

create or replace function public.support_handler(_t support_tickets) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select _support_tcan(_t, 'status') or (_t.assignee=auth.uid() and support_can_read(_t.id)) $$;

create or replace function public._support_route_ok(_school uuid, _ticket uuid) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare t support_tickets; begin
  if auth.uid() is null or school_org(_school) is null then return false; end if;
  if _ticket is null then return _support_ok(_school, 'create'); end if;
  select * into t from support_tickets where id=_ticket;
  return t.id is not null and t.scope='school' and t.school_id=_school and _support_tcan(t, 'assign');
end $$;

create or replace function public._support_patch(_fn regprocedure, _pairs text[]) returns void language plpgsql set search_path to 'public' as $$
declare d text := pg_get_functiondef(_fn); i int; begin
  for i in 1..array_length(_pairs,1) by 2 loop
    if position(_pairs[i] in d) = 0 then raise exception 'patch % did not match: %', _fn, left(_pairs[i], 80); end if;
    d := replace(d, _pairs[i], _pairs[i+1]);
  end loop;
  execute d;
end $$;

select _support_patch('public.support_action(uuid,text,integer,text,text)'::regprocedure, array[
  'if not mgr or t.status not in (''new'',''waiting_internal'',''in_progress'') then',
  'if not _support_tcan(t,''assign'') or t.status not in (''new'',''waiting_internal'',''in_progress'') then',
  'if not mgr or t.scope<>''school'' or t.status in (''resolved'',''closed'',''cancelled'') then raise exception ''إجراء غير متاح''; end if;
    nu :=',
  'if not _support_tcan(t,''assign'') or t.scope<>''school'' or t.status in (''resolved'',''closed'',''cancelled'') then raise exception ''إجراء غير متاح''; end if;
    nu :=',
  'if not is_org_owner(t.org_id) or t.scope<>''school'' or t.status in (''closed'',''cancelled'') then raise exception ''التحويل بين الفروع لمالك المؤسسة فقط''; end if;',
  'if t.scope<>''school'' or t.status in (''closed'',''cancelled'') or not _support_tcan(t,''transfer'') then raise exception ''لا تملك صلاحية التحويل بين الفروع'' using errcode=''42501''; end if;',
  'if ns is null or ns=t.school_id',
  'if ns is not null and not (is_org_owner(t.org_id) or _support_ok(ns,''transfer'')) then raise exception ''لا تملك صلاحية التحويل إلى هذا الفرع'' using errcode=''42501''; end if;
    if ns is null or ns=t.school_id',
  'mgr := support_manager(t);', 'mgr := _support_tcan(t,''status'');'
]);

select _support_patch('public.support_reply(uuid,text,text)'::regprocedure, array[
  'if t.id is null or not support_can_read(_ticket) then raise exception ''غير مصرح''; end if;',
  'if t.id is null or not support_can_read(_ticket) then raise exception ''غير مصرح''; end if;
  if not (t.requester=auth.uid() or support_handler(t)) then raise exception ''الرد لمقدم الطلب ومعالجي التذكرة فقط؛ المتابعة للاطلاع فقط'' using errcode=''42501''; end if;',
  'mgr := support_manager(t) or t.assignee=auth.uid();', 'mgr := support_handler(t);'
]);

select _support_patch('public.create_support_file(uuid,text,text,bigint)'::regprocedure, array[
  'if t.id is null or not support_can_read(_ticket) or t.status',
  'if t.id is null or not support_can_read(_ticket) or not (t.requester=auth.uid() or support_handler(t)) or t.status'
]);

select _support_patch('public.support_set_department(uuid,uuid,integer)'::regprocedure, array[
  'not support_manager(t)', 'not _support_tcan(t,''assign'')'
]);

select _support_patch('public.support_dept_options(uuid)'::regprocedure, array[
  '(is_org_owner(s.org_id) or has_school_role(s.id, array[''principal'']::app_role[]))', '_support_ok(s.id,''view'')'
]);

select _support_patch('public.support_open(uuid,text,text,text,uuid,uuid,text,uuid,uuid[])'::regprocedure, array[
  'if is_org_owner(org) then r := ''org_owner'';
  elsif has_school_role(_school, array[''principal'']::app_role[]) then r := ''principal'';
  else raise exception ''إنشاء التذاكر الموجّهة لمالك المجموعة ومدير المدرسة''; end if;',
  'if not _support_ok(_school, ''create'') then raise exception ''لا تملك صلاحية إنشاء تذكرة داخلية لهذا الفرع'' using errcode=''42501''; end if;
  if is_org_owner(org) then r := ''org_owner'';
  else r := coalesce((select m.role::text from memberships m where m.user_id=auth.uid() and m.school_id=_school and m.is_active order by (m.role=''principal'') desc limit 1),
    (select m.role::text from memberships m where m.user_id=auth.uid() and m.org_id=org and m.is_active limit 1), ''staff''); end if;'
]);

select _support_patch('public.support_save_settings(uuid,text,integer,integer[],time without time zone,time without time zone,jsonb,uuid)'::regprocedure, array[
  '(_org is not null and not is_org_owner(_org))', '(_org is not null and not _support_settings_ok(_org))'
]);
select _support_patch('public.support_save_category(uuid,uuid,text,boolean)'::regprocedure, array[
  '(_org is not null and not is_org_owner(_org))', '(_org is not null and not _support_settings_ok(_org))'
]);

select _support_patch('public.support_list(text,uuid,text,text,text,uuid,date,date,integer,integer,uuid,uuid)'::regprocedure, array[
  'when ''manage'' then', 'when ''following'' then _support_is_follower(t) and t.requester<>auth.uid()
      when ''manage'' then'
]);

select _support_patch('public.support_get(uuid)'::regprocedure, array[
  '''can'', jsonb_build_object(''manage'', mgr,',
  '''can'', jsonb_build_object(''view'', mgr, ''manage'', _support_tcan(t,''status''), ''reply'', t.requester=auth.uid() or h, ''attach'', t.requester=auth.uid() or h,
      ''followers'', t.scope=''school'' and _support_tcan(t,''followers''), ''follow'', t.scope=''school'' and _support_tcan(t,''follow'') and _support_staff_live(t, auth.uid()),
      ''following'', _support_is_follower(t), ''export'', _support_tcan(t,''export''),',
  '''assign'', mgr and t.scope=''school'', ''transfer'', t.scope=''school'' and is_org_owner(t.org_id),',
  '''assign'', t.scope=''school'' and _support_tcan(t,''assign''), ''transfer'', t.scope=''school'' and _support_tcan(t,''transfer''),',
  '''reopen_days'',',
  '''follower_list'', coalesce((select jsonb_agg(jsonb_build_object(''user_id'', f.user_id, ''name'', coalesce(p.full_name,''—''), ''role'',
        (select m.role::text from memberships m where m.user_id=f.user_id and m.is_active and (m.school_id=t.school_id or (m.org_id=t.org_id and m.role=''org_owner'')) order by (m.school_id=t.school_id) desc limit 1),
        ''added_at'', f.created_at) order by f.created_at)
      from support_followers f left join profiles p on p.id=f.user_id where f.ticket_id=t.id and _support_staff_live(t, f.user_id)), ''[]''),
    ''reopen_days'','
]);

drop function public._support_patch(regprocedure, text[]);

create or replace function public.support_follower_candidates(_ticket uuid, _q text default null)
returns table(user_id uuid, name text, role text, school_name text, dept_name text)
language plpgsql stable security definer set search_path to 'public' as $$
declare t support_tickets; q text := nullif(btrim(coalesce(_q,'')),''); begin
  select * into t from support_tickets where id=_ticket;
  if t.id is null or t.scope<>'school' or not _support_tcan(t,'followers') then raise exception 'غير مصرح' using errcode='42501'; end if;
  if q is not null then q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_'); end if;
  return query
    select distinct on (m.user_id) m.user_id, coalesce(p.full_name,'—')::text, m.role::text, s.name::text, dd.name::text
    from memberships m join schools s on s.id=m.school_id left join profiles p on p.id=m.user_id
      left join teachers tt on tt.user_id=m.user_id and tt.school_id=m.school_id
      left join departments dd on dd.id=coalesce(m.department_id, tt.department_id)
    where m.school_id=t.school_id and m.is_active and m.role not in ('student','guardian')
      and m.user_id<>t.requester and m.user_id is distinct from t.assignee
      and not exists(select 1 from support_followers f where f.ticket_id=t.id and f.user_id=m.user_id)
      and (q is null or p.full_name ilike '%'||q||'%')
    order by m.user_id limit 50;
end $$;

create or replace function public.support_set_follower(_ticket uuid, _user uuid, _on boolean) returns void
language plpgsql security definer set search_path to 'public' as $$
declare t support_tickets; nm text; begin
  select * into t from support_tickets where id=_ticket for update;
  if t.id is null or t.scope<>'school' or not support_can_read(_ticket) then raise exception 'غير مصرح' using errcode='42501'; end if;
  if _user is null then raise exception 'اختر الشخص'; end if;
  nm := (select full_name from profiles where id=_user);
  if _on then
    if not (_support_tcan(t,'followers') or (_user=auth.uid() and _support_tcan(t,'follow'))) then raise exception 'لا تملك صلاحية إدارة المتابعين' using errcode='42501'; end if;
    if t.status in ('closed','cancelled') then raise exception 'التذكرة مغلقة'; end if;
    if _user=t.requester then raise exception 'مقدم الطلب يطّلع على تذكرته أصلًا'; end if;
    if _user is not distinct from t.assignee then raise exception 'المسؤول عن المعالجة ليس متابعًا'; end if;
    if not _support_staff_live(t, _user) then raise exception 'المتابع يجب أن يكون موظفًا نشطًا في فرع التذكرة'; end if;
    if exists(select 1 from support_followers f where f.ticket_id=_ticket and f.user_id=_user) then return; end if;
    insert into support_followers(ticket_id, user_id, added_by) values (_ticket, _user, auth.uid());
    update support_tickets set rev=rev+1, updated_at=now() where id=_ticket;
    perform _support_event(_ticket, 'follower_added', null, null, jsonb_build_object('name', nm));
    perform _support_notify_one(_user, t, 'أُضفت متابعًا لتذكرة دعم', '/app/support?t=' || t.id, 'follow:' || t.id || ':' || _user || ':' || (t.rev+1));
  else
    if not (_support_tcan(t,'followers') or _user=auth.uid()) then raise exception 'لا تملك صلاحية إدارة المتابعين' using errcode='42501'; end if;
    delete from support_followers f where f.ticket_id=_ticket and f.user_id=_user;
    if not found then return; end if;
    update support_tickets set rev=rev+1, updated_at=now() where id=_ticket;
    perform _support_event(_ticket, 'follower_removed', null, null, jsonb_build_object('name', nm));
  end if;
end $$;

create or replace function public._support_follow_notify_trg() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare t support_tickets; u uuid; ttl text; begin
  if new.action not in ('reply','resolve','close','confirm','reopen','cancel','transfer','assign','claim','in_progress','waiting_requester','waiting_internal') then return new; end if;
  select * into t from support_tickets where id=new.ticket_id;
  if t.id is null or t.scope<>'school' then return new; end if;
  ttl := case new.action when 'reply' then 'رد جديد على تذكرة تتابعها' when 'resolve' then 'حُلّت تذكرة تتابعها' when 'close' then 'أُغلقت تذكرة تتابعها'
    when 'confirm' then 'أُغلقت تذكرة تتابعها' when 'reopen' then 'أُعيد فتح تذكرة تتابعها' when 'cancel' then 'أُلغيت تذكرة تتابعها'
    when 'transfer' then 'حُوّلت تذكرة تتابعها إلى فرع آخر' when 'assign' then 'تغيّر المسؤول عن تذكرة تتابعها' else 'تغيّرت حالة تذكرة تتابعها' end;
  for u in select f.user_id from support_followers f where f.ticket_id=t.id loop
    if _support_staff_live(t, u) then
      perform _support_notify_one(u, t, ttl, '/app/support?t=' || t.id, 'sfollow:' || new.id || ':' || u);
    end if;
  end loop;
  return new;
end $$;
create trigger support_follow_notify after insert on public.support_events for each row execute function public._support_follow_notify_trg();

create or replace function public._support_follow_transfer_trg() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare r record; begin
  for r in select f.user_id, p.full_name from support_followers f left join profiles p on p.id=f.user_id
    where f.ticket_id=new.id and not _support_staff_live(new, f.user_id) loop
    delete from support_followers where ticket_id=new.id and user_id=r.user_id;
    insert into support_events(ticket_id, actor, action, details) values (new.id, auth.uid(), 'follower_removed', jsonb_build_object('name', r.full_name, 'reason', 'لم يعد ضمن فرع التذكرة بعد التحويل'));
  end loop;
  return new;
end $$;
create trigger support_follow_transfer after update of school_id on public.support_tickets for each row when (new.school_id is distinct from old.school_id)
  execute function public._support_follow_transfer_trg();

create or replace function public.support_caps(_org uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare a text; res jsonb := '{}'; begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  foreach a in array array['view','create','assign','transfer','status','follow','followers','export'] loop
    res := res || jsonb_build_object(a, coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name)
      from schools s where s.org_id=_org and s.is_active and _support_ok(s.id, a)), '[]'));
  end loop;
  return res || jsonb_build_object('settings', _support_settings_ok(_org), 'owner', is_org_owner(_org),
    'following', (select count(*) from support_followers f join support_tickets t on t.id=f.ticket_id where f.user_id=auth.uid() and t.org_id=_org));
end $$;

do $$ declare f text; begin
  foreach f in array array['_support_ok(uuid,text)','_support_tcan(support_tickets,text)','_support_settings_ok(uuid)','_support_staff_live(support_tickets,uuid)',
    '_support_is_follower(support_tickets)','_support_follow_notify_trg()','_support_follow_transfer_trg()'] loop
    execute 'revoke all on function public.' || f || ' from public, anon, authenticated';
  end loop;
  foreach f in array array['support_follower_candidates(uuid,text)','support_set_follower(uuid,uuid,boolean)','support_caps(uuid)'] loop
    execute 'revoke all on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
end $$;