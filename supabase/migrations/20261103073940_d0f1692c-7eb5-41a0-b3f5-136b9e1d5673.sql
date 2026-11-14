create or replace function public.support_my_children(_school uuid)
returns table(id uuid, full_name text) language sql stable security definer set search_path=public as $$
  select s.id, s.full_name from student_guardians sg join guardians g on g.id=sg.guardian_id join students s on s.id=sg.student_id
  where g.user_id=auth.uid() and sg.verified and sg.can_follow and s.school_id=_school order by s.full_name $$;
revoke all on function public.support_my_children(uuid) from public, anon;
grant execute on function public.support_my_children(uuid) to authenticated;