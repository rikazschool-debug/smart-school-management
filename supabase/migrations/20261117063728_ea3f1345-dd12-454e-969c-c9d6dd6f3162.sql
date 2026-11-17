create or replace function private.sv3_plan_progress_save(_record uuid, _index int, _state text, _note text) returns uuid
language plpgsql security definer set search_path=public as $$
declare r sv_records; act jsonb; owner_txt text; nid uuid; me uuid := auth.uid(); work boolean; verifier boolean; readable boolean;
begin
 select * into r from sv_records where id=_record;
 if r.id is null or not exists(select 1 from sv_plan_details where record_id=r.id) then raise exception 'الخطة غير موجودة'; end if;
 act := r.data->'actions'->_index;
 owner_txt := coalesce(act->>'owner','');
 readable := private._sv3_record_read(r);
 if not readable and not (owner_txt = me::text and private._sv3_enabled(r.school_id)) then raise exception 'لا تملك صلاحية على هذه الخطة'; end if;
 if r.status<>'approved' then raise exception 'تُتابع الأنشطة بعد اعتماد الخطة فقط'; end if;
 if _state not in ('not_started','ongoing','submitted','completed','blocked') then raise exception 'حالة النشاط غير صالحة'; end if;
 if act is null then raise exception 'النشاط غير موجود في الخطة المعتمدة'; end if;
 work := readable and private._sv3_record_work(r);
 verifier := work or (readable and (is_org_owner(r.org_id) or private._sv_principal(r.school_id)));
 if _state='completed' then
   if not verifier then raise exception 'التحقق من الإنجاز للمخوّل فقط'; end if;
   if owner_txt = me::text then raise exception 'لا يتحقق مسؤول النشاط من نشاطه'; end if;
 elsif not (work or owner_txt = me::text) then raise exception 'تحديث النشاط لمسؤوله أو صاحب الخطة فقط'; end if;
 if _state in ('submitted','completed','blocked') and length(trim(coalesce(_note,'')))<3 then raise exception 'هذه الحالة تحتاج دليلًا أو سببًا'; end if;
 insert into sv_plan_progress(record_id,action_index,state,note,actor) values (r.id,_index,_state,nullif(trim(_note),''),me) returning id into nid;
 perform private._sv_ev(r.org_id,r.school_id,'record',r.id,'action_progress',jsonb_build_object('index',_index,'state',_state));
 return nid;
end $$;

create or replace function private.sv3_plan_progress_list(_record uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare r sv_records; own int[];
begin
 select * into r from sv_records where id=_record;
 if r.id is null then raise exception 'لا تملك صلاحية على هذه الخطة'; end if;
 if private._sv3_record_read(r) then
  return coalesce((select jsonb_agg(jsonb_build_object('index',action_index,'state',state,'note',note,'actor',private._sv_name(actor),'at',at) order by at desc) from sv_plan_progress where record_id=r.id),'[]');
 end if;
 select array_agg((o-1)::int) into own from jsonb_array_elements(coalesce(r.data->'actions','[]')) with ordinality x(v,o) where x.v->>'owner'=auth.uid()::text;
 if own is null or r.status<>'approved' or not private._sv3_enabled(r.school_id) then raise exception 'لا تملك صلاحية على هذه الخطة'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('index',action_index,'state',state,'note',note,'actor',private._sv_name(actor),'at',at) order by at desc) from sv_plan_progress where record_id=r.id and action_index = any(own)),'[]');
end $$;

create function private.sv3_my_actions(_org uuid) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(jsonb_build_object('record_id',r.id,'school_id',r.school_id,'index',x.o-1,'action',x.v->>'action','due',x.v->>'due','evidence',x.v->>'evidence',
   'state',(select p.state from sv_plan_progress p where p.record_id=r.id and p.action_index=x.o-1 order by p.at desc limit 1)) order by x.v->>'due'),'[]')
 from sv_records r join sv_plan_details d on d.record_id=r.id, jsonb_array_elements(coalesce(r.data->'actions','[]')) with ordinality x(v,o)
 where r.org_id=_org and r.status='approved' and x.v->>'owner'=auth.uid()::text and private._sv3_enabled(r.school_id)
   and not exists(select 1 from sv_plan_details c where c.revises_id=r.id and exists(select 1 from sv_records cr where cr.id=c.record_id and cr.status='approved'))
$$;
create function public.sv3_my_actions(_org uuid) returns jsonb language sql stable security invoker set search_path=public as $$ select private.sv3_my_actions(_org) $$;
revoke all on function private.sv3_my_actions(uuid), public.sv3_my_actions(uuid) from public, anon;
grant execute on function private.sv3_my_actions(uuid), public.sv3_my_actions(uuid) to authenticated;