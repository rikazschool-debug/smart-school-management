create or replace function private._sv5_ind(_key text, _label text, _def text, _den_def text, _unit text, _rows jsonb, _num numeric default null) returns jsonb language plpgsql immutable set search_path=public as $$
declare n numeric; d int; st text; upd text; lim jsonb; begin
 d:=jsonb_array_length(coalesce(_rows,'[]'));
 n:=coalesce(_num,(select count(*) from jsonb_array_elements(coalesce(_rows,'[]')) r where (r->>'hit')::boolean));
 st:=case when d=0 then (case when _key in ('measures','impact') then 'not_measured' else 'no_data' end) when n=0 then 'zero' else 'value' end;
 select max(r->>'upd') into upd from jsonb_array_elements(coalesce(_rows,'[]')) r;
 select coalesce(jsonb_agg(r),'[]') into lim from (select r from jsonb_array_elements(coalesce(_rows,'[]')) r order by r->>'date' desc limit 300) x;
 return jsonb_build_object('key',_key,'label',_label,'definition',_def,'denominator_def',_den_def,'unit',_unit,'num',n,'den',case when _den_def is null then null else d end,'count',d,'state',st,'last_update',upd,'rows',lim,'truncated',d>300); end $$;

create or replace function private.sv5_dash(_org uuid, _school uuid, _from date, _to date) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare sch uuid[]; r1 jsonb; r2 jsonb; r3 jsonb; r4 jsonb; h numeric; r5 jsonb; r6 jsonb; r7 jsonb; r8 jsonb; r9 jsonb; scope text; tz text:='Asia/Riyadh'; begin
 if _from is null or _to is null or _to<_from then raise exception 'تاريخ البداية يجب أن يسبق تاريخ النهاية'; end if;
 if _to-_from>366 then raise exception 'أقصى مدة للوحة سنة واحدة'; end if;
 select coalesce(array_agg(s.id order by s.name),'{}') into sch from schools s where s.org_id=_org and s.is_active and (_school is null or s.id=_school) and private._sv3_enabled(s.id)
  and (is_org_owner(_org) or private._sv_principal(s.id) or exists(select 1 from private._sv_live(s.id)) or private._sv4_school_teacher(s.id) is not null);
 if cardinality(sch)=0 then raise exception 'لا يوجد فرع ضمن صلاحيتك في الإشراف التربوي'; end if;
 scope:=case when is_org_owner(_org) then 'المالك: كل الفروع المختارة'
  when exists(select 1 from unnest(sch) x where private._sv_principal(x)) then 'مدير الفرع: فرعك'
  when exists(select 1 from unnest(sch) x where exists(select 1 from private._sv_live(x))) then 'المشرف: المعلمون في إسنادك الساري فقط'
  else 'المعلم: بياناتك فقط' end;

 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',coalesce(r.form_snapshot->>'title','سجل')||' — '||coalesce(private._sv_name(private._sv4_teacher_user(r.teacher_id)),'—'),'school',sc.name,'date',(r.submitted_at at time zone tz)::date,'status',r.status,'hit',r.status='approved','upd',r.updated_at)),'[]') into r1
  from sv_records r join schools sc on sc.id=r.school_id where r.school_id=any(sch) and r.status<>'draft' and r.submitted_at is not null and (r.submitted_at at time zone tz)::date between _from and _to and private._sv3_record_read(r);

 select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'title',v.purpose||' — '||coalesce(private._sv_name(private._sv4_teacher_user(v.teacher_id)),'—'),'school',sc.name,'date',(v.starts_at at time zone tz)::date,'status',v.state,'hit',v.state='executed','upd',v.updated_at)),'[]') into r2
  from sv_scheduled_visits v join schools sc on sc.id=v.school_id where v.school_id=any(sch) and v.state<>'cancelled' and v.starts_at<=now() and (v.starts_at at time zone tz)::date between _from and _to and private._sv3_visit_read(v);

 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title','خطة تطوير — '||coalesce(private._sv_name(private._sv4_teacher_user(p.teacher_id)),'—')||' (إصدار '||p.version||')','school',sc.name,'date',(p.submitted_at at time zone tz)::date,'status',p.status,'hit',p.status='approved','upd',p.updated_at)),'[]') into r3
  from sv4_dev_plans p join schools sc on sc.id=p.school_id where p.school_id=any(sch) and p.status in ('submitted','needs_info','approved') and p.submitted_at is not null and (p.submitted_at at time zone tz)::date between _from and _to and private._sv4_plan_read(p);

 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',g.title||' — '||coalesce(private._sv_name(a.user_id),'—'),'school',sc.name,'date',(s.starts_at at time zone tz)::date,'status','present','hours',round((extract(epoch from s.ends_at-s.starts_at)/3600)::numeric,2),'hit',true,'upd',a.at,'program_id',g.id)),'[]'),
   coalesce(sum(round((extract(epoch from s.ends_at-s.starts_at)/3600)::numeric,2)),0) into r4, h
  from sv4_attendance a join sv4_sessions s on s.id=a.session_id join sv4_programs g on g.id=s.program_id join schools sc on sc.id=g.school_id
  where g.school_id=any(sch) and a.status='present' and s.status='scheduled' and g.status<>'cancelled' and (s.starts_at at time zone tz)::date between _from and _to
   and (private._sv4_lead(g.school_id) or a.user_id=auth.uid() or exists(select 1 from teachers t where t.user_id=a.user_id and t.school_id=g.school_id and private._sv_covers(g.school_id,t.id)));

 select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'title',m.title,'school',sc.name,'date',m.measured_on,'status',m.kind,'hit',true,'upd',m.updated_at)),'[]') into r5
  from sv5_measures m join schools sc on sc.id=m.school_id where m.school_id=any(sch) and m.measured_on between _from and _to and private._sv5_read(m);

 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'school',sc.name,'date',(a.created_at at time zone tz)::date,'status',a.status,'hit',a.status='done','upd',a.updated_at)),'[]') into r6
  from sv5_actions a join schools sc on sc.id=a.school_id where a.school_id=any(sch) and a.status not in ('draft','cancelled') and (a.created_at at time zone tz)::date between _from and _to and private._sv5_act_read(a);

 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'title',a.title,'school',sc.name,'date',(a.updated_at at time zone tz)::date,'status',a.impact_status,'hit',a.impact_status<>'not_measured','upd',coalesce(a.impact_at,a.updated_at))),'[]') into r7
  from sv5_actions a join schools sc on sc.id=a.school_id where a.school_id=any(sch) and a.status='done' and (a.created_at at time zone tz)::date between _from and _to and private._sv5_act_read(a);

 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'title',p.title||' — '||coalesce(private._sv_name(private._sv4_teacher_user(p.teacher_id)),'—'),'school',sc.name,'date',p.source_date,'status',p.status,'hit',p.status='verified','upd',p.updated_at)),'[]') into r8
  from sv5_portfolio p join schools sc on sc.id=p.school_id where p.school_id=any(sch) and p.status in ('proposed','returned','verified') and p.source_date between _from and _to and private._sv5_pf_read(p);

 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'school',coalesce(sc.name,'كل الفروع'),'date',(r.published_at at time zone tz)::date,'status',r.kind,'hit',true,'upd',r.published_at)),'[]') into r9
  from sv5_resources r left join schools sc on sc.id=r.school_id where r.org_id=_org and (r.school_id is null or r.school_id=any(sch)) and r.status='published' and (r.published_at at time zone tz)::date between _from and _to and private._sv5_res_read(r);

 return jsonb_build_object('scope',scope,'from',_from,'to',_to,'generated_at',now(),
  'schools',(select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name) from schools s where s.id=any(sch)),
  'indicators',jsonb_build_array(
   private._sv5_ind('records','السجلات الإشرافية المعتمدة','عدد السجلات الإشرافية التي اعتُمدت من بين السجلات المرسلة في الفترة (حسب تاريخ الإرسال).','السجلات المرسلة غير المسودة في الفترة','ratio',r1),
   private._sv5_ind('visits','الزيارات المنفّذة','عدد الزيارات المجدولة التي نُفّذت من بين الزيارات غير الملغاة التي حلّ موعدها في الفترة.','الزيارات غير الملغاة التي حلّ موعدها','ratio',r2),
   private._sv5_ind('dev_plans','خطط التطوير المعتمدة','عدد خطط التطوير المهني المعتمدة من بين الخطط المرسلة في الفترة (الإصدار الحالي).','الخطط المرسلة أو المعادة أو المعتمدة','ratio',r3),
   private._sv5_ind('pd_hours','ساعات التطوير الموثّقة','مجموع ساعات الجلسات المنعقدة التي سُجّل فيها حضور فعلي؛ التسجيل وحده لا يُحتسب.',null,'hours',r4,h),
   private._sv5_ind('measures','مقاييس نواتج التعلم','عدد المقاييس (اختبارات مدرسية أو نتائج موثّقة) بتاريخ قياس داخل الفترة.',null,'count',r5),
   private._sv5_ind('actions','إجراءات التحسين المنفّذة','عدد إجراءات التحسين المنتهي تنفيذها من بين الإجراءات المرسلة في الفترة؛ التنفيذ لا يعني تحقق الأثر.','الإجراءات المرسلة غير الملغاة','ratio',r6),
   private._sv5_ind('impact','إجراءات قيس أثرها','عدد الإجراءات المنفّذة التي سُجّل لها قياس أثر (تحقق، جزئي، لم يتحقق، غير قابل للمقارنة)؛ الباقي «لم يُقس».','الإجراءات المنفّذة','ratio',r7),
   private._sv5_ind('portfolio','عناصر الملف المهني المتحقق منها','عدد عناصر الملف المهني المتحقق منها من بين المقترحة؛ العدد لا يدل على جودة الأداء.','العناصر المقترحة أو المعادة أو المتحقق منها','ratio',r8),
   private._sv5_ind('resources','الموارد المنشورة','عدد النشرات والموارد المنشورة في الفترة (نماذج داخلية).',null,'count',r9))); end $$;

create or replace function public.sv5_dash(_org uuid, _school uuid, _from date, _to date) returns jsonb language sql stable set search_path=public as $$ select private.sv5_dash(_org,_school,_from,_to) $$;
revoke all on function public.sv5_dash(uuid,uuid,date,date) from public, anon; grant execute on function public.sv5_dash(uuid,uuid,date,date) to authenticated;
revoke all on function private.sv5_dash(uuid,uuid,date,date) from public, anon; grant execute on function private.sv5_dash(uuid,uuid,date,date) to authenticated;
revoke all on function private._sv5_ind(text,text,text,text,text,jsonb,numeric) from public, anon; grant execute on function private._sv5_ind(text,text,text,text,text,jsonb,numeric) to authenticated;