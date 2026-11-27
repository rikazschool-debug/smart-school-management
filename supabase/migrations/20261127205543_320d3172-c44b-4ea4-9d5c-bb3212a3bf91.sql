DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.proname = ANY (ARRAY['_la_edit_days','_la_first_slot','_la_is_daily','_la_mine','_bt_guard','_la_taker','_la_writer','_adm_dept','_pc_file_ok','_perm_catalog_v11','_perm_catalog_v8','_adm_duty_manage','_storage_file_ok','_support_assign_new_ok','_cg_private','_adm_principal','_ws_not_denied','_ws_ok','_cg_viewer_staff','_ws_view','_adm_duty_setup','_conv_link','_ct_check','_ct_plan','_ctx_staff','_adms_ok','_gb_can_enter','_gb_dept','_bc_file_ok','_gb_teacher','_group_admin'])
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;