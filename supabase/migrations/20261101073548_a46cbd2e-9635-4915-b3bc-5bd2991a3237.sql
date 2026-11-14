revoke execute on function public._course_title(uuid) from public, anon, authenticated;
revoke execute on function public.my_class_groups(uuid) from public, anon;
revoke execute on function public.course_roster(uuid) from public, anon;
grant execute on function public.my_class_groups(uuid) to authenticated;
grant execute on function public.course_roster(uuid) to authenticated;