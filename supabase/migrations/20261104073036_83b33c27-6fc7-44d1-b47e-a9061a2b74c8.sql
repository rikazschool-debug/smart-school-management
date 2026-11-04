alter function public._ad_label(text) set search_path=public;
alter function public._ad_phone(text) set search_path=public;
revoke all on function public.ad_me(uuid), public.ad_list(uuid,jsonb,int,int), public.ad_get(uuid), public.ad_create(uuid,uuid,jsonb,text), public.ad_act(uuid,int,text,jsonb,text),
  public.ad_summary(uuid,uuid), public.ad_students(uuid,jsonb,int,int), public.ad_link_candidates(uuid,text), public.ad_settings_get(uuid), public.ad_settings_save(uuid,jsonb,jsonb,jsonb,text) from public;
grant execute on function public.ad_me(uuid), public.ad_list(uuid,jsonb,int,int), public.ad_get(uuid), public.ad_create(uuid,uuid,jsonb,text), public.ad_act(uuid,int,text,jsonb,text),
  public.ad_summary(uuid,uuid), public.ad_students(uuid,jsonb,int,int), public.ad_link_candidates(uuid,text), public.ad_settings_get(uuid), public.ad_settings_save(uuid,jsonb,jsonb,jsonb,text) to authenticated;