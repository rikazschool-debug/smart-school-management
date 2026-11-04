create or replace function public.org_school_set_gender(_id uuid, _gender text) returns void
language plpgsql security definer set search_path=public as $$
declare r schools; g text := nullif(trim(coalesce(_gender,'')),'');
begin
  select * into r from schools where id=_id for update;
  if r.id is null or not (is_platform_admin() or is_org_owner(r.org_id)) then raise exception 'ليست لديك صلاحية لهذا الإجراء' using errcode='42501'; end if;
  if r.student_gender is not distinct from g then return; end if;
  update schools set student_gender=g where id=_id;
  perform _access_audit(r.org_id, r.id, 'school_update', null, null, null, jsonb_build_object('student_gender', r.student_gender), jsonb_build_object('student_gender', g), null);
end $$;
revoke all on function public.org_school_set_gender(uuid,text) from public, anon;
grant execute on function public.org_school_set_gender(uuid,text) to authenticated;