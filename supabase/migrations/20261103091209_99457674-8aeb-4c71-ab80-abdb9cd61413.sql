-- Internal relationship checks that take arbitrary ids and don't check the caller: only server-side functions use them.
REVOKE EXECUTE ON FUNCTION public._eligible_staff(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._family_ok(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._file_policy(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._gb_has_dept(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._student_ok(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._teaches_section(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._eligible_staff(uuid, uuid, uuid), public._family_ok(uuid, uuid, uuid, text), public._file_policy(uuid),
  public._gb_has_dept(uuid), public._student_ok(uuid, uuid), public._teaches_section(uuid, uuid) TO service_role;