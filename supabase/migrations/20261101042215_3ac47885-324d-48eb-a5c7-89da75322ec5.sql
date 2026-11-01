do $$ declare f text; begin
  foreach f in array array['public._circ_targets(uuid,text,uuid,uuid[])','public._can_circ_scope(uuid,text,uuid)','public.can_manage_circular(uuid)','public._circ_branch_viewer(uuid,uuid)','public.can_read_circular(uuid)','public._circ_audience_multi(uuid[],jsonb)','public.save_circular(uuid,uuid,text,text,text,text,boolean,date,jsonb,text,uuid[])','public.preview_circular_audience(uuid,jsonb,text,uuid[])','public.publish_circular(uuid)','public.revise_circular(uuid,text,text,boolean)','public.remind_circular_ack(uuid)','public.archive_circular(uuid)','public.reopen_circular(uuid)','public.add_circular_recipients(uuid,uuid[],boolean)','public.circular_stats(uuid)','public.create_circular_file(uuid,text,bigint)'] loop
    begin execute format('revoke execute on function %s from public, anon', f); exception when others then null; end;
  end loop;
  revoke execute on function public.create_circular_file(uuid,text,text,bigint) from public, anon;
  revoke execute on function public._circ_targets(uuid,text,uuid,uuid[]) from authenticated;
  revoke execute on function public._circ_audience_multi(uuid[],jsonb) from authenticated;
end $$;