create table public.sv_plan_progress (
 id uuid primary key default gen_random_uuid(),
 record_id uuid not null references public.sv_records(id) on delete cascade,
 action_index int not null check (action_index >= 0),
 state text not null check (state in ('not_started','ongoing','submitted','completed','blocked')),
 note text, actor uuid not null default auth.uid(), at timestamptz not null default now()
);
create index on public.sv_plan_progress(record_id, action_index, at desc);
grant all on public.sv_plan_progress to service_role;
alter table public.sv_plan_progress enable row level security;

create function private.sv3_plan_progress_save(_record uuid, _index int, _state text, _note text) returns uuid
language plpgsql security definer set search_path=public as $$
declare r sv_records; act jsonb; owner_txt text; nid uuid; me uuid := auth.uid(); work boolean; verifier boolean;
begin
 select * into r from sv_records where id=_record;
 if r.id is null or not exists(select 1 from sv_plan_details where record_id=r.id) then raise exception 'الخطة غير موجودة'; end if;
 if not private._sv3_record_read(r) then raise exception 'لا تملك صلاحية على هذه الخطة'; end if;
 if r.status<>'approved' then raise exception 'تُتابع الأنشطة بعد اعتماد الخطة فقط'; end if;
 if _state not in ('not_started','ongoing','submitted','completed','blocked') then raise exception 'حالة النشاط غير صالحة'; end if;
 act := r.data->'actions'->_index;
 if act is null then raise exception 'النشاط غير موجود في الخطة المعتمدة'; end if;
 owner_txt := coalesce(act->>'owner','');
 work := private._sv3_record_work(r);
 verifier := work or is_org_owner(r.org_id) or private._sv_principal(r.school_id);
 if _state='completed' then
   if not verifier then raise exception 'التحقق من الإنجاز للمخوّل فقط'; end if;
   if owner_txt = me::text then raise exception 'لا يتحقق مسؤول النشاط من نشاطه'; end if;
 elsif not (work or owner_txt = me::text) then raise exception 'تحديث النشاط لمسؤوله أو صاحب الخطة فقط'; end if;
 if _state in ('submitted','completed','blocked') and length(trim(coalesce(_note,'')))<3 then raise exception 'هذه الحالة تحتاج دليلًا أو سببًا'; end if;
 insert into sv_plan_progress(record_id,action_index,state,note,actor) values (r.id,_index,_state,nullif(trim(_note),''),me) returning id into nid;
 perform private._sv_ev(r.org_id,r.school_id,'record',r.id,'action_progress',jsonb_build_object('index',_index,'state',_state));
 return nid;
end $$;

create function private.sv3_plan_progress_list(_record uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare r sv_records;
begin
 select * into r from sv_records where id=_record;
 if r.id is null or not private._sv3_record_read(r) then raise exception 'لا تملك صلاحية على هذه الخطة'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('index',action_index,'state',state,'note',note,'actor',private._sv_name(actor),'at',at) order by at desc) from sv_plan_progress where record_id=r.id),'[]');
end $$;

create function public.sv3_plan_progress_save(_record uuid, _index int, _state text, _note text) returns uuid language sql security invoker set search_path=public as $$ select private.sv3_plan_progress_save(_record,_index,_state,_note) $$;
create function public.sv3_plan_progress_list(_record uuid) returns jsonb language sql stable security invoker set search_path=public as $$ select private.sv3_plan_progress_list(_record) $$;
revoke all on function private.sv3_plan_progress_save(uuid,int,text,text), public.sv3_plan_progress_save(uuid,int,text,text), private.sv3_plan_progress_list(uuid), public.sv3_plan_progress_list(uuid) from public, anon;
grant execute on function private.sv3_plan_progress_save(uuid,int,text,text), public.sv3_plan_progress_save(uuid,int,text,text), private.sv3_plan_progress_list(uuid), public.sv3_plan_progress_list(uuid) to authenticated;