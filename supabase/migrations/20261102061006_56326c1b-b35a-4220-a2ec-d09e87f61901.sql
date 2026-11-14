create or replace function public.upsert_student_guardian(_student uuid, _name text, _phone text, _national_id text, _relationship text)
returns table(guardian_id uuid, has_account boolean, created boolean)
language plpgsql security definer set search_path=public as $$
#variable_conflict use_column
declare st record; g record; ph text := nullif(regexp_replace(coalesce(_phone,''),'\D','','g'),''); nid text := nullif(regexp_replace(coalesce(_national_id,''),'\D','','g'),''); made boolean := false;
begin
  select * into st from students where id=_student;
  if st is null then raise exception 'الطالب غير موجود'; end if;
  if not can_manage_students(st.school_id) then raise exception 'لا تملك صلاحية إدارة الطلاب'; end if;
  if ph is null and nid is null then raise exception 'أدخل رقم هوية ولي الأمر أو جواله'; end if;
  if coalesce(trim(_name),'')='' then raise exception 'أدخل اسم ولي الأمر'; end if;
  select * into g from guardians x where x.school_id=st.school_id
    and ((nid is not null and regexp_replace(coalesce(x.national_id,''),'\D','','g')=nid) or (ph is not null and regexp_replace(coalesce(x.phone,''),'\D','','g')=ph))
    order by (nid is not null and regexp_replace(coalesce(x.national_id,''),'\D','','g')=nid) desc, x.created_at limit 1;
  if g is null then
    insert into guardians(school_id, full_name, phone, national_id) values (st.school_id, trim(_name), ph, nid) returning * into g;
    made := true;
  else
    update guardians set phone=coalesce(phone, ph), national_id=coalesce(national_id, nid) where id=g.id;
  end if;
  insert into student_guardians as sg (school_id, student_id, guardian_id, relationship, can_follow, can_pickup, verified, verified_by, verified_at)
  values (st.school_id, _student, g.id, coalesce(nullif(_relationship,''),'father'), true, true, true, auth.uid(), now())
  on conflict (student_id, guardian_id) do nothing;
  return query select g.id, g.user_id is not null, made;
end $$;