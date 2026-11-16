DO $mig$ DECLARE d text; BEGIN
 d := pg_get_functiondef('private._edu_ref_limited(edu_records)'::regprocedure);
 d := replace(d, $o$'ref_tips','ref_open_case')$o$, $n$'ref_tips')$n$);
 IF position('ref_open_case' in d)>0 THEN RAISE EXCEPTION 'patch failed'; END IF;
 EXECUTE d;
END $mig$;