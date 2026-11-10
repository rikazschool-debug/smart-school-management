create table public.health_profiles(
  student_id uuid primary key references public.students(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  blood_type text, height_cm numeric, weight_kg numeric, allergies text, diet text,
  emergency_name text, emergency_phone text, doctor_name text, doctor_phone text, insurance text, notes text,
  updated_by uuid, updated_source text not null default 'staff',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.health_conditions(
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null, category text not null default 'chronic', severity text not null default 'moderate',
  instructions text, source text not null default 'staff', active boolean not null default true,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.health_meds(
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null, dose text, times text[] not null default '{}', at_school boolean not null default false,
  start_date date, end_date date, instructions text, source text not null default 'staff', active boolean not null default true,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.health_events(
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  kind text not null, occurred_at timestamptz not null default now(), summary text not null, action_taken text,
  med_id uuid references public.health_meds(id) on delete set null, shared boolean not null default true,
  created_by uuid, created_at timestamptz not null default now());
create table public.health_log(
  id bigserial primary key, school_id uuid not null, student_id uuid not null, actor uuid, action text not null,
  details jsonb not null default '{}', created_at timestamptz not null default now());
create index on public.health_conditions(student_id); create index on public.health_meds(student_id);
create index on public.health_events(student_id, occurred_at desc); create index on public.health_events(school_id, occurred_at desc);
grant all on public.health_profiles, public.health_conditions, public.health_meds, public.health_events, public.health_log to service_role;
grant usage on sequence public.health_log_id_seq to service_role;
alter table public.health_profiles enable row level security; alter table public.health_conditions enable row level security;
alter table public.health_meds enable row level security; alter table public.health_events enable row level security;
alter table public.health_log enable row level security;

-- permission tree section
create or replace function public._perm_catalog_v16() returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_set(b, '{sections}', (b->'sections') || jsonb_build_array(
    jsonb_build_object('key','health','label','الصحة المدرسية — الملف الصحي للطلاب','parent','school_admin',
      'actions',jsonb_build_array('view','record','manage','export'),'scopes',jsonb_build_array('branch'),
      'labels',jsonb_build_object('view','عرض الملفات الصحية لطلاب الفرع','record','تسجيل أحداث العيادة (زيارة، إعطاء دواء، إصابة، تحويل…)',
        'manage','تعديل البطاقة الصحية والأمراض والأدوية','export','تصدير وطباعة الكشوف الصحية'))))
  from (select _perm_catalog_v15() b offset 0) x $$;
create or replace function public.perm_catalog() returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select jsonb_set(c, '{sections}', (select jsonb_agg(case when s->>'key'='hr_employees'
      then jsonb_set(jsonb_set(s,'{actions}',(s->'actions')||'["print"]'::jsonb),'{labels,print}', to_jsonb('طباعة ملفات الموظفين (فردي وجماعي)'::text))
      else s end order by o) from jsonb_array_elements(c->'sections') with ordinality t(s,o)))
  from (select _perm_catalog_v16() c offset 0) x
$function$;

create or replace function public._perm_base(_school uuid, _uid uuid, _section text, _action text)
 returns boolean language sql stable security definer set search_path to 'public' as $function$
  select case when _section in ('attendance','gate') and _perm_vice_only(_school,_uid) then false
    when _section='people_staff' and _action='view' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal}')
    when _section='people_staff' then _perm_owner(_uid, school_org(_school))
    when _section='people_family' and _action='view' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal,vice_principal,student_affairs}')
    when _section='people_family' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{student_affairs}')
    when _section='people' and _action in ('view','bulk','tags_assign') and _perm_has_role(_uid,_school,'{principal,vice_principal}') then true
    when _section='contracts' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal}')
    when _section='attendance' and _action='view' then _perm_base_v11(_school,_uid,'attendance','approve') or _perm_base_v11(_school,_uid,'attendance','follow')
    when _section='attendance' and _action='record' then _perm_base_v11(_school,_uid,'attendance','approve')
    when _section='school_schedule' then _perm_owner(_uid, school_org(_school))
    when _section='notices' and _action in ('view','draft','send') then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{principal}') or _perm_base_v11(_school,_uid,_section,_action)
    -- school health: the health counselor (nurse role) runs the section; principal/vice read; others only by owner grant
    when _section='health' then _perm_owner(_uid, school_org(_school)) or _perm_has_role(_uid,_school,'{nurse}')
      or (_action='view' and _perm_has_role(_uid,_school,'{principal,vice_principal}'))
    else _perm_base_v11(_school,_uid,_section,_action) end $function$;

create or replace function public._health_ok(_school uuid, _action text) returns boolean language sql stable security definer set search_path to 'public' as $$
  select auth.uid() is not null and _school is not null and section_enabled(school_org(_school),'health')
    and (is_org_owner(school_org(_school)) or perm_allows(_school,'health',_action)
      or (_action='view' and (perm_allows(_school,'health','record') or perm_allows(_school,'health','manage')))) $$;

create or replace function public._health_school(_student uuid) returns uuid language sql stable security definer set search_path to 'public' as $$
  select school_id from students where id=_student $$;

create or replace function public._health_log(_school uuid, _student uuid, _action text, _d jsonb) returns void language sql security definer set search_path to 'public' as $$
  insert into health_log(school_id, student_id, actor, action, details) values (_school,_student,auth.uid(),_action,coalesce(_d,'{}')) $$;

-- who edits: staff with manage, or the verified guardian (guardian edits only rows the guardian entered)
create or replace function public._health_editor(_student uuid) returns text language sql stable security definer set search_path to 'public' as $$
  select case when _health_ok(_health_school(_student),'manage') then 'staff' when is_guardian_of(_student) then 'guardian' else null end $$;

create or replace function public._health_notify_staff(_student uuid, _what text) returns void language plpgsql security definer set search_path to 'public' as $$
declare s uuid := _health_school(_student); n text; u uuid;
begin
  select coalesce(display_name, full_name) into n from students where id=_student;
  for u in select distinct user_id from memberships where school_id=s and role='nurse' and is_active loop
    perform _notify(u, s, 'health', 'تحديث في الملف الصحي', 'حدّث ولي الأمر ' || _what || ' للطالب ' || coalesce(n,''), '/app/health/' || _student,
      'health-g:' || _student || ':' || to_char(now() at time zone 'Asia/Riyadh','YYYYMMDDHH24'));
  end loop;
end $$;

create or replace function public.health_students(_school uuid, _q text default null, _flag text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare r jsonb; t date := school_today();
begin
  if not _health_ok(_school,'view') then raise exception 'غير مصرح لك بالملفات الصحية'; end if;
  select coalesce(jsonb_agg(x order by x->>'name'),'[]') into r from (
    select jsonb_build_object('id',s.id,'name',coalesce(s.display_name,s.full_name),'national_id',s.national_id,'gender',s.gender,
      'section', (select gl.name||' / '||se.name from enrollments e join sections se on se.id=e.section_id left join grade_levels gl on gl.id=se.grade_id where e.student_id=s.id and e.status='active' order by e.start_date desc nulls last limit 1),
      'blood', p.blood_type, 'allergies', nullif(trim(coalesce(p.allergies,'')),''),
      'conditions', (select coalesce(jsonb_agg(jsonb_build_object('name',c.name,'severity',c.severity)),'[]') from health_conditions c where c.student_id=s.id and c.active),
      'meds', (select count(*) from health_meds m where m.student_id=s.id and m.active and (m.end_date is null or m.end_date>=t)),
      'school_meds', (select count(*) from health_meds m where m.student_id=s.id and m.active and m.at_school and (m.end_date is null or m.end_date>=t) and (m.start_date is null or m.start_date<=t)),
      'last_event', (select max(occurred_at) from health_events ev where ev.student_id=s.id),
      'has_file', p.student_id is not null) x
    from students s left join health_profiles p on p.student_id=s.id
    where s.school_id=_school and coalesce(s.status,'active')='active'
      and (_q is null or _q='' or s.full_name ilike '%'||_q||'%' or coalesce(s.display_name,'') ilike '%'||_q||'%' or coalesce(s.national_id,'') like '%'||_q||'%')
  ) y(x)
  where _flag is null or _flag='' or (_flag='conditions' and jsonb_array_length(x->'conditions')>0)
    or (_flag='allergies' and x->>'allergies' is not null) or (_flag='meds' and (x->>'meds')::int>0)
    or (_flag='school_meds' and (x->>'school_meds')::int>0) or (_flag='nofile' and not (x->>'has_file')::boolean);
  return r;
end $$;

create or replace function public.health_today(_school uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare t date := school_today(); r jsonb;
begin
  if not _health_ok(_school,'view') then raise exception 'غير مصرح لك بالملفات الصحية'; end if;
  select jsonb_build_object(
    'doses', (select coalesce(jsonb_agg(jsonb_build_object('med_id',m.id,'student_id',m.student_id,'student',coalesce(s.display_name,s.full_name),'name',m.name,'dose',m.dose,'time',tm,
        'given', exists(select 1 from health_events ev where ev.med_id=m.id and ev.kind='med_given' and (ev.occurred_at at time zone 'Asia/Riyadh')::date=t
          and coalesce(ev.action_taken,'')=tm)) order by tm, s.full_name),'[]')
      from health_meds m join students s on s.id=m.student_id, unnest(case when cardinality(m.times)=0 then array['']::text[] else m.times end) tm
      where m.school_id=_school and m.active and m.at_school and (m.end_date is null or m.end_date>=t) and (m.start_date is null or m.start_date<=t)),
    'visits_today', (select count(*) from health_events ev where ev.school_id=_school and (ev.occurred_at at time zone 'Asia/Riyadh')::date=t),
    'sent_home_today', (select count(*) from health_events ev where ev.school_id=_school and ev.kind='sent_home' and (ev.occurred_at at time zone 'Asia/Riyadh')::date=t),
    'recent', (select coalesce(jsonb_agg(z order by z->>'at' desc),'[]') from (select jsonb_build_object('id',ev.id,'student_id',ev.student_id,'student',coalesce(s.display_name,s.full_name),'kind',ev.kind,'summary',ev.summary,'at',ev.occurred_at) z
        from health_events ev join students s on s.id=ev.student_id where ev.school_id=_school order by ev.occurred_at desc limit 12) q),
    'can_record', _health_ok(_school,'record'), 'can_manage', _health_ok(_school,'manage'), 'can_export', _health_ok(_school,'export')) into r;
  return r;
end $$;

create or replace function public.health_file(_student uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare s uuid := _health_school(_student); staff boolean; g boolean; r jsonb;
begin
  staff := _health_ok(s,'view'); g := is_guardian_of(_student);
  if not (staff or g) then raise exception 'غير مصرح لك بهذا الملف الصحي'; end if;
  select jsonb_build_object(
    'viewer', case when staff then 'staff' else 'guardian' end,
    'can_record', staff and _health_ok(s,'record'), 'can_manage', (staff and _health_ok(s,'manage')) or g,
    'student', (select jsonb_build_object('id',st.id,'name',coalesce(st.display_name,st.full_name),'national_id',case when staff then st.national_id end,'birth_date',st.birth_date,'gender',st.gender,'school_id',st.school_id,
        'section',(select gl.name||' / '||se.name from enrollments e join sections se on se.id=e.section_id left join grade_levels gl on gl.id=se.grade_id where e.student_id=st.id and e.status='active' order by e.start_date desc nulls last limit 1),
        'guardians',(select coalesce(jsonb_agg(jsonb_build_object('name',coalesce(gu.display_name,gu.full_name),'phone',case when staff then gu.phone end,'relationship',sg.relationship)),'[]') from student_guardians sg join guardians gu on gu.id=sg.guardian_id where sg.student_id=st.id))
      from students st where st.id=_student),
    'profile', (select to_jsonb(p) - 'updated_by' from health_profiles p where p.student_id=_student),
    'conditions', (select coalesce(jsonb_agg(to_jsonb(c) - 'created_by' order by c.created_at),'[]') from health_conditions c where c.student_id=_student and c.active),
    'meds', (select coalesce(jsonb_agg(to_jsonb(m) - 'created_by' order by m.created_at),'[]') from health_meds m where m.student_id=_student and m.active),
    'events', (select coalesce(jsonb_agg(z order by z->>'occurred_at' desc),'[]') from (select jsonb_build_object('id',ev.id,'kind',ev.kind,'occurred_at',ev.occurred_at,'summary',ev.summary,'action_taken',ev.action_taken,'shared',ev.shared,
          'by',(select coalesce(pr.display_name, pr.full_name) from profiles pr where pr.id=ev.created_by)) z
        from health_events ev where ev.student_id=_student and (staff or ev.shared) order by ev.occurred_at desc limit 200) q)) into r;
  return r;
end $$;

create or replace function public.health_profile_save(_student uuid, _p jsonb) returns void language plpgsql security definer set search_path to 'public' as $$
declare ed text := _health_editor(_student); s uuid := _health_school(_student);
begin
  if ed is null then raise exception 'غير مصرح لك بتعديل الملف الصحي'; end if;
  insert into health_profiles(student_id, school_id, blood_type, height_cm, weight_kg, allergies, diet, emergency_name, emergency_phone, doctor_name, doctor_phone, insurance, notes, updated_by, updated_source)
  values (_student, s, nullif(_p->>'blood_type',''), nullif(_p->>'height_cm','')::numeric, nullif(_p->>'weight_kg','')::numeric, nullif(left(_p->>'allergies',1000),''), nullif(left(_p->>'diet',500),''),
    nullif(left(_p->>'emergency_name',120),''), nullif(left(_p->>'emergency_phone',30),''), nullif(left(_p->>'doctor_name',120),''), nullif(left(_p->>'doctor_phone',30),''), nullif(left(_p->>'insurance',200),''), nullif(left(_p->>'notes',2000),''), auth.uid(), ed)
  on conflict (student_id) do update set blood_type=excluded.blood_type, height_cm=excluded.height_cm, weight_kg=excluded.weight_kg, allergies=excluded.allergies, diet=excluded.diet,
    emergency_name=excluded.emergency_name, emergency_phone=excluded.emergency_phone, doctor_name=excluded.doctor_name, doctor_phone=excluded.doctor_phone, insurance=excluded.insurance, notes=excluded.notes,
    updated_by=excluded.updated_by, updated_source=excluded.updated_source, updated_at=now();
  perform _health_log(s,_student,'profile_save',jsonb_build_object('by',ed));
  if ed='guardian' then perform _health_notify_staff(_student,'البطاقة الصحية'); end if;
end $$;

create or replace function public.health_condition_save(_student uuid, _id uuid, _p jsonb) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare ed text := _health_editor(_student); s uuid := _health_school(_student); i uuid := _id;
begin
  if ed is null then raise exception 'غير مصرح لك بتعديل الملف الصحي'; end if;
  if coalesce(trim(_p->>'name'),'')='' then raise exception 'اكتب اسم الحالة الصحية'; end if;
  if i is null then
    insert into health_conditions(student_id, school_id, name, category, severity, instructions, source, created_by)
    values (_student, s, left(trim(_p->>'name'),200), coalesce(nullif(_p->>'category',''),'chronic'), coalesce(nullif(_p->>'severity',''),'moderate'), nullif(left(_p->>'instructions',1000),''), ed, auth.uid()) returning id into i;
  else
    update health_conditions set name=left(trim(_p->>'name'),200), category=coalesce(nullif(_p->>'category',''),category), severity=coalesce(nullif(_p->>'severity',''),severity), instructions=nullif(left(_p->>'instructions',1000),''), updated_at=now()
     where id=i and student_id=_student and active and (ed='staff' or source='guardian');
    if not found then raise exception 'لا يمكنك تعديل هذا السجل'; end if;
  end if;
  perform _health_log(s,_student,'condition_save',jsonb_build_object('id',i,'by',ed,'p',_p));
  if ed='guardian' then perform _health_notify_staff(_student,'الأمراض والحالات'); end if;
  return i;
end $$;

create or replace function public.health_med_save(_student uuid, _id uuid, _p jsonb) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare ed text := _health_editor(_student); s uuid := _health_school(_student); i uuid := _id; tm text[];
begin
  if ed is null then raise exception 'غير مصرح لك بتعديل الملف الصحي'; end if;
  if coalesce(trim(_p->>'name'),'')='' then raise exception 'اكتب اسم الدواء'; end if;
  select coalesce(array_agg(x order by x),'{}') into tm from (select distinct trim(x) x from jsonb_array_elements_text(coalesce(_p->'times','[]')) x where trim(x) ~ '^[0-2][0-9]:[0-5][0-9]$') q;
  if i is null then
    insert into health_meds(student_id, school_id, name, dose, times, at_school, start_date, end_date, instructions, source, created_by)
    values (_student, s, left(trim(_p->>'name'),200), nullif(left(_p->>'dose',120),''), tm, coalesce((_p->>'at_school')::boolean,false), nullif(_p->>'start_date','')::date, nullif(_p->>'end_date','')::date, nullif(left(_p->>'instructions',1000),''), ed, auth.uid()) returning id into i;
  else
    update health_meds set name=left(trim(_p->>'name'),200), dose=nullif(left(_p->>'dose',120),''), times=tm, at_school=coalesce((_p->>'at_school')::boolean,false),
      start_date=nullif(_p->>'start_date','')::date, end_date=nullif(_p->>'end_date','')::date, instructions=nullif(left(_p->>'instructions',1000),''), updated_at=now()
     where id=i and student_id=_student and active and (ed='staff' or source='guardian');
    if not found then raise exception 'لا يمكنك تعديل هذا السجل'; end if;
  end if;
  perform _health_log(s,_student,'med_save',jsonb_build_object('id',i,'by',ed,'p',_p));
  if ed='guardian' then perform _health_notify_staff(_student,'الأدوية'); end if;
  return i;
end $$;

create or replace function public.health_item_remove(_kind text, _id uuid) returns void language plpgsql security definer set search_path to 'public' as $$
declare st uuid; src text; ed text;
begin
  if _kind='condition' then select student_id, source into st, src from health_conditions where id=_id and active;
  elsif _kind='med' then select student_id, source into st, src from health_meds where id=_id and active;
  else raise exception 'نوع غير معروف'; end if;
  if st is null then raise exception 'السجل غير موجود'; end if;
  ed := _health_editor(st);
  if ed is null or (ed='guardian' and src<>'guardian') then raise exception 'لا يمكنك حذف هذا السجل'; end if;
  if _kind='condition' then update health_conditions set active=false, updated_at=now() where id=_id;
  else update health_meds set active=false, updated_at=now() where id=_id; end if;
  perform _health_log(_health_school(st),st,_kind||'_remove',jsonb_build_object('id',_id,'by',ed));
end $$;

create or replace function public.health_event_add(_student uuid, _p jsonb) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare s uuid := _health_school(_student); i uuid; k text := coalesce(_p->>'kind',''); sh boolean := coalesce((_p->>'shared')::boolean,true); n text; u uuid;
  lbl text;
begin
  if not _health_ok(s,'record') then raise exception 'غير مصرح لك بتسجيل أحداث العيادة'; end if;
  if k not in ('visit','med_given','injury','sent_home','referral','screening','vaccination','guardian_call','note') then raise exception 'نوع الحدث غير معروف'; end if;
  if coalesce(trim(_p->>'summary'),'')='' then raise exception 'اكتب وصف الحدث'; end if;
  if nullif(_p->>'med_id','') is not null and not exists(select 1 from health_meds where id=(_p->>'med_id')::uuid and student_id=_student) then raise exception 'الدواء لا يخص هذا الطالب'; end if;
  insert into health_events(student_id, school_id, kind, occurred_at, summary, action_taken, med_id, shared, created_by)
  values (_student, s, k, coalesce(nullif(_p->>'occurred_at','')::timestamptz, now()), left(trim(_p->>'summary'),500), nullif(left(_p->>'action_taken',1000),''), nullif(_p->>'med_id','')::uuid, sh, auth.uid()) returning id into i;
  perform _health_log(s,_student,'event_add',jsonb_build_object('id',i,'kind',k));
  if sh then
    lbl := case k when 'visit' then 'زيارة للعيادة' when 'med_given' then 'إعطاء دواء' when 'injury' then 'إصابة' when 'sent_home' then 'إرسال للمنزل'
      when 'referral' then 'تحويل طبي' when 'screening' then 'فحص دوري' when 'vaccination' then 'تطعيم' when 'guardian_call' then 'تواصل مع ولي الأمر' else 'ملاحظة صحية' end;
    select coalesce(display_name, full_name) into n from students where id=_student;
    for u in select distinct g.user_id from student_guardians sg join guardians g on g.id=sg.guardian_id where sg.student_id=_student and sg.verified and sg.can_follow and g.user_id is not null loop
      perform _notify(u, s, 'health', 'العيادة المدرسية — ' || lbl, coalesce(n,'') || ': ' || left(trim(_p->>'summary'),140), '/app/child/' || _student, 'health-e:' || i);
    end loop;
  end if;
  return i;
end $$;

revoke all on function public._health_ok(uuid,text), public._health_school(uuid), public._health_log(uuid,uuid,text,jsonb), public._health_editor(uuid), public._health_notify_staff(uuid,text), public._perm_catalog_v16() from public, anon, authenticated;
revoke all on function public.health_students(uuid,text,text), public.health_today(uuid), public.health_file(uuid), public.health_profile_save(uuid,jsonb), public.health_condition_save(uuid,uuid,jsonb), public.health_med_save(uuid,uuid,jsonb), public.health_item_remove(text,uuid), public.health_event_add(uuid,jsonb) from public, anon;
grant execute on function public.health_students(uuid,text,text), public.health_today(uuid), public.health_file(uuid), public.health_profile_save(uuid,jsonb), public.health_condition_save(uuid,uuid,jsonb), public.health_med_save(uuid,uuid,jsonb), public.health_item_remove(text,uuid), public.health_event_add(uuid,jsonb) to authenticated;