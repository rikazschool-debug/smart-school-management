alter table public.ad_applications add constraint ad_applications_org_ref_key unique (org_id, ref);
alter table public.ad_applications drop constraint ad_applications_ref_key;