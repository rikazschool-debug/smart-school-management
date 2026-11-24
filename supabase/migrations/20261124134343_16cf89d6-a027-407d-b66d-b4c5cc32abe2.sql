-- Student finance phase 5 (additive): in-app financial notifications to verified guardians.
create or replace function public._sf_notify_guardians(_student uuid,_school uuid,_title text,_body text,_key text) returns int
language plpgsql security definer set search_path=public as $$declare n int; begin
 with t as (select distinct g.user_id from student_guardians sg join guardians g on g.id=sg.guardian_id
   where sg.student_id=_student and sg.verified and sg.can_follow and g.user_id is not null),
 ins as (insert into notifications(user_id,school_id,kind,title,body,link,dedupe_key)
   select t.user_id,_school,'finance',_title,_body,'/app',_key||':'||t.user_id from t on conflict (user_id,dedupe_key) do nothing returning 1)
 select count(*) into n from ins; return n; end$$;

create or replace function public._sf_money(_v numeric) returns text language sql immutable set search_path=public as $$ select to_char(coalesce(_v,0),'FM999,999,990.00')||' ر.س' $$;

create or replace function public._sf_receipt_notify_trg() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform _sf_notify_guardians(new.student_id,new.school_id,'تسجيل دفعة',
  'سُجّلت دفعة بمبلغ '||_sf_money((new.snapshot->>'amount')::numeric)||' للطالب '||coalesce(new.snapshot->'student'->>'name','')||
  ' — سند قبض داخلي رقم '||new.number||'. ليس إيصالًا محاسبيًا رسميًا.','sf_rc:'||new.id);
 return null; end$$;
create trigger sf_receipt_notify after insert on public.sf_receipts for each row execute function public._sf_receipt_notify_trg();

create or replace function public._sf_reverse_notify_trg() returns trigger language plpgsql security definer set search_path=public as $$
declare rn text; begin
 if new.status='reversed' and old.status is distinct from 'reversed' then
  select number into rn from sf_receipts where collection_id=new.id;
  perform _sf_notify_guardians(new.student_id,new.school_id,'إلغاء دفعة',
   'أُلغيت دفعة بمبلغ '||_sf_money(new.amount)||' للطالب '||coalesce((select full_name from students where id=new.student_id),'')||
   coalesce(' (سند رقم '||rn||')','')||'.','sf_rev:'||new.id);
 end if; return null; end$$;
create trigger sf_reverse_notify after update of status on public.sf_collections for each row execute function public._sf_reverse_notify_trg();

-- Manual overdue reminder: only overdue pending obligations with a remaining balance; at most once per obligation per day.
create or replace function public.sf_remind(_school uuid,_obligations uuid[]) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r record; n int:=0; k int:=0; sent int; begin
 perform _sf_guard(_school,'collect');
 if coalesce(array_length(_obligations,1),0)=0 or array_length(_obligations,1)>500 then raise exception 'اختر مستحقات للتذكير (500 كحد أقصى)'; end if;
 for r in select b.id,b.student_id,b.kind,b.term,b.due_date,(_sf_balance(b.id)->>'remaining')::numeric rem,st.full_name
   from sf_obligations b join students st on st.id=b.student_id
   where b.id=any(_obligations) and b.school_id=_school and b.status='pending' and b.due_date is not null and b.due_date<_sf_today() loop
  continue when r.rem<=0;
  sent:=_sf_notify_guardians(r.student_id,_school,'تذكير بموعد السداد',
   'يوجد مبلغ متبقٍ '||_sf_money(r.rem)||' من '||case when r.kind='transport' then 'رسوم النقل' else 'الرسوم الدراسية' end||
   ' ('||case when r.term=1 then 'الفصل الأول' else 'الفصل الثاني' end||') للطالب '||r.full_name||' تجاوز تاريخ استحقاقه '||to_char(r.due_date,'YYYY-MM-DD')||'.',
   'sf_due:'||r.id||':'||_sf_today());
  if sent>0 then
   n:=n+1; k:=k+sent;
   insert into sf_events(org_id,school_id,student_id,action,subject_id,after_data)
   values((select org_id from schools where id=_school),_school,r.student_id,'reminder',r.id,jsonb_build_object('remaining',r.rem,'guardians',sent));
  end if;
 end loop;
 return jsonb_build_object('obligations',n,'guardians',k); end$$;

revoke all on function public._sf_notify_guardians(uuid,uuid,text,text,text),public._sf_receipt_notify_trg(),public._sf_reverse_notify_trg() from public,anon,authenticated;
revoke all on function public.sf_remind(uuid,uuid[]) from public,anon;
grant execute on function public.sf_remind(uuid,uuid[]) to authenticated;