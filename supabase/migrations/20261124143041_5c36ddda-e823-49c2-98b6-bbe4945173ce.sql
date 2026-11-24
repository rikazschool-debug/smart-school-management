create or replace function public.sf_carry_apply(_org uuid,_request_key uuid,_from text,_to text,_schools uuid[],_students uuid[],_dirs text[],_reason text) returns jsonb language plpgsql security definer set search_path=public as $$
 declare p jsonb; old sf_carry_runs; rid uuid; r record; n integer:=0; d numeric:=0; c numeric:=0; x record; begin
 perform _sf_carry_check(_org,_from,_to,_dirs);
 if _request_key is null or length(btrim(coalesce(_reason,'')))<3 then raise exception 'سبب الترحيل مطلوب'; end if;
 p:=jsonb_build_object('from',_from,'to',_to,'schools',coalesce(to_jsonb(_schools),'[]'),'students',coalesce(to_jsonb(_students),'[]'),'dirs',to_jsonb(_dirs));
 select * into old from sf_carry_runs where org_id=_org and request_key=_request_key;
 if old.id is not null then if old.scope<>p then raise exception 'مفتاح إعادة المحاولة مستخدم لعملية أخرى'; end if; return to_jsonb(old); end if;
 -- Lock the students first (same lock as collection), then re-read live balances.
 perform 1 from students where id in (select q.student_id from _sf_carry_rows(_org,_from,_to,_schools,_students,_dirs) q) order by id for update;
 insert into sf_carry_runs(org_id,request_key,from_key,to_key,scope,reason) values(_org,_request_key,_from,_to,p,_reason) returning id into rid;
 for r in select * from _sf_carry_rows(_org,_from,_to,_schools,_students,_dirs) q where not q.carried order by q.student_id,q.year,q.term,q.kind loop
  insert into sf_carries(org_id,run_id,student_id,obligation_id,source_school_id,source_year_id,to_key,direction,amount,due_date)
  values(_org,rid,r.student_id,r.obligation_id,r.school_id,r.year_id,_to,r.direction,case when r.direction='debit' then r.remaining else r.credit end,r.due_date) on conflict do nothing;
  if found then n:=n+1; if r.direction='debit' then d:=d+r.remaining; else c:=c+r.credit; end if; end if;
 end loop;
 for x in select ca.student_id,min(ca.source_school_id::text)::uuid school,sum(ca.amount) filter(where direction='debit') debit,sum(ca.amount) filter(where direction='credit') credit,count(*) cnt from sf_carries ca where ca.run_id=rid group by ca.student_id loop
  perform _sf_event(x.school,x.student_id,'carry_apply',rid,null,jsonb_build_object('from',_from,'to',_to,'debit',coalesce(x.debit,0),'credit',coalesce(x.credit,0),'count',x.cnt),_reason);
 end loop;
 update sf_carry_runs set counts=jsonb_build_object('items',n,'debit',d,'credit',c,'students',(select count(distinct student_id) from sf_carries where run_id=rid)) where id=rid;
 select to_jsonb(cr) into p from sf_carry_runs cr where cr.id=rid;
 return p; end$$;