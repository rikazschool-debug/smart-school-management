DO $mig$ DECLARE d text; BEGIN
 d := pg_get_functiondef('private.edu_ref_act(uuid,integer,text,jsonb)'::regprocedure);
 d := replace(d, $o$'[]','open',coalesce(pr,r.priority)$o$, $n$'[]','draft',coalesce(pr,r.priority)$n$);
 IF position($q$'[]','draft'$q$ in d)=0 THEN RAISE EXCEPTION 'p1'; END IF; EXECUTE d;
 d := pg_get_functiondef('private.edu_guidance_board(uuid)'::regprocedure);
 d := replace(d, $o$kind='case' AND status IN ('open','following')$o$, $n$kind='case' AND status IN ('draft','open','following')$n$);
 IF position($q$('draft','open','following')$q$ in d)=0 THEN RAISE EXCEPTION 'p2'; END IF; EXECUTE d;
END $mig$;