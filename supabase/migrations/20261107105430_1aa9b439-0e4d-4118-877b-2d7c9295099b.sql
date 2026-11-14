delete from public.support_holidays a using public.support_holidays b where a.ctid > b.ctid and a.org_id=b.org_id and a.school_id is not distinct from b.school_id and a.date_from=b.date_from and a.date_to=b.date_to;
create unique index support_holidays_once on public.support_holidays(org_id, coalesce(school_id,'00000000-0000-0000-0000-000000000000'::uuid), date_from, date_to);
create or replace function public.support_holiday_save(_org uuid, _school uuid, _from date, _to date, _name text) returns uuid language plpgsql security definer set search_path=public as $$
declare id_ uuid;
begin
  if not _support_settings_ok(_org) then raise exception 'غير مصرح'; end if;
  if _school is not null and not exists(select 1 from schools where id=_school and org_id=_org) then raise exception 'اختر فرعًا من المؤسسة'; end if;
  if _from is null or _to is null or _to < _from then raise exception 'تاريخ نهاية الإجازة بعد بدايتها'; end if;
  if _to - _from > 120 then raise exception 'الإجازة لا تتجاوز 120 يومًا'; end if;
  if length(trim(coalesce(_name,''))) < 2 then raise exception 'اكتب اسم الإجازة'; end if;
  if exists(select 1 from support_holidays h where h.org_id=_org and h.school_id is not distinct from _school and h.date_from=_from and h.date_to=_to) then raise exception 'هذه الإجازة مسجلة مسبقًا'; end if;
  insert into support_holidays(org_id, school_id, date_from, date_to, name) values (_org, _school, _from, _to, trim(_name)) returning id into id_;
  return id_;
end $$;