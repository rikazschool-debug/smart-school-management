revoke execute on function public.ct_set(uuid,text,text,text) from public, anon, authenticated;

alter table public.adm_duty_quick alter column post_id drop not null;
alter table public.adm_duty_quick add column location text check (location is null or length(btrim(location)) between 2 and 120);

drop function public.adm_duty_quick_save(uuid,uuid,date,uuid,uuid,uuid,uuid,text,uuid);
drop function private.adm_duty_quick_save(uuid,uuid,date,uuid,uuid,uuid,uuid,text,uuid);
create function private.adm_duty_quick_save(_school uuid, _user uuid, _date date, _location text, _grade uuid, _section uuid, _period uuid, _note text, _client uuid)
 returns uuid language plpgsql security definer set search_path to 'public'
as $$
declare nid uuid; loc text := btrim(coalesce(_location,'')); begin
  if _client is not null then select id into nid from adm_duty_quick where created_by=auth.uid() and client_id=_client; if nid is not null then return nid; end if; end if;
  if not _adm_duty_manage(_school) then raise exception 'لا تملك صلاحية إدارة جداول المناوبة' using errcode='42501'; end if;
  if _date is null or _date < school_today() then raise exception 'اختر تاريخًا من اليوم فصاعدًا'; end if;
  if length(loc) < 2 or length(loc) > 120 then raise exception 'اكتب الموقع (2–120 حرفًا)'; end if;
  if not exists(select 1 from memberships m where m.school_id=_school and m.user_id=_user and m.is_active and not coalesce(m.branch_suspended,false) and m.role not in ('student','guardian','org_owner')) then raise exception 'اختر معلمًا أو إداريًا من الفرع'; end if;
  if _grade is not null and not exists(select 1 from grades where id=_grade and school_id=_school) then raise exception 'الصف غير صالح'; end if;
  if _section is not null and not exists(select 1 from sections where id=_section and school_id=_school and (_grade is null or grade_id=_grade)) then raise exception 'الشعبة غير صالحة'; end if;
  if _period is not null and not exists(select 1 from periods where id=_period and school_id=_school) then raise exception 'الحصة غير صالحة'; end if;
  insert into adm_duty_quick(school_id,user_id,date,location,grade_id,section_id,period_id,note,client_id)
    values (_school,_user,_date,loc,_grade,_section,_period,nullif(btrim(_note),''),_client) returning id into nid;
  perform _adm_log(_school, 'duty_quick', nid, 'assigned', jsonb_build_object('note', _adm_name(_user) || ' — ' || loc || ' ' || _date));
  perform _notify(_user, _school, 'admin', 'أُسند إليك إسناد سريع', loc || ' — ' || _date, '/app/admin/duties', 'adm:dq:' || nid);
  return nid;
end $$;
create function public.adm_duty_quick_save(_school uuid, _user uuid, _date date, _location text, _grade uuid, _section uuid, _period uuid, _note text, _client uuid)
 returns uuid language sql security invoker set search_path to 'public' as $$ select private.adm_duty_quick_save(_school,_user,_date,_location,_grade,_section,_period,_note,_client) $$;
revoke execute on function public.adm_duty_quick_save(uuid,uuid,date,text,uuid,uuid,uuid,text,uuid), private.adm_duty_quick_save(uuid,uuid,date,text,uuid,uuid,uuid,text,uuid) from public, anon;
grant execute on function public.adm_duty_quick_save(uuid,uuid,date,text,uuid,uuid,uuid,text,uuid), private.adm_duty_quick_save(uuid,uuid,date,text,uuid,uuid,uuid,text,uuid) to authenticated;

create or replace function private.adm_duty_quick_list(_school uuid, _from date, _to date, _mine boolean)
 returns table(id uuid, user_id uuid, user_name text, date date, post_id uuid, post text, grade text, section text, period text, period_time text, note text, status text, cancel_reason text, created_by_name text, created_at timestamptz)
 language plpgsql stable security definer set search_path to 'public'
as $$ begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not coalesce(_mine,false) and not _adm_duty_view(_school) then raise exception 'لا تملك صلاحية عرض المناوبات' using errcode='42501'; end if;
  return query select q.id, q.user_id, _adm_name(q.user_id), q.date, q.post_id, coalesce(q.location, p.name), g.name, s.name, pe.name,
      case when pe.id is null then null else to_char(pe.start_time,'HH24:MI') || '–' || to_char(pe.end_time,'HH24:MI') end,
      q.note, q.status, q.cancel_reason, _adm_name(q.created_by), q.created_at
    from adm_duty_quick q left join adm_duty_posts p on p.id=q.post_id
    left join grades g on g.id=q.grade_id left join sections s on s.id=q.section_id left join periods pe on pe.id=q.period_id
    where q.school_id=_school and q.date between coalesce(_from, q.date) and coalesce(_to, q.date)
      and (not coalesce(_mine,false) or q.user_id=auth.uid())
    order by q.date desc, q.created_at desc limit 500;
end $$;