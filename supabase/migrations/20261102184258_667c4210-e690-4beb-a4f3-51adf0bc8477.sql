
do $$ declare r record; d text; begin
  for r in select p.oid, pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('adm_meeting_attendance','adm_minutes_save','adm_task_comment') loop
    d := replace(r.def, 'not (m.organizer=auth.uid() or m.minutes_writer=auth.uid()) then', 'not coalesce(m.organizer=auth.uid() or m.minutes_writer=auth.uid(), false) then');
    d := replace(d, 'not (t.assignee=auth.uid() or t.assigner=auth.uid() or auth.uid()=any(t.participants) or _adm_lead(t.school_id)) then', 'not coalesce(t.assignee=auth.uid() or t.assigner=auth.uid() or auth.uid()=any(t.participants) or _adm_lead(t.school_id), false) then');
    if d = r.def then raise exception 'pattern not found in %', r.oid::regprocedure; end if;
    execute d;
  end loop;
end $$;
