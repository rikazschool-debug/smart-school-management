-- Identity privacy in class/subject groups: students & guardians see only staff identities, themselves and their own verified children.
create or replace function public._cg_private(_conv uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from conversations c where c.id=_conv and c.kind='group' and c.group_type in ('class','course','section'))
$$;

create or replace function public._cg_viewer_staff(_conv uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from conversations c where c.id=_conv and c.school_id is not null and (
      can_manage_school(c.school_id)
      or (_eligible_staff(c.org_id, c.school_id, auth.uid())
          and exists(select 1 from conversation_members m where m.conversation_id=c.id and m.user_id=auth.uid() and m.left_at is null))))
$$;

create or replace function public._cg_sender_visible(_conv uuid, _sender uuid) returns boolean language sql stable security definer set search_path=public as $$
  select _sender = auth.uid()
    or not _cg_private(_conv)
    or _cg_viewer_staff(_conv)
    or exists(select 1 from conversations c where c.id=_conv and _eligible_staff(c.org_id, c.school_id, _sender))
    or exists(select 1 from students st join student_guardians sg on sg.student_id=st.id and sg.verified and sg.can_follow
              join guardians g on g.id=sg.guardian_id where st.user_id=_sender and g.user_id=auth.uid())
$$;

create or replace function public._cg_generic_label(_conv uuid, _user uuid) returns text language sql stable security definer set search_path=public as $$
  select case when 'guardian' = any(coalesce(m.reasons,'{}')) then 'ولي أمر'
              when 'student' = any(coalesce(m.reasons,'{}')) then 'طالب'
              when exists(select 1 from memberships x where x.user_id=_user and x.role='guardian') then 'ولي أمر'
              when exists(select 1 from memberships x where x.user_id=_user and x.role='student') then 'طالب'
              else 'عضو' end
  from (select 1) d left join conversation_members m on m.conversation_id=_conv and m.user_id=_user
  order by m.left_at nulls first limit 1
$$;

revoke execute on function public._cg_private(uuid), public._cg_viewer_staff(uuid), public._cg_sender_visible(uuid,uuid), public._cg_generic_label(uuid,uuid) from public, anon;
grant execute on function public._cg_private(uuid), public._cg_viewer_staff(uuid), public._cg_sender_visible(uuid,uuid), public._cg_generic_label(uuid,uuid) to authenticated;

-- Direct table reads: masked rows are simply not returned (identity never leaves the server).
do $$ declare p record; begin
  for p in select polname from pg_policy where polrelid='public.messages'::regclass and polcmd='r' loop
    execute format('drop policy %I on public.messages', p.polname); end loop;
  for p in select polname from pg_policy where polrelid='public.conversation_members'::regclass and polcmd='r' loop
    execute format('drop policy %I on public.conversation_members', p.polname); end loop;
end $$;
create policy "messages read" on public.messages for select to authenticated
  using (can_read_conv_at(conversation_id, created_at) and _cg_sender_visible(conversation_id, sender_id));
create policy "members read" on public.conversation_members for select to authenticated
  using (user_id = auth.uid() or ((is_conv_member(conversation_id) or exists(select 1 from conversations c where c.id=conversation_members.conversation_id and c.kind='group' and _scope_manager(c.org_id, c.school_id)))
         and _cg_sender_visible(conversation_id, user_id)));

-- Files: message attachment rows (they carry uploaded_by) hidden from masked viewers; storage access via definer helper.
create or replace function public._msg_file_row_ok(_file uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from files f where f.id=_file and (f.source_type<>'message' or f.uploaded_by=auth.uid()
    or exists(select 1 from messages m where m.id=f.source_id and _cg_sender_visible(m.conversation_id, m.sender_id))))
$$;
create or replace function public._storage_file_ok(_name text) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from files f where f.storage_path=_name and can_read_file(f.id))
$$;
grant execute on function public._msg_file_row_ok(uuid), public._storage_file_ok(text) to authenticated;
drop policy if exists "files read" on public.files;
create policy "files read" on public.files for select to authenticated using (can_read_file(id) and _msg_file_row_ok(id));
drop policy if exists "rikaz files read" on storage.objects;
create policy "rikaz files read" on storage.objects for select to authenticated using (bucket_id='rikaz-files' and public._storage_file_ok(name));

-- The thread reads through this RPC: real identity for allowed viewers, generic label otherwise.
create or replace function public.conv_messages(_conv uuid, _before bigint default null, _limit int default 30)
returns table(id uuid, seq bigint, sender_id uuid, sender_name text, sender_label text, masked boolean, mine boolean, body text, reply_to uuid, created_at timestamptz, edited_at timestamptz, deleted_at timestamptz, pinned_at timestamptz, files jsonb)
language sql stable security definer set search_path=public as $$
  select x.id, x.seq,
    case when v.ok then x.sender_id end,
    case when x.sender_id=auth.uid() then 'أنت' when v.ok then coalesce(p.full_name,'مستخدم') else _cg_generic_label(_conv, x.sender_id) end,
    case when v.ok and x.sender_id<>auth.uid() then (select _cg_label(m.reasons) from conversation_members m where m.conversation_id=_conv and m.user_id=x.sender_id order by m.left_at nulls first limit 1) end,
    not v.ok, x.sender_id=auth.uid(), x.body, x.reply_to, x.created_at, x.edited_at, x.deleted_at, x.pinned_at,
    coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'size_bytes',f.size_bytes,'storage_path',f.storage_path) order by f.created_at)
              from files f where f.source_type='message' and f.source_id=x.id and x.deleted_at is null), '[]'::jsonb)
  from messages x
  cross join lateral (select _cg_sender_visible(_conv, x.sender_id) ok) v
  left join profiles p on p.id=x.sender_id and v.ok
  where x.conversation_id=_conv and can_read_conv_at(_conv, x.created_at) and (_before is null or x.seq < _before)
  order by x.seq desc limit least(greatest(coalesce(_limit,30),1),100)
$$;
revoke execute on function public.conv_messages(uuid,bigint,int) from public, anon;
grant execute on function public.conv_messages(uuid,bigint,int) to authenticated;

create or replace function public.conversation_people(_conv uuid)
 returns table(user_id uuid, full_name text, role text, source text, joined_at timestamp with time zone, last_read_seq bigint, label text)
 language sql stable security definer set search_path to 'public' as $function$
  select m.user_id, coalesce(p.full_name,'مستخدم'), m.role, m.source, m.joined_at, m.last_read_seq, _cg_label(m.reasons)
  from conversation_members m left join profiles p on p.id=m.user_id
  where m.conversation_id=_conv and m.left_at is null
    and (is_conv_member(_conv) or exists(select 1 from conversations c where c.id=_conv and c.kind='group' and _scope_manager(c.org_id, c.school_id)))
    and _cg_sender_visible(_conv, m.user_id)
  order by case m.role when 'owner' then 0 when 'moderator' then 1 else 2 end, p.full_name $function$;

-- hidden-member count so the client can show "و N من الطلاب وأولياء الأمور" without identities
create or replace function public.conv_hidden_count(_conv uuid) returns bigint language sql stable security definer set search_path=public as $$
  select count(*) from conversation_members m where m.conversation_id=_conv and m.left_at is null and is_conv_member(_conv) and not _cg_sender_visible(_conv, m.user_id)
$$;
grant execute on function public.conv_hidden_count(uuid) to authenticated;

create or replace function public.class_group_members(_conv uuid)
returns table(user_id uuid, full_name text, role text, reasons text[], label text, overridden boolean, removed boolean, override_reason text)
language sql stable security definer set search_path to 'public' as $$
  with c as (select * from conversations where id=_conv and group_type='class'),
  ok as (select is_school_principal(c.school_id) adm from c where is_school_principal(c.school_id) or is_conv_member(_conv))
  select m.user_id, coalesce(p.full_name,'مستخدم'), m.role, m.reasons, _cg_label(m.reasons),
    (select adm from ok) and o.id is not null, false, case when (select adm from ok) then o.reason end
  from c join ok on true join conversation_members m on m.conversation_id=c.id and m.left_at is null left join profiles p on p.id=m.user_id
    left join conv_member_overrides o on o.conversation_id=c.id and o.user_id=m.user_id
  where _cg_sender_visible(c.id, m.user_id)
  union all
  select o.user_id, coalesce(p.full_name,'مستخدم'), null, '{}', null, true, true, o.reason
  from c join ok on ok.adm join conv_member_overrides o on o.conversation_id=c.id and o.removed left join profiles p on p.id=o.user_id
  order by 7, 3 nulls last, 2
$$;

drop function if exists public.search_messages(text, uuid);
create function public.search_messages(_q text, _school uuid default null)
 returns table(message_id uuid, conversation_id uuid, seq bigint, body text, created_at timestamp with time zone, conv_title text, sender_name text)
 language sql stable security definer set search_path to 'public' as $function$
  select x.id, x.conversation_id, x.seq, left(x.body, 200), x.created_at, coalesce(nullif(c.title,''), 'محادثة'),
    case when x.sender_id=auth.uid() then 'أنت' when _cg_sender_visible(c.id, x.sender_id) then coalesce((select p.full_name from profiles p where p.id=x.sender_id),'مستخدم') else _cg_generic_label(c.id, x.sender_id) end
  from conversation_members m join conversations c on c.id=m.conversation_id join messages x on x.conversation_id=c.id and x.created_at>=m.visible_from
  where m.user_id=auth.uid() and m.left_at is null and conv_access_ok(c.id) and x.deleted_at is null
    and length(btrim(_q))>=2 and x.body ilike '%' || replace(replace(btrim(_q),'%','\%'),'_','\_') || '%'
    and (_school is null or c.school_id=_school or c.school_id is null)
  order by x.created_at desc limit 50 $function$;
revoke execute on function public.search_messages(text,uuid) from public, anon;
grant execute on function public.search_messages(text,uuid) to authenticated;