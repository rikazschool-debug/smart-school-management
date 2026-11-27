create or replace function public._au_tpl_fill(_def jsonb, _params jsonb, _vals jsonb) returns jsonb language plpgsql immutable set search_path=public as $$
declare p jsonb; s text := _def::text; k text; v numeric; u text; begin
  for p in select * from jsonb_array_elements(coalesce(_params,'[]')) loop
    k := p->>'key';
    if p->>'type' = 'letter_template' then
      u := nullif(_vals->>k,'');
      if u is null or u !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'اختر «%»', p->>'label'; end if;
      s := replace(s, '"$p:'||k||'"', to_jsonb(u)::text);
      continue;
    end if;
    begin v := coalesce(nullif(_vals->>k,''), p->>'default')::numeric; exception when others then raise exception 'قيمة غير صالحة: %', p->>'label'; end;
    if v is null or v < (p->>'min')::numeric or v > (p->>'max')::numeric then
      raise exception 'القيمة «%» يجب أن تكون بين % و%', p->>'label', p->>'min', p->>'max'; end if;
    if p->>'type' in ('days','days_n') and v <> trunc(v) then raise exception 'القيمة «%» يجب أن تكون عددًا صحيحًا', p->>'label'; end if;
    s := replace(s, '"$p:'||k||'"', v::text);
    s := replace(s, '"$m:'||k||'"', (v*1440)::bigint::text);
  end loop;
  if s like '%"$p:%' or s like '%"$m:%' then raise exception 'template has unfilled values'; end if;
  return s::jsonb; end $$;

create or replace function public._au_tpl_defaults(_org uuid, _params jsonb) returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_object_agg(p->>'key', (select l.id from hr_letter_templates l where l.org_id=_org and l.is_active order by l.name limit 1)), '{}')
  from jsonb_array_elements(coalesce(_params,'[]')) p where p->>'type'='letter_template'
$$;
revoke execute on function public._au_tpl_defaults(uuid, jsonb) from public, anon, authenticated;

create or replace function public._au_tpl_problem(_org uuid, t public.au_templates) returns text language plpgsql stable security definer set search_path=public as $$
declare d jsonb; begin
  begin d := _au_tpl_fill(t.def, t.params, _au_tpl_defaults(_org, t.params));
  exception when others then
    if exists (select 1 from jsonb_array_elements(t.params) p where p->>'type'='letter_template') then return 'لا يوجد قالب خطاب مفعّل في المجموعة؛ أضِف قالبًا من قسم الموارد البشرية أولًا'; end if;
    return sqlerrm; end;
  return _au_tpl_check(t.event_code, d); end $$;
revoke execute on function public._au_tpl_problem(uuid, public.au_templates) from public, anon, authenticated;

create or replace function public.au_tpl_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin perform _au_need(_org,'au_view','center');
 return coalesce((select jsonb_agg(x order by x->>'scope' desc, x->>'category', x->>'name') from (
   select jsonb_build_object('id',t.id,'code',t.code,'name',t.name,'description',t.description,'goal',t.goal,'category',t.category,
     'section',t.section,'section_label',(select s.label from au_sections s where s.key=t.section),
     'event',t.event_code,'event_label',e.label,'risk',t.risk,'def',t.def,'params',t.params,'status',t.status,'version',t.version,
     'scope',case when t.org_id is null then 'platform' else 'org' end,'updated_at',t.updated_at,
     'used',(select count(*) from au_rules r where r.org_id=_org and r.template_id=t.id),
     'problem',_au_tpl_problem(_org, t),
     'letters',case when exists (select 1 from jsonb_array_elements(t.params) p where p->>'type'='letter_template')
        then (select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name) order by l.name),'[]') from hr_letter_templates l where l.org_id=_org and l.is_active) end,
     'changelog',(select coalesce(jsonb_agg(jsonb_build_object('v',v.version,'note',v.note,'at',v.created_at) order by v.version desc),'[]') from au_template_versions v where v.template_id=t.id)) x
   from au_templates t join au_events e on e.code=t.event_code where _au_tpl_vis(_org, t)) q), '[]');
end $$;

create or replace function public.au_tpl_use(_org uuid, _id uuid, _name text, _schools uuid[], _vals jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare t au_templates; d jsonb; err text; rid uuid; p jsonb; begin
 perform _au_need(_org,'au_manage','designer');
 select * into t from au_templates where id=_id;
 if t.id is null or not _au_tpl_vis(_org, t) then raise exception 'forbidden' using errcode='42501'; end if;
 if jsonb_typeof(coalesce(_vals,'{}')) <> 'object' then raise exception 'values invalid'; end if;
 for p in select * from jsonb_array_elements(t.params) loop
   if p->>'type'='letter_template' and not exists (select 1 from hr_letter_templates l where l.id=_au_uuid(_vals->>(p->>'key')) and l.org_id=_org and l.is_active) then
     raise exception 'اختر قالب خطاب مفعّلًا من مجموعتك'; end if;
 end loop;
 d := _au_tpl_fill(t.def, t.params, coalesce(_vals,'{}'));
 err := _au_tpl_check(t.event_code, d);
 if err is not null then raise exception 'القالب غير جاهز: %', err; end if;
 rid := au_rule_save_full(_org, null, coalesce(nullif(btrim(_name),''), t.name), t.description, t.event_code, _schools, d, t.layout);
 update au_rules set template_id=t.id, template_version=t.version where id=rid;
 insert into au_audit(org_id,rule_id,actor,action,details) values (_org,rid,auth.uid(),'from_template',jsonb_build_object('template',t.code,'version',t.version,'values',_vals));
 return rid; end $$;

update public.au_templates set def = jsonb_set(def, '{steps,0}', '{"type": "notify", "title": "طلب تسجيل ينتظر: {{student_name}}", "body": "طلب التسجيل {{ref}} مفتوح منذ {{days_waiting}} يومًا.", "groups": [{"by": "role", "role": "student_affairs"}]}'::jsonb), version=version+1, updated_at=now() where org_id is null and code='adm.incomplete';
update public.au_templates set def = jsonb_set(def, '{steps,1,then,0}', '{"type": "escalate", "title": "تكليف متأخر {{days_overdue}} يوم: {{title}}", "groups": [{"by": "record", "code": "assigner"}]}'::jsonb), version=version+1, updated_at=now() where org_id is null and code='tasks.overdue';
update public.au_templates set def = jsonb_set(def, '{steps,0}', '{"type": "escalate", "title": "طلب إداري ينتظر منذ {{days_waiting}} يوم: {{form_name}}", "to": "principal"}'::jsonb), version=version+1, updated_at=now() where org_id is null and code='requests.stale';
update public.au_templates set def = jsonb_set(def, '{steps,0,groups}', '[{"by": "record", "code": "bus_owner", "fallback": {"by": "role", "role": "principal"}}]'::jsonb), version=version+1, updated_at=now() where org_id is null and code='bus.docs';
update public.au_templates set def = jsonb_set(def, '{steps,1,max_minutes}', '43200'::jsonb),
  params='[{"key": "days", "label": "التنبيه قبل الانتهاء", "type": "days_n", "default": 30, "min": 7, "max": 37, "unit": "يوم"}]'::jsonb, version=version+1, updated_at=now() where org_id is null and code='docs.org_expiry';
update public.au_templates set def = jsonb_set(def, '{steps,0}', '{"type": "hr_letter", "key": "letter", "template": "$p:letter", "purpose": "تجديد عقد {{employee_name}} المنتهي في {{expires_on}}"}'::jsonb),
  params='[{"key": "days", "label": "قبل انتهاء العقد", "type": "days_n", "default": 45, "min": 1, "max": 180, "unit": "يوم"}, {"key": "letter", "label": "قالب الخطاب", "type": "letter_template"}]'::jsonb, version=version+1, updated_at=now() where org_id is null and code='hr.contract_letter';
insert into public.au_template_versions(template_id,version,def,params,note)
  select id,version,def,params,'مطابقة قواعد المحرك (المستلمون/التصعيد/المهلة/قالب الخطاب)' from public.au_templates where org_id is null and version=2;