-- Catalog entries that are enforced server-side (calls → _mq_ok, wa_inbox → _wa_access/_wa_act_ok, chat_settings → _cs_ok org scope,
-- school_schedule → can_view_slot) were refused by the validator, so the permission tree could show but not save them.
create or replace function public._perm_valid(_section text, _action text, _scope text)
 returns boolean language sql immutable set search_path to 'public' as $$
 select case
  when _section='student_finance' then _action in ('view','collect','discount','transport','export') and (_scope is null or _scope in ('branch','org'))
  when _section='contracts' then _action = 'match' and (_scope is null or _scope in ('branch','org'))
  when _section='calls' then _action in ('view','own','link','listen','download','export') and (_scope is null or _scope in ('branch','org'))
  when _section='wa_inbox' then _action in ('mine','branch','transfer_branch','transfer_org','send_template','run_bot') and (_scope is null or _scope in ('branch','org'))
  when _section='chat_settings' then _action in ('view','replies','autoreply','media') and (_scope is null or _scope = 'org')
  when _section='school_schedule' then _action = 'view' and (_scope is null or _scope in ('branch','org'))
  else _perm_valid_pre_sf(_section,_action,_scope) end $$;