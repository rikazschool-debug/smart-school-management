create or replace function public.xb_titles(_org uuid, _ids uuid[]) returns table(user_id uuid, title text)
language plpgsql stable security definer set search_path=public as $$
begin
  if not _xb_ok(_org, auth.uid()) then raise exception 'التواصل بين الفروع غير مفعّل لحسابك' using errcode='42501'; end if;
  return query select e.user_id, (array_agg(nullif(btrim(e.job_title),'') order by e.job_title))[1]
    from hr_employees e where e.org_id=_org and e.user_id = any(coalesce(_ids,'{}')) and _xb_ok(_org, e.user_id)
      and nullif(btrim(e.job_title),'') is not null
    group by e.user_id;
end $$;
revoke all on function public.xb_titles(uuid,uuid[]) from public, anon;
grant execute on function public.xb_titles(uuid,uuid[]) to authenticated;