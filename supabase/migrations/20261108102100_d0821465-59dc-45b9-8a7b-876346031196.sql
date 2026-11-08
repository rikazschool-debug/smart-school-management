revoke all on function public._evt_app_files_trg(), public._evt_items_material_trg(), public._evt_sessions_material_trg(), public._evt_outbox_trg(),
  public._evt_item_file_ok(uuid), public._evt_app_file_ok(uuid), public._evt_mimes(jsonb), public._evt_file_field(jsonb,text) from public, anon, authenticated;
revoke all on function public.evt_file_prepare(uuid,uuid,text,text,text,bigint), public.create_evt_file(uuid,text,text,bigint), public.evt_file_remove(uuid),
  public.evt_files(uuid), public.evt_app_files(uuid) from public, anon;