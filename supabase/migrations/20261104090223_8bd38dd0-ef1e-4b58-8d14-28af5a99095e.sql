alter table public.schools add column if not exists student_gender text;
create or replace function public._school_gender_trg() returns trigger language plpgsql set search_path=public as $$
begin if new.student_gender is not null and new.student_gender not in ('boys','girls','mixed') then raise exception 'فئة الطلاب غير صالحة'; end if; return new; end $$;
drop trigger if exists school_gender_chk on public.schools;
create trigger school_gender_chk before insert or update on public.schools for each row execute function public._school_gender_trg();
update public.schools set student_gender = case city when 'بنين' then 'boys' when 'بنات' then 'girls' else 'mixed' end, city = null
 where org_id='a9a4b7e2-ab44-4bcf-a1bf-ebce6489f074' and city in ('بنين','بنات','بنين وبنات');