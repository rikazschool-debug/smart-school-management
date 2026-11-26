REVOKE ALL ON public.au_trace FROM anon, authenticated;
REVOKE ALL ON public.test_pool_claims FROM anon, authenticated;
GRANT ALL ON public.au_trace TO service_role;
GRANT ALL ON public.test_pool_claims TO service_role;
COMMENT ON TABLE public.au_trace IS 'Automation step trace; written by the engine, read only through owner-checked au_job_detail. No direct client access.';
COMMENT ON TABLE public.test_pool_claims IS 'Test harness only: atomic claims on pooled synthetic test logins (service role).';