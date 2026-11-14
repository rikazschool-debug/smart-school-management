do $$ declare d text; begin
  d := pg_get_functiondef('public._hr_at_guard()'::regprocedure);
  d := replace(d, $q$  if tg_op='UPDATE' and tg_table_name='hr_att_punches' and new.device_id is null$q$, $q$  if tg_op='UPDATE' and tg_table_name='hr_att_punches' and new.school_id is null and old.school_id is not null
     and (new.id,new.employee_id,new.at,new.source,new.key,new.device_id) is not distinct from (old.id,old.employee_id,old.at,old.source,old.key,old.device_id) then return new; end if;
  if tg_op='UPDATE' and tg_table_name='hr_att_punches' and new.device_id is null$q$);
  if d not like '%new.school_id is null%' then raise exception 'guard patch failed'; end if;
  execute d;
  for d in select pg_get_functiondef(p.oid) from pg_proc p where p.proname in ('hr_asset_hand','hr_asset_close') and p.pronamespace='public'::regnamespace loop
    d := replace(d, $q$perform _notify(e.user_id,'عهدة جديدة بانتظار إقرارك','استلمت: '||a.name,'/app/my-employment','asset:'||nid)$q$, $q$perform _notify(e.user_id,a.school_id,'hr','عهدة جديدة بانتظار إقرارك','استلمت: '||a.name,'/app/my-employment','asset:'||nid)$q$);
    execute d;
  end loop;
end $$;