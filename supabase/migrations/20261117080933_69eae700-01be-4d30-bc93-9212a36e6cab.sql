create or replace function private.sv4_feedback_save(_program uuid, _kind text, _named boolean, _answers jsonb) returns uuid language plpgsql security definer set search_path=public as $$
declare g sv4_programs; f sv_forms; a jsonb; m text[]; nid uuid; begin select * into g from sv4_programs where id=_program;
 if g.id is null or _kind not in ('program_eval','trainer_eval') or _named is null then raise exception 'طلب غير صالح'; end if;
 if g.status<>'open' then raise exception 'انتهت فترة التقييم: يُقبل التقييم والبرنامج مفتوح فقط'; end if;
 if not exists(select 1 from sv4_attendance x join sv4_sessions s on s.id=x.session_id where s.program_id=_program and x.user_id=auth.uid() and x.status='present') then raise exception 'التقييم لمن حضر جلسة واحدة على الأقل'; end if;
 f:=private._sv_form_for(g.org_id,g.school_id,_kind); if f.id is null then raise exception 'لم يعتمد المالك أو مفوضه نموذج التقييم بعد'; end if;
 if jsonb_typeof(_answers) is distinct from 'object' then raise exception 'الإجابات غير صالحة'; end if;
 a:=_answers||jsonb_build_object('program_ref',g.title)||case when _kind='trainer_eval' then jsonb_build_object('trainer',g.trainer_name) else '{}'::jsonb end;
 m:=private._sv_missing(f.spec,a); if cardinality(m)>0 then raise exception 'حقول ناقصة: %', array_to_string(m,'، '); end if;
 insert into sv4_feedback(program_id,kind,form_id,form_version,form_snapshot,named,answers) values(_program,_kind,f.id,f.version,jsonb_build_object('title',f.title,'spec',f.spec,'source',f.source),_named,a) returning id into nid;
 perform private._sv_ev(g.org_id,g.school_id,'sv4_program',_program,'feedback',jsonb_build_object('kind',_kind)); return nid;
exception when unique_violation then raise exception 'سجّلت هذا التقييم من قبل'; end $$;

create or replace function private.sv4_feedback_summary(_program uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare g sv4_programs; res jsonb:='[]'; k text; f sv_forms; n int; att int; hide text; begin select * into g from sv4_programs where id=_program;
 if g.id is null or not private._sv4_prog_manage(g.school_id) then raise exception 'ملخص التقييم لإدارة البرنامج'; end if;
 select count(distinct x.user_id) into att from sv4_attendance x join sv4_sessions s on s.id=x.session_id where s.program_id=_program and x.status='present';
 foreach k in array array['program_eval','trainer_eval'] loop
  select count(*) into n from sv4_feedback where program_id=_program and kind=k;
  select * into f from sv_forms where id=(select form_id from sv4_feedback where program_id=_program and kind=k order by created_at desc limit 1);
  hide:=case when g.status not in ('closed','cancelled') then 'open' when n<3 then 'few' else null end;
  res:=res||jsonb_build_array(jsonb_build_object('kind',k,'adopted',(private._sv_form_for(g.org_id,g.school_id,k)).id is not null,'attendees',att,'responses',n,'no_response',greatest(att-n,0),'hidden',hide,
   'named',coalesce((select jsonb_agg(nm order by nm) from (select private._sv_name(respondent) nm from sv4_feedback where program_id=_program and kind=k and named) z),'[]'),
   'questions',case when hide is not null then null else coalesce((select jsonb_agg(jsonb_build_object('key',fld->>'key','label',fld->>'label','counts',(select jsonb_object_agg(o,(select count(*) from sv4_feedback b where b.program_id=_program and b.kind=k and b.answers->>(fld->>'key')=o)) from jsonb_array_elements_text(fld->'options') o),
     'unanswered',(select count(*) from sv4_feedback b where b.program_id=_program and b.kind=k and coalesce(b.answers->>(fld->>'key'),'')=''))) from jsonb_array_elements(f.spec->'sections') sec, jsonb_array_elements(sec->'fields') fld where fld->>'type'='select'),'[]') end)); end loop;
 return res; end $$;