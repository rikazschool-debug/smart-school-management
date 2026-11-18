alter function public.adm_duty_quick_save(uuid,uuid,date,uuid,uuid,uuid,uuid,text,uuid) set schema private;
alter function public.adm_duty_quick_cancel(uuid,text) set schema private;
alter function public.adm_duty_quick_list(uuid,date,date,boolean) set schema private;
alter function private.adm_duty_quick_save(uuid,uuid,date,uuid,uuid,uuid,uuid,text,uuid) set search_path to 'public';
create or replace function public.adm_duty_quick_save(_school uuid, _user uuid, _date date, _post uuid, _grade uuid, _section uuid, _period uuid, _note text, _client uuid)
 returns uuid language sql security invoker set search_path to 'public' as $$ select private.adm_duty_quick_save(_school,_user,_date,_post,_grade,_section,_period,_note,_client) $$;
create or replace function public.adm_duty_quick_cancel(_id uuid, _reason text)
 returns void language sql security invoker set search_path to 'public' as $$ select private.adm_duty_quick_cancel(_id,_reason) $$;
create or replace function public.adm_duty_quick_list(_school uuid, _from date, _to date, _mine boolean)
 returns table(id uuid, user_id uuid, user_name text, date date, post_id uuid, post text, grade text, section text, period text, period_time text, note text, status text, cancel_reason text, created_by_name text, created_at timestamptz)
 language sql stable security invoker set search_path to 'public' as $$ select * from private.adm_duty_quick_list(_school,_from,_to,_mine) $$;
revoke execute on function public.adm_duty_quick_save(uuid,uuid,date,uuid,uuid,uuid,uuid,text,uuid), public.adm_duty_quick_cancel(uuid,text), public.adm_duty_quick_list(uuid,date,date,boolean) from public, anon;
grant execute on function public.adm_duty_quick_save(uuid,uuid,date,uuid,uuid,uuid,uuid,text,uuid), public.adm_duty_quick_cancel(uuid,text), public.adm_duty_quick_list(uuid,date,date,boolean) to authenticated;
grant usage on schema private to authenticated;
grant execute on function private.adm_duty_quick_save(uuid,uuid,date,uuid,uuid,uuid,uuid,text,uuid), private.adm_duty_quick_cancel(uuid,text), private.adm_duty_quick_list(uuid,date,date,boolean) to authenticated;
create index adm_duty_quick_post on public.adm_duty_quick(post_id);
create index adm_duty_quick_grade on public.adm_duty_quick(grade_id);
create index adm_duty_quick_section on public.adm_duty_quick(section_id);
create index adm_duty_quick_period on public.adm_duty_quick(period_id);