create or replace function private.sv4_teacher_list(_org uuid) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'user_id',t.user_id,'name',coalesce(t.display_name,t.full_name),'school_id',t.school_id,'school',s.name,'specialization',t.specialization,'self',t.user_id=auth.uid()) order by s.name, coalesce(t.display_name,t.full_name)),'[]')
 from teachers t join schools s on s.id=t.school_id where s.org_id=_org and coalesce(t.status,'active')='active' and (private._sv4_work(t.school_id,t.id) or (t.user_id=auth.uid() and private._sv3_enabled(t.school_id))) $$;
create or replace function private.sv4_feedback_form(_program uuid, _kind text) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare g sv4_programs; f sv_forms; begin select * into g from sv4_programs where id=_program;
 if g.id is null or not exists(select 1 from sv4_attendance x join sv4_sessions s on s.id=x.session_id where s.program_id=_program and x.user_id=auth.uid() and x.status='present') then raise exception 'التقييم لمن حضر جلسة واحدة على الأقل'; end if;
 f:=private._sv_form_for(g.org_id,g.school_id,_kind); if f.id is null then return null; end if;
 return jsonb_build_object('id',f.id,'title',f.title,'version',f.version,'source',f.source,'spec',f.spec); end $$;
create or replace function private.sv4_handover_pool(_plan uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare p sv4_dev_plans; begin select * into p from sv4_dev_plans where id=_plan;
 if p.id is null or not private._sv4_lead(p.school_id) then raise exception 'التسليم لمدير الفرع أو المالك'; end if;
 return coalesce((select jsonb_agg(distinct jsonb_build_object('id',u,'name',private._sv_name(u))) from (
  select m.user_id u from memberships m where m.is_active and ((m.school_id=p.school_id and m.role='principal') or (m.org_id=p.org_id and m.role='org_owner'))
  union select a.supervisor_id from sv_assignments a where a.school_id=p.school_id and a.cancelled_at is null and a.starts_at<=now() and a.ends_at>now() and p.teacher_id=any(a.teacher_ids) and exists(select 1 from memberships where user_id=a.supervisor_id and school_id=p.school_id and role='supervisor' and is_active)) x),'[]'); end $$;
create or replace function public.sv4_feedback_form(_program uuid, _kind text) returns jsonb language sql stable set search_path=public as $$ select private.sv4_feedback_form(_program,_kind) $$;
create or replace function public.sv4_handover_pool(_plan uuid) returns jsonb language sql stable set search_path=public as $$ select private.sv4_handover_pool(_plan) $$;
revoke all on function private.sv4_feedback_form(uuid,text) from public, anon; grant execute on function private.sv4_feedback_form(uuid,text) to authenticated;
revoke all on function private.sv4_handover_pool(uuid) from public, anon; grant execute on function private.sv4_handover_pool(uuid) to authenticated;
revoke all on function public.sv4_feedback_form(uuid,text) from public, anon; grant execute on function public.sv4_feedback_form(uuid,text) to authenticated;
revoke all on function public.sv4_handover_pool(uuid) from public, anon; grant execute on function public.sv4_handover_pool(uuid) to authenticated;