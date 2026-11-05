alter function public._hr_month(text) set search_path=public;
do $$ declare f text; begin
  foreach f in array array['_hr_mn_ok(uuid,text)','_hr_mn_any(uuid,text)','_hr_py_ok(uuid,text)','_hr_adv_left(uuid)','_hr_name(uuid)','_hr_dec_row(hr_decisions)','_hr_adv_row(hr_advances,boolean)','_hr_run_row(hr_pay_runs)','_hr_pay_build(uuid)','_hr_adv_new(uuid,uuid,jsonb,boolean)','_hr_py_notify(uuid,text,text,text,text,text,uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array['hr_money_caps(uuid)','hr_pay_setup(uuid)','hr_pay_item_save(uuid,uuid,text,text,boolean)','hr_pay_settings_save(uuid,jsonb)','hr_decision_list(uuid,jsonb)','hr_decision_save(uuid,jsonb)','hr_decision_act(uuid,int,text,text)','hr_advance_save(uuid,jsonb)','hr_advance_request(uuid,jsonb)','hr_advance_list(uuid,jsonb)','hr_advance_act(uuid,int,text,text,text)','hr_emp_money(uuid)','hr_pay_runs(uuid)','hr_pay_run_get(uuid)','hr_pay_run_create(uuid,text)','hr_pay_line_resolve(uuid,int,uuid,text,text)','hr_pay_run_act(uuid,int,text,text,text)','hr_my_money(uuid)','hr_my_payslip(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;