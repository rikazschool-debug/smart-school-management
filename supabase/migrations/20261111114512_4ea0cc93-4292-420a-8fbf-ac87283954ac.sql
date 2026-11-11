create function public._ws_granted(_school uuid,_section text,_action text) returns boolean language sql stable security definer set search_path=public as $$ select auth.uid() is not null and _perm_granted(_school,auth.uid(),_section,_action) $$;
revoke all on function public._ws_granted(uuid,text,text) from public,anon;
grant execute on function public._ws_granted(uuid,text,text) to authenticated,service_role;
comment on function public._ws_granted(uuid,text,text) is 'Intentional authenticated SECURITY DEFINER self-session-only explicit-grant boolean for RLS; cannot inspect another user or mutate permissions.';
alter policy "assign insert" on public.teacher_assignments with check (_ws_ok(school_id,'course_assignments','assign') and (is_school_principal(school_id) or _ws_granted(school_id,'course_assignments','assign') or is_dept_course(course_id)) and status='pending');
alter policy "workspace assignments read" on public.teacher_assignments using (_ws_view(school_id,'course_assignments') and (not has_school_role(school_id,array['dept_head']::app_role[]) or is_dept_course(course_id) or _ws_granted(school_id,'course_assignments','view') or _ws_granted(school_id,'course_assignments','assign')));
alter policy "workspace courses read" on public.courses using (_ws_view(school_id,'course_setup') or (_ws_view(school_id,'course_assignments') and (not has_school_role(school_id,array['dept_head']::app_role[]) or is_dept_course(id) or _ws_granted(school_id,'course_assignments','view') or _ws_granted(school_id,'course_assignments','assign'))) or _ws_view(school_id,'schedule_drafts') or _ws_view(school_id,'schedule_requirements'));
do $$ declare r record; begin
 for r in select * from pg_policies where schemaname='public' and tablename in ('adm_tasks','adm_requests') and (qual like '%_adm_can_read_task_pre334%' or qual like '%_adm_can_read_request_pre334%') loop
 execute format('alter policy %I on public.%I using (%s)',r.policyname,r.tablename,replace(replace(r.qual,'_adm_can_read_task_pre334','adm_can_read_task'),'_adm_can_read_request_pre334','adm_can_read_request'));
 end loop;
end $$;
notify pgrst,'reload schema';