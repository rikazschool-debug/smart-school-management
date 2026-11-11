create or replace function public._perm_valid(_section text,_action text,_scope text) returns boolean language sql immutable set search_path=public as $$
 select case when _section='people_family' then _action in ('view','edit','place') and (_scope is null or _scope in ('branch','org'))
 when _section='people' and _action='tags_manage' then _scope is null or _scope='org'
 when _section='people' then _action in ('view','notes_view','notes_add','notes_edit_others','tags_assign','bulk','export') and (_scope is null or _scope in ('branch','org'))
 else _perm_valid_pre332(_section,_action,_scope) end $$;
comment on function public.student_place(uuid,uuid) is 'Intentionally authenticated SECURITY DEFINER RPC: validates active branch and can_place_students, locks the student and sections, applies capacity trigger and commits transfer atomically. No anonymous execution.';
comment on function public.can_place_students(uuid) is 'Intentionally authenticated authorization helper: derives the caller from auth.uid(), checks active school, owner or explicit placement/edit grant, and placement deny precedence.';