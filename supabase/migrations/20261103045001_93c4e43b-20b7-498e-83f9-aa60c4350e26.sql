create or replace function public._norm_phone_col() returns trigger language plpgsql set search_path=public as $$
begin
  if new.phone is not null and norm_phone(new.phone) is not null then new.phone := norm_phone(new.phone); end if;
  if tg_table_name = 'teachers' and new.national_id is not null then new.national_id := nullif(regexp_replace(new.national_id, '\D', '', 'g'), ''); end if;
  return new;
end $$;
drop trigger if exists teachers_norm_phone on public.teachers;
create trigger teachers_norm_phone before insert or update of phone, national_id on public.teachers for each row execute function public._norm_phone_col();
drop trigger if exists guardians_norm_phone on public.guardians;
create trigger guardians_norm_phone before insert or update of phone on public.guardians for each row execute function public._norm_phone_col();