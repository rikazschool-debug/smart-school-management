CREATE TABLE public.org_owner_identity (
  user_id uuid PRIMARY KEY,
  national_id text,
  phone text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.org_owner_identity TO service_role;
ALTER TABLE public.org_owner_identity ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX org_owner_identity_nid ON public.org_owner_identity (public._idl_nid(national_id)) WHERE national_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public._idl_resolve(_nid text)
 RETURNS TABLE(user_id uuid, phone text, problem text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare n text := _idl_nid(_nid); uids uuid[]; phones text[]; raw_count int;
begin
  if n is null or n !~ '^[12]\d{9}$' then return query select null::uuid, null::text, 'invalid'; return; end if;
  with r as (
    select t.user_id, t.phone from teachers t where _idl_nid(t.national_id) = n
    union all select e.user_id, e.phone from hr_employees e where _idl_nid(e.national_id) = n and coalesce(e.status,'') <> 'terminated'
    union all select g.user_id, g.phone from guardians g where _idl_nid(g.national_id) = n
    union all select o.user_id, o.phone from org_owner_identity o where _idl_nid(o.national_id) = n
      and exists (select 1 from memberships m where m.user_id = o.user_id and m.role = 'org_owner' and m.is_active)
  )
  select array_agg(distinct r.user_id) filter (where r.user_id is not null),
         array_agg(distinct _idl_phone(r.phone)) filter (where _idl_phone(r.phone) is not null),
         count(*)
    into uids, phones, raw_count from r;
  if raw_count = 0 then return query select null::uuid, null::text, 'not_found'; return; end if;
  if coalesce(array_length(uids,1),0) = 0 then return query select null::uuid, null::text, 'no_account'; return; end if;
  if array_length(uids,1) > 1 then return query select null::uuid, null::text, 'conflict_account'; return; end if;
  if coalesce(array_length(phones,1),0) = 0 then return query select null::uuid, null::text, 'no_phone'; return; end if;
  if array_length(phones,1) > 1 then return query select null::uuid, null::text, 'conflict_phone'; return; end if;
  return query select uids[1], phones[1], null::text;
end $function$;

CREATE OR REPLACE FUNCTION public.platform_orgs()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((SELECT jsonb_agg(x ORDER BY (x->>'is_test')::boolean, x->>'name') FROM (
    SELECT jsonb_build_object(
      'id', o.id, 'name', o.name, 'is_active', o.is_active, 'created_at', o.created_at,
      'owners', coalesce((SELECT jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', public._adm_name(m.user_id), 'email', u.email, 'active', m.is_active,
                    'national_id', i.national_id, 'phone', i.phone))
                 FROM memberships m JOIN auth.users u ON u.id = m.user_id LEFT JOIN org_owner_identity i ON i.user_id = m.user_id
                 WHERE m.org_id = o.id AND m.role = 'org_owner'), '[]'::jsonb),
      'schools', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'city', s.city, 'is_active', s.is_active) ORDER BY s.name)
                 FROM schools s WHERE s.org_id = o.id), '[]'::jsonb),
      'is_test', NOT EXISTS (SELECT 1 FROM memberships m JOIN auth.users u ON u.id = m.user_id
                 WHERE m.org_id = o.id AND m.role = 'org_owner' AND u.email NOT LIKE '%.test')
    ) x FROM organizations o) t), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.platform_org_save(_org uuid, _name text, _owner uuid, _owner_name text, _nid text, _phone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n text := nullif(_idl_nid(_nid), ''); ph text := nullif(_idl_phone(_phone), ''); old jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE = '42501'; END IF;
  IF length(trim(coalesce(_name,''))) < 2 OR length(_name) > 150 THEN RAISE EXCEPTION 'اسم المؤسسة مطلوب'; END IF;
  UPDATE organizations SET name = trim(_name), updated_at = now() WHERE id = _org;
  IF NOT FOUND THEN RAISE EXCEPTION 'المؤسسة غير موجودة'; END IF;
  IF _owner IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM memberships WHERE org_id = _org AND user_id = _owner AND role = 'org_owner') THEN RAISE EXCEPTION 'هذا الشخص ليس مالك المؤسسة'; END IF;
  IF length(trim(coalesce(_owner_name,''))) < 2 OR length(_owner_name) > 120 THEN RAISE EXCEPTION 'اسم المالك مطلوب'; END IF;
  IF _nid IS NOT NULL AND trim(_nid) <> '' AND (n IS NULL OR n !~ '^[12]\d{9}$') THEN RAISE EXCEPTION 'رقم الهوية أو الإقامة يجب أن يكون 10 أرقام ويبدأ بـ1 أو 2'; END IF;
  IF _phone IS NOT NULL AND trim(_phone) <> '' AND ph IS NULL THEN RAISE EXCEPTION 'رقم الجوال غير صحيح'; END IF;
  IF n IS NOT NULL AND (
       EXISTS (SELECT 1 FROM teachers t WHERE _idl_nid(t.national_id) = n AND t.user_id IS DISTINCT FROM _owner)
    OR EXISTS (SELECT 1 FROM hr_employees e WHERE _idl_nid(e.national_id) = n AND coalesce(e.status,'') <> 'terminated' AND e.user_id IS DISTINCT FROM _owner)
    OR EXISTS (SELECT 1 FROM guardians g WHERE _idl_nid(g.national_id) = n AND g.user_id IS DISTINCT FROM _owner)
    OR EXISTS (SELECT 1 FROM org_owner_identity o WHERE _idl_nid(o.national_id) = n AND o.user_id <> _owner))
  THEN RAISE EXCEPTION 'رقم الهوية مسجل لشخص آخر'; END IF;
  SELECT to_jsonb(i) INTO old FROM org_owner_identity i WHERE user_id = _owner;
  UPDATE profiles SET full_name = trim(_owner_name), updated_at = now() WHERE id = _owner;
  INSERT INTO org_owner_identity(user_id, national_id, phone, updated_by) VALUES (_owner, n, ph, auth.uid())
    ON CONFLICT (user_id) DO UPDATE SET national_id = excluded.national_id, phone = excluded.phone, updated_by = auth.uid(), updated_at = now();
  PERFORM public._access_audit(_org, NULL, 'owner_identity_update', _owner, NULL, NULL,
    jsonb_build_object('has_nid', old->>'national_id' IS NOT NULL, 'has_phone', old->>'phone' IS NOT NULL),
    jsonb_build_object('has_nid', n IS NOT NULL, 'has_phone', ph IS NOT NULL), 'platform admin edit');
END $$;
REVOKE ALL ON FUNCTION public.platform_org_save(uuid, text, uuid, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_org_save(uuid, text, uuid, text, text, text) TO authenticated;