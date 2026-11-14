-- ===== P1: staff job categories =====
create table public.hr_job_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index hr_job_categories_name_uq on public.hr_job_categories(org_id, lower(btrim(name)));
grant all on public.hr_job_categories to service_role;
alter table public.hr_job_categories enable row level security;
alter table public.hr_assignments add column category_id uuid references public.hr_job_categories(id);

create or replace function public.hr_cat_list(_org uuid) returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when auth.uid() is not null and (_hr_org_ok(_org,'view') or exists(select 1 from schools s where s.org_id=_org and _hr_school_ok(s.id,'view'))) then
    coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'is_active',c.is_active,
      'used',(select count(*) from hr_assignments a where a.category_id=c.id)) order by c.is_active desc, c.name) from hr_job_categories c where c.org_id=_org),'[]')
  else '[]'::jsonb end $$;

create or replace function public.hr_cat_save(_org uuid, _id uuid, _name text, _active boolean) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare n text := regexp_replace(btrim(coalesce(_name,'')),'\s+',' ','g'); r hr_job_categories; rid uuid;
begin
  if auth.uid() is null or not _hr_org_ok(_org,'edit') then raise exception 'ليست لديك صلاحية لهذا الإجراء' using errcode='42501'; end if;
  if n = '' or length(n) > 60 then raise exception 'اسم التصنيف مطلوب (حتى 60 حرفًا)'; end if;
  if exists(select 1 from hr_job_categories where org_id=_org and lower(name)=lower(n) and id is distinct from _id) then raise exception 'التصنيف موجود مسبقًا'; end if;
  if _id is null then
    insert into hr_job_categories(org_id,name,is_active,created_by) values(_org,n,coalesce(_active,true),auth.uid()) returning id into rid;
    perform _hr_log(_org,'category',rid,'create',null,jsonb_build_object('name',n),null);
  else
    select * into r from hr_job_categories where id=_id and org_id=_org for update;
    if not found then raise exception 'غير موجود'; end if;
    update hr_job_categories set name=n, is_active=coalesce(_active,is_active), updated_at=now() where id=_id returning id into rid;
    perform _hr_log(_org,'category',rid,case when r.is_active and not coalesce(_active,true) then 'disable' when not r.is_active and coalesce(_active,false) then 'enable' else 'update' end,
      jsonb_build_object('name',r.name,'active',r.is_active), jsonb_build_object('name',n,'active',coalesce(_active,r.is_active)), null);
  end if;
  return rid;
end $$;

create or replace function public._hr_cat_check(_org uuid, _cat uuid, _old uuid) returns void language plpgsql stable security definer set search_path to 'public' as $$
begin
  if _cat is null or _cat is not distinct from _old then return; end if;
  if not exists(select 1 from hr_job_categories where id=_cat and org_id=_org and is_active) then raise exception 'التصنيف الوظيفي غير متاح'; end if;
end $$;

-- assignment JSON gains category
create or replace function public._hr_assign_json(_emp uuid, _only_active boolean) returns jsonb language sql stable security definer set search_path to 'public' as $function$
 select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'school_id',a.school_id,'school',s.name,'job_title',a.job_title,'department',a.department,
     'manager_id',a.manager_id,'manager',m.full_name,'teacher_id',a.teacher_id,'teacher',t.full_name,'start_date',a.start_date,'end_date',a.end_date,
     'category_id',a.category_id,'category',c.name,
     'is_primary',a.is_primary,'active',(a.end_date is null or a.end_date >= _hr_today())) order by a.is_primary desc, a.start_date desc),'[]')
   from hr_assignments a join schools s on s.id=a.school_id left join hr_employees m on m.id=a.manager_id left join teachers t on t.id=a.teacher_id
   left join hr_job_categories c on c.id=a.category_id
  where a.employee_id=_emp and (not _only_active or a.end_date is null or a.end_date >= _hr_today()) $function$;

-- ===== P2: display names =====
alter table public.hr_employees add column display_name text, add column display_name_manual boolean not null default false;
alter table public.teachers add column display_name text, add column display_name_manual boolean not null default false;
alter table public.students add column display_name text, add column display_name_manual boolean not null default false;
alter table public.guardians add column display_name text, add column display_name_manual boolean not null default false;

create table public.person_display_names (
  org_id uuid not null references public.organizations(id) on delete cascade,
  norm text not null,
  display_name text not null,
  user_id uuid, national_id text,
  src_table text not null, src_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (org_id, norm)
);
grant all on public.person_display_names to service_role;
alter table public.person_display_names enable row level security;

create or replace function public._dn_clean(_s text) returns text language sql immutable as $$ select nullif(regexp_replace(btrim(coalesce(_s,'')),'\s+',' ','g'),'') $$;
create or replace function public._dn_norm(_s text) returns text language sql immutable as $$ select lower(public._dn_clean(_s)) $$;
create or replace function public._dn_default(_full text) returns text language sql immutable as $$
  select case when array_length(w,1) >= 2 then w[1]||' '||w[array_length(w,1)] else public._dn_clean(_full) end
  from (select regexp_split_to_array(public._dn_clean(_full),' ') w) x $$;

create or replace function public._dn_same(c person_display_names, _uid uuid, _nid text) returns boolean language sql immutable as $$
  select (c.user_id is not null and c.user_id = _uid) or (c.national_id is not null and c.national_id = _nid) $$;

create or replace function public._dn_suggest(_org uuid, _name text, _uid uuid, _nid text) returns text language plpgsql stable security definer set search_path to 'public' as $$
declare i int := 2; s text;
begin
  loop
    s := _dn_clean(_name)||' '||i;
    exit when not exists(select 1 from person_display_names c where c.org_id=_org and c.norm=_dn_norm(s) and not _dn_same(c,_uid,_nid));
    i := i + 1; exit when i > 99;
  end loop;
  return s;
end $$;

-- existing claim of the same person in the org (one display name per person)
create or replace function public._dn_person_claim(_org uuid, _uid uuid, _nid text) returns text language sql stable security definer set search_path to 'public' as $$
  select display_name from person_display_names c where c.org_id=_org and _dn_same(c,_uid,_nid) order by created_at limit 1 $$;

create or replace function public._dn_trg() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare o uuid; uid uuid := NEW.user_id; nid text := nullif(NEW.national_id,''); n text; c person_display_names; oldn text;
begin
  o := case when TG_TABLE_NAME='hr_employees' then NEW.org_id else school_org(NEW.school_id) end;
  if o is null then return NEW; end if;
  NEW.display_name := _dn_clean(NEW.display_name);
  if TG_OP='INSERT' then
    if NEW.display_name is null then
      NEW.display_name := coalesce(_dn_person_claim(o,uid,nid), _dn_default(NEW.full_name)); NEW.display_name_manual := false;
    else NEW.display_name_manual := true; end if;
  else
    oldn := OLD.display_name;
    if pg_trigger_depth() > 1 then null; -- propagated from a sibling record of the same person
    elsif NEW.display_name is null and oldn is null then return NEW; -- existing record never named: unchanged (preview handles it)
    elsif NEW.display_name is null then NEW.display_name := _dn_default(NEW.full_name); NEW.display_name_manual := false;
    elsif NEW.display_name is distinct from oldn then NEW.display_name_manual := true;
    elsif not OLD.display_name_manual and NEW.full_name is distinct from OLD.full_name then NEW.display_name := _dn_default(NEW.full_name);
    end if;
  end if;
  if NEW.display_name is null then return NEW; end if;
  if length(NEW.display_name) > 80 then raise exception 'الاسم المعروض طويل (حتى 80 حرفًا)'; end if;
  n := _dn_norm(NEW.display_name);
  insert into person_display_names(org_id,norm,display_name,user_id,national_id,src_table,src_id)
    values(o,n,NEW.display_name,uid,nid,TG_TABLE_NAME,NEW.id) on conflict (org_id,norm) do nothing;
  select * into c from person_display_names where org_id=o and norm=n;
  if not (c.src_id = NEW.id or _dn_same(c,uid,nid)) then
    raise exception 'الاسم المعروض غير متاح' using errcode='23505', hint = 'مقترح: '||_dn_suggest(o,NEW.display_name,uid,nid);
  end if;
  update person_display_names set user_id=coalesce(user_id,uid), national_id=coalesce(national_id,nid) where org_id=o and norm=n;
  if TG_OP='UPDATE' and oldn is not null and _dn_norm(oldn) <> n then
    delete from person_display_names x where x.org_id=o and x.norm=_dn_norm(oldn) and (x.src_id=NEW.id or _dn_same(x,uid,nid));
  end if;
  return NEW;
end $$;

-- keep one display name across the same person's records (same login or same ID number) in the org
create or replace function public._dn_sync_trg() returns trigger language plpgsql security definer set search_path to 'public' as $$
declare o uuid; uid uuid := NEW.user_id; nid text := nullif(NEW.national_id,'');
begin
  if pg_trigger_depth() > 1 or NEW.display_name is null or (TG_OP='UPDATE' and NEW.display_name is not distinct from OLD.display_name) then return null; end if;
  if uid is null and nid is null then return null; end if;
  o := case when TG_TABLE_NAME='hr_employees' then NEW.org_id else school_org(NEW.school_id) end;
  update hr_employees x set display_name=NEW.display_name, display_name_manual=NEW.display_name_manual
    where x.org_id=o and not (TG_TABLE_NAME='hr_employees' and x.id=NEW.id) and ((uid is not null and x.user_id=uid) or (nid is not null and x.national_id=nid)) and x.display_name is distinct from NEW.display_name;
  update teachers x set display_name=NEW.display_name, display_name_manual=NEW.display_name_manual
    where school_org(x.school_id)=o and not (TG_TABLE_NAME='teachers' and x.id=NEW.id) and ((uid is not null and x.user_id=uid) or (nid is not null and x.national_id=nid)) and x.display_name is distinct from NEW.display_name;
  update students x set display_name=NEW.display_name, display_name_manual=NEW.display_name_manual
    where school_org(x.school_id)=o and not (TG_TABLE_NAME='students' and x.id=NEW.id) and ((uid is not null and x.user_id=uid) or (nid is not null and x.national_id=nid)) and x.display_name is distinct from NEW.display_name;
  update guardians x set display_name=NEW.display_name, display_name_manual=NEW.display_name_manual
    where school_org(x.school_id)=o and not (TG_TABLE_NAME='guardians' and x.id=NEW.id) and ((uid is not null and x.user_id=uid) or (nid is not null and x.national_id=nid)) and x.display_name is distinct from NEW.display_name;
  return null;
end $$;

do $$ declare t text; begin
  foreach t in array array['hr_employees','teachers','students','guardians'] loop
    execute format('create trigger dn_claim before insert or update of display_name, full_name, user_id, national_id on public.%I for each row execute function public._dn_trg()', t);
    execute format('create trigger dn_sync after insert or update of display_name on public.%I for each row execute function public._dn_sync_trg()', t);
  end loop;
end $$;

-- release a claim when its record is deleted and no other record of the person uses it
create or replace function public._dn_del_trg() returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  delete from person_display_names where src_id=OLD.id and src_table=TG_TABLE_NAME
    and not exists(select 1 from (select display_name, user_id, national_id from hr_employees union all select display_name,user_id,national_id from teachers
      union all select display_name,user_id,national_id from students union all select display_name,user_id,national_id from guardians) r
      where _dn_norm(r.display_name)=person_display_names.norm and ((r.user_id is not null and r.user_id=OLD.user_id) or (r.national_id is not null and r.national_id=OLD.national_id)));
  return OLD;
end $$;
do $$ declare t text; begin
  foreach t in array array['hr_employees','teachers','students','guardians'] loop
    execute format('create trigger dn_release after delete on public.%I for each row execute function public._dn_del_trg()', t);
  end loop;
end $$;

-- owner preview for existing records (no change) + explicit apply of conflict-free proposals
create or replace function public.people_dn_preview(_org uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or not is_org_owner(_org) then raise exception 'ليست لديك صلاحية لهذا الإجراء' using errcode='42501'; end if;
  return (with r as (
      select 'hr_employees' t, id, full_name, user_id, national_id from hr_employees where org_id=_org and display_name is null
      union all select 'teachers', id, full_name, user_id, national_id from teachers where school_org(school_id)=_org and display_name is null
      union all select 'students', id, full_name, user_id, national_id from students where school_org(school_id)=_org and display_name is null
      union all select 'guardians', id, full_name, user_id, national_id from guardians where school_org(school_id)=_org and display_name is null),
    p as (select r.*, _dn_default(full_name) prop, _dn_norm(_dn_default(full_name)) pn,
      coalesce(r.user_id::text, 'n:'||nullif(r.national_id,''), r.t||':'||r.id) pkey from r),
    k as (select p.*, (select count(distinct q.pkey) from p q where q.pn=p.pn) > 1
        or exists(select 1 from person_display_names c where c.org_id=_org and c.norm=p.pn and not _dn_same(c,p.user_id,p.national_id)) conflict from p)
    select jsonb_build_object('total', count(*), 'conflicts', count(*) filter (where conflict),
      'rows', coalesce(jsonb_agg(jsonb_build_object('table',t,'id',id,'full_name',full_name,'proposed',prop,'conflict',conflict) order by conflict desc, prop),'[]')) from k);
end $$;

create or replace function public.people_dn_apply(_org uuid) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; x jsonb; ok int := 0; skipped int := 0;
begin
  r := people_dn_preview(_org);
  for x in select * from jsonb_array_elements(r->'rows') loop
    if (x->>'conflict')::boolean then skipped := skipped + 1; continue; end if;
    begin
      execute format('update public.%I set display_name=$1 where id=$2 and display_name is null', x->>'table') using x->>'proposed', (x->>'id')::uuid;
      ok := ok + 1;
    exception when unique_violation then skipped := skipped + 1; end;
  end loop;
  perform _access_audit(_org, null, 'display_names_apply', null, null, null, null, jsonb_build_object('applied',ok,'skipped',skipped), null);
  return jsonb_build_object('applied', ok, 'skipped', skipped);
end $$;

-- check availability without saving (forms)
create or replace function public.people_dn_check(_org uuid, _name text, _user uuid, _nid text) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare c person_display_names;
begin
  if auth.uid() is null or not exists(select 1 from memberships m where m.org_id=_org and m.user_id=auth.uid() and m.is_active and m.role not in ('student','guardian'))
     and not is_org_owner(_org) then raise exception 'ليست لديك صلاحية لهذا الإجراء' using errcode='42501'; end if;
  if _dn_clean(_name) is null then return jsonb_build_object('ok',true); end if;
  select * into c from person_display_names where org_id=_org and norm=_dn_norm(_name);
  if c.org_id is null or _dn_same(c,_user,nullif(_nid,'')) then return jsonb_build_object('ok',true); end if;
  return jsonb_build_object('ok',false,'suggestion',_dn_suggest(_org,_name,_user,nullif(_nid,'')));
end $$;

-- HR save wrappers: category + display name (originals keep every existing rule)
alter function public.hr_employee_save(uuid, uuid, jsonb, text) rename to _hr_employee_save_base;
alter function public.hr_assignment_save(uuid, uuid, jsonb, text) rename to _hr_assignment_save_base;
revoke all on function public._hr_employee_save_base(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public._hr_assignment_save_base(uuid, uuid, jsonb, text) from public, anon, authenticated;

create or replace function public.hr_employee_save(_org uuid, _id uuid, _p jsonb, _reason text default null) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare rid uuid; cat uuid := nullif(_p->>'category_id','')::uuid;
begin
  if _id is null then perform _hr_cat_check(_org, cat, null); end if;
  rid := _hr_employee_save_base(_org, _id, _p, _reason);
  if _id is null and cat is not null then update hr_assignments set category_id=cat where employee_id=rid; end if;
  if _p ? 'display_name' and (_id is not null or _dn_clean(_p->>'display_name') is not null) then
    update hr_employees set display_name=_dn_clean(_p->>'display_name') where id=rid and display_name is distinct from _dn_clean(_p->>'display_name');
  end if;
  return rid;
end $$;

create or replace function public.hr_assignment_save(_employee uuid, _id uuid, _p jsonb, _reason text default null) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare rid uuid; cat uuid := nullif(_p->>'category_id','')::uuid; old uuid; o uuid;
begin
  select org_id into o from hr_employees where id=_employee;
  if _id is not null then select category_id into old from hr_assignments where id=_id; end if;
  perform _hr_cat_check(o, cat, old);
  rid := _hr_assignment_save_base(_employee, _id, _p, _reason);
  if _p ? 'category_id' then update hr_assignments set category_id=cat where id=rid and category_id is distinct from cat; end if;
  return rid;
end $$;

revoke all on function public.hr_employee_save(uuid, uuid, jsonb, text), public.hr_assignment_save(uuid, uuid, jsonb, text),
  public.hr_cat_list(uuid), public.hr_cat_save(uuid, uuid, text, boolean), public.people_dn_preview(uuid), public.people_dn_apply(uuid),
  public.people_dn_check(uuid, text, uuid, text) from public, anon;
grant execute on function public.hr_employee_save(uuid, uuid, jsonb, text), public.hr_assignment_save(uuid, uuid, jsonb, text),
  public.hr_cat_list(uuid), public.hr_cat_save(uuid, uuid, text, boolean), public.people_dn_preview(uuid), public.people_dn_apply(uuid),
  public.people_dn_check(uuid, text, uuid, text) to authenticated;
revoke all on function public._dn_trg(), public._dn_sync_trg(), public._dn_del_trg(), public._dn_suggest(uuid,text,uuid,text),
  public._dn_person_claim(uuid,uuid,text), public._hr_cat_check(uuid,uuid,uuid) from public, anon, authenticated;