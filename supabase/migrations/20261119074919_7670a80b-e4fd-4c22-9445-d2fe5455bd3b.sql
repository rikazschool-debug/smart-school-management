create or replace function public.dash_staff_absence(_school uuid, _date date default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  d date := coalesce(_date, _hr_today());
  e record; s hr_shifts; b record; r hr_att_days; tid uuid; st text;
  out jsonb := '[]'::jsonb;
begin
  if auth.uid() is null or _school is null or not (can_manage_school(_school) or _hr_at_school_ok(_school, 'view')) then
    raise exception 'غير مصرح';
  end if;
  if d > _hr_today() then raise exception 'التاريخ غير صالح'; end if;
  for e in
    select x.id, x.full_name, x.user_id, x.national_id, x.job_title
    from hr_employees x join schools sc on sc.id = _school
    where x.org_id = sc.org_id and x.status = 'active' and _hr_emp_school(x.id) = _school
  loop
    perform _hr_at_compute(e.id, d);
    select * into r from hr_att_days where employee_id = e.id and date = d;
    if not found then continue; end if;
    st := null;
    if r.status = 'absent' then st := 'absent';
    elsif r.status = 'pending' and coalesce(r.punches, 0) = 0 then
      s := _hr_at_shift(e.id, d);
      if s.id is not null then
        b := _hr_at_bounds(s, d);
        if now() > b.st + make_interval(mins => coalesce(s.grace_in_min, 0)) then st := 'not_in'; end if;
      end if;
    end if;
    if st is null then continue; end if;
    select t.id into tid from teachers t
      where t.school_id = _school and t.status = 'active'
        and ((e.user_id is not null and t.user_id = e.user_id) or (e.national_id is not null and t.national_id = e.national_id))
      limit 1;
    out := out || jsonb_build_array(jsonb_build_object(
      'employee_id', e.id, 'name', e.full_name, 'job_title', e.job_title,
      'category', case when tid is not null then 'teacher' else 'admin' end,
      'teacher_id', tid, 'status', st, 'date', d,
      'recorded', tid is not null and exists (select 1 from teacher_absences a where a.teacher_id = tid and a.date = d)));
    tid := null;
  end loop;
  return (select coalesce(jsonb_agg(x order by (x->>'category') = 'teacher' desc, (x->>'status') = 'absent' desc, x->>'name'), '[]'::jsonb) from jsonb_array_elements(out) x);
end $function$;

revoke all on function public.dash_staff_absence(uuid, date) from public, anon;
grant execute on function public.dash_staff_absence(uuid, date) to authenticated;