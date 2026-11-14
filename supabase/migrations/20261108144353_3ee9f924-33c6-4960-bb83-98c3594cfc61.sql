do $$ declare d text; begin
  select pg_get_functiondef('public.support_create(text,uuid,text,text,text,uuid,uuid,text)'::regprocedure) into d;
  d := replace(d, $x$if _scope='school' and r='org_owner' then raise exception 'مالك المؤسسة يرفع تذاكر الدعم إلى المنصة'; end if;$x$, '');
  execute d;
end $$;