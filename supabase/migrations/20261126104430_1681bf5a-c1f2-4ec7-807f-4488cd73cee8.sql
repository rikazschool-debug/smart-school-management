DO $do$
declare f text; src text; p regprocedure; begin
 foreach f in array array['_api_rows','_api_rows_v2','_api_rows_v3','_api_rows_v4'] loop
   p := ('public.'||f||'(text,uuid,uuid[],boolean,uuid[],uuid[],uuid[],uuid[],uuid[],uuid[],uuid,uuid)')::regprocedure;
   select prosrc into src from pg_proc where oid = p;
   if (select l.lanname from pg_proc x join pg_language l on l.oid=x.prolang where x.oid=p) = 'plpgsql' then continue; end if;
   src := regexp_replace(src, ';\s*$', '');
   execute format($q$CREATE OR REPLACE FUNCTION public.%I(_res text, _org uuid, _sch uuid[], _all boolean, _yrs uuid[], _terms uuid[], _secs uuid[], _stages uuid[], _grades uuid[], _stu uuid[], _id uuid, _key uuid)
     RETURNS SETOF jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' SET plan_cache_mode TO 'force_custom_plan'
     AS %L$q$, f, E'begin\nreturn query\n' || src || E';\nend');
 end loop;
end $do$;