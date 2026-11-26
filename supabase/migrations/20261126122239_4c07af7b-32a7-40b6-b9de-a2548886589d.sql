ALTER TABLE public.au_reports ADD COLUMN IF NOT EXISTS school_name text, ADD COLUMN IF NOT EXISTS rule_name text;
CREATE OR REPLACE FUNCTION public._au_reports_names_trg() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ begin
 new.school_name := (select name from schools where id=new.school_id);
 new.rule_name := (select name from au_rules where id=new.rule_id);
 return new; end $$;
REVOKE ALL ON FUNCTION public._au_reports_names_trg() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER au_reports_names BEFORE INSERT ON public.au_reports FOR EACH ROW EXECUTE FUNCTION public._au_reports_names_trg();

GRANT SELECT ON public.au_reports TO authenticated;
GRANT SELECT ON public.au_report_access TO authenticated;
CREATE POLICY "own report shares" ON public.au_report_access FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "shared or system manager reads reports" ON public.au_reports FOR SELECT TO authenticated USING (
  is_org_owner(org_id)
  OR (EXISTS (SELECT 1 FROM public.au_report_access a WHERE a.report_id = au_reports.id AND a.user_id = auth.uid())
      AND EXISTS (SELECT 1 FROM public.memberships m WHERE m.user_id = auth.uid() AND m.org_id = au_reports.org_id AND m.is_active AND NOT coalesce(m.branch_suspended,false))));
CREATE POLICY "no direct access" ON public.au_step_out FOR SELECT TO authenticated USING (false);
CREATE POLICY "no direct access" ON public.au_update_fields FOR SELECT TO authenticated USING (false);

CREATE OR REPLACE FUNCTION public.au_reports_list(_org uuid)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $$ select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'title',r.title,'school',r.school_name,'created_at',r.created_at,'rows',r.row_count,'source',r.source,'rule',r.rule_name) order by r.created_at desc), '[]'::jsonb)
  from (select * from au_reports x where x.org_id=_org order by x.created_at desc limit 200) r $$;

CREATE OR REPLACE FUNCTION public.au_report_get(_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path TO 'public'
AS $function$ declare r au_reports; begin
 select * into r from au_reports where id=_id;
 if r.id is null then raise exception 'لا تملك صلاحية فتح هذا التقرير' using errcode='42501'; end if;
 return jsonb_build_object('id',r.id,'title',r.title,'school',r.school_name,'created_at',r.created_at,'source',r.source,
   'columns',r.columns,'rows',r.rows,'summary',r.summary,'row_count',r.row_count,'truncated',r.truncated,'period_from',r.period_from,'period_to',r.period_to,'rule',r.rule_name);
end $function$;
DROP FUNCTION IF EXISTS public._au_rep_ok(au_reports);