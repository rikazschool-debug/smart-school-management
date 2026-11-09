
do $do$ declare v text; begin
  for v in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
    ('_bt_off','_bt_guard','_bt_base','_perm_catalog_v9','perm_catalog','_perm_base','hw_staff','hw_teacher','conv_send_block',
     'start_direct_conversation','start_family_conversation','start_student_conversation','save_homework','copy_homework','copy_homework_template',
     'publish_homework','revise_homework','set_homework_kind','hr_my_contract','hr_my_contracts','hr_my_documents','hr_my_payslip','hr_my_money','hr_my_employment')
  loop
    execute format('revoke execute on function %s from public, anon', v);
    execute format('grant execute on function %s to authenticated, service_role', v);
  end loop;
  revoke execute on function public._bt_base(uuid,uuid,text,text) from authenticated;
  revoke execute on function public._perm_catalog_v9() from authenticated;
end $do$;
