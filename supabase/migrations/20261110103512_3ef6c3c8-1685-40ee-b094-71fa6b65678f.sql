CREATE OR REPLACE FUNCTION public.upsert_student_guardian(_student uuid, _name text, _phone text, _national_id text, _relationship text)
 RETURNS TABLE(guardian_id uuid, has_account boolean, created boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare st record; g record; a_id uuid; a_phone text; b_id uuid; b_nid text; org_ph text; org uuid; ouid uuid; staged account_setup; mid uuid;
  ph text := coalesce(norm_phone(_phone), nullif(regexp_replace(coalesce(_phone,''),'\D','','g'),'')); nid text := _nid(_national_id); made boolean := false;
begin
  select * into st from students where id=_student;
  if st is null then raise exception 'الطالب غير موجود'; end if;
  if not can_edit_students(st.school_id) then raise exception 'لا تملك صلاحية إدارة الطلاب'; end if;
  if ph is null and nid is null then raise exception 'أدخل رقم هوية ولي الأمر أو جواله'; end if;
  if coalesce(trim(_name),'')='' then raise exception 'أدخل اسم ولي الأمر'; end if;
  org := school_org(st.school_id);
  if ph is null and nid is not null then
    select x.phone into org_ph from guardians x where _nid(x.national_id)=nid and school_org(x.school_id)=org and x.phone is not null order by x.created_at limit 1;
    ph := org_ph;
  end if;
  if nid is not null then select x.id, x.phone into a_id, a_phone from guardians x where x.school_id=st.school_id and _nid(x.national_id)=nid order by x.created_at limit 1; end if;
  if ph is not null then select x.id, _nid(x.national_id) into b_id, b_nid from guardians x where x.school_id=st.school_id and (regexp_replace(coalesce(x.phone,''),'\D','','g')=ph or norm_phone(x.phone)=ph) order by x.created_at limit 1; end if;
  if a_id is not null and b_id is not null and a_id <> b_id then raise exception 'تعارض: رقم الهوية والجوال مسجلان لوليي أمر مختلفين — راجع السجلين يدويًا'; end if;
  if a_id is null and b_id is not null and nid is not null and b_nid is not null and b_nid <> nid then raise exception 'تعارض: الجوال مسجل لولي أمر برقم هوية مختلف — راجع يدويًا'; end if;
  if a_id is not null and ph is not null and org_ph is null and a_phone is not null and coalesce(norm_phone(a_phone), regexp_replace(a_phone,'\D','','g')) <> ph then raise exception 'تعارض: رقم الهوية مسجل بجوال مختلف — حدّث جوال ولي الأمر من صفحته أولًا'; end if;
  select * into g from guardians where id = coalesce(a_id, b_id);
  if g.id is null then
    -- same guardian ID already has a login in another branch of the organization → this branch's record uses that same login (one account)
    if nid is not null then
      select coalesce(
        (select o.user_id from guardians o where o.user_id is not null and _nid(o.national_id)=nid and school_org(o.school_id)=org order by o.created_at limit 1),
        (select a.user_id from account_setup a join guardians o on o.id=a.subject_id where a.kind='guardian' and _nid(o.national_id)=nid and school_org(o.school_id)=org order by a.created_at limit 1))
      into ouid;
    end if;
    if ouid is not null then
      -- the login Rikaz created for this ID's record: record it on the display-name claim so the same person is recognized
      update person_display_names set user_id=ouid where org_id=org and national_id=nid and src_table='guardians' and user_id is null;
      insert into guardians(school_id, full_name, phone, national_id, user_id) values (st.school_id, trim(_name), ph, nid, ouid) returning * into g;
      select * into staged from account_setup where user_id=ouid and completed_at is null;
      select id into mid from memberships where user_id=ouid and school_id=st.school_id and role='guardian';
      if mid is null then
        insert into memberships(user_id, org_id, school_id, role, is_active) values (ouid, org, st.school_id, 'guardian', staged.user_id is null) returning id into mid;
      end if;
      -- not signed in yet: this branch opens together with the first sign-in
      if staged.user_id is not null then
        update memberships set is_active=false where id=mid;
        update account_setup set restore_ids = array(select distinct unnest(coalesce(restore_ids,'{}'::uuid[]) || mid)), updated_at=now() where user_id=ouid;
      end if;
      insert into access_audit(org_id, school_id, actor, action, target_user, target_membership, after, reason)
      values (org, st.school_id, auth.uid(), 'guardian_branch_link', ouid, mid, jsonb_build_object('guardian_id', g.id), 'نفس هوية ولي الأمر في فرع آخر — الحساب نفسه');
    else
      insert into guardians(school_id, full_name, phone, national_id) values (st.school_id, trim(_name), ph, nid) returning * into g;
    end if;
    made := true;
  else
    update guardians set phone=coalesce(phone, ph), national_id=coalesce(national_id, nid) where id=g.id;
  end if;
  insert into student_guardians as sg (school_id, student_id, guardian_id, relationship, can_follow, can_pickup, verified, verified_by, verified_at)
  values (st.school_id, _student, g.id, coalesce(nullif(_relationship,''),'father'), true, true, true, auth.uid(), now())
  on conflict (student_id, guardian_id) do nothing;
  return query select g.id, g.user_id is not null, made;
end $function$;