create or replace function public.create_message_file(_conv uuid, _name text, _mime text, _size bigint) returns table(id uuid, storage_path text)
language plpgsql security definer set search_path=public as $$
declare c record; pol record; blk text; fid uuid := gen_random_uuid(); path text; sch uuid; begin
  select * into c from conversations where conversations.id=_conv;
  blk := conv_send_block(_conv);
  if blk is not null then raise exception '%', blk; end if;
  if not c.allow_attachments then raise exception 'المرفقات غير مسموحة في هذه المحادثة'; end if;
  sch := coalesce(c.school_id,
    (select m.school_id from memberships m join schools s on s.id=m.school_id and s.is_active where m.user_id=auth.uid() and m.is_active and m.org_id=c.org_id order by m.created_at limit 1),
    (select s.id from schools s where s.org_id=c.org_id and s.is_active and is_org_owner(c.org_id) order by s.created_at limit 1));
  if sch is null then raise exception 'لا يوجد فرع سارٍ لك في هذه المؤسسة لحفظ المرفق'; end if;
  select * into pol from _file_policy(sch);
  if not (_mime = any(pol.allowed_types)) then raise exception 'نوع الملف غير مسموح'; end if;
  if _size <= 0 or _size > pol.max_bytes then raise exception 'حجم الملف يتجاوز الحد المسموح (% ميغابايت)', pol.max_bytes/1048576; end if;
  if (select count(*) from files f where f.uploaded_by=auth.uid() and f.source_type='message_pending' and f.created_at > now()-interval '1 hour') >= 30 then raise exception 'تجاوزت حد المرفقات المؤقتة، حاول لاحقًا'; end if;
  path := sch || '/m/' || _conv || '/' || fid;
  insert into files(id, school_id, storage_path, name, mime_type, size_bytes, source_type, source_id) values (fid, sch, path, left(_name,200), _mime, _size, 'message_pending', _conv);
  return query select fid, path;
end $$;

create or replace function public.create_voice_file(_conv uuid, _mime text, _size bigint, _duration int) returns table(id uuid, storage_path text)
language plpgsql security definer set search_path to 'public' as $$
declare c record; s cs_settings; blk text; fid uuid := gen_random_uuid(); path text; sch uuid; m text := split_part(lower(coalesce(_mime,'')),';',1); begin
  select * into c from conversations where conversations.id=_conv;
  blk := conv_send_block(_conv); if blk is not null then raise exception '%', blk; end if;
  s := _cs_get(c.org_id);
  if not s.voice_enabled or not c.allow_attachments then raise exception 'الرسائل الصوتية غير مفعّلة في هذه المحادثة'; end if;
  if m not in ('audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/aac','audio/wav') then raise exception 'نوع التسجيل غير مدعوم'; end if;
  if _size <= 0 or _size > s.voice_max_bytes then raise exception 'حجم التسجيل يتجاوز الحد (% ميغابايت)', round(s.voice_max_bytes/1048576.0,1); end if;
  if _duration <= 0 or _duration > s.voice_max_sec then raise exception 'مدة التسجيل تتجاوز الحد (% ثانية)', s.voice_max_sec; end if;
  if (select count(*) from files f where f.uploaded_by=auth.uid() and f.source_type='message_pending' and f.created_at > now()-interval '1 hour') >= 30 then raise exception 'تجاوزت حد المرفقات المؤقتة، حاول لاحقًا'; end if;
  sch := coalesce(c.school_id,
    (select mm.school_id from memberships mm join schools x on x.id=mm.school_id and x.is_active where mm.user_id=auth.uid() and mm.is_active and mm.org_id=c.org_id order by mm.created_at limit 1),
    (select x.id from schools x where x.org_id=c.org_id and x.is_active and is_org_owner(c.org_id) order by x.created_at limit 1));
  if sch is null then raise exception 'لا يوجد فرع سارٍ لك في هذه المؤسسة لحفظ المرفق'; end if;
  path := sch || '/m/' || _conv || '/' || fid;
  insert into files(id, school_id, storage_path, name, mime_type, size_bytes, source_type, source_id, duration_sec)
    values (fid, sch, path, 'رسالة صوتية', m, _size, 'message_pending', _conv, _duration);
  return query select fid, path;
end $$;