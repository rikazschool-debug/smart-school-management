do $mig$
declare src text;
begin
  -- 1) send block: teacher-kind family/student chats are read-only for both sides
  select prosrc into src from pg_proc where proname='_conv_send_block_v1';
  src := replace(src,
    $a$  if c.kind='family' and auth.uid() <> c.staff_user_id and coalesce(c.staff_kind,'teacher') <> 'admin'$a$,
    $a$  if c.kind in ('family','student') and coalesce(c.staff_kind,'teacher') <> 'admin' then
    return 'المحادثات الخاصة بين المعلم والطالب أو ولي الأمر متوقفة؛ المحادثة للقراءة فقط. التواصل العام عبر مجموعة الفصل، والأمور الفردية مع إدارة المدرسة أو الوكيل أو المرشد الطلابي'; end if;
  if c.kind='family' and auth.uid() <> c.staff_user_id and coalesce(c.staff_kind,'teacher') <> 'admin'$a$);
  if position('المحادثات الخاصة بين المعلم' in src) = 0 then raise exception 'patch 1 failed'; end if;
  execute format('create or replace function public._conv_send_block_v1(_conv uuid) returns text language plpgsql stable security definer set search_path = public as %L', src);

  -- 2) staff may start family chats only as administration, never as teacher
  select prosrc into src from pg_proc where proname='_start_family_conversation_v0';
  src := replace(src,
    $a$    _k := case when _family_ok(_student, _guardian, _staff_user, 'teacher') then 'teacher' when _family_ok(_student, _guardian, _staff_user, 'admin') then 'admin' else null end;$a$,
    $a$    _k := case when _family_ok(_student, _guardian, _staff_user, 'admin') then 'admin' else null end;
    if _k is null and _family_ok(_student, _guardian, _staff_user, 'teacher') then
      raise exception 'المحادثات الخاصة بين المعلم وولي الأمر متوقفة؛ تواصل عبر مجموعة الفصل'; end if;$a$);
  if position('المحادثات الخاصة بين المعلم وولي الأمر' in src) = 0 then raise exception 'patch 2 failed'; end if;
  execute format('create or replace function public._start_family_conversation_v0(_student uuid, _guardian uuid, _staff_user uuid) returns uuid language plpgsql security definer set search_path = public as %L', src);
end $mig$;

-- 3) teachers can no longer start private chats with students
create or replace function public._start_student_conversation_v0(_student uuid) returns uuid language plpgsql security definer set search_path = public as $$
begin
  raise exception 'المحادثات الخاصة بين المعلم والطالب متوقفة؛ تواصل عبر مجموعة الفصل';
end $$;