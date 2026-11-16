DO $$
DECLARE d text;
BEGIN
 SELECT pg_get_functiondef('private.edu_stats(uuid,text,jsonb)'::regprocedure) INTO d;
 d:=replace(d,$x$'open',(SELECT count(*) FROM r WHERE status IN ('open','following'))$x$,$x$'open',(SELECT count(*) FROM r WHERE status IN ('open','following','ready','active','review'))$x$);
 IF position($x$'ready','active','review'$x$ in d)=0 THEN RAISE EXCEPTION 'edu_stats patch did not apply'; END IF;
 EXECUTE d;
 SELECT pg_get_functiondef('private.edu_plan_check(jsonb)'::regprocedure) INTO d;
 d:=replace(d,$x$ IF st='draft' THEN RETURN; END IF;$x$,$x$ IF st='draft' AND coalesce((_p->>'shared')::boolean,false) THEN RAISE EXCEPTION 'لا تُشارك المسودة مع ولي الأمر'; END IF;
 IF st='draft' THEN RETURN; END IF;$x$);
 IF position('لا تُشارك المسودة' in d)=0 THEN RAISE EXCEPTION 'plan_check patch did not apply'; END IF;
 EXECUTE d;
END $$;