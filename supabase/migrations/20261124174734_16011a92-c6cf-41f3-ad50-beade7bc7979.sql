-- Accounts list is a read: guard it with student_finance.view (export stays for downloads in the UI).
do $$ declare d text; begin
  d := pg_get_functiondef('public.sf_report(uuid,uuid)'::regprocedure);
  if position('perform _sf_guard(_school,''export'');' in d) = 0 then raise exception 'sf_report guard not found'; end if;
  execute replace(d, 'perform _sf_guard(_school,''export'');', 'perform _sf_guard(_school,''view'');');
end $$;