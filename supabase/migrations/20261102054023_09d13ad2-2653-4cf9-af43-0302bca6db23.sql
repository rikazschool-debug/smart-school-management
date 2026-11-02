create or replace function public._new_card_code() returns text language plpgsql volatile security definer set search_path=public, extensions as $$
declare c text;
begin
  loop
    -- 10 random digits, first non-zero: compact CODE128 (set C) and easy to type
    c := (1 + floor(random()*9))::int::text || lpad((('x' || encode(extensions.gen_random_bytes(5),'hex'))::bit(40)::bigint % 1000000000)::text, 9, '0');
    exit when not exists (select 1 from student_cards where token = c);
  end loop;
  return c;
end $$;
revoke execute on function public._new_card_code() from public, anon, authenticated;

alter table public.student_cards alter column token set default public._new_card_code();
update public.student_cards set token = public._new_card_code() where token !~ '^[1-9][0-9]{9}$';

create or replace function public._auto_card(_student uuid) returns void language plpgsql security definer set search_path=public as $$
declare s students; nid uuid;
begin
  select * into s from students where id=_student;
  if s.id is null or s.status <> 'active' then return; end if;
  if exists (select 1 from student_cards where student_id=_student and status='active') then return; end if;
  insert into student_cards(school_id, student_id, issued_by) values (s.school_id, _student, auth.uid())
  on conflict do nothing returning id into nid;
  if nid is not null then perform public._att_event(s.school_id, 'card', nid, 'issue', null, null, 'إصدار تلقائي'); end if;
end $$;
revoke execute on function public._auto_card(uuid) from public, anon, authenticated;

create or replace function public._auto_card_trg() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_table_name = 'students' then perform public._auto_card(new.id);
  else if new.status = 'active' then perform public._auto_card(new.student_id); end if;
  end if;
  return null;
end $$;
revoke execute on function public._auto_card_trg() from public, anon, authenticated;

drop trigger if exists students_auto_card on public.students;
create trigger students_auto_card after insert or update of status on public.students for each row execute function public._auto_card_trg();
drop trigger if exists enrollments_auto_card on public.enrollments;
create trigger enrollments_auto_card after insert on public.enrollments for each row execute function public._auto_card_trg();

-- backfill active students without a card
insert into public.student_cards(school_id, student_id)
select s.school_id, s.id from public.students s
where s.status='active' and not exists (select 1 from public.student_cards c where c.student_id=s.id and c.status='active');

create or replace function public.issue_student_card(_student uuid, _reason text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare s students; old student_cards; nid uuid;
begin
  select * into s from students where id=_student;
  if s.id is null or not public.can_manage_students(s.school_id) then raise exception 'غير مصرح'; end if;
  if s.status <> 'active' then raise exception 'الطالب غير نشط'; end if;
  select * into old from student_cards where student_id=_student and status='active' for update;
  if old.id is not null then
    if coalesce(trim(_reason),'') = '' then return old.id; end if; -- already has a card (auto-issued)
    update student_cards set status='revoked', revoked_by=auth.uid(), revoked_at=now(), revoke_reason=_reason where id=old.id;
    perform public._att_event(s.school_id, 'card', old.id, 'revoke', null, null, _reason);
  end if;
  insert into student_cards(school_id, student_id, issued_by) values (s.school_id, _student, auth.uid()) returning id into nid;
  perform public._att_event(s.school_id, 'card', nid, 'issue', null, null, _reason);
  return nid;
end $$;