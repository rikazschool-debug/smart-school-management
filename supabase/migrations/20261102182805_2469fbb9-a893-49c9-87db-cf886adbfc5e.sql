
create or replace function public.adm_daily_reminders(_only uuid[] default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare tmr date := school_today() + 1; n int := 0; r record; begin
  for r in select t.* from adm_tasks t where t.due_date=tmr and t.status in ('new','in_progress','returned') and (_only is null or t.school_id = any(_only)) loop
    perform _notify(r.assignee, r.school_id, 'admin', 'تذكير: تكليف مستحق غدًا', r.title, '/app/admin/tasks/' || r.id, 'adm:rem:task:' || r.id || ':' || tmr); n := n + 1;
  end loop;
  for r in select a.*, po.name pn from adm_duty_assignments a join adm_duty_posts po on po.id=a.post_id join adm_duty_rosters ro on ro.id=a.roster_id
      where a.date=tmr and a.status='assigned' and ro.status='published' and (_only is null or a.school_id = any(_only)) loop
    perform _notify(r.user_id, r.school_id, 'admin', 'تذكير: لديك مناوبة غدًا', r.pn || ' — ' || to_char(r.start_time, 'HH24:MI'), '/app/admin/duties', 'adm:rem:duty:' || r.id); n := n + 1;
  end loop;
  for r in select m.*, u.u uid, u.s usch from adm_meetings m cross join lateral (select x.user_id u, coalesce(x.school_id, m.school_id) s from adm_meeting_members x where x.meeting_id=m.id and x.rsvp <> 'declined' and not x.banned union select m.organizer, m.school_id) u
      where m.status='scheduled' and m.live_status <> 'ended' and (m.starts_at at time zone 'Asia/Riyadh')::date=tmr and (_only is null or m.school_id = any(_only)) loop
    perform _notify(r.uid, r.usch, 'admin', 'تذكير: اجتماع غدًا', case when r.privacy='restricted' then to_char(r.starts_at at time zone 'Asia/Riyadh', 'HH24:MI') else r.title || ' — ' || to_char(r.starts_at at time zone 'Asia/Riyadh', 'HH24:MI') end,
      '/app/admin/meetings/' || r.id, 'adm:rem:meet:' || r.id || ':' || r.uid || ':' || tmr); n := n + 1;
  end loop;
  return jsonb_build_object('sent', n, 'for', tmr);
end $$;
drop function if exists public.adm_daily_reminders();
revoke execute on function public.adm_daily_reminders(uuid[]) from public, anon, authenticated;
