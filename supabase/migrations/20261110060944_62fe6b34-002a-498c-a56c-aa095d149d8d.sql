create sequence if not exists public.signup_req_seq;
create table public.signup_requests (
  id uuid primary key default gen_random_uuid(),
  serial bigint not null default nextval('public.signup_req_seq') unique,
  org_name text not null, contact_name text not null, job_title text, phone text not null, email text,
  city text, schools_count int, students_count int, stages text[] not null default '{}', notes text,
  status text not null default 'new', admin_note text, handled_by uuid, handled_at timestamptz,
  created_at timestamptz not null default now()
);
grant all on public.signup_requests to service_role;
alter table public.signup_requests enable row level security;

create or replace function public.signup_request_submit(_p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_org text := btrim(coalesce(_p->>'org_name','')); v_name text := btrim(coalesce(_p->>'contact_name',''));
 v_phone text := regexp_replace(coalesce(_p->>'phone',''),'[^0-9+]','','g'); v_email text := nullif(lower(btrim(coalesce(_p->>'email',''))),'');
 v_sc int; v_st int; v_serial bigint; v_stages text[];
begin
  if length(v_org) < 2 or length(v_org) > 150 then raise exception 'اسم المؤسسة مطلوب'; end if;
  if length(v_name) < 2 or length(v_name) > 100 then raise exception 'اسم المسؤول مطلوب'; end if;
  if v_phone !~ '^\+?[0-9]{9,15}$' then raise exception 'رقم الجوال غير صحيح'; end if;
  if v_email is not null and (length(v_email) > 255 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'البريد الإلكتروني غير صحيح'; end if;
  v_sc := nullif(_p->>'schools_count','')::int; v_st := nullif(_p->>'students_count','')::int;
  if v_sc is not null and (v_sc < 1 or v_sc > 500) then raise exception 'عدد المدارس غير صحيح'; end if;
  if v_st is not null and (v_st < 1 or v_st > 500000) then raise exception 'عدد الطلاب غير صحيح'; end if;
  select coalesce(array_agg(x),'{}') into v_stages from jsonb_array_elements_text(coalesce(_p->'stages','[]')) x where x in ('kg','primary','middle','secondary','intl');
  if (select count(*) from signup_requests where phone = v_phone and created_at > now() - interval '1 day') >= 5 then raise exception 'تم استلام طلبات كثيرة من هذا الرقم، حاول لاحقًا'; end if;
  insert into signup_requests(org_name, contact_name, job_title, phone, email, city, schools_count, students_count, stages, notes)
  values (v_org, v_name, left(nullif(btrim(coalesce(_p->>'job_title','')),''),100), v_phone, v_email,
    left(nullif(btrim(coalesce(_p->>'city','')),''),80), v_sc, v_st, v_stages, left(nullif(btrim(coalesce(_p->>'notes','')),''),1000))
  returning serial into v_serial;
  return 'RZ-' || lpad(v_serial::text, 4, '0');
end $$;
revoke all on function public.signup_request_submit(jsonb) from public;
grant execute on function public.signup_request_submit(jsonb) to anon, authenticated;

create or replace function public.platform_signup_requests() returns setof jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'غير مسموح'; end if;
  return query select to_jsonb(r) || jsonb_build_object('ref','RZ-'||lpad(r.serial::text,4,'0')) from signup_requests r order by r.serial desc;
end $$;
revoke all on function public.platform_signup_requests() from public, anon;
grant execute on function public.platform_signup_requests() to authenticated;

create or replace function public.platform_signup_set(_id uuid, _status text, _note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'غير مسموح'; end if;
  if _status not in ('new','contacted','accepted','rejected') then raise exception 'حالة غير صحيحة'; end if;
  update signup_requests set status=_status, admin_note=left(nullif(btrim(coalesce(_note,'')),''),1000), handled_by=auth.uid(), handled_at=now() where id=_id;
  if not found then raise exception 'الطلب غير موجود'; end if;
end $$;
revoke all on function public.platform_signup_set(uuid,text,text) from public, anon;
grant execute on function public.platform_signup_set(uuid,text,text) to authenticated;