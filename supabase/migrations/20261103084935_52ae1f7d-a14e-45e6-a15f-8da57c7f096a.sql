-- Support tables are RPC-only: no direct client privileges (defense in depth on top of RLS with no policies).
REVOKE ALL ON public.support_tickets, public.support_messages, public.support_message_revisions, public.support_events,
  public.support_notes, public.support_info_requests FROM anon, authenticated;
GRANT ALL ON public.support_tickets, public.support_messages, public.support_message_revisions, public.support_events,
  public.support_notes, public.support_info_requests TO service_role;
-- categories/settings: signed-in read only (policies already target authenticated)
REVOKE ALL ON public.support_categories, public.support_settings FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.support_categories, public.support_settings FROM authenticated;
GRANT SELECT ON public.support_categories, public.support_settings TO authenticated;
REVOKE EXECUTE ON FUNCTION public._support_add_work(timestamptz, numeric, integer[], time, time) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._support_add_work(timestamptz, numeric, integer[], time, time) TO service_role;