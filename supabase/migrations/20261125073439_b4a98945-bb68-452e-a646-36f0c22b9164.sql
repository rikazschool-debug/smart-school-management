create table public.wa_tag_defs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);
grant all on public.wa_tag_defs to service_role;
alter table public.wa_tag_defs enable row level security;

insert into public.wa_tag_defs(org_id, name)
select distinct org_id, name from public.wa_conv_tags on conflict do nothing;

create or replace function public.wa_tag_defs_list(_org uuid)
returns table(id uuid, name text) language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not (_wa_can(_org) or _wa_perm_any(_org, auth.uid(), 'mine')
     or exists(select 1 from schools s where s.org_id=_org and s.is_active and _perm_allows_user(s.id, auth.uid(), 'wa_inbox', 'branch')))
  then raise exception 'غير مصرح' using errcode='42501'; end if;
  return query select d.id, d.name from wa_tag_defs d where d.org_id=_org order by d.name;
end $$;

create or replace function public.wa_tag_def_save(_org uuid, _id uuid, _name text)
returns uuid language plpgsql security definer set search_path=public as $$
declare n text := btrim(coalesce(_name,'')); old text; rid uuid;
begin
  if not _wa_can(_org) then raise exception 'إدارة الوسوم لمدير النظام فقط' using errcode='42501'; end if;
  if length(n)=0 or length(n)>40 then raise exception 'اسم الوسم غير صالح'; end if;
  if _id is null then
    insert into wa_tag_defs(org_id,name,created_by) values(_org,n,auth.uid()) returning id into rid;
  else
    select name into old from wa_tag_defs where id=_id and org_id=_org for update;
    if not found then raise exception 'الوسم غير موجود'; end if;
    update wa_tag_defs set name=n, updated_at=now() where id=_id returning id into rid;
    update wa_conv_tags set name=n where org_id=_org and name=old;
  end if;
  insert into access_audit(org_id, actor, action, after, reason) values (_org, auth.uid(), 'wa_tagdef_save', jsonb_build_object('id',rid,'name',n,'old',old), null);
  return rid;
exception when unique_violation then raise exception 'يوجد وسم بهذا الاسم';
end $$;

create or replace function public.wa_tag_def_delete(_org uuid, _id uuid)
returns void language plpgsql security definer set search_path=public as $$
declare n text;
begin
  if not _wa_can(_org) then raise exception 'إدارة الوسوم لمدير النظام فقط' using errcode='42501'; end if;
  delete from wa_tag_defs where id=_id and org_id=_org returning name into n;
  if n is null then raise exception 'الوسم غير موجود'; end if;
  delete from wa_conv_tags where org_id=_org and name=n;
  insert into access_audit(org_id, actor, action, after, reason) values (_org, auth.uid(), 'wa_tagdef_delete', jsonb_build_object('id',_id,'name',n), null);
end $$;

create or replace function public.wa_tag_set(_conv uuid, _name text, _on boolean)
returns void language plpgsql security definer set search_path=public as $$
declare c wa_conversations; n text := btrim(coalesce(_name,''));
begin
  c := _wa_conv_ok(_conv);
  if length(n) = 0 or length(n) > 40 then raise exception 'اسم الوسم غير صالح'; end if;
  if _on then
    if not exists(select 1 from wa_tag_defs where org_id=c.org_id and name=n) then
      raise exception 'اختر وسمًا من القائمة المعتمدة؛ إنشاء الوسوم لمدير النظام فقط'; end if;
    insert into wa_conv_tags(conversation_id, org_id, name, added_by) values (c.id, c.org_id, n, auth.uid()) on conflict do nothing;
  else delete from wa_conv_tags where conversation_id=c.id and name=n; end if;
  insert into access_audit(org_id, actor, action, after, reason) values (c.org_id, auth.uid(), case when _on then 'wa_tag_add' else 'wa_tag_remove' end, jsonb_build_object('conversation', c.id, 'tag', n), null);
end $$;

revoke all on function public.wa_tag_defs_list(uuid), public.wa_tag_def_save(uuid,uuid,text), public.wa_tag_def_delete(uuid,uuid) from public, anon;
grant execute on function public.wa_tag_defs_list(uuid), public.wa_tag_def_save(uuid,uuid,text), public.wa_tag_def_delete(uuid,uuid) to authenticated;

drop policy if exists "comm settings insert" on public.comm_settings;
drop policy if exists "comm settings update" on public.comm_settings;
create policy "comm settings insert" on public.comm_settings for insert to authenticated
  with check (is_org_owner((select org_id from schools where id=school_id)));
create policy "comm settings update" on public.comm_settings for update to authenticated
  using (is_org_owner((select org_id from schools where id=school_id)))
  with check (is_org_owner((select org_id from schools where id=school_id)) and edit_window_minutes between 0 and 1440);