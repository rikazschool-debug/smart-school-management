CREATE OR REPLACE FUNCTION public._au_dyn_var(_k text)
 RETURNS text LANGUAGE sql STABLE SET search_path TO 'public'
AS $$
 select case
  when _k ~ '^out_[a-z0-9]+_(status|ref|count|id)$'
       and position(','||substring(_k from '^out_([a-z0-9]+)_')||',' in coalesce(current_setting('au.keys', true),'')) > 0
    then case substring(_k from '_(status|ref|count|id)$') when 'count' then 'number' when 'id' then 'uuid' when 'status' then 'status' else 'text' end
  when _k in ('batch_count','batch_total') and coalesce(current_setting('au.batch', true),'0')='1' then 'number'
  when _k = 'batch_list' and coalesce(current_setting('au.batch', true),'0')='1' then 'text'
 end
$$;