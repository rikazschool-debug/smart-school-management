CREATE OR REPLACE FUNCTION public._au_lo() RETURNS uuid LANGUAGE sql STABLE SET search_path TO 'public'
AS $f$ select coalesce(nullif(current_setting('au.win_eq', true),'')::uuid, nullif(current_setting('au.win_after', true),'')::uuid, '00000000-0000-0000-0000-000000000000'::uuid) $f$;
CREATE OR REPLACE FUNCTION public._au_hi() RETURNS uuid LANGUAGE sql STABLE SET search_path TO 'public'
AS $f$ select coalesce(nullif(current_setting('au.win_eq', true),'')::uuid, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid) $f$;
CREATE OR REPLACE FUNCTION public._au_ex() RETURNS uuid LANGUAGE sql STABLE SET search_path TO 'public'
AS $f$ select case when nullif(current_setting('au.win_eq', true),'') is null then nullif(current_setting('au.win_after', true),'')::uuid end $f$;
DO $do$
declare f text; d text; n int; begin
 foreach f in array array['_api_rows','_api_rows_v2','_api_rows_v3','_api_rows_v4'] loop
   d := pg_get_functiondef(('public.'||f||'(text,uuid,uuid[],boolean,uuid[],uuid[],uuid[],uuid[],uuid[],uuid[],uuid,uuid)')::regprocedure);
   n := (select count(*) from regexp_matches(d, 'public\._au_win\((\w+)\.id\)', 'g'));
   d := regexp_replace(d, 'public\._au_win\((\w+)\.id\)', '\1.id between public._au_lo() and public._au_hi() and \1.id is distinct from public._au_ex()', 'g');
   raise notice '% rewrote %', f, n;
   execute d;
 end loop;
end $do$;