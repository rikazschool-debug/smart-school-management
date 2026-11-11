-- 1) permission actions
CREATE OR REPLACE FUNCTION public._perm_catalog_v18()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select jsonb_set(b, '{sections}', (b->'sections') || jsonb_build_array(
    jsonb_build_object('key','wa_inbox','label','واتساب — المحادثات','parent','support',
      'actions',jsonb_build_array('mine','branch','transfer_branch','transfer_org'),'scopes',jsonb_build_array('branch','org'),
      'labels',jsonb_build_object('mine','محادثاتي (المسندة إليّ في WATI)','branch','محادثات الفرع (فرق WATI المربوطة بالفرع)',
        'transfer_branch','تحويل المحادثة داخل الفرع','transfer_org','تحويل المحادثة بين الفروع'))))
  from (select _perm_catalog_v17() b offset 0) x $function$;

-- 2) WATI identity needed to transfer
ALTER TABLE public.wa_operator_links ADD COLUMN IF NOT EXISTS wati_email text;
ALTER TABLE public.wa_team_links ADD COLUMN IF NOT EXISTS wati_name text;

CREATE OR REPLACE FUNCTION public.wa_link_operator_email(_code text, _email text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare o uuid := _wa_org(); b text; e text := lower(nullif(trim(_email),''));
begin
  if not _wa_can(o) then raise exception 'forbidden'; end if;
  if e is not null and e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'بريد غير صالح'; end if;
  select wati_email into b from wa_operator_links where org_id=o and wati_id=_code;
  if not found then raise exception 'اربط الكود بموظف أولًا'; end if;
  update wa_operator_links set wati_email=e, updated_by=auth.uid(), updated_at=now() where org_id=o and wati_id=_code;
  insert into access_audit(org_id, actor, action, before, after) values (o, auth.uid(), 'wa_operator_email', jsonb_build_object('code',_code,'email',b), jsonb_build_object('code',_code,'email',e));
end $function$;

CREATE OR REPLACE FUNCTION public.wa_link_team_name(_code text, _name text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare o uuid := _wa_org(); b text; n text := nullif(trim(_name),'');
begin
  if not _wa_can(o) then raise exception 'forbidden'; end if;
  select wati_name into b from wa_team_links where org_id=o and wati_id=_code;
  if not found then raise exception 'اربط الفريق بفرع أولًا'; end if;
  update wa_team_links set wati_name=n, updated_by=auth.uid(), updated_at=now() where org_id=o and wati_id=_code;
  insert into access_audit(org_id, actor, action, before, after) values (o, auth.uid(), 'wa_team_name', jsonb_build_object('code',_code,'name',b), jsonb_build_object('code',_code,'name',n));
end $function$;
REVOKE ALL ON FUNCTION public.wa_link_operator_email(text,text), public.wa_link_team_name(text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.wa_link_operator_email(text,text), public.wa_link_team_name(text,text) TO authenticated;

-- 3) transfers log (RPC-only)
CREATE TABLE public.wa_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id),
  actor uuid NOT NULL,
  client_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('operator','team')),
  scope text NOT NULL CHECK (scope IN ('owner','branch','cross')),
  target_code text NOT NULL,
  target_user uuid,
  target_school uuid REFERENCES public.schools(id),
  from_schools uuid[] NOT NULL DEFAULT '{}',
  before jsonb NOT NULL,
  observed jsonb,
  note text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','failed','unknown')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX wa_transfers_conv ON public.wa_transfers(conversation_id, created_at DESC);
GRANT ALL ON public.wa_transfers TO service_role;
ALTER TABLE public.wa_transfers ENABLE ROW LEVEL SECURITY;

-- branches a staff user works in (within org)
CREATE OR REPLACE FUNCTION public._wa_user_schools(_org uuid, _uid uuid)
 RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select coalesce(array_agg(distinct m.school_id),'{}') from memberships m join schools s on s.id=m.school_id
  where m.user_id=_uid and m.is_active and not coalesce(m.branch_suspended,false) and s.org_id=_org and s.is_active and m.role not in ('student','guardian') $$;

-- current branches of a conversation: linked teams + current assignee's branches
CREATE OR REPLACE FUNCTION public._wa_conv_schools(c wa_conversations)
 RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select coalesce(array_agg(distinct x),'{}') from (
   select t.school_id x from wa_team_links t where t.org_id=c.org_id and t.wati_id=any(c.wati_team_ids)
   union select unnest(_wa_user_schools(c.org_id, l.user_id)) from wa_operator_links l where l.org_id=c.org_id and l.wati_id=c.wati_assignee) q where x is not null $$;

-- scope check for moving c into target school; null = refused
CREATE OR REPLACE FUNCTION public._wa_transfer_scope(c wa_conversations, _target uuid)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare src uuid[] := _wa_conv_schools(c);
begin
  if _wa_access(c) is null then return null; end if;
  if not exists(select 1 from schools s where s.id=_target and s.org_id=c.org_id and s.is_active) then return null; end if;
  if _wa_can(c.org_id) then return 'owner'; end if;
  if _target = any(src) and _perm_allows_user(_target, auth.uid(), 'wa_inbox', 'transfer_branch') then return 'branch'; end if;
  if exists(select 1 from unnest(src) s where _perm_allows_user(s, auth.uid(), 'wa_inbox', 'transfer_org')) then
    return case when _target = any(src) then 'branch' else 'cross' end; end if;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.wa_transfer_options(_conv uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare c wa_conversations := _wa_conv_ok(_conv); src uuid[] := _wa_conv_schools(c); br jsonb; pend jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'current', s.id = any(src),
      'operators', coalesce((select jsonb_agg(jsonb_build_object('code', l.wati_id, 'name', _adm_name(l.user_id), 'ready', l.wati_email is not null, 'current', l.wati_id=c.wati_assignee) order by _adm_name(l.user_id))
          from wa_operator_links l where l.org_id=c.org_id and s.id = any(_wa_user_schools(c.org_id, l.user_id))), '[]'::jsonb),
      'teams', coalesce((select jsonb_agg(jsonb_build_object('code', t.wati_id, 'name', coalesce(t.wati_name, t.label, t.wati_id), 'ready', t.wati_name is not null, 'current', t.wati_id=any(c.wati_team_ids)))
          from wa_team_links t where t.org_id=c.org_id and t.school_id=s.id), '[]'::jsonb)) order by s.name), '[]'::jsonb) into br
    from schools s where s.org_id=c.org_id and s.is_active and _wa_transfer_scope(c, s.id) is not null;
  select to_jsonb(x) into pend from (select id, status, error, kind, created_at from wa_transfers where conversation_id=c.id and status in ('pending','unknown') order by created_at desc limit 1) x;
  return jsonb_build_object('branches', br, 'can', jsonb_array_length(br) > 0, 'unresolved', pend);
end $function$;

CREATE OR REPLACE FUNCTION public.wa_transfer_begin(_conv uuid, _school uuid, _kind text, _code text, _note text, _key text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
    select l.user_id, l.wati_email into tu, em from wa_operator_links l where l.org_id=c.org_id and l.wati_id=_code and _school = any(_wa_user_schools(c.org_id, l.user_id));
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
end $function$;

-- service-only: what the server must send to WATI
CREATE OR REPLACE FUNCTION public._wa_transfer_job(_id uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ select jsonb_build_object('id', t.id, 'status', t.status, 'kind', t.kind, 'code', t.target_code, 'actor', t.actor,
   'conv', c.id, 'wati_conv_id', c.wati_conv_id, 'wa_id', c.wa_id, 'last_at', c.last_at, 'created_at', t.created_at,
   'email', (select wati_email from wa_operator_links where org_id=t.org_id and wati_id=t.target_code),
   'team_name', (select wati_name from wa_team_links where org_id=t.org_id and wati_id=t.target_code))
  from wa_transfers t join wa_conversations c on c.id=t.conversation_id where t.id=_id $$;

-- service-only: record the WATI-verified result
CREATE OR REPLACE FUNCTION public._wa_transfer_finish(_id uuid, _status text, _error text, _observed jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare t wa_transfers; c wa_conversations; na text; nt text[];
begin
  if _status not in ('done','failed','unknown') then raise exception 'bad status'; end if;
  select * into t from wa_transfers where id=_id for update;
  if not found then raise exception 'not found'; end if;
  if t.status in ('done','failed') then return jsonb_build_object('status', t.status); end if;
  update wa_transfers set status=_status, error=left(_error,500), observed=_observed, finished_at=case when _status='unknown' then null else now() end where id=_id;
  if _observed is not null then
    select * into c from wa_conversations where id=t.conversation_id for update;
    na := nullif(_observed->>'assignee_id','');
    nt := coalesce((select array_agg(x order by x) from jsonb_array_elements_text(coalesce(_observed->'team_ids','[]'::jsonb)) x), '{}');
    if c.wati_assignee is distinct from na or c.wati_team_ids is distinct from nt then
      insert into wa_assign_log(conversation_id, before, after) values (c.id, jsonb_build_object('assignee', c.wati_assignee, 'teams', c.wati_team_ids), jsonb_build_object('assignee', na, 'teams', nt, 'transfer', t.id));
      update wa_conversations set wati_assignee=na, wati_team_ids=nt, assign_seen_at=now() where id=c.id;
    end if;
  end if;
  if _status = 'done' and t.note is not null then
    insert into wa_notes(conversation_id, org_id, body, author) values (t.conversation_id, t.org_id, '[تحويل] ' || t.note, t.actor);
  end if;
  if _status <> 'unknown' then
    insert into access_audit(org_id, school_id, actor, action, target_user, before, after, reason)
      values (t.org_id, t.target_school, t.actor, 'wa_transfer_'||_status, t.target_user, t.before || jsonb_build_object('schools', t.from_schools),
        jsonb_build_object('kind', t.kind, 'code', t.target_code, 'school', t.target_school, 'observed', _observed, 'error', _error, 'transfer', t.id), t.note);
  end if;
  insert into live_signals(topic, user_id) select 'wa', u from _wa_live_users(t.org_id) u;
  return jsonb_build_object('status', _status);
end $function$;

-- caller-visible state of one transfer (actor or anyone still with access to the chat)
CREATE OR REPLACE FUNCTION public.wa_transfer_get(_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare t wa_transfers; c wa_conversations;
begin
  select * into t from wa_transfers where id=_id;
  if not found then raise exception 'غير مصرح'; end if;
  select * into c from wa_conversations where id=t.conversation_id;
  if t.actor <> auth.uid() and _wa_access(c) is null then raise exception 'غير مصرح'; end if;
  return jsonb_build_object('id', t.id, 'status', t.status, 'error', t.error, 'actor', t.actor = auth.uid(), 'access', _wa_access(c));
end $function$;

CREATE OR REPLACE FUNCTION public.wa_transfer_log(_conv uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare c wa_conversations := _wa_conv_ok(_conv);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'at', t.created_at, 'by', _adm_name(t.actor), 'kind', t.kind, 'scope', t.scope, 'status', t.status, 'error', t.error, 'note', t.note,
      'from_user', (select _adm_name((t.before->>'assignee_user')::uuid)), 'to_user', case when t.target_user is not null then _adm_name(t.target_user) end,
      'to_team', (select coalesce(wati_name,label) from wa_team_links where org_id=t.org_id and wati_id=t.target_code and t.kind='team'),
      'from_schools', (select jsonb_agg(name) from schools where id=any(t.from_schools)), 'to_school', (select name from schools where id=t.target_school)) order by t.created_at desc)
    from (select * from wa_transfers where conversation_id=c.id order by created_at desc limit 20) t), '[]'::jsonb);
end $function$;

REVOKE ALL ON FUNCTION public._wa_transfer_job(uuid), public._wa_transfer_finish(uuid,text,text,jsonb), public._wa_user_schools(uuid,uuid), public._wa_conv_schools(wa_conversations), public._wa_transfer_scope(wa_conversations,uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._wa_transfer_job(uuid), public._wa_transfer_finish(uuid,text,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.wa_transfer_options(uuid), public.wa_transfer_begin(uuid,uuid,text,text,text,text), public.wa_transfer_get(uuid), public.wa_transfer_log(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.wa_transfer_options(uuid), public.wa_transfer_begin(uuid,uuid,text,text,text,text), public.wa_transfer_get(uuid), public.wa_transfer_log(uuid) TO authenticated;