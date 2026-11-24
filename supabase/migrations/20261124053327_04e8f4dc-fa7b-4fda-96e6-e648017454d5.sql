-- 1) family-role label helpers: only internal (called by SECURITY DEFINER chat functions)
revoke execute on function public._cg_generic_label(uuid,uuid) from public, anon, authenticated;
revoke execute on function public._cg_generic_label2(uuid,uuid) from public, anon, authenticated;

-- 2) staff check: policies use a caller-only variant; the two-argument helper stays internal
create or replace function public._adm_staff_self(_school uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public._adm_staff(_school, auth.uid())
$$;
revoke execute on function public._adm_staff_self(uuid) from public, anon;
grant execute on function public._adm_staff_self(uuid) to authenticated, service_role;

drop policy if exists duty_posts_read on public.adm_duty_posts;
create policy duty_posts_read on public.adm_duty_posts for select to authenticated
  using (public._adm_staff_self(school_id) or public.can_manage_school(school_id));
drop policy if exists duty_settings_read on public.adm_duty_settings;
create policy duty_settings_read on public.adm_duty_settings for select to authenticated
  using (public._adm_staff_self(school_id) or public.can_manage_school(school_id));

revoke execute on function public._adm_staff(uuid,uuid) from public, anon, authenticated;
grant execute on function public._adm_staff(uuid,uuid) to service_role;

-- 3) meetings: an invitee/lead reads only while holding an active membership in the meeting's branch (or org)
create or replace function public.adm_can_read_meeting(_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists(select 1 from adm_meetings m where m.id=_id and m.course_id is null and (
    m.organizer=auth.uid() or m.minutes_writer=auth.uid()
    or public.is_org_owner(coalesce(m.org_id, public.school_org(m.school_id)))
    or (m.status <> 'draft' and (
      exists(select 1 from adm_meeting_members x where x.meeting_id=m.id and x.user_id=auth.uid()
        and exists(select 1 from memberships mm where mm.user_id=auth.uid() and mm.is_active and not coalesce(mm.branch_suspended,false)
          and (case when coalesce(x.school_id, m.school_id) is not null then mm.school_id = coalesce(x.school_id, m.school_id)
                    else mm.org_id = m.org_id end)))
      or (m.privacy='normal' and m.scope='school' and (_adm_lead(m.school_id) or _adm_dept(m.school_id, m.department_id)))))))
$function$;