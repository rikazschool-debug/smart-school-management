-- Extend the test-org purge: clear support ticket children (no org/school column) before the generic pass.
create or replace function public._purge_test_org(_org uuid, _confirm text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  _schools uuid[];
  _tickets uuid[];
  _admin uuid;
  t record;
  pass int;
  _err text := null;
  _deleted int := 0;
  n int;
begin
  if _confirm is distinct from ('purge:' || _org::text) then raise exception 'confirmation mismatch'; end if;
  if _org in ('a9a4b7e2-ab44-4bcf-a1bf-ebce6489f074'::uuid, '916b6457-526a-48d0-b854-85547fb72305'::uuid) then
    raise exception 'protected organization';
  end if;
  if not exists (select 1 from organizations where id = _org) then return jsonb_build_object('ok', true, 'missing', true); end if;
  select array_agg(id) into _schools from schools where org_id = _org;
  _schools := coalesce(_schools, '{}');
  select user_id into _admin from platform_admins order by created_at limit 1;
  perform set_config('request.jwt.claim.sub', coalesce(_admin::text, ''), true);
  perform set_config('request.jwt.claims', json_build_object('sub', _admin, 'role', 'authenticated')::text, true);
  perform set_config('rikaz.hr_purge', _org::text, true);

  select array_agg(id) into _tickets from support_tickets where org_id = _org or school_id = any(_schools);
  if _tickets is not null then
    delete from support_messages where ticket_id = any(_tickets);
    delete from support_events where ticket_id = any(_tickets);
    delete from support_info_requests where ticket_id = any(_tickets);
    delete from support_notes where ticket_id = any(_tickets);
    update support_tickets set linked_ticket = null where linked_ticket = any(_tickets);
    delete from support_tickets where id = any(_tickets);
  end if;

  for pass in 1..8 loop
    for t in
      select c.table_name, c.column_name from information_schema.columns c
      join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
      where c.table_schema = 'public' and c.column_name in ('org_id', 'school_id') and c.table_name not in ('organizations', 'schools')
    loop
      begin
        if t.column_name = 'org_id' then
          execute format('delete from public.%I where org_id = $1', t.table_name) using _org;
        else
          execute format('delete from public.%I where school_id = any($1)', t.table_name) using _schools;
        end if;
        get diagnostics n = row_count; _deleted := _deleted + n;
      exception when others then null;
      end;
    end loop;
    begin
      delete from schools where org_id = _org;
      delete from organizations where id = _org;
      _err := null;
      exit;
    exception when others then _err := sqlerrm;
    end;
  end loop;
  perform set_config('rikaz.hr_purge', '', true);
  return jsonb_build_object('ok', _err is null, 'error', _err, 'rows', _deleted);
end $$;

revoke all on function public._purge_test_org(uuid, text) from public, anon, authenticated;
grant execute on function public._purge_test_org(uuid, text) to service_role;