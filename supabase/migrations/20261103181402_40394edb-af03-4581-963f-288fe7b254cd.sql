DROP FUNCTION public.pc_custody_list(uuid, text, text, uuid, boolean, integer, integer);
CREATE FUNCTION public.pc_custody_list(_org uuid, _status text, _q text, _school uuid, _mine boolean, _limit integer, _offset integer, _from date DEFAULT NULL, _to date DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare me uuid := auth.uid(); q text := nullif(btrim(coalesce(_q,'')),''); rows jsonb; n bigint;
begin
  if perm_scope(_org, me, 'procurement', 'view') is null then raise exception 'غير مصرح' using errcode='42501'; end if;
  if coalesce(_limit,50) > 200 and perm_scope(_org, me, 'procurement', 'export') is null then raise exception 'التصدير غير مصرح' using errcode='42501'; end if;
  with v as (select c.* from pc_custodies c where c.org_id=_org
      and _pc_ok(_org, me, 'view', c.school_id, c.holder_id, c.created_by)
      and (_school is null or c.school_id=_school) and (not coalesce(_mine,false) or c.holder_id=me)
      and (_status is null or (_status='overdue' and c.status in ('disbursed','settling') and c.settle_due < _pc_today()) or (_status='open' and c.status in ('disbursed','settling')) or (_status='past' and c.status in ('closed','rejected','cancelled')) or c.status=_status)
      and (_from is null or (c.created_at at time zone 'Asia/Riyadh')::date >= _from)
      and (_to is null or (c.created_at at time zone 'Asia/Riyadh')::date <= _to)
      and (q is null or c.ref ilike '%'||q||'%' or c.purpose ilike '%'||q||'%' or _pc_name(c.holder_id) ilike '%'||q||'%'))
  select (select count(*) from v), coalesce((select jsonb_agg(_pc_custody_row(x) order by x.created_at desc) from (select * from v order by created_at desc limit least(coalesce(_limit,50),5000) offset coalesce(_offset,0)) x),'[]')
    into n, rows;
  return jsonb_build_object('total', n, 'rows', rows);
end $function$;

DROP FUNCTION public.pc_request_list(uuid, text, text, text, uuid, integer, integer);
CREATE FUNCTION public.pc_request_list(_org uuid, _kind text, _status text, _q text, _custody uuid, _limit integer, _offset integer, _from date DEFAULT NULL, _to date DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare me uuid := auth.uid(); q text := nullif(btrim(coalesce(_q,'')),''); rows jsonb; n bigint;
begin
  if not section_enabled(_org, 'finance') then raise exception 'القسم غير مفعّل' using errcode='42501'; end if;
  if perm_scope(_org, me, 'procurement', 'view') is null and not exists(select 1 from pc_requests where org_id=_org and to_holder=me) then raise exception 'غير مصرح' using errcode='42501'; end if;
  if coalesce(_limit,50) > 200 and perm_scope(_org, me, 'procurement', 'export') is null then raise exception 'التصدير غير مصرح' using errcode='42501'; end if;
  with v as (select r.* from pc_requests r left join pc_custodies c on c.id=r.custody_id where r.org_id=_org
      and (r.to_holder = me or _pc_ok(_org, me, 'view', r.school_id, coalesce(c.holder_id, r.created_by), r.created_by))
      and (_kind is null or r.kind=_kind) and (_custody is null or r.custody_id=_custody)
      and (_status is null or (_status='open' and r.status in ('draft','submitted','approved')) or r.status=_status)
      and (_from is null or (r.created_at at time zone 'Asia/Riyadh')::date >= _from)
      and (_to is null or (r.created_at at time zone 'Asia/Riyadh')::date <= _to)
      and (q is null or r.ref ilike '%'||q||'%' or r.purpose ilike '%'||q||'%' or coalesce(r.supplier,'') ilike '%'||q||'%' or coalesce(c.ref,'') ilike '%'||q||'%'))
  select (select count(*) from v), coalesce((select jsonb_agg(_pc_request_row(x) order by x.created_at desc) from (select * from v order by created_at desc limit least(coalesce(_limit,50),5000) offset coalesce(_offset,0)) x),'[]')
    into n, rows;
  return jsonb_build_object('total', n, 'rows', rows);
end $function$;

DROP FUNCTION public.pc_need_list(uuid, text, integer, integer);
CREATE FUNCTION public.pc_need_list(_org uuid, _status text, _limit integer, _offset integer, _q text DEFAULT NULL, _from date DEFAULT NULL, _to date DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare q text := nullif(btrim(coalesce(_q,'')),'');
begin
  if not section_enabled(_org, 'finance') then raise exception 'القسم غير مفعّل' using errcode='42501'; end if;
  return jsonb_build_object(
    'rows', coalesce((select jsonb_agg(x) from (select _pc_request_row(r) || jsonb_build_object('assigned_name', case when r.assigned_to is not null then _pc_name(r.assigned_to) end,
        'mine', r.assigned_to = auth.uid()) x
      from pc_requests r where r.org_id=_org and r.kind='need' and (_status is null or r.status=_status) and _pc_need_ok(r.id)
        and (_from is null or (r.created_at at time zone 'Asia/Riyadh')::date >= _from)
        and (_to is null or (r.created_at at time zone 'Asia/Riyadh')::date <= _to)
        and (q is null or r.ref ilike '%'||q||'%' or r.purpose ilike '%'||q||'%')
      order by r.updated_at desc limit least(coalesce(_limit,50),200) offset coalesce(_offset,0)) t),'[]'),
    'can_create', exists(select 1 from memberships m join schools s on s.id=m.school_id where m.user_id=auth.uid() and m.org_id=_org and m.is_active and not coalesce(m.branch_suspended,false) and m.role in ('principal')) or is_org_owner(_org),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name) from schools s where s.org_id=_org and s.is_active and
        (is_org_owner(_org) or has_school_role(s.id, array['principal']::app_role[]))),'[]'));
end $function$;

REVOKE ALL ON FUNCTION public.pc_custody_list(uuid, text, text, uuid, boolean, integer, integer, date, date) FROM public, anon;
REVOKE ALL ON FUNCTION public.pc_request_list(uuid, text, text, text, uuid, integer, integer, date, date) FROM public, anon;
REVOKE ALL ON FUNCTION public.pc_need_list(uuid, text, integer, integer, text, date, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pc_custody_list(uuid, text, text, uuid, boolean, integer, integer, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pc_request_list(uuid, text, text, text, uuid, integer, integer, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pc_need_list(uuid, text, integer, integer, text, date, date) TO authenticated, service_role;