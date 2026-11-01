CREATE OR REPLACE FUNCTION public.decide_report(_id uuid, _status text, _decision text, _hide boolean DEFAULT false)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare r record; m record; begin
  select * into r from message_reports where id=_id for update;
  if r is null or not _report_reviewer(r.org_id, r.school_id) then raise exception 'غير مصرح'; end if;
  if _status not in ('resolved','dismissed','open') then raise exception 'حالة غير صالحة'; end if;
  if length(btrim(coalesce(_decision,''))) < 3 then raise exception 'اذكر سبب القرار'; end if;
  -- one decision per open report (double click / two reviewers); reopening only from a decided state
  if _status <> 'open' and r.status <> 'open' then raise exception 'سبق اتخاذ قرار في هذا البلاغ'; end if;
  if _status = 'open' and r.status = 'open' then raise exception 'البلاغ مفتوح بالفعل'; end if;
  update message_reports set status=_status, decision=_decision, reviewed_by=auth.uid(), reviewed_at=now() where id=_id;
  if _hide and _status<>'open' then
    select * into m from messages where id=r.message_id;
    if m.deleted_at is null then
      insert into message_revisions(message_id, body, action, actor) values (m.id, m.body, 'moderate', auth.uid());
      update messages set body='', deleted_at=now(), deleted_by=auth.uid() where id=m.id;
    end if;
  end if;
  perform _audit(r.org_id, r.school_id, null, null, case when _status='open' then 'report_reopen' else 'report_decide' end, jsonb_build_object('report', _id, 'status', _status, 'hidden', _hide, 'reason', _decision));
  -- the reporter learns the outcome only; the reviewer's internal reason stays in the audit log
  if _status<>'open' then perform _notify(r.reporter_id, r.school_id, 'report', 'تمت مراجعة بلاغك',
    case when _status='dismissed' then 'رُوجع البلاغ ولم يُتخذ إجراء على الرسالة.' when _hide then 'رُوجع البلاغ وأُخفيت الرسالة.' else 'رُوجع البلاغ وأُغلق.' end,
    '/app/communication', 'report-done:' || _id || ':' || extract(epoch from now())::bigint); end if;
end $function$;