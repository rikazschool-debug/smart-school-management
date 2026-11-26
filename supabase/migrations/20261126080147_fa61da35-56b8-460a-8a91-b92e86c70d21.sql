-- Phase 6: automation permissions, scoped delegation, review/approval lifecycle, risk, execution-time recheck
alter table public.au_rules
  add column if not exists stage text not null default 'draft',
  add column if not exists risk text not null default 'low',
  add column if not exists sim_fp text,
  add column if not exists submit_fp text,
  add column if not exists submitted_by uuid,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text,
  add column if not exists ever_active boolean not null default false,
  add column if not exists activated_by uuid;
alter table public.au_rules drop constraint if exists au_rules_stage_ck;
alter table public.au_rules add constraint au_rules_stage_ck check (stage in ('draft','validated','simulated','pending_review','pending_approval','needs_changes','rejected','approved'));
alter table public.au_rules drop constraint if exists au_rules_risk_ck;
alter table public.au_rules add constraint au_rules_risk_ck check (risk in ('low','medium','high'));
alter table public.au_settings add column if not exists separate_approver boolean not null default false;
create index if not exists au_rules_pending_idx on public.au_rules(org_id, stage) where stage in ('pending_review','pending_approval');

create table if not exists public.au_delegations(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null,
  school_ids uuid[],
  include_central boolean not null default false,
  sections text[], events text[], actions text[], recipients text[],
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  reason text not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz, revoked_by uuid, revoke_reason text);
grant all on public.au_delegations to service_role;
alter table public.au_delegations enable row level security;
drop policy if exists au_deleg_no_direct on public.au_delegations;
create policy au_deleg_no_direct on public.au_delegations for select to authenticated using (false);
create index if not exists au_delegations_user_idx on public.au_delegations(org_id, user_id) where revoked_at is null;
comment on table public.au_delegations is 'Automation scoped, time-bounded delegations; written only by owner RPCs au_deleg_save/au_deleg_revoke';

create or replace function public._au_perm_list() returns table(sec text, sec_label text, o int, act text, label text, ao int)
language sql immutable set search_path=public as $$
 values
 ('au_view','مركز الأتمتة — العرض',1,'center','الدخول إلى مركز الأتمتة',1),
 ('au_view','مركز الأتمتة — العرض',1,'dashboard','لوحة المؤشرات',2),
 ('au_view','مركز الأتمتة — العرض',1,'rules','قواعد الأتمتة',3),
 ('au_view','مركز الأتمتة — العرض',1,'events','دليل الأحداث',4),
 ('au_view','مركز الأتمتة — العرض',1,'conditions','دليل الشروط والمتغيرات',5),
 ('au_view','مركز الأتمتة — العرض',1,'actions','دليل الإجراءات',6),
 ('au_view','مركز الأتمتة — العرض',1,'schedule','الجدولة',7),
 ('au_view','مركز الأتمتة — العرض',1,'runs','مراقبة التنفيذ',8),
 ('au_view','مركز الأتمتة — العرض',1,'failed','العمليات الفاشلة',9),
 ('au_view','مركز الأتمتة — العرض',1,'jobs','الوظائف التلقائية القائمة',10),
 ('au_view','مركز الأتمتة — العرض',1,'audit','سجل التدقيق',11),
 ('au_manage','مركز الأتمتة — إدارة القواعد',2,'create','إنشاء مسودة جديدة',1),
 ('au_manage','مركز الأتمتة — إدارة القواعد',2,'edit','تعديل المسودات',2),
 ('au_manage','مركز الأتمتة — إدارة القواعد',2,'clone','نسخ القواعد',3),
 ('au_manage','مركز الأتمتة — إدارة القواعد',2,'designer','استخدام المصمم المرئي',4),
 ('au_manage','مركز الأتمتة — إدارة القواعد',2,'simulate','إجراء المحاكاة',5),
 ('au_manage','مركز الأتمتة — إدارة القواعد',2,'submit','إرسال القاعدة للاعتماد',6),
 ('au_manage','مركز الأتمتة — إدارة القواعد',2,'versions','مشاهدة الإصدارات السابقة',7),
 ('au_manage','مركز الأتمتة — إدارة القواعد',2,'restore','اقتراح استعادة إصدار سابق',8),
 ('au_manage','مركز الأتمتة — إدارة القواعد',2,'archive','أرشفة القواعد',9),
 ('au_control','مركز الأتمتة — المراجعة والتحكم',3,'review','مراجعة القواعد',1),
 ('au_control','مركز الأتمتة — المراجعة والتحكم',3,'approve','اعتماد القواعد (مدير المدرسة أو الوكيل فقط)',2),
 ('au_control','مركز الأتمتة — المراجعة والتحكم',3,'reject','رفض القواعد أو إعادتها مع السبب',3),
 ('au_control','مركز الأتمتة — المراجعة والتحكم',3,'activate','تفعيل القواعد (مدير المدرسة أو الوكيل فقط)',4),
 ('au_control','مركز الأتمتة — المراجعة والتحكم',3,'pause','إيقاف القواعد',5),
 ('au_control','مركز الأتمتة — المراجعة والتحكم',3,'rerun','إعادة تشغيل القواعد',6),
 ('au_control','مركز الأتمتة — المراجعة والتحكم',3,'retry','إعادة محاولة العمليات الفاشلة',7)
$$;

alter function public.perm_catalog() rename to _perm_catalog_v21;
create function public.perm_catalog() returns jsonb language sql stable security definer set search_path=public as $$
 with b as (select _perm_catalog_v21() c),
 s as (select coalesce(jsonb_agg(jsonb_build_object('key',sec,'label',sl,'parent','automation','actions',acts,'scopes','["org"]'::jsonb,'labels',labs,'sensitive',sec='au_control') order by o),'[]'::jsonb) j
       from (select sec, min(sec_label) sl, min(o) o, jsonb_agg(act order by ao) acts, jsonb_object_agg(act,label) labs from _au_perm_list() group by sec) q)
 select jsonb_set(jsonb_set(b.c,'{sections}', coalesce(b.c->'sections','[]'::jsonb) || s.j
          || jsonb_build_array(jsonb_build_object('key','au_settings_info','label','مركز الأتمتة — الإعدادات والإيقاف الطارئ','parent','automation','actions','[]'::jsonb,'scopes','[]'::jsonb,
             'locked_reason','إعدادات المحرك والإيقاف الطارئ لمدير النظام فقط ولا تُفوَّض'))),
        '{areas}', coalesce(b.c->'areas','[]'::jsonb) || '[{"key":"automation","label":"مركز الأتمتة الذكية"}]'::jsonb)
 from b, s
$$;
revoke all on function public._perm_catalog_v21() from public, anon, authenticated;
grant execute on function public.perm_catalog() to authenticated, service_role;
revoke execute on function public.perm_catalog() from anon;

alter function public._perm_valid(text,text,text) rename to _perm_valid_pre_au;
create function public._perm_valid(_section text, _action text, _scope text) returns boolean language sql stable set search_path=public as $$
 select case when _section in ('au_view','au_manage','au_control')
   then exists(select 1 from _au_perm_list() p where p.sec=_section and p.act=_action) and (_scope is null or _scope='org')
   else _perm_valid_pre_au(_section,_action,_scope) end
$$;

create or replace function public._au_perm(_org uuid, _uid uuid, _sec text, _act text) returns boolean
language sql stable security definer set search_path=public as $$
 select _uid is not null and (_perm_owner(_uid,_org) or (
   _perm_staff(_org,_uid) and not _perm_denied(_org,_uid,_sec,_act)
   and (exists(select 1 from perm_overrides o where o.org_id=_org and o.user_id=_uid and o.section=_sec and o.action=_act and o.effect='grant')
     or exists(select 1 from perm_assignments a join perm_roles r on r.id=a.role_id and r.archived_at is null
               join perm_role_grants g on g.role_id=r.id and g.section=_sec and g.action=_act where a.org_id=_org and a.user_id=_uid))
   and (_act not in ('approve','activate') or exists(select 1 from memberships m where m.user_id=_uid and m.org_id=_org and m.is_active
               and not coalesce(m.branch_suspended,false) and m.role in ('principal','vice_principal')))))
$$;

create or replace function public._au_def_rcpts(_def jsonb) returns setof text language sql immutable set search_path=public as $$
 select distinct c from (
   select jsonb_array_elements_text(case when jsonb_typeof(_def->'recipients')='array' then _def->'recipients' else '[]'::jsonb end) c
   union all select jsonb_array_elements_text(case when jsonb_typeof(s->'recipients')='array' then s->'recipients' else '[]'::jsonb end)
     from jsonb_path_query(coalesce(_def->'steps','[]'::jsonb),'lax $.** ? (@.type != null)') s
   union all select s->>'to' from jsonb_path_query(coalesce(_def->'steps','[]'::jsonb),'lax $.** ? (@.type != null)') s
   union all select s->>'assignee' from jsonb_path_query(coalesce(_def->'steps','[]'::jsonb),'lax $.** ? (@.type != null)') s
 ) q where c is not null and c <> ''
$$;

create or replace function public._au_v_schools(_d jsonb) returns uuid[] language sql immutable set search_path=public as $$
 select case when jsonb_typeof(_d->'schools')='array' then array(select x::uuid from jsonb_array_elements_text(_d->'schools') x) end
$$;

create or replace function public._au_dlive(d au_delegations) returns boolean language sql stable set search_path=public as $$
 select d.revoked_at is null and d.starts_at <= now() and (d.ends_at is null or d.ends_at > now())
$$;

create or replace function public._au_dcover(d au_delegations, _schools uuid[], _event text, _def jsonb) returns boolean
language sql stable security definer set search_path=public as $$
 select (d.school_ids is null or (_schools is not null and cardinality(_schools) > 0 and _schools <@ d.school_ids))
  and (d.events is null or _event = any(d.events))
  and (d.sections is null or exists(select 1 from au_events e left join au_sections s on s.key=e.section where e.code=_event and (e.section = any(d.sections) or s.parent = any(d.sections))))
  and (d.include_central or not exists(select 1 from au_events e where e.code=_event and e.area='central'))
  and (_def is null or d.actions is null or not exists(select 1 from jsonb_path_query(coalesce(_def->'steps','[]'::jsonb),'lax $.** ? (@.type != null)') s
        where s->>'type' in ('notify','reminder','escalate','task','review') and not (s->>'type' = any(d.actions))))
  and (_def is null or d.recipients is null or not exists(select 1 from _au_def_rcpts(_def) c where not (c = any(d.recipients))))
$$;

create or replace function public._au_can(_org uuid, _uid uuid, _sec text, _act text) returns boolean
language sql stable security definer set search_path=public as $$
 select _uid is not null and (_perm_owner(_uid,_org) or (_au_perm(_org,_uid,_sec,_act)
   and exists(select 1 from au_delegations d where d.org_id=_org and d.user_id=_uid and _au_dlive(d))))
$$;

create or replace function public._au_can_on(_org uuid, _uid uuid, _sec text, _act text, _schools uuid[], _event text, _def jsonb) returns boolean
language sql stable security definer set search_path=public as $$
 select _uid is not null and (_perm_owner(_uid,_org) or (_au_perm(_org,_uid,_sec,_act)
   and exists(select 1 from au_delegations d where d.org_id=_org and d.user_id=_uid and _au_dlive(d) and _au_dcover(d,_schools,_event,_def))))
$$;

create or replace function public._au_full(_org uuid) returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (_perm_owner(auth.uid(),_org) or (_perm_staff(_org,auth.uid()) and exists(select 1 from au_delegations d
   where d.org_id=_org and d.user_id=auth.uid() and _au_dlive(d) and d.school_ids is null and d.include_central and d.sections is null and d.events is null)))
$$;

create or replace function public._au_vis(_rid uuid, _uid uuid) returns boolean language sql stable security definer set search_path=public as $$
 select _rid is not null and _uid is not null and exists(select 1 from au_rules r where r.id=_rid and (_perm_owner(_uid,r.org_id) or (_perm_staff(r.org_id,_uid)
   and exists(select 1 from au_delegations d where d.org_id=r.org_id and d.user_id=_uid and _au_dlive(d) and _au_dcover(d,r.school_ids,r.event_code,null)))))
$$;

create or replace function public._au_ev_vis(_org uuid, _event text, _uid uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from au_delegations d where d.org_id=_org and d.user_id=_uid and _au_dlive(d)
   and (d.events is null or _event = any(d.events))
   and (d.sections is null or exists(select 1 from au_events e left join au_sections s on s.key=e.section where e.code=_event and (e.section = any(d.sections) or s.parent = any(d.sections))))
   and (d.include_central or not exists(select 1 from au_events e where e.code=_event and e.area='central')))
$$;

create or replace function public._au_need(_org uuid, _sec text, _act text) returns void language plpgsql stable security definer set search_path=public as $$
begin if not coalesce(_au_can(_org, auth.uid(), _sec, _act), false) then raise exception 'forbidden' using errcode='42501'; end if; end $$;

create or replace function public._au_need_any(_org uuid, _sec text, _acts text[]) returns void language plpgsql stable security definer set search_path=public as $$
begin if not exists(select 1 from unnest(_acts) a where _au_can(_org, auth.uid(), _sec, a)) then raise exception 'forbidden' using errcode='42501'; end if; end $$;

create or replace function public._au_need_on(_org uuid, _sec text, _act text, _schools uuid[], _event text, _def jsonb) returns void language plpgsql stable security definer set search_path=public as $$
begin if not coalesce(_au_can_on(_org, auth.uid(), _sec, _act, _schools, _event, _def), false) then raise exception 'forbidden' using errcode='42501'; end if; end $$;

create or replace function public._au_fp(r au_rules) returns text language sql immutable set search_path=public as $$
 select md5(r.draft::text||coalesce(r.school_ids::text,''))
$$;

create or replace function public._au_risk(_event text, _def jsonb, _schools uuid[]) returns text language sql stable security definer set search_path=public as $$
 with e as (select e.sensitivity, e.section, coalesce(s.parent,'') parent from au_events e left join au_sections s on s.key=e.section where e.code=_event),
 rc as (select coalesce(array(select _au_def_rcpts(_def)),'{}') a),
 st as (select coalesce(array(select s->>'type' from jsonb_path_query(coalesce(_def->'steps','[]'::jsonb),'lax $.** ? (@.type != null)') s),'{}') a)
 select case
  when coalesce((select sensitivity='restricted' or parent in ('finance','hr') or section in ('finance','hr') from e), false) then 'high'
  when (select 'guardian' = any(a) from rc) and (_schools is null or cardinality(_schools) > 1) then 'high'
  when coalesce((select sensitivity='sensitive' from e), false) or (select a && array['task','escalate','review'] from st)
       or (select 'guardian' = any(a) from rc) or _schools is null or cardinality(_schools) > 1 then 'medium'
  else 'low' end
$$;

create or replace function public._au_rule_risk_trg() returns trigger language plpgsql set search_path=public as $$
begin NEW.risk := _au_risk(NEW.event_code, NEW.draft, NEW.school_ids); return NEW; end $$;
drop trigger if exists au_rules_risk on public.au_rules;
create trigger au_rules_risk before insert or update of draft, school_ids, event_code on public.au_rules for each row execute function public._au_rule_risk_trg();

create or replace function public._au_appr_ok(_org uuid, _event text, _def jsonb, _uid uuid, _act text) returns boolean
language sql stable security definer set search_path=public as $$
 select _uid is not null and (_perm_owner(_uid,_org) or (_au_perm(_org,_uid,'au_control',_act)
   and exists(select 1 from au_delegations d where d.org_id=_org and d.user_id=_uid and _au_dlive(d) and _au_dcover(d,_au_v_schools(_def),_event,_def))))
$$;
create or replace function public._au_version_ok(ru au_rules, _v int) returns boolean language sql stable security definer set search_path=public as $$
 select coalesce((select _au_appr_ok(ru.org_id, ru.event_code, v.definition, v.approved_by, 'approve')
     and (ru.activated_by is null or _au_appr_ok(ru.org_id, ru.event_code, v.definition, ru.activated_by, 'activate'))
   from au_rule_versions v where v.rule_id=ru.id and v.version=_v), false)
$$;

create or replace function public._au_rule_status(r au_rules) returns text language sql stable security definer set search_path=public as $$
 select case when r.archived_at is not null then 'archived' when r.active then 'active'
   when r.approved_version is not null and (select fingerprint from au_rule_versions v where v.rule_id=r.id and v.version=r.approved_version) = md5(r.draft::text||coalesce(r.school_ids::text,''))
     then case when r.ever_active then 'paused' else 'approved' end
   when r.stage = 'approved' then 'draft' else r.stage end
$$;

create or replace function public._au_rule_caps(_rid uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare r au_rules; uid uuid := auth.uid(); own boolean; cov boolean; covv boolean; self boolean; k text; out jsonb := '{}'; begin
 select * into r from au_rules where id=_rid; if r.id is null or uid is null then return '{}'; end if;
 own := _perm_owner(uid, r.org_id);
 if own then
   select jsonb_object_agg(act, true) into out from _au_perm_list() where sec in ('au_manage','au_control');
   return out || jsonb_build_object('owner', true);
 end if;
 covv := exists(select 1 from au_delegations d where d.org_id=r.org_id and d.user_id=uid and _au_dlive(d) and _au_dcover(d,r.school_ids,r.event_code,null));
 cov := exists(select 1 from au_delegations d where d.org_id=r.org_id and d.user_id=uid and _au_dlive(d) and _au_dcover(d,r.school_ids,r.event_code,r.draft));
 self := uid = any(array[r.created_by, r.submitted_by, r.reviewed_by]);
 for k in select act from _au_perm_list() where sec in ('au_manage','au_control') loop
   out := out || jsonb_build_object(k, case
     when k in ('versions','archive','pause') then covv
     when k in ('review','approve','reject','activate') then cov and not coalesce(self,false) and (k not in ('approve','activate') or r.risk <> 'high')
     else cov end and _au_perm(r.org_id, uid, case when k in ('review','approve','reject','activate','pause','rerun','retry') then 'au_control' else 'au_manage' end, k));
 end loop;
 return out || jsonb_build_object('owner', false);
end $$;

create or replace function public.au_validate(_org uuid, _event text, _def jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  perform _au_need_any(_org,'au_manage',array['designer','create','edit']);
  if not (_au_full(_org) or _au_ev_vis(_org,_event,auth.uid())) then raise exception 'forbidden' using errcode='42501'; end if;
  begin return jsonb_build_object('ok',true,'normalized',_au_check_def(_event,_def));
  exception when others then return jsonb_build_object('ok',false,'error',sqlerrm); end;
end $$;

create or replace function public.au_rule_save(_org uuid, _id uuid, _name text, _event text, _schools uuid[], _def jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare d jsonb := _au_check_def(_event, _def); rid uuid; begin
  perform _au_need_on(_org,'au_manage',case when _id is null then 'create' else 'edit' end,_schools,_event,d);
  perform _au_check_schools(_org, _schools);
  if _id is null then
    insert into au_rules(org_id,school_ids,name,event_code,draft,created_by) values (_org,_schools,_name,_event,d,auth.uid()) returning id into rid;
  else
    if not _au_vis(_id, auth.uid()) then raise exception 'forbidden' using errcode='42501'; end if;
    update au_rules set name=_name, school_ids=_schools, draft=d, updated_at=now(),
      stage = case when md5(d::text||coalesce(_schools::text,'')) = md5(draft::text||coalesce(school_ids::text,'')) then stage else 'draft' end
      where id=_id and org_id=_org and event_code=_event returning id into rid;
    if rid is null then raise exception 'not found'; end if;
  end if;
  insert into au_audit(org_id,rule_id,actor,action,details) values (_org,rid,auth.uid(),'save_draft',jsonb_build_object('def',d,'schools',_schools));
  return rid; end $$;

create or replace function public.au_rule_restore_version(_id uuid, _version integer) returns void language plpgsql security definer set search_path=public as $$
declare r au_rules; v au_rule_versions; begin
 select * into r from au_rules where id=_id for update; if r.id is null then raise exception 'not found'; end if;
 perform _au_need_on(r.org_id,'au_manage','restore',r.school_ids,r.event_code,null);
 if r.archived_at is not null then raise exception 'archived rule: restore it first'; end if;
 select * into v from au_rule_versions where rule_id=_id and version=_version; if v.rule_id is null then raise exception 'version not found'; end if;
 perform _au_need_on(r.org_id,'au_manage','restore',_au_v_schools(v.definition),r.event_code,v.definition);
 update au_rules set draft = v.definition - 'schools' - 'event',
   school_ids = _au_v_schools(v.definition), stage='draft', updated_at=now() where id=_id;
 insert into au_audit(org_id,rule_id,actor,action,details) values (r.org_id,_id,auth.uid(),'restore_version',jsonb_build_object('version',_version));
end $$;

create or replace function public.au_rule_validate(_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare r au_rules; st text; begin
 select * into r from au_rules where id=_id for update; if r.id is null then raise exception 'not found'; end if;
 if not (_au_can_on(r.org_id,auth.uid(),'au_manage','edit',r.school_ids,r.event_code,r.draft) or _au_can_on(r.org_id,auth.uid(),'au_manage','create',r.school_ids,r.event_code,r.draft))
   then raise exception 'forbidden' using errcode='42501'; end if;
 if r.archived_at is not null then raise exception 'archived rule'; end if;
 perform _au_check_def(r.event_code, r.draft); perform _au_check_schools(r.org_id, r.school_ids);
 if not exists(select 1 from au_events where code=r.event_code and status in ('wired','tested')) then raise exception 'event not ready'; end if;
 st := case when r.stage='simulated' and r.sim_fp = _au_fp(r) then 'simulated'
            when r.stage in ('draft','needs_changes','rejected','validated','simulated') then 'validated' else r.stage end;
 update au_rules set stage=st where id=_id;
 insert into au_audit(org_id,rule_id,actor,action,details) values (r.org_id,_id,auth.uid(),'validate',jsonb_build_object('stage',st));
 return st; end $$;

create or replace function public.au_rule_simulate(_id uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare r au_rules; res jsonb; st text; begin
 select * into r from au_rules where id=_id; if r.id is null then raise exception 'not found'; end if;
 perform _au_need_on(r.org_id,'au_manage','simulate',r.school_ids,r.event_code,r.draft);
 res := au_simulate_def(r.org_id, r.event_code, r.school_ids, r.draft);
 st := r.stage;
 if coalesce((res->>'ok')::boolean,false) and r.stage in ('validated','simulated') and r.archived_at is null then
   update au_rules set stage='simulated', sim_fp=_au_fp(r) where id=_id; st := 'simulated'; end if;
 insert into au_audit(org_id,rule_id,actor,action,details) values (r.org_id,_id,auth.uid(),'simulate',
   jsonb_build_object('matched',res->'matched','excluded',res->'excluded','ok',res->'ok','stage',st));
 return res || jsonb_build_object('stage',st);
end $$;

create or replace function public.au_rule_submit(_id uuid) returns text language plpgsql security definer set search_path=public as $$
declare r au_rules; nst text; fp text; begin
 select * into r from au_rules where id=_id for update; if r.id is null then raise exception 'not found'; end if;
 perform _au_need_on(r.org_id,'au_manage','submit',r.school_ids,r.event_code,r.draft);
 if r.archived_at is not null then raise exception 'archived rule'; end if;
 fp := _au_fp(r);
 if r.approved_version is not null and (select fingerprint from au_rule_versions where rule_id=_id and version=r.approved_version) = fp then raise exception 'no changes to approve'; end if;
 if r.stage <> 'simulated' or r.sim_fp is distinct from fp then raise exception 'simulate the saved rule first'; end if;
 perform _au_check_def(r.event_code, r.draft); perform _au_check_schools(r.org_id, r.school_ids);
 nst := case when r.risk='low' then 'pending_approval' else 'pending_review' end;
 update au_rules set stage=nst, submit_fp=fp, submitted_by=auth.uid(), submitted_at=now(), reviewed_by=null, reviewed_at=null, review_note=null where id=_id;
 insert into au_audit(org_id,rule_id,actor,action,details) values (r.org_id,_id,auth.uid(),'submit',jsonb_build_object('risk',r.risk,'to',nst));
 return nst; end $$;

create or replace function public.au_rule_decide(_id uuid, _decision text, _note text) returns text language plpgsql security definer set search_path=public as $$
declare r au_rules; uid uuid := auth.uid(); own boolean; nst text; nt text := nullif(btrim(coalesce(_note,'')),''); act text; begin
 select * into r from au_rules where id=_id for update; if r.id is null then raise exception 'not found'; end if;
 if _decision not in ('pass','changes','reject') then raise exception 'bad decision'; end if;
 own := _perm_owner(uid, r.org_id);
 if r.stage not in ('pending_review','pending_approval') then raise exception 'rule is not awaiting a decision'; end if;
 if r.submit_fp is distinct from _au_fp(r) then raise exception 'rule changed since submission'; end if;
 if _decision='pass' then
   if r.stage <> 'pending_review' then raise exception 'rule is not awaiting review'; end if;
   perform _au_need_on(r.org_id,'au_control','review',r.school_ids,r.event_code,r.draft); nst := 'pending_approval'; act := 'review_pass';
 elsif _decision='changes' then
   if r.stage='pending_review' then perform _au_need_on(r.org_id,'au_control','review',r.school_ids,r.event_code,r.draft);
   elsif not (_au_can_on(r.org_id,uid,'au_control','approve',r.school_ids,r.event_code,r.draft) or _au_can_on(r.org_id,uid,'au_control','reject',r.school_ids,r.event_code,r.draft))
     then raise exception 'forbidden' using errcode='42501'; end if;
   nst := 'needs_changes'; act := 'return';
 else
   perform _au_need_on(r.org_id,'au_control','reject',r.school_ids,r.event_code,r.draft); nst := 'rejected'; act := 'reject';
 end if;
 if _decision <> 'pass' and (nt is null or length(nt) < 3) then raise exception 'reason required'; end if;
 if not own and coalesce(uid = any(array[r.created_by, r.submitted_by]), false) then raise exception 'cannot decide on your own rule'; end if;
 update au_rules set stage=nst, review_note=nt,
   reviewed_by = case when _decision='pass' then uid else reviewed_by end, reviewed_at = case when _decision='pass' then now() else reviewed_at end where id=_id;
 insert into au_audit(org_id,rule_id,actor,action,details) values (r.org_id,_id,uid,act,jsonb_build_object('note',nt,'risk',r.risk,'from',r.stage));
 return nst; end $$;

create or replace function public.au_rule_approve(_id uuid) returns integer language plpgsql security definer set search_path=public as $$
declare r au_rules; v int; uid uuid := auth.uid(); own boolean; sep boolean; begin
  select * into r from au_rules where id=_id for update; if r.id is null then raise exception 'not found'; end if;
  perform _au_need_on(r.org_id,'au_control','approve',r.school_ids,r.event_code,r.draft);
  own := _perm_owner(uid, r.org_id);
  if r.archived_at is not null then raise exception 'archived rule cannot be approved'; end if;
  if r.stage <> 'pending_approval' or r.submit_fp is distinct from _au_fp(r) then raise exception 'submit for approval first'; end if;
  if r.risk='high' and not own then raise exception 'high risk rules are approved by the system manager only'; end if;
  if not own and coalesce(uid = any(array[r.created_by, r.submitted_by, r.reviewed_by]), false) then raise exception 'cannot approve your own or reviewed rule'; end if;
  select coalesce(separate_approver,false) into sep from au_settings where org_id=r.org_id;
  if coalesce(sep,false) and coalesce(uid = any(array[r.created_by, r.submitted_by]), false) then raise exception 'separate approver required'; end if;
  if r.submitted_by is not null and not _perm_owner(r.submitted_by, r.org_id)
     and not exists(select 1 from au_delegations d where d.org_id=r.org_id and d.user_id=r.submitted_by and _au_dlive(d)) then raise exception 'submitter delegation ended'; end if;
  select coalesce(max(version),0)+1 into v from au_rule_versions where rule_id=_id;
  insert into au_rule_versions(rule_id,version,definition,fingerprint,approved_by)
    values (_id,v,r.draft || jsonb_build_object('schools',to_jsonb(r.school_ids),'event',r.event_code),_au_fp(r),uid);
  update au_rules set approved_version=v, priority=coalesce((r.draft->>'priority')::int,5), stage='approved', review_note=null, updated_at=now() where id=_id;
  insert into au_audit(org_id,rule_id,actor,action,details) values (r.org_id,_id,uid,'approve',
    jsonb_build_object('version',v,'risk',r.risk,'self_approved',coalesce(uid = r.created_by,false)));
  return v; end $$;

create or replace function public.au_rule_set_active(_id uuid, _on boolean) returns void language plpgsql security definer set search_path=public as $$
declare r au_rules; d jsonb; uid uuid := auth.uid(); own boolean; begin
 select * into r from au_rules where id=_id for update; if r.id is null then raise exception 'not found'; end if;
 perform _au_need_on(r.org_id,'au_control',case when _on then 'activate' else 'pause' end,r.school_ids,r.event_code,null);
 own := _perm_owner(uid, r.org_id);
 if _on and r.archived_at is not null then raise exception 'archived rule cannot be activated'; end if;
 if _on and r.approved_version is null then raise exception 'approve first'; end if;
 d := (select definition from au_rule_versions where rule_id=_id and version=r.approved_version);
 if _on then
   if r.risk='high' and not own then raise exception 'high risk rules are activated by the system manager only'; end if;
   if not _au_appr_ok(r.org_id, r.event_code, d, uid, 'activate') then raise exception 'forbidden' using errcode='42501'; end if;
   if not _au_appr_ok(r.org_id, r.event_code, d, (select approved_by from au_rule_versions where rule_id=_id and version=r.approved_version), 'approve')
     then raise exception 'approval authority ended: approve again'; end if;
 end if;
 d := _au_def(d);
 update au_rules set active=_on, updated_at=now(), ever_active = ever_active or _on, activated_by = case when _on then uid else activated_by end,
   next_run_at = case when not _on then null when d->'schedule'->>'type' in ('daily','weekly','monthly','at') then _au_next_run(d->'schedule', now())
                      when d->'schedule'->>'type' in ('manual','event') then null else now() end where id=_id;
 insert into au_audit(org_id,rule_id,actor,action,details) values (r.org_id,_id,uid,case when _on then 'activate' else 'deactivate' end,jsonb_build_object('version',r.approved_version,'risk',r.risk));
end $$;

create or replace function public.au_rule_clone(_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare r au_rules; nid uuid; begin
 select * into r from au_rules where id=_id; if r.id is null then raise exception 'not found'; end if;
 perform _au_need_on(r.org_id,'au_manage','clone',r.school_ids,r.event_code,r.draft);
 insert into au_rules(org_id,school_ids,name,description,event_code,draft,layout,created_by,area,priority,copied_from)
   values (r.org_id,r.school_ids,left(r.name||' (نسخة)',120),r.description,r.event_code,r.draft,r.layout,auth.uid(),r.area,r.priority,r.id) returning id into nid;
 insert into au_audit(org_id,rule_id,actor,action,details) values (r.org_id,nid,auth.uid(),'clone',jsonb_build_object('from',r.id));
 return nid; end $$;

create or replace function public.au_rule_archive(_id uuid, _on boolean) returns void language plpgsql security definer set search_path=public as $$
declare r au_rules; begin
 select * into r from au_rules where id=_id for update; if r.id is null then raise exception 'not found'; end if;
 perform _au_need_on(r.org_id,'au_manage','archive',r.school_ids,r.event_code,null);
 if _on and r.active then perform _au_need_on(r.org_id,'au_control','pause',r.school_ids,r.event_code,null); end if;
 update au_rules set archived_at = case when _on then now() else null end, active = case when _on then false else active end,
   stage = case when _on then stage else 'draft' end,
   next_run_at = case when _on then null else next_run_at end, updated_at=now() where id=_id;
 insert into au_audit(org_id,rule_id,actor,action,details) values (r.org_id,_id,auth.uid(),case when _on then 'archive' else 'unarchive' end,'{}');
end $$;

create or replace function public.au_me(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare uid uuid := auth.uid(); own boolean; live boolean; begin
 if uid is null then raise exception 'forbidden' using errcode='42501'; end if;
 own := _perm_owner(uid,_org);
 if not own and not _perm_staff(_org,uid) then raise exception 'forbidden' using errcode='42501'; end if;
 live := exists(select 1 from au_delegations d where d.org_id=_org and d.user_id=uid and _au_dlive(d));
 return jsonb_build_object('owner',own,'full',_au_full(_org),
   'perms',(select jsonb_object_agg(sec||'.'||act, own or (live and _au_perm(_org,uid,sec,act))) from _au_perm_list()),
   'separate_approver',coalesce((select separate_approver from au_settings where org_id=_org),false),
   'delegations',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'schools',(select coalesce(jsonb_agg(s.name),'[]') from schools s where s.id = any(d.school_ids)),
       'all_schools',d.school_ids is null,'central',d.include_central,'sections',d.sections,'events',d.events,'actions',d.actions,'recipients',d.recipients,
       'starts_at',d.starts_at,'ends_at',d.ends_at,'live',_au_dlive(d)) order by d.starts_at),'[]')
     from au_delegations d where d.org_id=_org and d.user_id=uid and d.revoked_at is null and (d.ends_at is null or d.ends_at > now())));
end $$;

create or replace function public.au_approvals(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare uid uuid := auth.uid(); begin
 perform _au_need_any(_org,'au_control',array['review','approve','reject']);
 return jsonb_build_object(
  'queue',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'event',r.event_code,'stage',r.stage,'risk',r.risk,
      'schools',(select coalesce(jsonb_agg(s.name),'[]') from schools s where s.id = any(r.school_ids)),'all_schools',r.school_ids is null,
      'submitted_by',_adm_name(r.submitted_by),'submitted_at',r.submitted_at,'reviewed_by',_adm_name(r.reviewed_by),'created_by',_adm_name(r.created_by),
      'version_next',coalesce(r.approved_version,0)+1,'caps',_au_rule_caps(r.id)) order by r.submitted_at),'[]')
    from au_rules r where r.org_id=_org and r.archived_at is null and r.stage in ('pending_review','pending_approval') and r.submit_fp = _au_fp(r)
      and ((select _au_full(_org)) or _au_vis(r.id, uid))),
  'returned',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'stage',r.stage,'risk',r.risk,'note',r.review_note,'at',r.updated_at) order by r.updated_at desc),'[]')
    from au_rules r where r.org_id=_org and r.archived_at is null and r.stage in ('needs_changes','rejected') and ((select _au_full(_org)) or _au_vis(r.id, uid))),
  'log',(select coalesce(jsonb_agg(x order by x->>'at' desc),'[]') from (select jsonb_build_object('at',a.at,'action',a.action,'rule',r.name,'actor',_adm_name(a.actor),'details',a.details - 'def') x
    from au_audit a join au_rules r on r.id=a.rule_id where a.org_id=_org and a.action in ('submit','review_pass','return','reject','approve','activate','deactivate')
      and ((select _au_full(_org)) or _au_vis(a.rule_id, uid)) order by a.at desc limit 60) q));
end $$;

create or replace function public.au_access(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not is_org_owner(_org) then raise exception 'forbidden' using errcode='42501'; end if;
 return jsonb_build_object(
  'perms',(select jsonb_agg(jsonb_build_object('key',sec||'.'||act,'section',sec,'section_label',sec_label,'label',label) order by o, ao) from _au_perm_list()),
  'people',(select coalesce(jsonb_agg(p order by p->>'name'),'[]') from (
    select jsonb_build_object('user_id',u.uid,'name',_adm_name(u.uid),
      'roles',(select coalesce(jsonb_agg(distinct m.role),'[]') from memberships m where m.org_id=_org and m.user_id=u.uid and m.is_active),
      'senior',exists(select 1 from memberships m where m.org_id=_org and m.user_id=u.uid and m.is_active and not coalesce(m.branch_suspended,false) and m.role in ('principal','vice_principal')),
      'perms',(select coalesce(jsonb_agg(sec||'.'||act order by o, ao),'[]') from _au_perm_list() where _au_perm(_org,u.uid,sec,act)),
      'denied',(select coalesce(jsonb_agg(o.section||'.'||o.action),'[]') from perm_overrides o where o.org_id=_org and o.user_id=u.uid and o.effect='deny' and o.section in ('au_view','au_manage','au_control')),
      'live',exists(select 1 from au_delegations d where d.org_id=_org and d.user_id=u.uid and _au_dlive(d))) p
    from (select o.user_id uid from perm_overrides o where o.org_id=_org and o.section in ('au_view','au_manage','au_control') and o.effect='grant'
          union select a.user_id from perm_assignments a join perm_role_grants g on g.role_id=a.role_id and g.section in ('au_view','au_manage','au_control') where a.org_id=_org
          union select d.user_id from au_delegations d where d.org_id=_org) u) q),
  'delegations',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'user_id',d.user_id,'name',_adm_name(d.user_id),
      'schools',(select coalesce(jsonb_agg(s.name),'[]') from schools s where s.id = any(d.school_ids)),'school_ids',d.school_ids,'all_schools',d.school_ids is null,
      'central',d.include_central,'sections',d.sections,'events',d.events,'actions',d.actions,'recipients',d.recipients,'starts_at',d.starts_at,'ends_at',d.ends_at,
      'reason',d.reason,'created_by',_adm_name(d.created_by),'created_at',d.created_at,'revoked_at',d.revoked_at,'revoked_by',_adm_name(d.revoked_by),'revoke_reason',d.revoke_reason,
      'status',case when d.revoked_at is not null then 'revoked' when d.starts_at > now() then 'scheduled' when d.ends_at is not null and d.ends_at <= now() then 'expired' else 'live' end)
      order by d.created_at desc),'[]') from au_delegations d where d.org_id=_org),
  'separate_approver',coalesce((select separate_approver from au_settings where org_id=_org),false));
end $$;

create or replace function public.au_deleg_save(_org uuid, _user uuid, _schools uuid[], _central boolean, _sections text[], _events text[], _actions text[], _recipients text[],
  _starts timestamptz, _ends timestamptz, _reason text) returns uuid language plpgsql security definer set search_path=public as $$
declare nid uuid; st timestamptz := coalesce(_starts, now()); begin
 if not is_org_owner(_org) then raise exception 'forbidden' using errcode='42501'; end if;
 if _user is null or _user = auth.uid() then raise exception 'cannot delegate to yourself'; end if;
 if _perm_owner(_user,_org) then raise exception 'user already has full authority'; end if;
 if not exists(select 1 from memberships m where m.org_id=_org and m.user_id=_user and m.is_active and m.role not in ('student','guardian','org_owner')) then raise exception 'not a staff member'; end if;
 if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'reason required'; end if;
 if _ends is not null and _ends <= greatest(st, now()) then raise exception 'end must be after start'; end if;
 if _schools is not null and cardinality(_schools) = 0 then raise exception 'choose schools or all'; end if;
 perform _au_check_schools(_org, _schools);
 if exists(select 1 from schools s where s.org_id=_org and s.is_active and (_schools is null or s.id = any(_schools)) and not _adm_staff(s.id,_user))
   then raise exception 'scope exceeds the user''s schools'; end if;
 if _sections is not null and exists(select 1 from unnest(_sections) x where not exists(select 1 from au_sections where key=x)) then raise exception 'unknown section'; end if;
 if _events is not null and exists(select 1 from unnest(_events) x where not exists(select 1 from au_events where code=x)) then raise exception 'unknown event'; end if;
 if _actions is not null and exists(select 1 from unnest(_actions) x where x not in ('notify','reminder','escalate','task','review')) then raise exception 'action not delegable'; end if;
 if _recipients is not null and exists(select 1 from unnest(_recipients) x where not exists(select 1 from au_recipients where code=x)) then raise exception 'unknown recipient'; end if;
 insert into au_delegations(org_id,user_id,school_ids,include_central,sections,events,actions,recipients,starts_at,ends_at,reason,created_by)
   values (_org,_user,_schools,coalesce(_central,false),_sections,_events,_actions,_recipients,st,_ends,btrim(_reason),auth.uid()) returning id into nid;
 insert into au_audit(org_id,rule_id,actor,action,details) values (_org,null,auth.uid(),'delegation_create',jsonb_build_object('delegation',nid,'user',_user,'name',_adm_name(_user),
   'schools',_schools,'central',coalesce(_central,false),'sections',_sections,'events',_events,'actions',_actions,'recipients',_recipients,'starts_at',st,'ends_at',_ends,'reason',btrim(_reason)));
 return nid; end $$;

create or replace function public.au_deleg_revoke(_id uuid, _reason text) returns jsonb language plpgsql security definer set search_path=public as $$
declare d au_delegations; n int := 0; blocked int := 0; begin
 select * into d from au_delegations where id=_id for update; if d.id is null then raise exception 'not found'; end if;
 if not is_org_owner(d.org_id) then raise exception 'forbidden' using errcode='42501'; end if;
 if d.revoked_at is not null then raise exception 'already revoked'; end if;
 if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'reason required'; end if;
 update au_delegations set revoked_at=now(), revoked_by=auth.uid(), revoke_reason=btrim(_reason) where id=_id;
 if not exists(select 1 from au_delegations x where x.org_id=d.org_id and x.user_id=d.user_id and _au_dlive(x)) then
   update au_rules set stage='needs_changes', review_note='أُعيدت تلقائيًا: انتهى تفويض من أرسلها'
     where org_id=d.org_id and submitted_by=d.user_id and stage in ('pending_review','pending_approval');
   get diagnostics n = row_count;
   select count(*) into blocked from au_rules r where r.org_id=d.org_id and r.active and not _au_version_ok(r, r.approved_version);
 end if;
 insert into au_audit(org_id,rule_id,actor,action,details) values (d.org_id,null,auth.uid(),'delegation_revoke',
   jsonb_build_object('delegation',_id,'user',d.user_id,'name',_adm_name(d.user_id),'reason',btrim(_reason),'returned',n,'blocked_active',blocked));
 return jsonb_build_object('returned',n,'blocked_active',blocked); end $$;

create or replace function public.au_policy_save(_org uuid, _separate boolean) returns void language plpgsql security definer set search_path=public as $$
begin
 if not is_org_owner(_org) then raise exception 'forbidden' using errcode='42501'; end if;
 insert into au_settings(org_id, separate_approver) values (_org, coalesce(_separate,false))
   on conflict (org_id) do update set separate_approver=excluded.separate_approver;
 insert into au_audit(org_id,rule_id,actor,action,details) values (_org,null,auth.uid(),'policy',jsonb_build_object('separate_approver',coalesce(_separate,false)));
end $$;

create or replace function public.au_log_denied(_org uuid, _what text) returns void language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null or not exists(select 1 from memberships m where m.org_id=_org and m.user_id=auth.uid() and m.is_active) then return; end if;
 if (select count(*) from au_audit where org_id=_org and actor=auth.uid() and action='denied' and at > now() - interval '1 hour') >= 20 then return; end if;
 insert into au_audit(org_id,rule_id,actor,action,details) values (_org,null,auth.uid(),'denied',jsonb_build_object('what',left(coalesce(_what,''),80)));
end $$;

create or replace function pg_temp.au_px(_sig text, _old text, _new text, _all boolean default false) returns void language plpgsql as $$
declare src text; p int; begin
  src := pg_get_functiondef(_sig::regprocedure);
  p := position(_old in src);
  if p = 0 then raise exception 'patch pattern not found in %: %', _sig, left(_old,80); end if;
  if _all then src := replace(src, _old, _new); else src := overlay(src placing _new from p for length(_old)); end if;
  execute src;
end $$;

select pg_temp.au_px('public._au_exec(au_jobs)', $o$if ev.status not in ('wired','tested') then return 'cancelled:event not ready'; end if;$o$,
  $n$if not _au_version_ok(ru, j.version) then return 'cancelled:approval authority lost'; end if;
 if ev.status not in ('wired','tested') then return 'cancelled:event not ready'; end if;$n$);

select pg_temp.au_px('public.au_audit_list(uuid,uuid,text,integer,integer)', $o$begin perform _au_owner(_org);$o$, $n$begin perform _au_need(_org,'au_view','audit');$n$);
select pg_temp.au_px('public.au_audit_list(uuid,uuid,text,integer,integer)', $o$a.org_id=_org$o$,
  $n$a.org_id=_org and ((select _au_full(_org)) or (a.rule_id is not null and _au_vis(a.rule_id, auth.uid())))$n$, true);

select pg_temp.au_px('public.au_existing_jobs(uuid)', $o$begin perform _au_owner(_org);$o$, $n$begin perform _au_need(_org,'au_view','jobs');$n$);

select pg_temp.au_px((select p.oid::regprocedure::text from pg_proc p where p.proname='au_job_detail' and p.pronamespace='public'::regnamespace),
  $o$perform _au_owner(j.org_id);$o$,
  $n$perform _au_need_any(j.org_id,'au_view',array['runs','failed']); if not _au_vis(j.rule_id, auth.uid()) then raise exception 'forbidden' using errcode='42501'; end if;$n$);
select pg_temp.au_px((select p.oid::regprocedure::text from pg_proc p where p.proname='au_job_retry' and p.pronamespace='public'::regnamespace),
  $o$perform _au_owner(j.org_id);$o$,
  $n$perform _au_need(j.org_id,'au_control','retry'); if not _au_vis(j.rule_id, auth.uid()) then raise exception 'forbidden' using errcode='42501'; end if;$n$);

select pg_temp.au_px((select p.oid::regprocedure::text from pg_proc p where p.proname='au_jobs_list' and p.pronamespace='public'::regnamespace),
  $o$perform _au_owner(_org);$o$,
  $n$if _status = 'dead' then perform _au_need_any(_org,'au_view',array['runs','failed']); else perform _au_need(_org,'au_view','runs'); end if;$n$);
select pg_temp.au_px((select p.oid::regprocedure::text from pg_proc p where p.proname='au_jobs_list' and p.pronamespace='public'::regnamespace),
  $o$where j.org_id=_org$o$, $n$where j.org_id=_org and ((select _au_full(_org)) or _au_vis(j.rule_id, auth.uid()))$n$, true);

select pg_temp.au_px('public.au_monitor(uuid)', $o$begin perform _au_owner(_org);$o$, $n$begin perform _au_need(_org,'au_view','runs');$n$);
select pg_temp.au_px('public.au_monitor(uuid)', $o$from au_jobs where org_id=_org$o$, $n$from au_jobs where org_id=_org and ((select _au_full(_org)) or _au_vis(rule_id, auth.uid()))$n$, true);
select pg_temp.au_px('public.au_monitor(uuid)', $o$from au_outbox where org_id=_org$o$, $n$from au_outbox where org_id=_org and (select _au_full(_org))$n$, true);
select pg_temp.au_px('public.au_monitor(uuid)', $o$from au_rules where org_id=_org$o$, $n$from au_rules where org_id=_org and ((select _au_full(_org)) or _au_vis(id, auth.uid()))$n$, true);
select pg_temp.au_px('public.au_monitor(uuid)', $o$from au_skips where org_id=_org$o$, $n$from au_skips where org_id=_org and ((select _au_full(_org)) or _au_vis(rule_id, auth.uid()))$n$, true);
select pg_temp.au_px('public.au_monitor(uuid)', $o$from au_runs order by id desc limit 20$o$, $n$from au_runs where (select _au_full(_org)) order by id desc limit 20$n$);

select pg_temp.au_px('public.au_registry(uuid)', $o$begin perform _au_owner(_org);$o$, $n$begin perform _au_need(_org,'au_view','center');$n$);
select pg_temp.au_px('public.au_registry(uuid)', $o$from au_events e)$o$, $n$from au_events e where (select _au_full(_org)) or _au_ev_vis(_org, e.code, auth.uid()))$n$, true);
select pg_temp.au_px('public.au_registry(uuid)', $o$from au_variables v)$o$, $n$from au_variables v where (select _au_full(_org)) or _au_ev_vis(_org, v.event_code, auth.uid()))$n$, true);

select pg_temp.au_px('public.au_rule_get(uuid)', $o$perform _au_owner(r.org_id);$o$,
  $n$if not ((_au_can(r.org_id,auth.uid(),'au_view','rules') or _au_can(r.org_id,auth.uid(),'au_manage','designer')) and _au_vis(r.id, auth.uid())) then raise exception 'forbidden' using errcode='42501'; end if;$n$);
select pg_temp.au_px('public.au_rule_get(uuid)', $o$'status',_au_rule_status(r),$o$,
  $n$'status',_au_rule_status(r),'stage',r.stage,'risk',r.risk,'review_note',r.review_note,'submitted_by',_adm_name(r.submitted_by),'submitted_at',r.submitted_at,'reviewed_by',_adm_name(r.reviewed_by),'simulated',r.sim_fp is not distinct from _au_fp(r),'caps',_au_rule_caps(r.id),$n$);
select pg_temp.au_px('public.au_rule_get(uuid)', $o$from au_rule_versions v where v.rule_id=r.id)$o$,
  $n$from au_rule_versions v where v.rule_id=r.id and _au_can(r.org_id,auth.uid(),'au_manage','versions'))$n$);

select pg_temp.au_px((select p.oid::regprocedure::text from pg_proc p where p.proname='au_rules_list' and p.pronamespace='public'::regnamespace),
  $o$perform _au_owner(_org);$o$, $n$perform _au_need(_org,'au_view','rules');$n$);
select pg_temp.au_px((select p.oid::regprocedure::text from pg_proc p where p.proname='au_rules_list' and p.pronamespace='public'::regnamespace),
  $o$where r.org_id=_org$o$, $n$where r.org_id=_org and ((select _au_full(_org)) or _au_vis(r.id, auth.uid()))$n$, true);
select pg_temp.au_px((select p.oid::regprocedure::text from pg_proc p where p.proname='au_rules_list' and p.pronamespace='public'::regnamespace),
  $o$'status',b.st,$o$, $n$'status',b.st,'stage',b.stage,'risk',b.risk,'review_note',b.review_note,'caps',_au_rule_caps(b.id),$n$);

select pg_temp.au_px('public.au_dashboard(uuid,date,date,uuid,text,uuid,text)', $o$perform _au_owner(_org);$o$, $n$perform _au_need(_org,'au_view','dashboard');$n$);
select pg_temp.au_px('public.au_dashboard(uuid,date,date,uuid,text,uuid,text)', $o$where j.org_id=_org and j.created_at >= f$o$,
  $n$where j.org_id=_org and ((select _au_full(_org)) or _au_vis(j.rule_id, auth.uid())) and j.created_at >= f$n$);
select pg_temp.au_px('public.au_dashboard(uuid,date,date,uuid,text,uuid,text)', $o$'draft',count(*) filter (where st='draft'),'changed',count(*) filter (where st='changed'),$o$,
  $n$'draft',count(*) filter (where st in ('draft','validated','simulated')),'pending',count(*) filter (where st in ('pending_review','pending_approval')),'approved',count(*) filter (where st='approved'),'returned',count(*) filter (where st in ('needs_changes','rejected')),$n$);
select pg_temp.au_px('public.au_dashboard(uuid,date,date,uuid,text,uuid,text)', $o$from au_rules r where r.org_id=_org) q$o$,
  $n$from au_rules r where r.org_id=_org and ((select _au_full(_org)) or _au_vis(r.id, auth.uid()))) q$n$);
select pg_temp.au_px('public.au_dashboard(uuid,date,date,uuid,text,uuid,text)', $o$where sk.org_id=_org$o$,
  $n$where sk.org_id=_org and ((select _au_full(_org)) or _au_vis(sk.rule_id, auth.uid()))$n$);
select pg_temp.au_px('public.au_dashboard(uuid,date,date,uuid,text,uuid,text)', $o$where r.org_id=_org and r.archived_at is null group by 1$o$,
  $n$where r.org_id=_org and r.archived_at is null and ((select _au_full(_org)) or _au_vis(r.id, auth.uid())) group by 1$n$);

select pg_temp.au_px('public.au_simulate_def(uuid,text,uuid[],jsonb)', $o$perform _au_owner(_org);$o$, $n$perform _au_need_on(_org,'au_manage','simulate',_schools,_event,_def);$n$);
select pg_temp.au_px('public.au_simulate_def(uuid,text,uuid[],jsonb)', $o$where r.org_id=_org and r.event_code=_event$o$,
  $n$where r.org_id=_org and r.event_code=_event and ((select _au_full(_org)) or _au_vis(r.id, auth.uid()))$n$);
select pg_temp.au_px('public.au_simulate(uuid)', $o$perform _au_owner(r.org_id);$o$, $n$perform _au_need_on(r.org_id,'au_manage','simulate',r.school_ids,r.event_code,r.draft);$n$);
select pg_temp.au_px((select p.oid::regprocedure::text from pg_proc p where p.proname='au_rule_run_now' and p.pronamespace='public'::regnamespace),
  $o$perform _au_owner(r.org_id);$o$, $n$perform _au_need_on(r.org_id,'au_control','rerun',r.school_ids,r.event_code,null);$n$);
select pg_temp.au_px((select p.oid::regprocedure::text from pg_proc p where p.proname='au_rule_save_full' and p.pronamespace='public'::regnamespace),
  $o$perform _au_owner(_org);$o$, $n$perform _au_need(_org,'au_manage','designer');$n$);

update public.au_rules r set
  ever_active = r.active or exists(select 1 from public.au_audit a where a.rule_id=r.id and a.action='activate'),
  stage = case when r.approved_version is not null and (select fingerprint from public.au_rule_versions v where v.rule_id=r.id and v.version=r.approved_version)
                    = md5(r.draft::text||coalesce(r.school_ids::text,'')) then 'approved' else 'draft' end,
  risk = public._au_risk(r.event_code, r.draft, r.school_ids);

revoke all on function public._au_perm_list(), public._au_perm(uuid,uuid,text,text), public._au_def_rcpts(jsonb), public._au_v_schools(jsonb),
  public._au_dlive(au_delegations), public._au_dcover(au_delegations,uuid[],text,jsonb), public._au_can(uuid,uuid,text,text),
  public._au_can_on(uuid,uuid,text,text,uuid[],text,jsonb), public._au_full(uuid), public._au_vis(uuid,uuid), public._au_ev_vis(uuid,text,uuid),
  public._au_need(uuid,text,text), public._au_need_any(uuid,text,text[]), public._au_need_on(uuid,text,text,uuid[],text,jsonb), public._au_fp(au_rules),
  public._au_risk(text,jsonb,uuid[]), public._au_rule_risk_trg(), public._au_appr_ok(uuid,text,jsonb,uuid,text), public._au_version_ok(au_rules,integer),
  public._au_rule_caps(uuid), public._au_rule_status(au_rules)
  from public, anon, authenticated;
revoke all on function public.au_rule_validate(uuid), public.au_rule_simulate(uuid), public.au_rule_submit(uuid), public.au_rule_decide(uuid,text,text),
  public.au_me(uuid), public.au_approvals(uuid), public.au_access(uuid),
  public.au_deleg_save(uuid,uuid,uuid[],boolean,text[],text[],text[],text[],timestamptz,timestamptz,text), public.au_deleg_revoke(uuid,text),
  public.au_policy_save(uuid,boolean), public.au_log_denied(uuid,text) from public, anon;
grant execute on function public.au_rule_validate(uuid), public.au_rule_simulate(uuid), public.au_rule_submit(uuid), public.au_rule_decide(uuid,text,text),
  public.au_me(uuid), public.au_approvals(uuid), public.au_access(uuid),
  public.au_deleg_save(uuid,uuid,uuid[],boolean,text[],text[],text[],text[],timestamptz,timestamptz,text), public.au_deleg_revoke(uuid,text),
  public.au_policy_save(uuid,boolean), public.au_log_denied(uuid,text) to authenticated, service_role;