DROP FUNCTION IF EXISTS public._au_fin_parity(uuid);
CREATE OR REPLACE FUNCTION public._au_fin_parity(_org uuid DEFAULT NULL, _after uuid DEFAULT NULL, _lim int DEFAULT 2000)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
declare ids uuid[]; res jsonb; begin
 ids := array(select b.id from sf_obligations b join schools s on s.id=b.school_id
              where (_org is null or s.org_id=_org) and (_after is null or b.id > _after) order by b.id limit greatest(least(_lim,5000),1));
 with tw as (select * from _sf_balances(ids)),
 cmp as (select o.id, o.kind, o.status, o.year_id, o.term, o.due_date, o.student_id, tw.bal t, _sf_balance(o.id) c
         from sf_obligations o left join tw on tw.obligation_id=o.id where o.id = any(ids))
 select jsonb_build_object(
   'checked', count(*), 'last', (select max(x) from unnest(ids) x), 'mismatches', count(*) filter (where t is distinct from c),
   'mismatch_ids', coalesce((jsonb_agg(id) filter (where t is distinct from c)) -> 0, 'null'),
   'cases', jsonb_build_object(
     'tuition', count(*) filter (where kind='tuition'), 'transport', count(*) filter (where kind='transport'),
     'exempt', count(*) filter (where status='exempt'),
     'discount_fixed', count(*) filter (where exists(select 1 from sf_applied a join sf_discounts d on d.id=a.discount_id where a.obligation_id=cmp.id and d.value_type='fixed')),
     'discount_percent', count(*) filter (where exists(select 1 from sf_applied a join sf_discounts d on d.id=a.discount_id where a.obligation_id=cmp.id and d.value_type='percent')),
     'discount_sibling', count(*) filter (where exists(select 1 from sf_applied a join sf_discounts d on d.id=a.discount_id where a.obligation_id=cmp.id and d.sibling_min is not null)),
     'discount_inactive', count(*) filter (where exists(select 1 from sf_applied a where a.obligation_id=cmp.id and not a.active)),
     'paid_partial', count(*) filter (where (c->>'recorded')::numeric > 0 and (c->>'remaining')::numeric > 0),
     'paid_full', count(*) filter (where (c->>'recorded')::numeric > 0 and (c->>'remaining')::numeric = 0),
     'reversed_payment', count(*) filter (where exists(select 1 from sf_allocations x join sf_collections k on k.id=x.collection_id where x.obligation_id=cmp.id and k.status='reversed')),
     'credit_in', count(*) filter (where (c->>'credit_in')::numeric > 0), 'credit_out', count(*) filter (where (c->>'credit_out')::numeric > 0),
     'overpaid_credit', count(*) filter (where (c->>'credit')::numeric > 0),
     'overdue', count(*) filter (where due_date < school_today() and (c->>'remaining')::numeric > 0),
     'years', count(distinct year_id), 'terms', count(distinct term),
     'withdrawn_student', count(*) filter (where exists(select 1 from students st where st.id=cmp.student_id and st.status <> 'active')),
     'unpaid', count(*) filter (where (c->>'recorded')::numeric = 0)))
 into res from cmp;
 return res;
end $f$;
REVOKE ALL ON FUNCTION public._au_fin_parity(uuid, uuid, int) FROM PUBLIC, anon, authenticated;