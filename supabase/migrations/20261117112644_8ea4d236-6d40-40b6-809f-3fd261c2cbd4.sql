alter table public.org_contractors add column if not exists community_partner boolean not null default false;

CREATE OR REPLACE FUNCTION public.od_save_contractor(_org uuid, _p jsonb)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare c org_contractors; sc uuid[]; fs uuid[]; f uuid; cp boolean := coalesce((_p->>'community_partner')::boolean, false); begin
  sc := coalesce((select array_agg(distinct x::uuid) from jsonb_array_elements_text(coalesce(_p->'school_ids','[]')) x), '{}');
  fs := coalesce((select array_agg(distinct x::uuid) from jsonb_array_elements_text(coalesce(_p->'file_ids','[]')) x), '{}');
  if array_length(sc,1) is null then raise exception 'اختر مدرسة واحدة على الأقل'; end if;
  if length(trim(coalesce(_p->>'name',''))) < 2 or length(trim(coalesce(_p->>'service',''))) < 2 then raise exception 'اكتب اسم المتعهد ونوع الخدمة'; end if;
  if (_p->>'starts_on') is not null and (_p->>'ends_on') is not null and (_p->>'ends_on')::date < (_p->>'starts_on')::date then raise exception 'تاريخ الانتهاء قبل تاريخ السريان'; end if;
  if nullif(_p->>'id','') is null then
    if not _od_ok(_org, sc, 'create', true) then raise exception 'لا تملك صلاحية الإضافة لكل المدارس المختارة' using errcode='42501'; end if;
  else
    select * into c from org_contractors where id=(_p->>'id')::uuid and org_id=_org;
    if c.id is null or not _od_ok(_org, c.school_ids, 'edit', true) or not _od_ok(_org, sc, 'edit', true) then raise exception 'لا تملك صلاحية التعديل' using errcode='42501'; end if;
    if exists(select 1 from unnest(c.file_ids) x where not x = any(fs)) then raise exception 'لا يمكن حذف مرفق محفوظ'; end if;
  end if;
  foreach f in array fs loop
    if c.id is null or not f = any(c.file_ids) then perform _od_claim(_org, f); end if;
  end loop;
  if c.id is null then
    insert into org_contractors(org_id, name, service, contact_name, phone, email, school_ids, starts_on, ends_on, notes, file_ids, community_partner, created_by, updated_by)
      values (_org, trim(_p->>'name'), trim(_p->>'service'), nullif(trim(_p->>'contact_name'),''), nullif(trim(_p->>'phone'),''), nullif(trim(_p->>'email'),''),
        sc, nullif(_p->>'starts_on','')::date, nullif(_p->>'ends_on','')::date, nullif(trim(_p->>'notes'),''), fs, cp, auth.uid(), auth.uid()) returning * into c;
  else
    update org_contractors set name=trim(_p->>'name'), service=trim(_p->>'service'), contact_name=nullif(trim(_p->>'contact_name'),''), phone=nullif(trim(_p->>'phone'),''),
      email=nullif(trim(_p->>'email'),''), school_ids=sc, starts_on=nullif(_p->>'starts_on','')::date, ends_on=nullif(_p->>'ends_on','')::date,
      notes=nullif(trim(_p->>'notes'),''), file_ids=fs, community_partner=cp, updated_by=auth.uid(), updated_at=now() where id=c.id returning * into c;
  end if;
  return c.id;
end $function$;

CREATE OR REPLACE FUNCTION public.od_list(_org uuid, _what text, _q text DEFAULT NULL::text, _school uuid DEFAULT NULL::uuid, _status text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare q text := nullif(trim(coalesce(_q,'')),''); begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولًا'; end if;
  if _what = 'docs' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'school_id',d.school_id,'school',(select name from schools where id=d.school_id),
      'kind',d.kind,'name',d.name,'doc_no',d.doc_no,'issuer',d.issuer,'issued_on',d.issued_on,'expires_on',d.expires_on,'status',_od_status(d.expires_on),
      'file_id',d.file_id,'file_name',(select name from files where id=d.file_id),'updated_at',d.updated_at) order by d.expires_on nulls last, d.name)
      from org_docs d where d.org_id=_org
        and _od_ok(d.org_id, case when d.school_id is null then '{}'::uuid[] else array[d.school_id] end, 'view', false)
        and (_school is null or d.school_id=_school)
        and (_status is null or _od_status(d.expires_on)=_status)
        and (q is null or d.name ilike '%'||q||'%' or d.kind ilike '%'||q||'%' or coalesce(d.doc_no,'') ilike '%'||q||'%' or coalesce(d.issuer,'') ilike '%'||q||'%')), '[]'::jsonb);
  elsif _what = 'contractors' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'service',c.service,'contact_name',c.contact_name,'phone',c.phone,'email',c.email,
      'school_ids',c.school_ids,'schools',(select coalesce(jsonb_agg(s.name),'[]') from schools s where s.id = any(c.school_ids)),
      'starts_on',c.starts_on,'ends_on',c.ends_on,'status',_od_status(c.ends_on),'notes',c.notes,'community_partner',c.community_partner,
      'files',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name)),'[]') from files f where f.id = any(c.file_ids))) order by c.name)
      from org_contractors c where c.org_id=_org and _od_ok(c.org_id, c.school_ids, 'view', false)
        and (_school is null or _school = any(c.school_ids))
        and (_status is null or _od_status(c.ends_on)=_status)
        and (q is null or c.name ilike '%'||q||'%' or c.service ilike '%'||q||'%' or coalesce(c.contact_name,'') ilike '%'||q||'%')), '[]'::jsonb);
  end if;
  raise exception 'نوع غير معروف';
end $function$;