alter table public.au_settings alter column consent_mode set default 'explicit';
create or replace function public._au_consent_ok(_org uuid,_u uuid,_ch text,_mode text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from au_contact_prefs p where p.org_id=_org and p.user_id=_u and p.channel=_ch and p.allowed)
 and not exists(select 1 from au_contact_prefs p where p.org_id=_org and p.user_id=_u and p.channel=_ch and not p.allowed)
$$;
revoke all on function public._au_consent_ok(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public._au_consent_ok(uuid,uuid,text,text) to service_role;
create or replace function public.au_channels_info(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$ begin
 perform _au_need(_org,'au_view','center');
 return jsonb_build_object('channels',(select jsonb_agg(to_jsonb(c) order by array_position(array['internal','whatsapp','email'],c.code)) from au_channels c),
 'wa_live',coalesce((select wa_live from au_platform limit 1),false),'templates',(select count(*) filter(where usable) from au_wa_templates),
 'synced_at',(select max(synced_at) from au_wa_templates),'consent_mode','explicit',
 'claim_gap_days',coalesce((select claim_gap_days from au_settings where org_id=_org),3),
 'counts',(select coalesce(jsonb_object_agg(status,n),'{}') from(select status,count(*) n from au_msgs where org_id=_org group by status) q));
end $$;
revoke all on function public.au_channels_info(uuid) from public,anon;
grant execute on function public.au_channels_info(uuid) to authenticated,service_role;