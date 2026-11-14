revoke update on public.memberships from authenticated;
grant update (is_active) on public.memberships to authenticated;
revoke insert, delete on public.memberships from authenticated;
revoke insert, update on public.invitations from authenticated;