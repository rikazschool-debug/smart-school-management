alter function public.perm_catalog() rename to _perm_catalog_base;
revoke all on function public._perm_catalog_base() from public, anon, authenticated;
create or replace function public.perm_catalog() returns jsonb language sql immutable set search_path to 'public' as $$
  select jsonb_set(jsonb_set(b, '{areas}', (b->'areas') || jsonb_build_array(jsonb_build_object('key','comm_hub','label','الإشعارات والاجتماعات'))),
    '{sections}', (b->'sections') || jsonb_build_array(
      jsonb_build_object('key','notices','label','الإشعارات','parent','comm_hub','actions',jsonb_build_array('view','draft','send'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('view','عرض سجل الإشعارات المرسلة','draft','إنشاء المسودات وتعديلها','send','إرسال الإشعارات')),
      jsonb_build_object('key','hub_meetings','label','الاجتماعات (البوابة)','parent','comm_hub','actions',jsonb_build_array('view','create','publish','start','edit','manage','attend'),'scopes',jsonb_build_array('branch','org'),
        'labels',jsonb_build_object('view','عرض سجل الاجتماعات','create','إنشاء الاجتماعات (مسودة)','publish','النشر وإرسال الدعوات','start','بدء الاجتماع الأونلاين','edit','تعديل الموعد أو الإلغاء','manage','إدارة الجلسة (كتم، مشاركة، إخراج)','attend','تسجيل الحضور الفعلي'))))
  from (select _perm_catalog_base() b) x $$;
grant execute on function public.perm_catalog() to authenticated;

create or replace function public._perm_area(_section text) returns text language sql immutable set search_path to 'public' as $$
  select case when _section='procurement' then 'finance' when _section='meetings' then 'school_admin'
              when _section in ('maint_school','maint_bus') then 'operations' when _section='admissions' then 'admissions'
              when _section in ('notices','hub_meetings') then 'comm_hub'
              when _section like 'ev\_%' then 'evaluation' when _section like 'hr\_%' then 'hr' else null end $$;

create table public.bc_notices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  ref text,
  title text not null check (length(btrim(title)) between 3 and 150),
  body text not null check (length(btrim(body)) between 3 and 4000),
  target jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft','sent','discarded')),
  recipient_count int,
  copied_from uuid references public.bc_notices(id) on delete set null,
  client_id uuid,
  rev int not null default 1,
  created_by uuid not null,
  sent_by uuid,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, ref),
  unique (created_by, client_id)
);
create table public.bc_notice_recipients (
  notice_id uuid not null references public.bc_notices(id) on delete cascade,
  user_id uuid not null,
  school_id uuid not null references public.schools(id) on delete cascade,
  category text not null,
  notified boolean not null default false,
  primary key (notice_id, user_id)
);
create table public.bc_notice_log (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.bc_notices(id) on delete cascade,
  action text not null, actor uuid, details jsonb not null default '{}', at timestamptz not null default now()
);
create index on public.bc_notices(org_id, status, sent_at desc);
create index on public.bc_notice_recipients(user_id);
grant all on public.bc_notices, public.bc_notice_recipients, public.bc_notice_log to service_role;
alter table public.bc_notices enable row level security;
alter table public.bc_notice_recipients enable row level security;
alter table public.bc_notice_log enable row level security;

create or replace function public._bc_ok(_school uuid, _action text) returns boolean language sql stable security definer set search_path=public as $$
  select _school is not null and exists(select 1 from schools where id=_school and is_active)
    and (_perm_owner(auth.uid(), school_org(_school)) or _perm_allows_user(_school, auth.uid(), 'notices', _action)) $$;

create or replace function public._bc_schools(_org uuid, _action text) returns uuid[] language sql stable security definer set search_path=public as $$
  select coalesce(array_agg(s.id order by s.name), '{}') from schools s where s.org_id=_org and s.is_active and _bc_ok(s.id, _action) $$;

create or replace function public._bc_target(_org uuid, _t jsonb, _action text) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare sc uuid[]; allowed uuid[] := _bc_schools(_org, _action); cats text[]; deps uuid[]; us uuid[]; md text;
begin
  if jsonb_typeof(coalesce(_t,'{}'::jsonb)) <> 'object' then raise exception 'صيغة الاستهداف غير صحيحة'; end if;
  begin
    sc := array(select distinct x::uuid from jsonb_array_elements_text(coalesce(_t->'schools','[]')) x);
    deps := array(select distinct x::uuid from jsonb_array_elements_text(coalesce(_t->'departments','[]')) x);
    us := array(select distinct x::uuid from jsonb_array_elements_text(coalesce(_t->'users','[]')) x);
  exception when others then raise exception 'معرّف غير صالح في الاستهداف'; end;
  cats := array(select distinct x from jsonb_array_elements_text(coalesce(_t->'categories','[]')) x);
  md := coalesce(_t->>'mode','all');
  if coalesce((_t->>'all_schools')::boolean, false) then sc := allowed; end if;
  if exists(select 1 from unnest(sc) s where not (s = any(allowed))) then raise exception 'فرع خارج نطاق صلاحيتك'; end if;
  if exists(select 1 from unnest(cats) c where c not in ('guardian','student','teacher','staff')) then raise exception 'فئة غير معروفة'; end if;
  if md not in ('all','pick') then raise exception 'طريقة اختيار غير صحيحة'; end if;
  if coalesce(array_length(us,1),0) > 500 then raise exception 'الحد الأقصى 500 شخص محدد'; end if;
  if exists(select 1 from unnest(deps) d where not exists(select 1 from departments x where x.id=d and x.school_id = any(sc))) then raise exception 'قسم لا يتبع الفروع المختارة'; end if;
  return jsonb_build_object('schools', to_jsonb(sc), 'all_schools', coalesce((_t->>'all_schools')::boolean, false), 'categories', to_jsonb(cats),
    'departments', to_jsonb(deps), 'mode', md, 'users', to_jsonb(case when md='pick' then us else '{}'::uuid[] end));
end $$;

create or replace function public._bc_pool(_t jsonb) returns table(user_id uuid, school_id uuid, category text) language sql stable security definer set search_path=public as $$
  with sc as (select x::uuid id from jsonb_array_elements_text(_t->'schools') x),
  cats as (select x c from jsonb_array_elements_text(_t->'categories') x),
  dep as (select x::uuid id from jsonb_array_elements_text(_t->'departments') x),
  nodep as (select not exists(select 1 from dep) v),
  st as (
    select s.id sid, s.user_id, s.school_id from students s join sc on sc.id=s.school_id
    where s.status='active' and ((select v from nodep) or exists(
      select 1 from enrollments e join courses c on c.section_id=e.section_id join subjects sb on sb.id=c.subject_id
      where e.student_id=s.id and e.status='active' and sb.department_id in (select id from dep)))
  ),
  raw as (
    select st.user_id, st.school_id, 'student'::text cat from st where 'student' in (select c from cats) and st.user_id is not null
      and exists(select 1 from memberships m where m.user_id=st.user_id and m.school_id=st.school_id and m.role='student' and m.is_active)
    union all
    select g.user_id, st.school_id, 'guardian' from st join student_guardians sg on sg.student_id=st.sid and sg.verified join guardians g on g.id=sg.guardian_id
      where 'guardian' in (select c from cats) and g.user_id is not null
        and exists(select 1 from memberships m where m.user_id=g.user_id and m.school_id=st.school_id and m.role='guardian' and m.is_active)
    union all
    select m.user_id, m.school_id, 'teacher' from memberships m join sc on sc.id=m.school_id
      where 'teacher' in (select c from cats) and m.is_active and m.role='teacher'
        and ((select v from nodep) or exists(select 1 from teachers t where t.user_id=m.user_id and t.school_id=m.school_id and t.status='active' and t.department_id in (select id from dep))
             or m.department_id in (select id from dep))
    union all
    select m.user_id, m.school_id, 'staff' from memberships m join sc on sc.id=m.school_id
      where 'staff' in (select c from cats) and m.is_active and m.role in ('principal','vice_principal','dept_head','supervisor','student_affairs','counselor','nurse','security')
        and ((select v from nodep) or m.department_id in (select id from dep))
  )
  select distinct on (r.user_id) r.user_id, r.school_id, r.cat from raw r
  where r.user_id is not null and r.user_id is distinct from auth.uid()
  order by r.user_id, case r.cat when 'staff' then 1 when 'teacher' then 2 when 'guardian' then 3 else 4 end, r.school_id $$;

create or replace function public._bc_audience(_t jsonb) returns table(user_id uuid, school_id uuid, category text) language sql stable security definer set search_path=public as $$
  select p.* from _bc_pool(_t) p
  where _t->>'mode' = 'all' or p.user_id::text in (select jsonb_array_elements_text(_t->'users')) $$;

create or replace function public._bc_cat_label(_c text) returns text language sql immutable set search_path=public as $$
  select case _c when 'guardian' then 'ولي أمر' when 'student' then 'طالب' when 'teacher' then 'معلم' when 'staff' then 'إداري' else _c end $$;

create or replace function public.bc_scope(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v uuid[] := _bc_schools(_org,'view'); d uuid[] := _bc_schools(_org,'draft'); s uuid[] := _bc_schools(_org,'send');
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  return jsonb_build_object('view', to_jsonb(v), 'draft', to_jsonb(d), 'send', to_jsonb(s), 'any', coalesce(array_length(v||d||s,1),0) > 0,
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name) order by x.name) from schools x where x.id = any(v||d||s)),'[]'),
    'departments', coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'name',x.name,'school_id',x.school_id) order by x.name) from departments x where x.school_id = any(d||s)),'[]'));
end $$;

create or replace function public.bc_people(_org uuid, _t jsonb, _q text, _ids uuid[] default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare t jsonb := _bc_target(_org, _t, 'draft'); q text := nullif(btrim(coalesce(_q,'')),'');
begin
  if q is not null then q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_'); end if;
  t := jsonb_set(t, '{mode}', '"all"');
  return coalesce((select jsonb_agg(z order by z->>'name') from (select jsonb_build_object('user_id',p.user_id,'name',coalesce(pr.full_name,'—'),'category',p.category,'category_label',_bc_cat_label(p.category),'school',s.name) z
    from (select * from _bc_pool(t) p0 where (_ids is null or p0.user_id = any(_ids))) p left join profiles pr on pr.id=p.user_id join schools s on s.id=p.school_id
    where (_ids is not null or q is not null) and (q is null or pr.full_name ilike '%' || q || '%')
    order by pr.full_name limit 50) w), '[]');
end $$;

create or replace function public._bc_fp(_t jsonb) returns text language sql stable security definer set search_path=public as $$
  select md5(coalesce(string_agg(user_id::text, ',' order by user_id),'')) from _bc_audience(_t) $$;

create or replace function public.bc_preview(_org uuid, _t jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare t jsonb := _bc_target(_org, _t, 'draft'); c int;
begin
  select count(*) into c from _bc_audience(t);
  return jsonb_build_object('count', c, 'fingerprint', _bc_fp(t), 'target', t,
      'by_school', coalesce((select jsonb_object_agg(n, k) from (select s.name n, count(*) k from _bc_audience(t) a join schools s on s.id=a.school_id group by s.name) z),'{}'),
      'by_category', coalesce((select jsonb_object_agg(_bc_cat_label(category), k) from (select category, count(*) k from _bc_audience(t) group by category) z),'{}'),
      'people', case when t->>'mode'='pick' or c <= 300 then coalesce((select jsonb_agg(jsonb_build_object('user_id',a.user_id,'name',coalesce(pr.full_name,'—'),'category_label',_bc_cat_label(a.category),'school',s.name) order by pr.full_name)
          from _bc_audience(t) a left join profiles pr on pr.id=a.user_id join schools s on s.id=a.school_id),'[]') else null end,
      'dropped', case when t->>'mode'='pick' then coalesce((select jsonb_agg(jsonb_build_object('user_id',u::uuid,'name',coalesce((select full_name from profiles where id=u::uuid),'—')))
          from jsonb_array_elements_text(t->'users') u where not exists(select 1 from _bc_audience(t) a where a.user_id=u::uuid)),'[]') else '[]'::jsonb end);
end $$;

create or replace function public._bc_can_all(_t jsonb, _action text) returns boolean language sql stable security definer set search_path=public as $$
  select jsonb_array_length(coalesce(_t->'schools','[]')) > 0 and not exists(select 1 from jsonb_array_elements_text(_t->'schools') s where not _bc_ok(s::uuid, _action)) $$;

create or replace function public.bc_save(_org uuid, _id uuid, _p jsonb, _rev int default null, _client uuid default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare n bc_notices; t jsonb; ti text := btrim(coalesce(_p->>'title','')); bo text := btrim(coalesce(_p->>'body','')); nid uuid;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if coalesce(array_length(_bc_schools(_org,'draft'),1),0) = 0 then raise exception 'غير مصرح' using errcode='42501'; end if;
  if length(ti) < 3 then raise exception 'اكتب عنوانًا (3 أحرف على الأقل)'; end if;
  if length(bo) < 3 then raise exception 'اكتب نص الإشعار'; end if;
  t := _bc_target(_org, coalesce(_p->'target','{}'), 'draft');
  if _id is null then
    if _client is not null then
      select id into nid from bc_notices where created_by=auth.uid() and client_id=_client;
      if nid is not null then return jsonb_build_object('id',nid,'rev',(select rev from bc_notices where id=nid)); end if;
    end if;
    insert into bc_notices(org_id,title,body,target,created_by,client_id) values (_org,ti,bo,t,auth.uid(),_client) returning * into n;
    insert into bc_notice_log(notice_id,action,actor) values (n.id,'draft',auth.uid());
  else
    select * into n from bc_notices where id=_id and org_id=_org for update;
    if n.id is null then raise exception 'غير موجود'; end if;
    if n.status <> 'draft' then raise exception 'لا تُعدّل إلا المسودة'; end if;
    if n.created_by <> auth.uid() and not _bc_can_all(n.target,'draft') then raise exception 'غير مصرح' using errcode='42501'; end if;
    if _rev is distinct from n.rev then raise exception 'عدّل شخص آخر المسودة؛ حدّث الصفحة'; end if;
    update bc_notices set title=ti, body=bo, target=t, rev=rev+1, updated_at=now() where id=_id returning * into n;
    insert into bc_notice_log(notice_id,action,actor) values (n.id,'edit',auth.uid());
  end if;
  return jsonb_build_object('id',n.id,'rev',n.rev);
end $$;

create or replace function public.bc_send(_id uuid, _rev int, _fingerprint text) returns jsonb language plpgsql security definer set search_path=public as $$
declare n bc_notices; t jsonb; fp text; c int; r text;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  select * into n from bc_notices where id=_id for update;
  if n.id is null then raise exception 'غير موجود'; end if;
  if n.status = 'sent' then
    if not _bc_visible(n) then raise exception 'غير مصرح' using errcode='42501'; end if;
    return jsonb_build_object('ref',n.ref,'count',n.recipient_count,'already',true);
  end if;
  if n.status <> 'draft' then raise exception 'المسودة ملغاة'; end if;
  if _rev is distinct from n.rev then raise exception 'تغيّرت المسودة؛ راجع المعاينة من جديد'; end if;
  t := _bc_target(n.org_id, n.target, 'send');
  if not _bc_can_all(t,'send') then raise exception 'لا تملك صلاحية الإرسال لكل الفروع المختارة' using errcode='42501'; end if;
  fp := _bc_fp(t);
  select count(*) into c from _bc_audience(t);
  if c = 0 then raise exception 'لا يوجد مستلمون'; end if;
  if _fingerprint is distinct from fp then raise exception 'تغيّر المستلمون منذ المعاينة (العدد الآن %)؛ راجع القائمة المحدّثة', c; end if;
  perform pg_advisory_xact_lock(hashtext('bc:' || n.org_id));
  r := 'N-' || to_char(now() at time zone 'Asia/Riyadh','YYYY') || '-' || lpad(((select count(*) from bc_notices where org_id=n.org_id and ref is not null) + 1)::text, 5, '0');
  insert into bc_notice_recipients(notice_id,user_id,school_id,category) select _id, a.user_id, a.school_id, a.category from _bc_audience(t) a;
  perform _notify(x.user_id, x.school_id, 'notice', n.title, left(n.body, 300), '/app/notifications', 'bc:' || _id) from bc_notice_recipients x where x.notice_id=_id;
  update bc_notice_recipients x set notified = exists(select 1 from notifications z where z.user_id=x.user_id and z.dedupe_key='bc:' || _id) where x.notice_id=_id;
  update bc_notices set status='sent', ref=r, target=t, recipient_count=c, sent_by=auth.uid(), sent_at=now(), rev=rev+1, updated_at=now() where id=_id;
  insert into bc_notice_log(notice_id,action,actor,details) values (_id,'send',auth.uid(),jsonb_build_object('count',c,'ref',r));
  return jsonb_build_object('ref',r,'count',c);
end $$;

create or replace function public.bc_discard(_id uuid, _rev int) returns void language plpgsql security definer set search_path=public as $$
declare n bc_notices;
begin
  select * into n from bc_notices where id=_id for update;
  if n.id is null or n.status <> 'draft' then raise exception 'لا تُلغى إلا المسودة'; end if;
  if n.created_by <> auth.uid() and not _bc_can_all(n.target,'draft') then raise exception 'غير مصرح' using errcode='42501'; end if;
  if _rev is distinct from n.rev then raise exception 'حدّث الصفحة'; end if;
  update bc_notices set status='discarded', rev=rev+1, updated_at=now() where id=_id;
  insert into bc_notice_log(notice_id,action,actor) values (_id,'discard',auth.uid());
end $$;

create or replace function public._bc_visible(n bc_notices) returns boolean language sql stable security definer set search_path=public as $$
  select n.created_by = auth.uid() or (n.status <> 'draft' and exists(select 1 from jsonb_array_elements_text(n.target->'schools') s where _bc_ok(s::uuid,'view')))
    or (n.status = 'draft' and _bc_can_all(n.target,'draft')) $$;

create or replace function public.bc_copy(_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare n bc_notices; nid uuid;
begin
  select * into n from bc_notices where id=_id;
  if n.id is null or not _bc_visible(n) then raise exception 'غير مصرح' using errcode='42501'; end if;
  if coalesce(array_length(_bc_schools(n.org_id,'draft'),1),0) = 0 then raise exception 'غير مصرح' using errcode='42501'; end if;
  insert into bc_notices(org_id,title,body,target,created_by,copied_from) values (n.org_id,n.title,n.body,n.target,auth.uid(),n.id) returning id into nid;
  insert into bc_notice_log(notice_id,action,actor,details) values (nid,'copy',auth.uid(),jsonb_build_object('from',n.id));
  return nid;
end $$;

create or replace function public.bc_list(_org uuid, _f jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path=public as $$
declare q text := nullif(btrim(coalesce(_f->>'q','')),'');
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'ref',n.ref,'title',n.title,'status',n.status,'rev',n.rev,'sent_at',n.sent_at,'created_at',n.created_at,
      'sender',_adm_name(coalesce(n.sent_by,n.created_by)),'mine',n.created_by=auth.uid(),'recipients',n.recipient_count,
      'read',(select count(*) from notifications z where z.dedupe_key='bc:' || n.id and z.read_at is not null),
      'failed',(select count(*) from bc_notice_recipients x where x.notice_id=n.id and not x.notified),
      'schools',(select jsonb_agg(s.name order by s.name) from schools s where s.id::text in (select jsonb_array_elements_text(n.target->'schools'))),
      'categories',(select jsonb_agg(_bc_cat_label(c)) from jsonb_array_elements_text(n.target->'categories') c),
      'mode',n.target->>'mode') order by coalesce(n.sent_at,n.updated_at) desc)
    from (select * from bc_notices n0 where n0.org_id=_org and n0.status <> 'discarded' and _bc_visible(n0)
      and (_f->>'status' is null or n0.status=_f->>'status')
      and (_f->>'school' is null or n0.target->'schools' ? (_f->>'school'))
      and (_f->>'category' is null or n0.target->'categories' ? (_f->>'category'))
      and (_f->>'sender' is null or coalesce(n0.sent_by,n0.created_by)::text=_f->>'sender')
      and (_f->>'from' is null or coalesce(n0.sent_at,n0.created_at) >= ((_f->>'from')::date)::timestamp at time zone 'Asia/Riyadh')
      and (_f->>'to' is null or coalesce(n0.sent_at,n0.created_at) < ((_f->>'to')::date + 1)::timestamp at time zone 'Asia/Riyadh')
      and (q is null or n0.title ilike '%'||q||'%' or n0.body ilike '%'||q||'%' or n0.ref ilike '%'||q||'%')
      order by coalesce(n0.sent_at,n0.updated_at) desc limit 300) n), '[]');
end $$;

create or replace function public.bc_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare n bc_notices;
begin
  select * into n from bc_notices where id=_id;
  if n.id is null or not _bc_visible(n) then raise exception 'غير مصرح' using errcode='42501'; end if;
  return jsonb_build_object('id',n.id,'ref',n.ref,'title',n.title,'body',n.body,'status',n.status,'rev',n.rev,'target',n.target,'sent_at',n.sent_at,
    'sender',_adm_name(coalesce(n.sent_by,n.created_by)),'copied_from',(select ref from bc_notices where id=n.copied_from),
    'can',jsonb_build_object('edit', n.status='draft' and (n.created_by=auth.uid() or _bc_can_all(n.target,'draft')), 'send', n.status='draft' and _bc_can_all(n.target,'send'),
      'copy', coalesce(array_length(_bc_schools(n.org_id,'draft'),1),0) > 0),
    'recipients', case when n.status='sent' then coalesce((select jsonb_agg(jsonb_build_object('name',coalesce(pr.full_name,'—'),'school',s.name,'category_label',_bc_cat_label(x.category),'notified',x.notified,
        'read_at',(select z.read_at from notifications z where z.user_id=x.user_id and z.dedupe_key='bc:' || n.id)) order by pr.full_name)
      from bc_notice_recipients x left join profiles pr on pr.id=x.user_id join schools s on s.id=x.school_id where x.notice_id=n.id),'[]') else null end,
    'log', coalesce((select jsonb_agg(jsonb_build_object('action',l.action,'at',l.at,'by',_adm_name(l.actor),'details',l.details) order by l.at) from bc_notice_log l where l.notice_id=n.id),'[]'));
end $$;

do $$ declare f text; begin
  foreach f in array array['_bc_ok(uuid,text)','_bc_schools(uuid,text)','_bc_target(uuid,jsonb,text)','_bc_pool(jsonb)','_bc_audience(jsonb)','_bc_fp(jsonb)','_bc_can_all(jsonb,text)','_bc_visible(bc_notices)','_bc_cat_label(text)'] loop
    execute 'revoke all on function public.' || f || ' from public, anon, authenticated';
  end loop;
  foreach f in array array['bc_scope(uuid)','bc_people(uuid,jsonb,text,uuid[])','bc_preview(uuid,jsonb)','bc_save(uuid,uuid,jsonb,integer,uuid)','bc_send(uuid,integer,text)','bc_discard(uuid,integer)','bc_copy(uuid)','bc_list(uuid,jsonb)','bc_get(uuid)'] loop
    execute 'revoke all on function public.' || f || ' from public, anon';
    execute 'grant execute on function public.' || f || ' to authenticated';
  end loop;
end $$;