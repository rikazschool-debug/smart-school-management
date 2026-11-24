-- Read-only finance pages (applied discounts, transport accounts, adjustments). All guarded by the finance 'view' permission; no writes.
create or replace function private._sf_cls(_student uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('stage',sg.name,'stage_id',sg.id,'grade',g.name,'grade_id',g.id,'section',se.name)
 from enrollments e join sections se on se.id=e.section_id join grades g on g.id=se.grade_id left join stages sg on sg.id=g.stage_id
 where e.student_id=_student and e.status='active' order by e.created_at desc limit 1 $$;
revoke all on function private._sf_cls(uuid) from public, anon;

create or replace function public.sf_discount_list(_school uuid,_year uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 perform _sf_guard(_school,'view');
 return coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'student_id',st.id,'name',st.full_name,'national_id',st.national_id,'cls',private._sf_cls(st.id),
   'school',sc.name,'year',y.name,'term',b.term,'fee_kind',b.kind,'obligation_id',b.id,'obligation_status',b.status,
   'discount',d.name,'discount_id',d.id,'value_type',d.value_type,'value',d.value,'amount',a.amount,'automatic',d.automatic,'sibling',d.sibling_min is not null,
   'active',a.active and b.status<>'void','manual_override',a.manual_override,'edited',exists(select 1 from sf_events e where e.subject_id=a.id and e.action='discount_edit'),
   'removed',exists(select 1 from sf_events e where e.subject_id=a.id and e.action='discount_remove'),'created_at',a.created_at) order by st.full_name,b.term)
  from sf_applied a join sf_obligations b on b.id=a.obligation_id join sf_discounts d on d.id=a.discount_id join students st on st.id=b.student_id
  join schools sc on sc.id=b.school_id join academic_years y on y.id=b.year_id
  where b.school_id=_school and (_year is null or b.year_id=_year)),'[]'::jsonb);
end $$;

create or replace function public.sf_transport_accounts(_school uuid,_year uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 perform _sf_guard(_school,'view');
 return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'student_id',st.id,'name',st.full_name,'cls',private._sf_cls(st.id),'school',sc.name,'year',y.name,'term',t.term,
   'bus',bu.code,'bus_id',t.bus_id,'transport_type',t.transport_type,'active',t.active,'exempt',t.exempt,'starts',t.starts,
   'obligation_id',b.id,'obligation_status',b.status,'due_date',b.due_date,'balance',case when b.id is not null then _sf_balance(b.id) end,
   'overdue',b.id is not null and b.status='pending' and b.due_date is not null and b.due_date<school_today() and (_sf_balance(b.id)->>'remaining')::numeric>0,
   'previous',exists(select 1 from sf_obligations po join academic_years py on py.id=po.year_id where po.student_id=st.id and po.kind='transport' and po.status='pending' and py.start_date<y.start_date and (_sf_balance(po.id)->>'remaining')::numeric>0))
   order by st.full_name,t.term)
  from sf_transport t join students st on st.id=t.student_id join schools sc on sc.id=t.school_id join academic_years y on y.id=t.year_id
  left join mt_buses bu on bu.id=t.bus_id
  left join sf_obligations b on b.student_id=t.student_id and b.year_id=t.year_id and b.term=t.term and b.kind='transport'
  where t.school_id=_school and (_year is null or t.year_id=_year)),'[]'::jsonb);
end $$;

create or replace function public.sf_adjustments(_school uuid,_year uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 perform _sf_guard(_school,'view');
 return coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
  select jsonb_build_object('id',e.id,'number','ADJ-'||lpad(e.seq::text,6,'0'),'created_at',e.created_at,'action',e.action,'student_id',e.student_id,'name',st.full_name,
   'school',sc.name,'year',y.name,'term',b.term,'fee_kind',b.kind,'obligation_id',b.id,
   'before',e.before_data,'after',e.after_data,
   'old',case when e.action in ('credit_apply','credit_refund') then null else e.before_data->>'amount' end,
   'new',case when e.action='collection_reverse' then '0' when e.action in ('credit_apply','credit_refund') then e.after_data->>'amount' when e.action in ('discount_remove','transport_cancel') then '0' else e.after_data->>'amount' end,
   'reason',e.reason,'actor',coalesce(_adm_name(e.actor),''),'balance_now',case when b.id is not null then _sf_balance(b.id) end,
   'status',case when e.action='collection_reverse' then 'معتمدة — عكس سداد' else 'معتمدة' end) x
  from (select ev.*, row_number() over (partition by ev.org_id order by ev.created_at, ev.id) seq from sf_events ev
        where ev.action in ('reprice','discount_edit','discount_remove','exception_clear','transport_edit','transport_exempt','transport_cancel','collection_reverse','credit_apply','credit_refund','carry_apply')) e
  join schools sc on sc.id=e.school_id left join students st on st.id=e.student_id
  left join sf_applied ap on ap.id=e.subject_id left join sf_credit_moves cm on cm.id=e.subject_id
  left join sf_obligations b on b.id=coalesce((select o.id from sf_obligations o where o.id=e.subject_id),ap.obligation_id,cm.source_obligation_id)
  left join academic_years y on y.id=b.year_id
  where e.school_id=_school and (_year is null or b.year_id is null or b.year_id=_year)) q),'[]'::jsonb);
end $$;

revoke all on function public.sf_discount_list(uuid,uuid), public.sf_transport_accounts(uuid,uuid), public.sf_adjustments(uuid,uuid) from public, anon;
grant execute on function public.sf_discount_list(uuid,uuid), public.sf_transport_accounts(uuid,uuid), public.sf_adjustments(uuid,uuid) to authenticated;