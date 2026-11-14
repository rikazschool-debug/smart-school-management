do $$ declare body text; begin
 select prosrc into body from pg_proc where oid='public.can_view_slot(uuid)'::regprocedure;
 if position('select exists' in body)>0 then
 body:=regexp_replace(body,'^\s*select\s+','');
 execute 'create or replace function public.can_view_slot(_slot uuid) returns boolean language plpgsql stable security definer set search_path=public as $f$ begin return ('||body||'); end $f$';
 end if;
end $$;
comment on function public.can_view_slot(uuid) is 'Intentional authenticated SECURITY DEFINER: preserves original slot participant/scope checks; PL/pgSQL boundary prevents repeated RLS query expansion.';