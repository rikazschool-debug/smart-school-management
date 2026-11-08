alter function public._cs_clean(text,int) set search_path to 'public';
alter function public._cs_in_hours(jsonb,timestamptz) set search_path to 'public';
revoke all on function public._cs_get(uuid), public._cs_my_roles(uuid), public._cs_auto_trg(), public._msg_file_link_trg(), public._msg_voice_trg(), public._msg_sent_as_trg(), public._perm_base(uuid,uuid,text,text), public._perm_base_v9(uuid,uuid,text,text), public._perm_catalog_v8() from public, anon;
revoke all on function public._cs_get(uuid), public._cs_my_roles(uuid), public._cs_auto_trg(), public._msg_file_link_trg(), public._msg_voice_trg() from authenticated;
revoke all on function public.perm_catalog() from anon;