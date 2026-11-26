-- Set-based twin of _sf_balance: the one balance formula, evaluated for many obligations in one query.
CREATE OR REPLACE FUNCTION public._sf_balances(_ids uuid[])
 RETURNS TABLE(obligation_id uuid, bal jsonb)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
 with b as (select o.id, o.amount from sf_obligations o where o.id = any(_ids)),
 d as (select x.obligation_id o, sum(x.amount) s from sf_applied x where x.obligation_id = any(_ids) and x.active group by 1),
 c as (select x.obligation_id o, sum(x.amount) s from sf_allocations x join sf_collections c on c.id=x.collection_id where x.obligation_id = any(_ids) and c.status<>'reversed' group by 1),
 ci as (select m.target_obligation_id o, sum(m.amount) s from sf_credit_moves m where m.target_obligation_id = any(_ids) group by 1),
 co as (select m.source_obligation_id o, sum(m.amount) s from sf_credit_moves m where m.source_obligation_id = any(_ids) group by 1),
 a as (select b.id, b.amount, coalesce(d.s,0) discount, coalesce(c.s,0) cash, coalesce(ci.s,0) cin, coalesce(co.s,0) cout
       from b left join d on d.o=b.id left join c on c.o=b.id left join ci on ci.o=b.id left join co on co.o=b.id)
 select a.id, jsonb_build_object('gross',amount,'discount',discount,'net',greatest(0,amount-discount),'recorded',cash+cin-cout,'cash',cash,'credit_in',cin,'credit_out',cout,
  'remaining',greatest(0,greatest(0,amount-discount)-(cash+cin-cout)),'credit',greatest(0,(cash+cin-cout)-greatest(0,amount-discount))) from a
$f$;
REVOKE ALL ON FUNCTION public._sf_balances(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._sf_balances(uuid[]) TO service_role;
-- _sf_balance now reads the same formula (single source); result unchanged, null for an unknown id.
CREATE OR REPLACE FUNCTION public._sf_balance(_ob uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ select x.bal from _sf_balances(array[_ob]) x $f$;

CREATE OR REPLACE FUNCTION public._au_ds(_ev text, _org uuid, _schools uuid[], _lim integer, _entity uuid, _params jsonb)
 RETURNS TABLE(entity uuid, school uuid, period text, ctx jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare td date := school_today(); p jsonb; aft uuid; rep text; bk text; yk text; tm text; fk text; rg text; nd int; pf date; pt date; rec text; lim int;
begin
 aft := nullif(coalesce(_params,'{}'::jsonb)->>'_after','')::uuid;
 p := coalesce(_au_check_params(_ev, coalesce(nullif(_params,'null'::jsonb),'{}'::jsonb) - '_after'), '{}'::jsonb);
 rep := coalesce(p->>'repeat','once');
 bk := case rep when 'daily' then '@'||td::text when 'weekly' then '@'||to_char(td,'IYYY-IW') when 'monthly' then '@'||to_char(td,'YYYY-MM') else '' end;
 lim := least(greatest(coalesce(_lim,100),1), 20000);
 if _ev = 'ds.student_accounts' then
   if not section_enabled(_org,'finance') then return; end if;
   yk := coalesce(p->>'year','current'); tm := coalesce(p->>'term','all'); fk := coalesce(p->>'fee_kind','all');
   return query
   with sc as (select s.id, s.name from schools s where s.org_id=_org and s.is_active and (_schools is null or s.id = any(_schools))),
   yr as (select distinct on (y.school_id) y.school_id, y.id, y.name from academic_years y join sc on sc.id=y.school_id
          where case when yk='current' then (y.is_current or td between y.start_date and y.end_date) else y.name=yk end
          order by y.school_id, y.is_current desc, y.start_date desc),
   st as (select s.id, s.school_id, s.status, coalesce(s.display_name, s.full_name) nm, yr.id yid, yr.name yname, sc.name sname
          from students s join yr on yr.school_id=s.school_id join sc on sc.id=s.school_id
          where (_entity is null or s.id=_entity) and (aft is null or s.id > aft) order by s.id limit lim),
   obr as (select b.id, b.student_id, b.kind, b.due_date, b.original, b.status
          from st join sf_obligations b on b.student_id=st.id join academic_years ya on ya.id=b.year_id and ya.name=st.yname
          where (fk='all' or b.kind=fk) and (tm='all' or b.term = tm::int)),
   bls as (select x.obligation_id, x.bal from _sf_balances(array(select obr.id from obr where obr.status='pending')) x),
   ob as (select obr.student_id, obr.kind, obr.due_date, obr.original, obr.status, bls.bal bl from obr left join bls on bls.obligation_id=obr.id),
   ag as (select ob.student_id,
            sum(ob.original) filter (where ob.status='pending') original,
            sum((ob.bl->>'discount')::numeric) discount, sum((ob.bl->>'net')::numeric) net, sum((ob.bl->>'recorded')::numeric) paid,
            sum((ob.bl->>'remaining')::numeric) remaining, sum((ob.bl->>'credit')::numeric) credit,
            coalesce(sum((ob.bl->>'remaining')::numeric) filter (where ob.due_date <= td),0) due_now,
            coalesce(sum((ob.bl->>'remaining')::numeric) filter (where ob.due_date < td),0) overdue,
            max(td - ob.due_date) filter (where ob.due_date < td and (ob.bl->>'remaining')::numeric > 0) days_overdue,
            min(ob.due_date) filter (where ob.due_date >= td and (ob.bl->>'remaining')::numeric > 0) next_due,
            coalesce(sum((ob.bl->>'net')::numeric) filter (where ob.kind='tuition'),0) tuition_net,
            coalesce(sum((ob.bl->>'net')::numeric) filter (where ob.kind='transport'),0) transport_net,
            coalesce(sum((ob.bl->>'remaining')::numeric) filter (where ob.kind='tuition'),0) tuition_remaining,
            coalesce(sum((ob.bl->>'remaining')::numeric) filter (where ob.kind='transport'),0) transport_remaining
          from ob group by ob.student_id),
   pvr as (select b.id, b.student_id
          from st join sf_obligations b on b.student_id=st.id and b.status='pending'
          join academic_years ya on ya.id=b.year_id and ya.name <> st.yname
          where (fk='all' or b.kind=fk) and exists (select 1 from sf_carries ca where ca.obligation_id=b.id and ca.to_key=st.yname and ca.direction='debit')),
   pv as (select pvr.student_id, sum((x.bal->>'remaining')::numeric) prev
          from pvr join _sf_balances(array(select pvr.id from pvr)) x on x.obligation_id=pvr.id group by pvr.student_id),
   en as (select distinct on (e.student_id) e.student_id, se.id sec, se.name secn, g.id gid, g.name gn, sg.id sgid, sg.name sgn
          from st join enrollments e on e.student_id=st.id and e.status='active' join sections se on se.id=e.section_id
          left join grades g on g.id=se.grade_id left join stages sg on sg.id=g.stage_id
          order by e.student_id, (e.year_id=st.yid) desc, e.start_date desc nulls last),
   gu as (select distinct on (x.student_id) x.student_id, coalesce(g.display_name, g.full_name) gname
          from st join student_guardians x on x.student_id=st.id and x.can_follow join guardians g on g.id=x.guardian_id
          order by x.student_id, x.verified desc, x.created_at)
   select st.id, st.school_id, st.yname||':'||tm||':'||fk||bk,
     jsonb_build_object('student',st.id,'student_name',st.nm,'guardian_name',gu.gname,'school',st.school_id,'school_name',st.sname,
       'stage',en.sgid,'stage_name',en.sgn,'grade',en.gid,'grade_name',en.gn,'section',en.sec,'section_name',en.secn,
       'year_name',st.yname,'term_label',case tm when '1' then 'الفصل الأول' when '2' then 'الفصل الثاني' else 'العام كاملًا' end,
       'student_status',st.status,'fin_ready',ag.student_id is not null,'previous_balance',pv.prev,'label',st.nm,'link','/app/finance')
     || case when ag.student_id is null then '{}'::jsonb else jsonb_build_object('original',coalesce(ag.original,0),'discount',coalesce(ag.discount,0),'net',coalesce(ag.net,0),
       'tuition_net',ag.tuition_net,'transport_net',ag.transport_net,'paid',coalesce(ag.paid,0),'remaining',coalesce(ag.remaining,0),
       'tuition_remaining',ag.tuition_remaining,'transport_remaining',ag.transport_remaining,'due_now',ag.due_now,'overdue',ag.overdue,
       'total_with_previous',coalesce(ag.remaining,0)+coalesce(pv.prev,0),'credit',coalesce(ag.credit,0),
       'paid_pct',case when coalesce(ag.net,0)>0 then round(least(coalesce(ag.paid,0),ag.net)*100/ag.net,2) end,
       'next_due',ag.next_due,'days_overdue',ag.days_overdue) end
   from st left join ag on ag.student_id=st.id left join pv on pv.student_id=st.id left join en on en.student_id=st.id left join gu on gu.student_id=st.id
   order by st.id;

 elsif _ev = 'ds.student_absence' then
   rg := coalesce(p->>'range','last_days'); nd := coalesce((p->>'days')::int,30); pf := (p->>'from')::date; pt := (p->>'to')::date;
   return query
   with sc as (select s.id, s.name from schools s where s.org_id=_org and s.is_active and (_schools is null or s.id = any(_schools))),
   rr as (select sc.id sid, sc.name sname,
            case rg when 'custom' then pf when 'term' then coalesce(t.start_date, td-29) when 'year' then coalesce(y.start_date, td-364) else td-nd+1 end f,
            case rg when 'custom' then pt else td end t
          from sc left join lateral (select tt.start_date from terms tt where tt.school_id=sc.id and td between tt.start_date and tt.end_date order by tt.start_date desc limit 1) t on true
          left join lateral (select yy.start_date from academic_years yy where yy.school_id=sc.id and (yy.is_current or td between yy.start_date and yy.end_date) order by yy.is_current desc, yy.start_date desc limit 1) y on true),
   ids as (select distinct on (a.student_id) a.student_id, a.school_id from attendance_days a join rr on rr.sid=a.school_id and a.date between rr.f and rr.t
           where a.status <> 'pending_review' and (_entity is null or a.student_id=_entity) and (aft is null or a.student_id > aft) order by a.student_id limit lim),
   a as (select a.student_id, a.date, a.status, coalesce(a.late_minutes,0) lm from ids join rr on rr.sid=ids.school_id
         join attendance_days a on a.student_id=ids.student_id and a.school_id=ids.school_id and a.date between rr.f and rr.t where a.status <> 'pending_review'),
   isl as (select a.student_id, (a.status in ('absent','in_school_absent','excused')) ab,
             row_number() over (partition by a.student_id order by a.date) - row_number() over (partition by a.student_id, (a.status in ('absent','in_school_absent','excused')) order by a.date) g from a),
   cons as (select z.student_id, max(z.n) mx from (select isl.student_id, isl.g, count(*) n from isl where isl.ab group by 1,2) z group by 1),
   ag as (select a.student_id, count(*) rec, count(*) filter (where a.status in ('absent','in_school_absent','excused')) tot, count(*) filter (where a.status in ('absent','in_school_absent')) unex,
            count(*) filter (where a.status='excused') exc, count(*) filter (where a.status='late') lt, coalesce(sum(a.lm) filter (where a.status='late'),0) ltm,
            max(a.date) filter (where a.status in ('absent','in_school_absent','excused')) last from a group by 1),
   en as (select distinct on (e.student_id) e.student_id, se.id sec, se.name secn, g.id gid, g.name gn, sg.id sgid, sg.name sgn
          from ids join enrollments e on e.student_id=ids.student_id and e.status='active' join sections se on se.id=e.section_id
          left join grades g on g.id=se.grade_id left join stages sg on sg.id=g.stage_id order by e.student_id, e.start_date desc nulls last)
   select ids.student_id, ids.school_id,
     (case rg when 'custom' then rr.f||'..'||rr.t when 'last_days' then 'last'||nd else rg||':'||rr.f end)||bk,
     jsonb_build_object('student',ids.student_id,'student_name',coalesce(s.display_name,s.full_name),'school',ids.school_id,'school_name',rr.sname,
       'stage',en.sgid,'stage_name',en.sgn,'grade',en.gid,'grade_name',en.gn,'section',en.sec,'section_name',en.secn,
       'total_absent',ag.tot,'unexcused',ag.unex,'excused',ag.exc,'late_days',ag.lt,'late_minutes',ag.ltm,'max_consecutive',coalesce(cons.mx,0),
       'pattern',case when coalesce(cons.mx,0) >= 2 then 'consecutive' when ag.tot > 0 then 'scattered' else 'none' end,
       'recorded_days',ag.rec,'absence_rate',case when ag.rec>0 then round(ag.tot*100.0/ag.rec,2) end,'last_absence',ag.last,
       'range_from',rr.f,'range_to',rr.t,'label',coalesce(s.display_name,s.full_name),'link','/app/attendance')
   from ids join rr on rr.sid=ids.school_id join students s on s.id=ids.student_id join ag on ag.student_id=ids.student_id
   left join cons on cons.student_id=ids.student_id left join en on en.student_id=ids.student_id
   order by ids.student_id;

 elsif _ev = 'ds.org_docs' then
   return query
   select d.id, d.school_id, coalesce(d.expires_on::text,'none')||bk,
     jsonb_build_object('doc',d.id,'scope',case when d.school_id is null then 'central' else 'school' end,'school',d.school_id,'school_name',coalesce(s.name,'الإدارة المركزية'),
       'kind',d.kind,'name',d.name,'doc_no',d.doc_no,'issuer',d.issuer,'issued_on',d.issued_on,'expires_on',d.expires_on,'days_left',d.expires_on - td,
       'expired',d.expires_on is not null and d.expires_on < td,'has_expiry',d.expires_on is not null,'label',d.name,'link','/app/org-docs')
   from org_docs d left join schools s on s.id=d.school_id
   where d.org_id=_org and d.archived_at is null
     and ((d.school_id is null and _schools is null) or (d.school_id is not null and s.is_active and (_schools is null or d.school_id = any(_schools))))
     and (_entity is null or d.id=_entity) and (aft is null or d.id > aft)
   order by d.id limit lim;

 elsif _ev = 'ds.maintenance' then
   if not section_enabled(_org,'operations') then return; end if;
   return query
   select r.id, r.school_id, coalesce(r.expected_done::text,'-')||bk,
     jsonb_build_object('kind',r.kind,'category',r.category_id,'category_name',c.name,'status',r.status,'open',r.status not in ('closed','cancelled'),'priority',r.priority,
       'created',(r.created_at at time zone 'Asia/Riyadh')::date,'expected_done',r.expected_done,'days_open',td - (r.created_at at time zone 'Asia/Riyadh')::date,
       'days_late',case when r.status not in ('closed','cancelled') and r.expected_done < td then td - r.expected_done else 0 end,'progress',r.progress,
       'school',r.school_id,'school_name',s.name,'handler',r.assignee_id,'has_handler',r.assignee_id is not null,'requester',r.requested_by,'ref',r.ref,'title',r.title,
       'label',coalesce(r.ref||' — ','')||r.title,'link',case when r.kind='bus' then '/app/bus-maintenance' else '/app/maintenance' end)
   from mt_requests r join schools s on s.id=r.school_id left join mt_categories c on c.id=r.category_id
   where r.org_id=_org and s.org_id=_org and s.is_active and (_schools is null or r.school_id = any(_schools))
     and (_entity is null or r.id=_entity) and (aft is null or r.id > aft)
   order by r.id limit lim;

 elsif _ev = 'ds.hr_docs' then
   if not section_enabled(_org,'hr') then return; end if;
   rec := coalesce(p->>'record','all');
   return query
   with x as (
     select d.id eid, 'document'::text rk, d.employee_id emp, d.type_id dt, t.name dtn, null::text ck, null::text cno, v.expires_on exp, null::text cst, null::boolean ren,
            exists(select 1 from hr_document_versions w where w.document_id=d.id and w.status='under_review') urv, null::uuid csch
     from hr_documents d join hr_doc_types t on t.id=d.type_id and t.is_active and not t.confidential
     join hr_document_versions v on v.document_id=d.id and v.version=d.accepted_version
     where d.org_id=_org and rec in ('all','document') and (_entity is null or d.id=_entity) and (aft is null or d.id > aft)
     union all
     select c.id, 'contract', c.employee_id, null, null, cv.data->>'kind', c.contract_no, c.end_date, c.status, _hrc_renewed_ok(c.id), false, c.school_id
     from hr_contracts c left join hr_contract_versions cv on cv.contract_id=c.id and cv.version=c.in_force
     where c.org_id=_org and rec in ('all','contract') and c.status <> 'cancelled' and (_entity is null or c.id=_entity) and (aft is null or c.id > aft)),
   y as (select x.*, coalesce(e.display_name,e.full_name) en, e.user_id eu, e.status es, coalesce(asg.school_id, x.csch) sid, asg.department dep, asg.category_id cat, coalesce(asg.job_title, e.job_title) jt
         from x join hr_employees e on e.id=x.emp and e.org_id=_org and e.status <> 'archived'
         left join lateral (select a.school_id, a.department, a.category_id, a.job_title from hr_assignments a where a.employee_id=e.id and (a.end_date is null or a.end_date >= td)
                            order by a.is_primary desc nulls last, a.start_date desc nulls last limit 1) asg on true)
   select y.eid, y.sid, coalesce(y.exp::text,'none')||bk,
     jsonb_build_object('record',y.rk,'doc_type',y.dt,'doc_type_name',y.dtn,'contract_kind',y.ck,'contract_no',y.cno,'employee',y.emp,'employee_name',y.en,
       'employee_user',y.eu,'manager_user',_au_manager(y.emp),'school',y.sid,'school_name',s.name,'department',y.dep,'category',y.cat,'category_name',jc.name,
       'job_title',y.jt,'employee_status',y.es,'expires_on',y.exp,'days_left',y.exp - td,'expired',y.exp is not null and y.exp < td,
       'contract_status',y.cst,'renewed',y.ren,'under_review',y.urv,
       'label',y.en||' — '||coalesce(y.dtn,'عقد '||y.cno),'link',case when y.rk='contract' then '/app/hr/contracts?c='||y.eid else '/app/hr/documents' end)
   from y join schools s on s.id=y.sid and s.org_id=_org and s.is_active left join hr_job_categories jc on jc.id=y.cat
   where (_schools is null or y.sid = any(_schools))
   order by y.eid limit lim;

 elsif _ev = 'ds.admin_tasks' then
   return query
   select t.id, t.school_id, coalesce(t.due_date::text,'-')||bk,
     jsonb_build_object('school',t.school_id,'school_name',s.name,'department',t.department_id,'department_name',dp.name,'title',t.title,
       'assigner',t.assigner,'assigner_name',_adm_name(t.assigner),'assignee',t.assignee,'assignee_name',_adm_name(t.assignee),
       'status',t.status,'open',t.status not in ('done','cancelled'),'priority',t.priority,'created',(t.created_at at time zone 'Asia/Riyadh')::date,
       'start_date',t.start_date,'due',t.due_date,
       'days_overdue',case when t.status in ('new','in_progress','returned') and t.due_date < td then td - t.due_date else 0 end,
       'days_left',t.due_date - td,'progress',t.progress,'blocked',t.blocked_at is not null,'needs_confirmation',t.needs_confirmation,
       'automated',t.auto_rule_id is not null,'auto_rule',t.auto_rule_id,'label',t.title,'link','/app/admin/tasks/'||t.id)
   from adm_tasks t join schools s on s.id=t.school_id left join departments dp on dp.id=t.department_id
   where s.org_id=_org and s.is_active and (_schools is null or t.school_id = any(_schools))
     and (_entity is null or t.id=_entity) and (aft is null or t.id > aft)
   order by t.id limit lim;
 else
   raise exception 'unknown data source %', _ev;
 end if;
end $function$;