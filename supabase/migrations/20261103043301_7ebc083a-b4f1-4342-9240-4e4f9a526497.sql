alter table public.adm_meeting_members drop constraint adm_meeting_members_rsvp_check;
alter table public.adm_meeting_members add constraint adm_meeting_members_rsvp_check check (rsvp = any (array['pending','accepted','declined','rejected']));

create or replace function public.adm_meeting_rsvp(_id uuid, _rsvp text, _note text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare m adm_meetings; x adm_meeting_members; n text := nullif(btrim(coalesce(_note,'')),''); begin
  select * into m from adm_meetings where id=_id;
  select * into x from adm_meeting_members where meeting_id=_id and user_id=auth.uid() for update;
  if m.id is null or x.user_id is null then raise exception 'الرد على الدعوة للمدعوين فقط'; end if;
  if m.status <> 'scheduled' or m.live_status = 'ended' then raise exception 'الاجتماع غير متاح للرد'; end if;
  if _rsvp not in ('accepted','declined','rejected') then raise exception 'رد غير صالح'; end if;
  if _rsvp in ('declined','rejected') and n is null then raise exception 'اكتب سبب الرفض أو الاعتذار'; end if;
  if _rsvp = 'accepted' then n := null; end if;
  if x.rsvp = _rsvp and coalesce(x.rsvp_note,'') = coalesce(n,'') then return; end if;
  update adm_meeting_members set rsvp=_rsvp, rsvp_note=n, rsvp_at=now() where meeting_id=_id and user_id=auth.uid();
  perform _adm_log(m.school_id, 'meeting', _id, 'rsvp_' || _rsvp, jsonb_build_object('note', n));
  if _rsvp <> 'accepted' then
    perform _notify(m.organizer, m.school_id, 'admin', case when _rsvp='rejected' then 'رفض دعوة اجتماع: ' else 'اعتذار عن اجتماع: ' end || m.title,
      _adm_name(auth.uid()) || ' — ' || n, '/app/admin/meetings/' || _id, 'adm:meet:' || _id || ':' || _rsvp || ':' || auth.uid() || ':' || md5(n));
  end if;
end $function$;

-- Personal meeting list (both modes) for the Communication tab; same adm_meetings record as administration/calendar.
create or replace function public.adm_my_meetings()
returns table(id uuid, title text, starts_at timestamptz, duration_min int, status text, live_status text, mode text, location text,
  organizer_name text, school_name text, invited_at timestamptz, am_organizer boolean, needs_rsvp boolean, my_rsvp text, my_note text)
language sql stable security definer set search_path to 'public' as $function$
  select m.id, m.title, m.starts_at, m.duration_min, m.status, m.live_status, m.mode, m.location, _adm_name(m.organizer),
    (select name from schools where schools.id=m.school_id), m.sent_at, m.organizer=auth.uid(), m.needs_rsvp, x.rsvp, x.rsvp_note
  from adm_meetings m left join adm_meeting_members x on x.meeting_id=m.id and x.user_id=auth.uid()
  where m.status in ('scheduled','held','cancelled') and m.sent_at is not null
    and (m.organizer=auth.uid() or (x.user_id is not null and not x.banned))
    and m.starts_at > now() - interval '60 days'
  order by (m.live_status='live') desc, (m.status <> 'scheduled' or m.live_status='ended'), m.starts_at
  limit 200
$function$;
revoke execute on function public.adm_my_meetings() from public, anon;
grant execute on function public.adm_my_meetings() to authenticated, service_role;