create or replace function public.sf_search_index(_school uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 perform _sf_guard(_school,'view');
 return coalesce((select jsonb_object_agg(st.id, concat_ws(' ', st.full_name, st.national_id, st.csmart_no,
   (select string_agg(concat_ws(' ', g.full_name, g.national_id, g.phone), ' ') from student_guardians sg join guardians g on g.id=sg.guardian_id where sg.student_id=st.id)))
  from students st where st.school_id=_school),'{}'::jsonb);
end $$;
revoke all on function public.sf_search_index(uuid) from public, anon;
grant execute on function public.sf_search_index(uuid) to authenticated;