create or replace function public._pp_tags_manager(_org uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce(is_org_owner(_org) or perm_scope(_org, auth.uid(), 'people', 'tags_manage') = 'org', false) $$;
revoke all on function public._pp_tags_manager(uuid) from public, anon, authenticated;
create or replace function public.pp_tag_save(_org uuid, _id uuid, _name text, _color text, _kinds text[], _active boolean) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare n text := nullif(regexp_replace(btrim(coalesce(_name,'')),'\s+',' ','g'),''); r uuid;
begin
  if not _pp_tags_manager(_org) then raise exception 'ليست لديك صلاحية لهذا الإجراء'; end if;
  if n is null or length(n) > 40 then raise exception 'اسم الوسم مطلوب (حتى 40 حرفًا)'; end if;
  if _color is null or _color not in ('slate','red','amber','green','teal','blue','violet','pink') then raise exception 'لون غير معروف'; end if;
  if _kinds is null or cardinality(_kinds)=0 or not (_kinds <@ array['teacher','employee','student','guardian']) then raise exception 'اختر فئة واحدة على الأقل'; end if;
  if exists(select 1 from pp_tags where org_id=_org and lower(name)=lower(n) and id is distinct from _id) then raise exception 'يوجد وسم بالاسم نفسه'; end if;
  if _id is null then insert into pp_tags(org_id,name,color,kinds,active,created_by) values(_org,n,_color,_kinds,coalesce(_active,true),auth.uid()) returning id into r;
  else update pp_tags set name=n,color=_color,kinds=_kinds,active=coalesce(_active,true),updated_at=now() where id=_id and org_id=_org returning id into r;
    if r is null then raise exception 'الوسم غير موجود'; end if; end if;
  return r;
end $$;
create or replace function public.pp_caps(_school uuid) returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('view', coalesce(is_org_owner(school_org(_school)) or perm_allows(_school,'people','view'),false),
    'bulk', coalesce(is_org_owner(school_org(_school)) or perm_allows(_school,'people','bulk'),false),
    'export', coalesce(is_org_owner(school_org(_school)) or perm_allows(_school,'people','export'),false),
    'tags_assign', coalesce(is_org_owner(school_org(_school)) or perm_allows(_school,'people','tags_assign'),false),
    'accounts', coalesce(is_org_owner(school_org(_school)),false),
    'tags_manage', _pp_tags_manager(school_org(_school))) $$;