-- Internal grade/homework helpers return data without their own permission check; they are only called from other server-side functions.
REVOKE EXECUTE ON FUNCTION public._gb_roster(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._gb_total(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._gb_course_label(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._hw_join_trg() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._gb_roster(uuid), public._gb_total(uuid, uuid), public._gb_course_label(uuid) TO service_role;