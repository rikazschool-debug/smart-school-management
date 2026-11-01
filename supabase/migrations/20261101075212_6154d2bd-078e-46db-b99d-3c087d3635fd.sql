create or replace function public.set_homework_join_policy(_hw uuid, _policy text, _days int) returns void language plpgsql security definer set search_path=public as $$
declare h record; begin
  select * into h from homework where id=_hw for update;
  if h is null or not is_course_teacher(h.course_id) then raise exception 'غير مصرح'; end if;
  if _policy not in ('review','auto','none') then raise exception 'سياسة غير صالحة'; end if;
  update homework set join_policy=_policy, join_days=coalesce(_days, join_days) where id=_hw;
  perform _hw_event(_hw, null, 'join_policy', jsonb_build_object('policy', _policy, 'days', coalesce(_days, h.join_days)));
end $$;
grant execute on function public.set_homework_join_policy(uuid,text,int) to authenticated;
revoke execute on function public.set_homework_join_policy(uuid,text,int) from anon, public;