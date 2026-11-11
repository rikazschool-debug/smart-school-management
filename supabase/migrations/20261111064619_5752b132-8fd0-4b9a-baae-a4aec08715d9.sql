-- WhatsApp inbox: contact card, tags, internal notes, quick replies (all RPC-only)
create table public.wa_conv_tags(
  conversation_id uuid not null references public.wa_conversations(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(name) between 1 and 40),
  wati_sync text not null default 'pending' check (wati_sync in ('pending','ok','failed')),
  wati_error text, added_by uuid, added_at timestamptz not null default now(),
  primary key (conversation_id, name));
create table public.wa_notes(
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.wa_conversations(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 4000),
  author uuid not null, created_at timestamptz not null default now());
create index on public.wa_notes(conversation_id, created_at);
create table public.wa_quick_replies(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 60),
  body text not null check (length(btrim(body)) between 1 and 4000),
  is_active boolean not null default true,
  created_by uuid, updated_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
grant all on public.wa_conv_tags, public.wa_notes, public.wa_quick_replies to service_role;
alter table public.wa_conv_tags enable row level security;
alter table public.wa_notes enable row level security;
alter table public.wa_quick_replies enable row level security;

create or replace function public._wa_conv_ok(_conv uuid) returns public.wa_conversations language plpgsql stable security definer set search_path to 'public' as $$
declare c wa_conversations;
begin
  select * into c from wa_conversations where id=_conv;
  if not found or _wa_access(c) is null then raise exception 'غير مصرح' using errcode='42501'; end if;
  return c;
end $$;

-- contact card: everything filtered by the caller's own rights
create or replace function public.wa_contact_card(_conv uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare c wa_conversations; tail text;
begin
  c := _wa_conv_ok(_conv);
  tail := right(regexp_replace(coalesce(c.wa_id,''),'\D','','g'), 9);
  return jsonb_build_object(
    'access', _wa_access(c), 'name', c.contact_name, 'phone', c.wa_id, 'contact_id', c.contact_id,
    'wati_status', c.wati_status, 'contact_owner', c.contact_owner, 'contact_teams', to_jsonb(c.contact_teams),
    'assignee', (select jsonb_build_object('user_id', o.user_id, 'name', _adm_name(o.user_id)) from wa_operator_links o where o.org_id=c.org_id and o.wati_id=c.wati_assignee),
    'assignee_code', c.wati_assignee,
    'branches', coalesce((select jsonb_agg(distinct s.name) from wa_team_links t join schools s on s.id=t.school_id where t.org_id=c.org_id and t.wati_id = any(c.wati_team_ids)), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(distinct jsonb_build_object('id', st.id, 'name', st.full_name, 'school', sc.name, 'relationship', sg.relationship))
        from guardians g join student_guardians sg on sg.guardian_id=g.id join students st on st.id=sg.student_id join schools sc on sc.id=st.school_id
        where length(tail)=9 and sc.org_id=c.org_id and right(regexp_replace(coalesce(g.phone,''),'\D','','g'),9)=tail and can_view_student(st.id, st.school_id)), '[]'::jsonb),
    'tickets', case when is_platform_admin() then coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'ref', t.ref, 'title', t.title, 'status', t.status) order by t.created_at desc)
        from (select t.* from support_tickets t join guardians g on g.user_id=t.requester join schools sc on sc.id=g.school_id
              where length(tail)=9 and sc.org_id=c.org_id and right(regexp_replace(coalesce(g.phone,''),'\D','','g'),9)=tail order by t.created_at desc limit 10) t), '[]'::jsonb) else null end,
    'tags', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'sync', wati_sync, 'error', wati_error) order by added_at) from wa_conv_tags where conversation_id=c.id), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'by', _adm_name(n.author), 'at', n.created_at) order by n.created_at desc) from wa_notes n where n.conversation_id=c.id), '[]'::jsonb));
end $$;

create or replace function public.wa_note_add(_conv uuid, _body text) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare c wa_conversations; rid uuid;
begin
  c := _wa_conv_ok(_conv);
  if length(btrim(coalesce(_body,''))) = 0 then raise exception 'اكتب الملاحظة'; end if;
  insert into wa_notes(conversation_id, org_id, body, author) values (c.id, c.org_id, btrim(_body), auth.uid()) returning id into rid;
  return rid;
end $$;

create or replace function public.wa_tag_set(_conv uuid, _name text, _on boolean) returns void language plpgsql security definer set search_path to 'public' as $$
declare c wa_conversations; n text := btrim(coalesce(_name,''));
begin
  c := _wa_conv_ok(_conv);
  if length(n) = 0 or length(n) > 40 then raise exception 'اسم الوسم غير صالح'; end if;
  if _on then insert into wa_conv_tags(conversation_id, org_id, name, added_by) values (c.id, c.org_id, n, auth.uid()) on conflict do nothing;
  else delete from wa_conv_tags where conversation_id=c.id and name=n; end if;
  insert into access_audit(org_id, actor, action, after, reason) values (c.org_id, auth.uid(), case when _on then 'wa_tag_add' else 'wa_tag_remove' end, jsonb_build_object('conversation', c.id, 'tag', n), null);
end $$;

-- service-only: record the WATI push result for a tag
create or replace function public._wa_tag_sync(_conv uuid, _name text, _ok boolean, _err text) returns void language sql security definer set search_path to 'public' as $$
  update wa_conv_tags set wati_sync = case when _ok then 'ok' else 'failed' end, wati_error = left(_err, 300) where conversation_id=_conv and name=_name $$;

create or replace function public.wa_quick_list(_org uuid) returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not wa_org_ok(_org) then raise exception 'غير مصرح' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'body', body, 'is_active', is_active) order by title)
    from wa_quick_replies where org_id=_org and (is_active or _wa_can(_org))), '[]'::jsonb);
end $$;

create or replace function public.wa_quick_save(_org uuid, _id uuid, _title text, _body text, _active boolean) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare rid uuid;
begin
  if not _wa_can(_org) then raise exception 'الردود الجاهزة يديرها مالك المجموعة فقط' using errcode='42501'; end if;
  if _id is null then
    insert into wa_quick_replies(org_id, title, body, is_active, created_by, updated_by) values (_org, btrim(_title), btrim(_body), coalesce(_active,true), auth.uid(), auth.uid()) returning id into rid;
  else
    update wa_quick_replies set title=btrim(_title), body=btrim(_body), is_active=coalesce(_active,is_active), updated_by=auth.uid(), updated_at=now() where id=_id and org_id=_org returning id into rid;
    if rid is null then raise exception 'غير موجود'; end if;
  end if;
  return rid;
end $$;

revoke all on function public._wa_conv_ok(uuid), public._wa_tag_sync(uuid,text,boolean,text) from public, anon, authenticated;
grant execute on function public._wa_tag_sync(uuid,text,boolean,text) to service_role;
revoke all on function public.wa_contact_card(uuid), public.wa_note_add(uuid,text), public.wa_tag_set(uuid,text,boolean), public.wa_quick_list(uuid), public.wa_quick_save(uuid,uuid,text,text,boolean) from public, anon;
grant execute on function public.wa_contact_card(uuid), public.wa_note_add(uuid,text), public.wa_tag_set(uuid,text,boolean), public.wa_quick_list(uuid), public.wa_quick_save(uuid,uuid,text,text,boolean) to authenticated;