create function public.sv3_file_access(_file uuid,_write boolean default false) returns boolean language sql stable security invoker set search_path=public as $$ select private._sv3_file_ok(_file,_write) $$;
grant usage on schema private to authenticated;
grant execute on function private._sv3_file_ok(uuid,boolean) to authenticated;
revoke all on function public.sv3_file_access(uuid,boolean) from public,anon; grant execute on function public.sv3_file_access(uuid,boolean) to authenticated;
create policy sv3_storage_read_scope on storage.objects as restrictive for select to authenticated using(bucket_id<>'rikaz-files' or not exists(select 1 from public.files f where f.storage_path=objects.name and f.source_type='sv_evidence') or exists(select 1 from public.files f where f.storage_path=objects.name and f.source_type='sv_evidence' and public.sv3_file_access(f.id,false)));
create policy sv3_storage_upload_scope on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'rikaz-files' or not exists(select 1 from public.files f where f.storage_path=objects.name and f.source_type='sv_evidence') or exists(select 1 from public.files f where f.storage_path=objects.name and f.source_type='sv_evidence' and public.sv3_file_access(f.id,true)));
create policy sv3_files_read_scope on public.files as restrictive for select to authenticated using(source_type<>'sv_evidence' or public.sv3_file_access(id,false));
create index on public.sv_evidence(plan_id); create index on public.sv_evidence(visit_id); create index on public.sv_evidence(recommendation_id); create index on public.sv_followup_sessions(recommendation_id);
-- Wrapper signatures and return types preserved; all implementation access checks stay inside private.
do $$ declare p record; args text; callargs text; rettype text; begin
 for p in select proc.oid,proc.proname,proc.proargnames,proc.prorettype from pg_proc proc join pg_namespace n on n.oid=proc.pronamespace where n.nspname='public' and proc.proname like 'sv3_%' and proc.prosecdef loop
 args:=pg_get_function_arguments(p.oid); rettype:=pg_get_function_result(p.oid);
 select string_agg(quote_ident(x),',') into callargs from unnest(p.proargnames) x;
 execute format('alter function public.%I(%s) set schema private',p.proname,pg_get_function_identity_arguments(p.oid));
 execute format('revoke all on function private.%I(%s) from public,anon',p.proname,pg_get_function_identity_arguments(p.oid));
 execute format('grant execute on function private.%I(%s) to authenticated',p.proname,pg_get_function_identity_arguments(p.oid));
 execute format('create function public.%I(%s) returns %s language sql security invoker set search_path=public as %L',p.proname,args,rettype,'select private.'||quote_ident(p.proname)||'('||callargs||')');
 execute format('revoke all on function public.%I(%s) from public,anon',p.proname,pg_get_function_identity_arguments(p.oid));
 execute format('grant execute on function public.%I(%s) to authenticated',p.proname,pg_get_function_identity_arguments(p.oid));
 end loop;
 end $$;