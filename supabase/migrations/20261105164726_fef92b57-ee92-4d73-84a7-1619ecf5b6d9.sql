
revoke all on function public._hr_pf_ok(uuid,text) from public, anon, authenticated;
revoke all on function public._hr_pf_any(uuid,text) from public, anon, authenticated;
revoke all on function public._hr_pf_user_can(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public._hr_pf_lock() from public, anon, authenticated;

create or replace function public._hr_pf_check_criteria(_c jsonb) returns jsonb language plpgsql immutable set search_path=public as $$
declare i jsonb; keys text[] := '{}'; out jsonb := '[]';
begin
  if jsonb_typeof(_c) <> 'array' or jsonb_array_length(_c) = 0 then raise exception 'أضف معيارًا واحدًا على الأقل'; end if;
  for i in select * from jsonb_array_elements(_c) loop
    if length(btrim(coalesce(i->>'label',''))) < 2 then raise exception 'لكل معيار اسم'; end if;
    if coalesce((i->>'weight')::numeric,0) <= 0 then raise exception 'وزن المعيار أكبر من صفر'; end if;
    if coalesce((i->>'max')::int,0) not between 1 and 10 then raise exception 'الدرجة القصوى للمعيار بين 1 و10'; end if;
    if coalesce(i->>'key','') = '' or i->>'key' = any(keys) then raise exception 'مفاتيح المعايير مكررة أو فارغة'; end if;
    keys := keys || (i->>'key');
    out := out || jsonb_build_object('key',i->>'key','label',btrim(i->>'label'),'weight',(i->>'weight')::numeric,'max',(i->>'max')::int);
  end loop;
  return out;
end $$;

create or replace function public._hr_pf_total(_c jsonb, _s jsonb) returns numeric language sql immutable set search_path=public as $$
  select round(sum((_s->>(c->>'key'))::numeric / (c->>'max')::numeric * (c->>'weight')::numeric) / nullif(sum((c->>'weight')::numeric),0) * 100, 2)
  from jsonb_array_elements(_c) c where _s ? (c->>'key') $$;

create or replace function public.hr_pf_form_save(_org uuid, _id uuid, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare f hr_pf_forms; c jsonb; cur jsonb; nid uuid;
begin
  if not _hr_pf_any(_org,'assign') then raise exception 'غير مصرح'; end if;
  if length(btrim(coalesce(_p->>'name',''))) < 2 then raise exception 'اكتب اسم النموذج'; end if;
  c := _hr_pf_check_criteria(coalesce(_p->'criteria','[]'));
  if _id is null then
    insert into hr_pf_forms(org_id,name,category,created_by,current_version) values(_org,btrim(_p->>'name'),coalesce(nullif(_p->>'category',''),'staff'),auth.uid(),1) returning id into nid;
    insert into hr_pf_form_versions(org_id,form_id,version,criteria,created_by) values(_org,nid,1,c,auth.uid());
    perform _hr_log(_org,'pf_form',nid,'create',null,jsonb_build_object('version',1),null); return nid;
  end if;
  select * into f from hr_pf_forms where id=_id and org_id=_org for update; if not found then raise exception 'غير موجود'; end if;
  select criteria into cur from hr_pf_form_versions where form_id=_id and version=f.current_version;
  update hr_pf_forms set name=btrim(_p->>'name'), category=coalesce(nullif(_p->>'category',''),category), active=coalesce((_p->>'active')::boolean,active) where id=_id;
  if cur is distinct from c then
    insert into hr_pf_form_versions(org_id,form_id,version,criteria,created_by) values(_org,_id,f.current_version+1,c,auth.uid());
    update hr_pf_forms set current_version=f.current_version+1 where id=_id;
    perform _hr_log(_org,'pf_form',_id,'new_version',jsonb_build_object('version',f.current_version),jsonb_build_object('version',f.current_version+1),null);
  end if;
  return _id;
end $$;

create or replace function public.hr_pf_cycle_save(_org uuid, _id uuid, _p jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare nid uuid; s date := nullif(_p->>'period_start','')::date; e date := nullif(_p->>'period_end','')::date;
begin
  if not _hr_pf_any(_org,'assign') then raise exception 'غير مصرح'; end if;
  if length(btrim(coalesce(_p->>'name',''))) < 2 then raise exception 'اكتب اسم الدورة'; end if;
  if s is null or e is null or e < s then raise exception 'حدد فترة التقييم بشكل صحيح'; end if;
  if _id is null then insert into hr_pf_cycles(org_id,name,period_start,period_end,created_by) values(_org,btrim(_p->>'name'),s,e,auth.uid()) returning id into nid;
  else update hr_pf_cycles set name=btrim(_p->>'name'), period_start=s, period_end=e, status=coalesce(nullif(_p->>'status',''),status) where id=_id and org_id=_org returning id into nid;
    if nid is null then raise exception 'غير موجود'; end if; end if;
  perform _hr_log(_org,'pf_cycle',nid,case when _id is null then 'create' else 'update' end,null,_p,null);
  return nid;
end $$;

create or replace function public.hr_pf_setup(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not (_hr_pf_any(_org,'view') or _hr_pf_any(_org,'assign') or exists(select 1 from hr_pf_reviews r where r.org_id=_org and r.evaluator=auth.uid())) then raise exception 'غير مصرح'; end if;
  return jsonb_build_object(
    'caps', jsonb_build_object('view',_hr_pf_any(_org,'view'),'assign',_hr_pf_any(_org,'assign'),'review',_hr_pf_any(_org,'review'),'publish',_hr_pf_any(_org,'publish'),'evidence',_hr_pf_any(_org,'evidence'),'export',_hr_pf_any(_org,'export')),
    'forms', coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'category',f.category,'active',f.active,'version',f.current_version,
        'criteria',(select criteria from hr_pf_form_versions v where v.form_id=f.id and v.version=f.current_version)) order by f.name) from hr_pf_forms f where f.org_id=_org),'[]'),
    'cycles', coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'period_start',c.period_start,'period_end',c.period_end,'status',c.status) order by c.period_start desc) from hr_pf_cycles c where c.org_id=_org),'[]'),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.name) from schools s where s.org_id=_org and _hr_pf_ok(s.id,'assign')),'[]'));
end $$;

create or replace function public.hr_pf_evaluators(_school uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not _hr_pf_ok(_school,'assign') then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id',x.user_id,'name',coalesce(p.full_name,'—')) order by p.full_name)
    from (select distinct m.user_id from memberships m where m.org_id=school_org(_school) and m.is_active and m.role not in ('student','guardian') and (m.school_id=_school or m.role='org_owner')) x
    left join profiles p on p.id=x.user_id where _hr_pf_user_can(_school,x.user_id,'evaluate')),'[]');
end $$;

create or replace function public.hr_pf_assign(_cycle uuid, _emp uuid, _form uuid, _evaluator uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare cy hr_pf_cycles; e hr_employees; f hr_pf_forms; v hr_pf_form_versions; sch uuid; nid uuid;
begin
  select * into cy from hr_pf_cycles where id=_cycle; if not found then raise exception 'الدورة غير موجودة'; end if;
  if cy.status<>'open' then raise exception 'الدورة مغلقة'; end if;
  select * into e from hr_employees where id=_emp; if not found or e.org_id<>cy.org_id then raise exception 'الموظف غير موجود في المؤسسة'; end if;
  sch := _hr_emp_school(e.id);
  if sch is null or not _hr_pf_ok(sch,'assign') then raise exception 'غير مصرح'; end if;
  select * into f from hr_pf_forms where id=_form and org_id=cy.org_id and active; if not found then raise exception 'النموذج غير متاح'; end if;
  select * into v from hr_pf_form_versions where form_id=f.id and version=f.current_version;
  if _evaluator is null or _evaluator = e.user_id then raise exception 'لا يقيّم الموظف نفسه'; end if;
  if not _hr_pf_user_can(sch,_evaluator,'evaluate') then raise exception 'المقيّم لا يملك صلاحية التقييم في مدرسة الموظف'; end if;
  insert into hr_pf_reviews(org_id,cycle_id,employee_id,school_id,form_version_id,criteria,evaluator,created_by)
    values(cy.org_id,_cycle,_emp,sch,v.id,v.criteria,_evaluator,auth.uid()) returning id into nid;
  perform _hr_log(cy.org_id,'pf_review',nid,'assign',null,jsonb_build_object('employee',_emp,'form',f.id,'version',v.version,'evaluator',_evaluator),null);
  perform _notify(_evaluator, sch, 'hr', 'تكليف بتقييم أداء', 'كُلّفت بتقييم '||e.full_name||' في '||cy.name||'.', '/app/hr/performance', 'hr-pf-as:'||nid);
  return nid;
exception when unique_violation then raise exception 'للموظف تقييم في هذه الدورة';
end $$;

-- authorized teacher-evaluation results that can be referenced as evidence
create or replace function public._hr_pf_sources(_emp uuid) returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(x order by x->>'date' desc),'[]') from (
    select jsonb_build_object('source','class_visit','ref',v.id,'date',v.visit_date,'label','زيارة صفية — '||coalesce(v.subject,'')||coalesce(' / '||v.lesson,''),'summary',left(coalesce(v.summary,''),300)) x
      from cv_visits v where v.status='approved' and v.teacher_id in (select a.teacher_id from hr_assignments a where a.employee_id=_emp and a.teacher_id is not null)
    union all
    select jsonb_build_object('source','monthly_eval','ref',m.id,'date',m.month,'label','تقييم شهري — '||to_char(m.month,'YYYY-MM'),'summary',coalesce((_ev_score(m.form_snapshot->'items', m.answers)->>'avg'),'')) 
      from ev_monthly m join hr_employees e on e.id=_emp where m.status='approved' and m.staff_user=e.user_id) z $$;
revoke all on function public._hr_pf_sources(uuid) from public, anon, authenticated;

create or replace function public._hr_pf_row(r hr_pf_reviews, _full boolean) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare e hr_employees; me boolean; ev boolean; seeev boolean;
begin
  select * into e from hr_employees where id=r.employee_id;
  me := e.user_id = auth.uid(); ev := r.evaluator = auth.uid();
  seeev := not me and (ev or _hr_pf_ok(r.school_id,'evidence'));
  return jsonb_build_object('id',r.id,'cycle',(select name from hr_pf_cycles where id=r.cycle_id),'cycle_id',r.cycle_id,'employee_id',e.id,'employee',e.full_name,'employee_no',e.employee_no,
    'school',(select name from schools where id=r.school_id),'form',(select f.name||' (إصدار '||v.version||')' from hr_pf_form_versions v join hr_pf_forms f on f.id=v.form_id where v.id=r.form_version_id),
    'criteria',r.criteria,'evaluator',_hr_name(r.evaluator),'status',r.status,'scores',r.scores,'total',r.total,'comments',r.comments,
    'evidence',case when seeev then r.evidence end, 'evidence_hidden', not seeev and jsonb_array_length(r.evidence)>0,
    'sources',case when _full and seeev and r.status in ('assigned','returned') then _hr_pf_sources(r.employee_id) end,
    'reviewer',_hr_name(r.reviewer),'reviewed_at',r.reviewed_at,'review_note',r.review_note,'publisher',_hr_name(r.publisher),'published_at',r.published_at,'published_total',r.published_total,
    'responded_at',r.responded_at,'objection',r.objection,'resolution',r.resolution,'resolution_note',r.resolution_note,'resolved_by',_hr_name(r.resolved_by),'resolved_at',r.resolved_at,'final_total',r.final_total,
    'can',jsonb_build_object(
      'evaluate', ev and r.status in ('assigned','returned'),
      'review', not me and not ev and r.status='submitted' and _hr_pf_ok(r.school_id,'review'),
      'publish', not me and r.status='reviewed' and _hr_pf_ok(r.school_id,'publish'),
      'resolve', not me and not ev and r.status='objected' and _hr_pf_ok(r.school_id,'review')),
    'events',case when _full then (select coalesce(jsonb_agg(jsonb_build_object('at',x.created_at,'action',x.action,'reason',x.reason,'by',_hr_name(x.actor)) order by x.created_at desc),'[]') from hr_events x where x.entity='pf_review' and x.entity_id=r.id) end);
end $$;
revoke all on function public._hr_pf_row(hr_pf_reviews,boolean) from public, anon, authenticated;

create or replace function public.hr_pf_list(_org uuid, _f jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not _hr_ext_on(_org,'performance') then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(_hr_pf_row(r,false) order by r.created_at desc) from hr_pf_reviews r join hr_employees e on e.id=r.employee_id
    where r.org_id=_org and e.user_id is distinct from auth.uid() and (r.evaluator=auth.uid() or _hr_pf_ok(r.school_id,'view') or _hr_pf_ok(r.school_id,'review') or _hr_pf_ok(r.school_id,'publish'))
      and (nullif(_f->>'cycle','') is null or r.cycle_id=(_f->>'cycle')::uuid)
      and (nullif(_f->>'status','') is null or r.status=_f->>'status')
      and (coalesce((_f->>'mine')::boolean,false)=false or r.evaluator=auth.uid())),'[]');
end $$;

create or replace function public.hr_pf_get(_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r hr_pf_reviews;
begin
  select * into r from hr_pf_reviews where id=_id;
  if not found or (select user_id from hr_employees where id=r.employee_id) is not distinct from auth.uid()
     or not (r.evaluator=auth.uid() or _hr_pf_ok(r.school_id,'view') or _hr_pf_ok(r.school_id,'review') or _hr_pf_ok(r.school_id,'publish')) then raise exception 'غير موجود أو غير مصرح'; end if;
  return _hr_pf_row(r,true);
end $$;

create or replace function public.hr_pf_save(_id uuid, _p jsonb, _submit boolean default false) returns jsonb language plpgsql security definer set search_path=public as $$
declare r hr_pf_reviews; c jsonb; s jsonb := '{}'; ev jsonb := '[]'; src jsonb; refs text[]; x jsonb;
begin
  select * into r from hr_pf_reviews where id=_id for update; if not found or r.evaluator<>auth.uid() then raise exception 'غير موجود أو غير مصرح'; end if;
  if not _hr_ext_on(r.org_id,'performance') or not _hr_pf_user_can(r.school_id,auth.uid(),'evaluate') then raise exception 'صلاحية التقييم غير متاحة'; end if;
  if r.status not in ('assigned','returned') then raise exception 'التقييم ليس في مرحلة التعبئة'; end if;
  for c in select * from jsonb_array_elements(r.criteria) loop
    if (_p->'scores') ? (c->>'key') and nullif(_p->'scores'->>(c->>'key'),'') is not null then
      if (_p->'scores'->>(c->>'key')) !~ '^[0-9]+(\.[0-9]+)?$' or (_p->'scores'->>(c->>'key'))::numeric > (c->>'max')::numeric then raise exception 'درجة «%» بين 0 و%', c->>'label', c->>'max'; end if;
      s := s || jsonb_build_object(c->>'key', (_p->'scores'->>(c->>'key'))::numeric);
    end if;
  end loop;
  src := _hr_pf_sources(r.employee_id);
  select array_agg(v) into refs from jsonb_array_elements_text(coalesce(_p->'evidence','[]')) v;
  for x in select * from jsonb_array_elements(src) loop if x->>'ref' = any(coalesce(refs,'{}')) then ev := ev || x; end if; end loop;
  if coalesce(array_length(refs,1),0) <> jsonb_array_length(ev) then raise exception 'مرجع دليل غير مصرح'; end if;
  if _submit and (select count(*) from jsonb_array_elements(r.criteria)) <> (select count(*) from jsonb_object_keys(s)) then raise exception 'أكمل درجات جميع المعايير قبل الإرسال'; end if;
  update hr_pf_reviews set scores=s, total=_hr_pf_total(r.criteria,s), comments=nullif(btrim(coalesce(_p->>'comments','')),''), evidence=ev,
    status=case when _submit then 'submitted' else status end, rev=rev+1 where id=_id returning * into r;
  perform _hr_log(r.org_id,'pf_review',_id,case when _submit then 'submit' else 'save' end,null,jsonb_build_object('total',r.total,'evidence',jsonb_array_length(ev)),null);
  return _hr_pf_row(r,true);
end $$;

create or replace function public.hr_pf_review(_id uuid, _approve boolean, _note text) returns void language plpgsql security definer set search_path=public as $$
declare r hr_pf_reviews;
begin
  select * into r from hr_pf_reviews where id=_id for update; if not found or not _hr_pf_ok(r.school_id,'review') then raise exception 'غير موجود أو غير مصرح'; end if;
  if r.evaluator=auth.uid() or (select user_id from hr_employees where id=r.employee_id)=auth.uid() then raise exception 'المراجع غير المقيّم وغير الموظف'; end if;
  if r.status<>'submitted' then raise exception 'التقييم ليس بانتظار المراجعة'; end if;
  if not _approve and length(btrim(coalesce(_note,''))) < 3 then raise exception 'اذكر سبب الإعادة'; end if;
  update hr_pf_reviews set status=case when _approve then 'reviewed' else 'returned' end, reviewer=auth.uid(), reviewed_at=now(), review_note=nullif(btrim(coalesce(_note,'')),'') where id=_id;
  perform _hr_log(r.org_id,'pf_review',_id,case when _approve then 'review_ok' else 'return' end,null,null,nullif(btrim(coalesce(_note,'')),''));
  if not _approve then perform _notify(r.evaluator, r.school_id, 'hr', 'أُعيد تقييم أداء للتعديل', btrim(_note), '/app/hr/performance', 'hr-pf-ret:'||_id||':'||r.rev); end if;
end $$;

create or replace function public.hr_pf_publish(_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare r hr_pf_reviews; e hr_employees;
begin
  select * into r from hr_pf_reviews where id=_id for update; if not found or not _hr_pf_ok(r.school_id,'publish') then raise exception 'غير موجود أو غير مصرح'; end if;
  select * into e from hr_employees where id=r.employee_id;
  if e.user_id=auth.uid() then raise exception 'لا ينشر الموظف تقييمه'; end if;
  if r.status<>'reviewed' then raise exception 'النشر بعد المراجعة فقط'; end if;
  update hr_pf_reviews set status='published', publisher=auth.uid(), published_at=now(), published_total=r.total, published_scores=r.scores, published_comments=r.comments, final_total=r.total where id=_id;
  perform _hr_log(r.org_id,'pf_review',_id,'publish',null,jsonb_build_object('total',r.total),null);
  if e.user_id is not null and e.self_access then perform _notify(e.user_id, r.school_id, 'hr', 'نُشرت نتيجة تقييم أدائك', 'يمكنك الاطلاع عليها والإقرار بها أو الاعتراض.', '/app/my-employment?tab=performance', 'hr-pf-pub:'||_id); end if;
end $$;

create or replace function public.hr_pf_respond(_id uuid, _ack boolean, _text text) returns void language plpgsql security definer set search_path=public as $$
declare r hr_pf_reviews;
begin
  select * into r from hr_pf_reviews where id=_id for update;
  if not found or not _hr_self_live(r.employee_id) or not _hr_ext_on(r.org_id,'performance') then raise exception 'غير موجود أو غير مصرح'; end if;
  if r.status<>'published' then raise exception 'لا يمكن الرد على هذا التقييم'; end if;
  if not _ack and length(btrim(coalesce(_text,''))) < 10 then raise exception 'اكتب أسباب الاعتراض (10 أحرف على الأقل)'; end if;
  update hr_pf_reviews set status=case when _ack then 'acknowledged' else 'objected' end, responded_at=now(), objection=case when _ack then null else btrim(_text) end where id=_id;
  perform _hr_log(r.org_id,'pf_review',_id,case when _ack then 'ack' else 'object' end,null,null,case when _ack then null else btrim(_text) end);
end $$;

create or replace function public.hr_pf_resolve(_id uuid, _amend boolean, _note text, _total numeric default null) returns void language plpgsql security definer set search_path=public as $$
declare r hr_pf_reviews; e hr_employees;
begin
  select * into r from hr_pf_reviews where id=_id for update; if not found or not _hr_pf_ok(r.school_id,'review') then raise exception 'غير موجود أو غير مصرح'; end if;
  select * into e from hr_employees where id=r.employee_id;
  if r.evaluator=auth.uid() or e.user_id=auth.uid() then raise exception 'يبت في الاعتراض غير المقيّم وغير الموظف'; end if;
  if r.status<>'objected' then raise exception 'لا يوجد اعتراض قائم'; end if;
  if length(btrim(coalesce(_note,''))) < 3 then raise exception 'اكتب نتيجة البت'; end if;
  if _amend and (_total is null or _total < 0 or _total > 100) then raise exception 'النتيجة المعدلة بين 0 و100'; end if;
  update hr_pf_reviews set status='resolved', resolution=case when _amend then 'amended' else 'upheld' end, resolution_note=btrim(_note), resolved_by=auth.uid(), resolved_at=now(),
    final_total=case when _amend then round(_total,2) else r.published_total end where id=_id;
  perform _hr_log(r.org_id,'pf_review',_id,case when _amend then 'amend' else 'uphold' end,jsonb_build_object('total',r.published_total),jsonb_build_object('total',case when _amend then _total else r.published_total end),btrim(_note));
  if e.user_id is not null and e.self_access then perform _notify(e.user_id, r.school_id, 'hr', 'صدرت نتيجة اعتراضك على تقييم الأداء', btrim(_note), '/app/my-employment?tab=performance', 'hr-pf-res:'||_id); end if;
end $$;

create or replace function public.hr_pf_my(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare emp uuid := _hr_me_emp(_org);
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if emp is null or not _hr_self_live(emp) or not _hr_ext_on(_org,'performance') then return jsonb_build_object('enabled',_hr_ext_on(_org,'performance'),'items','[]'::jsonb); end if;
  return jsonb_build_object('enabled',true,'items',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'cycle',c.name,'period_start',c.period_start,'period_end',c.period_end,
      'criteria',r.criteria,'scores',r.published_scores,'total',r.published_total,'comments',r.published_comments,'published_at',r.published_at,'status',r.status,
      'objection',r.objection,'responded_at',r.responded_at,'resolution',r.resolution,'resolution_note',r.resolution_note,'final_total',r.final_total) order by r.published_at desc)
    from hr_pf_reviews r join hr_pf_cycles c on c.id=r.cycle_id where r.employee_id=emp and r.published_at is not null),'[]'));
end $$;

create or replace function public.hr_pf_people(_school uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not _hr_pf_ok(_school,'assign') then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',e.full_name,'employee_no',e.employee_no,'job_title',e.job_title) order by e.full_name)
    from hr_employees e where e.status='active' and _hr_emp_school(e.id)=_school),'[]');
end $$;

-- extension switch: performance now available; caps exposed
do $$ declare d text; begin
  d := pg_get_functiondef('public.hr_ext_list(uuid)'::regprocedure);
  d := replace(d, $q$'insurance_schools',$q$, $q$'performance', jsonb_build_object('view',_hr_pf_any(_org,'view'),'assign',_hr_pf_any(_org,'assign'),'review',_hr_pf_any(_org,'review'),'publish',_hr_pf_any(_org,'publish'),
       'evaluator', exists(select 1 from hr_pf_reviews r where r.org_id=_org and r.evaluator=auth.uid())),
    'insurance_schools',$q$);
  execute d;
  d := pg_get_functiondef('public._hr_purge_org(uuid)'::regprocedure);
  d := replace(d, 'delete from hr_hs_stays where org_id=_org;', 'delete from hr_pf_reviews where org_id=_org;
  delete from hr_pf_cycles where org_id=_org;
  delete from hr_pf_form_versions where org_id=_org;
  delete from hr_pf_forms where org_id=_org;
  delete from hr_hs_stays where org_id=_org;');
  execute d;
end $$;

do $$ declare f text; begin
  foreach f in array array['hr_pf_form_save(uuid,uuid,jsonb)','hr_pf_cycle_save(uuid,uuid,jsonb)','hr_pf_setup(uuid)','hr_pf_evaluators(uuid)','hr_pf_assign(uuid,uuid,uuid,uuid)','hr_pf_list(uuid,jsonb)','hr_pf_get(uuid)',
    'hr_pf_save(uuid,jsonb,boolean)','hr_pf_review(uuid,boolean,text)','hr_pf_publish(uuid)','hr_pf_respond(uuid,boolean,text)','hr_pf_resolve(uuid,boolean,text,numeric)','hr_pf_my(uuid)','hr_pf_people(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public._hr_pf_check_criteria(jsonb) from public, anon, authenticated;
  revoke all on function public._hr_pf_total(jsonb,jsonb) from public, anon, authenticated;
end $$;
