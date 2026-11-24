-- VPS-only adoption of the existing phone/first-login hotfix. No user rows are changed.
-- Historical migrations and ledger rows remain immutable.
-- Owner correction is an explicitly approved administrative prerequisite, NOT hidden here.
-- The clean final replay must retain newer shared function bodies, never reinstall the old hotfix.
-- Match catalog.sql name formatting; pg_catalog remains first for built-ins.
CREATE FUNCTION pg_temp.rk_phone_hotfix_state() RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,public,pg_temp AS $rk_state$
SELECT jsonb_build_object('objects',(SELECT jsonb_object_agg(v.identity,o.hash)FROM(VALUES ('public._idl_issue(_nid text, _code text)'),('public._idl_verify(_challenge uuid, _code text)'),('public.id_login_challenges.activated_at'),('public.id_login_challenges.activation'),('public.id_login_challenges.guardian_id'),('public.id_login_challenges.teacher_id'),('public._idl_resolve_staged_guardian(_nid text)'),('public._idl_resolve_staged_teacher(_nid text)'),('public._preserve_login_phone()'),('public.id_login_challenges_activated_user'),('public.guardians.preserve_login_phone'),('public.hr_employees.preserve_login_phone'),('public.org_owner_identity.preserve_login_phone'),('public.teachers.preserve_login_phone'))v(identity)LEFT JOIN(SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' identity,md5(pg_get_functiondef(p.oid)||':'||pg_get_userbyid(p.proowner))hash FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname IN('_idl_issue','_idl_verify','_idl_resolve_staged_guardian','_idl_resolve_staged_teacher','_preserve_login_phone') UNION ALL SELECT n.nspname||'.'||c.relname||'.'||a.attname,md5(jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity,'generated',a.attgenerated,'ordinal',a.attnum)::text)FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname='public'AND c.relname='id_login_challenges'AND a.attnum>0 AND NOT a.attisdropped UNION ALL SELECT n.nspname||'.'||c.relname,md5(pg_get_indexdef(c.oid)||':'||i.indisvalid::text||':'||i.indisready::text)FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND c.relname='id_login_challenges_activated_user' UNION ALL SELECT n.nspname||'.'||c.relname||'.'||t.tgname,md5(pg_get_triggerdef(t.oid,true)||':'||t.tgenabled::text)FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'AND t.tgname='preserve_login_phone')o USING(identity)), 'privileges',(SELECT coalesce(jsonb_agg(jsonb_build_object('object',object_name,'grantor',grantor,'grantee',grantee,'privilege',privilege,'grantable',grantable)ORDER BY object_name,grantor,grantee,privilege),'[]'::jsonb)FROM(SELECT n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'object_name,pg_get_userbyid(x.grantor)grantor,CASE WHEN x.grantee=0 THEN'PUBLIC'ELSE pg_get_userbyid(x.grantee)END grantee,x.privilege_type privilege,x.is_grantable grantable FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))x WHERE n.nspname='public'AND p.proname IN('_idl_issue','_idl_verify','_idl_resolve_staged_guardian','_idl_resolve_staged_teacher','_preserve_login_phone'))acl));
$rk_state$;

DO $rk_adopt$
DECLARE observed jsonb:=pg_temp.rk_phone_hotfix_state();
 baseline constant jsonb:=$rk_baseline${"objects":{"public._idl_issue(_nid text, _code text)":"6c070f76a28ab7abbbcfba5e86477021","public._idl_verify(_challenge uuid, _code text)":"c8906bffb890ed267e1e16003c1dd21e","public.id_login_challenges.activated_at":null,"public.id_login_challenges.activation":null,"public.id_login_challenges.guardian_id":null,"public.id_login_challenges.teacher_id":null,"public._idl_resolve_staged_guardian(_nid text)":null,"public._idl_resolve_staged_teacher(_nid text)":null,"public._preserve_login_phone()":null,"public.id_login_challenges_activated_user":null,"public.guardians.preserve_login_phone":null,"public.hr_employees.preserve_login_phone":null,"public.org_owner_identity.preserve_login_phone":null,"public.teachers.preserve_login_phone":null},"privileges":[{"grantable":false,"grantee":"postgres","grantor":"postgres","object":"public._idl_issue(_nid text, _code text)","privilege":"EXECUTE"},{"grantable":false,"grantee":"service_role","grantor":"postgres","object":"public._idl_issue(_nid text, _code text)","privilege":"EXECUTE"},{"grantable":false,"grantee":"postgres","grantor":"postgres","object":"public._idl_verify(_challenge uuid, _code text)","privilege":"EXECUTE"},{"grantable":false,"grantee":"service_role","grantor":"postgres","object":"public._idl_verify(_challenge uuid, _code text)","privilege":"EXECUTE"}]}$rk_baseline$::jsonb;
 adopted constant jsonb:=$rk_adopted${"objects":{"public._idl_issue(_nid text, _code text)":"34de3014b251df055ed5545717038c04","public._idl_verify(_challenge uuid, _code text)":"f4ed793780468ba778c4710ee41b4b37","public.id_login_challenges.activated_at":"4bc877917c20f10b3f38e1bd71fccbb7","public.id_login_challenges.activation":"3b26cae8ed3dda30acca6e176fb26f5d","public.id_login_challenges.guardian_id":"c2ae2f1dc2fdb46988ac449be0bdc1c7","public.id_login_challenges.teacher_id":"feaba9d682867122c38310932e54c60b","public._idl_resolve_staged_guardian(_nid text)":"3c44032f4af114cf90dfb9aafc140ed3","public._idl_resolve_staged_teacher(_nid text)":"fa698e8a9fa74420523c6f3ad48301b4","public._preserve_login_phone()":"a3067daf369c30e345a8a60d61527fc2","public.id_login_challenges_activated_user":"7d7a81019821903a23b33632b7fea6be","public.guardians.preserve_login_phone":"0f3ab8abb9118e7ff133d8770ee228f7","public.hr_employees.preserve_login_phone":"0b73202f2e77ff04026f6db485920b2a","public.org_owner_identity.preserve_login_phone":"ba957614da2fc60340915030beec69ed","public.teachers.preserve_login_phone":"80775b4b85f81b4bc82b6aac94ccf5d8"},"privileges":[{"grantable":false,"grantee":"postgres","grantor":"postgres","object":"public._idl_issue(_nid text, _code text)","privilege":"EXECUTE"},{"grantable":false,"grantee":"service_role","grantor":"postgres","object":"public._idl_issue(_nid text, _code text)","privilege":"EXECUTE"},{"grantable":false,"grantee":"postgres","grantor":"postgres","object":"public._idl_resolve_staged_guardian(_nid text)","privilege":"EXECUTE"},{"grantable":false,"grantee":"service_role","grantor":"postgres","object":"public._idl_resolve_staged_guardian(_nid text)","privilege":"EXECUTE"},{"grantable":false,"grantee":"postgres","grantor":"postgres","object":"public._idl_resolve_staged_teacher(_nid text)","privilege":"EXECUTE"},{"grantable":false,"grantee":"service_role","grantor":"postgres","object":"public._idl_resolve_staged_teacher(_nid text)","privilege":"EXECUTE"},{"grantable":false,"grantee":"postgres","grantor":"postgres","object":"public._idl_verify(_challenge uuid, _code text)","privilege":"EXECUTE"},{"grantable":false,"grantee":"service_role","grantor":"postgres","object":"public._idl_verify(_challenge uuid, _code text)","privilege":"EXECUTE"},{"grantable":false,"grantee":"postgres","grantor":"postgres","object":"public._preserve_login_phone()","privilege":"EXECUTE"},{"grantable":false,"grantee":"service_role","grantor":"postgres","object":"public._preserve_login_phone()","privilege":"EXECUTE"}]}$rk_adopted$::jsonb;
 canonical constant jsonb:=$rk_canonical${"objects":{"public._idl_issue(_nid text, _code text)":"7da3b8e4a20be7b44b2d6ae1c684bd84","public._idl_verify(_challenge uuid, _code text)":"e399811bb660419564d4846ed86bdd74","public.id_login_challenges.activated_at":"4bc877917c20f10b3f38e1bd71fccbb7","public.id_login_challenges.activation":"3b26cae8ed3dda30acca6e176fb26f5d","public.id_login_challenges.guardian_id":"c2ae2f1dc2fdb46988ac449be0bdc1c7","public.id_login_challenges.teacher_id":"feaba9d682867122c38310932e54c60b","public._idl_resolve_staged_guardian(_nid text)":"e5ade269cc6fe23f4bb58c4621e35951","public._idl_resolve_staged_teacher(_nid text)":"b03e84e1aaa6d8b918ca34ed3ec5086f","public._preserve_login_phone()":"7c98adfbca320e55f7671798bc52b00f","public.id_login_challenges_activated_user":"7d7a81019821903a23b33632b7fea6be","public.guardians.preserve_login_phone":"0f3ab8abb9118e7ff133d8770ee228f7","public.hr_employees.preserve_login_phone":"0b73202f2e77ff04026f6db485920b2a","public.org_owner_identity.preserve_login_phone":"ba957614da2fc60340915030beec69ed","public.teachers.preserve_login_phone":"80775b4b85f81b4bc82b6aac94ccf5d8"},"privileges":[{"grantable":false,"grantee":"postgres","grantor":"postgres","object":"public._idl_issue(_nid text, _code text)","privilege":"EXECUTE"},{"grantable":false,"grantee":"service_role","grantor":"postgres","object":"public._idl_issue(_nid text, _code text)","privilege":"EXECUTE"},{"grantable":false,"grantee":"postgres","grantor":"postgres","object":"public._idl_resolve_staged_guardian(_nid text)","privilege":"EXECUTE"},{"grantable":false,"grantee":"service_role","grantor":"postgres","object":"public._idl_resolve_staged_guardian(_nid text)","privilege":"EXECUTE"},{"grantable":false,"grantee":"postgres","grantor":"postgres","object":"public._idl_resolve_staged_teacher(_nid text)","privilege":"EXECUTE"},{"grantable":false,"grantee":"service_role","grantor":"postgres","object":"public._idl_resolve_staged_teacher(_nid text)","privilege":"EXECUTE"},{"grantable":false,"grantee":"postgres","grantor":"postgres","object":"public._idl_verify(_challenge uuid, _code text)","privilege":"EXECUTE"},{"grantable":false,"grantee":"service_role","grantor":"postgres","object":"public._idl_verify(_challenge uuid, _code text)","privilege":"EXECUTE"},{"grantable":false,"grantee":"postgres","grantor":"postgres","object":"public._preserve_login_phone()","privilege":"EXECUTE"},{"grantable":false,"grantee":"service_role","grantor":"postgres","object":"public._preserve_login_phone()","privilege":"EXECUTE"}]}$rk_canonical$::jsonb;
BEGIN
 IF observed=adopted OR observed=canonical THEN RETURN;END IF;
 IF observed<>baseline THEN RAISE EXCEPTION 'Unrecognized phone-login schema or privileges; stop for review';END IF;
 -- Only an empty historical replay reaches this branch; production adopts the exact existing state.
 EXECUTE $rk_ddl$ALTER TABLE public.id_login_challenges ADD COLUMN activation boolean DEFAULT false NOT NULL;$rk_ddl$;
 EXECUTE $rk_ddl$ALTER TABLE public.id_login_challenges ADD COLUMN guardian_id uuid;$rk_ddl$;
 EXECUTE $rk_ddl$ALTER TABLE public.id_login_challenges ADD COLUMN teacher_id uuid;$rk_ddl$;
 EXECUTE $rk_ddl$ALTER TABLE public.id_login_challenges ADD COLUMN activated_at timestamp with time zone;$rk_ddl$;
 EXECUTE $rk_ddl$CREATE OR REPLACE FUNCTION public._idl_issue(_nid text, _code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare h text := _idl_hash(coalesce(_idl_nid(_nid),'')); r record; s record; last_at timestamptz; n int; cid uuid;
  act boolean := false; gid uuid; tid uuid; uid uuid; ph text;
begin
  -- serialise concurrent requests for the same ID so the cooldown cannot be raced
  perform pg_advisory_xact_lock(hashtextextended('idl:' || h, 0));
  select max(created_at), count(*) into last_at, n from id_login_challenges where nid_hash = h and created_at > now() - interval '15 minutes';
  if last_at is not null and last_at > now() - interval '60 seconds' then return jsonb_build_object('error','cooldown'); end if;
  if n >= 3 then return jsonb_build_object('error','too_many'); end if;
  select * into r from _idl_resolve(_nid);
  if r.problem = 'no_account' then
    select * into s from _idl_resolve_staged_guardian(_nid);
    if s.problem = 'no_account' then
      select * into s from _idl_resolve_staged_teacher(_nid);
      if s.problem is not null then return jsonb_build_object('error', s.problem); end if;
      act := true; uid := s.user_id; ph := s.phone; tid := s.teacher_id;
    elsif s.problem is not null then return jsonb_build_object('error', s.problem);
    else act := true; uid := s.user_id; ph := s.phone; gid := s.guardian_id;
    end if;
  elsif r.problem is not null then return jsonb_build_object('error', r.problem);
  else uid := r.user_id; ph := r.phone;
  end if;
  update id_login_challenges set used_at = now() where nid_hash = h and used_at is null;
  insert into id_login_challenges(nid_hash, user_id, phone, code_hash, expires_at, activation, guardian_id, teacher_id)
    values (h, uid, ph, '', now() + interval '5 minutes', act, gid, tid) returning id into cid;
  update id_login_challenges set code_hash = _idl_hash(cid::text || ':' || _code) where id = cid;
  return jsonb_build_object('challenge', cid, 'user_id', uid, 'phone', ph, 'activation', act);
end $function$;$rk_ddl$;
 EXECUTE $rk_ddl$REVOKE ALL ON FUNCTION public._idl_issue(_nid text, _code text) FROM PUBLIC, anon, authenticated;$rk_ddl$;
 EXECUTE $rk_ddl$GRANT EXECUTE ON FUNCTION public._idl_issue(_nid text, _code text) TO service_role;$rk_ddl$;
 EXECUTE $rk_ddl$CREATE OR REPLACE FUNCTION public._idl_resolve_staged_guardian(_nid text)
 RETURNS TABLE(user_id uuid, phone text, guardian_id uuid, problem text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare n text := _idl_nid(_nid); uids uuid[]; gids uuid[]; phones text[]; auth_phone text;
begin
  if n is null or n !~ '^[12]\d{9}$' then return query select null::uuid, null::text, null::uuid, 'invalid'; return; end if;
  -- all staged logins for this ID decide which school record is meant (must be exactly one record)
  select array_agg(distinct a.subject_id) into gids
    from account_setup a join guardians g on g.id = a.subject_id
   where a.kind = 'guardian' and a.need_phone and a.completed_at is null
     and g.user_id is null and _idl_nid(g.national_id) = n;
  if coalesce(array_length(gids,1),0) = 0 then return query select null::uuid, null::text, null::uuid, 'no_account'; return; end if;
  -- a school that changes the mobile re-stages a new login for the same record; older staged logins with the old mobile are ignored
  select array_agg(distinct a.user_id) into uids
    from account_setup a join guardians g on g.id = a.subject_id join auth.users u on u.id = a.user_id
   where a.kind = 'guardian' and a.need_phone and a.completed_at is null
     and g.user_id is null and _idl_nid(g.national_id) = n
     and _idl_phone(g.phone) is not null and _idl_phone(u.phone) = _idl_phone(g.phone);
  if array_length(gids,1) > 1 then return query select null::uuid, null::text, null::uuid, 'conflict_account'; return; end if;
  if coalesce(array_length(uids,1),0) = 0 then return query select null::uuid, null::text, null::uuid,
    case when exists(select 1 from guardians x where _idl_nid(x.national_id) = n and _idl_phone(x.phone) is not null) then 'conflict_phone' else 'no_phone' end; return; end if;
  if array_length(uids,1) > 1 or array_length(gids,1) > 1 then return query select null::uuid, null::text, null::uuid, 'conflict_account'; return; end if;
  -- every school record with this ID must agree on one mobile; the code goes only there
  select array_agg(distinct _idl_phone(g.phone)) filter (where _idl_phone(g.phone) is not null) into phones
    from guardians g where _idl_nid(g.national_id) = n;
  if coalesce(array_length(phones,1),0) = 0 then return query select null::uuid, null::text, null::uuid, 'no_phone'; return; end if;
  if array_length(phones,1) > 1 then return query select null::uuid, null::text, null::uuid, 'conflict_phone'; return; end if;
  -- the staged login must carry that same mobile (it was created from the record); otherwise refuse
  select _idl_phone(u.phone) into auth_phone from auth.users u where u.id = uids[1];
  if auth_phone is distinct from phones[1] then return query select null::uuid, null::text, null::uuid, 'conflict_phone'; return; end if;
  return query select uids[1], phones[1], gids[1], null::text;
end $function$;$rk_ddl$;
 EXECUTE $rk_ddl$REVOKE ALL ON FUNCTION public._idl_resolve_staged_guardian(_nid text) FROM PUBLIC, anon, authenticated;$rk_ddl$;
 EXECUTE $rk_ddl$GRANT EXECUTE ON FUNCTION public._idl_resolve_staged_guardian(_nid text) TO service_role;$rk_ddl$;
 EXECUTE $rk_ddl$CREATE OR REPLACE FUNCTION public._idl_resolve_staged_teacher(_nid text)
 RETURNS TABLE(user_id uuid, phone text, teacher_id uuid, problem text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare n text := _idl_nid(_nid); uids uuid[]; tids uuid[]; phones text[]; auth_phone text;
begin
  if n is null or n !~ '^[12]\d{9}$' then return query select null::uuid, null::text, null::uuid, 'invalid'; return; end if;
  -- all staged logins for this ID decide which school record is meant (must be exactly one record)
  select array_agg(distinct a.subject_id) into tids
    from account_setup a join teachers t on t.id = a.subject_id
   where a.kind = 'teacher' and a.need_phone and not a.need_password and a.completed_at is null
     and t.user_id is null and _idl_nid(t.national_id) = n;
  if coalesce(array_length(tids,1),0) = 0 then return query select null::uuid, null::text, null::uuid, 'no_account'; return; end if;
  -- a school that changes the mobile re-stages a new login for the same record; older staged logins with the old mobile are ignored
  select array_agg(distinct a.user_id) into uids
    from account_setup a join teachers t on t.id = a.subject_id join auth.users u on u.id = a.user_id
   where a.kind = 'teacher' and a.need_phone and not a.need_password and a.completed_at is null
     and t.user_id is null and _idl_nid(t.national_id) = n
     and _idl_phone(t.phone) is not null and _idl_phone(u.phone) = _idl_phone(t.phone);
  if array_length(tids,1) > 1 then return query select null::uuid, null::text, null::uuid, 'conflict_account'; return; end if;
  if coalesce(array_length(uids,1),0) = 0 then return query select null::uuid, null::text, null::uuid,
    case when exists(select 1 from teachers x where _idl_nid(x.national_id) = n and _idl_phone(x.phone) is not null) then 'conflict_phone' else 'no_phone' end; return; end if;
  if array_length(uids,1) > 1 or array_length(tids,1) > 1 then return query select null::uuid, null::text, null::uuid, 'conflict_account'; return; end if;
  select array_agg(distinct _idl_phone(t.phone)) filter (where _idl_phone(t.phone) is not null) into phones
    from teachers t where _idl_nid(t.national_id) = n;
  if coalesce(array_length(phones,1),0) = 0 then return query select null::uuid, null::text, null::uuid, 'no_phone'; return; end if;
  if array_length(phones,1) > 1 then return query select null::uuid, null::text, null::uuid, 'conflict_phone'; return; end if;
  select _idl_phone(u.phone) into auth_phone from auth.users u where u.id = uids[1];
  if auth_phone is distinct from phones[1] then return query select null::uuid, null::text, null::uuid, 'conflict_phone'; return; end if;
  return query select uids[1], phones[1], tids[1], null::text;
end $function$;$rk_ddl$;
 EXECUTE $rk_ddl$REVOKE ALL ON FUNCTION public._idl_resolve_staged_teacher(_nid text) FROM PUBLIC, anon, authenticated;$rk_ddl$;
 EXECUTE $rk_ddl$GRANT EXECUTE ON FUNCTION public._idl_resolve_staged_teacher(_nid text) TO service_role;$rk_ddl$;
 EXECUTE $rk_ddl$CREATE OR REPLACE FUNCTION public._idl_verify(_challenge uuid, _code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare c id_login_challenges; a account_setup; g guardians; t teachers; st text; login_nid text; kind text; rec_user uuid; rec_phone text; rec_nid text;
begin
  select * into c from id_login_challenges where id = _challenge for update;
  if not found then return jsonb_build_object('error','invalid'); end if;
  if c.used_at is not null then return jsonb_build_object('error','used'); end if;
  if c.expires_at < now() then return jsonb_build_object('error','expired'); end if;
  if c.attempts >= 5 then return jsonb_build_object('error','locked'); end if;
  if c.code_hash <> _idl_hash(c.id::text || ':' || coalesce(_code,'')) then
    update id_login_challenges set attempts = attempts + 1, used_at = case when attempts + 1 >= 5 then now() end where id = c.id;
    return jsonb_build_object('error', case when c.attempts + 1 >= 5 then 'locked' else 'wrong' end);
  end if;
  update id_login_challenges set used_at = now() where id = c.id;

  if not c.activation then
    -- existing path; flag only users activated by this flow who still lack a login email (retry after a failed email step)
    return jsonb_build_object('user_id', c.user_id,
      'needs_login_email', exists(select 1 from id_login_challenges x where x.user_id = c.user_id and x.activated_at is not null)
                            and exists(select 1 from auth.users u where u.id = c.user_id and u.email is null),
      'login_nid', coalesce((select _idl_nid(gg.national_id) from guardians gg where gg.user_id = c.user_id limit 1),
                            (select _idl_nid(tt.national_id) from teachers tt where tt.user_id = c.user_id limit 1)),
      'login_kind', case when exists(select 1 from guardians gg where gg.user_id = c.user_id) then 'guardian' else 'teacher' end);
  end if;

  -- activation: lock the staged row and the school record, then re-check everything against the challenge
  select * into a from account_setup where user_id = c.user_id for update;
  if c.guardian_id is not null then
    select * into g from guardians where id = c.guardian_id for update;
    if g.id is null then return jsonb_build_object('error','not_found'); end if;
    kind := 'guardian'; rec_user := g.user_id; rec_phone := g.phone; rec_nid := g.national_id;
  else
    select * into t from teachers where id = c.teacher_id for update;
    if t.id is null then return jsonb_build_object('error','not_found'); end if;
    kind := 'teacher'; rec_user := t.user_id; rec_phone := t.phone; rec_nid := t.national_id;
  end if;
  if rec_user is not null and rec_user <> c.user_id then return jsonb_build_object('error','conflict_account'); end if;
  if _idl_phone(rec_phone) is distinct from c.phone then return jsonb_build_object('error','conflict_phone'); end if;
  if a.user_id is null or a.kind <> kind or a.subject_id <> coalesce(c.guardian_id, c.teacher_id) then return jsonb_build_object('error','no_account'); end if;
  if a.completed_at is null then
    if a.need_password then return jsonb_build_object('error','no_account'); end if;
    -- the code reached the school-record mobile: that is the phone confirmation
    update auth.users set phone_confirmed_at = coalesce(phone_confirmed_at, now())
     where id = c.user_id and _idl_phone(phone) = c.phone;
    if not found then return jsonb_build_object('error','conflict_phone'); end if;
    st := _complete_account_setup(c.user_id, false);  -- links the record's user_id, activates memberships, writes access_audit
    if st <> 'done' then raise exception 'activation failed'; end if;
  end if;
  update id_login_challenges set activated_at = now() where id = c.id;
  login_nid := _idl_nid(rec_nid);
  return jsonb_build_object('user_id', c.user_id, 'activated', true, 'login_kind', kind,
    'needs_login_email', exists(select 1 from auth.users u where u.id = c.user_id and u.email is null), 'login_nid', login_nid);
end $function$;$rk_ddl$;
 EXECUTE $rk_ddl$REVOKE ALL ON FUNCTION public._idl_verify(_challenge uuid, _code text) FROM PUBLIC, anon, authenticated;$rk_ddl$;
 EXECUTE $rk_ddl$GRANT EXECUTE ON FUNCTION public._idl_verify(_challenge uuid, _code text) TO service_role;$rk_ddl$;
 EXECUTE $rk_ddl$CREATE OR REPLACE FUNCTION public._preserve_login_phone()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  uid uuid; candidates uuid[]; previous text; target text; current_phone text;
BEGIN
  previous := public._idl_phone(OLD.phone);
  target := public._idl_phone(NEW.phone);
  IF previous IS NOT DISTINCT FROM target THEN RETURN NEW; END IF;
  IF target IS NULL THEN
    RAISE EXCEPTION 'جوال سعودي صحيح مطلوب لتغيير رقم الدخول' USING ERRCODE='22023';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'لا يمكن تغيير ارتباط الحساب مع تغيير الجوال' USING ERRCODE='22023';
  END IF;
  uid := OLD.user_id;
  -- A pending school account is not linked until first sign-in. Resolve it by
  -- the PREVIOUS phone, never by the requested phone (which could hijack a user).
  IF uid IS NULL AND TG_TABLE_NAME IN ('guardians','teachers') THEN
    SELECT array_agg(DISTINCT a.user_id) INTO candidates
    FROM public.account_setup a JOIN auth.users u ON u.id=a.user_id
    WHERE a.subject_id=OLD.id
      AND a.kind=CASE TG_TABLE_NAME WHEN 'guardians' THEN 'guardian' ELSE 'teacher' END
      AND a.completed_at IS NULL AND NOT a.need_password
      AND (public._idl_phone(u.phone)=previous OR
        (pg_trigger_depth()>1 AND public._idl_phone(u.phone)=target));
    IF coalesce(cardinality(candidates),0)>1 THEN
      RAISE EXCEPTION 'تعارض في الحسابات المجهزة؛ يلزم مراجعة الربط' USING ERRCODE='22023';
    END IF;
    uid := candidates[1];
    IF uid IS NULL AND EXISTS (
      SELECT 1 FROM public.account_setup a WHERE a.subject_id=OLD.id
      AND a.kind=CASE TG_TABLE_NAME WHEN 'guardians' THEN 'guardian' ELSE 'teacher' END
      AND a.completed_at IS NULL
    ) THEN
      RAISE EXCEPTION 'حساب التجهيز لا يطابق الجوال السابق؛ يلزم مراجعة الربط' USING ERRCODE='22023';
    END IF;
  END IF;
  -- No login exists yet: ordinary contact edit; this trigger never provisions.
  IF uid IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('login-phone:'||uid::text,0));
  SELECT public._idl_phone(phone) INTO current_phone FROM auth.users WHERE id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'حساب الدخول المرتبط غير موجود'; END IF;
  -- Cascades update other records belonging to this SAME user; they never
  -- recurse into another identity. A mismatch still fails closed.
  IF pg_trigger_depth()>1 THEN
    IF target IS DISTINCT FROM current_phone THEN RAISE EXCEPTION 'تعارض في مزامنة الجوال'; END IF;
    RETURN NEW;
  END IF;
  IF current_phone IS DISTINCT FROM previous AND current_phone IS DISTINCT FROM target THEN
    RAISE EXCEPTION 'جوال الحساب لا يطابق السجل؛ يلزم مراجعة الربط' USING ERRCODE='22023';
  END IF;
  -- Global auth uniqueness remains enforced by auth.users / auth.identities.
  IF EXISTS (SELECT 1 FROM auth.users WHERE id<>uid AND public._idl_phone(phone)=target) THEN
    RAISE EXCEPTION 'الجوال مرتبط بحساب آخر' USING ERRCODE='23505';
  END IF;
  UPDATE auth.users SET phone=target, phone_confirmed_at=NULL,
    phone_change='', phone_change_token='', phone_change_sent_at=NULL,
    updated_at=now() WHERE id=uid;
  -- Phone identities keep provider_id = user UID (live Auth representation);
  -- only the stored phone claim changes.
  UPDATE auth.identities SET
    identity_data=jsonb_set(identity_data,'{phone}',to_jsonb(target)), updated_at=now()
    WHERE user_id=uid AND provider='phone';
  -- Codes issued to the old phone must never remain usable.
  UPDATE public.id_login_challenges SET used_at=now() WHERE user_id=uid AND used_at IS NULL;
  -- Do not modify students, passwords, membership activation, roles, setup
  -- state, national IDs, school IDs or subject/user links.
  UPDATE public.guardians SET phone=target
    WHERE user_id=uid AND public._idl_phone(phone) IS DISTINCT FROM target;
  UPDATE public.teachers SET phone=target
    WHERE user_id=uid AND public._idl_phone(phone) IS DISTINCT FROM target;
  UPDATE public.hr_employees SET phone=target
    WHERE user_id=uid AND public._idl_phone(phone) IS DISTINCT FROM target;
  UPDATE public.org_owner_identity SET phone=target
    WHERE user_id=uid AND public._idl_phone(phone) IS DISTINCT FROM target;
  -- Pending siblings/other school records sharing this exact setup UID.
  UPDATE public.guardians g SET phone=target FROM public.account_setup a
    WHERE a.user_id=uid AND a.kind='guardian' AND a.subject_id=g.id
      AND g.user_id IS NULL AND public._idl_phone(g.phone) IS DISTINCT FROM target;
  UPDATE public.teachers t SET phone=target FROM public.account_setup a
    WHERE a.user_id=uid AND a.kind='teacher' AND a.subject_id=t.id
      AND t.user_id IS NULL AND public._idl_phone(t.phone) IS DISTINCT FROM target;
  RETURN NEW;
END $function$;$rk_ddl$;
 EXECUTE $rk_ddl$REVOKE ALL ON FUNCTION public._preserve_login_phone() FROM PUBLIC, anon, authenticated;$rk_ddl$;
 EXECUTE $rk_ddl$GRANT EXECUTE ON FUNCTION public._preserve_login_phone() TO service_role;$rk_ddl$;
 EXECUTE $rk_ddl$CREATE INDEX id_login_challenges_activated_user ON public.id_login_challenges USING btree (user_id) WHERE (activated_at IS NOT NULL);$rk_ddl$;
 EXECUTE $rk_ddl$CREATE TRIGGER preserve_login_phone AFTER UPDATE OF phone ON guardians FOR EACH ROW EXECUTE FUNCTION _preserve_login_phone();$rk_ddl$;
 EXECUTE $rk_ddl$CREATE TRIGGER preserve_login_phone AFTER UPDATE OF phone ON hr_employees FOR EACH ROW EXECUTE FUNCTION _preserve_login_phone();$rk_ddl$;
 EXECUTE $rk_ddl$CREATE TRIGGER preserve_login_phone AFTER UPDATE OF phone ON org_owner_identity FOR EACH ROW EXECUTE FUNCTION _preserve_login_phone();$rk_ddl$;
 EXECUTE $rk_ddl$CREATE TRIGGER preserve_login_phone AFTER UPDATE OF phone ON teachers FOR EACH ROW EXECUTE FUNCTION _preserve_login_phone();$rk_ddl$;
 IF pg_temp.rk_phone_hotfix_state()<>adopted THEN RAISE EXCEPTION 'Phone-login adoption reconstruction mismatch' USING DETAIL=pg_temp.rk_phone_hotfix_state()::text;END IF;
END
$rk_adopt$;
DROP FUNCTION pg_temp.rk_phone_hotfix_state();
