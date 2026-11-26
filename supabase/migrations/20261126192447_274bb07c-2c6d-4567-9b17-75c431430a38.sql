insert into public.au_variables(event_code,key,label,type,options,source,lookup,unit,flags)
values ('ds.student_accounts','overdue_since','تاريخ استحقاق المتأخر','date',null,'sf_obligations.due_date (أقدم متأخر غير مسدد)',null,null,'{family}')
on conflict do nothing;

alter function public._au_srcp(text, uuid, uuid[], integer, uuid, jsonb) rename to _au_srcp_core;
revoke all on function public._au_srcp_core(text, uuid, uuid[], integer, uuid, jsonb) from public, anon, authenticated;
create function public._au_srcp(_ev text, _org uuid, _schools uuid[], _lim integer, _entity uuid, _params jsonb)
returns table(entity uuid, school uuid, period text, ctx jsonb) language plpgsql stable security definer set search_path=public as $$
begin
  if _ev = 'ds.student_accounts' then
    return query select x.entity, x.school, x.period,
      x.ctx || case when (x.ctx->>'days_overdue') is not null then jsonb_build_object('overdue_since', school_today() - (x.ctx->>'days_overdue')::int) else '{}'::jsonb end
      from _au_srcp_core(_ev, _org, _schools, _lim, _entity, _params) x;
  else
    return query select * from _au_srcp_core(_ev, _org, _schools, _lim, _entity, _params);
  end if;
end $$;
revoke all on function public._au_srcp(text, uuid, uuid[], integer, uuid, jsonb) from public, anon, authenticated;