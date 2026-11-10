do $$ declare f text; begin
  foreach f in array array['public.health_students(uuid,text,text)','public.health_file(uuid)'] loop
    execute replace(pg_get_functiondef(f::regprocedure), 'left join grade_levels gl', 'left join grades gl');
  end loop; end $$;