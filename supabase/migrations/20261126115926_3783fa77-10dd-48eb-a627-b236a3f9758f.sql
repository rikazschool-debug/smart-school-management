CREATE OR REPLACE FUNCTION public.mt_buses_list(_org uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare me uuid := auth.uid();
begin
  if not (_perm_owner(me,_org) or _perm_staff(_org,me)) then raise exception 'غير مصرح' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'school_id',b.school_id,'school',s.name,'code',b.code,'plate',b.plate,'model',b.model,'capacity',b.capacity,
      'odometer',b.odometer,'op_status',b.op_status,'next_service_date',b.next_service_date,'next_service_km',b.next_service_km,'notes',b.notes,'active',b.active,
      'inspection_date',b.inspection_date,'license_expiry',b.license_expiry,'inspection_state',_mt_doc_state(b.inspection_date),'license_state',_mt_doc_state(b.license_expiry),
      'service_due', (b.next_service_date is not null and b.next_service_date <= (now() at time zone 'Asia/Riyadh')::date) or (b.next_service_km is not null and b.odometer is not null and b.odometer >= b.next_service_km),
      'open_requests',(select count(*) from mt_requests r where r.bus_id=b.id and r.status not in ('closed','cancelled')),
      'responsible_user',b.responsible_user,'responsible',case when b.responsible_user is not null then _adm_name(b.responsible_user) end,
      'can_fleet',_mt_ok(me,b.school_id,'bus','fleet')) order by s.name, b.code)
    from mt_buses b join schools s on s.id=b.school_id
   where b.org_id=_org and (_mt_ok(me,b.school_id,'bus','fleet') or _mt_ok(me,b.school_id,'bus','request') or _mt_ok(me,b.school_id,'bus','view')
      or _mt_ok(me,b.school_id,'bus','follow') or _mt_ok(me,b.school_id,'bus','execute'))),'[]');
end $function$;

CREATE OR REPLACE FUNCTION public.od_list(_org uuid, _what text, _q text DEFAULT NULL::text, _school uuid DEFAULT NULL::uuid, _status text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare q text := nullif(trim(coalesce(_q,'')),''); begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولًا'; end if;
  if _what = 'docs' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'school_id',d.school_id,'school',(select name from schools where id=d.school_id),
      'kind',d.kind,'name',d.name,'doc_no',d.doc_no,'issuer',d.issuer,'issued_on',d.issued_on,'expires_on',d.expires_on,'status',_od_status(d.expires_on),
      'responsible_user',d.responsible_user,'responsible',case when d.responsible_user is not null then _adm_name(d.responsible_user) end,
      'file_id',d.file_id,'file_name',(select name from files where id=d.file_id),'updated_at',d.updated_at) order by d.expires_on nulls last, d.name)
      from org_docs d where d.org_id=_org and d.archived_at is null
        and _od_ok(d.org_id, case when d.school_id is null then '{}'::uuid[] else array[d.school_id] end, 'view', false)
        and (_school is null or d.school_id=_school)
        and (_status is null or _od_status(d.expires_on)=_status)
        and (q is null or d.name ilike '%'||q||'%' or d.kind ilike '%'||q||'%' or coalesce(d.doc_no,'') ilike '%'||q||'%' or coalesce(d.issuer,'') ilike '%'||q||'%')), '[]'::jsonb);
  elsif _what = 'contractors' then
    return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'service',c.service,'contact_name',c.contact_name,'phone',c.phone,'email',c.email,
      'school_ids',c.school_ids,'schools',(select coalesce(jsonb_agg(s.name),'[]') from schools s where s.id = any(c.school_ids)),
      'starts_on',c.starts_on,'ends_on',c.ends_on,'status',_od_status(c.ends_on),'notes',c.notes,'community_partner',c.community_partner,
      'files',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name)),'[]') from files f where f.id = any(c.file_ids))) order by c.name)
      from org_contractors c where c.org_id=_org and c.archived_at is null and _od_ok(c.org_id, c.school_ids, 'view', false)
        and (_school is null or _school = any(c.school_ids))
        and (_status is null or _od_status(c.ends_on)=_status)
        and (q is null or c.name ilike '%'||q||'%' or c.service ilike '%'||q||'%' or coalesce(c.contact_name,'') ilike '%'||q||'%')), '[]'::jsonb);
  end if;
  raise exception 'نوع غير معروف';
end $function$;