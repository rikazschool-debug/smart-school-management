do $$ begin
  if not exists (select 1 from vault.secrets where name='rikaz_au_worker_secret') then
    perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'rikaz_au_worker_secret','Automation file worker credential (test)');
  end if;
  if not exists (select 1 from vault.secrets where name='rikaz_au_worker_url') then
    perform vault.create_secret('https://id-preview--45bfe8fb-92a3-482f-bb8a-47942fa599de.lovable.app/api/internal/automation/worker','rikaz_au_worker_url','Automation file worker endpoint (test)');
  end if;
end $$;

create or replace function public._au_worker_check(_token text) returns boolean
language plpgsql stable security definer set search_path=public as $$
declare s text;
begin
  select decrypted_secret into s from vault.decrypted_secrets where name='rikaz_au_worker_secret';
  if s is null or length(s)<32 or _token is null then return false; end if;
  return _token = 'Bearer '||s;
end $$;
revoke all on function public._au_worker_check(text) from public,anon,authenticated;
grant execute on function public._au_worker_check(text) to service_role;

create or replace function public._au_worker_kick() returns void
language plpgsql security definer set search_path=public as $$
declare u text; s text;
begin
  if not exists (select 1 from au_files x where x.status='pending' or (x.status='rendering' and x.claimed_at < now() - interval '10 minutes')) then return; end if;
  select decrypted_secret into u from vault.decrypted_secrets where name='rikaz_au_worker_url';
  select decrypted_secret into s from vault.decrypted_secrets where name='rikaz_au_worker_secret';
  if u is null or s is null or u !~ '^https://[a-zA-Z0-9.-]+/api/internal/automation/worker$' then return; end if;
  perform net.http_post(url:=u, headers:=jsonb_build_object('Authorization','Bearer '||s,'Content-Type','application/json'), body:='{}'::jsonb, timeout_milliseconds:=120000);
exception when others then null;
end $$;
revoke all on function public._au_worker_kick() from public,anon,authenticated;
grant execute on function public._au_worker_kick() to service_role;

create or replace function public.automation_tick(_budget_ms integer default 3000) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform _au_nudge_apply();
  perform _au_worker_kick();
  return _au_tick_core(_budget_ms);
end $$;