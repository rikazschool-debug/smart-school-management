create or replace function public.gb_submit(_gb uuid) returns void language plpgsql security definer set search_path=public as $$
declare g gradebooks; miss int; u uuid; dep uuid;
begin
  select * into g from gradebooks where id=_gb;
  if not public._gb_teacher(g.course_id) then raise exception 'الإرسال لمعلم المقرر بتكليف ساري'; end if;
  if g.status not in ('draft','returned') then raise exception 'السجل ليس مسودة أو معادًا'; end if;
  select count(*) into miss from public._gb_roster(_gb) x cross join grade_plan_items i
    left join gradebook_entries e on e.gradebook_id=_gb and e.student_id=x.student_id and e.item_id=i.id
    where x.active and i.plan_id=g.plan_id and (e.id is null or e.status='missing');
  if miss > 0 then raise exception 'توجد % خانة غير مرصودة؛ ارصد الدرجة أو حدد غائب/معفى', miss; end if;
  update gradebooks set status='submitted', submitted_by=auth.uid(), submitted_at=now(), return_reason=null, reopen_until=null, updated_at=now() where id=_gb;
  perform public._gb_log(_gb, 'submitted', '{}');
  select s.department_id into dep from courses c join subjects s on s.id=c.subject_id where c.id=g.course_id;
  for u in select m.user_id from memberships m where m.school_id=g.school_id and m.is_active and (
      (dep is not null and m.role='dept_head' and m.department_id=dep) or (dep is null and m.role in ('principal','vice_principal'))) loop
    perform public._notify(u, g.school_id, 'grades', 'سجل درجات بانتظار المراجعة', public._gb_course_label(g.course_id), '/app/grades?gb=' || _gb, 'gb-sub-' || _gb || '-' || extract(epoch from now())::bigint);
  end loop;
end $$;