do $do$ declare d text; begin
  d := pg_get_functiondef('public.hr_letter_request(uuid,uuid,text,text)'::regprocedure);
  d := replace(d, '  if exists(select 1 from hr_letters where employee_id=emp and template_id=_template',
    '  perform 1 from hr_employees where id=emp for update; -- serialise concurrent requests of one employee
  if exists(select 1 from hr_letters where employee_id=emp and template_id=_template');
  if d not like '%for update; -- serialise%' then raise exception 'patch failed'; end if;
  execute d;
end $do$;