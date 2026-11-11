CREATE TABLE public.wa_wati_operators(
  org_id uuid NOT NULL, wati_id text NOT NULL, full_name text, email text, is_bot boolean NOT NULL DEFAULT false,
  seen_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(org_id, wati_id));
GRANT ALL ON public.wa_wati_operators TO service_role;
ALTER TABLE public.wa_wati_operators ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public._wa_operator_emails(_ops jsonb)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$
declare o uuid := _wa_org(); n int := 0; it jsonb;
begin
  for it in select * from jsonb_array_elements(coalesce(_ops,'[]'::jsonb)) loop
    insert into wa_wati_operators(org_id, wati_id, full_name, email, is_bot, seen_at)
      values (o, it->>'id', nullif(trim(it->>'name'),''), nullif(trim(it->>'email'),''), coalesce((it->>'bot')::boolean,false), now())
      on conflict (org_id, wati_id) do update set full_name=excluded.full_name, email=excluded.email, is_bot=excluded.is_bot, seen_at=now();
    update wa_operator_links set wati_email = nullif(trim(it->>'email'),'')
      where org_id=o and wati_id=it->>'id' and wati_email is distinct from nullif(trim(it->>'email'),'');
    if found then n := n + 1; end if;
  end loop;
  delete from wa_wati_operators w where w.org_id=o and not exists(select 1 from jsonb_array_elements(_ops) x where x->>'id'=w.wati_id);
  update wa_operator_links set wati_email=null where org_id=o and wati_email is not null
    and not exists(select 1 from jsonb_array_elements(coalesce(_ops,'[]'::jsonb)) x where x->>'id'=wati_id and coalesce(x->>'email','')<>'');
  return n;
end $f$;
REVOKE ALL ON FUNCTION public._wa_operator_emails(jsonb) FROM PUBLIC, anon, authenticated;

-- operators codes enriched with WATI names; operators with no chats yet are listed too
ALTER FUNCTION public.wa_codes() RENAME TO _wa_codes_base;
REVOKE ALL ON FUNCTION public._wa_codes_base() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.wa_codes()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
declare o uuid := _wa_org(); b jsonb := _wa_codes_base(); ops jsonb;
begin
  select coalesce(jsonb_agg(x.v order by x.cnt desc, x.v->>'wati_name'), '[]'::jsonb) into ops from (
    select e || jsonb_build_object('wati_name', w.full_name, 'is_bot', coalesce(w.is_bot,false), 'in_wati', w.wati_id is not null) v, (e->>'count')::int cnt
      from jsonb_array_elements(b->'operators') e left join wa_wati_operators w on w.org_id=o and w.wati_id=e->>'code'
    union all
    select jsonb_build_object('code', w.wati_id, 'count', 0, 'user_id', l.user_id, 'email', l.wati_email,
        'user_name', case when l.user_id is not null then _adm_name(l.user_id) end, 'samples', '[]'::jsonb,
        'wati_name', w.full_name, 'is_bot', w.is_bot, 'in_wati', true), 0
      from wa_wati_operators w left join wa_operator_links l on l.org_id=o and l.wati_id=w.wati_id
      where w.org_id=o and not exists(select 1 from jsonb_array_elements(b->'operators') e where e->>'code'=w.wati_id)) x;
  return jsonb_set(b, '{operators}', ops);
end $f$;
GRANT EXECUTE ON FUNCTION public.wa_codes() TO authenticated;

-- central administration as a transfer destination (uses the org id as its key)
CREATE OR REPLACE FUNCTION public._wa_user_central(_org uuid, _uid uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ select exists(select 1 from hr_employees e join hr_assignments a on a.employee_id=e.id
    where e.user_id=_uid and e.org_id=_org and a.is_primary and a.school_id is null and a.start_date<=current_date and (a.end_date is null or a.end_date>=current_date))
  or exists(select 1 from memberships m where m.user_id=_uid and m.org_id=_org and m.school_id is null and m.is_active and m.role not in ('student','guardian')) $f$;
REVOKE ALL ON FUNCTION public._wa_user_central(uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._wa_transfer_scope(c wa_conversations, _target uuid)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
declare src uuid[] := _wa_conv_schools(c);
begin
  if _wa_access(c) is null then return null; end if;
  if _target = c.org_id then
    if _wa_can(c.org_id) then return 'owner'; end if;
    if exists(select 1 from unnest(src) s where _perm_allows_user(s, auth.uid(), 'wa_inbox', 'transfer_org')) then return 'cross'; end if;
    return null;
  end if;
  if not exists(select 1 from schools s where s.id=_target and s.org_id=c.org_id and s.is_active) then return null; end if;
  if _wa_can(c.org_id) then return 'owner'; end if;
  if _target = any(src) and _perm_allows_user(_target, auth.uid(), 'wa_inbox', 'transfer_branch') then return 'branch'; end if;
  if exists(select 1 from unnest(src) s where _perm_allows_user(s, auth.uid(), 'wa_inbox', 'transfer_org')) then
    return case when _target = any(src) then 'branch' else 'cross' end; end if;
  return null;
end $f$;

CREATE OR REPLACE FUNCTION public._wa_op_in(_org uuid, _uid uuid, _place uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ select case when _place=_org then _wa_user_central(_org,_uid) else _place = any(_wa_user_schools(_org,_uid)) end $f$;
REVOKE ALL ON FUNCTION public._wa_op_in(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.wa_transfer_options(_conv uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
declare c wa_conversations := _wa_conv_ok(_conv); src uuid[] := _wa_conv_schools(c); br jsonb; pend jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'current', p.id = any(src),
      'operators', coalesce((select jsonb_agg(jsonb_build_object('code', l.wati_id, 'name', _adm_name(l.user_id), 'ready', l.wati_email is not null, 'current', l.wati_id=c.wati_assignee) order by _adm_name(l.user_id))
          from wa_operator_links l where l.org_id=c.org_id and _wa_op_in(c.org_id, l.user_id, p.id)), '[]'::jsonb),
      'teams', coalesce((select jsonb_agg(jsonb_build_object('code', t.wati_id, 'name', coalesce(t.wati_name, t.label, t.wati_id), 'ready', t.wati_name is not null, 'current', t.wati_id=any(c.wati_team_ids)))
          from wa_team_links t where t.org_id=c.org_id and t.school_id=p.id), '[]'::jsonb)) order by p.ord, p.name), '[]'::jsonb) into br
    from (select c.org_id id, 'الإدارة المركزية'::text name, 0 ord union all
          select s.id, s.name, 1 from schools s where s.org_id=c.org_id and s.is_active) p
    where _wa_transfer_scope(c, p.id) is not null;
  select to_jsonb(x) into pend from (select id, status, error, kind, created_at from wa_transfers where conversation_id=c.id and status in ('pending','unknown') order by created_at desc limit 1) x;
  return jsonb_build_object('branches', br, 'can', jsonb_array_length(br) > 0, 'unresolved', pend);
end $f$;

CREATE OR REPLACE FUNCTION public.wa_transfer_begin(_conv uuid, _school uuid, _kind text, _code text, _note text, _key text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$
declare c wa_conversations; t wa_transfers; sc text; tu uuid; em text; tn text; n text := nullif(left(trim(coalesce(_note,'')),1000),'');
begin
  if coalesce(length(_key),0) not between 8 and 80 then raise exception 'bad key'; end if;
  select * into t from wa_transfers where client_key=_key;
  if found then
    if t.actor <> auth.uid() then raise exception 'غير مصرح'; end if;
    return jsonb_build_object('id', t.id, 'repeat', true, 'status', t.status);
  end if;
  c := _wa_conv_ok(_conv);
  perform 1 from wa_conversations where id=c.id for update;
  if exists(select 1 from wa_transfers where conversation_id=c.id and status in ('pending','unknown')) then
    raise exception 'يوجد تحويل لم تتأكد نتيجته بعد، تحقّق منه أولًا'; end if;
  sc := _wa_transfer_scope(c, _school);
  if sc is null then raise exception 'غير مصرح بالتحويل إلى هذا الفرع' using errcode='42501'; end if;
  if _kind = 'operator' then
    select l.user_id, l.wati_email into tu, em from wa_operator_links l where l.org_id=c.org_id and l.wati_id=_code and _wa_op_in(c.org_id, l.user_id, _school);
    if tu is null then raise exception 'الموظف غير مرتبط بـWATI في هذا الفرع'; end if;
    if em is null then raise exception 'لم يُسجَّل بريد هذا الموظف في WATI'; end if;
    if _code = c.wati_assignee then raise exception 'المحادثة مسندة لهذا الموظف أصلًا'; end if;
  elsif _kind = 'team' then
    select t2.wati_name into tn from wa_team_links t2 where t2.org_id=c.org_id and t2.wati_id=_code and t2.school_id=_school;
    if not found then raise exception 'الفريق غير مرتبط بهذا الفرع'; end if;
    if tn is null then raise exception 'لم يُسجَّل اسم هذا الفريق في WATI'; end if;
  else raise exception 'bad kind'; end if;
  insert into wa_transfers(org_id, conversation_id, actor, client_key, kind, scope, target_code, target_user, target_school, from_schools, before, note)
    values (c.org_id, c.id, auth.uid(), _key, _kind, sc, _code, tu, _school, _wa_conv_schools(c),
      jsonb_build_object('assignee', c.wati_assignee, 'assignee_user', (select user_id from wa_operator_links where org_id=c.org_id and wati_id=c.wati_assignee), 'teams', c.wati_team_ids), n)
    returning * into t;
  return jsonb_build_object('id', t.id, 'repeat', false, 'status', t.status);
end $f$;

CREATE OR REPLACE FUNCTION public.wa_transfer_log(_conv uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
declare c wa_conversations := _wa_conv_ok(_conv);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'at', t.created_at, 'by', _wa_who(t.actor), 'kind', t.kind, 'scope', t.scope, 'status', t.status, 'error', t.error, 'note', t.note,
      'from_user', _wa_who((t.before->>'assignee_user')::uuid), 'to_user', _wa_who(t.target_user),
      'to_team', (select coalesce(wati_name,label) from wa_team_links where org_id=t.org_id and wati_id=t.target_code and t.kind='team'),
      'from_schools', (select jsonb_agg(name) from schools where id=any(t.from_schools)),
      'to_school', case when t.target_school=t.org_id then 'الإدارة المركزية' else (select name from schools where id=t.target_school) end) order by t.created_at desc)
    from (select * from wa_transfers where conversation_id=c.id order by created_at desc limit 20) t), '[]'::jsonb);
end $f$;