create table public.otp_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  phone text not null,
  local_message_id text not null unique,
  status text not null default 'requested' check (status in ('requested','accepted','failed','sent','delivered','read','refused')),
  failed_code text,
  failed_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant all on public.otp_sends to service_role;
alter table public.otp_sends enable row level security;
create index otp_sends_phone_time on public.otp_sends(phone, created_at desc);

-- service role: may this account receive a login code now? (school accounts only; cooldown + hourly cap)
create or replace function public._otp_may_send(_uid uuid, _phone text)
returns text language sql stable security definer set search_path=public as $$
  select case
    when not exists(select 1 from memberships m where m.user_id=_uid and m.role in ('teacher','guardian','principal','vice_principal','dept_head','supervisor','student_affairs','counselor','nurse','security','org_owner'))
      and not exists(select 1 from account_setup a where a.user_id=_uid) then 'not_school_account'
    when exists(select 1 from otp_sends s where s.phone=_phone and s.status <> 'refused' and s.created_at > now() - interval '60 seconds') then 'cooldown'
    when (select count(*) from otp_sends s where s.phone=_phone and s.status <> 'refused' and s.created_at > now() - interval '1 hour') >= 5 then 'hourly_limit'
    else null end
$$;
revoke execute on function public._otp_may_send(uuid,text) from public, anon, authenticated;
grant execute on function public._otp_may_send(uuid,text) to service_role;