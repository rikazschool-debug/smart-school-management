-- 1) courses: per-course visibility instead of whole-school membership
drop policy if exists "member read" on public.courses;
create policy "course read" on public.courses for select to authenticated using (
  public.can_view_course(id, school_id)
  or exists(select 1 from public.substitutions x join public.timetable_slots s on s.id = x.slot_id
            where s.course_id = courses.id and x.status = 'active' and x.substitute_teacher_id in (select public.my_teacher_ids()))
);

-- 2) cleanup run lifecycle
alter table public.file_cleanup_runs add column if not exists finished_at timestamptz,
  add column if not exists status text not null default 'ok',
  add column if not exists channel text not null default 'live';

create table if not exists public.cleanup_alerts (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'live',
  kind text not null,               -- stale | stuck | failing
  details jsonb not null default '{}',
  opened_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  resolved_at timestamptz
);
grant select on public.cleanup_alerts to authenticated;
grant all on public.cleanup_alerts to service_role;
alter table public.cleanup_alerts enable row level security;
create policy "cleanup alerts read" on public.cleanup_alerts for select to authenticated using (public.is_platform_admin());
create unique index if not exists cleanup_alerts_one_open on public.cleanup_alerts(channel, kind) where resolved_at is null;

create or replace function public.run_file_cleanup()
 returns jsonb language plpgsql security definer set search_path to 'public', 'storage'
as $function$
declare cfg record; f record; url text; key text; n_mark int := 0; n_rm int := 0; n_req int := 0; n_fail int := 0; has_obj boolean; run_id uuid; begin
  insert into file_cleanup_runs(marked, rows_removed, delete_requests, failed, status) values (0,0,0,0,'running') returning id into run_id;
  begin
    select * into cfg from file_cleanup_config;
    select decrypted_secret into url from vault.decrypted_secrets where name='rikaz_storage_url';
    select decrypted_secret into key from vault.decrypted_secrets where name='rikaz_service_key';
    for f in select x.id from files x where x.source_type='message_pending' and x.created_at < now() - make_interval(mins => cfg.retention_minutes) for update skip locked loop
      update files set source_type='cleanup_due' where id=f.id; n_mark := n_mark + 1;
    end loop;
    for f in select x.id from files x where x.source_type in ('post','circular') and x.created_at < now() - make_interval(mins => cfg.retention_minutes)
        and not exists(select 1 from storage.objects o where o.bucket_id='rikaz-files' and o.name=x.storage_path) for update skip locked loop
      delete from files where id=f.id; n_rm := n_rm + 1;
    end loop;
    for f in select x.* from files x where x.source_type='cleanup_due' for update skip locked loop
      has_obj := exists(select 1 from storage.objects o where o.bucket_id='rikaz-files' and o.name=f.storage_path);
      if not has_obj then delete from files where id=f.id; n_rm := n_rm + 1;
      elsif f.cleanup_attempts >= cfg.max_attempts then
        if f.cleanup_error is distinct from 'max_attempts' then update files set cleanup_error='max_attempts' where id=f.id; end if; n_fail := n_fail + 1;
      elsif url is null or key is null then
        update files set cleanup_error='missing_credentials' where id=f.id; n_fail := n_fail + 1;
      elsif f.cleanup_last_at is null or f.cleanup_last_at < now() - interval '5 minutes' then
        perform net.http_delete(url := url || '/storage/v1/object/rikaz-files/' || f.storage_path,
          headers := jsonb_build_object('Authorization', 'Bearer ' || key, 'apikey', key));
        update files set cleanup_attempts=cleanup_attempts+1, cleanup_last_at=now(), cleanup_error=null where id=f.id; n_req := n_req + 1;
      end if;
    end loop;
    update file_cleanup_runs set marked=n_mark, rows_removed=n_rm, delete_requests=n_req, failed=n_fail, status='ok', finished_at=now() where id=run_id;
  exception when others then
    update file_cleanup_runs set status='failed', finished_at=now(), note=left(sqlerrm, 300) where id=run_id;
  end;
  delete from file_cleanup_runs where channel='live' and started_at < now() - interval '30 days';
  return jsonb_build_object('marked', n_mark, 'removed', n_rm, 'requests', n_req, 'failed', n_fail);
end $function$;

-- 3) independent monitor (own cron job; does not rely on the cleanup job running)
create or replace function public.check_cleanup_health(_now timestamptz default now(), _channel text default 'live', _notify_to uuid[] default null)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  last_ok timestamptz; last_run record; conds jsonb; k text; on_ boolean; a record; recips uuid[]; u uuid; opened int := 0; resolved int := 0;
  titles jsonb := '{"stale":"تنظيف الملفات متأخر","stuck":"تشغيل تنظيف لم ينتهِ","failing":"تنظيف الملفات يفشل"}';
begin
  select max(started_at) into last_ok from file_cleanup_runs where channel=_channel and status='ok' and started_at <= _now;
  select * into last_run from file_cleanup_runs where channel=_channel and started_at <= _now and status <> 'running' order by started_at desc limit 1;
  conds := jsonb_build_object(
    'stale', last_ok is null or last_ok < _now - interval '3 hours',
    'stuck', exists(select 1 from file_cleanup_runs where channel=_channel and status='running' and started_at < _now - interval '30 minutes'),
    'failing', coalesce(last_run.status = 'failed', false)
       or (_channel = 'live' and exists(select 1 from files where source_type='cleanup_due' and cleanup_error in ('max_attempts','missing_credentials'))));
  recips := coalesce(_notify_to, array(select user_id from platform_admins));
  for k in select jsonb_object_keys(conds) loop
    on_ := (conds->>k)::boolean;
    select * into a from cleanup_alerts where channel=_channel and kind=k and resolved_at is null;
    if on_ and a.id is null then
      insert into cleanup_alerts(channel, kind, details, opened_at, last_checked_at)
        values (_channel, k, jsonb_build_object('last_success', last_ok), _now, _now) returning * into a;
      opened := opened + 1;
      foreach u in array recips loop
        perform _notify(u, null, 'system', titles->>k, 'آخر نجاح: ' || coalesce(to_char(last_ok, 'YYYY-MM-DD HH24:MI'), 'لا يوجد'), '/app/platform', 'cleanup-alert:' || a.id);
      end loop;
    elsif on_ then
      update cleanup_alerts set last_checked_at=_now where id=a.id;
    elsif a.id is not null then
      update cleanup_alerts set resolved_at=_now, last_checked_at=_now where id=a.id;
      resolved := resolved + 1;
      foreach u in array recips loop
        perform _notify(u, null, 'system', 'عاد تنظيف الملفات للعمل', 'انتهى التنبيه: ' || (titles->>k), '/app/platform', 'cleanup-recovered:' || a.id);
      end loop;
    end if;
  end loop;
  return conds || jsonb_build_object('opened', opened, 'resolved', resolved, 'last_success', last_ok);
end $function$;
revoke all on function public.check_cleanup_health(timestamptz, text, uuid[]) from public, anon, authenticated;
grant execute on function public.check_cleanup_health(timestamptz, text, uuid[]) to service_role;

-- platform-admin read of the live state (no file names, no school data)
create or replace function public.cleanup_health()
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  if not is_platform_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object(
    'last_start', (select max(started_at) from file_cleanup_runs where channel='live'),
    'last_success', (select max(started_at) from file_cleanup_runs where channel='live' and status='ok'),
    'last_failure', (select max(started_at) from file_cleanup_runs where channel='live' and status='failed'),
    'last_run', (select to_jsonb(r) - 'channel' from (select started_at, finished_at, status, marked, rows_removed, delete_requests, failed from file_cleanup_runs where channel='live' order by started_at desc limit 1) r),
    'stuck_files', (select count(*) from files where source_type='cleanup_due' and cleanup_error is not null),
    'open_alerts', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'opened_at', opened_at)) from cleanup_alerts where channel='live' and resolved_at is null), '[]'));
end $function$;
revoke all on function public.cleanup_health() from public, anon;
grant execute on function public.cleanup_health() to authenticated;

do $$ begin
  perform cron.unschedule('rikaz-cleanup-monitor') where exists(select 1 from cron.job where jobname='rikaz-cleanup-monitor');
  perform cron.schedule('rikaz-cleanup-monitor', '37 * * * *', 'select public.check_cleanup_health()');
end $$;