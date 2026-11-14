CREATE OR REPLACE FUNCTION public.pc_expense_review_edit(_id uuid, _rev integer, _p jsonb, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
declare me uuid := auth.uid(); e pc_expenses; c pc_custodies; holder uuid; n int; l pc_expense_lines; x record; amt numeric; v_pd date; after pc_expenses; b record;
begin
  select * into e from pc_expenses where id=_id for update;
  if e.id is null or not _pc_can_expense(_id, 'view') then raise exception 'المصروف غير موجود' using errcode='42501'; end if;
  if e.rev <> _rev then raise exception 'تغيّر السجل؛ حدّث الصفحة'; end if;
  if e.status not in ('submitted','in_review') then raise exception 'يُعدّل المراجع الفاتورة المرسلة للمراجعة فقط'; end if;
  if e.custody_id is not null then select * into c from pc_custodies where id=e.custody_id for update; end if;
  holder := coalesce(c.holder_id, e.created_by);
  if me in (e.created_by, holder) then raise exception 'لا تعدّل مصروفك بصفة مراجع'; end if;
  if not _pc_ok(e.org_id, me, 'approve', e.school_id, null, null) then raise exception 'لا تملك صلاحية الاعتماد لهذا الفرع' using errcode='42501'; end if;
  if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'سبب التعديل مطلوب'; end if;
  if _p ? 'supplier' and length(btrim(coalesce(_p->>'supplier',''))) < 2 then raise exception 'المورد مطلوب'; end if;
  if _p ? 'description' and length(btrim(coalesce(_p->>'description',''))) < 2 then raise exception 'البيان مطلوب'; end if;
  if _p ? 'purchase_date' then v_pd := nullif(_p->>'purchase_date','')::date; if v_pd is null or v_pd > _pc_today() then raise exception 'تاريخ الشراء غير صالح'; end if; end if;
  if e.tax_invoice and _p ? 'invoice_no' and nullif(btrim(coalesce(_p->>'invoice_no','')),'') is null then raise exception 'رقم الفاتورة مطلوب للفاتورة الضريبية'; end if;
  if _p ? 'category_id' and nullif(_p->>'category_id','') is not null and not exists(select 1 from pc_categories where id=(_p->>'category_id')::uuid and org_id=e.org_id) then raise exception 'تصنيف غير صالح'; end if;
  update pc_expenses set
    supplier = case when _p ? 'supplier' then btrim(_p->>'supplier') else supplier end,
    invoice_no = case when _p ? 'invoice_no' then nullif(btrim(coalesce(_p->>'invoice_no','')),'') else invoice_no end,
    description = case when _p ? 'description' then btrim(_p->>'description') else description end,
    purchase_date = coalesce(v_pd, purchase_date),
    category_id = case when _p ? 'category_id' then nullif(_p->>'category_id','')::uuid else category_id end
   where id=_id;
  if _p ? 'amount' then
    amt := (_p->>'amount')::numeric;
    if amt is null or amt <= 0 then raise exception 'المبلغ غير صالح'; end if;
    select count(*) into n from pc_expense_lines where expense_id=_id;
    select * into l from pc_expense_lines where expense_id=_id limit 1;
    if n <> 1 or l.need_line_id is not null then raise exception 'تعديل المبلغ متاح للفاتورة ذات البند الواحد غير المرتبط بطلب احتياج؛ أعدها لمسؤول المشتريات'; end if;
    select * into x from _pc_calc(amt, l.taxable and e.tax_invoice, e.vat_rate, e.vat_inclusive);
    if c.id is not null then
      select * into b from _pc_bal(c.id, _id);
      if x.total > b.available then raise exception 'المبلغ يتجاوز المتاح في العهدة (% ريال)', b.available; end if;
    end if;
    update pc_expense_lines set amount=amt, net=x.net, vat=x.vat, total=x.total where id=l.id;
    update pc_expenses set net=x.net, vat=x.vat, total=x.total where id=_id;
  end if;
  update pc_expenses set rev=rev+1, updated_at=now() where id=_id returning * into after;
  perform _pc_log(e.org_id, 'expense', _id, 'review_edit',
    jsonb_build_object('supplier', e.supplier, 'invoice_no', e.invoice_no, 'description', e.description, 'purchase_date', e.purchase_date, 'category_id', e.category_id, 'total', e.total),
    jsonb_build_object('supplier', after.supplier, 'invoice_no', after.invoice_no, 'description', after.description, 'purchase_date', after.purchase_date, 'category_id', after.category_id, 'total', after.total), btrim(_reason));
  perform _pc_notify(e.created_by, e.school_id, 'عدّل المراجع فاتورتك', e.ref || ' — ' || btrim(_reason), 'pc-e-edit:' || _id || ':' || e.rev);
end $f$;
REVOKE ALL ON FUNCTION public.pc_expense_review_edit(uuid,integer,jsonb,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pc_expense_review_edit(uuid,integer,jsonb,text) TO authenticated, service_role;