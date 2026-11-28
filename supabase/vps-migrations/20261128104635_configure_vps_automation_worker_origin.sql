-- VPS-only environment prerequisite. Never copy the preview endpoint or its key.
-- The later shared worker migration generates a fresh secret only if absent.
-- An existing unexpected endpoint is a review blocker, never silently overwritten.
do $worker_origin$
declare current_url text;
begin
  select decrypted_secret into current_url
  from vault.decrypted_secrets where name='rikaz_au_worker_url';
  if current_url is null then
    perform vault.create_secret(
      'https://app.kalmalki.com/api/internal/automation/worker',
      'rikaz_au_worker_url','VPS production automation file worker endpoint');
  elsif current_url <> 'https://app.kalmalki.com/api/internal/automation/worker' then
    raise exception 'Existing automation worker origin requires explicit review';
  end if;
end $worker_origin$;
