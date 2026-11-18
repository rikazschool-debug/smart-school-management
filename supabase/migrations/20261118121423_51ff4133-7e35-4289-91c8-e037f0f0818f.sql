alter table public.org_docs add column archived_at timestamptz, add column archived_by uuid;
alter table public.org_contractors add column archived_at timestamptz, add column archived_by uuid;
create index org_docs_archive_idx on public.org_docs(org_id, archived_at desc) where archived_at is not null;
create index org_contractors_archive_idx on public.org_contractors(org_id, archived_at desc) where archived_at is not null;

do $migration$
declare d text; n text; fn regprocedure;
begin
  d := pg_get_functiondef('public.od_list(uuid,text,text,uuid,text)'::regprocedure);
  n := replace(replace(d, 'where d.org_id=_org', 'where d.org_id=_org and d.archived_at is null'), 'from org_contractors c where c.org_id=_org', 'from org_contractors c where c.org_id=_org and c.archived_at is null');
  if position('d.archived_at is null' in n)=0 or position('c.archived_at is null' in n)=0 then raise exception 'Expected active lists not found'; end if;
  execute n;
  foreach fn in array array['public.od_save_doc(uuid,jsonb)'::regprocedure, 'public.od_save_contractor(uuid,jsonb)'::regprocedure] loop
    d := pg_get_functiondef(fn);
    n := replace(d, 'and org_id=_org;', 'and org_id=_org and archived_at is null for update;');
    if n=d then raise exception 'Expected editable row not found: %', fn; end if;
    execute n;
  end loop;
end $migration$;

create function public.od_archive(_org uuid, _what text, _id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d org_docs; c org_contractors;
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولًا' using errcode='42501'; end if;
  if _what='docs' then
    select * into d from org_docs where org_id=_org and id=_id for update;
    if not found or not _od_ok(_org, case when d.school_id is null then '{}'::uuid[] else array[d.school_id] end, 'edit', false) then
      raise exception 'لا تملك صلاحية النقل إلى الأرشيف' using errcode='42501'; end if;
    update org_docs set archived_at=now(), archived_by=auth.uid() where id=d.id and archived_at is null;
  elsif _what='contractors' then
    select * into c from org_contractors where org_id=_org and id=_id for update;
    if not found or not _od_ok(_org, c.school_ids, 'edit', true) then
      raise exception 'لا تملك صلاحية النقل إلى الأرشيف' using errcode='42501'; end if;
    update org_contractors set archived_at=now(), archived_by=auth.uid() where id=c.id and archived_at is null;
  else raise exception 'نوع غير معروف'; end if;
end $$;

create function public.od_archive_list(_org uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'سجّل الدخول أولًا' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(r.item order by r.archived_at desc, r.id) from (
    select d.archived_at, d.id, (to_jsonb(d) - 'org_id' - 'created_by' - 'updated_by' - 'archived_by') || jsonb_build_object(
      'record_type','docs','school',s.name,'status',_od_status(d.expires_on),'file_name',f.name,
      'can_download',_od_ok(d.org_id, sc.ids, 'download', false)) as item
    from org_docs d cross join lateral (select case when d.school_id is null then '{}'::uuid[] else array[d.school_id] end as ids) sc
    left join schools s on s.id=d.school_id left join files f on f.id=d.file_id
    where d.org_id=_org and d.archived_at is not null and _od_ok(d.org_id, sc.ids, 'view', false)
    union all
    select c.archived_at, c.id, (to_jsonb(c) - 'org_id' - 'created_by' - 'updated_by' - 'archived_by' - 'file_ids') || jsonb_build_object(
      'record_type','contractors','status',_od_status(c.ends_on),
      'schools',(select coalesce(jsonb_agg(s.name order by s.name),'[]'::jsonb) from schools s where s.id=any(c.school_ids)),
      'files',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name) order by f.name),'[]'::jsonb) from files f where f.id=any(c.file_ids)),
      'can_download',_od_ok(c.org_id, c.school_ids, 'download', false))
    from org_contractors c where c.org_id=_org and c.archived_at is not null and _od_ok(c.org_id, c.school_ids, 'view', false)
  ) r),'[]'::jsonb);
end $$;
revoke all on function public.od_archive(uuid,text,uuid), public.od_archive_list(uuid) from public, anon;
grant execute on function public.od_archive(uuid,text,uuid), public.od_archive_list(uuid) to authenticated;