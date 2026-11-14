
create or replace function public._classroom_room_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.section_room_id is null then perform _link_section_room(new.id); end if;
  return null;
end $$;
revoke all on function public._classroom_room_trg() from public, anon, authenticated;
create trigger classrooms_link_room after insert on public.classrooms for each row execute function public._classroom_room_trg();
