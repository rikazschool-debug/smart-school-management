DO $do$
declare f text; d text; n int; begin
 foreach f in array array['_api_rows','_api_rows_v2','_api_rows_v3','_api_rows_v4'] loop
   d := pg_get_functiondef(('public.'||f||'(text,uuid,uuid[],boolean,uuid[],uuid[],uuid[],uuid[],uuid[],uuid[],uuid,uuid)')::regprocedure);
   n := (select count(*) from regexp_matches(d, 'order by case when public\._au_lim\(\) is not null then (\w+)\.id end', 'g'));
   d := regexp_replace(d, 'order by case when public\._au_lim\(\) is not null then (\w+)\.id end', 'order by \1.id', 'g');
   raise notice '% rewrote %', f, n;
   execute d;
 end loop;
end $do$;