create or replace function public._au_check_steps(_ev au_events, _steps jsonb, _depth integer) returns integer language plpgsql stable security definer set search_path=public as $$
declare st jsonb; cp jsonb := '[]'::jsonb; x jsonb; fam boolean; extra int := 0; n int; t text; begin
 if jsonb_typeof(_steps) <> 'array' then return _au_check_steps_core(_ev, _steps, _depth); end if;
 for st in select jsonb_array_elements(_steps) loop
  t := st->>'type'; x := st;
  if t in ('notify','reminder') then
    fam := coalesce(st->'recipients' ? 'guardian', false) or jsonb_path_exists(coalesce(st->'groups','[]'::jsonb), 'strict $.** ? (@.code == "guardian")');
    perform _au_check_channels(_ev, st, fam); x := st - 'channels' - 'wa';
  elsif t = 'escalate' then
    if st ? 'channels' and st->'channels' <> '["internal"]'::jsonb then raise exception 'escalation uses internal notifications only'; end if;
    x := st - 'channels';
  elsif t = 'mt_request' and st->>'kind' = 'bus' then
    if _ev.area='central' and _ev.code not like 'ds.%' then raise exception 'maintenance requests need a school event'; end if;
    if not (st->>'bus'='record' and _ev.code='ds.api.buses') and not exists (select 1 from mt_buses b where b.id=_au_uuid(st->>'bus') and b.active) then raise exception 'choose a bus (or the record bus on the buses source)'; end if;
    if coalesce(length(btrim(st->>'title')),0) not between 3 and 120 then raise exception 'request title 3..120'; end if;
    if coalesce(length(btrim(st->>'description')),0) not between 5 and 500 then raise exception 'request description 5..500'; end if;
    if coalesce(st->>'priority','normal') not in ('low','normal','high','urgent') then raise exception 'priority invalid'; end if;
    if not exists (select 1 from mt_categories c where c.id=_au_uuid(st->>'category') and c.kind='bus' and c.parent_id is null and c.active and not coalesce(c.is_other,false)) then raise exception 'choose a bus maintenance category'; end if;
    perform _au_check_tpl(_ev.code, st->>'title', false); perform _au_check_tpl(_ev.code, st->>'description', false);
    if st ? 'assign' then perform _au_check_groups(_ev, st->'assign', true); end if;
    if st ? 'on_fail' then extra := extra + _au_check_steps(_ev, st->'on_fail', _depth+1); end if;
    x := jsonb_build_object('type','stop');
  elsif t = 'report' and st->>'source' = 'doc' then
    if coalesce(length(btrim(st->>'title')),0) not between 3 and 120 then raise exception 'document title 3..120'; end if;
    if coalesce(length(btrim(st->>'body')),0) not between 10 and 4000 then raise exception 'document text 10..4000'; end if;
    perform _au_check_tpl(_ev.code, st->>'title', false); perform _au_check_tpl(_ev.code, st->>'body', false);
    if not st ? 'share' then raise exception 'choose who may open the document'; end if;
    perform _au_check_groups(_ev, st->'share', true);
    if st ? 'on_fail' then extra := extra + _au_check_steps(_ev, st->'on_fail', _depth+1); end if;
    x := jsonb_build_object('type','stop');
  end if;
  cp := cp || jsonb_build_array(x);
 end loop;
 n := _au_check_steps_core(_ev, cp, _depth) + extra;
 if _depth = 0 and n > 15 then raise exception 'too many steps (max 15)'; end if;
 return n;
end $$;
revoke all on function public._au_check_steps(au_events, jsonb, integer) from public, anon, authenticated;