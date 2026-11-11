create or replace function public._ws_ok(_school uuid,_section text,_action text) returns boolean language plpgsql stable security definer set search_path=public as $$ begin
 if auth.uid() is null or not exists(select 1 from schools where id=_school and is_active) then return false; end if;
 if _perm_owner(auth.uid(),school_org(_school)) then return true; end if;
 return coalesce(_perm_allows_user(_school,auth.uid(),_section,_action),false);
end $$;
create or replace function public._ws_view(_school uuid,_section text) returns boolean language plpgsql stable security definer set search_path=public as $$ declare actions text[]; a text; begin
 if auth.uid() is null or _perm_denied(school_org(_school),auth.uid(),_section,'view') then return false; end if;
 actions:=case _section when 'course_setup' then array['view','create','edit'] when 'course_assignments' then array['view','assign','approve','cancel'] when 'admin_tasks' then array['view','create','manage'] when 'admin_requests' then array['view','submit','manage'] when 'schedule_drafts' then array['view','create','edit','generate','publish','revise'] else array['view','edit'] end;
 foreach a in array actions loop if _ws_ok(_school,_section,a) then return true; end if; end loop;
 return false;
end $$;
create or replace function public._perm_base(_school uuid,_uid uuid,_section text,_action text) returns boolean language plpgsql stable security definer set search_path=public as $$ begin
 if _section not in ('academic_years','academic_terms','academic_stages','academic_grades','academic_sections','academic_departments','academic_subjects','academic_scopes','course_setup','course_assignments','admin_tasks','admin_requests','admin_forms','schedule_drafts','schedule_day','schedule_rooms','schedule_requirements','schedule_loads','schedule_availability','schedule_sub_policy') then return _perm_base_pre334(_school,_uid,_section,_action); end if;
 if _perm_owner(_uid,school_org(_school)) then return true; end if;
 return exists(select 1 from memberships m where m.school_id=_school and m.user_id=_uid and m.is_active and not coalesce(m.branch_suspended,false) and case when _section like 'academic\_%' or _section like 'schedule\_%' or _section='course_setup' then m.role='principal' when _section='course_assignments' then m.role in ('principal','dept_head') or (_action='view' and m.role in ('vice_principal','student_affairs')) when _section='admin_tasks' then case when _action in ('create','manage') then m.role in ('principal','vice_principal','supervisor') else m.role not in ('student','guardian') end when _section='admin_requests' then m.role not in ('student','guardian') when _section='admin_forms' then m.role='principal' else false end);
end $$;
comment on function public._ws_view(uuid,text) is 'Intentional authenticated SECURITY DEFINER self-session read permission; explicit denial first, fixed action list, same branch authorization without repeated SQL expansion.';
notify pgrst,'reload schema';