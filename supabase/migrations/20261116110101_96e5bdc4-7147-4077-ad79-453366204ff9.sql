DO $$
DECLARE d text; fn text;
BEGIN
 FOREACH fn IN ARRAY ARRAY['private.edu_stats(uuid,text,jsonb)','private.edu_find(uuid,text,jsonb,integer,integer)'] LOOP
  SELECT pg_get_functiondef(fn::regprocedure) INTO d;
  IF position('f.goal_index IS NOT NULL' in d)=0 THEN RAISE EXCEPTION 'pattern missing in %', fn; END IF;
  d:=replace(d,'f.goal_index IS NOT NULL','f.goal_index IS NOT NULL AND f.mark=''activity''');
  EXECUTE d;
 END LOOP;
END $$;