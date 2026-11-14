create or replace function public._ws_ok_schools(_section text, _action text) returns uuid[] language sql stable security definer set search_path=public as $$
  select coalesce(array_agg(s.id), '{}') from schools s
  where s.is_active and (exists(select 1 from memberships m where m.user_id=auth.uid() and m.school_id=s.id) or _perm_owner(auth.uid(), s.org_id))
    and _ws_ok(s.id, _section, _action) $$;
create or replace function public._ws_view_schools(_section text) returns uuid[] language sql stable security definer set search_path=public as $$
  select coalesce(array_agg(s.id), '{}') from schools s
  where s.is_active and (exists(select 1 from memberships m where m.user_id=auth.uid() and m.school_id=s.id) or _perm_owner(auth.uid(), s.org_id))
    and _ws_view(s.id, _section) $$;
create or replace function public._ws_denied_schools(_section text) returns uuid[] language sql stable security definer set search_path=public as $$
  select coalesce(array_agg(s.id), '{}') from schools s
  where auth.uid() is not null and exists(select 1 from memberships m where m.user_id=auth.uid() and m.org_id=s.org_id)
    and _perm_denied(s.org_id, auth.uid(), _section, 'view') $$;
revoke all on function public._ws_ok_schools(text,text), public._ws_view_schools(text), public._ws_denied_schools(text) from public, anon;
grant execute on function public._ws_ok_schools(text,text), public._ws_view_schools(text), public._ws_denied_schools(text) to authenticated, service_role;
comment on function public._ws_ok_schools(text,text) is 'Intentional authenticated SECURITY DEFINER: session-only list of school ids where the caller holds a workspace permission; used once per query by RLS.';
comment on function public._ws_view_schools(text) is 'Intentional authenticated SECURITY DEFINER: session-only list of school ids where the caller may view a workspace section; used once per query by RLS.';
comment on function public._ws_denied_schools(text) is 'Intentional authenticated SECURITY DEFINER: session-only list of school ids where the caller has an explicit view denial; used once per query by RLS.';

do $m$ declare p record; q text; w text; sql text;
  function_fix text;
begin
  for p in select * from pg_policies where schemaname='public' and (qual ~ '_ws_(ok|view|not_denied)\(school_id' or with_check ~ '_ws_(ok|view|not_denied)\(school_id') loop
    q := p.qual; w := p.with_check;
    q := regexp_replace(q, '_ws_ok\(school_id, ''([a-z_]+)''::text, ''([a-z_]+)''::text\)', '(school_id = ANY ((( SELECT _ws_ok_schools(''\1'', ''\2'')))::uuid[]))', 'g');
    q := regexp_replace(q, '_ws_view\(school_id, ''([a-z_]+)''::text\)', '(school_id = ANY ((( SELECT _ws_view_schools(''\1'')))::uuid[]))', 'g');
    q := regexp_replace(q, '_ws_not_denied\(school_id, ''([a-z_]+)''::text\)', '(NOT (school_id = ANY ((( SELECT _ws_denied_schools(''\1'')))::uuid[])))', 'g');
    w := regexp_replace(w, '_ws_ok\(school_id, ''([a-z_]+)''::text, ''([a-z_]+)''::text\)', '(school_id = ANY ((( SELECT _ws_ok_schools(''\1'', ''\2'')))::uuid[]))', 'g');
    w := regexp_replace(w, '_ws_view\(school_id, ''([a-z_]+)''::text\)', '(school_id = ANY ((( SELECT _ws_view_schools(''\1'')))::uuid[]))', 'g');
    sql := format('alter policy %I on public.%I', p.policyname, p.tablename);
    if q is not null then sql := sql || ' using (' || q || ')'; end if;
    if w is not null then sql := sql || ' with check (' || w || ')'; end if;
    execute sql;
  end loop;
end $m$;

-- write-only policies must not be evaluated for reads
do $m$ declare t text; c text; pol text; begin
  for t, pol, c in select tablename, policyname, coalesce(with_check, qual) from pg_policies where schemaname='public' and cmd='ALL' and tablename in ('timetable_slots','periods','rooms','school_day_settings') and policyname in ('slots write','periods write','rooms write','sds write') loop
    execute format('drop policy %I on public.%I', pol, t);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', pol || ' ins', t, c);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)', pol || ' upd', t, c, c);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)', pol || ' del', t, c);
  end loop;
end $m$;