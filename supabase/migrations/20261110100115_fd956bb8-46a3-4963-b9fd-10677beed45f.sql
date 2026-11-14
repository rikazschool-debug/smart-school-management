CREATE TABLE public.acct_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  guardian_id uuid NOT NULL REFERENCES public.guardians(id) ON DELETE CASCADE,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  detail text,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (guardian_id)
);
GRANT ALL ON public.acct_outbox TO service_role;
ALTER TABLE public.acct_outbox ENABLE ROW LEVEL SECURITY;

-- staff who can see the family records read the message state of their school (no phone numbers are stored here)
CREATE OR REPLACE FUNCTION public.acct_outbox_state(_school uuid)
RETURNS TABLE(guardian_id uuid, status text, sent_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select o.guardian_id, o.status, o.sent_at from acct_outbox o
  where o.school_id = _school and auth.uid() is not null and (can_manage_students(_school) or can_edit_students(_school))
$$;
REVOKE ALL ON FUNCTION public.acct_outbox_state(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.acct_outbox_state(uuid) TO authenticated;