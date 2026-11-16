alter table public.sv_forms add column if not exists adopted_by uuid, add column if not exists adopted_at timestamptz;

create or replace function private._sv_form_for(_org uuid, _school uuid, _key text) returns public.sv_forms language sql stable security definer set search_path=public as $$
  select f from sv_forms f where f.key=_key and f.status='published' and f.org_id=_org
    and (f.school_id=_school or f.school_id is null)
  order by (f.school_id is not null) desc, f.version desc limit 1 $$;

create or replace function public.sv_form_adopt(_org uuid, _template uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare b sv_forms; _id uuid; _v int;
begin
  if not private._sv_forms_admin(_org) then raise exception 'يعتمد النماذج للمؤسسة مالك المجموعة أو مفوَّضه'; end if;
  select * into b from sv_forms where id=_template and org_id is null and school_id is null and status='published';
  if not found then raise exception 'القالب غير موجود أو غير متاح'; end if;
  if exists(select 1 from sv_forms where org_id=_org and key=b.key and status in ('published','draft','review')) then raise exception 'للمؤسسة إصدار معتمد أو مسودة لهذا النموذج؛ أنشئ إصدارًا جديدًا منه'; end if;
  select coalesce(max(version),0)+1 into _v from sv_forms where key=b.key and (org_id is null or org_id=_org);
  insert into sv_forms(org_id, school_id, key, version, title, purpose, kind, source, spec, roles, acceptance, outputs, status, based_on, created_by, updated_by, published_by, published_at, adopted_by, adopted_at)
  values (_org, null, b.key, _v, b.title, b.purpose, b.kind, b.source, b.spec, b.roles, b.acceptance, b.outputs, 'published', b.id, auth.uid(), auth.uid(), auth.uid(), now(), auth.uid(), now()) returning id into _id;
  perform private._sv_ev(_org, null, 'form', _id, 'adopt', jsonb_build_object('template', b.id, 'template_version', b.version, 'version', _v));
  return _id; end $$;
revoke all on function public.sv_form_adopt(uuid, uuid) from public, anon;
grant execute on function public.sv_form_adopt(uuid, uuid) to authenticated;

create or replace function public.sv_form_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if not (is_org_owner(_org) or private._sv_forms_admin(_org) or exists(select 1 from memberships m where m.user_id=auth.uid() and m.org_id=_org and m.is_active and m.role in ('principal','supervisor','vice_principal','dept_head','teacher'))) then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(to_jsonb(f) || jsonb_build_object('school', (select name from schools where id=f.school_id), 'creator', case when f.created_by is null then 'النظام' else private._sv_name(f.created_by) end,
      'publisher', case when f.published_by is null then null else private._sv_name(f.published_by) end,
      'adopter', case when f.adopted_by is null then null else private._sv_name(f.adopted_by) end,
      'is_template', f.org_id is null,
      'usable', f.org_id is not null and f.status='published',
      'can_adopt', f.org_id is null and f.status='published' and private._sv_forms_admin(_org)
        and not exists(select 1 from sv_forms o where o.org_id=_org and o.key=f.key and o.status in ('published','draft','review')),
      'can_edit', f.status='draft' and (case when f.school_id is null then private._sv_forms_admin(_org) else private._sv_principal(f.school_id) or private._sv_forms_admin(_org) end),
      'can_publish', f.status='review' and private._sv_forms_admin(_org) and auth.uid() is distinct from f.created_by and auth.uid() is distinct from f.updated_by)
    order by f.key, (f.org_id is null), f.version desc)
    from sv_forms f where (f.org_id is null or f.org_id=_org)
      and (f.status in ('published','archived') or private._sv_forms_admin(_org) or (f.school_id is not null and private._sv_principal(f.school_id)))),'[]');
end $$;