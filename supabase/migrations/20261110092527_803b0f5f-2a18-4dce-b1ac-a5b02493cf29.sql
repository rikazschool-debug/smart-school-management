-- staff_view (school-wide read) keeps its previous meaning; it must not follow the new edit permission
create or replace function public.staff_view(_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.can_manage_school(_school) or public.has_school_role(_school, array['student_affairs']::public.app_role[])
      or public.perm_allows(_school, 'people_family', 'view') $$;