-- Restore the original single-obligation balance body (unchanged finance behaviour and speed).
-- _sf_balances(uuid[]) stays as its set-based twin for bulk automation reads; tests compare both.
CREATE OR REPLACE FUNCTION public._sf_balance(_ob uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 with a as(select b.amount,
  coalesce((select sum(x.amount) from sf_applied x where x.obligation_id=b.id and x.active),0) discount,
  coalesce((select sum(x.amount) from sf_allocations x join sf_collections c on c.id=x.collection_id where x.obligation_id=b.id and c.status<>'reversed'),0) cash,
  coalesce((select sum(m.amount) from sf_credit_moves m where m.target_obligation_id=b.id),0) cin,
  coalesce((select sum(m.amount) from sf_credit_moves m where m.source_obligation_id=b.id),0) cout
  from sf_obligations b where b.id=_ob)
 select jsonb_build_object('gross',amount,'discount',discount,'net',greatest(0,amount-discount),'recorded',cash+cin-cout,'cash',cash,'credit_in',cin,'credit_out',cout,
  'remaining',greatest(0,greatest(0,amount-discount)-(cash+cin-cout)),'credit',greatest(0,(cash+cin-cout)-greatest(0,amount-discount))) from a $function$;