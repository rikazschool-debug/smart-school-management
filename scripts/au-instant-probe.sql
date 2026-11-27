-- Test-only probe: for every au_source_tables row, creates probe on_change rules inside a transaction, fires the statement trigger (update ... where false), compares nudged event codes, then RAISES to roll everything back. Run via the SQL API; expected message: RESULT tables=43 ok=43 bad=[]
do $$ declare o uuid; u uuid; e record; t record; col text; got text[]; exp text[]; bad jsonb := '[]'; ok int := 0; tot int := 0; rid uuid;
begin
  select org_id, created_by into o, u from au_rules limit 1;
  if o is null then select id into o from organizations limit 1; select id into u from auth.users limit 1; end if;
  for e in select distinct event_code from au_source_tables loop
    insert into au_rules(org_id,name,event_code,draft,approved_version,active,created_by) values (o,'__inst_probe__',e.event_code,'{}',1,true,u) returning id into rid;
    insert into au_rule_versions(rule_id,version,definition,fingerprint,approved_by) values (rid,1,'{"schedule":{"type":"on_change"}}','probe',u);
  end loop;
  for t in select table_name, array_agg(event_code order by event_code) evs from au_source_tables group by 1 loop
    tot := tot+1;
    select column_name into col from information_schema.columns where table_schema='public' and table_name=t.table_name order by ordinal_position limit 1;
    delete from au_nudges;
    execute format('update public.%I set %I = %I where false', t.table_name, col, col);
    select coalesce(array_agg(distinct event_code order by event_code),'{}') into got from au_nudges;
    if got = t.evs then ok := ok+1; else bad := bad || jsonb_build_object('t',t.table_name,'exp',t.evs,'got',got); end if;
  end loop;
  raise exception 'RESULT tables=% ok=% bad=%', tot, ok, bad;
end $$;
