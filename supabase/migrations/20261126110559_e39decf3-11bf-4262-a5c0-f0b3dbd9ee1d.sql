UPDATE public.au_sources SET status='tested'
 WHERE api_key IN ('admin_requests','gifted_programs','guidance_programs','hr_leaves','hr_vacancies','hr_attendance','hr_assets','notices') AND status='wired';
UPDATE public.au_events SET status='tested'
 WHERE code IN ('ds.api.admin_requests','ds.api.gifted_programs','ds.api.guidance_programs','ds.api.hr_leaves','ds.api.hr_vacancies','ds.api.hr_attendance','ds.api.hr_assets','ds.api.notices') AND status='wired';