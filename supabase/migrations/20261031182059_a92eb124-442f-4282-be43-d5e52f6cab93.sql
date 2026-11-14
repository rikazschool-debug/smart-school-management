alter table public.invitations
  add column if not exists token uuid not null default gen_random_uuid(),
  add column if not exists expires_at timestamptz not null default (now() + interval '7 days'),
  add column if not exists revoked_at timestamptz,
  add column if not exists resent_count int not null default 0;
create unique index if not exists invitations_token_key on public.invitations(token);

create or replace function public.can_invite(_school uuid, _role public.app_role) returns boolean language sql stable security definer set search_path=public as $$
  select _role <> 'org_owner' and (is_platform_admin() or is_org_owner(school_org(_school))
     or (has_school_role(_school, array['principal']::app_role[]) and _role <> 'principal')
     or (has_school_role(_school, array['vice_principal']::app_role[]) and _role not in ('principal','vice_principal'))
     or (has_school_role(_school, array['student_affairs']::app_role[]) and _role in ('guardian','student')))
$$;

create or replace function public.invite_member(_email text, _school uuid, _role public.app_role, _department uuid default null) returns uuid language plpgsql security definer set search_path=public as $$
declare oid uuid; iid uuid; em text := lower(trim(_email));
begin
  oid := school_org(_school);
  if oid is null then raise exception 'مدرسة غير موجودة'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'بريد غير صالح'; end if;
  if not can_invite(_school, _role) then raise exception 'ليست لديك صلاحية دعوة هذا الدور'; end if;
  if _department is not null and not exists(select 1 from departments where id=_department and school_id=_school) then raise exception 'القسم لا يتبع المدرسة'; end if;
  select id into iid from invitations where lower(email)=em and school_id=_school and role=_role and accepted_at is null and revoked_at is null and expires_at>now();
  if iid is not null then return iid; end if;
  insert into invitations(email, org_id, school_id, department_id, role, invited_by) values (em, oid, _school, _department, _role, auth.uid()) returning id into iid;
  return iid;
end $$;

create or replace function public.revoke_invitation(_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare r record; begin
  select * into r from invitations where id=_id for update;
  if r is null or not can_invite(r.school_id, r.role) then raise exception 'غير مصرح'; end if;
  if r.accepted_at is not null then raise exception 'الدعوة مقبولة مسبقًا'; end if;
  update invitations set revoked_at=coalesce(revoked_at, now()) where id=_id;
end $$;

create or replace function public.resend_invitation(_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare r record; t uuid := gen_random_uuid(); begin
  select * into r from invitations where id=_id for update;
  if r is null or not can_invite(r.school_id, r.role) then raise exception 'غير مصرح'; end if;
  if r.accepted_at is not null then raise exception 'الدعوة مقبولة مسبقًا'; end if;
  update invitations set token=t, expires_at=now()+interval '7 days', revoked_at=null, resent_count=resent_count+1 where id=_id;
  return t;
end $$;

create or replace function public._apply_invitation(r public.invitations, _uid uuid, _em text) returns void language plpgsql security definer set search_path=public as $$
begin
  insert into memberships(user_id, org_id, school_id, department_id, role) values (_uid, r.org_id, r.school_id, r.department_id, r.role) on conflict do nothing;
  update invitations set accepted_at=now() where id=r.id and accepted_at is null;
  if r.role='teacher' then update teachers set user_id=_uid where school_id=r.school_id and lower(email)=_em and user_id is null; end if;
  if r.role='guardian' then update guardians set user_id=_uid where school_id=r.school_id and lower(email)=_em and user_id is null; end if;
  if r.role='student' then update students set user_id=_uid where school_id=r.school_id and lower(email)=_em and user_id is null; end if;
end $$;
revoke execute on function public._apply_invitation(public.invitations, uuid, text) from public, anon, authenticated;

create or replace function public.invitation_preview(_token uuid) returns table(school_name text, role public.app_role, email_hint text, status text, email_matches boolean, email_confirmed boolean) language plpgsql stable security definer set search_path=public as $$
declare r record; em text; conf timestamptz;
begin
  select lower(u.email), u.email_confirmed_at into em, conf from auth.users u where u.id=auth.uid();
  select i.*, s.name sname into r from invitations i left join schools s on s.id=i.school_id where i.token=_token;
  if r is null then return query select null::text, null::app_role, null::text, 'not_found'::text, false, false; return; end if;
  return query select r.sname, r.role,
    left(r.email,2) || '***@' || split_part(r.email,'@',2),
    case when r.accepted_at is not null then 'accepted' when r.revoked_at is not null then 'revoked' when r.expires_at<=now() then 'expired' else 'pending' end,
    coalesce(em = lower(r.email), false), conf is not null;
end $$;

create or replace function public.accept_invitation(_token uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare r public.invitations; em text; conf timestamptz;
begin
  select lower(email), email_confirmed_at into em, conf from auth.users where id=auth.uid();
  if em is null then raise exception 'يجب تسجيل الدخول'; end if;
  select * into r from invitations where token=_token for update;
  if r.id is null then raise exception 'الدعوة غير موجودة'; end if;
  if r.accepted_at is not null then raise exception 'تم استخدام هذه الدعوة مسبقًا'; end if;
  if r.revoked_at is not null then raise exception 'الدعوة ملغاة'; end if;
  if r.expires_at <= now() then raise exception 'انتهت صلاحية الدعوة'; end if;
  if lower(r.email) <> em then raise exception 'هذه الدعوة موجهة إلى بريد آخر'; end if;
  if conf is null then raise exception 'يجب تأكيد البريد الإلكتروني أولًا'; end if;
  perform _apply_invitation(r, auth.uid(), em);
  return r.school_id;
end $$;

create or replace function public.accept_my_invitations() returns int language plpgsql security definer set search_path=public as $$
declare r public.invitations; n int := 0; em text; conf timestamptz;
begin
  select lower(email), email_confirmed_at into em, conf from auth.users where id=auth.uid();
  if em is null or conf is null then return 0; end if;
  for r in select * from invitations where lower(email)=em and accepted_at is null and revoked_at is null and expires_at>now() for update loop
    perform _apply_invitation(r, auth.uid(), em); n := n+1;
  end loop;
  return n;
end $$;

revoke execute on function public.can_invite(uuid, public.app_role), public.revoke_invitation(uuid), public.resend_invitation(uuid), public.invitation_preview(uuid), public.accept_invitation(uuid) from public, anon;
grant execute on function public.can_invite(uuid, public.app_role), public.revoke_invitation(uuid), public.resend_invitation(uuid), public.invitation_preview(uuid), public.accept_invitation(uuid), public.invite_member(text,uuid,public.app_role,uuid), public.accept_my_invitations() to authenticated;
revoke execute on function public.check_enrollment() from public, anon, authenticated;