create or replace function public.org_year_list(_org uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(y order by y->>'start_date' desc), '[]'::jsonb) from (
    select jsonb_build_object('name', ay.name, 'start_date', min(ay.start_date), 'end_date', max(ay.end_date),
      'is_current', bool_or(ay.is_current), 'available', bool_or(ay.available), 'schools', count(distinct ay.school_id),
      'terms', coalesce((select jsonb_agg(t order by t->>'start_date' nulls last, t->>'name') from (
         select jsonb_build_object('name', tt.name, 'start_date', min(tt.start_date), 'end_date', max(tt.end_date)) t
         from terms tt join academic_years y2 on y2.id = tt.year_id join schools s2 on s2.id = y2.school_id
         where s2.org_id = _org and y2.name = ay.name and tt.available group by tt.name) q), '[]'::jsonb)) y
    from academic_years ay join schools s on s.id = ay.school_id
    where s.org_id = _org and (is_org_owner(_org) or exists(select 1 from memberships m where m.user_id = auth.uid() and m.school_id = s.id))
    group by ay.name) z;
$$;

create or replace function public.org_year_save(_org uuid, _old text, _name text, _start date, _end date, _current boolean, _terms jsonb)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare s record; yid uuid; t jsonb; n int := 0; names text[];
begin
  if not is_org_owner(_org) then raise exception 'محددات الدراسة من صلاحية مالك المجموعة فقط'; end if;
  if coalesce(trim(_name), '') = '' then raise exception 'اكتب اسم العام الدراسي'; end if;
  if _start is null or _end is null or _end <= _start then raise exception 'حدد تواريخ العام الصحيحة'; end if;
  if jsonb_typeof(coalesce(_terms, '[]'::jsonb)) <> 'array' then raise exception 'قائمة الفصول غير صالحة'; end if;
  select coalesce(array_agg(trim(x->>'name')), '{}') into names from jsonb_array_elements(coalesce(_terms, '[]'::jsonb)) x;
  if exists(select 1 from unnest(names) v where v = '') then raise exception 'اكتب اسم كل فصل دراسي'; end if;
  if (select count(distinct v) from unnest(names) v) <> cardinality(names) then raise exception 'أسماء الفصول مكررة'; end if;
  for t in select * from jsonb_array_elements(coalesce(_terms, '[]'::jsonb)) loop
    if (t->>'start_date') is not null and (t->>'end_date') is not null and (t->>'end_date')::date < (t->>'start_date')::date then raise exception 'تاريخ نهاية الفصل قبل بدايته'; end if;
    if (t->>'start_date')::date < _start or (t->>'end_date')::date > _end then raise exception 'تواريخ الفصل خارج العام الدراسي'; end if;
  end loop;
  if _old is not null and _old <> trim(_name) and exists(select 1 from academic_years y join schools sc on sc.id = y.school_id where sc.org_id = _org and y.name = trim(_name)) then raise exception 'يوجد عام دراسي بهذا الاسم'; end if;
  for s in select id from schools where org_id = _org loop
    select id into yid from academic_years where school_id = s.id and name = coalesce(_old, trim(_name));
    if yid is null then
      insert into academic_years(school_id, name, start_date, end_date, is_current, available) values (s.id, trim(_name), _start, _end, false, true) returning id into yid;
    else
      update academic_years set name = trim(_name), start_date = _start, end_date = _end, available = true where id = yid;
    end if;
    if _current then
      update academic_years set is_current = false where school_id = s.id and id <> yid and is_current;
      update academic_years set is_current = true where id = yid;
    elsif _current is false then
      update academic_years set is_current = false where id = yid and is_current;
    end if;
    for t in select * from jsonb_array_elements(coalesce(_terms, '[]'::jsonb)) loop
      insert into terms(school_id, year_id, name, start_date, end_date, available)
      values (s.id, yid, trim(t->>'name'), (t->>'start_date')::date, (t->>'end_date')::date, true)
      on conflict (year_id, name) do update set start_date = excluded.start_date, end_date = excluded.end_date, available = true;
    end loop;
    update terms set available = false where year_id = yid and available and not (name = any(names));
    n := n + 1;
  end loop;
  return n;
end $$;

-- New schools receive the group's existing years and terms.
create or replace function public._org_years_to_new_school() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare y record; yid uuid;
begin
  for y in select distinct on (ay.name) ay.* from academic_years ay join schools s on s.id = ay.school_id
           where s.org_id = new.org_id and s.id <> new.id and ay.available order by ay.name, ay.created_at loop
    insert into academic_years(school_id, name, start_date, end_date, is_current, available)
    values (new.id, y.name, y.start_date, y.end_date, y.is_current, true) on conflict (school_id, name) do nothing returning id into yid;
    if yid is not null then
      insert into terms(school_id, year_id, name, start_date, end_date, available)
      select distinct on (t.name) new.id, yid, t.name, t.start_date, t.end_date, true from terms t where t.year_id = y.id and t.available
      on conflict (year_id, name) do nothing;
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists org_years_new_school on public.schools;
create trigger org_years_new_school after insert on public.schools for each row execute function public._org_years_to_new_school();

revoke all on function public.org_year_list(uuid) from public, anon;
revoke all on function public.org_year_save(uuid, text, text, date, date, boolean, jsonb) from public, anon;
revoke all on function public._org_years_to_new_school() from public, anon, authenticated;
grant execute on function public.org_year_list(uuid) to authenticated;
grant execute on function public.org_year_save(uuid, text, text, date, date, boolean, jsonb) to authenticated;