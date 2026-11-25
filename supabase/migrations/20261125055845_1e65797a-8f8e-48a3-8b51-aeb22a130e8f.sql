create table if not exists public.signup_form_tokens (
  id uuid primary key default gen_random_uuid(),
  ip_hash text not null,
  ip_src text not null,
  issued_at timestamptz not null default now(),
  used_at timestamptz
);
create table if not exists public.signup_attempts (
  id bigserial primary key,
  ip_hash text not null,
  phone text,
  email text,
  outcome text not null,
  created_at timestamptz not null default now()
);
revoke all on public.signup_form_tokens, public.signup_attempts from anon, authenticated;
grant all on public.signup_form_tokens, public.signup_attempts to service_role;
grant usage, select on sequence public.signup_attempts_id_seq to service_role;
alter table public.signup_form_tokens enable row level security;
alter table public.signup_attempts enable row level security;
create index if not exists signup_form_tokens_ip_idx on public.signup_form_tokens(ip_hash, issued_at);
create index if not exists signup_attempts_ip_idx on public.signup_attempts(ip_hash, created_at);
create index if not exists signup_attempts_time_idx on public.signup_attempts(created_at);

create or replace function public._req_client_ip()
returns table(ip text, src text)
language plpgsql stable security definer set search_path = public as $$
declare h json := nullif(current_setting('request.headers', true), '')::json; v text;
begin
  v := btrim(coalesce(h->>'cf-connecting-ip',''));
  if v <> '' then return query select v, 'cf'; return; end if;
  v := btrim(split_part(coalesce(h->>'x-forwarded-for',''), ',', 1));
  if v <> '' then return query select v, 'xff'; return; end if;
  v := btrim(coalesce(h->>'x-real-ip',''));
  if v <> '' then return query select v, 'real'; return; end if;
  return query select 'unknown'::text, 'none'::text;
end $$;
revoke all on function public._req_client_ip() from public, anon, authenticated;

create or replace function public._signup_ip_hash(_ip text)
returns text language sql immutable set search_path = public as $$
  select encode(sha256(convert_to('rikaz-signup:' || _ip, 'UTF8')), 'hex')
$$;
revoke all on function public._signup_ip_hash(text) from public, anon, authenticated;

create or replace function public.signup_request_token()
returns uuid
language plpgsql volatile security definer set search_path = public as $$
declare v_ip text; v_src text; v_hash text; v_id uuid;
begin
  select ip, src into v_ip, v_src from _req_client_ip();
  v_hash := _signup_ip_hash(v_ip);
  if (select count(*) from signup_form_tokens where ip_hash = v_hash and issued_at > now() - interval '1 hour') >= 30 then
    raise exception 'طلبات كثيرة من هذا الاتصال، حاول بعد قليل' using errcode = 'P0001';
  end if;
  delete from signup_form_tokens where issued_at < now() - interval '2 days';
  insert into signup_form_tokens(ip_hash, ip_src) values (v_hash, v_src) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.signup_request_token() from public;
grant execute on function public.signup_request_token() to anon, authenticated;

create or replace function public.signup_request_submit(_p jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_org text := btrim(coalesce(_p->>'org_name','')); v_name text := btrim(coalesce(_p->>'contact_name',''));
 v_phone text := regexp_replace(coalesce(_p->>'phone',''),'[^0-9+]','','g'); v_email text := nullif(lower(btrim(coalesce(_p->>'email',''))),'');
 v_sc int; v_st int; v_serial bigint; v_stages text[];
 v_ip text; v_hash text; v_tok uuid; v_t signup_form_tokens;
begin
  select ip into v_ip from _req_client_ip();
  v_hash := _signup_ip_hash(v_ip);
  -- connection-level limits apply before any other work, whatever phone or email is sent
  if (select count(*) from signup_attempts where ip_hash = v_hash and created_at > now() - interval '1 hour') >= 10
     or (select count(*) from signup_attempts where ip_hash = v_hash and outcome = 'ok' and created_at > now() - interval '1 day') >= 10 then
    raise exception 'طلبات كثيرة من هذا الاتصال، حاول لاحقًا' using errcode = 'P0001';
  end if;
  if (select count(*) from signup_attempts where outcome = 'ok' and created_at > now() - interval '1 hour') >= 100 then
    raise exception 'الخدمة مشغولة حاليًا، حاول بعد قليل' using errcode = 'P0001';
  end if;
  -- automated-submission checks: hidden field must stay empty; single-use form token, at least 3 seconds old
  if btrim(coalesce(_p->>'website','')) <> '' then
    insert into signup_attempts(ip_hash, outcome) values (v_hash, 'bot');
    raise exception 'تعذر إرسال الطلب، أعد تحميل الصفحة وحاول مرة أخرى' using errcode = 'P0001';
  end if;
  begin v_tok := nullif(_p->>'form_token','')::uuid; exception when others then v_tok := null; end;
  select * into v_t from signup_form_tokens where id = v_tok for update;
  if v_t.id is null or v_t.used_at is not null or v_t.ip_hash <> v_hash or v_t.issued_at < now() - interval '6 hours' then
    insert into signup_attempts(ip_hash, outcome) values (v_hash, 'token');
    raise exception 'انتهت صلاحية النموذج، أعد تحميل الصفحة وحاول مرة أخرى' using errcode = 'P0001';
  end if;
  if v_t.issued_at > now() - interval '3 seconds' then
    insert into signup_attempts(ip_hash, outcome) values (v_hash, 'fast');
    raise exception 'تعذر إرسال الطلب، راجع البيانات وحاول مرة أخرى' using errcode = 'P0001';
  end if;

  if length(v_org) < 2 or length(v_org) > 150 then raise exception 'اسم المؤسسة مطلوب'; end if;
  if length(v_name) < 2 or length(v_name) > 100 then raise exception 'اسم المسؤول مطلوب'; end if;
  if v_phone !~ '^\+?[0-9]{9,15}$' then raise exception 'رقم الجوال غير صحيح'; end if;
  if v_email is not null and (length(v_email) > 255 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'البريد الإلكتروني غير صحيح'; end if;
  v_sc := nullif(_p->>'schools_count','')::int; v_st := nullif(_p->>'students_count','')::int;
  if v_sc is not null and (v_sc < 1 or v_sc > 500) then raise exception 'عدد المدارس غير صحيح'; end if;
  if v_st is not null and (v_st < 1 or v_st > 500000) then raise exception 'عدد الطلاب غير صحيح'; end if;
  select coalesce(array_agg(x),'{}') into v_stages from jsonb_array_elements_text(coalesce(_p->'stages','[]')) x where x in ('kg','primary','middle','secondary','intl');
  if (select count(*) from signup_requests where phone = v_phone and created_at > now() - interval '1 day') >= 5 then raise exception 'تم استلام طلبات كثيرة من هذا الرقم، حاول لاحقًا'; end if;
  if v_email is not null and (select count(*) from signup_requests where email = v_email and created_at > now() - interval '1 day') >= 5 then raise exception 'تم استلام طلبات كثيرة من هذا البريد، حاول لاحقًا'; end if;
  if exists (select 1 from signup_requests where phone = v_phone and lower(btrim(org_name)) = lower(v_org) and created_at > now() - interval '1 day') then
    raise exception 'طلبك لهذه المؤسسة وصل سابقًا وهو قيد المراجعة'; end if;
  update signup_form_tokens set used_at = now() where id = v_t.id;
  insert into signup_requests(org_name, contact_name, job_title, phone, email, city, schools_count, students_count, stages, notes)
  values (v_org, v_name, left(nullif(btrim(coalesce(_p->>'job_title','')),''),100), v_phone, v_email,
    left(nullif(btrim(coalesce(_p->>'city','')),''),80), v_sc, v_st, v_stages, left(nullif(btrim(coalesce(_p->>'notes','')),''),1000))
  returning serial into v_serial;
  insert into signup_attempts(ip_hash, phone, email, outcome) values (v_hash, v_phone, v_email, 'ok');
  delete from signup_attempts where created_at < now() - interval '30 days';
  return 'RZ-' || lpad(v_serial::text, 4, '0');
end $function$;

CREATE OR REPLACE FUNCTION public._people_pool(_purpose text, _school uuid, _org uuid, _post uuid)
 RETURNS TABLE(user_id uuid, school_id uuid, role text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare org uuid; begin
 if _purpose in ('task','admin_form_handler') then
 if _school is null or not (case when _purpose='task' then _ws_ok(_school,'admin_tasks','create') else _ws_ok(_school,'admin_forms','edit') end) then raise exception 'غير مصرح باختيار المستلمين' using errcode='42501'; end if;
 return query select m.user_id,m.school_id,m.role::text from memberships m join schools s on s.id=m.school_id where m.school_id=_school and m.is_active and not coalesce(m.branch_suspended,false) and s.is_active and m.role not in ('student','guardian','org_owner') and (case when _purpose='task' then m.user_id <> auth.uid() and _task_target_ok(_school,m.user_id) else true end); return;
 end if;
  if _purpose = 'facility_resp' then
    org := school_org(_school);
    if org is null or not (private._fm_ok(org, _school, 'create') or private._fm_ok(org, _school, 'edit')) then raise exception 'اختيار المسؤول لمن يدير الخريطة المدرسية' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m
      where m.is_active and not coalesce(m.branch_suspended,false) and m.school_id=_school and m.role not in ('student','guardian');
    return;
  end if;
  if _purpose = 'cs_contact' then
    org := coalesce(_org, school_org(_school));
    if org is null or not cs_comm_me(org) then raise exception 'مراسلات خدمة العملاء غير مفعّلة لحسابك' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m join schools s on s.id=m.school_id
      where m.is_active and not coalesce(m.branch_suspended,false) and s.org_id=org and s.is_active and m.role not in ('student')
        and m.user_id <> auth.uid() and (_school is null or m.school_id=_school) and _cs_contact_ok(m.school_id, auth.uid());
    return;
  end if;
  if _purpose = 'xbranch' then
    org := coalesce(_org, school_org(_school));
    if org is null or not _xb_ok(org, auth.uid()) then raise exception 'التواصل بين الفروع غير مفعّل لحسابك' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m join schools s on s.id=m.school_id
      where m.is_active and not coalesce(m.branch_suspended,false) and s.org_id=org and m.role not in ('student','guardian','org_owner')
        and m.user_id <> auth.uid() and _xb_ok(org, m.user_id);
    return;
  end if;
  if _purpose = 'visit_host' then
    if _school is null or not _gv_ok(_school,'manage') then raise exception 'اختيار المسؤول لمن يدير الزيارات' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m
      where m.is_active and not coalesce(m.branch_suspended,false) and m.school_id=_school and m.role not in ('student','guardian','org_owner');
    return;
  end if;
  if _purpose = 'evt_staff' then
    if _school is null or not (_evt_school_ok(_school,'course','settings') or _evt_school_ok(_school,'course','edit')) then raise exception 'التفويض لمن يملك صلاحية إعدادات الدورات' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m
      where m.is_active and not coalesce(m.branch_suspended,false) and m.school_id=_school and m.role not in ('student','guardian','org_owner') and m.user_id <> auth.uid();
    return;
  end if;
  return query select * from _people_pool_v6(_purpose, _school, _org, _post);
end $function$;