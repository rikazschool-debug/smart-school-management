
-- ===== Family / student overview + financial placeholder (B2.4) =====
create table public.fin_branch_pay (
  school_id uuid primary key references public.schools(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  banks jsonb not null default '[]'::jsonb,
  links jsonb not null default '[]'::jsonb,
  note text,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant all on public.fin_branch_pay to service_role;
alter table public.fin_branch_pay enable row level security;
create policy "fin_branch_pay rpc only" on public.fin_branch_pay for all to authenticated using (false) with check (false);

create table public.fin_student_accounts (
  student_id uuid primary key references public.students(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  balance numeric(12,2) not null default 0,
  currency text not null default 'SAR',
  source text not null,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant all on public.fin_student_accounts to service_role;
alter table public.fin_student_accounts enable row level security;
create policy "fin_student_accounts rpc only" on public.fin_student_accounts for all to authenticated using (false) with check (false);

create table public.fin_student_payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  amount numeric(12,2) not null,
  paid_at timestamptz not null,
  ref text,
  source text not null,
  created_at timestamptz not null default now(),
  unique (source, ref)
);
grant all on public.fin_student_payments to service_role;
alter table public.fin_student_payments enable row level security;
create policy "fin_student_payments rpc only" on public.fin_student_payments for all to authenticated using (false) with check (false);

create table public.fin_pay_log (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  actor uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
grant all on public.fin_pay_log to service_role;
alter table public.fin_pay_log enable row level security;
create policy "fin_pay_log rpc only" on public.fin_pay_log for all to authenticated using (false) with check (false);

create trigger fin_branch_pay_upd before update on public.fin_branch_pay for each row execute function public.touch_updated_at();
create trigger fin_student_accounts_upd before update on public.fin_student_accounts for each row execute function public.touch_updated_at();

-- all children linked to the caller (every school), verified links carry details
create or replace function public.family_children()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'school', x->>'student'), '[]'::jsonb) from (
    select distinct on (st.id) jsonb_build_object(
      'student_id', st.id, 'student', case when sg.verified then st.full_name end,
      'school_id', st.school_id, 'school', sc.name, 'verified', sg.verified, 'can_follow', sg.can_follow,
      'relationship', sg.relationship, 'csmart_no', case when sg.verified and sg.can_follow then st.csmart_no end,
      'grade', case when sg.verified and sg.can_follow then e.grade end, 'section', case when sg.verified and sg.can_follow then e.section end) x
    from student_guardians sg join guardians g on g.id = sg.guardian_id and g.user_id = auth.uid()
    join students st on st.id = sg.student_id and coalesce(st.status,'active') = 'active'
    join schools sc on sc.id = st.school_id and sc.is_active
    left join lateral (select se.name section, gr.name grade from enrollments en join sections se on se.id = en.section_id join grades gr on gr.id = se.grade_id
      where en.student_id = st.id and en.status = 'active' order by en.start_date desc nulls last limit 1) e on true
    order by st.id, sg.verified desc
  ) q $$;
revoke all on function public.family_children() from public, anon;
grant execute on function public.family_children() to authenticated;

-- one child's (or own) overview: timetable, classrooms, visits, finance
create or replace function public.family_child(_student uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare st students; sc schools; guardian boolean; self boolean; sec uuid; tt uuid; r jsonb; fa fin_student_accounts; bp fin_branch_pay;
begin
  select * into st from students where id = _student;
  if st.id is null then raise exception 'not_allowed' using errcode = '42501'; end if;
  guardian := is_guardian_of(_student); self := is_student_self(_student);
  if not (guardian or self) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into sc from schools where id = st.school_id;
  select en.section_id into sec from enrollments en where en.student_id = st.id and en.status = 'active' order by en.start_date desc nulls last limit 1;
  select t.id into tt from timetables t where t.school_id = st.school_id and t.status = 'published' order by t.version desc limit 1;
  r := jsonb_build_object(
    'student', jsonb_build_object('id', st.id, 'name', st.full_name, 'csmart_no', st.csmart_no, 'school_id', st.school_id, 'school', sc.name,
      'section', (select se.name from sections se where se.id = sec), 'grade', (select gr.name from sections se join grades gr on gr.id = se.grade_id where se.id = sec)),
    'viewer', case when guardian then 'guardian' else 'student' end,
    'timetable', coalesce((select jsonb_agg(jsonb_build_object('day', s.day, 'period', p.name, 'sort', p.sort_order, 'start', p.start_time, 'end', p.end_time,
        'subject', sj.name, 'teacher', te.full_name) order by s.day, p.sort_order)
      from timetable_slots s join periods p on p.id = s.period_id join courses c on c.id = s.course_id join subjects sj on sj.id = c.subject_id
      left join teachers te on te.id = s.teacher_id where s.timetable_id = tt and s.section_id = sec), '[]'::jsonb),
    'classrooms', coalesce((select jsonb_agg(jsonb_build_object('id', cl.id, 'title', cl.title, 'subject', sj.name) order by sj.name)
      from classrooms cl join courses c on c.id = cl.course_id join subjects sj on sj.id = c.subject_id
      where c.section_id = sec and cl.status = 'active'), '[]'::jsonb),
    'visits', case when guardian then coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'status', v.status, 'date', coalesce(v.conf_date, v.slot_date), 'time', coalesce(v.conf_time, v.slot_time), 'source', v.source) order by coalesce(v.conf_date, v.slot_date) desc)
      from gv_visits v where v.student_id = st.id and v.guardian_user = auth.uid()), '[]'::jsonb) end);
  if guardian then
    select * into fa from fin_student_accounts where student_id = st.id;
    select * into bp from fin_branch_pay where school_id = st.school_id;
    r := r || jsonb_build_object('finance', jsonb_build_object(
      'linked', fa.student_id is not null,
      'balance', fa.balance, 'currency', fa.currency, 'synced_at', fa.synced_at,
      'payments', coalesce((select jsonb_agg(jsonb_build_object('amount', p.amount, 'paid_at', p.paid_at, 'ref', p.ref) order by p.paid_at desc) from fin_student_payments p where p.student_id = st.id), '[]'::jsonb),
      'banks', coalesce(bp.banks, '[]'::jsonb), 'links', coalesce(bp.links, '[]'::jsonb), 'note', bp.note));
  end if;
  return r;
end $$;
revoke all on function public.family_child(uuid) from public, anon;
grant execute on function public.family_child(uuid) to authenticated;

-- branch bank accounts / payment links: org owner only, validated and logged
create or replace function public.fin_pay_get(_school uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o uuid; bp fin_branch_pay;
begin
  select org_id into o from schools where id = _school;
  if o is null or not is_org_owner(o) then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into bp from fin_branch_pay where school_id = _school;
  return jsonb_build_object('banks', coalesce(bp.banks,'[]'::jsonb), 'links', coalesce(bp.links,'[]'::jsonb), 'note', bp.note, 'updated_at', bp.updated_at);
end $$;
revoke all on function public.fin_pay_get(uuid) from public, anon;
grant execute on function public.fin_pay_get(uuid) to authenticated;

create or replace function public.fin_pay_save(_school uuid, _p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o uuid; b jsonb; l jsonb; it jsonb; old fin_branch_pay; n text;
begin
  select org_id into o from schools where id = _school;
  if o is null or not is_org_owner(o) then raise exception 'not_allowed' using errcode = '42501'; end if;
  b := coalesce(_p->'banks','[]'::jsonb); l := coalesce(_p->'links','[]'::jsonb);
  if jsonb_typeof(b) <> 'array' or jsonb_typeof(l) <> 'array' or jsonb_array_length(b) > 5 or jsonb_array_length(l) > 5 then raise exception 'invalid_input'; end if;
  for it in select * from jsonb_array_elements(b) loop
    if coalesce(btrim(it->>'bank'),'') = '' or coalesce(btrim(it->>'holder'),'') = '' then raise exception 'bank_required'; end if;
    if upper(replace(coalesce(it->>'iban',''),' ','')) !~ '^SA[0-9]{22}$' then raise exception 'invalid_iban'; end if;
  end loop;
  for it in select * from jsonb_array_elements(l) loop
    if coalesce(btrim(it->>'label'),'') = '' then raise exception 'label_required'; end if;
    if coalesce(it->>'url','') !~ '^https://[^\s<>"]+$' or length(it->>'url') > 500 then raise exception 'invalid_url'; end if;
  end loop;
  b := coalesce((select jsonb_agg(jsonb_build_object('bank', btrim(x->>'bank'), 'holder', btrim(x->>'holder'), 'iban', upper(replace(x->>'iban',' ','')))) from jsonb_array_elements(b) x), '[]'::jsonb);
  l := coalesce((select jsonb_agg(jsonb_build_object('label', btrim(x->>'label'), 'url', x->>'url')) from jsonb_array_elements(l) x), '[]'::jsonb);
  n := nullif(btrim(coalesce(_p->>'note','')), '');
  if length(coalesce(n,'')) > 500 then raise exception 'invalid_input'; end if;
  select * into old from fin_branch_pay where school_id = _school;
  insert into fin_branch_pay (school_id, org_id, banks, links, note, updated_by) values (_school, o, b, l, n, auth.uid())
    on conflict (school_id) do update set banks = excluded.banks, links = excluded.links, note = excluded.note, updated_by = excluded.updated_by;
  insert into fin_pay_log (school_id, actor, before, after) values (_school, auth.uid(),
    case when old.school_id is null then null else jsonb_build_object('banks', old.banks, 'links', old.links, 'note', old.note) end,
    jsonb_build_object('banks', b, 'links', l, 'note', n));
  return fin_pay_get(_school);
end $$;
revoke all on function public.fin_pay_save(uuid, jsonb) from public, anon;
grant execute on function public.fin_pay_save(uuid, jsonb) to authenticated;
