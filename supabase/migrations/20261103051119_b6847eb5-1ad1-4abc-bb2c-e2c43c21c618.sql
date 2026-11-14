create or replace function public._nid(_v text) returns text language sql immutable set search_path=public as $$ select nullif(regexp_replace(coalesce(_v,''),'\D','','g'),'') $$;
grant execute on function public._nid(text) to authenticated, service_role;

-- does account _uid already belong to a person whose national ID differs from this record's?
create or replace function public._identity_conflict(_kind text, _subject uuid, _uid uuid) returns boolean
language plpgsql stable security definer set search_path=public as $$
declare mine text; begin
  if _kind='student' then select _nid(national_id) into mine from students where id=_subject;
  elsif _kind='teacher' then select _nid(national_id) into mine from teachers where id=_subject;
  else select _nid(national_id) into mine from guardians where id=_subject; end if;
  if mine is null then return false; end if;
  return exists(select 1 from teachers where user_id=_uid and _nid(national_id) is not null and _nid(national_id)<>mine)
      or exists(select 1 from guardians where user_id=_uid and _nid(national_id) is not null and _nid(national_id)<>mine)
      or exists(select 1 from students where user_id=_uid and _nid(national_id) is not null and _nid(national_id)<>mine);
end $$;
revoke execute on function public._identity_conflict(text,uuid,uuid) from public, anon, authenticated;
grant execute on function public._identity_conflict(text,uuid,uuid) to service_role;

do $$ declare def text; begin
  select pg_get_functiondef('public._provision_link(text,uuid,uuid,uuid,boolean)'::regprocedure) into def;
  if position('if cur = _uid then return ''linked''; end if;' in def)=0 then raise exception 'body changed'; end if;
  def := replace(def, 'if cur = _uid then return ''linked''; end if;', 'if cur = _uid then return ''linked''; end if;
  if _identity_conflict(_kind, _subject, _uid) then
    insert into access_audit(org_id, school_id, actor, action, target_user, after, reason)
    select s.org_id, sch, _actor, ''account_link_review'', _uid, jsonb_build_object(''kind'', _kind, ''subject'', _subject), ''تعارض الهوية مع حساب قائم — لم يُربط'' from schools s where s.id=sch;
    return ''review'';
  end if;');
  execute def;
end $$;

create or replace function public.upsert_student_guardian(_student uuid, _name text, _phone text, _national_id text, _relationship text)
 returns table(guardian_id uuid, has_account boolean, created boolean)
 language plpgsql security definer set search_path to 'public'
as $function$
#variable_conflict use_column
declare st record; g record; a record; b record; ph text := coalesce(norm_phone(_phone), nullif(regexp_replace(coalesce(_phone,''),'\D','','g'),'')); nid text := _nid(_national_id); made boolean := false;
begin
  select * into st from students where id=_student;
  if st is null then raise exception 'الطالب غير موجود'; end if;
  if not can_manage_students(st.school_id) then raise exception 'لا تملك صلاحية إدارة الطلاب'; end if;
  if ph is null and nid is null then raise exception 'أدخل رقم هوية ولي الأمر أو جواله'; end if;
  if coalesce(trim(_name),'')='' then raise exception 'أدخل اسم ولي الأمر'; end if;
  if nid is not null then select * into a from guardians x where x.school_id=st.school_id and _nid(x.national_id)=nid order by x.created_at limit 1; end if;
  if ph is not null then select * into b from guardians x where x.school_id=st.school_id and (regexp_replace(coalesce(x.phone,''),'\D','','g')=ph or norm_phone(x.phone)=ph) order by x.created_at limit 1; end if;
  -- never merge on a partial match: ID and mobile must point to the same person (or one side unknown)
  if a.id is not null and b.id is not null and a.id <> b.id then raise exception 'تعارض: رقم الهوية والجوال مسجلان لوليي أمر مختلفين — راجع السجلين يدويًا'; end if;
  g := coalesce(a, b);
  if a.id is null and b.id is not null and nid is not null and _nid(b.national_id) is not null and _nid(b.national_id) <> nid then raise exception 'تعارض: الجوال مسجل لولي أمر برقم هوية مختلف — راجع يدويًا'; end if;
  if a.id is not null and ph is not null and a.phone is not null and coalesce(norm_phone(a.phone), regexp_replace(a.phone,'\D','','g')) <> ph then raise exception 'تعارض: رقم الهوية مسجل بجوال مختلف — حدّث جوال ولي الأمر من صفحته أولًا'; end if;
  if g.id is null then
    insert into guardians(school_id, full_name, phone, national_id) values (st.school_id, trim(_name), ph, nid) returning * into g;
    made := true;
  else
    update guardians set phone=coalesce(phone, ph), national_id=coalesce(national_id, nid) where id=g.id;
  end if;
  -- the relationship is approved by the authorized student manager who records it (verified_by = caller); mobile confirmation never approves it
  insert into student_guardians as sg (school_id, student_id, guardian_id, relationship, can_follow, can_pickup, verified, verified_by, verified_at)
  values (st.school_id, _student, g.id, coalesce(nullif(_relationship,''),'father'), true, true, true, auth.uid(), now())
  on conflict (student_id, guardian_id) do nothing;
  return query select g.id, g.user_id is not null, made;
end $function$;

create or replace function public._otp_may_send(_uid uuid, _phone text)
returns text language sql stable security definer set search_path=public as $$
  select case
    when not exists(select 1 from memberships m where m.user_id=_uid and m.is_active)
      and not exists(select 1 from account_setup a where a.user_id=_uid and a.completed_at is null) then 'not_school_account'
    when exists(select 1 from otp_sends s where s.phone=_phone and s.status <> 'refused' and s.created_at > now() - interval '60 seconds') then 'cooldown'
    when (select count(*) from otp_sends s where s.phone=_phone and s.status <> 'refused' and s.created_at > now() - interval '1 hour') >= 5 then 'hourly_limit'
    else null end
$$;