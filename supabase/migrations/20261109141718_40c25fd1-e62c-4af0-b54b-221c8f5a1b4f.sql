CREATE OR REPLACE FUNCTION public.bc_people(_org uuid, _t jsonb, _q text, _ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare t jsonb := _bc_target(_org, _t, 'draft'); q text := nullif(btrim(coalesce(_q,'')),'');
begin
  if q is not null then q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_'); end if;
  t := jsonb_set(t, '{mode}', '"all"');
  return coalesce((select jsonb_agg(z order by z->>'name') from (select jsonb_build_object('user_id',p.user_id,'name',coalesce(pr.full_name,'—'),'category',p.category,'category_label',_bc_cat_label(p.category),'school',s.name) z
    from (select * from _bc_pool(t) p0 where (_ids is null or p0.user_id = any(_ids))) p left join profiles pr on pr.id=p.user_id join schools s on s.id=p.school_id
    where (q is null or pr.full_name ilike '%' || q || '%')
    order by pr.full_name limit 500) w), '[]');
end $function$;