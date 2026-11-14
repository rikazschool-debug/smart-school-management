-- Active context (staff vs guardian/student) is chosen by the user and stored server-side; identity rules read it.
create table public.user_active_context(
  user_id uuid primary key,
  role text not null,
  school_id uuid,
  org_id uuid,
  updated_at timestamptz not null default now()
);
grant select on public.user_active_context to authenticated;
grant all on public.user_active_context to service_role;
alter table public.user_active_context enable row level security;
create policy "own context" on public.user_active_context for select to authenticated using (user_id = auth.uid());

create or replace function public.set_active_context(_role text, _school uuid) returns void language plpgsql security definer set search_path=public as $$
declare o uuid; begin
  if _role = 'platform_admin' then
    if not is_platform_admin() then raise exception 'سياق غير صالح'; end if;
  elsif not exists(select 1 from memberships m where m.user_id=auth.uid() and m.is_active and m.role::text=_role
        and (m.school_id is not distinct from _school or (m.role='org_owner' and (_school is null or exists(select 1 from schools s where s.id=_school and s.org_id=m.org_id))))) then
    raise exception 'سياق غير صالح';
  end if;
  select org_id into o from schools where id=_school;
  insert into user_active_context(user_id, role, school_id, org_id) values (auth.uid(), _role, _school, o)
    on conflict (user_id) do update set role=excluded.role, school_id=excluded.school_id, org_id=excluded.org_id, updated_at=now();
end $$;
revoke execute on function public.set_active_context(text,uuid) from public, anon;
grant execute on function public.set_active_context(text,uuid) to authenticated;

-- caller acts as staff of this school right now? guardian/student context (or no context while holding a family role) = no.
create or replace function public._ctx_staff(_org uuid, _school uuid) returns boolean language sql stable security definer set search_path=public as $$
  select _eligible_staff(_org, _school, auth.uid()) and coalesce(
    (select x.role not in ('guardian','student') and (x.role in ('org_owner','platform_admin') or x.school_id = _school) from user_active_context x where x.user_id=auth.uid()),
    not exists(select 1 from memberships m where m.user_id=auth.uid() and m.is_active and m.role in ('guardian','student')))
$$;

-- explicit reveal right: active staff context + live group membership with a staff reason or moderator role
create or replace function public._cg_viewer_staff(_conv uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from conversations c join conversation_members m on m.conversation_id=c.id and m.user_id=auth.uid() and m.left_at is null
    where c.id=_conv and c.school_id is not null and _ctx_staff(c.org_id, c.school_id)
      and (m.role in ('owner','moderator') or coalesce(m.reasons,'{}') && array['teacher','principal','manual']))
$$;

-- message carries the capacity it was sent in
alter table public.messages add column if not exists sent_as text;
update public.messages x set sent_as = case when _eligible_staff(c.org_id, c.school_id, x.sender_id) then 'staff' else 'family' end
  from conversations c where c.id=x.conversation_id and x.sent_as is null;

create or replace function public._msg_sent_as_trg() returns trigger language plpgsql security definer set search_path=public as $$
declare c record; begin
  select * into c from conversations where id=new.conversation_id;
  new.sent_as := case when _ctx_staff(c.org_id, c.school_id) then 'staff' else 'family' end;
  return new;
end $$;
drop trigger if exists msg_sent_as on public.messages;
create trigger msg_sent_as before insert on public.messages for each row execute function public._msg_sent_as_trg();

-- member/sender visibility (members: staff reason in group = public)
create or replace function public._cg_sender_visible(_conv uuid, _sender uuid) returns boolean language sql stable security definer set search_path=public as $$
  select _sender = auth.uid()
    or not _cg_private(_conv)
    or _cg_viewer_staff(_conv)
    or exists(select 1 from conversations c join conversation_members m on m.conversation_id=c.id and m.user_id=_sender and m.left_at is null
              where c.id=_conv and _eligible_staff(c.org_id, c.school_id, _sender)
                and (m.role in ('owner','moderator') or coalesce(m.reasons,'{}') && array['teacher','principal','manual']))
    or exists(select 1 from students st join student_guardians sg on sg.student_id=st.id and sg.verified and sg.can_follow
              join guardians g on g.id=sg.guardian_id where st.user_id=_sender and g.user_id=auth.uid())
$$;

-- per-message visibility uses the capacity at send time
create or replace function public._cg_msg_visible(_conv uuid, _sender uuid, _sent_as text) returns boolean language sql stable security definer set search_path=public as $$
  select _sender = auth.uid()
    or not _cg_private(_conv)
    or _cg_viewer_staff(_conv)
    or (coalesce(_sent_as,'family') = 'staff' and exists(select 1 from conversations c where c.id=_conv and _eligible_staff(c.org_id, c.school_id, _sender)))
    or exists(select 1 from students st join student_guardians sg on sg.student_id=st.id and sg.verified and sg.can_follow
              join guardians g on g.id=sg.guardian_id where st.user_id=_sender and g.user_id=auth.uid())
$$;
revoke execute on function public._ctx_staff(uuid,uuid), public._cg_msg_visible(uuid,uuid,text) from public, anon;
grant execute on function public._ctx_staff(uuid,uuid), public._cg_msg_visible(uuid,uuid,text) to authenticated;

drop policy if exists "messages read" on public.messages;
create policy "messages read" on public.messages for select to authenticated
  using (can_read_conv_at(conversation_id, created_at) and _cg_msg_visible(conversation_id, sender_id, sent_as));

create or replace function public._msg_file_row_ok(_file uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from files f where f.id=_file and (f.source_type<>'message' or f.uploaded_by=auth.uid()
    or exists(select 1 from messages m where m.id=f.source_id and _cg_msg_visible(m.conversation_id, m.sender_id, m.sent_as))))
$$;

create or replace function public._cg_generic_label2(_conv uuid, _user uuid) returns text language sql stable security definer set search_path=public as $$
  select case when 'guardian' = any(coalesce(m.reasons,'{}')) then 'ولي أمر' when 'student' = any(coalesce(m.reasons,'{}')) then 'طالب'
    when exists(select 1 from memberships x where x.user_id=_user and x.role='student') then 'طالب' else 'ولي أمر' end
  from (select 1) d left join conversation_members m on m.conversation_id=_conv and m.user_id=_user order by m.left_at nulls first limit 1
$$;
grant execute on function public._cg_generic_label2(uuid,uuid) to authenticated;

create or replace function public.conv_messages(_conv uuid, _before bigint default null, _limit int default 30)
returns table(id uuid, seq bigint, sender_id uuid, sender_name text, sender_label text, masked boolean, mine boolean, body text, reply_to uuid, created_at timestamptz, edited_at timestamptz, deleted_at timestamptz, pinned_at timestamptz, files jsonb)
language sql stable security definer set search_path=public as $$
  select x.id, x.seq,
    case when v.ok then x.sender_id end,
    case when x.sender_id=auth.uid() then 'أنت' when v.ok then coalesce(p.full_name,'مستخدم') else _cg_generic_label2(_conv, x.sender_id) end,
    case when v.ok and x.sender_id<>auth.uid() then (select _cg_label(m.reasons) from conversation_members m where m.conversation_id=_conv and m.user_id=x.sender_id order by m.left_at nulls first limit 1) end,
    not v.ok, x.sender_id=auth.uid(), x.body, x.reply_to, x.created_at, x.edited_at, x.deleted_at, x.pinned_at,
    coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'size_bytes',f.size_bytes,'storage_path',f.storage_path) order by f.created_at)
              from files f where f.source_type='message' and f.source_id=x.id and x.deleted_at is null), '[]'::jsonb)
  from messages x
  cross join lateral (select _cg_msg_visible(_conv, x.sender_id, x.sent_as) ok) v
  left join profiles p on p.id=x.sender_id and v.ok
  where x.conversation_id=_conv and can_read_conv_at(_conv, x.created_at) and (_before is null or x.seq < _before)
  order by x.seq desc limit least(greatest(coalesce(_limit,30),1),100)
$$;

create or replace function public.search_messages(_q text, _school uuid default null)
 returns table(message_id uuid, conversation_id uuid, seq bigint, body text, created_at timestamp with time zone, conv_title text, sender_name text)
 language sql stable security definer set search_path to 'public' as $function$
  select x.id, x.conversation_id, x.seq, left(x.body, 200), x.created_at, coalesce(nullif(c.title,''), 'محادثة'),
    case when x.sender_id=auth.uid() then 'أنت' when _cg_msg_visible(c.id, x.sender_id, x.sent_as) then coalesce((select p.full_name from profiles p where p.id=x.sender_id),'مستخدم') else _cg_generic_label2(c.id, x.sender_id) end
  from conversation_members m join conversations c on c.id=m.conversation_id join messages x on x.conversation_id=c.id and x.created_at>=m.visible_from
  where m.user_id=auth.uid() and m.left_at is null and conv_access_ok(c.id) and x.deleted_at is null
    and length(btrim(_q))>=2 and x.body ilike '%' || replace(replace(btrim(_q),'%','\%'),'_','\_') || '%'
    and (_school is null or c.school_id=_school or c.school_id is null)
  order by x.created_at desc limit 50 $function$;

-- live: topic-only signal to members who cannot read the row through realtime (no ids, no names)
create or replace function public._msg_live_trg() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if _cg_private(new.conversation_id) then
    insert into live_signals(topic, user_id)
      select 'msg', m.user_id from conversation_members m where m.conversation_id=new.conversation_id and m.left_at is null and m.user_id<>new.sender_id;
  end if;
  return null;
end $$;
drop trigger if exists msg_live on public.messages;
create trigger msg_live after insert or update on public.messages for each row execute function public._msg_live_trg();
create or replace function public._member_live_trg() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if _cg_private(new.conversation_id) then insert into live_signals(topic, user_id) values ('msg', new.user_id); end if;
  return null;
end $$;
drop trigger if exists member_live on public.conversation_members;
create trigger member_live after insert or update of left_at, role, reasons on public.conversation_members for each row execute function public._member_live_trg();
revoke execute on function public._msg_live_trg(), public._member_live_trg(), public._msg_sent_as_trg() from public, anon, authenticated;