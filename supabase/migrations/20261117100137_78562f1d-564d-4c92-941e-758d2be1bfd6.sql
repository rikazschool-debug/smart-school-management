alter function private.sv5_dash(uuid,uuid,date,date) rename to _sv5_dash_core;
revoke all on function private._sv5_dash_core(uuid,uuid,date,date) from public, anon; grant execute on function private._sv5_dash_core(uuid,uuid,date,date) to authenticated;
create or replace function private._sv5_dash_role(_org uuid, _school uuid) returns text language sql stable security definer set search_path=public as $$
 select case when is_org_owner(_org) then 'المالك' when private._sv_principal(_school) then 'مدير الفرع'
  when exists(select 1 from private._sv_live(_school)) then 'مشرف (المعلمون في إسنادك الساري فقط)' when private._sv4_school_teacher(_school) is not null then 'معلم (بياناتك فقط)' else '—' end $$;
revoke all on function private._sv5_dash_role(uuid,uuid) from public, anon; grant execute on function private._sv5_dash_role(uuid,uuid) to authenticated;
create function private.sv5_dash(_org uuid, _school uuid, _from date, _to date) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare d jsonb; sc jsonb; begin d:=private._sv5_dash_core(_org,_school,_from,_to);
 select jsonb_agg(s||jsonb_build_object('role',private._sv5_dash_role(_org,(s->>'id')::uuid))) into sc from jsonb_array_elements(d->'schools') s;
 return d||jsonb_build_object('schools',sc,'scope',(select string_agg((s->>'name')||': '||(s->>'role'),'؛ ') from jsonb_array_elements(sc) s)); end $$;
revoke all on function private.sv5_dash(uuid,uuid,date,date) from public, anon; grant execute on function private.sv5_dash(uuid,uuid,date,date) to authenticated;
create or replace function public.sv5_dash(_org uuid, _school uuid, _from date, _to date) returns jsonb language sql stable set search_path=public as $$ select private.sv5_dash(_org,_school,_from,_to) $$;