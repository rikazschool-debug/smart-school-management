revoke all on function public._family_admin_roles(uuid) from public, anon, authenticated;
revoke all on function public._student_admin_ok(uuid, uuid) from public, anon, authenticated;
revoke all on function public._class_group_room(uuid) from public, anon, authenticated;
revoke all on function public._section_room_group_trg() from public, anon, authenticated;
revoke all on function public._contact_label(app_role) from public, anon;
revoke execute on function public._conv_link(uuid) from public, anon;
revoke execute on function public.guardian_contacts(uuid) from public, anon;
grant execute on function public.guardian_contacts(uuid) to authenticated;