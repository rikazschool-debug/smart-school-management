create or replace function public.hr_report_catalog(_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare m jsonb; out jsonb := '[]'; st text;
begin
  if auth.uid() is null then raise exception 'يلزم تسجيل الدخول'; end if;
  if not section_enabled(_org,'hr') then return '[]'; end if;
  for m in select * from jsonb_array_elements(_hr_rep_meta()) loop
    -- reports the caller cannot view are never listed, whatever their availability
    if not _hr_rep_sec(_org, m->>'sec', 'view') or (m->>'key'='R27' and not _hr_org_ok(_org,'view')) then continue; end if;
    st := case when m ? 'unavailable' then 'unavailable' when m ? 'ext' and not _hr_ext_on(_org, m->>'ext') then 'ext_off' else 'ready' end;
    out := out || (m || jsonb_build_object('status',st,'can_export', st='ready' and _hr_rep_sec(_org, m->>'sec','export'), 'can_print', st='ready' and _hr_rep_sec(_org,'hr_reports','print')));
  end loop;
  return out;
end $$;
revoke all on function public.hr_report_catalog(uuid) from public, anon;
grant execute on function public.hr_report_catalog(uuid) to authenticated;