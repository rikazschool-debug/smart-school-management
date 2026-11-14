do $$ declare def text; begin
  select pg_get_functiondef('public.adm_task_update(uuid,date,uuid,text,integer)'::regprocedure) into def;
  if position('_adm_staff(t.school_id, _assignee)' in def) = 0 then raise exception 'adm_task_update body changed; update this migration'; end if;
  def := replace(def, 'if not _adm_staff(t.school_id, _assignee) then raise exception ''المسؤول يجب أن يكون من موظفي المدرسة''; end if;',
                      'if not _task_target_ok(t.school_id, _assignee) then raise exception ''المسؤول الجديد خارج نطاقك في المدرسة''; end if;');
  execute def;
end $$;