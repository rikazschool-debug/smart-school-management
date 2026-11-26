-- ===== Automation phase E + C/D gap closure (test only) =====
create table if not exists public.au_channels (code text primary key, label text not null, readiness text not null check (readiness in ('ready','simulation','not_ready')), service text, note text);
grant select on public.au_channels to authenticated; grant all on public.au_channels to service_role;
alter table public.au_channels enable row level security;
create policy "channels readable" on public.au_channels for select to authenticated using (true);
insert into public.au_channels values
 ('internal','إشعار داخلي في ركاز','ready','_notify (notifications)', null),
 ('whatsapp','واتساب عبر WATI','simulation','خدمة WATI القائمة (قوالب v3 المعتمدة)', 'الإرسال الحقيقي معطّل حتى الموافقة الصريحة؛ تُسجّل الرسائل كمحاكاة'),
 ('email','البريد الإلكتروني','not_ready', null, 'لا توجد خدمة بريد مفعّلة في المنصة')
on conflict (code) do update set label=excluded.label, readiness=excluded.readiness, service=excluded.service, note=excluded.note;

alter table public.au_platform add column if not exists wa_live boolean not null default false;
alter table public.au_settings add column if not exists claim_gap_days int not null default 3;
alter table public.au_settings add column if not exists consent_mode text not null default 'registered_phone';
alter table public.au_settings drop constraint if exists au_settings_consent_mode_chk;
alter table public.au_settings add constraint au_settings_consent_mode_chk check (consent_mode in ('registered_phone','explicit'));

insert into public.au_trigger_types(code,label,available) values ('on_change','فور تغيّر السجلات (خلال دقيقة)',true) on conflict (code) do nothing;

insert into public.au_actions(code,label,enabled,side_effects,service,required,optional,risk,needs_human,retry,dedupe,readiness,note) values
 ('create_document','إنشاء مستند من قالب',true,'au_reports (مستند) + ملف PDF محفوظ','قالب نصي ضمن إصدار القاعدة المعتمد؛ الخطابات الرسمية عبر طلب خطاب الموارد البشرية فقط','{title,body,share}','{key,on_fail}','medium',false,null,'md5(job+step)','ready','لا يُصدر خطابًا رسميًا؛ الخطاب الرسمي يمر بالاعتماد البشري')
on conflict (code) do update set enabled=true, readiness='ready', note=excluded.note, service=excluded.service;
update public.au_actions set enabled=true, readiness='ready', service='au_msgs → WATI v3 messageTemplates/send (الخدمة القائمة)', dedupe='claim: قاعدة+سجل+مستلم (مستقل عن القناة والقالب)',
  note='قناة ضمن خطوة الإشعار؛ محاكاة فقط حتى الموافقة الصريحة على الإرسال الحقيقي', required='{template}' where code='whatsapp';
update public.au_actions set note='غير جاهز: لا توجد خدمة بريد مفعّلة' where code='email';

create table if not exists public.au_wa_templates (
  name text primary key, category text, language text, status text, body text, header jsonb, buttons jsonb,
  params text[] not null default '{}', usable boolean not null default false, reason text, synced_at timestamptz not null default now());
grant all on public.au_wa_templates to service_role;
alter table public.au_wa_templates enable row level security;

create table if not exists public.au_contact_prefs (
  org_id uuid not null references public.organizations(id) on delete cascade, user_id uuid not null, channel text not null references public.au_channels(code),
  allowed boolean not null, reason text, set_by uuid, set_at timestamptz not null default now(), primary key (org_id, user_id, channel));
grant all on public.au_contact_prefs to service_role;
alter table public.au_contact_prefs enable row level security;

create table if not exists public.au_msgs (
  id bigserial primary key, org_id uuid not null, school_id uuid, rule_id uuid, version int, job_id bigint, outbox_id bigint, step text,
  channel text not null references public.au_channels(code), user_id uuid not null, recipient_code text, template text, params jsonb not null default '{}',
  preview text, claim_key text not null unique, status text not null check (status in ('simulated','queued','sending','accepted','delivered','read','failed','unknown','cancelled')),
  detail text, attempts int not null default 0, provider_ref text, client_ref uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), sent_at timestamptz);
create index if not exists au_msgs_org_idx on public.au_msgs(org_id, created_at desc);
create index if not exists au_msgs_queue_idx on public.au_msgs(status) where status in ('queued','sending');
grant all on public.au_msgs to service_role; grant usage on sequence public.au_msgs_id_seq to service_role;
alter table public.au_msgs enable row level security;

create table if not exists public.au_files (
  id uuid primary key default gen_random_uuid(), report_id uuid not null references public.au_reports(id) on delete cascade,
  format text not null check (format in ('pdf','xlsx')), status text not null default 'pending' check (status in ('pending','rendering','ready','failed')),
  path text, bytes int, error text, attempts int not null default 0, created_at timestamptz not null default now(), claimed_at timestamptz, rendered_at timestamptz,
  unique (report_id, format));
grant select on public.au_files to authenticated; grant all on public.au_files to service_role;
alter table public.au_files enable row level security;
create policy "files of readable reports" on public.au_files for select to authenticated using (exists (select 1 from public.au_reports r where r.id = report_id));

create table if not exists public.au_source_tables (event_code text not null, table_name text not null, primary key (event_code, table_name));
grant select on public.au_source_tables to authenticated; grant all on public.au_source_tables to service_role;
alter table public.au_source_tables enable row level security;
create policy "source tables readable" on public.au_source_tables for select to authenticated using (true);
create table if not exists public.au_nudges (id bigserial primary key, event_code text not null, at timestamptz not null default now());
grant all on public.au_nudges to service_role; grant usage on sequence public.au_nudges_id_seq to service_role;
alter table public.au_nudges enable row level security;
insert into public.au_source_tables values
 ('ds.student_accounts','sf_obligations'),('ds.student_accounts','sf_receipts'),('ds.maintenance','mt_requests'),('ds.admin_tasks','adm_tasks'),
 ('ds.student_absence','attendance_days'),('ds.org_docs','org_docs'),('ds.api.buses','mt_buses'),('ds.api.admissions','ad_applications'),
 ('ds.api.admin_requests','adm_requests'),('ds.api.support_tickets','support_tickets'),('ds.api.hr_leaves','hr_leave_requests'),
 ('ds.api.circulars','circulars'),('ds.api.custodies','pc_custodies')
on conflict do nothing;

create or replace function public._au_nudge_trg() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists (select 1 from au_rules r join au_rule_versions v on v.rule_id=r.id and v.version=r.approved_version
              where r.active and r.event_code = any(TG_ARGV) and v.definition->'schedule'->>'type' = 'on_change') then
    insert into au_nudges(event_code) select x from unnest(TG_ARGV) x
      join au_rules r on r.event_code = x and r.active join au_rule_versions v on v.rule_id=r.id and v.version=r.approved_version and v.definition->'schedule'->>'type'='on_change' group by x;
  end if;
  return null;
exception when others then return null;
end $$;
revoke all on function public._au_nudge_trg() from public, anon, authenticated;

do $$ declare r record; begin
  for r in select t.table_name, array_agg(t.event_code order by t.event_code) evs from public.au_source_tables t
           where exists (select 1 from information_schema.tables x where x.table_schema='public' and x.table_name=t.table_name) group by t.table_name loop
    execute format('drop trigger if exists au_nudge on public.%I', r.table_name);
    execute format('create trigger au_nudge after insert or update on public.%I for each statement execute function public._au_nudge_trg(%s)',
                   r.table_name, (select string_agg(quote_literal(e), ',') from unnest(r.evs) e));
  end loop;
end $$;

create or replace function public._au_nudge_apply() returns void language plpgsql security definer set search_path=public as $$
begin
  with nd as (delete from au_nudges returning event_code)
  update au_rules ru set next_run_at = now()
    from (select distinct event_code from nd) e
   where ru.event_code = e.event_code and ru.active and (ru.next_run_at is null or ru.next_run_at > now())
     and exists (select 1 from au_rule_versions v where v.rule_id=ru.id and v.version=ru.approved_version and v.definition->'schedule'->>'type'='on_change');
end $$;
revoke all on function public._au_nudge_apply() from public, anon, authenticated;

create or replace function public._au_norm_phone(_p text) returns text language sql immutable set search_path=public as $$
  select case when x ~ '^9665\d{8}$' then x when x ~ '^05\d{8}$' then '966'||substr(x,2) when x ~ '^5\d{8}$' then '966'||x when x ~ '^009665\d{8}$' then substr(x,3) else null end
  from (select regexp_replace(coalesce(_p,''), '\D', '', 'g') x) q $$;
create or replace function public._au_phone(_org uuid, _u uuid) returns text language sql stable security definer set search_path=public as $$
  select ph from (
    select _au_norm_phone(g.phone) ph, 1 o from guardians g join schools s on s.id=g.school_id where g.user_id=_u and s.org_id=_org
    union all select _au_norm_phone(e.phone), 2 from hr_employees e where e.user_id=_u and e.org_id=_org
    union all select _au_norm_phone(p.phone), 3 from profiles p where p.id=_u) q
  where ph is not null order by o limit 1 $$;
revoke all on function public._au_norm_phone(text) from public, anon, authenticated;
revoke all on function public._au_phone(uuid, uuid) from public, anon, authenticated;

create or replace function public._au_consent_ok(_org uuid, _u uuid, _ch text, _mode text) returns boolean language sql stable security definer set search_path=public as $$
  select not exists (select 1 from au_contact_prefs p where p.org_id=_org and p.user_id=_u and p.channel=_ch and not p.allowed)
     and (coalesce(_mode,'registered_phone') <> 'explicit' or exists (select 1 from au_contact_prefs p where p.org_id=_org and p.user_id=_u and p.channel=_ch and p.allowed)) $$;
revoke all on function public._au_consent_ok(uuid, uuid, text, text) from public, anon, authenticated;

create or replace function public._au_covered(_ev text, _ctx jsonb, _u uuid, _gap int) returns text language sql stable security definer set search_path=public as $$
  select case when _ev = 'ds.student_accounts' and _au_uuid(_ctx->>'student') is not null and exists (
     select 1 from notifications nt where nt.user_id=_u and nt.created_at > now() - make_interval(days => greatest(coalesce(_gap,3),0))
       and split_part(nt.dedupe_key,':',1) in ('sf_late','sf_soon')
       and _au_uuid(split_part(nt.dedupe_key,':',2)) in (select b.id from sf_obligations b where b.student_id=_au_uuid(_ctx->>'student')))
   then 'sf_due' end $$;
revoke all on function public._au_covered(text, jsonb, uuid, int) from public, anon, authenticated;

create or replace function public._au_wa_fill(_body text, _prm jsonb) returns text language plpgsql immutable set search_path=public as $$
declare out text := coalesce(_body,''); k text; begin
  for k in select jsonb_object_keys(coalesce(_prm,'{}'::jsonb)) loop out := replace(out, '{{'||k||'}}', coalesce(_prm->>k,'')); end loop; return out; end $$;

create or replace function public._au_wa_preview(s jsonb, fctx jsonb, _event text) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare tp au_wa_templates; prm jsonb := '{}'; miss text[] := '{}'; k text; v text; begin
  if fctx is null or not coalesce(s->'channels','[]'::jsonb) ? 'whatsapp' then return '{}'::jsonb; end if;
  select * into tp from au_wa_templates where name = s->'wa'->>'template';
  if tp.name is null then return jsonb_build_object('wa_template', s->'wa'->>'template', 'wa_error', 'template_unavailable'); end if;
  foreach k in array tp.params loop
    v := btrim(_au_render(s->'wa'->'params'->>k, fctx, _event));
    if v is null or v = '' or v = '—' or position('{{' in v) > 0 then miss := miss || k; end if;
    prm := prm || jsonb_build_object(k, coalesce(v,''));
  end loop;
  return jsonb_build_object('wa_template', tp.name, 'wa_text', _au_wa_fill(tp.body, prm), 'wa_params', prm, 'wa_missing', to_jsonb(miss));
end $$;
revoke all on function public._au_wa_preview(jsonb, jsonb, text) from public, anon;

create or replace function public._au_check_channels(_ev au_events, st jsonb, fam boolean) returns void language plpgsql stable security definer set search_path=public as $$
declare ch jsonb := coalesce(st->'channels','["internal"]'::jsonb); c text; tp au_wa_templates; k text; v text; begin
  if jsonb_typeof(ch) <> 'array' or jsonb_array_length(ch) not between 1 and 3 then raise exception 'choose 1..3 channels'; end if;
  if (select count(*) from jsonb_array_elements_text(ch)) <> (select count(distinct x) from jsonb_array_elements_text(ch) x) then raise exception 'duplicate channel'; end if;
  for c in select jsonb_array_elements_text(ch) loop
    if not exists (select 1 from au_channels where code=c) then raise exception 'unknown channel %', c; end if;
    if (select readiness from au_channels where code=c) = 'not_ready' then raise exception 'channel % is not ready', c; end if;
  end loop;
  if ch ? 'whatsapp' then
    if _ev.sensitivity = 'restricted' then raise exception 'WhatsApp is not allowed for restricted events'; end if;
    select * into tp from au_wa_templates where name = st->'wa'->>'template';
    if tp.name is null or not tp.usable then raise exception 'choose an approved WhatsApp template'; end if;
    if jsonb_typeof(coalesce(st->'wa'->'params','{}'::jsonb)) <> 'object' then raise exception 'template variables invalid'; end if;
    if coalesce((select array_agg(x order by x) from jsonb_object_keys(coalesce(st->'wa'->'params','{}'::jsonb)) x), '{}') is distinct from coalesce((select array_agg(x order by x) from unnest(tp.params) x), '{}') then
      raise exception 'map every template variable (%)', array_to_string(tp.params, ', '); end if;
    for k in select jsonb_object_keys(coalesce(st->'wa'->'params','{}'::jsonb)) loop
      v := st->'wa'->'params'->>k;
      if coalesce(length(btrim(v)),0) not between 1 and 200 then raise exception 'template variable % needs a value', k; end if;
      perform _au_check_tpl(_ev.code, v, fam);
    end loop;
  elsif st ? 'wa' then raise exception 'template set without the WhatsApp channel';
  end if;
end $$;
revoke all on function public._au_check_channels(au_events, jsonb, boolean) from public, anon;

create or replace function public._au_wa_enqueue(j au_jobs, o au_outbox, ru au_rules, ctx jsonb, st jsonb, p text, c text, u uuid, _key text, sett au_settings) returns void
language plpgsql security definer set search_path=public as $$
declare tp au_wa_templates; prm jsonb := '{}'; k text; v text; live boolean := coalesce((select wa_live from au_platform limit 1), false); begin
  if exists (select 1 from au_msgs where claim_key=_key) then return; end if;
  select * into tp from au_wa_templates where name = st->'wa'->>'template';
  if tp.name is null or not tp.usable then perform _au_skip(j,u,p,'wa:template_unavailable'); return; end if;
  if _au_phone(o.org_id, u) is null then perform _au_skip(j,u,p,'wa:no_registered_phone'); return; end if;
  if not _au_consent_ok(o.org_id, u, 'whatsapp', sett.consent_mode) then perform _au_skip(j,u,p,'wa:no_consent'); return; end if;
  foreach k in array tp.params loop
    v := btrim(_au_render(st->'wa'->'params'->>k, ctx, o.event_code));
    if v is null or v = '' or v = '—' or position('{{' in v) > 0 then perform _au_skip(j,u,p,'wa:missing_value:'||k); return; end if;
    prm := prm || jsonb_build_object(k, left(v, 300));
  end loop;
  insert into au_msgs(org_id,school_id,rule_id,version,job_id,outbox_id,step,channel,user_id,recipient_code,template,params,preview,claim_key,status,detail)
  values (o.org_id, o.school_id, ru.id, j.version, j.id, o.id, coalesce(st->>'key', p), 'whatsapp', u, c, tp.name, prm, left(_au_wa_fill(tp.body, prm), 1500), _key,
          case when live then 'queued' else 'simulated' end, case when live then null else 'محاكاة: الإرسال الخارجي معطّل' end)
  on conflict (claim_key) do nothing;
end $$;
revoke all on function public._au_wa_enqueue(au_jobs, au_outbox, au_rules, jsonb, jsonb, text, text, uuid, text, au_settings) from public, anon, authenticated;

create or replace function public._au_deliver(j au_jobs, o au_outbox, ru au_rules, ev au_events, ctx jsonb, st jsonb, p text, c text, u uuid, sett au_settings)
 returns void language plpgsql security definer set search_path to 'public' as $function$
declare t text := st->>'type'; dk text := coalesce(st->>'_k', 'au:'||j.idem_key||':'||p||':'||u); n int; cap int; d int := coalesce((st->>'_defer')::int,0);
  ck text; loc timestamp := now() at time zone 'Asia/Riyadh'; fam boolean := (c='guardian'); ins int; holder uuid; ttl text; bdy text;
  ch jsonb := coalesce(st->'channels','["internal"]'::jsonb); w_in boolean; w_wa boolean; cov text;
begin
 w_in := ch ? 'internal'; w_wa := ch ? 'whatsapp' and t in ('notify','reminder');
 if not _au_rcpt_allowed(c, o.org_id, o.school_id, u, ev, ctx) then perform _au_skip(j,u,p,'not_allowed:'||c); return; end if;
 if (not w_in or exists (select 1 from notifications nt where nt.user_id=u and nt.dedupe_key=dk))
    and (not w_wa or exists (select 1 from au_msgs m where m.claim_key=dk||':wa')) then return; end if;
 cov := _au_covered(o.event_code, ctx, u, sett.claim_gap_days);
 if cov is not null then perform _au_skip(j,u,p,'covered_by_existing:'||cov); return; end if;
 if coalesce(sett.merge_rules,true) and t <> 'escalate' then
   ck := o.event_code||':'||o.entity_id||':'||coalesce(o.school_id::text,'')||':'||coalesce(o.payload->>'_period','')||':'||u;
   insert into au_sent as s(k,rule_id,org_id) values (ck, ru.id, o.org_id) on conflict on constraint au_sent_pkey do nothing; get diagnostics ins = row_count;
   if ins = 0 then
     select s2.rule_id into holder from au_sent s2 where s2.k=ck for update;
     if holder is distinct from ru.id then
       if exists (select 1 from au_rules r2 where r2.id=holder and r2.active) then perform _au_skip(j,u,p,'conflict:other_rule_first'); return; end if;
       update au_sent s3 set rule_id=ru.id, at=now() where s3.k=ck;
     end if;
   end if;
 end if;
 if t <> 'escalate' then
   cap := case when fam then coalesce(sett.family_max_day,3) else coalesce(sett.max_per_user_day,20) end;
   select r.n into n from au_rate r where r.user_id=u and r.day=school_today();
   if coalesce(n,0) >= cap then
     if d >= coalesce(sett.cap_defer_days,3) then perform _au_skip(j,u,p,'cap:cancelled_after_'||d||'_days'); return; end if;
     insert into au_jobs(org_id,rule_id,version,outbox_id,action,idem_key,steps,path,next_at)
       values (j.org_id,j.rule_id,j.version,j.outbox_id,'workflow', dk||'|cap'||(d+1),
               jsonb_build_array((st - 'recipients' - 'users') || jsonb_build_object('_to',u,'_code',c,'_k',dk,'_defer',d+1)), 'c'||p,
               ((loc::date + 1) + time '07:00') at time zone 'Asia/Riyadh')
       on conflict (idem_key) do nothing;
     perform _au_skip(j,u,p,'cap:deferred_next_day'); return;
   end if;
 end if;
 insert into au_rate as ar(user_id,day,n) values (u, school_today(), 1) on conflict (user_id,day) do update set n=ar.n+1;
 ttl := _au_render(st->>'title', ctx, o.event_code);
 bdy := case when nullif(btrim(st->>'body'),'') is null then ctx->>'label' else _au_render(st->>'body', ctx, o.event_code) end;
 if w_in and not exists (select 1 from notifications nt where nt.user_id=u and nt.dedupe_key=dk) then
   perform _notify(u, o.school_id, 'admin', case when t='escalate' then 'تصعيد: ' else '' end || ttl, bdy,
                   case when fam then coalesce(ctx->>'family_link','/app') else ctx->>'link' end, dk);
 end if;
 if w_wa then perform _au_wa_enqueue(j, o, ru, ctx, st, p, c, u, dk||':wa', sett); end if;
end $function$;

create or replace function public._au_act_doc(j au_jobs, o au_outbox, ru au_rules, ev au_events, ctx jsonb, st jsonb, p text, boss uuid) returns text
language plpgsql security definer set search_path=public as $$
declare k text := coalesce(st->>'key', p); rid uuid; g record; ttl text; body text; begin
  if exists (select 1 from au_step_out where outbox_id=o.id and rule_id=ru.id and step=k) then return null; end if;
  if o.event_code like 'ds.%' and not _au_ds_ok(o.org_id, boss, o.event_code, case when o.school_id is null then ru.school_ids else array[o.school_id] end, false) then return 'approver_cannot_read_source'; end if;
  ttl := left(btrim(_au_render(st->>'title', ctx, o.event_code)), 120);
  body := left(_au_render(st->>'body', ctx, o.event_code), 6000);
  insert into au_reports(org_id, school_id, rule_id, version, outbox_id, step, idem, title, source, columns, rows, summary, row_count, truncated)
  values (o.org_id, o.school_id, ru.id, j.version, o.id, k, md5(j.idem_key||p), ttl, o.event_code, '[]', '[]', jsonb_build_object('doc', true, 'body', body), 0, false)
  on conflict (idem) do nothing returning id into rid;
  if rid is null then select id into rid from au_reports where idem=md5(j.idem_key||p); end if;
  for g in select * from _au_groups(st->'share', o.org_id, o.school_id, ev, ctx, o.entity_id, o.id, ru.id) loop
    if g.user_id is null then perform _au_skip(j, null, p, g.reason); continue; end if;
    if not g.ok or g.code='guardian' then perform _au_skip(j, g.user_id, p, coalesce(g.reason,'not_allowed:guardian')); continue; end if;
    if not _au_rep_reader_ok(o.org_id, o.school_id, g.user_id, o.event_code) then perform _au_skip(j, g.user_id, p, 'not_allowed:report_source'); continue; end if;
    insert into au_report_access(report_id, user_id) values (rid, g.user_id) on conflict do nothing;
  end loop;
  perform _au_out_put(o.id, ru.id, k, 'doc', rid, '{}');
  return null;
end $$;
revoke all on function public._au_act_doc(au_jobs, au_outbox, au_rules, au_events, jsonb, jsonb, text, uuid) from public, anon, authenticated;

create or replace function public._au_files_trg() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into au_files(report_id, format) values (new.id, 'pdf') on conflict do nothing;
  if not coalesce((new.summary->>'doc')::boolean, false) then insert into au_files(report_id, format) values (new.id, 'xlsx') on conflict do nothing; end if;
  return new;
end $$;
drop trigger if exists au_files_queue on public.au_reports;
create trigger au_files_queue after insert on public.au_reports for each row execute function public._au_files_trg();

create or replace function public._au_files_claim(_limit int default 10) returns setof jsonb language plpgsql security definer set search_path=public as $$
declare f record; begin
  for f in select x.id from au_files x where (x.status='pending' or (x.status='rendering' and x.claimed_at < now() - interval '10 minutes')) and x.attempts < 3
           order by x.created_at limit least(greatest(coalesce(_limit,10),1),50) for update skip locked loop
    update au_files set status='rendering', claimed_at=now(), attempts=attempts+1 where id=f.id;
    return next (select jsonb_build_object('id', x.id, 'format', x.format, 'report', jsonb_build_object('id', r.id, 'org_id', r.org_id, 'school_id', r.school_id, 'title', r.title,
        'source', r.source, 'columns', r.columns, 'rows', r.rows, 'summary', r.summary, 'row_count', r.row_count, 'truncated', r.truncated, 'school_name', r.school_name,
        'rule_name', r.rule_name, 'created_at', r.created_at, 'period_from', r.period_from, 'period_to', r.period_to,
        'brand', (select name from schools where id=r.school_id)))
      from au_files x join au_reports r on r.id=x.report_id where x.id=f.id);
  end loop;
end $$;
create or replace function public._au_file_done(_id uuid, _ok boolean, _path text, _bytes int, _err text) returns void language plpgsql security definer set search_path=public as $$
declare r au_reports; u uuid; begin
  update au_files set status=case when _ok then 'ready' when attempts >= 3 then 'failed' else 'pending' end, path=case when _ok then _path end, bytes=_bytes,
         error=case when _ok then null else left(_err,300) end, rendered_at=case when _ok then now() end where id=_id and status='rendering';
  if _ok and not exists (select 1 from au_files f where f.report_id=(select report_id from au_files where id=_id) and f.status <> 'ready') then
    select * into r from au_reports where id=(select report_id from au_files where id=_id);
    for u in select user_id from au_report_access where report_id=r.id loop
      perform _notify(u, r.school_id, 'admin', 'ملف جاهز للتنزيل', r.title, '/app/auto-reports/'||r.id, 'au:file:'||r.id||':'||u);
    end loop;
  end if;
end $$;
revoke all on function public._au_files_claim(int) from public, anon, authenticated;
revoke all on function public._au_file_done(uuid, boolean, text, int, text) from public, anon, authenticated;
grant execute on function public._au_files_claim(int) to service_role;
grant execute on function public._au_file_done(uuid, boolean, text, int, text) to service_role;

create or replace function public.au_wa_can_sync(_org uuid) returns boolean language plpgsql stable security definer set search_path=public as $$
begin perform _au_need(_org,'au_manage','designer'); return true; end $$;
create or replace function public._au_wa_sync(_rows jsonb) returns int language plpgsql security definer set search_path=public as $$
declare n int; begin
  if jsonb_typeof(_rows) <> 'array' then raise exception 'rows array'; end if;
  insert into au_wa_templates as t(name, category, language, status, body, header, buttons, params, usable, reason, synced_at)
  select x->>'name', x->>'category', x->>'language', x->>'status', x->>'body', x->'header', x->'buttons',
         coalesce(array(select jsonb_array_elements_text(x->'params')), '{}'), coalesce((x->>'usable')::boolean,false), x->>'reason', now()
    from jsonb_array_elements(_rows) x where coalesce(x->>'name','') <> ''
  on conflict (name) do update set category=excluded.category, language=excluded.language, status=excluded.status, body=excluded.body, header=excluded.header,
     buttons=excluded.buttons, params=excluded.params, usable=excluded.usable, reason=excluded.reason, synced_at=now();
  get diagnostics n = row_count;
  update au_wa_templates set usable=false, reason='لم يعد موجودًا في الحساب المرتبط', synced_at=now()
   where name not in (select x->>'name' from jsonb_array_elements(_rows) x) and usable;
  return n;
end $$;
revoke all on function public._au_wa_sync(jsonb) from public, anon, authenticated;
grant execute on function public._au_wa_sync(jsonb) to service_role;

create or replace function public.au_wa_templates_list(_org uuid, _q text default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  perform _au_need(_org,'au_view','center');
  return jsonb_build_object('synced_at', (select max(synced_at) from au_wa_templates), 'items', coalesce((select jsonb_agg(jsonb_build_object('name',t.name,'category',t.category,'language',t.language,
     'body',t.body,'params',to_jsonb(t.params),'usable',t.usable,'reason',t.reason) order by t.usable desc, t.name) from au_wa_templates t
     where _q is null or t.name ilike '%'||_q||'%' or t.body ilike '%'||_q||'%'), '[]'::jsonb));
end $$;

create or replace function public.au_channels_info(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  perform _au_need(_org,'au_view','center');
  return jsonb_build_object('channels', (select jsonb_agg(to_jsonb(c) order by array_position(array['internal','whatsapp','email'], c.code)) from au_channels c),
    'wa_live', coalesce((select wa_live from au_platform limit 1), false),
    'templates', (select count(*) filter (where usable) from au_wa_templates), 'synced_at', (select max(synced_at) from au_wa_templates),
    'consent_mode', coalesce((select consent_mode from au_settings where org_id=_org),'registered_phone'),
    'claim_gap_days', coalesce((select claim_gap_days from au_settings where org_id=_org),3),
    'counts', (select coalesce(jsonb_object_agg(status, n),'{}') from (select status, count(*) n from au_msgs where org_id=_org group by status) q));
end $$;

create or replace function public.au_msgs_list(_org uuid, _status text default null, _limit int default 100) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare full_ boolean; begin
  perform _au_need(_org,'au_view','runs'); full_ := _au_full(_org);
  return coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'at',m.created_at,'channel',m.channel,'template',m.template,'status',m.status,'detail',m.detail,
     'recipient',coalesce(pf.full_name,'—'),'role',m.recipient_code,'school',sc.name,'rule',ru.name,'attempts',m.attempts,
     'preview', case when full_ then m.preview end) order by m.created_at desc)
    from (select * from au_msgs where org_id=_org and (_status is null or status=_status)
            and (full_ or rule_id in (select r.id from au_rules r where r.org_id=_org and _au_vis(r.id, auth.uid())))
          order by created_at desc limit least(greatest(coalesce(_limit,100),1),500)) m
    left join profiles pf on pf.id=m.user_id left join schools sc on sc.id=m.school_id left join au_rules ru on ru.id=m.rule_id), '[]'::jsonb);
end $$;

create or replace function public.au_contact_pref_set(_org uuid, _user uuid, _channel text, _allowed boolean, _reason text) returns void language plpgsql security definer set search_path=public as $$
begin
  if not is_org_owner(_org) then raise exception 'forbidden' using errcode='42501'; end if;
  if _channel not in (select code from au_channels where code <> 'internal') then raise exception 'channel'; end if;
  insert into au_contact_prefs(org_id,user_id,channel,allowed,reason,set_by) values (_org,_user,_channel,_allowed,left(_reason,200),auth.uid())
  on conflict (org_id,user_id,channel) do update set allowed=excluded.allowed, reason=excluded.reason, set_by=excluded.set_by, set_at=now();
  insert into au_audit(org_id,rule_id,actor,action,details) values (_org,null,auth.uid(),'contact_pref',jsonb_build_object('user',_user,'channel',_channel,'allowed',_allowed));
end $$;

create or replace function public.au_msg_resolve(_id bigint, _status text) returns void language plpgsql security definer set search_path=public as $$
declare m au_msgs; begin
  select * into m from au_msgs where id=_id; if m.id is null then raise exception 'not found'; end if;
  if not is_org_owner(m.org_id) then raise exception 'forbidden' using errcode='42501'; end if;
  if m.status <> 'unknown' or _status not in ('accepted','failed') then raise exception 'only an unconfirmed message can be settled after checking the provider'; end if;
  update au_msgs set status=_status, detail='حُسمت يدويًا بعد التحقق من المزود', updated_at=now() where id=_id;
  insert into au_audit(org_id,rule_id,actor,action,details) values (m.org_id,m.rule_id,auth.uid(),'msg_resolve',jsonb_build_object('msg',_id,'status',_status));
end $$;

create or replace function public._au_msgs_claim(_limit int default 20) returns table(id bigint, phone text, template text, params jsonb, client_ref uuid) language plpgsql security definer set search_path=public as $$
declare m record; ph text; begin
  if not coalesce((select wa_live from au_platform limit 1), false) then return; end if;
  for m in select x.* from au_msgs x where x.status='queued' and x.channel='whatsapp' order by x.id limit least(greatest(coalesce(_limit,20),1),50) for update skip locked loop
    ph := _au_phone(m.org_id, m.user_id);
    if ph is null or not _au_consent_ok(m.org_id, m.user_id, 'whatsapp', (select consent_mode from au_settings where org_id=m.org_id)) then
      update au_msgs set status='cancelled', detail='لا رقم مسجل أو لا موافقة لحظة الإرسال', updated_at=now() where au_msgs.id=m.id; continue; end if;
    update au_msgs set status='sending', attempts=attempts+1, updated_at=now() where au_msgs.id=m.id;
    id := m.id; phone := ph; template := m.template; params := m.params; client_ref := m.client_ref; return next;
  end loop;
end $$;
create or replace function public._au_msg_done(_id bigint, _status text, _provider text, _detail text) returns void language plpgsql security definer set search_path=public as $$
begin
  if _status not in ('accepted','failed','unknown') then raise exception 'status'; end if;
  update au_msgs set status=_status, provider_ref=_provider, detail=left(_detail,300), updated_at=now(), sent_at=case when _status='accepted' then now() end where id=_id and status='sending';
end $$;
create or replace function public._au_msg_status(_ref text, _status text) returns void language plpgsql security definer set search_path=public as $$
begin
  if _status not in ('delivered','read','failed') then return; end if;
  update au_msgs set status=_status, updated_at=now() where (client_ref::text=_ref or provider_ref=_ref) and status in ('accepted','delivered','unknown')
    and not (status='delivered' and _status='failed');
end $$;
revoke all on function public._au_msgs_claim(int) from public, anon, authenticated;
revoke all on function public._au_msg_done(bigint, text, text, text) from public, anon, authenticated;
revoke all on function public._au_msg_status(text, text) from public, anon, authenticated;
grant execute on function public._au_msgs_claim(int) to service_role;
grant execute on function public._au_msg_done(bigint, text, text, text) to service_role;
grant execute on function public._au_msg_status(text, text) to service_role;

create or replace function public._au_risk(_event text, _def jsonb, _schools uuid[]) returns text language sql stable security definer set search_path to 'public' as $function$
 with e as (select e.sensitivity, e.section, coalesce(s.parent,'') parent from au_events e left join au_sections s on s.key=e.section where e.code=_event),
 rc as (select coalesce(array(select _au_def_rcpts(_def)),'{}') a),
 st as (select coalesce(array(select s->>'type' from jsonb_path_query(coalesce(_def->'steps','[]'::jsonb),'lax $.** ? (@.type != null)') s),'{}') a),
 wa as (select jsonb_path_exists(coalesce(_def->'steps','[]'::jsonb), 'lax $.** ? (@.channels[*] == "whatsapp")') x)
 select case
  when coalesce((select sensitivity='restricted' or parent in ('finance','hr') or section in ('finance','hr') from e), false) then 'high'
  when (select x from wa) then 'high'
  when (select 'hr_letter' = any(a) from st) then 'high'
  when (select 'guardian' = any(a) from rc) and (_schools is null or cardinality(_schools) > 1) then 'high'
  when coalesce((select sensitivity='sensitive' from e), false) or (select a && array['task','escalate','review','mt_request','set','report'] from st)
       or (select 'guardian' = any(a) from rc) or _schools is null or cardinality(_schools) > 1 then 'medium'
  else 'low' end
$function$;

create or replace function public.au_simulate(_id uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare r au_rules; d jsonb; ev au_events; begin
 select * into r from au_rules where id=_id; if r.id is null then raise exception 'not found'; end if;
 perform _au_need_on(r.org_id,'au_manage','simulate',r.school_ids,r.event_code,r.draft); select * into ev from au_events where code=r.event_code;
 d := _au_def(r.draft);
 if coalesce(d->>'mode','each') = 'batch' or jsonb_path_exists(coalesce(d->'steps','[]'::jsonb), 'lax $.** ? (exists(@.groups) || exists(@.channels))') then
   return au_simulate_def(r.org_id, r.event_code, r.school_ids, r.draft) || jsonb_build_object('rule', r.id, 'side_effects', false);
 end if;
 return jsonb_build_object('rule',r.id,'side_effects',false,'schedule',d->'schedule','next_run',_au_next_run(d->'schedule', now()),'steps',d->'steps',
  'items',coalesce((select jsonb_agg(jsonb_build_object('entity',x.entity,'task',x.entity,'school',x.school,'label',x.ctx->>'label','due',x.ctx->>'due','title',x.ctx->>'title','ctx',x.ctx - 'label' - 'link' - 'teacher_users' - 'manager_user' - 'employee_user' - 'student',
     'recipients',(select jsonb_agg(distinct u) from jsonb_array_elements(d->'steps') s, jsonb_array_elements_text(case when s->>'type'='escalate' then jsonb_build_array(s->>'to') else coalesce(s->'recipients','[]') end) c,
        lateral _au_rcpt(c, r.org_id, x.school, ev.section, x.ctx, array(select (q)::uuid from jsonb_array_elements_text(coalesce(s->'users','[]')) q)) u
        where s->>'type' in ('notify','reminder','escalate') and _au_rcpt_allowed(c, r.org_id, x.school, u, ev, x.ctx))))
   from (select * from _au_srcp(r.event_code, r.org_id, r.school_ids, case when r.event_code like 'ds.%' then 5000 else 200 end, null, d->'params') y
         where (r.school_ids is null or y.school = any(r.school_ids)) and _au_eval(d->'when', y.ctx) limit 200) x),'[]'));
end $function$;

create policy "automation files of readable reports" on storage.objects for select to authenticated using (
  bucket_id = 'au-files' and exists (select 1 from public.au_files f join public.au_reports r on r.id = f.report_id where f.path = storage.objects.name and f.status = 'ready'));

alter function public._au_check_def(text, jsonb) rename to _au_check_def_core;
create function public._au_check_def(_event text, d jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if coalesce(d->'schedule'->>'type','') = 'on_change' and not exists (select 1 from au_source_tables t where t.event_code=_event) then
    raise exception 'instant reaction is not available for this source'; end if;
  return _au_check_def_core(_event, d);
end $$;
revoke all on function public._au_check_def(text, jsonb) from public, anon, authenticated;
revoke all on function public._au_check_def_core(text, jsonb) from public, anon, authenticated;

alter function public._au_act_report(au_jobs, au_outbox, au_rules, au_events, jsonb, jsonb, text, uuid) rename to _au_act_report_core;
create function public._au_act_report(j au_jobs, o au_outbox, ru au_rules, ev au_events, ctx jsonb, st jsonb, p text, boss uuid) returns text
language plpgsql security definer set search_path=public as $$
begin
  if st->>'source' = 'doc' then return _au_act_doc(j,o,ru,ev,ctx,st,p,boss); end if;
  return _au_act_report_core(j,o,ru,ev,ctx,st,p,boss);
end $$;
revoke all on function public._au_act_report(au_jobs, au_outbox, au_rules, au_events, jsonb, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function public._au_act_report_core(au_jobs, au_outbox, au_rules, au_events, jsonb, jsonb, text, uuid) from public, anon, authenticated;

alter function public.automation_tick(integer) rename to _au_tick_core;
create function public.automation_tick(_budget_ms integer default 3000) returns jsonb language plpgsql security definer set search_path=public as $$
begin
  perform _au_nudge_apply();
  return _au_tick_core(_budget_ms);
end $$;
revoke all on function public.automation_tick(integer) from public, anon, authenticated;
revoke all on function public._au_tick_core(integer) from public, anon, authenticated;
grant execute on function public.automation_tick(integer) to service_role;

CREATE OR REPLACE FUNCTION public._au_act_mt(j au_jobs, o au_outbox, ru au_rules, ev au_events, ctx jsonb, st jsonb, p text, boss uuid)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare k text := coalesce(st->>'key', p); rid uuid; cat mt_categories; v_yr int; v_n int; v_ref text; ex uuid[]; r mt_requests; u uuid; ck text := md5(j.idem_key||p); kd text := coalesce(st->>'kind','school'); b mt_buses; bid uuid;
begin
 if exists (select 1 from au_step_out where outbox_id=o.id and rule_id=ru.id and step=k) then return null; end if;
 if o.school_id is null then return 'no_school'; end if;
 if not _mt_ok(boss, o.school_id, kd, 'request') then return 'approver_cannot_request'; end if;
 select x.id into rid from mt_requests x where x.requested_by=boss and x.client_key=ck;
 if rid is null then
   select * into cat from mt_categories c where c.id=_au_uuid(st->>'category') and c.kind=kd and c.parent_id is null and c.active and (c.org_id is null or c.org_id=o.org_id);
   if cat.id is null then return 'category_unavailable'; end if;
   if kd='bus' then
     bid := case when st->>'bus'='record' then o.entity_id else _au_uuid(st->>'bus') end;
     select * into b from mt_buses x where x.id=bid and x.school_id=o.school_id and x.active;
     if b.id is null then return 'bus_unavailable'; end if;
   end if;
   v_yr := extract(year from now() at time zone 'Asia/Riyadh');
   insert into mt_counters as q (org_id,kind,yr,n) values (o.org_id,kd,v_yr,1) on conflict (org_id,kind,yr) do update set n=q.n+1 returning q.n into v_n;
   v_ref := case kd when 'school' then 'MS-' else 'MB-' end || v_yr || '-' || lpad(v_n::text,4,'0');
   insert into mt_requests(org_id,school_id,kind,ref,title,description,priority,category_id,place,bus_id,requested_by,client_key,status)
   values (o.org_id, o.school_id, kd, v_ref, left(btrim(_au_render(st->>'title', ctx, o.event_code)),120),
           left(btrim(_au_render(st->>'description', ctx, o.event_code)) || E'\n' || 'أنشئ آليًا بموجب قاعدة «'||ru.name||'» (الإصدار '||j.version||').', 1000),
           coalesce(st->>'priority','normal'), cat.id, case when kd='school' then btrim(st->>'place') end, b.id, boss, ck, 'new') returning id into rid;
   perform _au_mt_ev(rid, boss, 'create', jsonb_build_object('priority',coalesce(st->>'priority','normal'),'source','automation','rule',ru.id,'version',j.version));
   if st ? 'assign' then
     select g.user_id into u from _au_groups(st->'assign', o.org_id, o.school_id, ev, ctx, o.entity_id, o.id, ru.id) g
      where g.ok and g.user_id is not null and g.user_id in (select x from _mt_users(o.school_id,kd,'execute') x) limit 1;
     if u is null then perform _au_skip(j, null, p, 'mt_request:assignee_not_executor'); end if;
   end if;
   if u is null then
     select array_agg(x) into ex from _mt_users(o.school_id,kd,'execute') x where x <> boss;
     if coalesce(array_length(ex,1),0) = 1 then u := ex[1]; end if;
   end if;
   if u is not null then
     update mt_requests set status='assigned', assignee_id=u where id=rid returning * into r;
     perform _au_mt_ev(rid, boss, 'auto_assign', jsonb_build_object('assignee',u,'source','automation'));
     perform _mt_note(r, u, 'أُسند إليك طلب صيانة', 'assign:'||u);
   else
     update mt_requests set status='awaiting_assign' where id=rid returning * into r;
     perform _mt_notify_follow(r, 'طلب جديد بانتظار الإسناد', 'new');
   end if;
 end if;
 perform _au_out_put(o.id, ru.id, k, 'mt_request', rid, '{}');
 return null;
end $function$;

alter function public._au_check_steps(au_events, jsonb, integer) rename to _au_check_steps_core;
revoke all on function public._au_check_steps_core(au_events, jsonb, integer) from public, anon, authenticated;
create function public._au_check_steps(_ev au_events, _steps jsonb, _depth integer) returns integer language plpgsql stable security definer set search_path=public as $$
declare st jsonb; cp jsonb := '[]'::jsonb; x jsonb; fam boolean; extra int := 0; n int; t text; begin
 if jsonb_typeof(_steps) <> 'array' then return _au_check_steps_core(_ev, _steps, _depth); end if;
 for st in select jsonb_array_elements(_steps) loop
  t := st->>'type'; x := st;
  if t in ('notify','reminder') then
    fam := coalesce(st->'recipients' ? 'guardian', false) or jsonb_path_exists(coalesce(st->'groups','[]'::jsonb), 'strict $.** ? (@.code == "guardian")');
    perform _au_check_channels(_ev, st, fam); x := st - 'channels' - 'wa';
  elsif t = 'escalate' then
    if st ? 'channels' and st->'channels' <> '["internal"]'::jsonb then raise exception 'escalation uses internal notifications only'; end if;
    x := st - 'channels';
  elsif t = 'mt_request' and st->>'kind' = 'bus' then
    if _ev.area='central' then raise exception 'maintenance requests need a school event'; end if;
    if not (st->>'bus'='record' and _ev.code='ds.api.buses') and not exists (select 1 from mt_buses b where b.id=_au_uuid(st->>'bus') and b.active) then raise exception 'choose a bus (or the record bus on the buses source)'; end if;
    if coalesce(length(btrim(st->>'title')),0) not between 3 and 120 then raise exception 'request title 3..120'; end if;
    if coalesce(length(btrim(st->>'description')),0) not between 5 and 500 then raise exception 'request description 5..500'; end if;
    if coalesce(st->>'priority','normal') not in ('low','normal','high','urgent') then raise exception 'priority invalid'; end if;
    if not exists (select 1 from mt_categories c where c.id=_au_uuid(st->>'category') and c.kind='bus' and c.parent_id is null and c.active and not coalesce(c.is_other,false)) then raise exception 'choose a bus maintenance category'; end if;
    perform _au_check_tpl(_ev.code, st->>'title', false); perform _au_check_tpl(_ev.code, st->>'description', false);
    if st ? 'assign' then perform _au_check_groups(_ev, st->'assign', true); end if;
    if st ? 'on_fail' then extra := extra + _au_check_steps(_ev, st->'on_fail', _depth+1); end if;
    x := jsonb_build_object('type','stop');
  elsif t = 'report' and st->>'source' = 'doc' then
    if coalesce(length(btrim(st->>'title')),0) not between 3 and 120 then raise exception 'document title 3..120'; end if;
    if coalesce(length(btrim(st->>'body')),0) not between 10 and 4000 then raise exception 'document text 10..4000'; end if;
    perform _au_check_tpl(_ev.code, st->>'title', false); perform _au_check_tpl(_ev.code, st->>'body', false);
    if not st ? 'share' then raise exception 'choose who may open the document'; end if;
    perform _au_check_groups(_ev, st->'share', true);
    if st ? 'on_fail' then extra := extra + _au_check_steps(_ev, st->'on_fail', _depth+1); end if;
    x := jsonb_build_object('type','stop');
  end if;
  cp := cp || jsonb_build_array(x);
 end loop;
 n := _au_check_steps_core(_ev, cp, _depth) + extra;
 if _depth = 0 and n > 15 then raise exception 'too many steps (max 15)'; end if;
 return n;
end $$;
revoke all on function public._au_check_steps(au_events, jsonb, integer) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.au_simulate_def(_org uuid, _event text, _schools uuid[], _def jsonb)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare d jsonb; ev au_events; sett au_settings; items jsonb := '[]'; excl jsonb := '[]'; x record; st jsonb; c text; u uuid; nm int := 0; ne int := 0;
  rcs jsonb; elig int; bad int; capped int; conf int; fctx jsonb; begin
 perform _au_need_on(_org,'au_manage','simulate',_schools,_event,_def);
 if _schools is not null then perform _au_check_schools(_org, _schools); end if;
 begin d := _au_check_def(_event, _def); exception when others then return jsonb_build_object('ok',false,'error',sqlerrm,'side_effects',false); end;
 select * into ev from au_events where code=_event; select * into sett from au_settings where org_id=_org;
 for x in select y.* from _au_srcp(_event, _org, _schools, case when _event like 'ds.%' then 5000 else 300 end, null, d->'params') y where coalesce(d->>'mode','each') <> 'batch'
          union all
          select s2.id, s2.id, '#batch'::text, bx.c from schools s2 cross join lateral (select _au_batch_ctx(_event, _org, s2.id, d) c) bx
           where d->>'mode' = 'batch' and s2.org_id=_org and s2.is_active and (_schools is null or s2.id = any(_schools)) and coalesce((bx.c->>'batch_count')::int,0) > 0 loop
   if _schools is not null and not (x.school = any(_schools)) then
     ne := ne + 1; if jsonb_array_length(excl) < 50 then excl := excl || jsonb_build_object('label',x.ctx->>'label','reason','outside_scope'); end if; continue; end if;
   if coalesce(x.period,'') <> '#batch' and not _au_eval(d->'when', x.ctx) then
     ne := ne + 1; if jsonb_array_length(excl) < 50 then excl := excl || jsonb_build_object('label',x.ctx->>'label','reason','condition_false'); end if; continue; end if;
   nm := nm + 1;
   if nm > 50 then continue; end if;
   rcs := '[]';
   for st in select z.s from (select q.s, min(q.n) n from jsonb_path_query(d->'steps', 'lax $.** ? (@.type == "notify" || @.type == "reminder" || @.type == "escalate" || @.type == "task" || @.type == "review")') with ordinality q(s,n) group by q.s) z order by z.n loop
     if st ? 'groups' then
       rcs := rcs || (select coalesce(jsonb_agg(jsonb_build_object('step',st->>'type','group',g.grp+1,'via',g.via,
           'eligible',g.n_ok,'excluded',g.n_bad,'none',g.none,'names',g.names,'reasons',g.reasons) order by g.grp), '[]'::jsonb)
         from (select z.grp, min(z.via) via, count(*) filter (where z.ok) n_ok, count(*) filter (where not z.ok and z.user_id is not null) n_bad,
                 bool_or(z.user_id is null) none,
                 (select jsonb_agg(coalesce(pf.full_name,'—')) from (select z2.user_id from _au_groups(st->'groups', _org, x.school, ev, x.ctx, x.entity, null, null) z2 where z2.grp=z.grp and z2.ok limit 10) q left join profiles pf on pf.id=q.user_id) names,
                 jsonb_agg(distinct z.reason) filter (where z.reason is not null) reasons
               from _au_groups(st->'groups', _org, x.school, ev, x.ctx, x.entity, null, null) z group by z.grp) g);
       continue;
     end if;
     for c in select jsonb_array_elements_text(case when st->>'type'='escalate' then jsonb_build_array(st->>'to') when st->>'type'='task' then jsonb_build_array(st->>'assignee')
              when st->>'type'='review' then jsonb_build_array(st->>'to') else coalesce(st->'recipients','[]') end) loop
       elig := 0; bad := 0; capped := 0; conf := 0;
       for u in select r from _au_rcpt(c, _org, x.school, ev.section, x.ctx, array(select (q)::uuid from jsonb_array_elements_text(coalesce(st->'users','[]')) q)) r where r is not null loop
         if _au_rcpt_allowed(c, _org, x.school, u, ev, x.ctx) then elig := elig + 1;
           if coalesce((select n from au_rate where user_id=u and day=school_today()),0) >= (case when c='guardian' then coalesce(sett.family_max_day,3) else coalesce(sett.max_per_user_day,20) end) then capped := capped + 1; end if;
           if exists (select 1 from au_sent s join au_rules r2 on r2.id=s.rule_id and r2.active where s.k=_event||':'||x.entity||':'||coalesce(x.school::text,'')||':'||coalesce(x.period,'')||':'||u) then conf := conf + 1; end if;
         else bad := bad + 1; end if;
       end loop;
       rcs := rcs || jsonb_build_object('step',st->>'type','code',c,'eligible',elig,'excluded',bad,'would_defer',capped,'conflicts',conf);
     end loop;
   end loop;
   items := items || jsonb_build_object('label',x.ctx->>'label','school',(select name from schools where id=x.school),'recipients',rcs)
     || case when x.period = '#batch' then jsonb_build_object('grouped',true,'count',x.ctx->'batch_count','total',x.ctx->'batch_total','list',x.ctx->>'batch_list') else '{}'::jsonb end;
   if fctx is null then fctx := x.ctx; end if;
 end loop;
 return jsonb_build_object('ok',true,'side_effects',false,'normalized',d,'matched',nm,'excluded',ne,'items',items,'excluded_items',excl,
   'next_run',_au_next_run(d->'schedule', now()),
   'quiet',jsonb_build_object('on',coalesce((d->'schedule'->>'quiet')::boolean,true),'start',sett.quiet_start,'end',sett.quiet_end),
   'workdays_only',coalesce((d->'schedule'->>'workdays_only')::boolean,false),'workdays',to_jsonb(coalesce(sett.workdays,'{0,1,2,3,4}')),
   'limits',jsonb_build_object('max_per_user_day',coalesce(sett.max_per_user_day,20),'family_max_day',coalesce(sett.family_max_day,3),'cap_defer_days',coalesce(sett.cap_defer_days,3),'merge_rules',coalesce(sett.merge_rules,true)),
   'other_rules',(select coalesce(jsonb_agg(jsonb_build_object('name',r.name,'priority',r.priority,'active',r.active)),'[]') from au_rules r where r.org_id=_org and r.event_code=_event and ((select _au_full(_org)) or _au_vis(r.id, auth.uid())) and r.archived_at is null and r.approved_version is not null),
   'mode', coalesce(d->>'mode','each'),
   'preview',(select coalesce(jsonb_agg(jsonb_build_object('step',s->>'type','title',_au_render(s->>'title', fctx, _event),'body',coalesce(_au_render(nullif(s->>'body',''), fctx, _event), fctx->>'label'),
        'channels', coalesce(s->'channels','["internal"]'::jsonb)) || _au_wa_preview(s, fctx, _event)),'[]')
      from jsonb_path_query(d->'steps', 'lax $.** ? (@.type == "notify" || @.type == "reminder" || @.type == "escalate")') s where fctx is not null));
end $function$;