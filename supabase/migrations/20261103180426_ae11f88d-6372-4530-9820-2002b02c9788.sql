CREATE OR REPLACE FUNCTION public._pc_check_core(_c jsonb)
 RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public'
AS $function$
declare x jsonb; d jsonb := _pc_core_default(); out jsonb := '[]'; seen text[] := '{}'; k text; prot text[] := array['description','supplier','purchase_date','lines','tax','benefit_school'];
  lab text; hlp text; req boolean; hid boolean;
begin
  if jsonb_typeof(coalesce(_c,'[]')) <> 'array' then raise exception 'بنية الحقول الأساسية غير صالحة'; end if;
  for x in select * from jsonb_array_elements(coalesce(_c,'[]')) loop
    k := x->>'key';
    if not exists(select 1 from jsonb_array_elements(d) y where y->>'key'=k) then raise exception 'حقل أساسي غير معروف: %', k; end if;
    if k = any(seen) then continue; end if;
    seen := seen || k;
    lab := left(btrim(coalesce(x->>'label','')), 60); hlp := left(btrim(coalesce(x->>'help','')), 200);
    if lab = '' then lab := (select y->>'label' from jsonb_array_elements(d) y where y->>'key'=k); end if;
    if not _pc_safe(lab) or not _pc_safe(hlp) then raise exception 'لا تُقبل الرموز أو الصيغ في التسمية أو الوصف'; end if;
    -- protected (financial/link) fields can never be hidden; optional fields may be removed from the form
    hid := not (k = any(prot)) and coalesce((x->>'hidden')::boolean, false);
    req := case when k = any(prot) then (k <> 'tax' and k <> 'benefit_school') when hid then false else coalesce((x->>'required')::boolean, false) end;
    out := out || jsonb_build_array(jsonb_build_object('key', k, 'label', lab, 'help', hlp, 'required', req, 'protected', k = any(prot), 'hidden', hid));
  end loop;
  for x in select * from jsonb_array_elements(d) loop
    if not ((x->>'key') = any(seen)) then out := out || jsonb_build_array(x || jsonb_build_object('protected', (x->>'key') = any(prot), 'hidden', false)); end if;
  end loop;
  return out;
end $function$;