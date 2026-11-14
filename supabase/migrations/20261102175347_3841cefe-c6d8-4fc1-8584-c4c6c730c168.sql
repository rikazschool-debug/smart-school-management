
create or replace function public._adm_live_cut_suspend_trg() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.is_active and not new.is_active then
    insert into adm_meeting_revocations(meeting_id, user_id, uid, kind)
      select p.meeting_id, p.user_id, p.uid, 'suspend' from adm_meeting_presence p join adm_meetings m on m.id=p.meeting_id
      where p.user_id=new.user_id and m.live_status='live' and p.left_at is null and m.org_id = coalesce(new.org_id, school_org(new.school_id))
        and _adm_invitee_school(m.org_id, m.school_id, m.scope, new.user_id) is null
        and not (m.organizer=new.user_id and exists(select 1 from memberships z where z.user_id=new.user_id and z.is_active and ((z.role='org_owner' and z.org_id=m.org_id) or (z.school_id=m.school_id and z.role in ('principal','vice_principal','dept_head')))))
        and not exists(select 1 from adm_meeting_revocations r where r.meeting_id=p.meeting_id and r.user_id=p.user_id and r.kind='suspend' and r.done_at is null);
    update adm_meetings m set screen_sharer=null, screen_since=null where m.screen_sharer=new.user_id and m.live_status='live' and _adm_invitee_school(m.org_id, m.school_id, m.scope, new.user_id) is null;
  end if;
  return new;
end $$;
revoke execute on function public._adm_live_cut_suspend_trg() from public, anon, authenticated;

-- keep "تغيّر موعد" title for time/place changes
create or replace function public._adm_meet_title_fix() returns void language sql as $$ select null::void $$;
drop function public._adm_meet_title_fix();
