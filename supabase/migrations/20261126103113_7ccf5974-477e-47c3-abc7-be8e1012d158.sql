DO $d$ declare d text; begin
 d := pg_get_functiondef('public._au_fin_parity(uuid,uuid,int)'::regprocedure);
 d := replace(d, '(select max(x) from unnest(ids) x)', 'ids[array_length(ids,1)]');
 execute d;
end $d$;
REVOKE ALL ON FUNCTION public._au_fin_parity(uuid, uuid, int) FROM PUBLIC, anon, authenticated;