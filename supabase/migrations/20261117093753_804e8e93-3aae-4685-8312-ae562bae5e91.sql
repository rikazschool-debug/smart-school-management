do $$ declare d text; begin
 d:=pg_get_functiondef('private.sv5_res_save(uuid,integer,jsonb)'::regprocedure);
 d:=replace(d, $o$'(معتمد|اعتماد) (رسمي|رسميًا|من الوزارة)'$o$, $n$'(معتمد|معتمدة|اعتماد|مُعتمد|مُعتمدة)\s*(رسمي|رسمية|رسميا|رسميًا|من الوزارة|من وزارة)'$n$);
 if position('معتمدة|اعتماد|مُعتمد' in d)=0 then raise exception 'pattern not replaced'; end if;
 execute d; end $$;