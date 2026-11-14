update perm_role_grants g set scope='org' from perm_roles r where r.id=g.role_id and r.org_id is null and r.name='مسؤول صيانة باصات' and g.section='maint_bus';
alter table public.mt_requests add column if not exists bus_received_at timestamptz;

create or replace function public.mt_action(_id uuid, _rev integer, _action text, _data jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare me uuid := auth.uid(); r mt_requests; n mt_requests; body text := nullif(trim(coalesce(_data->>'body', _data->>'reason', '')),'');
  is_follow boolean; is_owner boolean; is_exec boolean; u uuid;
begin
  select * into r from mt_requests where id=_id for update;
  if r.id is null or not _mt_can_read(_id, me) then raise exception 'الطلب غير متاح' using errcode='42501'; end if;
  is_owner := _perm_owner(me, r.org_id);
  is_follow := is_owner or _mt_ok(me, r.school_id, r.kind, 'follow');
  is_exec := r.assignee_id = me and _mt_ok(me, r.school_id, r.kind, 'execute');
  if r.reopen_pending is not null and _action not in ('reply','note','reopen','reopen_decide') then raise exception 'يوجد طلب إعادة فتح بانتظار القرار'; end if;

  -- bus: assignment by the group owner or the bus maintenance staff (forward), never by follow-up
  if r.kind='bus' and _action='assign' then
    if _rev is not null and _rev <> r.rev then raise exception 'تم تحديث الطلب من مستخدم آخر؛ أعد التحميل' using errcode='40001'; end if;
    if not (is_owner or is_exec or (r.status='awaiting_assign' and _mt_ok(me, r.school_id,'bus','execute'))) then raise exception 'إسناد طلبات الباصات لمدير الصيانة أو مالك المجموعة' using errcode='42501'; end if;
    if r.status in ('closed','cancelled','awaiting_approval') then raise exception 'لا يمكن الإسناد في هذه الحالة'; end if;
    u := (_data->>'user')::uuid;
    if u is null or not _mt_ok(u, r.school_id, 'bus', 'execute') or _perm_owner(u, r.org_id) then raise exception 'الموظف غير مخول بتنفيذ صيانة الباصات'; end if;
    if r.assignee_id = u then raise exception 'الطلب مسند لهذا الموظف بالفعل'; end if;
    if r.assignee_id is not null and body is null then raise exception 'سبب إعادة الإسناد مطلوب'; end if;
    update mt_requests set assignee_id=u, status='assigned', accepted_at=null, rev=rev+1, updated_at=now() where id=_id returning * into n;
    perform _mt_ev(_id, case when r.assignee_id is null then 'assign' else 'reassign' end, 'public', body, jsonb_build_object('assignee',r.assignee_id), jsonb_build_object('assignee',u));
    perform _mt_note(n, u, 'أُسند إليك طلب صيانة باص', 'assign:'||u||':'||n.rev);
    if r.assignee_id is not null and r.assignee_id <> me then perform _mt_note(n, r.assignee_id, 'أُعيد إسناد الطلب لغيرك', 'unassign:'||r.assignee_id||':'||n.rev); end if;
    return jsonb_build_object('rev', n.rev, 'status', n.status);
  end if;

  if r.kind='bus' and _action='receive_bus' then
    if _rev is not null and _rev <> r.rev then raise exception 'تم تحديث الطلب من مستخدم آخر؛ أعد التحميل' using errcode='40001'; end if;
    if not is_exec or r.status not in ('in_progress','scheduled','returned','waiting_parts') then raise exception 'استلام الباص للمسؤول المسند بعد قبول الطلب'; end if;
    if r.bus_received_at is not null then raise exception 'سُجل استلام الباص مسبقًا'; end if;
    update mt_requests set bus_received_at=now(), status='in_progress', rev=rev+1, updated_at=now() where id=_id returning * into n;
    perform _mt_ev(_id,'bus_received','public',body,null,null);
    perform _mt_notify_follow(n,'استُلم الباص للصيانة','busrecv:'||n.rev);
    return jsonb_build_object('rev', n.rev, 'status', n.status);
  end if;

  if r.kind='bus' and _action='submit_completion' and r.bus_received_at is null then
    raise exception 'سجّل استلام الباص قبل تسليمه للمدرسة';
  end if;

  if _action not in ('reopen','reopen_decide') then
    if r.kind='bus' and _action='approve' then null; end if;
    perform 1; -- delegate
    return _mt_action_core(_id,_rev,_action,_data);
  end if;

  if _rev is not null and _rev <> r.rev then raise exception 'تم تحديث الطلب من مستخدم آخر؛ أعد التحميل' using errcode='40001'; end if;
  if body is null then raise exception 'السبب مطلوب'; end if;
  if _action = 'reopen' then
    if me <> r.requested_by and not is_owner then raise exception 'طلب إعادة الفتح لمقدم الطلب' using errcode='42501'; end if;
    if r.status <> 'closed' or r.reopen_until is null or now() > r.reopen_until then raise exception 'انتهت مهلة إعادة الفتح'; end if;
    if r.reopen_pending is not null then raise exception 'يوجد طلب إعادة فتح بانتظار القرار'; end if;
    update mt_requests set reopen_pending=jsonb_build_object('by',me,'at',now(),'reason',body), rev=rev+1, updated_at=now() where id=_id returning * into n;
    perform _mt_ev(_id,'reopen_request','public',body,null,null);
    perform _mt_notify_follow(n,'طلب إعادة فتح بانتظار قرارك','reopen-req:'||n.rev);
  else
    if not is_follow then raise exception 'قرار إعادة الفتح لمسؤول المتابعة' using errcode='42501'; end if;
    if r.status <> 'closed' or r.reopen_pending is null then raise exception 'لا يوجد طلب إعادة فتح'; end if;
    if me = r.completed_by or me = r.assignee_id then raise exception 'لا يقرر المنفذ في إعادة فتح عمله' using errcode='42501'; end if;
    if coalesce((_data->>'approve')::boolean,false) then
      update mt_requests set status='returned', reopen_cycle=reopen_cycle+1, reopen_pending=null, closed_at=null, closed_by=null, reopen_until=null,
        progress=0, submitted_at=null, bus_received_at=null, rev=rev+1, updated_at=now() where id=_id returning * into n;
      perform _mt_ev(_id,'reopen','public',body,
        jsonb_build_object('closed_at',r.closed_at,'closed_by',_adm_name(r.closed_by),'completed_by',_adm_name(r.completed_by),'completion_note',r.completion_note,'actual_cost',r.actual_cost,'bus_received_at',r.bus_received_at,'request',r.reopen_pending),
        jsonb_build_object('cycle',n.reopen_cycle+1));
      perform _mt_note(n, (r.reopen_pending->>'by')::uuid, 'قُبل طلب إعادة الفتح', 'reopen-ok:'||n.rev);
      if n.assignee_id is not null then perform _mt_note(n, n.assignee_id, 'أُعيد فتح طلب للاستكمال', 'reopen:'||n.rev); end if;
    else
      update mt_requests set reopen_pending=null, rev=rev+1, updated_at=now() where id=_id returning * into n;
      perform _mt_ev(_id,'reopen_reject','public',body,jsonb_build_object('request',r.reopen_pending),null);
      perform _mt_note(n, (r.reopen_pending->>'by')::uuid, 'رُفض طلب إعادة الفتح', 'reopen-no:'||n.rev);
    end if;
  end if;
  return jsonb_build_object('rev', n.rev, 'status', n.status);
end $function$;

create or replace function public.mt_get(_id uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare me uuid := auth.uid(); res jsonb := _mt_get_core(_id); r mt_requests; follow boolean; own boolean; ex boolean;
begin
  select * into r from mt_requests where id=_id;
  own := _perm_owner(me, r.org_id);
  follow := own or _mt_ok(me, r.school_id, r.kind, 'follow');
  ex := r.assignee_id = me and _mt_ok(me, r.school_id, r.kind, 'execute');
  return res || jsonb_build_object('reopen_cycle', r.reopen_cycle, 'bus_received_at', r.bus_received_at,
    'reopen_pending', case when r.reopen_pending is null then null else r.reopen_pending || jsonb_build_object('name',_adm_name((r.reopen_pending->>'by')::uuid)) end,
    'can', (res->'can') || jsonb_build_object(
      'reopen', coalesce((res->'can'->>'reopen')::boolean,false) and r.reopen_pending is null,
      'reopen_decide', follow and r.status='closed' and r.reopen_pending is not null and me is distinct from r.completed_by and me is distinct from r.assignee_id,
      'assign', case when r.kind='bus' then r.status not in ('closed','cancelled','awaiting_approval') and (own or ex or (r.status='awaiting_assign' and _mt_ok(me, r.school_id,'bus','execute')))
                     else coalesce((res->'can'->>'assign')::boolean,false) end,
      'receive_bus', r.kind='bus' and ex and r.bus_received_at is null and r.status in ('in_progress','scheduled','returned','waiting_parts'),
      'submit', coalesce((res->'can'->>'submit')::boolean,false) and (r.kind<>'bus' or r.bus_received_at is not null)));
end $function$;

revoke execute on function public.mt_action(uuid,integer,text,jsonb) from public, anon;
revoke execute on function public.mt_get(uuid) from public, anon;
grant execute on function public.mt_action(uuid,integer,text,jsonb) to authenticated;
grant execute on function public.mt_get(uuid) to authenticated;