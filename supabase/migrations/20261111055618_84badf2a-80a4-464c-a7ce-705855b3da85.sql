alter table public.wa_messages add column if not exists on_behalf boolean not null default false;

create or replace function public._wa_can(_org uuid) returns boolean language sql stable security definer set search_path to 'public' as $$
  select auth.uid() is not null and _org is not null and (
    exists(select 1 from memberships m where m.user_id=auth.uid() and m.org_id=_org and m.role='org_owner' and m.is_active)
    or (is_platform_admin() and exists(select 1 from user_active_context c where c.user_id=auth.uid() and c.role='org_owner' and c.org_id=_org))
  ) $$;

create or replace function public._wa_out_claim(_local text, _conv uuid, _kind text, _body text, _file text, _user uuid)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare r wa_messages; o uuid; ob boolean;
begin
  select * into r from wa_messages where local_id=_local;
  if found then return jsonb_build_object('claimed', false, 'status', r.status, 'id', r.id); end if;
  select org_id into o from wa_conversations where id=_conv;
  ob := exists(select 1 from platform_admins where user_id=_user)
        and not exists(select 1 from memberships m where m.user_id=_user and m.org_id=o and m.role='org_owner' and m.is_active);
  insert into wa_messages(conversation_id, local_id, direction, kind, body, file_name, status, status_times, sent_by, on_behalf)
  values (_conv, _local, 'out', _kind, _body, _file, 'sending', '{}'::jsonb, _user, ob) returning * into r;
  if ob then
    insert into access_audit(org_id, actor, action, after, reason)
    values (o, _user, 'wa_reply_on_behalf', jsonb_build_object('conversation', _conv, 'message', r.id, 'kind', _kind), 'رد مالك المنصة نيابةً عن مالك المجموعة');
  end if;
  return jsonb_build_object('claimed', true, 'status', 'sending', 'id', r.id);
end $function$;
revoke execute on function public._wa_out_claim(text,uuid,text,text,text,uuid) from public, anon, authenticated;