CREATE TABLE IF NOT EXISTS public.school_responsibilities (
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('accountant','maintenance','transport','hr','documents')),
  user_id uuid NOT NULL,
  set_by uuid,
  set_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (school_id, kind)
);
GRANT ALL ON public.school_responsibilities TO service_role;
ALTER TABLE public.school_responsibilities ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.org_docs ADD COLUMN IF NOT EXISTS responsible_user uuid;
ALTER TABLE public.mt_buses ADD COLUMN IF NOT EXISTS responsible_user uuid;

CREATE TABLE IF NOT EXISTS public.au_step_people (
  outbox_id bigint NOT NULL,
  rule_id uuid NOT NULL,
  step text NOT NULL,
  user_id uuid NOT NULL,
  code text NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (outbox_id, rule_id, step, user_id)
);
GRANT ALL ON public.au_step_people TO service_role;
ALTER TABLE public.au_step_people ENABLE ROW LEVEL SECURITY;

-- staff member check used by every responsibility setter
CREATE OR REPLACE FUNCTION public._resp_staff_ok(_org uuid, _school uuid, _user uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ select exists (select 1 from memberships m join schools s on s.id=m.school_id and s.org_id=_org and s.is_active
   where m.user_id=_user and m.is_active and not coalesce(m.branch_suspended,false) and m.role::text not in ('student','guardian')
     and (_school is null or m.school_id=_school)) $f$;
REVOKE ALL ON FUNCTION public._resp_staff_ok(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.school_resp_list(_school uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$
declare org uuid := school_org(_school); begin
 if org is null or not is_org_owner(org) then raise exception 'تحديد المسؤولين لمدير النظام فقط' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('kind',k.kind,'user_id',r.user_id,'name',p.full_name,'set_at',r.set_at,
     'active', r.user_id is not null and _resp_staff_ok(org,_school,r.user_id)) order by k.o)
   from unnest(array['accountant','maintenance','transport','hr','documents']) with ordinality k(kind,o)
   left join school_responsibilities r on r.school_id=_school and r.kind=k.kind left join profiles p on p.id=r.user_id), '[]'::jsonb);
end $f$;
REVOKE ALL ON FUNCTION public.school_resp_list(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_resp_list(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.school_resp_set(_school uuid, _kind text, _user uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$
declare org uuid := school_org(_school); old uuid; begin
 if org is null or not is_org_owner(org) then raise exception 'تحديد المسؤولين لمدير النظام فقط' using errcode='42501'; end if;
 if _kind not in ('accountant','maintenance','transport','hr','documents') then raise exception 'نوع مسؤولية غير معروف'; end if;
 if _user is not null and not _resp_staff_ok(org, _school, _user) then raise exception 'المسؤول يجب أن يكون موظفًا نشطًا في هذه المدرسة'; end if;
 select user_id into old from school_responsibilities where school_id=_school and kind=_kind;
 if _user is null then delete from school_responsibilities where school_id=_school and kind=_kind;
 else insert into school_responsibilities(school_id,kind,user_id,set_by) values (_school,_kind,_user,auth.uid())
   on conflict (school_id,kind) do update set user_id=excluded.user_id, set_by=excluded.set_by, set_at=now(); end if;
 perform _access_audit(org, _school, 'school_responsibility', _user, null, null, jsonb_build_object('kind',_kind,'user',old), jsonb_build_object('kind',_kind,'user',_user), null);
end $f$;
REVOKE ALL ON FUNCTION public.school_resp_set(uuid,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_resp_set(uuid,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.org_doc_set_responsible(_doc uuid, _user uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$
declare d org_docs; begin
 select * into d from org_docs where id=_doc;
 if d.id is null or not is_org_owner(d.org_id) then raise exception 'تحديد مسؤول الوثيقة لمدير النظام فقط' using errcode='42501'; end if;
 if _user is not null and not _resp_staff_ok(d.org_id, d.school_id, _user) then raise exception 'المسؤول يجب أن يكون موظفًا نشطًا في مدرسة الوثيقة'; end if;
 update org_docs set responsible_user=_user, updated_at=now(), updated_by=auth.uid() where id=_doc;
 perform _access_audit(d.org_id, d.school_id, 'doc_responsible', _user, null, null, jsonb_build_object('doc',_doc,'user',d.responsible_user), jsonb_build_object('doc',_doc,'user',_user), null);
end $f$;
REVOKE ALL ON FUNCTION public.org_doc_set_responsible(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_doc_set_responsible(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mt_bus_set_responsible(_bus uuid, _user uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $f$
declare b mt_buses; begin
 select * into b from mt_buses where id=_bus;
 if b.id is null or not is_org_owner(b.org_id) then raise exception 'تحديد مسؤول المركبة لمدير النظام فقط' using errcode='42501'; end if;
 if _user is not null and not _resp_staff_ok(b.org_id, b.school_id, _user) then raise exception 'المسؤول يجب أن يكون موظفًا نشطًا في مدرسة المركبة'; end if;
 update mt_buses set responsible_user=_user, updated_at=now() where id=_bus;
 insert into mt_bus_events(bus_id, actor, action, before, after, note) values (_bus, auth.uid(), 'responsible', jsonb_build_object('user',b.responsible_user), jsonb_build_object('user',_user), null);
end $f$;
REVOKE ALL ON FUNCTION public.mt_bus_set_responsible(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mt_bus_set_responsible(uuid,uuid) TO authenticated;

-- people pools: automation (owner or live delegate, within delegated schools) and responsibilities (owner only)
DO $do$ declare d text; begin
 d := pg_get_functiondef('public._people_pool(text,uuid,uuid,uuid)'::regprocedure);
 if position('''automation''' in d) = 0 then
   d := replace(d, '  return query select * from _people_pool_v6(_purpose, _school, _org, _post);',
$x$  if _purpose = 'automation' then
    org := coalesce(_org, school_org(_school));
    if org is null or not (_au_full(org) or exists(select 1 from au_delegations dl where dl.org_id=org and dl.user_id=auth.uid() and _au_dlive(dl))) then raise exception 'اختيار الأشخاص لمن يدير الأتمتة' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m join schools s on s.id=m.school_id and s.org_id=org and s.is_active
      where m.is_active and not coalesce(m.branch_suspended,false) and m.role not in ('student','guardian') and (_school is null or m.school_id=_school)
        and (_au_full(org) or exists(select 1 from au_delegations dl where dl.org_id=org and dl.user_id=auth.uid() and _au_dlive(dl) and (dl.school_ids is null or m.school_id = any(dl.school_ids))));
    return;
  end if;
  if _purpose = 'resp' then
    org := coalesce(_org, school_org(_school));
    if org is null or not is_org_owner(org) then raise exception 'تحديد المسؤولين لمدير النظام فقط' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m join schools s on s.id=m.school_id and s.org_id=org and s.is_active
      where m.is_active and not coalesce(m.branch_suspended,false) and m.role not in ('student','guardian') and (_school is null or m.school_id=_school);
    return;
  end if;
  return query select * from _people_pool_v6(_purpose, _school, _org, _post);$x$);
   execute d;
 end if;
end $do$;

-- job titles for the automation people picker (names/titles only, never contact data)
CREATE OR REPLACE FUNCTION public.au_people_titles(_org uuid, _ids uuid[])
 RETURNS TABLE(user_id uuid, title text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $f$ begin
 if not (_au_full(_org) or exists(select 1 from au_delegations dl where dl.org_id=_org and dl.user_id=auth.uid() and _au_dlive(dl))) then raise exception 'forbidden' using errcode='42501'; end if;
 return query select distinct on (e.user_id) e.user_id, coalesce(nullif(h.job_title,''), e.job_title) from hr_employees e
   left join hr_assignments h on h.employee_id=e.id and (h.end_date is null or h.end_date >= school_today())
   where e.org_id=_org and e.user_id = any(coalesce(_ids,'{}')) and e.status='active'
   order by e.user_id, h.is_primary desc nulls last, h.start_date desc nulls last;
end $f$;
REVOKE ALL ON FUNCTION public.au_people_titles(uuid,uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.au_people_titles(uuid,uuid[]) TO authenticated;

INSERT INTO public.au_recipients(code,label,resolver,available) VALUES
 ('school_accountant','المحاسب المسؤول عن المدرسة','school_responsibilities kind accountant (يحدده مدير النظام في صفحة المدارس)',true),
 ('school_maint','مسؤول الصيانة في المدرسة','school_responsibilities kind maintenance',true),
 ('school_transport','مسؤول النقل في المدرسة','school_responsibilities kind transport',true),
 ('school_hr','مسؤول الموارد البشرية في المدرسة','school_responsibilities kind hr',true),
 ('school_docs','مسؤول الوثائق في المدرسة','school_responsibilities kind documents',true),
 ('doc_owner','مسؤول الوثيقة','org_docs.responsible_user للوثيقة في السجل',true),
 ('bus_owner','مسؤول المركبة','mt_buses.responsible_user للمركبة في السجل',true),
 ('dept_owner','رئيس القسم المرتبط بالسجل','memberships dept_head بنفس قسم السجل',true)
ON CONFLICT (code) DO NOTHING;

UPDATE public.au_events SET recipients = recipients || '{guardian}'::text[]
 WHERE code='ds.student_accounts' AND NOT ('guardian' = any(recipients));