do $$ declare f text; def text; begin
  foreach f in array array['_meet_busy','adm_calendar','adm_daily_reminders','adm_summary'] loop
    select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=f;
    if position('x.rsvp <> ''declined''' in def) = 0 then raise exception '% body changed', f; end if;
    def := replace(def, 'x.rsvp <> ''declined''', 'x.rsvp not in (''declined'',''rejected'')');
    execute def;
  end loop;
end $$;