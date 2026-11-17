create or replace function private.sv4_hr_hours_org(_org uuid, _from date, _to date) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare sch uuid[];
begin
 if _from is null or _to is null or _to < _from then raise exception 'تاريخ البداية يجب أن يسبق تاريخ النهاية'; end if;
 if _to - _from > 366 then raise exception 'أقصى مدة للتقرير سنة واحدة'; end if;
 select coalesce(array_agg(s.id),'{}') into sch from schools s where s.org_id=_org and public._hr_school_ok(s.id,'view');
 if cardinality(sch)=0 then raise exception 'عرض ساعات التطوير لمن يملك صلاحية الموارد البشرية في الفرع'; end if;
 return jsonb_build_object(
  'schools',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name),'[]') from schools s where s.id=any(sch)),
  'rows',coalesce((select jsonb_agg(jsonb_build_object('school_id',g.school_id,'school',sc.name,'user_id',a.user_id,'name',private._sv_name(a.user_id),'program_id',g.id,'program',g.title,'mode',g.mode,
     'session_id',s.id,'starts_at',s.starts_at,'ends_at',s.ends_at,'hours',round((extract(epoch from s.ends_at-s.starts_at)/3600)::numeric,2)) order by s.starts_at, private._sv_name(a.user_id))
   from sv4_attendance a join sv4_sessions s on s.id=a.session_id join sv4_programs g on g.id=s.program_id join schools sc on sc.id=g.school_id
   where g.school_id=any(sch) and a.status='present' and s.status='scheduled'
     and (s.starts_at at time zone 'Asia/Riyadh')::date between _from and _to),'[]'));
end $$;
create or replace function public.sv4_hr_hours_org(_org uuid, _from date, _to date) returns jsonb language sql stable set search_path=public as $w$ select private.sv4_hr_hours_org(_org,_from,_to) $w$;
revoke all on function private.sv4_hr_hours_org(uuid,date,date) from public, anon;
grant execute on function private.sv4_hr_hours_org(uuid,date,date) to authenticated;
revoke all on function public.sv4_hr_hours_org(uuid,date,date) from public, anon;
grant execute on function public.sv4_hr_hours_org(uuid,date,date) to authenticated;