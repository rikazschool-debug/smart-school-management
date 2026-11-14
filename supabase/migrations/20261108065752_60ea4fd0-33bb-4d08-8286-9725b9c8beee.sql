
alter function public._cg_label(text[]) set search_path to 'public';
revoke execute on function public.class_group_add_member(uuid,uuid,text), public.class_group_remove_member(uuid,uuid,text), public.class_group_restore_auto(uuid,uuid),
  public.class_group_set_role(uuid,uuid,text), public.class_group_set_description(uuid,text), public.class_group_delete_message(uuid,text),
  public.class_group_members(uuid), public.class_group_candidates(uuid,text), public.class_group_log(uuid), public.my_section_groups(uuid),
  public.class_group_successor(uuid), public.class_group_preview(uuid), public.class_group_migrate(uuid), public.class_group_rollback(uuid),
  public.conversation_people(uuid), public._cg_title(uuid,uuid), public.sync_course_group(uuid) from public, anon;
revoke execute on function public._cg_title(uuid,uuid), public._cg_label(text[]) from authenticated;
do $$ declare s record; b jsonb; begin
  for s in select id from schools loop
    b := _cg_counts(s.id);
    perform _sync_school_classes(s.id);
    update conversations set status='archived', updated_at=now() where school_id=s.id and group_type='course' and status='active';
    insert into class_group_runs(school_id, action, before, after) values (s.id, 'migrate', b, _cg_counts(s.id));
  end loop;
end $$;
