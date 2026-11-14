create or replace function public.upsert_student_guardian(_student uuid, _name text, _phone text, _national_id text, _relationship text)
returns table(guardian_id uuid, has_account boolean, created boolean)
language plpgsql security definer set search_path=public as $$
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
  insert into student_guardians(school_id, student_id, guardian_id, relationship, can_follow, can_pickup, verified, verified_by, verified_at)
  values (st.school_id, _student, g.id, coalesce(nullif(_relationship,''),'father'), true, true, true, auth.uid(), now())
  on conflict (student_id, guardian_id) do nothing;
  return query select g.id, g.user_id is not null, made;
end $$;
revoke execute on function public.upsert_student_guardian(uuid,text,text,text,text) from public, anon;
grant execute on function public.upsert_student_guardian(uuid,text,text,text,text) to authenticated;

-- service-role only: called by the server after it created the auth user
create or replace function public.link_guardian_account(_guardian uuid, _uid uuid, _actor uuid)
returns void language plpgsql security definer set search_path=public as $$
declare g record; org uuid; mid uuid;
begin
  select * into g from guardians where id=_guardian for update;
  if g is null then raise exception 'ولي الأمر غير موجود'; end if;
  if g.user_id is not null then raise exception 'لولي الأمر حساب مسبقًا'; end if;
  select org_id into org from schools where id=g.school_id;
  update guardians set user_id=_uid where id=_guardian;
  insert into memberships(user_id, org_id, school_id, role) values (_uid, org, g.school_id, 'guardian')
  on conflict do nothing returning id into mid;
  insert into access_audit(org_id, school_id, actor, action, target_user, target_membership, after, reason)
  values (org, g.school_id, _actor, 'guardian_account_created', _uid, mid, jsonb_build_object('guardian_id', _guardian), 'حساب ولي أمر تلقائي عند إضافة الطالب');
end $$;
revoke execute on function public.link_guardian_account(uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.link_guardian_account(uuid,uuid,uuid) to service_role;