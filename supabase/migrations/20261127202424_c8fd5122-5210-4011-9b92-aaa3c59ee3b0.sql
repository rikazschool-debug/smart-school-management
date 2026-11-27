create or replace function public._au_reader() returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and (public.is_platform_admin() or exists(
    select 1 from memberships m where m.user_id=auth.uid() and m.is_active and m.org_id is not null
      and (_perm_owner(auth.uid(), m.org_id) or exists(select 1 from au_delegations d where d.org_id=m.org_id and d.user_id=auth.uid() and _au_dlive(d)))))
$$;
revoke execute on function public._au_reader() from public, anon;
grant execute on function public._au_reader() to authenticated, service_role;
drop policy if exists "channels readable by members" on public.au_channels;
create policy "channels readable by automation users" on public.au_channels for select to authenticated using ((select public._au_reader()));
drop policy if exists "source tables readable by members" on public.au_source_tables;
create policy "source tables readable by automation users" on public.au_source_tables for select to authenticated using ((select public._au_reader()));

create table public.au_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id) on delete cascade,
  code text not null,
  name text not null, description text not null, goal text, category text not null,
  section text not null, event_code text not null references public.au_events(code),
  risk text not null default 'low', def jsonb not null, params jsonb not null default '[]',
  layout jsonb, status text not null default 'ready', version int not null default 1,
  source_rule uuid, created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index au_templates_code on public.au_templates (coalesce(org_id,'00000000-0000-0000-0000-000000000000'::uuid), code);
create table public.au_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.au_templates(id) on delete cascade,
  version int not null, def jsonb not null, params jsonb not null, note text,
  created_by uuid, created_at timestamptz not null default now(), unique (template_id, version));
grant all on public.au_templates, public.au_template_versions to service_role;
alter table public.au_templates enable row level security;
alter table public.au_template_versions enable row level security;
alter table public.au_rules add column if not exists template_id uuid references public.au_templates(id) on delete set null,
  add column if not exists template_version int;

create or replace function public._au_tpl_fill(_def jsonb, _params jsonb, _vals jsonb) returns jsonb language plpgsql immutable set search_path=public as $$
declare p jsonb; s text := _def::text; k text; v numeric; begin
  for p in select * from jsonb_array_elements(coalesce(_params,'[]')) loop
    k := p->>'key';
    begin v := coalesce(nullif(_vals->>k,''), p->>'default')::numeric; exception when others then raise exception 'قيمة غير صالحة: %', p->>'label'; end;
    if v is null or v < (p->>'min')::numeric or v > (p->>'max')::numeric then
      raise exception 'القيمة «%» يجب أن تكون بين % و%', p->>'label', p->>'min', p->>'max'; end if;
    if p->>'type' in ('days','days_n') and v <> trunc(v) then raise exception 'القيمة «%» يجب أن تكون عددًا صحيحًا', p->>'label'; end if;
    s := replace(s, '"$p:'||k||'"', v::text);
    s := replace(s, '"$m:'||k||'"', (v*1440)::bigint::text);
  end loop;
  if s like '%"$p:%' or s like '%"$m:%' then raise exception 'template has unfilled values'; end if;
  return s::jsonb; end $$;

create or replace function public._au_tpl_check(_event text, _def jsonb) returns text language plpgsql stable security definer set search_path=public as $$
begin perform _au_check_def(_event, _def); return null; exception when others then return sqlerrm; end $$;
revoke execute on function public._au_tpl_check(text, jsonb) from public, anon, authenticated;
grant execute on function public._au_tpl_check(text, jsonb) to service_role;

create or replace function public._au_tpl_vis(_org uuid, t public.au_templates) returns boolean language sql stable security definer set search_path=public as $$
  select ((t.org_id is null and t.status='ready') or (t.org_id=_org and t.status<>'archived'))
    and ((select _au_full(_org)) or (_au_ev_vis(_org, t.event_code, auth.uid())
      and (t.event_code not like 'ds.%' or _au_ds_ok(_org, auth.uid(), t.event_code, null, true))))
$$;
revoke execute on function public._au_tpl_vis(uuid, public.au_templates) from public, anon;

create or replace function public.au_tpl_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin perform _au_need(_org,'au_view','center');
 return coalesce((select jsonb_agg(x order by x->>'scope' desc, x->>'category', x->>'name') from (
   select jsonb_build_object('id',t.id,'code',t.code,'name',t.name,'description',t.description,'goal',t.goal,'category',t.category,
     'section',t.section,'section_label',(select s.label from au_sections s where s.key=t.section),
     'event',t.event_code,'event_label',e.label,'risk',t.risk,'def',t.def,'params',t.params,'status',t.status,'version',t.version,
     'scope',case when t.org_id is null then 'platform' else 'org' end,'updated_at',t.updated_at,
     'used',(select count(*) from au_rules r where r.org_id=_org and r.template_id=t.id),
     'problem',_au_tpl_check(t.event_code, _au_tpl_fill(t.def, t.params, '{}')),
     'changelog',(select coalesce(jsonb_agg(jsonb_build_object('v',v.version,'note',v.note,'at',v.created_at) order by v.version desc),'[]') from au_template_versions v where v.template_id=t.id)) x
   from au_templates t join au_events e on e.code=t.event_code where _au_tpl_vis(_org, t)) q), '[]');
end $$;

create or replace function public.au_tpl_use(_org uuid, _id uuid, _name text, _schools uuid[], _vals jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare t au_templates; d jsonb; err text; rid uuid; begin
 perform _au_need(_org,'au_manage','designer');
 select * into t from au_templates where id=_id;
 if t.id is null or not _au_tpl_vis(_org, t) then raise exception 'forbidden' using errcode='42501'; end if;
 if jsonb_typeof(coalesce(_vals,'{}')) <> 'object' then raise exception 'values invalid'; end if;
 d := _au_tpl_fill(t.def, t.params, coalesce(_vals,'{}'));
 err := _au_tpl_check(t.event_code, d);
 if err is not null then raise exception 'القالب غير جاهز: %', err; end if;
 rid := au_rule_save_full(_org, null, coalesce(nullif(btrim(_name),''), t.name), t.description, t.event_code, _schools, d, t.layout);
 update au_rules set template_id=t.id, template_version=t.version where id=rid;
 insert into au_audit(org_id,rule_id,actor,action,details) values (_org,rid,auth.uid(),'from_template',jsonb_build_object('template',t.code,'version',t.version,'values',_vals));
 return rid; end $$;

create or replace function public.au_tpl_save(_org uuid, _id uuid, _rule uuid, _name text, _description text, _category text, _note text) returns uuid language plpgsql security definer set search_path=public as $$
declare r au_rules; t au_templates; tid uuid; err text; begin
 if not coalesce(_perm_owner(auth.uid(), _org), false) then raise exception 'forbidden' using errcode='42501'; end if;
 select * into r from au_rules where id=_rule and org_id=_org;
 if r.id is null then raise exception 'not found'; end if;
 if coalesce(length(btrim(_name)),0) not between 3 and 120 or coalesce(length(btrim(_description)),0) not between 5 and 500
    or coalesce(length(btrim(_category)),0) not between 2 and 60 or length(coalesce(_note,'')) > 300 then raise exception 'name/description/category invalid'; end if;
 err := _au_tpl_check(r.event_code, r.draft); if err is not null then raise exception 'القاعدة غير صالحة: %', err; end if;
 if _id is null then
   insert into au_templates(org_id,code,name,description,category,section,event_code,risk,def,params,layout,status,source_rule,created_by)
   values (_org,'org.'||replace(gen_random_uuid()::text,'-',''),btrim(_name),btrim(_description),btrim(_category),(select section from au_events where code=r.event_code),r.event_code,r.risk,r.draft,'[]',r.layout,'draft',r.id,auth.uid()) returning id into tid;
 else
   select * into t from au_templates where id=_id and org_id=_org for update;
   if t.id is null then raise exception 'not found'; end if;
   if t.event_code <> r.event_code then raise exception 'event cannot change'; end if;
   update au_templates set name=btrim(_name), description=btrim(_description), category=btrim(_category), def=r.draft, layout=r.layout, risk=r.risk,
     version=version+1, status='draft', source_rule=r.id, updated_at=now() where id=_id returning id into tid;
 end if;
 insert into au_template_versions(template_id,version,def,params,note,created_by) select id,version,def,params,nullif(btrim(_note),''),auth.uid() from au_templates where id=tid;
 insert into au_audit(org_id,rule_id,actor,action,details) values (_org,r.id,auth.uid(),'template_save',jsonb_build_object('template',tid));
 return tid; end $$;

create or replace function public.au_tpl_set_status(_id uuid, _status text) returns void language plpgsql security definer set search_path=public as $$
declare t au_templates; begin
 select * into t from au_templates where id=_id;
 if t.id is null or t.org_id is null or not coalesce(_perm_owner(auth.uid(), t.org_id), false) then raise exception 'forbidden' using errcode='42501'; end if;
 if _status not in ('draft','ready','archived') then raise exception 'status invalid'; end if;
 if _status='ready' and _au_tpl_check(t.event_code, t.def) is not null then raise exception 'القالب غير صالح للاعتماد'; end if;
 update au_templates set status=_status, updated_at=now() where id=_id;
 insert into au_audit(org_id,actor,action,details) values (t.org_id,auth.uid(),'template_status',jsonb_build_object('template',_id,'status',_status));
end $$;

revoke execute on function public.au_tpl_list(uuid), public.au_tpl_use(uuid,uuid,text,uuid[],jsonb), public.au_tpl_save(uuid,uuid,uuid,text,text,text,text), public.au_tpl_set_status(uuid,text), public._au_tpl_fill(jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.au_tpl_list(uuid), public.au_tpl_use(uuid,uuid,text,uuid[],jsonb), public.au_tpl_save(uuid,uuid,uuid,text,text,text,text), public.au_tpl_set_status(uuid,text) to authenticated;