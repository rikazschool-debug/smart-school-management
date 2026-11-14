create or replace function public._perm_allows_user(_school uuid, _uid uuid, _section text, _action text)
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select _uid is not null and _school is not null and not _perm_denied(school_org(_school),_uid,_section,_action)
     and (_perm_area(_section) is null or _perm_area(_section) not in ('operations','admissions','evaluation','hr','comm_hub') or section_enabled(school_org(_school),_perm_area(_section)))
     and (_perm_base(_school,_uid,_section,_action) or _perm_granted(_school,_uid,_section,_action)) $$;

create or replace function public._adm_hub(_school uuid, _action text)
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select _school is not null and _perm_allows_user(_school, auth.uid(), 'hub_meetings', _action) $$;
revoke all on function public._adm_hub(uuid,text) from public, anon;
grant execute on function public._adm_hub(uuid,text) to authenticated;

create or replace function public._adm_can_organize(_school uuid)
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select perm_allows(_school,'meetings','organize') or _adm_hub(_school,'create') $$;

create or replace function public._adm_live_role(_id uuid)
 returns text language sql stable security definer set search_path to 'public' as $$
  select case
    when m.course_id is not null then case
      when m.organizer=auth.uid() and _vc_teacher(m.course_id, auth.uid()) then 'host'
      when exists(select 1 from adm_meeting_members x where x.meeting_id=m.id and x.user_id=auth.uid() and not x.banned) and _vc_student(m.course_id, auth.uid()) then 'member' end
    when m.organizer=auth.uid() and (is_org_owner(m.org_id) or has_school_role(m.school_id, array['principal','vice_principal','dept_head']::app_role[]) or _adm_hub(m.school_id,'start')) then 'host'
    when exists(select 1 from adm_meeting_members x where x.meeting_id=m.id and x.user_id=auth.uid() and not x.banned)
      and _adm_invitee_school(m.org_id, m.school_id, m.scope, auth.uid()) is not null then 'member'
  end from adm_meetings m where m.id=_id $$;

create or replace function public.adm_meeting_attendance(_id uuid, _marks jsonb)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare m adm_meetings; e jsonb; begin
  select * into m from adm_meetings where id=_id for update;
  if m.id is null or not coalesce(m.organizer=auth.uid() or m.minutes_writer=auth.uid() or (m.course_id is null and _adm_hub(m.school_id,'attend')), false) then raise exception 'تسجيل الحضور للمنظم أو كاتب المحضر أو صاحب صلاحية تسجيل الحضور'; end if;
  if m.status not in ('scheduled','held') then raise exception 'الاجتماع غير منعقد'; end if;
  if now() < m.starts_at - interval '15 minutes' then raise exception 'يُسجّل الحضور عند بدء الاجتماع'; end if;
  for e in select * from jsonb_array_elements(coalesce(_marks,'[]')) loop
    update adm_meeting_members set attended=(e->>'attended')::boolean, attendance_note=nullif(btrim(e->>'note'),''), marked_by=auth.uid(), marked_at=now()
      where meeting_id=_id and user_id=(e->>'user_id')::uuid;
    if not found then raise exception 'المسجل ليس من المدعوين'; end if;
  end loop;
  update adm_meetings set status='held', updated_at=now() where id=_id and status='scheduled';
  perform _adm_log(m.school_id, 'meeting', _id, 'attendance', jsonb_build_object('count', jsonb_array_length(coalesce(_marks,'[]'))));
end $function$;