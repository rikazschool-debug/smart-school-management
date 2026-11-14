
create or replace function public.start_family_conversation(_student uuid, _guardian uuid, _staff_user uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare g record; _k text; st record; cid uuid; key text; begin
  select * into g from guardians where id=_guardian;
  select * into st from students where id=_student;
  if g is null or st is null then raise exception 'بيانات غير صالحة'; end if;
  if auth.uid() not in (_staff_user, g.user_id) then raise exception 'لا يمكنك بدء محادثة باسم مستخدم آخر'; end if;
  _k := case when _family_ok(_student, _guardian, _staff_user, 'teacher') then 'teacher' when _family_ok(_student, _guardian, _staff_user, 'admin') then 'admin' else null end;
  if _k is null then raise exception 'لا توجد علاقة تعليمية أو أسرية سارية تسمح بهذه المحادثة'; end if;
  key := 'family:' || _student || ':' || _guardian || ':' || _staff_user;
  insert into conversations(org_id, school_id, kind, student_id, guardian_id, staff_user_id, staff_kind, dedupe_key, created_by)
    values (school_org(st.school_id), st.school_id, 'family', _student, _guardian, _staff_user, _k, key, auth.uid())
    on conflict (dedupe_key) do nothing returning id into cid;
  if cid is null then select c.id into cid from conversations c where c.dedupe_key=key; update conversations set staff_kind=_k, status='active' where id=cid; end if;
  perform _add_member(cid, _staff_user, 'member', 'relation', '-infinity');
  perform _add_member(cid, g.user_id, 'member', 'relation', '-infinity');
  return cid;
end $$;

create or replace function public.send_message(_conv uuid, _body text, _client_id uuid, _reply_to uuid default null, _files uuid[] default '{}')
returns table(id uuid, seq bigint, created_at timestamptz) language plpgsql security definer set search_path=public as $$
declare c record; ex record; blk text; r record; reply_sender uuid; nseq bigint; mid uuid := gen_random_uuid(); b text := btrim(coalesce(_body,'')); f uuid; mem record; title text; begin
  select m.id, m.seq, m.created_at into ex from messages m where m.sender_id=auth.uid() and m.client_id=_client_id;
  if ex.id is not null then return query select ex.id, ex.seq, ex.created_at; return; end if;
  blk := conv_send_block(_conv);
  if blk is not null then raise exception '%', blk; end if;
  if length(b) > 4000 then raise exception 'الرسالة أطول من 4000 حرف'; end if;
  if b = '' and coalesce(array_length(_files,1),0)=0 then raise exception 'الرسالة فارغة'; end if;
  if coalesce(array_length(_files,1),0) > 5 then raise exception 'الحد 5 مرفقات للرسالة'; end if;
  if (select count(*) from messages m where m.sender_id=auth.uid() and m.created_at > now()-interval '1 minute') >= 20 then raise exception 'أرسلت رسائل كثيرة في وقت قصير، انتظر قليلًا'; end if;
  if _reply_to is not null then
    select * into r from messages m where m.id=_reply_to;
    if r.id is null or r.conversation_id<>_conv or r.deleted_at is not null or not can_read_conv_at(_conv, r.created_at) then raise exception 'لا يمكن الرد على هذه الرسالة'; end if;
    reply_sender := r.sender_id;
  end if;
  foreach f in array coalesce(_files,'{}') loop
    if not exists(select 1 from files x where x.id=f and x.source_type='message_pending' and x.source_id=_conv and x.uploaded_by=auth.uid()) then raise exception 'مرفق غير صالح لهذه المحادثة'; end if;
    if not exists(select 1 from storage.objects o join files x on x.storage_path=o.name where x.id=f and o.bucket_id='rikaz-files') then raise exception 'المرفق لم يكتمل رفعه؛ أعد المحاولة'; end if;
  end loop;
  update conversations set last_seq=last_seq+1, last_message_at=now() where conversations.id=_conv returning * into c;
  nseq := c.last_seq;
  insert into messages(id, conversation_id, school_id, seq, sender_id, body, reply_to, client_id) values (mid, _conv, c.school_id, nseq, auth.uid(), b, _reply_to, _client_id);
  update files set source_type='message', source_id=mid where files.id = any(coalesce(_files,'{}'));
  update conversation_members set last_read_seq=nseq where conversation_id=_conv and user_id=auth.uid() and left_at is null;
  title := case when c.kind='group' then 'رسالة جديدة في ' || c.title else 'رسالة جديدة من ' || coalesce((select p.full_name from profiles p where p.id=auth.uid()),'مستخدم') end;
  begin
    for mem in select cm.user_id from conversation_members cm where cm.conversation_id=_conv and cm.left_at is null and not cm.muted and cm.user_id<>auth.uid() loop
      perform _notify(mem.user_id, c.school_id, 'message', title, null, _conv_link(_conv), 'msg:' || mid);
    end loop;
    if reply_sender is not null and reply_sender<>auth.uid() then
      perform _notify(reply_sender, c.school_id, 'reply', 'رد على رسالتك', null, _conv_link(_conv), 'reply:' || mid);
    end if;
  exception when others then null; -- notification failure never undoes or duplicates the message
  end;
  return query select m.id, m.seq, m.created_at from messages m where m.id=mid;
end $$;
revoke execute on function public.send_message(uuid,text,uuid,uuid,uuid[]) from public, anon;
revoke execute on function public.start_family_conversation(uuid,uuid,uuid) from public, anon;
