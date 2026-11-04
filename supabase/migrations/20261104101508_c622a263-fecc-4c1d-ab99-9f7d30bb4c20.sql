alter table public.mt_requests add column if not exists reopen_pending jsonb, add column if not exists reopen_cycle int not null default 0;

alter function public.mt_action(uuid,integer,text,jsonb) rename to _mt_action_core;
revoke all on function public._mt_action_core(uuid,integer,text,jsonb) from public, anon, authenticated;
alter function public.mt_get(uuid) rename to _mt_get_core;
revoke all on function public._mt_get_core(uuid) from public, anon, authenticated;

create or replace function public.mt_action(_id uuid, _rev integer, _action text, _data jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare me uuid := auth.uid(); r mt_requests; n mt_requests; body text := nullif(trim(coalesce(_data->>'body', _data->>'reason', '')),'');
  is_follow boolean; is_owner boolean;
begin
  if _action not in ('reopen','reopen_decide') then
    select * into r from mt_requests where id=_id;
    if r.reopen_pending is not null and _action <> 'reply' and _action <> 'note' then raise exception 'يوجد طلب إعادة فتح بانتظار القرار'; end if;
    return _mt_action_core(_id,_rev,_action,_data);
  end if;
  select * into r from mt_requests where id=_id for update;
  if r.id is null or not _mt_can_read(_id, me) then raise exception 'الطلب غير متاح' using errcode='42501'; end if;
  if _rev is not null and _rev <> r.rev then raise exception 'تم تحديث الطلب من مستخدم آخر؛ أعد التحميل' using errcode='40001'; end if;
  is_owner := _perm_owner(me, r.org_id);
  is_follow := is_owner or _mt_ok(me, r.school_id, r.kind, 'follow');
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
        progress=0, submitted_at=null, rev=rev+1, updated_at=now() where id=_id returning * into n;
      perform _mt_ev(_id,'reopen','public',body,
        jsonb_build_object('closed_at',r.closed_at,'closed_by',_adm_name(r.closed_by),'completed_by',_adm_name(r.completed_by),'completion_note',r.completion_note,'actual_cost',r.actual_cost,'request',r.reopen_pending),
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
declare me uuid := auth.uid(); res jsonb := _mt_get_core(_id); r mt_requests; follow boolean;
begin
  select * into r from mt_requests where id=_id;
  follow := _perm_owner(me, r.org_id) or _mt_ok(me, r.school_id, r.kind, 'follow');
  return res || jsonb_build_object('reopen_cycle', r.reopen_cycle,
    'reopen_pending', case when r.reopen_pending is null then null else r.reopen_pending || jsonb_build_object('name',_adm_name((r.reopen_pending->>'by')::uuid)) end,
    'can', (res->'can') || jsonb_build_object(
      'reopen', coalesce((res->'can'->>'reopen')::boolean,false) and r.reopen_pending is null,
      'reopen_decide', follow and r.status='closed' and r.reopen_pending is not null and me is distinct from r.completed_by and me is distinct from r.assignee_id));
end $function$;

grant execute on function public.mt_action(uuid,integer,text,jsonb) to authenticated;
grant execute on function public.mt_get(uuid) to authenticated;