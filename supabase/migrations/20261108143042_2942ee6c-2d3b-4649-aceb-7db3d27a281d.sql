
-- Bulk access: separate "this school, this capacity" from "whole-organization login", with a server preview of the effect.
create or replace function public.pp_bulk(_key uuid, _school uuid, _kind text, _ids uuid[], _action text, _tag uuid default null, _reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); o uuid := school_org(_school); op pp_ops; res jsonb := '[]'; i uuid; r record; s text; st text; msg text; m record; nok int := 0; nref int := 0; nfail int := 0; rsn text := nullif(btrim(coalesce(_reason,'')),''); hit boolean;
begin
  if me is null or o is null then raise exception 'ليست لديك صلاحية لهذا الإجراء'; end if;
  if _kind not in ('teacher','student','guardian') or _action not in ('tag_add','tag_remove','account_on','account_off','org_login_on','org_login_off') then raise exception 'إجراء غير معروف'; end if;
  if not (is_org_owner(o) or perm_allows(_school,'people','bulk')) then raise exception 'ليست لديك صلاحية لهذا الإجراء'; end if;
  if _ids is null or cardinality(_ids) = 0 or cardinality(_ids) > 2000 then raise exception 'حدد من 1 إلى 2000 سجل'; end if;
  if _action not like 'tag_%' and rsn is null then raise exception 'السبب مطلوب'; end if;
  if _action in ('tag_add','tag_remove') and _tag is null then raise exception 'اختر الوسم'; end if;
  insert into pp_ops(org_id,school_id,actor,client_key,kind,action,tag_id,reason,total) values(o,_school,me,_key,_kind,_action,_tag,rsn,cardinality(_ids))
    on conflict (actor,client_key) do nothing returning * into op;
  if op.id is null then
    select * into op from pp_ops where actor=me and client_key=_key;
    return jsonb_build_object('repeat',true,'ok',op.ok,'refused',op.refused,'failed',op.failed,'results',op.results);
  end if;
  foreach i in array (select array_agg(distinct x) from unnest(_ids) x) loop
    st := 'ok'; msg := '';
    begin
      select * into r from _pp_rec(_kind,i);
      if r.org is null or not (_school = any(r.schools)) then st := 'refused'; msg := 'خارج نطاق المدرسة';
      elsif _action in ('tag_add','tag_remove') then
        s := _pp_tag_apply(_kind,i,_tag,_action='tag_add'); st := split_part(s,':',1); msg := substr(s, length(st)+2);
      elsif not is_org_owner(o) then st := 'refused'; msg := 'تعليق الوصول وإيقاف الدخول لمالك المجموعة فقط';
      elsif r.uid is null then st := 'refused'; msg := 'لا يوجد حساب دخول مرتبط';
      elsif r.uid = me then st := 'refused'; msg := 'لا يمكنك تطبيق هذا على حسابك';
      elsif _action in ('account_on','account_off') then
        -- this school + this capacity only
        msg := 'لا تغيير'; hit := false;
        for m in select id, is_active from memberships where user_id=r.uid and school_id=_school and role::text=_kind loop
          hit := true;
          if m.is_active <> (_action='account_on') then perform set_membership_active(m.id, _action='account_on', rsn); msg := ''; end if;
        end loop;
        if not hit then st := 'refused'; msg := 'لا توجد عضوية بهذه الصفة في المدرسة'; end if;
      elsif _action = 'org_login_off' then
        if exists(select 1 from memberships where user_id=r.uid and org_id=o and role='org_owner') then st := 'refused'; msg := 'لا يُوقف دخول مالك المجموعة من هنا';
        else
          msg := 'لا تغيير';
          for m in select id from memberships where user_id=r.uid and org_id=o and is_active loop
            perform set_membership_active(m.id, false, '[org_login] ' || rsn); msg := '';
          end loop;
        end if;
      else -- org_login_on: restore only what an organization-level stop paused
        msg := 'لا تغيير';
        for m in select x.id from memberships x where x.user_id=r.uid and x.org_id=o and not x.is_active
                 and (select a.reason from access_audit a where a.target_membership=x.id and a.action in ('membership_activate','membership_deactivate') order by a.created_at desc, a.id desc limit 1) like '[org_login]%' loop
          perform set_membership_active(m.id, true, '[org_login] ' || rsn); msg := '';
        end loop;
      end if;
    exception when others then st := 'failed'; msg := SQLERRM;
    end;
    if st='ok' then nok := nok+1; elsif st='refused' then nref := nref+1; else nfail := nfail+1; end if;
    res := res || jsonb_build_object('id',i,'status',st,'reason',nullif(msg,''));
  end loop;
  update pp_ops set results=res, ok=nok, refused=nref, failed=nfail where id=op.id;
  return jsonb_build_object('repeat',false,'ok',nok,'refused',nref,'failed',nfail,'results',res);
end $$;

-- Read-only effect preview shown in the confirmation window (owner only, no writes).
create or replace function public.pp_access_preview(_school uuid, _kind text, _ids uuid[], _action text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare o uuid := school_org(_school); uids uuid[]; nrec int; nlogin int; nmem int; nother int; nroles int;
begin
  if auth.uid() is null or o is null or not is_org_owner(o) then raise exception 'ليست لديك صلاحية لهذا الإجراء'; end if;
  if _action not in ('account_on','account_off','org_login_on','org_login_off') or cardinality(_ids) > 2000 then raise exception 'إجراء غير معروف'; end if;
  select count(*), array_agg(r.uid) filter (where r.uid is not null and _school = any(r.schools))
    into nrec, uids from unnest(_ids) x, lateral _pp_rec(_kind, x) r;
  nlogin := coalesce(cardinality(uids),0);
  if _action in ('account_on','account_off') then
    select count(*) into nmem from memberships where user_id = any(coalesce(uids,'{}')) and school_id=_school and role::text=_kind and is_active = (_action='account_off');
    nother := 0; nroles := 0;
  else
    select count(*) filter (where is_active = (_action='org_login_off')),
           count(distinct school_id) filter (where school_id<>_school),
           count(distinct role) filter (where role::text<>_kind)
      into nmem, nother, nroles from memberships where user_id = any(coalesce(uids,'{}')) and org_id=o;
  end if;
  return jsonb_build_object('records',nrec,'with_login',nlogin,'without_login',nrec-nlogin,'memberships',coalesce(nmem,0),'other_schools',coalesce(nother,0),'other_roles',coalesce(nroles,0));
end $$;
revoke all on function public.pp_access_preview(uuid,text,uuid[],text) from public, anon;
grant execute on function public.pp_access_preview(uuid,text,uuid[],text) to authenticated;
