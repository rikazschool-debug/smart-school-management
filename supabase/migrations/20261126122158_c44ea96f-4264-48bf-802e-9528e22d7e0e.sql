-- ===== 1. storage =====
CREATE TABLE public.au_step_out(
  outbox_id bigint NOT NULL, rule_id uuid NOT NULL, step text NOT NULL, kind text NOT NULL,
  ref_id uuid, data jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (outbox_id, rule_id, step));
GRANT ALL ON public.au_step_out TO service_role;
ALTER TABLE public.au_step_out ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.au_reports(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL, school_id uuid, rule_id uuid, version int, outbox_id bigint, step text,
  idem text NOT NULL UNIQUE, title text NOT NULL, source text NOT NULL, columns jsonb NOT NULL, rows jsonb NOT NULL, summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  row_count int NOT NULL DEFAULT 0, truncated boolean NOT NULL DEFAULT false, period_from date, period_to date, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX au_reports_org_idx ON public.au_reports(org_id, created_at DESC);
GRANT ALL ON public.au_reports TO service_role;
ALTER TABLE public.au_reports ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.au_report_access(
  report_id uuid NOT NULL REFERENCES public.au_reports(id) ON DELETE CASCADE, user_id uuid NOT NULL, granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, user_id));
CREATE INDEX au_report_access_user_idx ON public.au_report_access(user_id);
GRANT ALL ON public.au_report_access TO service_role;
ALTER TABLE public.au_report_access ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.au_update_fields(
  event_code text NOT NULL, field text NOT NULL, target text NOT NULL, allowed text[] NOT NULL, label text NOT NULL,
  PRIMARY KEY (event_code, field));
GRANT ALL ON public.au_update_fields TO service_role;
ALTER TABLE public.au_update_fields ENABLE ROW LEVEL SECURITY;
INSERT INTO public.au_update_fields VALUES
 ('adm.task.overdue','priority','adm_tasks', array['high'], 'رفع أولوية التكليف'),
 ('ds.maintenance','priority','mt_requests', array['high','urgent'], 'رفع أولوية طلب الصيانة');

-- ===== 2. action registry =====
INSERT INTO public.au_actions(code,label,enabled,side_effects,service,required,optional,risk,needs_human,retry,dedupe,readiness,note) VALUES
 ('create_mt_request','إنشاء طلب صيانة وإسناده',true,'mt_requests + mt_events (+ إشعار المكلّف من خدمة الصيانة)','نفس مسار mt_create: مرجع MS-، إسناد للمنفذ، سجل الأحداث — باسم من اعتمد القاعدة',
   array['title','description','category','place'],array['priority','assign','key','on_fail'],'medium',false,'كما المحرك: 5 محاولات ثم عزل','مخرَج الخطوة (outbox+rule+step) + client_key','ready','يجب أن يملك المعتمد صلاحية تقديم طلب صيانة للفرع لحظة التنفيذ؛ صيانة المدارس فقط حاليًا'),
 ('hr_letter_request','إنشاء طلب خطاب بانتظار الاعتماد',true,'hr_letters (requested) + _hr_log','مسار الخطابات القائم: الطلب ثم المراجعة البشرية ثم الإصدار — لا إصدار آلي',
   array['template','purpose'],array['addressee','key','on_fail'],'high',true,'كما المحرك','مخرَج الخطوة','ready','القاعدة يعتمدها مدير النظام؛ الخطاب لا يصدر إلا بقرار بشري'),
 ('update_field','تحديث حقل مسموح',true,'حقل واحد من au_update_fields','RPC داخلي مع سجل القسم (_adm_log / _mt_ev)',
   array['field','value'],array['on_fail'],'medium',false,'كما المحرك','لا تغيير إن كانت القيمة نفسها','ready','حقول وقيم محددة فقط؛ لا مبالغ ولا حذف ولا صلاحيات'),
 ('wait_until','الانتظار حتى تحقق شرط أو قرار اعتماد',true,'none','au_jobs (مهمة متابعة دائمة)',
   array['when'],array['every_minutes','max_minutes','timeout'],'low',false,null,'مفتاح لكل جولة','ready','يُعاد قراءة السجل والمخرجات في كل جولة؛ مسار عند انتهاء المهلة')
ON CONFLICT (code) DO NOTHING;
UPDATE public.au_actions SET enabled=true, readiness='ready', required=array['title','source','share'], optional=array['fields','filter','notify','key','on_fail'],
  service='au_reports: لقطة بيانات من مصدر معتمد على الخادم، تُفتح PDF/Excel بخدمة التصدير القائمة بهوية المدرسة', side_effects='au_reports + au_report_access (+ إشعار اختياري)',
  dedupe='md5(job+step)', note='المعتمد يجب أن يملك قراءة المصدر لحظة التنفيذ؛ مصدر حضور أسبوعي مدمج rep.attendance_week'
 WHERE code='report';

-- ===== 3. outputs =====
CREATE OR REPLACE FUNCTION public._au_out_put(_ob bigint, _rule uuid, _step text, _kind text, _ref uuid, _data jsonb)
 RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ insert into au_step_out(outbox_id, rule_id, step, kind, ref_id, data) values (_ob, _rule, _step, _kind, _ref, coalesce(_data,'{}')) on conflict do nothing $$;

CREATE OR REPLACE FUNCTION public._au_outs(_ob bigint, _rule uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
 select coalesce(jsonb_object_agg(z.k, z.v), '{}'::jsonb) from (
  select 'out_'||s.step||'_status' k, to_jsonb(case s.kind
     when 'mt_request' then (select m.status from mt_requests m where m.id=s.ref_id)
     when 'hr_letter' then (select l.status from hr_letters l where l.id=s.ref_id)
     when 'task' then (select case when count(*)=0 then 'none' when bool_and(t.status in ('done','cancelled')) then 'done'
                                   when bool_or(t.status='returned') then 'returned' when bool_or(t.status='awaiting_confirmation') then 'awaiting_confirmation'
                                   when bool_or(t.status='in_progress') then 'in_progress' else 'new' end
                       from adm_tasks t where t.auto_rule_id=_rule and t.client_id in (select (e)::uuid from jsonb_array_elements_text(coalesce(s.data->'clients','[]')) e))
     when 'report' then 'ready' end) v
   from au_step_out s where s.outbox_id=_ob and s.rule_id=_rule and s.step ~ '^[a-z0-9]+$'
  union all
  select 'out_'||s.step||'_ref', to_jsonb(case s.kind when 'mt_request' then (select m.ref from mt_requests m where m.id=s.ref_id)
                                                   when 'hr_letter' then coalesce((select l.ref_no from hr_letters l where l.id=s.ref_id), 'قيد الطلب') end)
   from au_step_out s where s.outbox_id=_ob and s.rule_id=_rule and s.step ~ '^[a-z0-9]+$' and s.kind in ('mt_request','hr_letter')
  union all
  select 'out_'||s.step||'_count', s.data->'count' from au_step_out s where s.outbox_id=_ob and s.rule_id=_rule and s.step ~ '^[a-z0-9]+$' and s.data ? 'count'
  union all
  select 'out_'||s.step||'_id', to_jsonb(s.ref_id) from au_step_out s where s.outbox_id=_ob and s.rule_id=_rule and s.step ~ '^[a-z0-9]+$' and s.ref_id is not null
 ) z where z.v is not null and z.v <> 'null'::jsonb
$$;

-- ===== 4. grouped (batch) context =====
CREATE OR REPLACE FUNCTION public._au_batch_ctx(_ev text, _org uuid, _school uuid, d jsonb)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare x record; n int := 0; seen int := 0; got int; tot numeric := 0; lst text[] := '{}'; aft uuid; sumf text := d->'batch'->>'sum';
begin
 loop
  got := 0;
  for x in select * from _au_srcp(_ev, _org, array[_school], 1000, null,
             coalesce(nullif(d->'params','null'::jsonb),'{}'::jsonb) || case when aft is null then '{}'::jsonb else jsonb_build_object('_after', aft) end) loop
    got := got + 1; seen := seen + 1; aft := x.entity;
    if _au_eval(d->'when', x.ctx) then
      n := n + 1;
      if sumf is not null and jsonb_typeof(x.ctx->sumf) = 'number' then tot := tot + (x.ctx->>sumf)::numeric; end if;
      if n <= 20 then lst := lst || coalesce(x.ctx->>'student_name', x.ctx->>'name', x.ctx->>'title', x.ctx->>'employee_name', x.ctx->>'label', '—'); end if;
    end if;
  end loop;
  exit when got < 1000 or seen >= 50000;
 end loop;
 return jsonb_build_object('school', _school, 'school_name', (select name from schools where id=_school), 'batch_count', n, 'batch_total', tot,
   'batch_list', array_to_string(lst, '، ') || case when n > 20 then ' …' else '' end, 'label', 'مجموعة من '||n||' سجل');
end $function$;

-- ===== 5. actions =====
CREATE OR REPLACE FUNCTION public._au_act_mt(j au_jobs, o au_outbox, ru au_rules, ev au_events, ctx jsonb, st jsonb, p text, boss uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare k text := coalesce(st->>'key', p); rid uuid; cat mt_categories; v_yr int; v_n int; v_ref text; ex uuid[]; r mt_requests; u uuid; ck text := md5(j.idem_key||p);
begin
 if exists (select 1 from au_step_out where outbox_id=o.id and rule_id=ru.id and step=k) then return null; end if;
 if o.school_id is null then return 'no_school'; end if;
 if not _mt_ok(boss, o.school_id, 'school', 'request') then return 'approver_cannot_request'; end if;
 select x.id into rid from mt_requests x where x.requested_by=boss and x.client_key=ck;
 if rid is null then
   select * into cat from mt_categories c where c.id=_au_uuid(st->>'category') and c.kind='school' and c.parent_id is null and c.active and (c.org_id is null or c.org_id=o.org_id);
   if cat.id is null then return 'category_unavailable'; end if;
   v_yr := extract(year from now() at time zone 'Asia/Riyadh');
   insert into mt_counters as q (org_id,kind,yr,n) values (o.org_id,'school',v_yr,1) on conflict (org_id,kind,yr) do update set n=q.n+1 returning q.n into v_n;
   v_ref := 'MS-' || v_yr || '-' || lpad(v_n::text,4,'0');
   insert into mt_requests(org_id,school_id,kind,ref,title,description,priority,category_id,place,requested_by,client_key,status)
   values (o.org_id, o.school_id, 'school', v_ref, left(btrim(_au_render(st->>'title', ctx, o.event_code)),120),
           left(btrim(_au_render(st->>'description', ctx, o.event_code)) || E'\n' || 'أنشئ آليًا بموجب قاعدة «'||ru.name||'» (الإصدار '||j.version||').', 1000),
           coalesce(st->>'priority','normal'), cat.id, btrim(st->>'place'), boss, ck, 'new') returning id into rid;
   perform _mt_ev(rid,'create','public',null,null,jsonb_build_object('priority',coalesce(st->>'priority','normal'),'source','automation','rule',ru.id,'version',j.version));
   if st ? 'assign' then
     select g.user_id into u from _au_groups(st->'assign', o.org_id, o.school_id, ev, ctx, o.entity_id, o.id, ru.id) g
      where g.ok and g.user_id is not null and g.user_id in (select x from _mt_users(o.school_id,'school','execute') x) limit 1;
     if u is null then perform _au_skip(j, null, p, 'mt_request:assignee_not_executor'); end if;
   end if;
   if u is null then
     select array_agg(x) into ex from _mt_users(o.school_id,'school','execute') x where x <> boss;
     if coalesce(array_length(ex,1),0) = 1 then u := ex[1]; end if;
   end if;
   if u is not null then
     update mt_requests set status='assigned', assignee_id=u where id=rid returning * into r;
     perform _mt_ev(rid,'auto_assign','public',null,null,jsonb_build_object('assignee',u,'source','automation'));
     perform _mt_note(r, u, 'أُسند إليك طلب صيانة', 'assign:'||u);
   else
     update mt_requests set status='awaiting_assign' where id=rid returning * into r;
     perform _mt_notify_follow(r, 'طلب جديد بانتظار الإسناد', 'new');
   end if;
 end if;
 perform _au_out_put(o.id, ru.id, k, 'mt_request', rid, '{}');
 return null;
end $function$;

CREATE OR REPLACE FUNCTION public._au_act_letter(j au_jobs, o au_outbox, ru au_rules, ctx jsonb, st jsonb, p text, boss uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare k text := coalesce(st->>'key', p); emp uuid := _au_uuid(ctx->>'employee'); t hr_letter_templates; l hr_letters;
begin
 if exists (select 1 from au_step_out where outbox_id=o.id and rule_id=ru.id and step=k) then return null; end if;
 if emp is null or not exists (select 1 from hr_employees where id=emp and org_id=o.org_id and status <> 'ended') then return 'employee_unavailable'; end if;
 if not _perm_owner(boss, o.org_id) then return 'approver_not_system_manager'; end if;
 select * into t from hr_letter_templates where id=_au_uuid(st->>'template') and org_id=o.org_id and is_active;
 if t.id is null then return 'template_unavailable'; end if;
 insert into hr_letters(org_id,employee_id,template_id,template_version,purpose,addressee,requested_by,has_comp)
 values (o.org_id, emp, t.id, t.version, left(nullif(btrim(_au_render(st->>'purpose', ctx, o.event_code)),''),500), left(nullif(btrim(coalesce(st->>'addressee','')),''),300), boss, t.has_comp) returning * into l;
 perform _hr_log(o.org_id,'letter',l.id,'request',null,jsonb_build_object('template',t.name,'version',t.version,'source','automation','rule',ru.id,'rule_version',j.version),null);
 perform _hr_l_notify(l, case when t.needs_review then 'review' else 'issue' end, 'طلب خطاب جديد (آلي)', 'hr-l-new:'||l.id);
 perform _au_out_put(o.id, ru.id, k, 'hr_letter', l.id, '{}');
 return null;
end $function$;

CREATE OR REPLACE FUNCTION public._au_act_set(j au_jobs, o au_outbox, ru au_rules, st jsonb, p text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare f au_update_fields; v text := st->>'value'; hit uuid;
begin
 select * into f from au_update_fields where event_code=o.event_code and field=st->>'field';
 if f.field is null or not v = any(f.allowed) then return 'field_not_allowed'; end if;
 if f.target='adm_tasks' then
   update adm_tasks set priority=v where id=o.entity_id and school_id=o.school_id and status not in ('done','cancelled') and priority is distinct from v returning id into hit;
   if hit is not null then perform _adm_log(o.school_id,'task',hit,'update',jsonb_build_object('source','automation','field','priority','value',v,'rule',ru.id,'version',j.version)); end if;
 elsif f.target='mt_requests' then
   update mt_requests set priority=v, updated_at=now() where id=o.entity_id and org_id=o.org_id and status not in ('closed','cancelled') and priority is distinct from v returning id into hit;
   if hit is not null then perform _mt_ev(hit,'priority','public',null,null,jsonb_build_object('priority',v,'source','automation','rule',ru.id)); end if;
 else return 'field_not_allowed'; end if;
 return null;
end $function$;

CREATE OR REPLACE FUNCTION public._au_act_report(j au_jobs, o au_outbox, ru au_rules, ev au_events, ctx jsonb, st jsonb, p text, boss uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare k text := coalesce(st->>'key', p); src text := st->>'source'; sch uuid[]; rid uuid; cols jsonb; rws jsonb := '[]'::jsonb; summ jsonb; n int := 0; got int; aft uuid; x record;
  trunc boolean := false; d1 date; d2 date; g record; f text; flds text[]; seen int := 0; ttl text;
begin
 if exists (select 1 from au_step_out where outbox_id=o.id and rule_id=ru.id and step=k) then return null; end if;
 sch := case when o.school_id is not null then array[o.school_id] else ru.school_ids end;
 ttl := left(btrim(_au_render(st->>'title', ctx, o.event_code)), 120);
 if src = 'rep.attendance_week' then
   if o.school_id is null then return 'no_school'; end if;
   if not _au_ps_ok(o.school_id, boss, 'attendance') then return 'approver_cannot_read_source'; end if;
   d1 := school_today() - 7; d2 := school_today() - 1;
   cols := '[{"key":"date","label":"اليوم"},{"key":"present","label":"حاضر"},{"key":"late","label":"متأخر"},{"key":"absent","label":"غائب"},{"key":"excused","label":"بعذر"},{"key":"pending","label":"بانتظار المراجعة"},{"key":"total","label":"الإجمالي"}]';
   select coalesce(jsonb_agg(jsonb_build_object('date', dd::date, 'present', c.pr, 'late', c.lt, 'absent', c.ab, 'excused', c.ex, 'pending', c.pe, 'total', c.tt) order by dd), '[]')
     into rws from generate_series(d1, d2, interval '1 day') dd
     cross join lateral (select count(*) filter (where a.status='present') pr, count(*) filter (where a.status='late') lt,
            count(*) filter (where a.status in ('absent','in_school_absent')) ab, count(*) filter (where a.status='excused') ex,
            count(*) filter (where a.status='pending_review') pe, count(*) tt from attendance_days a where a.school_id=o.school_id and a.date=dd::date) c;
   n := jsonb_array_length(rws);
   select jsonb_build_object('days', n, 'present', sum((r->>'present')::int), 'late', sum((r->>'late')::int), 'absent', sum((r->>'absent')::int),
          'excused', sum((r->>'excused')::int), 'total', sum((r->>'total')::int),
          'absence_rate', case when sum((r->>'total')::int) > 0 then round(100.0 * sum((r->>'absent')::int) / sum((r->>'total')::int), 1) else 0 end)
     into summ from jsonb_array_elements(rws) r;
 else
   if not exists (select 1 from au_events e where e.code=src and e.status in ('wired','tested')) then return 'source_unavailable'; end if;
   if not _au_ds_ok(o.org_id, boss, src, sch, false) then return 'approver_cannot_read_source'; end if;
   flds := array(select jsonb_array_elements_text(st->'fields'));
   select jsonb_agg(jsonb_build_object('key', v.key, 'label', v.label) order by array_position(flds, v.key)) into cols
     from au_variables v where v.event_code=src and v.key = any(flds) and v.type <> 'uuid';
   if not ('school_name' = any(flds)) and exists (select 1 from au_variables where event_code=src and key='school_name') then
     cols := jsonb_build_array(jsonb_build_object('key','school_name','label','المدرسة')) || cols; flds := array['school_name'] || flds; end if;
   loop
     got := 0;
     for x in select * from _au_srcp(src, o.org_id, sch, 1000, null, case when aft is null then '{}'::jsonb else jsonb_build_object('_after', aft) end) loop
       got := got + 1; seen := seen + 1; aft := x.entity;
       if _au_eval(st->'filter', x.ctx) then
         n := n + 1;
         if n <= 5000 then rws := rws || jsonb_build_array((select jsonb_object_agg(ff, x.ctx->ff) from unnest(flds) ff)); else trunc := true; end if;
       end if;
     end loop;
     exit when got < 1000 or seen >= 50000;
   end loop;
   select jsonb_build_object('count', n) || coalesce(jsonb_object_agg('sum_'||v.key, (select coalesce(sum((r->>v.key)::numeric),0) from jsonb_array_elements(rws) r)), '{}'::jsonb)
     into summ from au_variables v where v.event_code=src and v.key = any(flds) and v.type in ('number');
 end if;
 insert into au_reports(org_id, school_id, rule_id, version, outbox_id, step, idem, title, source, columns, rows, summary, row_count, truncated, period_from, period_to)
 values (o.org_id, o.school_id, ru.id, j.version, o.id, k, md5(j.idem_key||p), ttl, src, coalesce(cols,'[]'), rws, coalesce(summ,'{}'), n, trunc, d1, d2)
 on conflict (idem) do nothing returning id into rid;
 if rid is null then select id into rid from au_reports where idem=md5(j.idem_key||p); end if;
 for g in select * from _au_groups(st->'share', o.org_id, o.school_id, ev, ctx, o.entity_id, o.id, ru.id) loop
   if g.user_id is null then perform _au_skip(j, null, p, g.reason); continue; end if;
   if not g.ok or g.code='guardian' then perform _au_skip(j, g.user_id, p, coalesce(g.reason,'not_allowed:guardian')); continue; end if;
   insert into au_report_access(report_id, user_id) values (rid, g.user_id) on conflict do nothing;
   if coalesce((st->>'notify')::boolean, false) then
     perform _notify(g.user_id, o.school_id, 'admin', 'تقرير جاهز', ttl, '/app/auto-reports/'||rid, 'au:rep:'||rid||':'||g.user_id);
   end if;
 end loop;
 perform _au_out_put(o.id, ru.id, k, 'report', rid, jsonb_build_object('count', n));
 return null;
end $function$;

REVOKE ALL ON FUNCTION public._au_out_put(bigint,uuid,text,text,uuid,jsonb), public._au_outs(bigint,uuid), public._au_batch_ctx(text,uuid,uuid,jsonb),
  public._au_act_mt(au_jobs,au_outbox,au_rules,au_events,jsonb,jsonb,text,uuid), public._au_act_letter(au_jobs,au_outbox,au_rules,jsonb,jsonb,text,uuid),
  public._au_act_set(au_jobs,au_outbox,au_rules,jsonb,text), public._au_act_report(au_jobs,au_outbox,au_rules,au_events,jsonb,jsonb,text,uuid) FROM PUBLIC, anon, authenticated;

-- ===== 6. validation =====
CREATE OR REPLACE FUNCTION public._au_dyn_var(_k text)
 RETURNS text LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
 select case
  when _k ~ '^out_[a-z0-9]+_(status|ref|count|id)$'
       and position(','||substring(_k from '^out_([a-z0-9]+)_')||',' in coalesce(current_setting('au.keys', true),'')) > 0
    then case substring(_k from '_(status|ref|count|id)$') when 'count' then 'number' when 'id' then 'uuid' else 'text' end
  when _k in ('batch_count','batch_total') and coalesce(current_setting('au.batch', true),'0')='1' then 'number'
  when _k = 'batch_list' and coalesce(current_setting('au.batch', true),'0')='1' then 'text'
 end
$$;

CREATE OR REPLACE FUNCTION public._au_check_cond(_event text, c jsonb, _depth integer DEFAULT 0)
 RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare k text; n int := 0; e jsonb; v au_variables; o au_operators; val jsonb; dyn text;
begin
  if _depth > 5 then raise exception 'condition nesting too deep'; end if;
  if c is null or jsonb_typeof(c) <> 'object' then raise exception 'invalid condition'; end if;
  if c ? 'all' or c ? 'any' then
    k := case when c ? 'all' then 'all' else 'any' end;
    if jsonb_typeof(c->k) <> 'array' or jsonb_array_length(c->k) = 0 then raise exception '% needs a list', k; end if;
    for e in select jsonb_array_elements(c->k) loop n := n + _au_check_cond(_event, e, _depth+1); end loop;
  elsif c ? 'not' then n := _au_check_cond(_event, c->'not', _depth+1);
  else
    dyn := _au_dyn_var(c->>'var');
    if dyn is not null then v.key := c->>'var'; v.type := dyn; v.options := null;
    else
      select * into v from au_variables where event_code=_event and key=c->>'var'; if v.key is null then raise exception 'unknown variable %', c->>'var'; end if;
    end if;
    select * into o from au_operators where code=c->>'op'; if o.code is null then raise exception 'unknown operator %', c->>'op'; end if;
    if dyn = 'uuid' and o.code not in ('empty','not_empty') then raise exception 'step id only supports empty/not empty'; end if;
    if dyn is null or dyn <> 'uuid' then if not v.type = any(o.types) then raise exception 'operator % not valid for %', o.code, v.type; end if; end if;
    val := c->'value';
    if o.arity='one' and (val is null or jsonb_typeof(val) = 'array') then raise exception 'one value required'; end if;
    if o.arity in ('two','list') and (jsonb_typeof(val) <> 'array' or (o.arity='two' and jsonb_array_length(val)<>2) or jsonb_array_length(val)=0) then raise exception 'list value required'; end if;
    for e in select x from jsonb_array_elements(case when jsonb_typeof(val)='array' then val when val is null then '[]' else jsonb_build_array(val) end) x loop
      if o.code='within_days' then if jsonb_typeof(e)<>'number' then raise exception 'days must be a number'; end if;
      elsif v.type in ('number','percent') and jsonb_typeof(e)<>'number' then raise exception 'number expected';
      elsif v.type='percent' and (e::numeric < 0 or e::numeric > 100) then raise exception 'percent 0..100';
      elsif v.type='bool' and jsonb_typeof(e)<>'boolean' then raise exception 'boolean expected';
      elsif v.type='date' and (jsonb_typeof(e)<>'string' or (e#>>'{}') !~ '^\d{4}-\d{2}-\d{2}$') then raise exception 'date YYYY-MM-DD expected';
      elsif v.type='uuid' and (jsonb_typeof(e)<>'string' or (e#>>'{}') !~* '^[0-9a-f-]{36}$') then raise exception 'uuid expected';
      elsif v.type in ('text','status') and jsonb_typeof(e)<>'string' then raise exception 'text expected';
      elsif v.type='status' and v.options is not null and not (e#>>'{}') = any(v.options) then raise exception 'unknown status value %', e#>>'{}';
      end if;
    end loop;
    n := 1;
  end if;
  if _depth = 0 and n > 20 then raise exception 'too many conditions (max 20)'; end if;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public._au_check_tpl(_event text, _txt text, _family boolean)
 RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare k text; stripped text; dyn text; begin
 if _txt is null then return; end if;
 stripped := regexp_replace(_txt, '\{\{\s*[a-z0-9_]+\s*\}\}', '', 'g');
 if stripped ~ '[{}<>]' then raise exception 'message may not contain code or markup'; end if;
 for k in select distinct m[1] from regexp_matches(_txt, '\{\{\s*([a-z0-9_]+)\s*\}\}', 'g') m loop
   dyn := _au_dyn_var(k);
   if dyn is not null then
     if dyn = 'uuid' then raise exception 'variable % not allowed', k; end if;
     if _family then raise exception 'variables are not allowed in family messages'; end if;
     continue;
   end if;
   if not exists (select 1 from au_variables v where v.event_code=_event and v.key=k and v.type <> 'uuid') then raise exception 'variable % not allowed', k; end if;
   if _family and not exists (select 1 from au_variables v where v.event_code=_event and v.key=k and 'family' = any(v.flags)) then raise exception 'variables are not allowed in family messages'; end if;
 end loop; end $function$;

CREATE OR REPLACE FUNCTION public._au_render(_tpl text, _ctx jsonb, _event text)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare out text := _tpl; k text; begin
 if _tpl is null then return null; end if;
 for k in select distinct m[1] from regexp_matches(_tpl, '\{\{\s*([a-z0-9_]+)\s*\}\}', 'g') m loop
   if k ~ '^(out_[a-z0-9]+_(status|ref|count)|batch_(count|total|list))$'
      or exists (select 1 from au_variables v where v.event_code=_event and v.key=k and v.type <> 'uuid') then
     out := regexp_replace(out, '\{\{\s*'||k||'\s*\}\}', replace(coalesce(_ctx->>k, '—'), '\', '\\'), 'g');
   end if;
 end loop;
 return out; end $function$;

CREATE OR REPLACE FUNCTION public._au_check_steps(_ev au_events, _steps jsonb, _depth integer)
 RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare st jsonb; n int := 0; r text; b jsonb; t text; fam boolean; begin
 if _depth > 3 then raise exception 'steps nesting too deep'; end if;
 if jsonb_typeof(_steps) <> 'array' or jsonb_array_length(_steps) = 0 then raise exception 'steps required'; end if;
 for st in select jsonb_array_elements(_steps) loop
  t := st->>'type'; n := n + 1;
  if st ? 'key' and coalesce(length(st->>'key'),0) not between 1 and 40 then raise exception 'step name 1..40'; end if;
  if not exists (select 1 from au_actions where code = case t when 'notify' then 'notify_internal' when 'task' then 'create_followup_task' when 'if' then 'recheck' when 'review' then 'request_review'
        when 'mt_request' then 'create_mt_request' when 'hr_letter' then 'hr_letter_request' when 'set' then 'update_field' else t end and readiness='ready' and enabled)
    then raise exception 'step % not available', t; end if;
  if t in ('notify','reminder') then
    if st ? 'groups' then perform _au_check_groups(_ev, st->'groups', false);
     elsif jsonb_typeof(st->'recipients') <> 'array' or jsonb_array_length(st->'recipients') not between 1 and 6 then raise exception 'recipients required'; end if;
    for r in select jsonb_array_elements_text(st->'recipients') loop
      if not (r = any(_ev.recipients) or r in ('owner','principal','staff')) or not exists (select 1 from au_recipients where code=r and available) then raise exception 'recipient % not allowed', r; end if;
      if r = any(_ev.covered) then raise exception 'recipient % already notified by an existing service for this event', r; end if;
      if r = 'guardian' and (not 'guardian' = any(_ev.recipients) or _ev.sensitivity = 'restricted') then raise exception 'guardian not allowed for this event'; end if;
      if r <> 'owner' and _ev.area='central' then raise exception 'central events notify the owner only'; end if;
    end loop;
    if st ? 'users' and (jsonb_typeof(st->'users') <> 'array' or jsonb_array_length(st->'users') > 10) then raise exception 'users list invalid'; end if;
    if coalesce(length(st->>'title'),0) not between 2 and 120 then raise exception 'title 2..120'; end if;
    if coalesce(length(st->>'body'),0) > 500 then raise exception 'body up to 500'; end if;
    fam := coalesce(st->'recipients' ? 'guardian', false) or jsonb_path_exists(coalesce(st->'groups','[]'::jsonb), 'strict $.** ? (@.code == "guardian")');
    perform _au_check_tpl(_ev.code, st->>'title', fam); perform _au_check_tpl(_ev.code, st->>'body', fam);
  elsif t='escalate' then
    if st ? 'groups' then perform _au_check_groups(_ev, st->'groups', true); elsif coalesce(st->>'to','') not in ('principal','owner') or (_ev.area='central' and st->>'to'<>'owner') then raise exception 'escalate to principal/owner'; end if;
    if coalesce(length(st->>'title'),0) not between 2 and 120 then raise exception 'title 2..120'; end if;
    if coalesce(length(st->>'body'),0) > 500 then raise exception 'body up to 500'; end if;
    perform _au_check_tpl(_ev.code, st->>'title', false); perform _au_check_tpl(_ev.code, st->>'body', false);
  elsif t in ('task','review') then
    if _ev.area='central' then raise exception 'tasks need a school event'; end if;
    r := case when t='task' then st->>'assignee' else st->>'to' end;
    if st ? 'groups' then perform _au_check_groups(_ev, st->'groups', true); elsif r is null or r='guardian' or not (r = any(_ev.recipients) or r in ('principal','owner')) or not exists (select 1 from au_recipients where code=r and available) then raise exception 'assignee % not allowed', r; end if;
    if coalesce(length(st->>'title'),0) not between 2 and 120 then raise exception 'title 2..120'; end if;
    perform _au_check_tpl(_ev.code, st->>'title', false);
    if coalesce((st->>'due_in_days')::int, case when t='review' then 3 else 0 end) not between 1 and 30 then raise exception 'due_in_days 1..30'; end if;
    if t='review' and coalesce(length(btrim(st->>'reason')),0) not between 3 and 300 then raise exception 'review reason 3..300'; end if;
  elsif t='mt_request' then
    if _ev.area='central' then raise exception 'maintenance requests need a school event'; end if;
    if coalesce(st->>'kind','school') <> 'school' then raise exception 'only school maintenance requests are supported'; end if;
    if coalesce(length(btrim(st->>'title')),0) not between 3 and 120 then raise exception 'request title 3..120'; end if;
    if coalesce(length(btrim(st->>'description')),0) not between 5 and 500 then raise exception 'request description 5..500'; end if;
    if coalesce(length(btrim(st->>'place')),0) not between 2 and 120 then raise exception 'request place required'; end if;
    if coalesce(st->>'priority','normal') not in ('low','normal','high','urgent') then raise exception 'priority invalid'; end if;
    if not exists (select 1 from mt_categories c where c.id=_au_uuid(st->>'category') and c.kind='school' and c.parent_id is null and c.active and not coalesce(c.is_other,false)) then raise exception 'choose a maintenance category'; end if;
    perform _au_check_tpl(_ev.code, st->>'title', false); perform _au_check_tpl(_ev.code, st->>'description', false);
    if st ? 'assign' then perform _au_check_groups(_ev, st->'assign', true); end if;
    if st ? 'on_fail' then n := n + _au_check_steps(_ev, st->'on_fail', _depth+1); end if;
  elsif t='hr_letter' then
    if not exists (select 1 from au_variables v where v.event_code=_ev.code and v.key='employee') then raise exception 'this event has no employee for a letter'; end if;
    if not exists (select 1 from hr_letter_templates where id=_au_uuid(st->>'template') and is_active) then raise exception 'choose an active letter template'; end if;
    if coalesce(length(btrim(st->>'purpose')),0) not between 3 and 300 then raise exception 'letter purpose 3..300'; end if;
    if coalesce(length(st->>'addressee'),0) > 200 then raise exception 'addressee up to 200'; end if;
    perform _au_check_tpl(_ev.code, st->>'purpose', false);
    if st ? 'on_fail' then n := n + _au_check_steps(_ev, st->'on_fail', _depth+1); end if;
  elsif t='report' then
    if coalesce(length(btrim(st->>'title')),0) not between 3 and 120 then raise exception 'report title 3..120'; end if;
    perform _au_check_tpl(_ev.code, st->>'title', false);
    if st->>'source' = 'rep.attendance_week' then
      if _ev.area='central' then raise exception 'attendance report needs a school event'; end if;
    else
      if not exists (select 1 from au_events e where e.code=st->>'source' and e.code like 'ds.%' and e.status in ('wired','tested')) then raise exception 'report source not available'; end if;
      if jsonb_typeof(st->'fields') <> 'array' or jsonb_array_length(st->'fields') not between 1 and 12
         or exists (select 1 from jsonb_array_elements_text(st->'fields') f where not exists (select 1 from au_variables v where v.event_code=st->>'source' and v.key=f and v.type <> 'uuid'))
        then raise exception 'report fields: 1..12 registered fields'; end if;
      if st ? 'filter' then perform _au_check_cond(st->>'source', st->'filter'); end if;
    end if;
    if not st ? 'share' then raise exception 'choose who may open the report'; end if;
    perform _au_check_groups(_ev, st->'share', true);
    if st ? 'on_fail' then n := n + _au_check_steps(_ev, st->'on_fail', _depth+1); end if;
  elsif t='set' then
    if not exists (select 1 from au_update_fields f where f.event_code=_ev.code and f.field=st->>'field' and (st->>'value') = any(f.allowed)) then raise exception 'field/value not allowed for this event'; end if;
    if st ? 'on_fail' then n := n + _au_check_steps(_ev, st->'on_fail', _depth+1); end if;
  elsif t='wait_until' then
    perform _au_check_cond(_ev.code, st->'when');
    if coalesce((st->>'every_minutes')::int, 60) not between 15 and 1440 then raise exception 'check every 15..1440 minutes'; end if;
    if coalesce((st->>'max_minutes')::int, 10080) not between 60 and 43200 or coalesce((st->>'max_minutes')::int, 10080) < coalesce((st->>'every_minutes')::int, 60) then raise exception 'maximum wait 60..43200 minutes'; end if;
    if st ? 'timeout' then n := n + _au_check_steps(_ev, st->'timeout', _depth+1); end if;
  elsif t='wait' then
    if st ? 'until_var' then
      if not exists (select 1 from au_variables v where v.event_code=_ev.code and v.key=st->>'until_var' and v.type='date') then raise exception 'wait until: choose a date field'; end if;
      if coalesce((st->>'offset_days')::int, 0) not between -90 and 90 then raise exception 'offset -90..90 days'; end if;
    elsif coalesce((st->>'minutes')::int,0) not between 5 and 43200 then raise exception 'wait 5..43200 minutes'; end if;
  elsif t='if' then perform _au_check_cond(_ev.code, st->'when'); n := n + _au_check_steps(_ev, st->'then', _depth+1);
    if st ? 'else' then n := n + _au_check_steps(_ev, st->'else', _depth+1); end if;
  elsif t='parallel' then
    if jsonb_typeof(st->'branches') <> 'array' or jsonb_array_length(st->'branches') not between 2 and 3 then raise exception 'parallel needs 2..3 branches'; end if;
    for b in select jsonb_array_elements(st->'branches') loop n := n + _au_check_steps(_ev, b, _depth+1); end loop;
  elsif t='stop' then null;
  else raise exception 'unknown step %', t; end if;
 end loop;
 if _depth = 0 and n > 15 then raise exception 'too many steps (max 15)'; end if;
 return n;
end $function$;

CREATE OR REPLACE FUNCTION public._au_check_def(_event text, d jsonb)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare ev au_events; steps jsonb; sch jsonb; w jsonb; st text; prm jsonb; md text := coalesce(d->>'mode','each'); bt jsonb; begin
 if jsonb_typeof(d) <> 'object' then raise exception 'invalid definition'; end if;
 select * into ev from au_events where code=_event;
 if ev.code is null then raise exception 'unknown event'; end if;
 if ev.status not in ('wired','tested') then raise exception 'event not ready for execution (%)', ev.status; end if;
 if d ? 'action' and d->>'action' <> 'notify_internal' and not (d ? 'steps') then raise exception 'action not ready'; end if;
 if md not in ('each','batch') then raise exception 'mode each/batch'; end if;
 if md='batch' then
   if _event not like 'ds.%' then raise exception 'grouped mode needs a data source'; end if;
   if d->'batch' ? 'sum' and not exists (select 1 from au_variables v where v.event_code=_event and v.key=d->'batch'->>'sum' and v.type='number') then raise exception 'grouped total needs a number field'; end if;
   bt := case when d->'batch' ? 'sum' then jsonb_build_object('sum', d->'batch'->>'sum') else '{}'::jsonb end;
 end if;
 prm := _au_check_params(_event, d->'params');
 steps := coalesce(d->'steps', jsonb_build_array(jsonb_build_object('type','notify','recipients',d->'recipients','title',d->>'title')));
 perform set_config('au.batch', case when md='batch' then '1' else '0' end, true);
 perform set_config('au.keys', ','||coalesce((select string_agg(k #>> '{}', ',') from jsonb_path_query(steps, 'strict $.**.key') k where jsonb_typeof(k)='string'),'')||',', true);
 perform _au_check_steps(ev, steps, 0);
 sch := coalesce(d->'schedule', jsonb_build_object('type', case when ev.source_kind='trigger' then 'event' else 'condition' end));
 st := sch->>'type';
 if not exists (select 1 from au_trigger_types where code=st and available) then raise exception 'schedule % not available', st; end if;
 if (ev.source_kind='trigger') <> (st='event') then raise exception 'schedule % does not fit this event', st; end if;
 if st in ('daily','weekly','monthly') and coalesce(sch->>'at','07:00') !~ '^([01]\d|2[0-3]):[0-5]\d$' then raise exception 'at HH:MM'; end if;
 if st='weekly' and coalesce((sch->>'dow')::int,-1) not between 0 and 6 then raise exception 'dow 0..6'; end if;
 if st='monthly' and coalesce((sch->>'day')::int,0) not between 1 and 28 then raise exception 'day 1..28'; end if;
 if st='at' and (coalesce(sch->>'ts','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' or (sch->>'ts')::timestamp <= (now() at time zone 'Asia/Riyadh')) then raise exception 'at needs a future Riyadh time'; end if;
 w := nullif(d->'when','null'::jsonb);
 if coalesce((d->>'grace_days')::int,0) not between 0 and 30 then raise exception 'grace_days 0..30'; end if;
 if coalesce((d->>'grace_days')::int,0) > 0 and _event='adm.task.overdue' then
   w := jsonb_build_object('all', jsonb_build_array(jsonb_build_object('var','days_overdue','op','gt','value',(d->>'grace_days')::int)) || case when w is null then '[]' else jsonb_build_array(w) end); end if;
 perform set_config('au.batch', '0', true);
 if w is not null then perform _au_check_cond(_event, w); end if;
 if coalesce((d->>'priority')::int,5) not between 1 and 9 then raise exception 'priority 1..9'; end if;
 return jsonb_build_object('schedule', sch || jsonb_build_object('quiet', coalesce((sch->>'quiet')::boolean, true), 'workdays_only', coalesce((sch->>'workdays_only')::boolean, false)),
   'steps', steps, 'title', coalesce(d->>'title', steps->0->>'title'), 'recipients', coalesce(d->'recipients', steps->0->'recipients'), 'grace_days', coalesce((d->>'grace_days')::int,0), 'priority', coalesce((d->>'priority')::int,5))
   || case when w is null then '{}'::jsonb else jsonb_build_object('when', w) end
   || case when prm is null then '{}'::jsonb else jsonb_build_object('params', prm) end
   || case when md='batch' then jsonb_build_object('mode','batch','batch',bt) else '{}'::jsonb end;
end $function$;

CREATE OR REPLACE FUNCTION public._au_def(d jsonb)
 RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
 select jsonb_build_object('schedule', coalesce(d->'schedule','{"type":"condition","quiet":false}'::jsonb),
   'steps', coalesce(d->'steps', jsonb_build_array(jsonb_build_object('type','notify','recipients',d->'recipients','title',d->>'title'))),
   'when', case when coalesce((d->>'grace_days')::int,0) > 0 and not (d ? 'steps') then jsonb_build_object('all', jsonb_build_array(jsonb_build_object('var','days_overdue','op','gt','value',(d->>'grace_days')::int)) || case when d->'when' is null or d->'when'='null' then '[]' else jsonb_build_array(d->'when') end) else d->'when' end,
   'params', d->'params', 'mode', coalesce(d->>'mode','each'), 'batch', coalesce(d->'batch','{}'::jsonb)) $function$;

CREATE OR REPLACE FUNCTION public._au_risk(_event text, _def jsonb, _schools uuid[])
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
 with e as (select e.sensitivity, e.section, coalesce(s.parent,'') parent from au_events e left join au_sections s on s.key=e.section where e.code=_event),
 rc as (select coalesce(array(select _au_def_rcpts(_def)),'{}') a),
 st as (select coalesce(array(select s->>'type' from jsonb_path_query(coalesce(_def->'steps','[]'::jsonb),'lax $.** ? (@.type != null)') s),'{}') a)
 select case
  when coalesce((select sensitivity='restricted' or parent in ('finance','hr') or section in ('finance','hr') from e), false) then 'high'
  when (select 'hr_letter' = any(a) from st) then 'high'
  when (select 'guardian' = any(a) from rc) and (_schools is null or cardinality(_schools) > 1) then 'high'
  when coalesce((select sensitivity='sensitive' from e), false) or (select a && array['task','escalate','review','mt_request','set','report'] from st)
       or (select 'guardian' = any(a) from rc) or _schools is null or cardinality(_schools) > 1 then 'medium'
  else 'low' end
$function$;

-- ===== 7. execution =====
CREATE OR REPLACE FUNCTION public._au_exec(j au_jobs)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare o au_outbox; ru au_rules; ev au_events; d jsonb; ctx jsonb; sett au_settings; loc timestamp := now() at time zone 'Asia/Riyadh'; nxt timestamp;
begin
 select * into o from au_outbox where id=j.outbox_id; select * into ru from au_rules where id=j.rule_id; select * into ev from au_events where code=o.event_code;
 select * into sett from au_settings where org_id=j.org_id;
 if (select kill_switch from au_platform) or coalesce(sett.kill_switch,false) or ru.id is null or not ru.active or ru.approved_version is distinct from j.version then return 'cancelled:rule inactive/changed or killed'; end if;
 if not _au_version_ok(ru, j.version) then return 'cancelled:approval authority lost'; end if;
 if ev.status not in ('wired','tested') then return 'cancelled:event not ready'; end if;
 if o.school_id is not null and not exists (select 1 from schools where id=o.school_id and org_id=j.org_id and is_active) then return 'cancelled:school out of scope'; end if;
 d := _au_def((select definition from au_rule_versions where rule_id=j.rule_id and version=j.version));
 if o.payload ? '_batch' then
   -- grouped item: re-count the matching records live; nothing left = goal reached
   ctx := _au_batch_ctx(o.event_code, o.org_id, o.school_id, d);
   if coalesce((ctx->>'batch_count')::int,0) = 0 then return 'cancelled:goal reached (no matching records)'; end if;
 else
   select x.ctx into ctx from _au_srcp(o.event_code, o.org_id, null, 50, o.entity_id, d->'params') x
     where x.school is not distinct from o.school_id and split_part(x.period,'@',1) = split_part(o.payload->>'_period','@',1) limit 1;
   if ctx is null then return 'cancelled:condition no longer true'; end if;
   if (j.path='0' or left(j.path,1)='c') and not _au_eval(d->'when', ctx) then return 'cancelled:rule condition false'; end if;
 end if;
 if coalesce((d->'schedule'->>'quiet')::boolean, true) and sett.quiet_start is not null and sett.quiet_end is not null
    and (case when sett.quiet_start <= sett.quiet_end then loc::time >= sett.quiet_start and loc::time < sett.quiet_end else loc::time >= sett.quiet_start or loc::time < sett.quiet_end end) then
   nxt := loc::date + sett.quiet_end; if nxt <= loc then nxt := nxt + interval '1 day'; end if;
   update au_jobs set next_at = nxt at time zone 'Asia/Riyadh' where id=j.id; return 'deferred';
 end if;
 if coalesce((d->'schedule'->>'workdays_only')::boolean, false) and (not extract(dow from loc)::int = any(coalesce(sett.workdays,'{0,1,2,3,4}'))
    or exists (select 1 from hr_att_holidays h where h.org_id=j.org_id and h.date=loc::date and (h.school_id is null or h.school_id=o.school_id))) then
   update au_jobs set next_at = ((loc::date + 1) + time '07:00') at time zone 'Asia/Riyadh' where id=j.id; return 'deferred';
 end if;
 perform set_config('au.depth', (o.depth + 1)::text, true);
 perform _au_steps(j, o, ru, ev, ctx, coalesce(j.steps, d->'steps'), j.path, sett);
 perform set_config('au.depth', '0', true);
 return 'done';
end $function$;

CREATE OR REPLACE FUNCTION public._au_steps(j au_jobs, o au_outbox, ru au_rules, ev au_events, ctx jsonb, _steps jsonb, _path text, sett au_settings)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare st jsonb; i int := 0; p text; t text; u uuid; c text; codes text[]; tid uuid; rest jsonb; b jsonb; bi int; users uuid[]; boss uuid; ok boolean;
  res text; dl timestamptz; at timestamptz; cnt int; pp text;
begin
 boss := coalesce((select approved_by from au_rule_versions where rule_id=ru.id and version=j.version), ru.created_by);
 for st in select e from jsonb_array_elements(_steps) e loop
  p := _path||'.'||i; t := st->>'type';
  ctx := ctx || _au_outs(o.id, ru.id);
  if st ? 'groups' and not st ? '_to' and t in ('notify','reminder','escalate') then
    perform _au_notify_groups(j,o,ru,ev,ctx,st,p,sett); perform _au_tr(j, p, t, 'done'); i := i + 1; continue;
  end if;
  if st ? 'groups' and t in ('task','review') then
    if (ctx->>'auto_rule') is not null then perform _au_skip(j,null,p,'loop_guard:automated_source'); perform _au_tr(j, p, t, 'skipped');
    else
      perform _au_task_groups(j,o,ru,ev,ctx,st,p,boss); perform _au_tr(j, p, t, 'done');
      if st ? 'key' then
        perform _au_out_put(o.id, ru.id, st->>'key', 'task', null, jsonb_build_object('clients',
          (select coalesce(jsonb_agg(md5(j.idem_key||p||sp.user_id::text)),'[]'::jsonb) from au_step_people sp where sp.outbox_id=o.id and sp.rule_id=ru.id and sp.step=st->>'key')));
      end if;
    end if;
    i := i + 1; continue;
  end if;
  if t in ('notify','reminder','escalate') then
    if st ? '_to' then perform _au_deliver(j,o,ru,ev,ctx,st,p,st->>'_code',(st->>'_to')::uuid,sett);
    else
      codes := case when t='escalate' then array[st->>'to'] else array(select jsonb_array_elements_text(st->'recipients')) end;
      users := array(select (x)::uuid from jsonb_array_elements_text(coalesce(st->'users','[]')) x);
      for c, u in select distinct on (r) cc, r from unnest(codes) cc, lateral _au_rcpt(cc, o.org_id, o.school_id, ev.section, ctx, users) r where r is not null order by r, (cc='guardian') loop
        perform _au_deliver(j,o,ru,ev,ctx,st,p,c,u,sett);
      end loop;
    end if;
    perform _au_tr(j, p, t, 'done');
  elsif t in ('task','review') then
    if (ctx->>'auto_rule') is not null then perform _au_skip(j,null,p,'loop_guard:automated_source'); perform _au_tr(j, p, t, 'skipped');
    else
      c := case when t='task' then st->>'assignee' else st->>'to' end;
      select r into u from _au_rcpt(c, o.org_id, o.school_id, ev.section, ctx, null) r where c <> 'guardian' and _au_rcpt_allowed(c, o.org_id, o.school_id, r, ev, ctx) limit 1;
      if u is null or o.school_id is null then perform _au_skip(j,null,p,t||':no_authorized_assignee'); perform _au_tr(j, p, t, 'skipped');
      else
        insert into adm_tasks(school_id,title,description,assignee,assigner,start_date,due_date,priority,status,needs_confirmation,client_id,auto_rule_id)
          values (o.school_id,
                  case when t='review' then 'طلب مراجعة: ' else '' end || _au_render(st->>'title', ctx, o.event_code),
                  case when t='review' then 'أنشأه النظام آليًا بموجب قاعدة الأتمتة «'||ru.name||'» (الإصدار '||j.version||').'||E'\n'||'السبب: '||coalesce(nullif(btrim(st->>'reason'),''),'—')
                       ||E'\n'||'المرجع: '||coalesce(ctx->>'label','')||' '||coalesce(ctx->>'link','')
                       else coalesce(ctx->>'label','')||E'\n'||'أنشئت آليًا بموجب قاعدة «'||ru.name||'».' end,
                  u, boss, school_today(), school_today() + coalesce((st->>'due_in_days')::int, 3),
                  case when t='review' then 'high' else 'normal' end, 'new', t='review', md5(j.idem_key||p)::uuid, ru.id)
          on conflict (assigner, client_id) where client_id is not null do nothing returning id into tid;
        if tid is not null then
          perform _adm_log(o.school_id, 'task', tid, 'create', jsonb_build_object('source','automation','kind',t,'rule',ru.id,'version',j.version));
          perform _notify(u, o.school_id, 'admin', case when t='review' then 'طلب مراجعة من النظام' else 'تكليف جديد' end, _au_render(st->>'title', ctx, o.event_code), '/app/admin/tasks/'||tid, 'au:'||t||':'||tid);
        end if;
        if st ? 'key' then perform _au_out_put(o.id, ru.id, st->>'key', 'task', null, jsonb_build_object('clients', jsonb_build_array(md5(j.idem_key||p)))); end if;
        perform _au_tr(j, p, t, 'done');
      end if;
    end if;
  elsif t in ('mt_request','hr_letter','report','set') then
    res := case t when 'mt_request' then _au_act_mt(j,o,ru,ev,ctx,st,p,boss)
                  when 'hr_letter' then _au_act_letter(j,o,ru,ctx,st,p,boss)
                  when 'report' then _au_act_report(j,o,ru,ev,ctx,st,p,boss)
                  else _au_act_set(j,o,ru,st,p) end;
    if res is null then perform _au_tr(j, p, t, 'done');
    else
      perform _au_skip(j, null, p, t||':'||res); perform _au_tr(j, p, t, 'failed');
      if st ? 'on_fail' then if not _au_steps(j, o, ru, ev, ctx, st->'on_fail', p||'x', sett) then return false; end if; end if;
    end if;
  elsif t='wait_until' then
    if _au_eval(st->'when', ctx) then perform _au_tr(j, p, t, 'met');
    else
      dl := coalesce((st->>'_deadline')::timestamptz, now() + make_interval(mins => coalesce((st->>'max_minutes')::int, 10080)));
      if now() >= dl then
        perform _au_tr(j, p, t, 'timeout');
        if st ? 'timeout' then if not _au_steps(j, o, ru, ev, ctx, st->'timeout', p||'o', sett) then return false; end if; end if;
      else
        rest := (select coalesce(jsonb_agg(e order by n), '[]') from jsonb_array_elements(_steps) with ordinality q(e,n) where n-1 > i);
        cnt := coalesce((st->>'_n')::int, 0) + 1; pp := coalesce(st->>'_p', p);
        insert into au_jobs(org_id,rule_id,version,outbox_id,action,idem_key,steps,path,next_at)
          values (j.org_id, j.rule_id, j.version, j.outbox_id, 'workflow', split_part(j.idem_key,'|u',1)||'|u'||md5(pp)||':'||cnt,
                  jsonb_build_array(st || jsonb_build_object('_deadline', dl, '_n', cnt, '_p', pp)) || rest, pp||'u',
                  least(dl, now() + make_interval(mins => coalesce((st->>'every_minutes')::int, 60))))
          on conflict (idem_key) do nothing;
        perform _au_tr(j, p, t, 'waiting');
        return false;
      end if;
    end if;
  elsif t='wait' then
    rest := (select coalesce(jsonb_agg(e order by n), '[]') from jsonb_array_elements(_steps) with ordinality q(e,n) where n-1 > i);
    if st ? 'until_var' then
      at := (((ctx->>(st->>'until_var'))::date + coalesce((st->>'offset_days')::int,0)) + time '07:00') at time zone 'Asia/Riyadh';
    else at := now() + make_interval(mins => (st->>'minutes')::int); end if;
    if at is null or at <= now() then perform _au_tr(j, p, t, 'passed');
    else
      if jsonb_array_length(rest) > 0 then
        insert into au_jobs(org_id,rule_id,version,outbox_id,action,idem_key,steps,path,next_at)
          values (j.org_id,j.rule_id,j.version,j.outbox_id,'workflow',j.idem_key||'|w'||p, rest, p||'w', at) on conflict (idem_key) do nothing;
      end if;
      perform _au_tr(j, p, t, 'waiting');
      return false;
    end if;
  elsif t='if' then
    ok := _au_eval(st->'when', ctx);
    perform _au_tr(j, p, t, case when ok then 'then' else 'else' end);
    if not _au_steps(j, o, ru, ev, ctx, case when ok then st->'then' else coalesce(st->'else','[]') end, p||(case when ok then 't' else 'f' end), sett) then return false; end if;
  elsif t='parallel' then
    perform _au_tr(j, p, t, 'done');
    bi := 0; for b in select jsonb_array_elements(st->'branches') loop perform _au_steps(j, o, ru, ev, ctx, b, p||'b'||bi, sett); bi := bi + 1; end loop;
  elsif t='stop' then perform _au_tr(j, p, t, 'stopped'); return false;
  end if;
  i := i + 1;
 end loop;
 return true;
end $function$;

-- ===== 8. scanner: grouped mode =====
CREATE OR REPLACE FUNCTION public.automation_tick(_budget_ms integer DEFAULT 3000)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare t0 timestamptz := clock_timestamp(); ev int := 0; ok int := 0; bad int := 0; cn int := 0; df int := 0; sc int := 0; r record; v au_rule_versions; o au_outbox; j au_jobs;
  run bigint; res text; ids bigint[]; lat bigint[] := '{}'; dd jsonb; x record; bs int; n int; mx uuid; sch uuid[]; sr record; bx jsonb; per text;
begin
 if not pg_try_advisory_xact_lock(hashtext('automation_tick')) then return jsonb_build_object('skipped','locked'); end if;
 if (select kill_switch from au_platform) then insert into au_runs(ms,skipped) values (0,'platform_kill'); return jsonb_build_object('skipped','platform_kill'); end if;
 if not exists (select 1 from au_rules where active and next_run_at is not null and next_run_at <= now())
    and not exists (select 1 from au_outbox where status='pending')
    and not exists (select 1 from au_jobs where status='queued' and next_at <= now()) then
   return jsonb_build_object('skipped','idle'); end if;
 for r in select ru.* from au_rules ru join au_events e on e.code=ru.event_code left join au_settings s on s.org_id=ru.org_id
          where ru.active and ru.approved_version is not null and e.source_kind='scan' and e.status in ('wired','tested') and not coalesce(s.kill_switch,false)
            and ru.next_run_at is not null and ru.next_run_at <= now() order by ru.next_run_at limit 200 loop
   begin
   select * into v from au_rule_versions where rule_id=r.id and version=r.approved_version; dd := _au_def(v.definition);
   sch := (select array_agg(e::uuid) from jsonb_array_elements_text(nullif(v.definition->'schools','null')) e);
   if r.event_code like 'ds.%' and dd->>'mode' = 'batch' then
     per := to_char(now() at time zone 'Asia/Riyadh', 'YYYY-MM-DD HH24');
     for sr in select s2.id from schools s2 where s2.org_id=r.org_id and s2.is_active and (coalesce(sch, r.school_ids) is null or s2.id = any(coalesce(sch, r.school_ids))) loop
       bx := _au_batch_ctx(r.event_code, r.org_id, sr.id, dd);
       if coalesce((bx->>'batch_count')::int,0) > 0 then
         insert into au_outbox(org_id,school_id,event_code,entity_id,payload,dedupe_key,rule_id)
           values (r.org_id, sr.id, r.event_code, sr.id, bx || jsonb_build_object('_batch', true, '_period', per), r.id||':batch:'||sr.id||':'||per, r.id)
           on conflict (dedupe_key) do nothing;
       end if;
     end loop;
     update au_rules set scan_cursor=null, last_run_at=now(), next_run_at=_au_next_run(dd->'schedule', now()) where id=r.id;
   elsif r.event_code like 'ds.%' then
     bs := coalesce((select batch from au_sources where event_code=r.event_code),1000); n := 0; mx := null;
     for x in select * from _au_srcp(r.event_code, r.org_id, coalesce(sch, r.school_ids), bs, null,
                coalesce(nullif(dd->'params','null'::jsonb),'{}'::jsonb) || case when r.scan_cursor is null then '{}'::jsonb else jsonb_build_object('_after', r.scan_cursor) end) loop
       n := n + 1; mx := x.entity;
       if _au_eval(dd->'when', x.ctx) then
         insert into au_outbox(org_id,school_id,event_code,entity_id,payload,dedupe_key,rule_id)
           values (r.org_id, x.school, r.event_code, x.entity, x.ctx || jsonb_build_object('_period',x.period), r.id||':'||r.event_code||':'||x.entity||':'||coalesce(x.school::text,'')||':'||x.period, r.id)
           on conflict (dedupe_key) do nothing;
       end if;
     end loop;
     if n >= bs then update au_rules set scan_cursor=mx, last_run_at=now() where id=r.id;
     else update au_rules set scan_cursor=null, last_run_at=now(), next_run_at=_au_next_run(dd->'schedule', now()) where id=r.id; end if;
   else
     insert into au_outbox(org_id,school_id,event_code,entity_id,payload,dedupe_key,rule_id)
       select r.org_id, x2.school, r.event_code, x2.entity, x2.ctx || jsonb_build_object('_period',x2.period), r.id||':'||r.event_code||':'||x2.entity||':'||coalesce(x2.school::text,'')||':'||x2.period, r.id
       from _au_src(r.event_code, r.org_id, sch, 5000, null) x2
       where _au_eval(dd->'when', x2.ctx)
       on conflict (dedupe_key) do nothing;
     update au_rules set last_run_at=now(), next_run_at=_au_next_run(dd->'schedule', now()) where id=r.id;
   end if;
   exception when others then
     insert into au_audit(org_id,rule_id,actor,action,details) values (r.org_id, r.id, null,
       case when sqlerrm like 'finance balance check failed%' then 'fin_mismatch' else 'scan_error' end,
       jsonb_build_object('event', r.event_code, 'error', left(sqlerrm,300)));
     update au_rules set next_run_at = now() + interval '15 minutes' where id=r.id;
   end;
   sc := sc + 1;
   exit when clock_timestamp()-t0 > make_interval(secs=>_budget_ms/3000.0);
 end loop;
 ids := array(select z.id from (select q.id, row_number() over (partition by q.org_id order by q.id) rn from au_outbox q where q.status='pending') z where z.rn <= 200 order by z.rn, z.id limit 1000);
 for o in select * from au_outbox where id = any(ids) and status='pending' order by id for update skip locked loop
   ev := ev + 1;
   for r in select ru.*, rv.definition from au_rules ru join au_rule_versions rv on rv.rule_id=ru.id and rv.version=ru.approved_version left join au_settings s on s.org_id=ru.org_id
            where ru.org_id=o.org_id and ru.event_code=o.event_code and ru.active and not coalesce(s.kill_switch,false) and (o.rule_id is null or ru.id=o.rule_id)
              and (ru.school_ids is null or o.school_id = any(ru.school_ids)) order by ru.priority, ru.created_at loop
     dd := _au_def(r.definition);
     if (o.payload ? '_batch') or _au_eval(dd->'when', o.payload) then
       insert into au_jobs(org_id,rule_id,version,outbox_id,action,idem_key,steps,path) values (o.org_id,r.id,r.approved_version,o.id,'workflow',
         case when o.rule_id is null then r.id||':'||o.dedupe_key else o.dedupe_key end, dd->'steps','0') on conflict (idem_key) do nothing;
     end if;
   end loop;
   update au_outbox set status='done', processed_at=now() where id=o.id;
   exit when clock_timestamp()-t0 > make_interval(secs=>_budget_ms/1500.0);
 end loop;
 ids := array(select id from (select q.id, row_number() over (partition by q.org_id order by q.id) rn, coalesce(s.per_org_batch,100) lim
          from au_jobs q left join au_settings s on s.org_id=q.org_id where q.status='queued' and q.next_at <= now()) z where rn <= lim order by rn, id limit 1000);
 for j in select * from au_jobs where id = any(ids) and status='queued' order by id for update skip locked loop
   exit when clock_timestamp()-t0 > make_interval(secs=>_budget_ms/1000.0);
   begin
     res := _au_exec(j);
     if res='done' then update au_jobs set status='done', attempts=attempts+1, done_at=now() where id=j.id; ok := ok + 1;
       lat := lat || (extract(epoch from (clock_timestamp() - greatest(j.created_at, j.next_at)))*1000)::bigint;
     elsif res='deferred' then df := df + 1;
     else update au_jobs set status='cancelled', done_at=now(), last_error=substr(res,11) where id=j.id; cn := cn + 1; end if;
   exception when others then
     bad := bad + 1; perform set_config('au.depth','0',true);
     update au_jobs set attempts=attempts+1, last_error=left(sqlerrm,300), status=case when attempts+1>=5 then 'dead' else 'queued' end,
       next_at=now()+make_interval(mins=>power(2,attempts+1)::int) where id=j.id;
   end;
 end loop;
 insert into au_runs(ms,events,jobs_done,jobs_failed,scanned,cancelled,deferred,lat_avg_ms,lat_max_ms)
   values (extract(milliseconds from clock_timestamp()-t0)::int, ev, ok, bad, sc, cn, df, (select avg(x3)::int from unnest(lat) x3), (select max(x3)::int from unnest(lat) x3)) returning id into run;
 return jsonb_build_object('run',run,'events',ev,'done',ok,'failed',bad,'scanned',sc,'cancelled',cn,'deferred',df);
end $function$;

-- ===== 9. report access RPCs =====
CREATE OR REPLACE FUNCTION public._au_rep_ok(_r au_reports)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select auth.uid() is not null and (_au_full(_r.org_id) or (exists (select 1 from au_report_access a where a.report_id=_r.id and a.user_id=auth.uid())
   and exists (select 1 from memberships m where m.user_id=auth.uid() and m.org_id=_r.org_id and m.is_active and not coalesce(m.branch_suspended,false)))) $$;
REVOKE ALL ON FUNCTION public._au_rep_ok(au_reports) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.au_reports_list(_org uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ begin
 if auth.uid() is null then raise exception 'سجّل الدخول أولًا' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'school',(select name from schools where id=r.school_id),'created_at',r.created_at,
     'rows',r.row_count,'source',r.source,'rule',(select name from au_rules where id=r.rule_id)) order by r.created_at desc)
   from (select * from au_reports x where x.org_id=_org and _au_rep_ok(x) order by x.created_at desc limit 200) r), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.au_report_get(_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$ declare r au_reports; begin
 select * into r from au_reports where id=_id;
 if r.id is null or not _au_rep_ok(r) then raise exception 'لا تملك صلاحية فتح هذا التقرير' using errcode='42501'; end if;
 return jsonb_build_object('id',r.id,'title',r.title,'school',(select name from schools where id=r.school_id),'created_at',r.created_at,'source',r.source,
   'columns',r.columns,'rows',r.rows,'summary',r.summary,'row_count',r.row_count,'truncated',r.truncated,'period_from',r.period_from,'period_to',r.period_to,
   'rule',(select name from au_rules where id=r.rule_id));
end $function$;
REVOKE ALL ON FUNCTION public.au_reports_list(uuid), public.au_report_get(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.au_reports_list(uuid), public.au_report_get(uuid) TO authenticated;