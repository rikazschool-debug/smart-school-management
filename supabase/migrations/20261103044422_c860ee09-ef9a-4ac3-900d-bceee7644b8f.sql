do $$ declare def text; begin
  select pg_get_functiondef('public.upsert_student_guardian(uuid,text,text,text,text)'::regprocedure) into def;
  if position('ph text := nullif(regexp_replace(coalesce(_phone,''''),''\D'',''''''''g''),'''')' in def) = 0 and position('ph text := nullif(regexp_replace(coalesce(_phone,''''),''\D'','''',''g''),'''')' in def) = 0 then raise exception 'upsert_student_guardian body changed'; end if;
  def := replace(def, 'ph text := nullif(regexp_replace(coalesce(_phone,''''),''\D'','''',''g''),'''')', 'ph text := coalesce(norm_phone(_phone), nullif(regexp_replace(coalesce(_phone,''''),''\D'','''',''g''),''''))');
  def := replace(def, '(ph is not null and regexp_replace(coalesce(x.phone,''''),''\D'','''',''g'')=ph)', '(ph is not null and (regexp_replace(coalesce(x.phone,''''),''\D'','''',''g'')=ph or norm_phone(x.phone)=ph))');
  if position('norm_phone(_phone)' in def) = 0 or position('norm_phone(x.phone)=ph' in def) = 0 then raise exception 'replace failed'; end if;
  execute def;
end $$;