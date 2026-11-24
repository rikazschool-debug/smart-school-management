create or replace function public.sf_adjustments(_school uuid,_year uuid) returns jsonb language plpgsql stable security definer set search_path=public as $function$
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
  left join sf_obligations tb on tb.id=cm.target_obligation_id
  left join academic_years y on y.id=b.year_id
  -- a credit used for another year's fee belongs to both the source year and the target year
  where e.school_id=_school and (_year is null or b.year_id is null or b.year_id=_year or tb.year_id=_year)) q),'[]'::jsonb);
end $function$;