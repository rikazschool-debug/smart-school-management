-- Task/request reads remain identity scoped; permission denials now close the affected section.
alter function public.adm_can_read_task(uuid) rename to _adm_can_read_task_pre334;
create function public.adm_can_read_task(_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from adm_tasks t where t.id=_id and _ws_view(t.school_id,'admin_tasks') and _adm_can_read_task_pre334(_id))
$$;
alter function public.adm_can_read_request(uuid) rename to _adm_can_read_request_pre334;
create function public.adm_can_read_request(_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from adm_requests r where r.id=_id and _ws_view(r.school_id,'admin_requests') and _adm_can_read_request_pre334(_id))
$$;
revoke all on function public._adm_can_read_task_pre334(uuid),public._adm_can_read_request_pre334(uuid) from public,anon,authenticated;
revoke all on function public.adm_can_read_task(uuid),public.adm_can_read_request(uuid) from public,anon;
grant execute on function public.adm_can_read_task(uuid),public.adm_can_read_request(uuid) to authenticated,service_role;
comment on function public.adm_can_read_task(uuid) is 'Intentional authenticated SECURITY DEFINER boolean: current session workspace view and existing task participant/scope checks; no writes.';
comment on function public.adm_can_read_request(uuid) is 'Intentional authenticated SECURITY DEFINER boolean: current session workspace view and existing submitter/handler/privacy checks; no writes.';

do $do$ declare d text; begin
 select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='tt_validate';
 if position('is_school_principal(t.school_id)' in d)>0 then execute replace(d,'is_school_principal(t.school_id)','_ws_view(t.school_id,''schedule_drafts'')');
 elsif position('is_school_principal(_school)' in d)>0 then execute replace(d,'is_school_principal(_school)','_ws_view(_school,''schedule_drafts'')');
 else raise exception 'Missing tt_validate guard'; end if;
end $do$;
-- Extend the single people pool only for explicitly authorized task creation / form handlers.
do $do$ declare d text; begin
 select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='_people_pool';
 d:=overlay(d placing 'begin
 if _purpose in (''task'',''admin_form_handler'') then
 if _school is null or not (case when _purpose=''task'' then _ws_ok(_school,''admin_tasks'',''create'') else _ws_ok(_school,''admin_forms'',''edit'') end) then raise exception ''غير مصرح باختيار المستلمين'' using errcode=''42501''; end if;
 return query select m.user_id,m.school_id,m.role::text from memberships m join schools s on s.id=m.school_id where m.school_id=_school and m.is_active and not coalesce(m.branch_suspended,false) and s.is_active and m.role not in (''student'',''guardian'',''org_owner'') and (case when _purpose=''task'' then _task_target_ok(_school,m.user_id) else true end); return;
 end if;' from position('begin' in d) for length('begin')); execute d;
end $do$;
-- Separate course scheduling settings from arbitrary course identity changes.
create policy "schedule requirements update" on public.courses for update to authenticated using (_ws_ok(school_id,'schedule_requirements','edit')) with check (_ws_ok(school_id,'schedule_requirements','edit'));
create function public._ws_course_columns() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if current_user='postgres' and auth.uid() is null then return new; end if;
 if _ws_ok(old.school_id,'course_setup','edit') then return new; end if;
 if not _ws_ok(old.school_id,'schedule_requirements','edit') or (to_jsonb(new)-array['weekly_periods','daily_max','needs_double','room_kind','day_prefs','updated_at']) is distinct from (to_jsonb(old)-array['weekly_periods','daily_max','needs_double','room_kind','day_prefs','updated_at']) then raise exception 'غير مصرح بتغيير بيانات المقرر' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function public._ws_course_columns() from public,anon,authenticated;
create trigger ws_course_columns before update on public.courses for each row execute function public._ws_course_columns();
-- school_day_settings includes both study days and substitute policy; enforce per-field grants.
create policy "substitute policy settings update" on public.school_day_settings for update to authenticated using (_ws_ok(school_id,'schedule_sub_policy','edit')) with check (_ws_ok(school_id,'schedule_sub_policy','edit'));
create policy "substitute policy settings insert" on public.school_day_settings for insert to authenticated with check (_ws_ok(school_id,'schedule_sub_policy','edit'));
create function public._ws_day_columns() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then return new; end if;
 if tg_op='UPDATE' then
 if new.study_days is distinct from old.study_days and not _ws_ok(old.school_id,'schedule_day','edit') then raise exception 'غير مصرح بتعديل أيام الدراسة' using errcode='42501'; end if;
 if new.subs_in_daily is distinct from old.subs_in_daily and not _ws_ok(old.school_id,'schedule_sub_policy','edit') then raise exception 'غير مصرح بتعديل سياسة البدلاء' using errcode='42501'; end if;
 if new.school_id is distinct from old.school_id then raise exception 'لا يمكن نقل إعدادات الفرع'; end if;
 elsif not _ws_ok(new.school_id,'schedule_day','edit') and new.study_days is distinct from array[0,1,2,3,4] then raise exception 'غير مصرح بتعديل أيام الدراسة' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function public._ws_day_columns() from public,anon,authenticated;
create trigger ws_day_columns before insert or update on public.school_day_settings for each row execute function public._ws_day_columns();
-- Guard unknown combinations without changing any role's legitimate defaults.
create or replace function public._bt_base(_school uuid,_uid uuid,_section text,_action text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from memberships m where m.school_id=_school and m.user_id=_uid and m.is_active and not coalesce(m.branch_suspended,false) and m.role::text=any(case _section||'.'||_action
 when 'bt_schedule.view' then array['principal','vice_principal','student_affairs','dept_head','supervisor','teacher']
 when 'bt_classroom.view' then array['principal','vice_principal','dept_head','supervisor','teacher']
 when 'bt_classroom.post' then array['teacher']
 when 'bt_homework.view' then array['principal','vice_principal','dept_head','supervisor','teacher']
 when 'bt_homework.create' then array['teacher']
 when 'bt_chat_direct.use' then array['principal','vice_principal','student_affairs','dept_head','supervisor','teacher','counselor','nurse','security']
 when 'bt_chat_groups.use' then array['principal','vice_principal','student_affairs','dept_head','supervisor','teacher','counselor','nurse','security']
 when 'bt_my_employment.view' then array['principal','vice_principal','student_affairs','dept_head','supervisor','teacher','counselor','nurse','security'] else array[]::text[] end))
$$;
-- Posting denials apply to edits/deletions too; underlying teacher/author permissions are retained.
create policy "bt posts update" on public.classroom_posts as restrictive for update to authenticated using (not _bt_off('bt_classroom','post') and not _bt_off('bt_classroom','view')) with check (not _bt_off('bt_classroom','post') and not _bt_off('bt_classroom','view'));
create policy "bt posts delete" on public.classroom_posts as restrictive for delete to authenticated using (not _bt_off('bt_classroom','post') and not _bt_off('bt_classroom','view'));
notify pgrst,'reload schema';