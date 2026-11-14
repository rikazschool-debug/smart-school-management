create or replace function public.mq_call_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare c mq_calls; m jsonb; begin
  select * into c from mq_calls where id=_id;
  if c.id is null or not _mq_sees(c) then raise exception 'غير مصرح'; end if;
  m := _mq_matches(c.org_id, c.phone_norm);
  return _mq_row(c) || jsonb_build_object('contact_kind',c.contact_kind,'contact_id',c.contact_id,'phone_norm',c.phone_norm,
    'matches', (select coalesce(jsonb_agg(x || jsonb_build_object('children', case when x->>'kind'='guardian' then
        (select coalesce(jsonb_agg(jsonb_build_object('name',coalesce(st.display_name,st.full_name),'school',s2.name)),'[]') from student_guardians sg join students st on st.id=sg.student_id join schools s2 on s2.id=st.school_id
          where sg.guardian_id=(x->>'id')::uuid and can_view_student(st.id, st.school_id)) end)),'[]') from jsonb_array_elements(m) x
        where x->>'kind'<>'guardian' or (x->>'school_id')::uuid is null or _mq_ok(c.org_id,(x->>'school_id')::uuid,'view') or c.agent_user=auth.uid()),
    'tickets', coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'ref',t.ref,'title',t.title,'status',t.status) order by l.created_at) from mq_call_tickets l join support_tickets t on t.id=l.ticket_id where l.call_id=c.id and support_can_read(t.id)),'[]'),
    'followups', coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'outcome',f.outcome,'note',f.note,'due_at',f.due_at,'assignee',(select full_name from profiles where id=f.assignee),'by',(select full_name from profiles where id=f.created_by),'created_at',f.created_at,'done_at',f.done_at) order by f.created_at) from mq_followups f where f.call_id=c.id),'[]'),
    'can', jsonb_build_object('link',_mq_can(c,'link'),'listen',_mq_can(c,'listen'),'download',_mq_can(c,'download'),'set_school', _mq_any(c.org_id,'link') and (c.school_id is null or _mq_can(c,'link'))));
end $$;