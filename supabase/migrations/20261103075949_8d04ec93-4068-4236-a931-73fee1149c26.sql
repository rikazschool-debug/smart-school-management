drop function if exists public._support_internal_actions();
create or replace function public.support_get(_ticket uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare t support_tickets; mgr boolean; h boolean; begin
  select * into t from support_tickets where id=_ticket;
  if t.id is null or not support_can_read(_ticket) then raise exception 'غير مصرح'; end if;
  mgr := support_manager(t); h := support_handler(t);
  return jsonb_build_object(
    'ticket', to_jsonb(t) - 'client_key' - 'linked_ticket' - 'response_alerted_at' - 'resolve_alerted_at' || jsonb_build_object(
      'category', (select name from support_categories where id=t.category_id),
      'school_name', (select name from schools where id=t.school_id),
      'requester_name', (select full_name from profiles where id=t.requester),
      'assignee_name', (select full_name from profiles where id=t.assignee),
      'student_name', (select full_name from students where id=t.student_id),
      'linked', case when t.linked_ticket is not null and support_can_read(t.linked_ticket) then (select jsonb_build_object('id', x.id, 'ref', x.ref) from support_tickets x where x.id=t.linked_ticket) end,
      'escalations', (select jsonb_agg(jsonb_build_object('id', x.id, 'ref', x.ref, 'status', x.status)) from support_tickets x where x.linked_ticket=t.id and support_can_read(x.id))),
    'can', jsonb_build_object('manage', mgr, 'handle', h, 'requester', t.requester=auth.uid(),
      'assign', mgr and t.scope='school', 'transfer', t.scope='school' and is_org_owner(t.org_id), 'escalate', t.scope='school' and is_org_owner(t.org_id)),
    'reopen_days', coalesce((select s.reopen_days from support_settings s where s.org_id is not distinct from (case when t.scope='platform' then null else t.org_id end)), 7),
    'messages', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'author', m.author, 'author_name', p.full_name, 'is_requester', m.author=t.requester, 'body', m.body, 'created_at', m.created_at, 'edited_at', m.edited_at,
        'revisions', (select count(*) from support_message_revisions r where r.message_id=m.id)) order by m.created_at)
      from support_messages m left join profiles p on p.id=m.author where m.ticket_id=t.id), '[]'),
    'notes', case when h then coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'author_name', pa.full_name, 'recipient_name', pr.full_name, 'mine', n.author=auth.uid(), 'body', n.body, 'created_at', n.created_at) order by n.created_at)
      from support_notes n left join profiles pa on pa.id=n.author left join profiles pr on pr.id=n.recipient
      where n.ticket_id=t.id and (n.kind='team' and auth.uid()<>t.requester or n.author=auth.uid() or n.recipient=auth.uid())), '[]') else '[]'::jsonb end,
    'info', case when h then coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'to_name', p.full_name, 'by_name', pb.full_name, 'question', r.question, 'answer', r.answer, 'status', r.status, 'created_at', r.created_at, 'answered_at', r.answered_at) order by r.created_at)
      from support_info_requests r left join profiles p on p.id=r.asked_to left join profiles pb on pb.id=r.asked_by where r.ticket_id=t.id), '[]') else '[]'::jsonb end,
    'managers', case when h then coalesce((select jsonb_agg(distinct jsonb_build_object('id', m.user_id, 'name', p.full_name))
      from memberships m left join profiles p on p.id=m.user_id where m.is_active and m.user_id<>auth.uid() and m.user_id<>t.requester and t.scope='school'
        and ((m.org_id=t.org_id and m.role='org_owner') or (m.school_id=t.school_id and m.role='principal'))), '[]') else '[]'::jsonb end,
    'events', coalesce((select jsonb_agg(jsonb_build_object('action', e.action, 'from', e.from_status, 'to', e.to_status,
        'details', case when h then e.details when e.action in ('transfer','assign') then e.details - 'reason' else e.details end,
        'actor_name', p.full_name, 'created_at', e.created_at) order by e.created_at desc)
      from support_events e left join profiles p on p.id=e.actor where e.ticket_id=t.id
        and (h or e.action not in ('note_private','note_team','info_requested','info_answered','info_cancelled','escalated','sla_breach'))), '[]'));
end $$;