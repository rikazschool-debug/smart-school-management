create or replace function public._cg_viewer_staff(_conv uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from conversations c join conversation_members m on m.conversation_id=c.id and m.user_id=auth.uid() and m.left_at is null
    where c.id=_conv and c.school_id is not null and _ctx_staff(c.org_id, c.school_id)
      and (m.role in ('owner','moderator') or coalesce(m.reasons,'{}') && array['teacher','principal','manual']
           or exists(select 1 from conv_member_overrides o where o.conversation_id=c.id and o.user_id=auth.uid() and not o.removed and (o.added or o.reason is not null))))
$$;
revoke execute on function public._cg_viewer_staff(uuid) from public, anon;
grant execute on function public._cg_viewer_staff(uuid) to authenticated;