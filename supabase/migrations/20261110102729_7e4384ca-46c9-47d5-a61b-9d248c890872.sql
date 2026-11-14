-- login of the same guardian (same national ID) anywhere in the organization: guardians.user_id or a staged account_setup
CREATE OR REPLACE FUNCTION public._guardian_org_uid(_guardian uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  with me as (select g.id, _nid(g.national_id) nid, school_org(g.school_id) org from guardians g where g.id = _guardian)
  select coalesce(
    (select o.user_id from guardians o, me where me.nid is not null and o.id <> me.id and o.user_id is not null and _nid(o.national_id) = me.nid and school_org(o.school_id) = me.org order by o.created_at limit 1),
    (select a.user_id from account_setup a join guardians o on o.id = a.subject_id, me where a.kind = 'guardian' and me.nid is not null and o.id <> me.id and _nid(o.national_id) = me.nid and school_org(o.school_id) = me.org order by a.created_at limit 1))
$$;
REVOKE ALL ON FUNCTION public._guardian_org_uid(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._guardian_org_uid(uuid) TO service_role;

-- adding a student: same guardian ID in another branch of the organization fills a missing name/mobile on this branch's record
CREATE OR REPLACE FUNCTION public.upsert_student_guardian(_student uuid, _name text, _phone text, _national_id text, _relationship text)
 RETURNS TABLE(guardian_id uuid, has_account boolean, created boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare st record; g record; a_id uuid; a_phone text; b_id uuid; b_nid text; org_ph text;
  ph text := coalesce(norm_phone(_phone), nullif(regexp_replace(coalesce(_phone,''),'\D','','g'),'')); nid text := _nid(_national_id); made boolean := false;
begin
  select * into st from students where id=_student;
  if st is null then raise exception 'الطالب غير موجود'; end if;
  if not can_edit_students(st.school_id) then raise exception 'لا تملك صلاحية إدارة الطلاب'; end if;
  if ph is null and nid is null then raise exception 'أدخل رقم هوية ولي الأمر أو جواله'; end if;
  if coalesce(trim(_name),'')='' then raise exception 'أدخل اسم ولي الأمر'; end if;
  if ph is null and nid is not null then
    select x.phone into org_ph from guardians x where _nid(x.national_id)=nid and school_org(x.school_id)=school_org(st.school_id) and x.phone is not null order by x.created_at limit 1;
    ph := org_ph;
  end if;
  if nid is not null then select x.id, x.phone into a_id, a_phone from guardians x where x.school_id=st.school_id and _nid(x.national_id)=nid order by x.created_at limit 1; end if;
  if ph is not null then select x.id, _nid(x.national_id) into b_id, b_nid from guardians x where x.school_id=st.school_id and (regexp_replace(coalesce(x.phone,''),'\D','','g')=ph or norm_phone(x.phone)=ph) order by x.created_at limit 1; end if;
  -- never merge on a partial match: ID and mobile must point to the same person (or one side unknown)
  if a_id is not null and b_id is not null and a_id <> b_id then raise exception 'تعارض: رقم الهوية والجوال مسجلان لوليي أمر مختلفين — راجع السجلين يدويًا'; end if;
  if a_id is null and b_id is not null and nid is not null and b_nid is not null and b_nid <> nid then raise exception 'تعارض: الجوال مسجل لولي أمر برقم هوية مختلف — راجع يدويًا'; end if;
  if a_id is not null and ph is not null and org_ph is null and a_phone is not null and coalesce(norm_phone(a_phone), regexp_replace(a_phone,'\D','','g')) <> ph then raise exception 'تعارض: رقم الهوية مسجل بجوال مختلف — حدّث جوال ولي الأمر من صفحته أولًا'; end if;
  select * into g from guardians where id = coalesce(a_id, b_id);
  if g.id is null then
    insert into guardians(school_id, full_name, phone, national_id) values (st.school_id, trim(_name), ph, nid) returning * into g;
    made := true;
  else
    update guardians set phone=coalesce(phone, ph), national_id=coalesce(national_id, nid) where id=g.id;
  end if;
  insert into student_guardians as sg (school_id, student_id, guardian_id, relationship, can_follow, can_pickup, verified, verified_by, verified_at)
  values (st.school_id, _student, g.id, coalesce(nullif(_relationship,''),'father'), true, true, true, auth.uid(), now())
  on conflict (student_id, guardian_id) do nothing;
  return query select g.id, g.user_id is not null, made;
end $function$;

-- the one row queued before the approved template existed is not sent retroactively
UPDATE public.acct_outbox SET status = 'skipped', detail = 'queued_before_template', updated_at = now() WHERE status IN ('queued', 'waiting_template');