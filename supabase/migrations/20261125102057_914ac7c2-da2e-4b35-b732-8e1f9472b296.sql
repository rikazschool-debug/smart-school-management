create or replace function public._api_rows_v2(_res text, _org uuid, _sch uuid[], _all boolean, _yrs uuid[], _terms uuid[], _secs uuid[], _stages uuid[], _grades uuid[], _stu uuid[], _id uuid, _key uuid)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(v) from (select t.id, t.school_id, t.title, t.description, t.priority, t.status, t.progress, t.start_date, t.due_date, t.done_at, t.updated_at
    from adm_tasks t where _res = 'admin_tasks' and t.school_id = any(_sch) and (_id is null or t.id = _id)) v
  union all
  select to_jsonb(v) from (select m.id, m.school_id, m.title, m.purpose, m.starts_at, m.duration_min, m.location, m.mode, m.status, m.agenda, m.link, m.updated_at
    from adm_meetings m where _res = 'admin_meetings' and m.school_id = any(_sch) and m.privacy = 'normal' and m.course_id is null and m.status <> 'draft' and (_id is null or m.id = _id)) v
  union all
  select to_jsonb(v) from (select d.id, d.school_id, d.meeting_id, d.body, d.priority, d.due_date, d.task_id, d.created_at
    from adm_decisions d join adm_meetings m on m.id = d.meeting_id and m.privacy = 'normal' and m.course_id is null
    where _res = 'admin_decisions' and d.school_id = any(_sch) and (_id is null or d.id = _id)) v
  union all
  select to_jsonb(v) from (select b.id, b.school_id, b.name, b.floors, b.has_basement, b.notes, b.updated_at
    from fm_buildings b where _res = 'school_buildings' and b.org_id = _org and b.school_id = any(_sch) and (_id is null or b.id = _id)) v
  union all
  select to_jsonb(v) from (select r.id, r.school_id, r.building_id, r.category, r.name, r.code, r.floor, r.capacity, r.area, r.status, r.equipment, r.resp_title, r.resp_phone, r.updated_at
    from fm_rooms r where _res = 'school_rooms' and r.org_id = _org and r.school_id = any(_sch) and (_id is null or r.id = _id)) v
  union all
  select to_jsonb(v) from (select e.id, e.school_id, e.student_id, e.section_id, e.year_id, e.status, e.start_date, e.end_date, e.updated_at
    from enrollments e where _res = 'enrollments' and e.school_id = any(_sch) and (_stu is null or e.student_id = any(_stu)) and (_secs is null or e.section_id = any(_secs))
      and (_yrs is null or e.year_id = any(_yrs)) and (_id is null or e.id = _id)) v
  union all
  select to_jsonb(v) from (select r.id, r.school_id, r.student_id, r.collection_id, r.number, r.issued_at
    from sf_receipts r where _res = 'receipts' and r.org_id = _org and r.school_id = any(_sch) and (_stu is null or r.student_id = any(_stu)) and (_id is null or r.id = _id)) v
  union all
  select to_jsonb(v) from (select t.id, t.school_id, t.year_id, t.name, t.start_date, t.end_date, t.available, t.updated_at
    from terms t where _res = 'terms' and t.school_id = any(_sch) and (_yrs is null or t.year_id = any(_yrs)) and (_terms is null or t.id = any(_terms)) and (_id is null or t.id = _id)) v
  union all
  select to_jsonb(v) from (select d.id, d.school_id, d.name, d.updated_at
    from departments d where _res = 'departments' and d.school_id = any(_sch) and (_id is null or d.id = _id)) v
  union all
  select to_jsonb(v) from (select s.id, s.school_id, s.department_id, s.name, s.code, s.updated_at
    from subjects s where _res = 'subjects' and s.school_id = any(_sch) and (_id is null or s.id = _id)) v
  union all
  select to_jsonb(v) from (select c.id, c.school_id, c.year_id, c.term_id, c.subject_id, c.section_id, c.weekly_periods, c.updated_at
    from courses c where _res = 'courses' and c.school_id = any(_sch) and (_secs is null or c.section_id = any(_secs)) and (_yrs is null or c.year_id = any(_yrs))
      and (_terms is null or c.term_id is null or c.term_id = any(_terms)) and (_id is null or c.id = _id)) v
  union all
  select to_jsonb(v) from (select a.id, a.school_id, a.course_id, a.teacher_id, a.start_date, a.end_date, a.status, a.updated_at
    from teacher_assignments a join courses c on c.id = a.course_id
    where _res = 'teacher_assignments' and a.school_id = any(_sch) and (_secs is null or c.section_id = any(_secs)) and (_yrs is null or c.year_id = any(_yrs)) and (_id is null or a.id = _id)) v
  union all
  select to_jsonb(v) from (select s.id, s.school_id, s.slot_id, s.date, s.substitute_teacher_id, s.status, s.created_at
    from substitutions s where _res = 'substitutions' and s.school_id = any(_sch) and (_id is null or s.id = _id)) v
  union all
  select to_jsonb(v) from (select g.id, g.school_id, g.student_id, g.date, g.kind, g.at, g.note
    from gate_movements g where _res = 'gate_movements' and g.school_id = any(_sch) and (_stu is null or g.student_id = any(_stu)) and (_id is null or g.id = _id)) v
  union all
  select to_jsonb(v) from (select p.id, p.school_id, p.student_id, p.full_name, p.relationship, p.phone, p.national_id, p.active, p.created_at
    from authorized_pickups p where _res = 'authorized_pickups' and p.school_id = any(_sch) and (_stu is null or p.student_id = any(_stu)) and (_id is null or p.id = _id)) v
  union all
  select to_jsonb(v) from (select a.id, a.school_id, a.item_id, a.ref, a.category, a.student_id, a.participant_name, a.phone, a.email, a.status, a.created_at, a.updated_at
    from evt_applications a join evt_items e on e.id = a.item_id and e.status in ('published', 'completed')
    where _res = 'event_applications' and a.org_id = _org and (a.school_id = any(_sch) or (a.school_id is null and _all)) and (_stu is null or a.student_id = any(_stu)) and (_id is null or a.id = _id)) v
  union all
  select to_jsonb(v) from (select c.id, c.school_id, c.title, c.body, c.publisher_label, c.priority, c.requires_ack, c.ack_due, c.published_at, c.updated_at
    from circulars c where _res = 'circulars' and c.org_id = _org and c.status = 'published'
      and (c.school_id = any(_sch) or (c.school_id is null and (_all or c.target_schools && _sch))) and (_id is null or c.id = _id)) v
  union all
  select to_jsonb(v) from (select o.id, o.name,
      (select count(*) from schools s where s.org_id = o.id) schools,
      (select count(*) from students x join schools s on s.id = x.school_id where s.org_id = o.id and x.status = 'active') students_active,
      (select count(*) from teachers t join schools s on s.id = t.school_id where s.org_id = o.id and t.status = 'active') staff,
      (select count(*) from hr_employees e where e.org_id = o.id and e.end_date is null) employees,
      (select count(*) from mt_requests m where m.org_id = o.id and m.status not in ('draft', 'closed', 'cancelled')) open_maintenance,
      (select count(*) from support_tickets t where t.org_id = o.id and t.scope = 'school' and t.status not in ('closed', 'resolved')) open_tickets,
      (select count(*) from ad_applications a where a.org_id = o.id and a.decision is null) pending_admissions
    from organizations o where _res = 'org_summary' and o.id = _org and _all and (_id is null or o.id = _id)) v
  union all
  select to_jsonb(v) from (select s.id, s.id school_id, s.name school_name,
      (select coalesce(sum(o.amount), 0) from sf_obligations o where o.school_id = s.id and o.status <> 'exempt') obligations,
      (select coalesce(sum(c.amount), 0) from sf_collections c where c.school_id = s.id and c.status <> 'reversed') collected,
      (select coalesce(sum((_sf_balance(o.id)->>'remaining')::numeric), 0) from sf_obligations o where o.school_id = s.id and o.status = 'pending') remaining,
      (select count(distinct o.student_id) from sf_obligations o where o.school_id = s.id) students
    from schools s where _res = 'fin_summary' and s.org_id = _org and s.id = any(_sch) and (_id is null or s.id = _id)) v
  union all
  select to_jsonb(v) from (select d.id, d.year_key, d.name, d.description, d.kind, d.value_type, d.value, d.starts, d.ends, d.automatic, d.active, d.updated_at
    from sf_discounts d where _res = 'discounts' and d.org_id = _org and (_all or d.school_ids is null or d.school_ids && _sch) and (_id is null or d.id = _id)) v
  union all
  select to_jsonb(v) from (select r.id, r.school_id, r.ref, r.kind, r.amount, r.purpose, r.supplier, r.status, r.submitted_at, r.decided_at, r.updated_at
    from pc_requests r where _res = 'procurement_requests' and r.org_id = _org and r.status <> 'draft' and (r.school_id = any(_sch) or (r.school_id is null and _all)) and (_id is null or r.id = _id)) v
  union all
  select to_jsonb(v) from (select x.id, x.school_id, x.ref, x.description, x.supplier, x.invoice_no, x.invoice_date, x.net, x.vat, x.total, x.status, x.decided_at, x.updated_at
    from pc_expenses x where _res = 'procurement_expenses' and x.org_id = _org and x.status <> 'draft' and (x.school_id = any(_sch) or (x.school_id is null and _all)) and (_id is null or x.id = _id)) v
  union all
  select to_jsonb(v) from (select c.id, c.school_id, c.ref, c.holder_id, c.purpose, c.amount, c.settle_due, c.status, c.updated_at
    from pc_custodies c where _res = 'custodies' and c.org_id = _org and c.status <> 'draft' and (c.school_id = any(_sch) or (c.school_id is null and _all)) and (_id is null or c.id = _id)) v
  union all
  select to_jsonb(v) from (select b.id, b.school_id, b.code, b.plate, b.model, b.capacity, b.odometer, b.op_status, b.next_service_date, b.next_service_km, b.inspection_date, b.license_expiry, b.active, b.updated_at
    from mt_buses b where _res = 'buses' and b.org_id = _org and (b.school_id = any(_sch) or (b.school_id is null and _all)) and (_id is null or b.id = _id)) v
  union all
  select to_jsonb(v) from (select m.id, m.school_id, m.ref, m.title, m.description, m.priority, m.category_id, m.subcategory_id, m.status, m.bus_id, m.odometer, m.bus_location,
      m.progress, m.expected_done, m.est_cost, m.actual_cost, m.submitted_at, m.closed_at, m.updated_at
    from mt_requests m where _res = 'bus_maintenance' and m.kind = 'bus' and m.org_id = _org and m.status <> 'draft' and m.school_id = any(_sch) and (_id is null or m.id = _id)) v
  union all
  select to_jsonb(v) from (select m.id, m.school_id, m.ref, m.title, m.description, m.priority, m.category_id, m.subcategory_id, m.status, m.building, m.floor, m.place,
      m.progress, m.expected_done, m.est_cost, m.actual_cost, m.submitted_at, m.closed_at, m.updated_at
    from mt_requests m where _res = 'building_maintenance' and m.kind = 'school' and m.org_id = _org and m.status <> 'draft' and m.school_id = any(_sch) and (_id is null or m.id = _id)) v
  union all
  select to_jsonb(v) from (select c.id, c.kind, c.parent_id, c.name, c.is_other, c.active
    from mt_categories c where _res = 'maint_categories' and (c.org_id is null or c.org_id = _org) and (_id is null or c.id = _id)) v
  union all
  select to_jsonb(v) from (select e.id, pa.school_id, e.employee_no, e.full_name, e.display_name, e.job_title, e.gender, e.status, e.hire_date, e.end_date, e.nationality, e.birth_date, e.phone, e.email, e.national_id, e.updated_at
    from hr_employees e left join lateral (select a.school_id from hr_assignments a where a.employee_id = e.id order by a.is_primary desc, a.start_date desc nulls last limit 1) pa on true
    where _res = 'hr_employees' and e.org_id = _org and (_all or pa.school_id = any(_sch)) and (_id is null or e.id = _id)) v
  union all
  select to_jsonb(v) from (select a.id, a.school_id, a.employee_id, a.job_title, a.department, a.start_date, a.end_date, a.is_primary, a.updated_at
    from hr_assignments a where _res = 'hr_assignments' and a.org_id = _org and (_all or a.school_id = any(_sch)) and (_id is null or a.id = _id)) v
  union all
  select to_jsonb(v) from (select l.id, pa.school_id, l.employee_id, l.type_id, l.start_date, l.end_date, l.days, l.status, l.requested_at, l.updated_at
    from hr_leave_requests l left join lateral (select a.school_id from hr_assignments a where a.employee_id = l.employee_id order by a.is_primary desc, a.start_date desc nulls last limit 1) pa on true
    where _res = 'hr_leaves' and l.org_id = _org and (_all or pa.school_id = any(_sch)) and (_id is null or l.id = _id)) v
  union all
  select to_jsonb(v) from (select d.employee_id::text || '_' || d.date::text id, d.school_id, d.employee_id, d.date, d.status, d.first_in, d.last_out, d.late_min, d.early_min, d.worked_min
    from hr_att_days d where _res = 'hr_attendance' and _id is null and d.org_id = _org and (_all or d.school_id = any(_sch))) v
  union all
  select to_jsonb(v) from (select a.id, a.school_id, a.name, a.category, a.serial, a.status, a.updated_at
    from hr_assets a where _res = 'hr_assets' and a.org_id = _org and (a.school_id = any(_sch) or (a.school_id is null and _all)) and (_id is null or a.id = _id)) v
  union all
  select to_jsonb(v) from (select t.id, t.school_id, t.ref, t.title, t.body, t.priority, t.topic, t.status, t.created_at, t.first_response_at, t.resolved_at, t.closed_at, t.updated_at
    from support_tickets t where _res = 'support_tickets' and t.org_id = _org and t.scope = 'school' and (t.school_id = any(_sch) or (t.school_id is null and _all)) and (_id is null or t.id = _id)) v
  union all
  select to_jsonb(v) from (select i.id, i.school_id, i.resource, i.status, coalesce(i.result->>'request_id', i.result->>'ticket_id') result_id, i.reason, i.created_at, i.decided_at
    from api_inbox i where _res = 'inbox_requests' and i.key_id = _key and i.resource in ('building_maintenance', 'bus_maintenance', 'support_tickets') and (_id is null or i.id = _id)) v
$$;

create or replace function public._api_rows_all(_res text, _org uuid, _sch uuid[], _all boolean, _yrs uuid[], _terms uuid[], _secs uuid[], _stages uuid[], _grades uuid[], _stu uuid[], _id uuid, _key uuid)
returns setof jsonb language sql stable security definer set search_path = public as $$
  select x from public._api_rows(_res, _org, _sch, _all, _yrs, _terms, _secs, _stages, _grades, _stu, _id, _key) x
  union all
  select x from public._api_rows_v2(_res, _org, _sch, _all, _yrs, _terms, _secs, _stages, _grades, _stu, _id, _key) x
$$;
revoke all on function public._api_rows_v2(text, uuid, uuid[], boolean, uuid[], uuid[], uuid[], uuid[], uuid[], uuid[], uuid, uuid), public._api_rows_all(text, uuid, uuid[], boolean, uuid[], uuid[], uuid[], uuid[], uuid[], uuid[], uuid, uuid) from public, anon, authenticated;
grant execute on function public._api_rows_v2(text, uuid, uuid[], boolean, uuid[], uuid[], uuid[], uuid[], uuid[], uuid[], uuid, uuid), public._api_rows_all(text, uuid, uuid[], boolean, uuid[], uuid[], uuid[], uuid[], uuid[], uuid[], uuid, uuid) to service_role;