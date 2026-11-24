-- Student finance phase 5b (additive): every student-level sf_events action notifies verified guardians; system/adjustment events notify org owners.
create or replace function public._sf_lbl(_kind text,_term int) returns text language sql immutable set search_path=public as $$
 select case when _kind='transport' then 'رسوم النقل' else 'الرسوم الدراسية' end||' ('||case when _term=1 then 'الفصل الأول' else 'الفصل الثاني' end||')' $$;

create or replace function public._sf_owners_notify(_school uuid,_except uuid,_title text,_body text,_key text) returns void
language sql security definer set search_path=public as $$
 select _notify(m.user_id,_school,'finance',_title,_body,'/app/finance',_key)
 from (select distinct m.user_id from memberships m join schools s on s.org_id=m.org_id where s.id=_school and m.role='org_owner' and m.is_active and m.user_id is distinct from _except) m $$;

create or replace function public._sf_event_notify_trg() returns trigger language plpgsql security definer set search_path=public as $$
declare nm text; a jsonb:=coalesce(new.after_data,'{}'); b jsonb:=coalesce(new.before_data,'{}'); ob sf_obligations; t text; m text; k text:='sf_ev:'||new.id; begin
 if new.student_id is null then return null; end if;
 select full_name into nm from students where id=new.student_id; nm:=coalesce(nm,'');
 if new.action in ('discount_apply','discount_edit','discount_remove','sibling_ineligible','reprice','due_apply','transport_edit','transport_exempt','transport_cancel','obligation_create') then
  select * into ob from sf_obligations where id=coalesce((a->>'obligation_id')::uuid,(select obligation_id from sf_applied where id=new.subject_id),new.subject_id);
 end if;
 case new.action
  when 'obligation_create' then t:='إنشاء المستحقات المالية'; m:='أُنشئت '||case when a->>'kind'='transport' then 'رسوم النقل' else 'الرسوم الدراسية' end||' للطالب '||nm||' للعام الدراسي '||coalesce((select name from academic_years where id=ob.year_id),'')||'.';
   k:='sf_new:'||new.student_id||':'||coalesce(ob.year_id::text,'')||':'||coalesce(a->>'kind','');
  when 'discount_apply' then t:=case when a->>'discount' like '%الإخوة%' then 'تطبيق خصم الإخوة' else 'تطبيق خصم' end;
   m:='طُبّق '||coalesce(a->>'discount','خصم')||' بمبلغ '||_sf_money((a->>'amount')::numeric)||' على '||_sf_lbl(ob.kind,ob.term)||' للطالب '||nm||'.';
  when 'sibling_ineligible' then t:='إيقاف خصم الإخوة'; m:='توقف خصم الإخوة على '||_sf_lbl(ob.kind,ob.term)||' للطالب '||nm||' لعدم استيفاء شروطه.';
  when 'discount_edit' then t:='تعديل خصم'; m:='عُدّل الخصم على '||_sf_lbl(ob.kind,ob.term)||' للطالب '||nm||' إلى '||_sf_money((a->>'amount')::numeric)||'.';
  when 'discount_remove' then t:='إلغاء خصم'; m:='أُلغي خصم على '||_sf_lbl(ob.kind,ob.term)||' للطالب '||nm||'.';
  when 'reprice' then t:='تعديل الرسوم الدراسية'; m:='عُدّلت '||_sf_lbl(ob.kind,ob.term)||' للطالب '||nm||' من '||_sf_money((b->>'amount')::numeric)||' إلى '||_sf_money((a->>'amount')::numeric)||'.';
  when 'due_apply' then t:='تعديل تاريخ الاستحقاق'; m:='أصبح تاريخ استحقاق '||_sf_lbl(ob.kind,ob.term)||' للطالب '||nm||': '||coalesce(a->>'due_date','بلا تاريخ')||'.';
  when 'transport_edit' then t:='تعديل اشتراك النقل'; m:='عُدّلت '||_sf_lbl('transport',ob.term)||' للطالب '||nm||' إلى '||_sf_money((a->>'amount')::numeric)||'.';
  when 'transport_exempt' then t:='إعفاء من رسوم النقل'; m:='أُعفي الطالب '||nm||' من '||_sf_lbl('transport',ob.term)||'.';
  when 'transport_cancel' then t:='إلغاء اشتراك النقل'; m:='أُلغي اشتراك النقل للطالب '||nm||' في '||case when ob.term=1 then 'الفصل الأول' else 'الفصل الثاني' end||'.';
  when 'transport_save' then
   if coalesce((a->>'active')::boolean,false) and coalesce((b->>'active')::boolean,false) then t:='تعديل اشتراك النقل';
   elsif coalesce((a->>'active')::boolean,false) then t:='تسجيل اشتراك النقل';
   elsif coalesce((b->>'active')::boolean,false) then t:='إلغاء اشتراك النقل'; end if;
   if t is not null then m:=t||' للطالب '||nm||' في '||case when (a->>'term')='1' then 'الفصل الأول' else 'الفصل الثاني' end||'.'; end if;
  else null;
 end case;
 if t is not null then perform _sf_notify_guardians(new.student_id,new.school_id,t,m,k); end if;
 -- Administration: system failures and adjustments/cancellations made by someone else.
 if new.action='auto_create_failed' then
  perform _sf_owners_notify(new.school_id,null,'تعذر إنشاء رسوم طالب','تعذر إنشاء رسوم الطالب '||nm||' تلقائيًا عند التسكين. راجع «طلاب بانتظار إنشاء الرسوم».','sf_fail:'||new.student_id||':'||_sf_today());
 elsif new.action in ('collection_reverse','discount_edit','discount_remove','transport_edit','transport_exempt','transport_cancel') then
  perform _sf_owners_notify(new.school_id,new.actor,case when new.action='collection_reverse' then 'إلغاء دفعة' else 'تسوية مالية' end,
   'عملية «'||case new.action when 'collection_reverse' then 'إلغاء دفعة' when 'discount_edit' then 'تعديل خصم' when 'discount_remove' then 'إلغاء خصم' when 'transport_edit' then 'تعديل رسوم النقل' when 'transport_exempt' then 'إعفاء من النقل' else 'إلغاء النقل' end||'» للطالب '||nm||coalesce(' — السبب: '||new.reason,'')||'.','sf_adm:'||new.id);
 end if;
 return null; end$$;
create trigger sf_event_notify after insert on public.sf_events for each row execute function public._sf_event_notify_trg();

-- Daily: due soon (3 days before) and first day overdue to guardians; one overdue summary per branch to owners.
create or replace function public.sf_due_tick() returns jsonb language plpgsql security definer set search_path=public as $$
declare r record; d date:=_sf_today(); soon int:=0; late int:=0; begin
 for r in select b.*,st.full_name,(_sf_balance(b.id)->>'remaining')::numeric rem from sf_obligations b join students st on st.id=b.student_id join schools sc on sc.id=b.school_id
   where b.status='pending' and b.due_date is not null and sc.is_active and section_enabled(sc.org_id,'finance')
   and (b.due_date=d+3 or b.due_date between d-30 and d-1) loop
  continue when r.rem<=0;
  if r.due_date=d+3 then
   perform _sf_notify_guardians(r.student_id,r.school_id,'اقتراب موعد الاستحقاق','يستحق '||_sf_money(r.rem)||' من '||_sf_lbl(r.kind,r.term)||' للطالب '||r.full_name||' بتاريخ '||to_char(r.due_date,'YYYY-MM-DD')||'.','sf_soon:'||r.id||':'||r.due_date); soon:=soon+1;
  else
   perform _sf_notify_guardians(r.student_id,r.school_id,'تأخر السداد','تجاوز '||_sf_lbl(r.kind,r.term)||' للطالب '||r.full_name||' تاريخ استحقاقه '||to_char(r.due_date,'YYYY-MM-DD')||'، والمتبقي '||_sf_money(r.rem)||'.','sf_late:'||r.id||':'||r.due_date); late:=late+1;
  end if;
 end loop;
 for r in select b.school_id,count(*) n from sf_obligations b join schools sc on sc.id=b.school_id where b.status='pending' and b.due_date=d-1 and sc.is_active and section_enabled(sc.org_id,'finance') and (_sf_balance(b.id)->>'remaining')::numeric>0 group by b.school_id loop
  perform _sf_owners_notify(r.school_id,null,'مستحقات متأخرة',r.n||' مستحقًا تجاوز موعده أمس. راجع «المستحقات والمتأخرات».','sf_late_sum:'||r.school_id||':'||d);
 end loop;
 return jsonb_build_object('soon',soon,'late',late); end$$;

revoke all on function public._sf_lbl(text,int),public._sf_owners_notify(uuid,uuid,text,text,text),public._sf_event_notify_trg(),public.sf_due_tick() from public,anon,authenticated;
select cron.schedule('rikaz-sf-due','30 5 * * *','select public.sf_due_tick()');