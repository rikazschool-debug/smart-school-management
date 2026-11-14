CREATE OR REPLACE FUNCTION public.sanad_alerts_tick()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare r record; u record; n int := 0;
begin
  -- 1) student absent on each of their last 3 recorded school days (within 10 days) → principal + counselor
  for r in
    with last3 as (
      select d.school_id, d.student_id, d.date, d.status, row_number() over (partition by d.student_id, d.school_id order by d.date desc) rn
      from attendance_days d where d.date >= (now() at time zone 'Asia/Riyadh')::date - 10)
    select l.school_id, l.student_id, max(l.date) last_date, s.full_name
    from last3 l join students s on s.id = l.student_id
    where l.rn <= 3 group by l.school_id, l.student_id, s.full_name
    having count(*) = 3 and bool_and(l.status = 'absent')
  loop
    for u in select distinct m.user_id from memberships m where m.school_id = r.school_id and m.is_active and not coalesce(m.branch_suspended,false) and m.role in ('principal','counselor') loop
      perform _notify(u.user_id, r.school_id, 'sanad', 'تنبيه سند: غياب متتالٍ', 'الطالب '||r.full_name||' غاب 3 أيام متتالية حتى '||to_char(r.last_date,'YYYY-MM-DD'), '/app/attendance', 'sanad:abs3:'||r.student_id||':'||r.last_date);
      n := n + 1;
    end loop;
  end loop;
  -- 2) homework with submissions waiting more than 7 days without a grade → principal + the homework's creator
  for r in
    select h.id, h.school_id, h.title, h.created_by, count(*) cnt
    from homework_submissions sb join homework h on h.id = sb.homework_id
    where sb.status in ('submitted','resubmitted') and sb.last_submitted_at < now() - interval '7 days'
      and not exists (select 1 from homework_grades g where g.homework_id = sb.homework_id and g.student_id = sb.student_id)
    group by h.id, h.school_id, h.title, h.created_by
  loop
    for u in select distinct x.uid from (
        select m.user_id uid from memberships m where m.school_id = r.school_id and m.is_active and not coalesce(m.branch_suspended,false) and m.role = 'principal'
        union select r.created_by where r.created_by is not null) x loop
      perform _notify(u.uid, r.school_id, 'sanad', 'تنبيه سند: تسليمات بلا تصحيح', r.cnt||' تسليم في «'||r.title||'» بانتظار التصحيح منذ أكثر من أسبوع', '/app/homework', 'sanad:hw7:'||r.id||':'||to_char(now() at time zone 'Asia/Riyadh','IYYY-IW'));
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
REVOKE ALL ON FUNCTION public.sanad_alerts_tick() FROM public, anon, authenticated;
SELECT cron.schedule('rikaz-sanad-alerts', '30 4 * * *', 'select public.sanad_alerts_tick()');