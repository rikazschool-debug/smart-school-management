-- Reprice keeps automatic (e.g. sibling %) discounts in step with the new obligation amount.
create or replace function public.sf_reprice_apply(_price uuid,_mode text,_students uuid[],_reason text) returns jsonb language plpgsql security definer set search_path=public as $$
 declare p sf_prices; r record; n integer:=0; touched uuid[]:='{}'; begin
 select * into p from sf_prices where id=_price for update;
 perform _sf_guard(p.school_id,'setup');
 if not is_org_owner((select org_id from schools where id=p.school_id)) then raise exception 'تعديل رسوم الطلاب لمدير النظام فقط' using errcode='42501'; end if;
 if p.status<>'approved' then raise exception 'اعتمد السعر الجديد أولًا'; end if;
 if length(btrim(coalesce(_reason,'')))<3 then raise exception 'سبب التعديل مطلوب'; end if;
 if _mode not in('unpaid','selected') then raise exception 'خيار غير صالح'; end if;
 perform 1 from students where id in(select student_id from sf_obligations where price_id=_price) order by id for update;
 for r in select * from _sf_reprice_rows(_price,_mode,_students) where eligible loop
  update sf_obligations set original=r.new_amount,amount=r.new_amount,price_snapshot=to_jsonb(p),updated_at=now() where id=r.obligation_id;
  perform _sf_event(p.school_id,r.student_id,'reprice',r.obligation_id,jsonb_build_object('amount',r.old_amount),jsonb_build_object('amount',r.new_amount,'mode',_mode,'term',r.term),_reason);
  if not r.student_id=any(touched) then touched:=touched||r.student_id; end if;
  n:=n+1;
 end loop;
 -- automatic discounts (percent/sibling) follow the new amount now, not at some later unrelated refresh
 perform _sf_refresh(x) from unnest(touched) x;
 return jsonb_build_object('updated',n); end$$;

-- Preview = the same apply inside a sub-transaction that is always rolled back, so discount/remaining/credit match the result.
create or replace function public.sf_reprice_preview(_price uuid,_mode text,_students uuid[] default null) returns jsonb language plpgsql volatile security definer set search_path=public as $$
 declare s uuid; p sf_prices; rows jsonb; r record; touched uuid[]:='{}'; begin
 select * into p from sf_prices where id=_price; s:=p.school_id; perform _sf_guard(s,'setup');
 if _mode not in('unpaid','selected') then raise exception 'خيار غير صالح'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from _sf_reprice_rows(_price,_mode,_students) x;
 begin
  for r in select * from _sf_reprice_rows(_price,_mode,_students) where eligible loop
   update sf_obligations set original=r.new_amount,amount=r.new_amount where id=r.obligation_id;
   if not r.student_id=any(touched) then touched:=touched||r.student_id; end if;
  end loop;
  perform _sf_refresh(x) from unnest(touched) x;
  select coalesce(jsonb_agg(case when (x->>'eligible')::boolean then x||jsonb_build_object('discount',(_sf_balance((x->>'obligation_id')::uuid)->>'discount')::numeric,
     'remaining_after',(_sf_balance((x->>'obligation_id')::uuid)->>'remaining')::numeric,'credit_after',(_sf_balance((x->>'obligation_id')::uuid)->>'credit')::numeric) else x end),'[]')
   into rows from jsonb_array_elements(rows) x;
  raise exception 'sf_preview_rollback' using errcode='P0R01';
 exception when sqlstate 'P0R01' then null;
 end;
 return jsonb_build_object('rows',rows,'affected',(select count(distinct x->>'student_id') from jsonb_array_elements(rows) x where (x->>'eligible')::boolean),
  'difference',(select coalesce(sum((x->>'new_amount')::numeric-(x->>'old_amount')::numeric),0)::text from jsonb_array_elements(rows) x where (x->>'eligible')::boolean),
  'credit',(select coalesce(sum((x->>'credit_after')::numeric),0)::text from jsonb_array_elements(rows) x where (x->>'eligible')::boolean)); end$$;
revoke all on function public.sf_reprice_preview(uuid,text,uuid[]),public.sf_reprice_apply(uuid,text,uuid[],text) from public,anon;
grant execute on function public.sf_reprice_preview(uuid,text,uuid[]),public.sf_reprice_apply(uuid,text,uuid[],text) to authenticated;