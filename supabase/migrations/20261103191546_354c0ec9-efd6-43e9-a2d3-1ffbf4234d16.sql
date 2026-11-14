DO $mig$
declare d text; o text;
begin
  d := pg_get_functiondef('public.pc_expense_action'::regproc); o := d;
  d := replace(d, $x$    if nfiles = 0 and st.require_attachment and length(coalesce(e.no_attachment_reason,'')) < 5 then raise exception 'المرفق مطلوب للتقديم، أو اكتب سبب الاستثناء'; end if;
$x$, '');
  d := replace(d, $x$    if nfiles = 0 and st.require_attachment and length(btrim(coalesce(_reason,''))) < 5 then raise exception 'المصروف بلا مرفق: اكتب سبب موافقتك على الاستثناء'; end if;
$x$, '');
  if d = o then raise exception 'pc_expense_action patch did not apply'; end if;
  execute d;

  d := pg_get_functiondef('public.pc_request_action'::regproc); o := d;
  d := replace(d, 'mid uuid; label text;', 'mid uuid; label text; xe record;');
  d := replace(d, $x$if exists(select 1 from pc_expenses where custody_id=c.id and status in ('draft','returned','submitted','in_review')) then raise exception 'بتّ في كل فواتير كشف التسوية (اعتماد أو رفض) قبل اعتماد التسوية'; end if;$x$,
    $x$for xe in select id, rev from pc_expenses where custody_id=c.id and status in ('submitted','in_review') order by created_at loop
          perform pc_expense_action(xe.id, 'approve', xe.rev, coalesce(nullif(btrim(coalesce(_reason,'')),''), 'اعتُمدت ضمن كشف التسوية'));
        end loop;
        if exists(select 1 from pc_expenses where custody_id=c.id and status in ('draft','returned','submitted','in_review')) then raise exception 'على العهدة فواتير مسودة أو معادة؛ لا تُعتمد التسوية قبل إرسالها'; end if;$x$);
  d := replace(d, $x$if r.status not in ('draft','submitted','approved') then raise exception 'لا يُلغى هذا الطلب'; end if;$x$,
    $x$if r.status not in ('draft','submitted') then raise exception 'لا يُلغى الطلب بعد اعتماده'; end if;$x$);
  if d = o or position('xe record' in d) = 0 or position('بعد اعتماده' in d) = 0 or position('ضمن كشف التسوية' in d) = 0 then raise exception 'pc_request_action patch did not apply'; end if;
  execute d;
end $mig$;