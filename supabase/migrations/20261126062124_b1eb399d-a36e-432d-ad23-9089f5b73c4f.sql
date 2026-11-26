create or replace function public._au_rcpt_allowed(_code text, _org uuid, _school uuid, _uid uuid, _ev au_events, _ctx jsonb)
 returns boolean language plpgsql stable security definer set search_path to 'public' as $function$
begin
 if _uid is null then return false; end if;
 if _code='guardian' then
   return 'guardian' = any(_ev.recipients) and _ev.sensitivity <> 'restricted' and _school is not null and (_ctx->>'student') is not null
     and exists (select 1 from memberships m join schools s on s.id=m.school_id and s.org_id=_org and s.is_active
                 where m.user_id=_uid and m.org_id=_org and m.school_id=_school and m.role='guardian' and m.is_active and not coalesce(m.branch_suspended,false))
     and exists (select 1 from student_guardians sg join guardians g on g.id=sg.guardian_id
                 where g.user_id=_uid and sg.student_id=(_ctx->>'student')::uuid and sg.school_id=_school and sg.can_follow);
 end if;
 -- people linked to the record itself (assigner, evaluator, direct manager, the student's live teachers and their assigned supervisor):
 -- active staff membership in the same school is required; no section-wide grant needed. Restricted events still need the section grant for teacher/supervisor.
 if _code in ('assigner','assignee','requester','handler','organizer','employee','manager')
    or (_code in ('teacher','supervisor') and _ev.sensitivity <> 'restricted') then
   return exists (select 1 from memberships m where m.user_id=_uid and m.org_id=_org and m.role='org_owner' and m.is_active)
     or (_school is not null and exists (select 1 from memberships m where m.user_id=_uid and m.org_id=_org and m.school_id=_school and m.is_active
          and not coalesce(m.branch_suspended,false) and m.role::text not in ('student','guardian')));
 end if;
 return _au_rcpt_ok(_org, _school, _uid, _ev.section, _ev.sensitivity);
end $function$;
revoke all on function public._au_rcpt_allowed(text, uuid, uuid, uuid, au_events, jsonb) from public, anon, authenticated;