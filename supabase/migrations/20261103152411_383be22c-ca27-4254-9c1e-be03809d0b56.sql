-- ===== Purchase needs (principal need → linked procurement officer → invoices with lines) =====
alter table public.pc_requests drop constraint pc_requests_kind_check;
alter table public.pc_requests add constraint pc_requests_kind_check check (kind in ('topup','settlement','purchase','adjust','transfer','need'));
alter table public.pc_requests drop constraint pc_requests_status_check;
alter table public.pc_requests add constraint pc_requests_status_check check (status in ('draft','submitted','approved','rejected','cancelled','done','awaiting_assignment','in_progress'));
alter table public.pc_requests add column if not exists assigned_to uuid, add column if not exists assigned_at timestamptz,
  add column if not exists need_approved_by uuid, add column if not exists need_approved_at timestamptz, add column if not exists close_note text;

create table public.pc_need_lines(
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.pc_requests(id) on delete cascade,
  ord int not null,
  description text not null,
  qty numeric(12,2) not null check (qty > 0),
  unit_price numeric(14,2) check (unit_price is null or unit_price >= 0),
  category_id uuid references public.pc_categories(id),
  unique(request_id, ord));
grant all on public.pc_need_lines to service_role;
alter table public.pc_need_lines enable row level security;

alter table public.pc_expense_lines add column if not exists need_line_id uuid references public.pc_need_lines(id),
  add column if not exists qty numeric(12,2), add column if not exists category_id uuid references public.pc_categories(id);
create unique index if not exists pc_expense_lines_need_uniq on public.pc_expense_lines(expense_id, need_line_id) where need_line_id is not null;

-- Officers linked to a school: active staff (not owners, not students/guardians) holding procurement «create» for the school.
create or replace function public._pc_need_officers(_org uuid, _school uuid) returns setof uuid
language sql stable security definer set search_path=public as $$
  select distinct m.user_id from memberships m
   where m.org_id=_org and m.is_active and not coalesce(m.branch_suspended,false) and m.role not in ('student','guardian')
     and not exists(select 1 from memberships o where o.org_id=_org and o.user_id=m.user_id and o.role='org_owner' and o.is_active)
     and _pc_ok(_org, m.user_id, 'create', _school, null, null) $$;

create or replace function public._pc_need_used(_line uuid, _approved_only boolean) returns numeric
language sql stable security definer set search_path=public as $$
  select coalesce(sum(el.qty),0) from pc_expense_lines el join pc_expenses e on e.id=el.expense_id
   where el.need_line_id=_line and (case when _approved_only then e.status='approved' else e.status not in ('rejected','cancelled') end) $$;

create or replace function public._pc_need_ok(_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from pc_requests r where r.id=_id and r.kind='need' and (
    r.created_by=auth.uid() or r.assigned_to=auth.uid() or is_org_owner(r.org_id)
    or (r.status<>'draft' and (is_school_principal(r.school_id) or _pc_ok(r.org_id, auth.uid(), 'view', r.school_id, null, null)
        or auth.uid() in (select _pc_need_officers(r.org_id, r.school_id)))))) $$;

create or replace function public._pc_need_notify_owners(_org uuid, _school uuid, _title text, _body text, _key text) returns void
language sql security definer set search_path=public as $$
  select _pc_notify(m.user_id, _school, _title, _body, _key) from (select distinct user_id from memberships where org_id=_org and role='org_owner' and is_active) m $$;

create or replace function public._pc_need_route(_id uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r pc_requests; offs uuid[]; u uuid;
begin
  select * into r from pc_requests where id=_id;
  select coalesce(array_agg(x),'{}') into offs from _pc_need_officers(r.org_id, r.school_id) x where x not in (r.created_by, coalesce(r.need_approved_by, r.created_by));
  if array_length(offs,1) = 1 then
    update pc_requests set status='in_progress', assigned_to=offs[1], assigned_at=now(), rev=rev+1, updated_at=now() where id=_id;
    perform _pc_log(r.org_id, 'request', _id, 'need_assigned', null, jsonb_build_object('to', offs[1], 'auto', true), null);
    perform _pc_notify(offs[1], r.school_id, 'طلب احتياج مُسند إليك', r.ref || ' — ' || r.purpose, 'pc-need-as:' || _id || ':' || offs[1]);
  else
    update pc_requests set status='awaiting_assignment', assigned_to=null, assigned_at=null, rev=rev+1, updated_at=now() where id=_id;
    perform _pc_need_notify_owners(r.org_id, r.school_id,
      case when coalesce(array_length(offs,1),0) = 0 then 'طلب احتياج بانتظار الإسناد: لا يوجد مسؤول مشتريات مخوّل للفرع' else 'طلب احتياج بانتظار الإسناد' end,
      r.ref || ' — ' || (select name from schools where id=r.school_id), 'pc-need-wait:' || _id || ':' || r.rev);
    foreach u in array offs loop
      perform _pc_notify(u, r.school_id, 'طلب احتياج متاح للاستلام', r.ref || ' — ' || r.purpose, 'pc-need-av:' || _id || ':' || u);
    end loop;
  end if;
end $$;

create or replace function public.pc_need_save(_org uuid, _id uuid, _d jsonb, _rev int, _key uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); r pc_requests; rid uuid; v_school uuid; v_purpose text := btrim(coalesce(_d->>'purpose','')); l jsonb; i int := 0; tot numeric := 0;
  q numeric; up numeric; cat uuid;
begin
  if _id is null and _key is not null then
    select id into rid from pc_requests where idem_key=_key and created_by=me;
    if rid is not null then return rid; end if;
  end if;
  if not section_enabled(_org, 'finance') then raise exception 'القسم غير مفعّل' using errcode='42501'; end if;
  if _id is not null then
    select * into r from pc_requests where id=_id and org_id=_org and kind='need' for update;
    if r.id is null or r.created_by <> me then raise exception 'غير مصرح' using errcode='42501'; end if;
    if r.status <> 'draft' then raise exception 'لا يُعدّل الطلب بعد اعتماده'; end if;
    if r.rev <> _rev then raise exception 'تغيّر السجل؛ حدّث الصفحة'; end if;
    v_school := r.school_id;
  else
    v_school := nullif(_d->>'school_id','')::uuid;
    if school_org(v_school) is distinct from _org then raise exception 'الفرع خارج المؤسسة'; end if;
  end if;
  if not is_school_principal(v_school) or is_platform_admin() and not is_org_owner(_org) and not has_school_role(v_school, array['principal']::app_role[]) then
    raise exception 'طلب الاحتياج ينشئه مدير المدرسة لمدرسته' using errcode='42501'; end if;
  if length(v_purpose) < 3 or not _pc_safe(v_purpose) then raise exception 'الغرض مطلوب'; end if;
  if jsonb_typeof(_d->'lines') <> 'array' or jsonb_array_length(_d->'lines') = 0 then raise exception 'أضف بندًا واحدًا على الأقل'; end if;
  if jsonb_array_length(_d->'lines') > 50 then raise exception 'الحد 50 بندًا'; end if;
  if _id is null then
    insert into pc_requests(org_id, ref, kind, school_id, purpose, status, created_by, idem_key)
      values (_org, _pc_ref(_org, 'request', 'REQ'), 'need', v_school, v_purpose, 'draft', me, _key) returning id into rid;
  else
    rid := _id; update pc_requests set purpose=v_purpose, rev=rev+1, updated_at=now() where id=rid;
    delete from pc_need_lines where request_id=rid;
  end if;
  for l in select * from jsonb_array_elements(_d->'lines') loop
    i := i + 1;
    q := nullif(l->>'qty','')::numeric; up := nullif(l->>'unit_price','')::numeric; cat := nullif(l->>'category_id','')::uuid;
    if length(btrim(coalesce(l->>'description',''))) < 2 or not _pc_safe(l->>'description') then raise exception 'وصف البند % مطلوب', i; end if;
    if q is null or q <= 0 or q <> round(q,2) then raise exception 'كمية البند % غير صالحة', i; end if;
    if up is not null and (up < 0 or up <> round(up,2)) then raise exception 'سعر البند % غير صالح', i; end if;
    if cat is not null and not exists(select 1 from pc_categories where id=cat and org_id=_org and archived_at is null) then raise exception 'تصنيف البند % غير صالح', i; end if;
    insert into pc_need_lines(request_id, ord, description, qty, unit_price, category_id) values (rid, i, btrim(l->>'description'), q, up, cat);
    tot := tot + coalesce(q*up,0);
  end loop;
  update pc_requests set amount=nullif(round(tot,2),0) where id=rid;
  perform _pc_log(_org, 'request', rid, case when _id is null then 'need_create' else 'need_update' end, null, jsonb_build_object('lines', i, 'estimate', tot), null);
  return rid;
end $$;

create or replace function public.pc_need_action(_id uuid, _action text, _rev int, _reason text, _user uuid) returns void
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); r pc_requests; owner boolean; full_done boolean;
begin
  select * into r from pc_requests where id=_id and kind='need' for update;
  if r.id is null or not _pc_need_ok(_id) then raise exception 'الطلب غير موجود أو خارج نطاقك' using errcode='42501'; end if;
  if not section_enabled(r.org_id, 'finance') then raise exception 'القسم غير مفعّل' using errcode='42501'; end if;
  if r.rev <> _rev then raise exception 'تغيّر السجل؛ حدّث الصفحة'; end if;
  owner := is_org_owner(r.org_id);
  if _action = 'approve' then
    if r.status <> 'draft' then raise exception 'الطلب ليس مسودة'; end if;
    if not (owner or has_school_role(r.school_id, array['principal']::app_role[])) then raise exception 'اعتماد الاحتياج لمدير المدرسة' using errcode='42501'; end if;
    update pc_requests set need_approved_by=me, need_approved_at=now(), submitted_at=now() where id=_id;
    perform _pc_log(r.org_id, 'request', _id, 'need_approve', jsonb_build_object('status','draft'), null, nullif(btrim(coalesce(_reason,'')),''));
    perform _pc_need_route(_id);
    return;
  elsif _action = 'assign' then
    if r.status not in ('awaiting_assignment','in_progress') then raise exception 'لا يُسند الطلب في حالته الحالية'; end if;
    if _user is null then raise exception 'اختر مسؤول المشتريات'; end if;
    if not owner then
      if _user <> me or r.status <> 'awaiting_assignment' then raise exception 'الإسناد لمالك المؤسسة؛ يمكن للمسؤول المخوّل استلام الطلب لنفسه فقط' using errcode='42501'; end if;
    end if;
    if _user in (r.created_by, r.need_approved_by) then raise exception 'لا يُسند الشراء لمن طلب الاحتياج أو اعتمده'; end if;
    if not exists(select 1 from _pc_need_officers(r.org_id, r.school_id) x where x=_user) then raise exception 'الشخص لا يملك صلاحية الشراء لهذا الفرع'; end if;
    if r.assigned_to is not null and r.assigned_to <> _user and exists(select 1 from pc_expenses e where e.purchase_request_id=_id and e.created_by=r.assigned_to and e.status in ('draft','submitted','in_review','returned')) then
      raise exception 'للمسؤول الحالي فواتير مفتوحة على الطلب؛ أنهها أو ألغها أولًا'; end if;
    if owner and length(btrim(coalesce(_reason,''))) < 3 and r.assigned_to is not null then raise exception 'سبب إعادة الإسناد مطلوب'; end if;
    update pc_requests set status='in_progress', assigned_to=_user, assigned_at=now(), rev=rev+1, updated_at=now() where id=_id;
    perform _pc_log(r.org_id, 'request', _id, 'need_assigned', jsonb_build_object('to', r.assigned_to), jsonb_build_object('to', _user, 'claim', _user = me), nullif(btrim(coalesce(_reason,'')),''));
    if _user <> me then perform _pc_notify(_user, r.school_id, 'طلب احتياج مُسند إليك', r.ref || ' — ' || r.purpose, 'pc-need-as:' || _id || ':' || _user); end if;
    perform _pc_notify(r.created_by, r.school_id, 'طلب الاحتياج لدى مسؤول المشتريات', r.ref || ' — ' || _pc_name(_user), 'pc-need-cr:' || _id || ':' || _user);
    return;
  elsif _action = 'cancel' then
    if r.status not in ('draft','awaiting_assignment','in_progress') then raise exception 'لا يُلغى هذا الطلب'; end if;
    if not (me = r.created_by or owner or has_school_role(r.school_id, array['principal']::app_role[])) then raise exception 'غير مصرح' using errcode='42501'; end if;
    if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'السبب مطلوب'; end if;
    if exists(select 1 from pc_expenses e where e.purchase_request_id=_id and e.status not in ('rejected','cancelled')) then raise exception 'على الطلب فواتير مسجلة؛ استخدم «إغلاق» بدل الإلغاء'; end if;
    update pc_requests set status='cancelled', decision_reason=btrim(_reason), rev=rev+1, updated_at=now() where id=_id;
  elsif _action = 'close' then
    if r.status <> 'in_progress' then raise exception 'الطلب ليس قيد التنفيذ'; end if;
    if not (me = r.assigned_to or owner) then raise exception 'غير مصرح' using errcode='42501'; end if;
    if exists(select 1 from pc_expenses e where e.purchase_request_id=_id and e.status in ('draft','submitted','in_review','returned')) then raise exception 'على الطلب فواتير لم يُبتّ فيها بعد'; end if;
    select bool_and(_pc_need_used(l.id, true) >= l.qty) into full_done from pc_need_lines l where l.request_id=_id;
    if not coalesce(full_done,false) and length(btrim(coalesce(_reason,''))) < 3 then raise exception 'تنفيذ جزئي: اذكر سبب الإغلاق'; end if;
    update pc_requests set status='done', done_by=me, done_at=now(), close_note=nullif(btrim(coalesce(_reason,'')),''), rev=rev+1, updated_at=now() where id=_id;
  else raise exception 'إجراء غير معروف'; end if;
  perform _pc_log(r.org_id, 'request', _id, 'need_' || _action, jsonb_build_object('status', r.status), null, _reason);
  perform _pc_notify(r.created_by, r.school_id, case _action when 'cancel' then 'أُلغي طلب الاحتياج' else 'اكتمل طلب الاحتياج' end, r.ref || coalesce(' — ' || nullif(btrim(coalesce(_reason,'')),''), ''), 'pc-need-' || _action || ':' || _id);
end $$;

create or replace function public._pc_need_lines_json(_id uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'ord', l.ord, 'description', l.description, 'qty', l.qty, 'unit_price', l.unit_price,
     'category_id', l.category_id, 'category', (select name from pc_categories where id=l.category_id),
     'committed', _pc_need_used(l.id, false), 'approved', _pc_need_used(l.id, true), 'remaining', greatest(l.qty - _pc_need_used(l.id, false), 0),
     'spent', (select coalesce(sum(el.total),0) from pc_expense_lines el join pc_expenses e on e.id=el.expense_id where el.need_line_id=l.id and e.status='approved')) order by l.ord), '[]')
  from pc_need_lines l where l.request_id=_id $$;

create or replace function public.pc_need_get(_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare r pc_requests; me uuid := auth.uid(); owner boolean; officer boolean; offs jsonb;
begin
  select * into r from pc_requests where id=_id and kind='need';
  if r.id is null or not _pc_need_ok(_id) then raise exception 'الطلب غير موجود أو خارج نطاقك' using errcode='42501'; end if;
  if not section_enabled(r.org_id, 'finance') then raise exception 'القسم غير مفعّل' using errcode='42501'; end if;
  owner := is_org_owner(r.org_id);
  officer := exists(select 1 from _pc_need_officers(r.org_id, r.school_id) x where x=me);
  select coalesce(jsonb_agg(jsonb_build_object('id', x, 'name', _pc_name(x)) order by _pc_name(x)), '[]') into offs
    from _pc_need_officers(r.org_id, r.school_id) x where x not in (r.created_by, coalesce(r.need_approved_by, r.created_by));
  return _pc_request_row(r) || jsonb_build_object(
    'assigned_name', case when r.assigned_to is not null then _pc_name(r.assigned_to) end,
    'approver_name', case when r.need_approved_by is not null then _pc_name(r.need_approved_by) end,
    'lines', _pc_need_lines_json(_id),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'ref', e.ref, 'total', e.total, 'status', e.status, 'supplier', e.supplier) order by e.created_at) from pc_expenses e where e.purchase_request_id=_id),'[]'),
    'officers', case when owner then offs else '[]'::jsonb end,
    'officers_count', jsonb_array_length(offs),
    'can', jsonb_build_object(
      'edit', r.status='draft' and r.created_by=me,
      'approve', r.status='draft' and (owner or has_school_role(r.school_id, array['principal']::app_role[])),
      'assign', owner and r.status in ('awaiting_assignment','in_progress'),
      'claim', r.status='awaiting_assignment' and officer and me not in (r.created_by, coalesce(r.need_approved_by, r.created_by)),
      'invoice', r.status='in_progress' and r.assigned_to=me,
      'close', r.status='in_progress' and (r.assigned_to=me or owner),
      'cancel', r.status in ('draft','awaiting_assignment','in_progress') and (me=r.created_by or owner or has_school_role(r.school_id, array['principal']::app_role[]))));
end $$;

create or replace function public.pc_need_list(_org uuid, _status text, _limit int, _offset int) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not section_enabled(_org, 'finance') then raise exception 'القسم غير مفعّل' using errcode='42501'; end if;
  return jsonb_build_object(
    'rows', coalesce((select jsonb_agg(x) from (select _pc_request_row(r) || jsonb_build_object('assigned_name', case when r.assigned_to is not null then _pc_name(r.assigned_to) end,
        'mine', r.assigned_to = auth.uid()) x
      from pc_requests r where r.org_id=_org and r.kind='need' and (_status is null or r.status=_status) and _pc_need_ok(r.id)
      order by r.updated_at desc limit least(coalesce(_limit,50),200) offset coalesce(_offset,0)) t),'[]'),
    'can_create', exists(select 1 from memberships m join schools s on s.id=m.school_id where m.user_id=auth.uid() and m.org_id=_org and m.is_active and not coalesce(m.branch_suspended,false) and m.role in ('principal')) or is_org_owner(_org),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name) from schools s where s.org_id=_org and s.is_active and
        (is_org_owner(_org) or has_school_role(s.id, array['principal']::app_role[]))),'[]'));
end $$;

-- Expense hook: link invoice lines to need lines (partial delivery, no over-quantity, same request only).
create or replace function public._pc_expense_ext(_eid uuid, _d jsonb, _new boolean) returns void
language plpgsql security definer set search_path=public as $$
declare e pc_expenses; fid uuid; flds jsonb; pr pc_requests; v uuid := nullif(_d->>'purchase_request_id','')::uuid; l jsonb; i int := 0; nl pc_need_lines; q numeric; cat uuid;
begin
  select * into e from pc_expenses where id=_eid;
  if _new then
    select id into fid from pc_forms where org_id=e.org_id and status='published';
    update pc_expenses set form_id=fid where id=_eid;
  else fid := e.form_id; end if;
  select fields into flds from pc_forms where id=fid;
  if v is not null then
    select * into pr from pc_requests where id=v;
    if pr.id is null or pr.org_id <> e.org_id then raise exception 'الطلب المرتبط غير صالح'; end if;
    if pr.kind = 'purchase' then
      if pr.status <> 'approved' or (pr.custody_id is not null and pr.custody_id is distinct from e.custody_id) then raise exception 'طلب الشراء المسبق غير صالح أو غير معتمد'; end if;
    elsif pr.kind = 'need' then
      if pr.status <> 'in_progress' or pr.assigned_to is distinct from e.created_by then raise exception 'طلب الاحتياج ليس مسندًا إليك أو ليس قيد التنفيذ'; end if;
      if e.corrects_id is not null then raise exception 'لا يُربط التصحيح بطلب احتياج'; end if;
      if pr.school_id is distinct from e.benefit_school_id and pr.school_id is distinct from e.school_id then raise exception 'الفاتورة لفرع غير فرع طلب الاحتياج'; end if;
    else raise exception 'الطلب المرتبط غير صالح'; end if;
  end if;
  update pc_expense_lines set need_line_id=null, qty=null, category_id=null where expense_id=_eid;
  if jsonb_typeof(_d->'lines') = 'array' then
    for l in select * from jsonb_array_elements(_d->'lines') loop
      i := i + 1;
      cat := nullif(l->>'category_id','')::uuid; q := nullif(l->>'qty','')::numeric;
      if cat is not null and not exists(select 1 from pc_categories where id=cat and org_id=e.org_id) then raise exception 'تصنيف البند % غير صالح', i; end if;
      if q is not null and (q <= 0 or q <> round(q,2)) then raise exception 'كمية البند % غير صالحة', i; end if;
      if nullif(l->>'need_line_id','') is not null then
        select * into nl from pc_need_lines where id=(l->>'need_line_id')::uuid;
        if nl.id is null or v is null or nl.request_id <> v or pr.kind <> 'need' then raise exception 'البند % مرتبط ببند خارج طلب الاحتياج', i; end if;
        if q is null then raise exception 'كمية البند % مطلوبة لربطه بالاحتياج', i; end if;
        cat := coalesce(cat, nl.category_id);
      end if;
      update pc_expense_lines set need_line_id=nullif(l->>'need_line_id','')::uuid, qty=q, category_id=cat where expense_id=_eid and ord=i;
    end loop;
  end if;
  if pr.kind = 'need' then
    if not exists(select 1 from pc_expense_lines where expense_id=_eid and need_line_id is not null) then raise exception 'اربط بندًا واحدًا على الأقل ببنود طلب الاحتياج'; end if;
    for nl in select n.* from pc_need_lines n where n.request_id=v and n.id in (select need_line_id from pc_expense_lines where expense_id=_eid) loop
      if _pc_need_used(nl.id, false) > nl.qty then raise exception 'الكمية لبند «%» تتجاوز المتبقي (% من %)', nl.description, nl.qty - (_pc_need_used(nl.id, false) - (select sum(qty) from pc_expense_lines where expense_id=_eid and need_line_id=nl.id)), nl.qty; end if;
    end loop;
  end if;
  update pc_expenses set custom=_pc_check_answers(flds, coalesce(_d->'custom','{}'), false, _eid), purchase_request_id=v where id=_eid;
end $$;

create or replace function public._pc_expense_submit_check(_eid uuid) returns void
language plpgsql security definer set search_path=public as $$
declare e pc_expenses; f pc_forms; st pc_settings; x jsonb; pr pc_requests; nl pc_need_lines;
begin
  select * into e from pc_expenses where id=_eid;
  select * into f from pc_forms where id=e.form_id;
  perform _pc_check_answers(f.fields, e.custom, true, _eid);
  for x in select * from jsonb_array_elements(coalesce(f.core, _pc_core_default())) loop
    if (x->>'required')::boolean then
      if x->>'key'='invoice_date' and e.invoice_date is null then raise exception 'الحقل «%» مطلوب', x->>'label'; end if;
      if x->>'key'='invoice_no' and e.invoice_no is null then raise exception 'الحقل «%» مطلوب', x->>'label'; end if;
      if x->>'key'='category' and e.category_id is null then raise exception 'الحقل «%» مطلوب', x->>'label'; end if;
      if x->>'key'='notes' and e.notes is null then raise exception 'الحقل «%» مطلوب', x->>'label'; end if;
    end if;
  end loop;
  select * into pr from pc_requests where id=e.purchase_request_id;
  if pr.kind = 'need' then
    if pr.status <> 'in_progress' or pr.assigned_to is distinct from e.created_by then raise exception 'طلب الاحتياج ليس مسندًا إليك أو ليس قيد التنفيذ'; end if;
    for nl in select n.* from pc_need_lines n where n.request_id=pr.id loop
      if _pc_need_used(nl.id, false) > nl.qty then raise exception 'الكمية لبند «%» تتجاوز المتبقي', nl.description; end if;
    end loop;
  end if;
  st := _pc_settings(e.org_id);
  if st.purchase_request_above is not null and e.corrects_id is null and e.total > st.purchase_request_above then
    if pr.id is null or (pr.kind = 'purchase' and (pr.status <> 'approved' or pr.amount < e.total)) or (pr.kind = 'need' and pr.status <> 'in_progress') then
      raise exception 'المصروف يتجاوز % ريال: يلزم طلب شراء مسبق أو طلب احتياج معتمد', st.purchase_request_above; end if;
  end if;
end $$;

create or replace function public._pc_expense_approved(_eid uuid) returns void
language plpgsql security definer set search_path=public as $$
declare e pc_expenses; pr pc_requests; full_done boolean;
begin
  select * into e from pc_expenses where id=_eid;
  if e.purchase_request_id is not null then
    select * into pr from pc_requests where id=e.purchase_request_id for update;
    if pr.kind = 'need' then
      if pr.status <> 'in_progress' then raise exception 'طلب الاحتياج لم يعد قيد التنفيذ'; end if;
      select bool_and(_pc_need_used(l.id, true) + case when exists(select 1 from pc_expense_lines x where x.expense_id=_eid and x.need_line_id=l.id) then (select sum(qty) from pc_expense_lines x where x.expense_id=_eid and x.need_line_id=l.id) else 0 end >= l.qty)
        into full_done from pc_need_lines l where l.request_id=pr.id;
      if full_done then
        update pc_requests set status='done', done_by=auth.uid(), done_at=now(), rev=rev+1, updated_at=now() where id=pr.id;
        perform _pc_notify(pr.created_by, pr.school_id, 'اكتمل تنفيذ طلب الاحتياج', pr.ref, 'pc-need-done:' || pr.id);
      end if;
    else
      update pc_requests set status='done', done_by=auth.uid(), done_at=now(), rev=rev+1, updated_at=now() where id=e.purchase_request_id and status='approved';
      if not found and e.corrects_id is null and (select purchase_request_above from pc_settings where org_id=e.org_id) < e.total then raise exception 'طلب الشراء المسبق لم يعد معتمدًا'; end if;
    end if;
  end if;
  if e.custody_id is not null then perform _pc_low_check(e.custody_id); end if;
end $$;

-- Generic request RPCs never act on needs.
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.pc_request_action(uuid,text,int,text)'::regprocedure);
  if position('kind = ''need''' in d) = 0 then
    d := replace(d, $x$  if r.custody_id is not null then select * into c from pc_custodies where id=r.custody_id for update; end if;$x$,
      $x$  if r.kind = 'need' then raise exception 'طلبات الاحتياج تُدار من شاشتها'; end if;
  if r.custody_id is not null then select * into c from pc_custodies where id=r.custody_id for update; end if;$x$);
    if position('طلبات الاحتياج تُدار' in d) = 0 then raise exception 'pc_request_action patch anchor'; end if;
    execute d;
  end if;
end $do$;

revoke all on function public._pc_need_officers(uuid,uuid), public._pc_need_used(uuid,boolean), public._pc_need_ok(uuid), public._pc_need_notify_owners(uuid,uuid,text,text,text),
  public._pc_need_route(uuid), public._pc_need_lines_json(uuid), public._pc_expense_ext(uuid,jsonb,boolean), public._pc_expense_submit_check(uuid), public._pc_expense_approved(uuid) from public, anon, authenticated;
revoke all on function public.pc_need_save(uuid,uuid,jsonb,int,uuid), public.pc_need_action(uuid,text,int,text,uuid), public.pc_need_get(uuid), public.pc_need_list(uuid,text,int,int) from public, anon;
grant execute on function public.pc_need_save(uuid,uuid,jsonb,int,uuid), public.pc_need_action(uuid,text,int,text,uuid), public.pc_need_get(uuid), public.pc_need_list(uuid,text,int,int) to authenticated;