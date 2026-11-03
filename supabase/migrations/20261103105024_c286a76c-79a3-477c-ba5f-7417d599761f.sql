-- ===== schema =====
create table public.pc_requests(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  ref text not null,
  kind text not null check (kind in ('topup','settlement','purchase','adjust','transfer')),
  custody_id uuid references public.pc_custodies(id),
  school_id uuid not null references public.schools(id),
  amount numeric(14,2),
  purpose text not null,
  supplier text, category_id uuid references public.pc_categories(id),
  to_holder uuid, new_custody_id uuid references public.pc_custodies(id),
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','cancelled','done')),
  created_by uuid not null, submitted_at timestamptz, decided_by uuid, decided_at timestamptz, decision_reason text,
  done_by uuid, done_at timestamptz, move_id uuid,
  rev int not null default 1, idem_key uuid unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(org_id, ref));
create index pc_requests_org_idx on public.pc_requests(org_id, status);
create index pc_requests_custody_idx on public.pc_requests(custody_id);
create table public.pc_forms(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  version int not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  core jsonb not null, fields jsonb not null default '[]', note text,
  created_by uuid not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  published_by uuid, published_at timestamptz,
  unique(org_id, version));
create unique index pc_forms_one_draft on public.pc_forms(org_id) where status='draft';
create unique index pc_forms_one_pub on public.pc_forms(org_id) where status='published';
grant all on public.pc_requests, public.pc_forms to service_role;
alter table public.pc_requests enable row level security;
alter table public.pc_forms enable row level security;
-- RPC-only tables: deny every direct client access explicitly.
create policy "pc_requests no direct access" on public.pc_requests for all to authenticated using (false) with check (false);
create policy "pc_forms no direct access" on public.pc_forms for all to authenticated using (false) with check (false);

alter table public.pc_expenses add column form_id uuid references public.pc_forms(id), add column custom jsonb not null default '{}', add column purchase_request_id uuid references public.pc_requests(id);
alter table public.pc_settings add column purchase_request_above numeric(14,2), add column due_soon_days int not null default 3;
alter table public.pc_custodies add column closed_at timestamptz, add column closed_by uuid;

-- ===== helpers =====
create or replace function public._pc_safe(_t text) returns boolean language sql immutable set search_path=public as $$
  select _t is null or (_t !~ '[<>{}]' and _t !~ '^\s*[=+@]' and _t !~* 'javascript:') $$;

create or replace function public._pc_core_default() returns jsonb language sql immutable set search_path=public as $$
  select '[{"key":"description","label":"البيان","help":"","required":true},{"key":"supplier","label":"المورد","help":"","required":true},
    {"key":"purchase_date","label":"تاريخ الشراء","help":"","required":true},{"key":"tax","label":"فاتورة ضريبية","help":"","required":false},
    {"key":"invoice_no","label":"رقم الفاتورة","help":"","required":false},{"key":"invoice_date","label":"تاريخ الفاتورة","help":"","required":false},
    {"key":"lines","label":"البنود","help":"","required":true},{"key":"category","label":"التصنيف","help":"","required":false},
    {"key":"benefit_school","label":"الفرع المستفيد","help":"","required":false},{"key":"notes","label":"ملاحظات","help":"","required":false}]'::jsonb $$;

-- Core fields: label/help/order editable; financial and linking fields are always required and keep their type.
create or replace function public._pc_check_core(_c jsonb) returns jsonb language plpgsql immutable set search_path=public as $$
declare x jsonb; d jsonb := _pc_core_default(); out jsonb := '[]'; seen text[] := '{}'; k text; prot text[] := array['description','supplier','purchase_date','lines','tax','benefit_school'];
  lab text; hlp text; req boolean;
begin
  if jsonb_typeof(coalesce(_c,'[]')) <> 'array' then raise exception 'بنية الحقول الأساسية غير صالحة'; end if;
  for x in select * from jsonb_array_elements(coalesce(_c,'[]')) loop
    k := x->>'key';
    if not exists(select 1 from jsonb_array_elements(d) y where y->>'key'=k) then raise exception 'حقل أساسي غير معروف: %', k; end if;
    if k = any(seen) then continue; end if;
    seen := seen || k;
    lab := left(btrim(coalesce(x->>'label','')), 60); hlp := left(btrim(coalesce(x->>'help','')), 200);
    if lab = '' then lab := (select y->>'label' from jsonb_array_elements(d) y where y->>'key'=k); end if;
    if not _pc_safe(lab) or not _pc_safe(hlp) then raise exception 'لا تُقبل الرموز أو الصيغ في التسمية أو الوصف'; end if;
    req := case when k = any(prot) then (k <> 'tax' and k <> 'benefit_school') else coalesce((x->>'required')::boolean, false) end;
    out := out || jsonb_build_array(jsonb_build_object('key', k, 'label', lab, 'help', hlp, 'required', req, 'protected', k = any(prot)));
  end loop;
  for x in select * from jsonb_array_elements(d) loop
    if not ((x->>'key') = any(seen)) then out := out || jsonb_build_array(x || jsonb_build_object('protected', (x->>'key') = any(prot))); end if;
  end loop;
  return out;
end $$;

create or replace function public._pc_check_custom(_f jsonb) returns jsonb language plpgsql immutable set search_path=public as $$
declare x jsonb; o jsonb; out jsonb := '[]'; i int := 0; k text; keys text[] := '{}';
begin
  if jsonb_typeof(coalesce(_f,'[]')) <> 'array' then raise exception 'بنية الحقول الإضافية غير صالحة'; end if;
  if jsonb_array_length(coalesce(_f,'[]')) > 20 then raise exception 'الحد الأقصى 20 حقلًا إضافيًا'; end if;
  for x in select * from jsonb_array_elements(coalesce(_f,'[]')) loop
    i := i + 1;
    if coalesce(btrim(x->>'label'),'') = '' then raise exception 'لكل حقل إضافي اسم'; end if;
    if not (x->>'type' = any(array['text','longtext','number','date','choice','file'])) then raise exception 'نوع حقل غير مدعوم: %', x->>'type'; end if;
    if not _pc_safe(x->>'label') or not _pc_safe(x->>'help') then raise exception 'لا تُقبل الرموز أو الصيغ في «%»', x->>'label'; end if;
    if x->>'type'='choice' then
      if jsonb_typeof(x->'options')<>'array' or jsonb_array_length(x->'options') < 2 then raise exception 'القائمة «%» تحتاج خيارين على الأقل', x->>'label'; end if;
      for o in select * from jsonb_array_elements(x->'options') loop
        if jsonb_typeof(o) <> 'string' or btrim(o #>> '{}') = '' or not _pc_safe(o #>> '{}') then raise exception 'خيار غير صالح في «%»', x->>'label'; end if;
      end loop;
    end if;
    k := coalesce(nullif(x->>'key',''), 'c' || i);
    if k !~ '^[a-z][a-z0-9_]{0,30}$' then k := 'c' || i; end if;
    if k = any(keys) then k := k || '_' || i; end if;
    keys := keys || k;
    out := out || jsonb_build_array(jsonb_build_object('key', k, 'label', left(btrim(x->>'label'),80), 'help', left(btrim(coalesce(x->>'help','')),200), 'type', x->>'type',
      'required', coalesce((x->>'required')::boolean,false), 'options', case when x->>'type'='choice' then x->'options' else '[]'::jsonb end));
  end loop;
  return out;
end $$;

create or replace function public._pc_check_answers(_fields jsonb, _a jsonb, _strict boolean, _expense uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare x jsonb; v text; out jsonb := '{}';
begin
  for x in select * from jsonb_array_elements(coalesce(_fields,'[]')) loop
    v := nullif(btrim(coalesce(_a->>(x->>'key'), '')), '');
    if v is null then
      if _strict and (x->>'required')::boolean then raise exception 'الحقل «%» مطلوب', x->>'label'; end if;
      continue;
    end if;
    if x->>'type'='number' and v !~ '^-?\d+(\.\d+)?$' then raise exception 'الحقل «%» يقبل رقمًا', x->>'label'; end if;
    if x->>'type'='date' and v !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'الحقل «%» يقبل تاريخًا', x->>'label'; end if;
    if x->>'type'='choice' and not (x->'options' ? v) then raise exception 'قيمة غير مسموحة في «%»', x->>'label'; end if;
    if x->>'type' in ('text','longtext') and not _pc_safe(v) then raise exception 'لا تُقبل الرموز أو الصيغ في «%»', x->>'label'; end if;
    if x->>'type'='file' and (v !~ '^[0-9a-f-]{36}$' or not exists(select 1 from files f where f.id=v::uuid and f.source_type='pc' and f.category='expense' and f.source_id=_expense)) then
      raise exception 'ارفع ملف «%» ضمن مرفقات المصروف ثم اختره', x->>'label'; end if;
    out := out || jsonb_build_object(x->>'key', left(v, case when x->>'type'='longtext' then 4000 else 300 end));
  end loop;
  return out;
end $$;

create or replace function public._pc_low_check(_custody uuid) returns void
language plpgsql security definer set search_path=public as $$
declare c pc_custodies; st pc_settings; b record; n int;
begin
  select * into c from pc_custodies where id=_custody;
  if c.id is null or c.status not in ('disbursed','settling') then return; end if;
  st := _pc_settings(c.org_id);
  if coalesce(st.low_balance,0) <= 0 then return; end if;
  select * into b from _pc_bal(c.id);
  if b.available > st.low_balance then return; end if;
  select count(*) into n from pc_moves where custody_id=c.id and kind in ('disburse','topup','carry_in');
  perform _pc_notify(c.holder_id, c.school_id, 'انخفض رصيد عهدتك', c.ref || ' — المتاح ' || b.available || ' ريال', 'pc-low:' || c.id || ':' || n);
end $$;

create or replace function public._pc_expense_ext(_eid uuid, _d jsonb, _new boolean) returns void
language plpgsql security definer set search_path=public as $$
declare e pc_expenses; fid uuid; flds jsonb; pr pc_requests; v uuid := nullif(_d->>'purchase_request_id','')::uuid;
begin
  select * into e from pc_expenses where id=_eid;
  if _new then
    select id into fid from pc_forms where org_id=e.org_id and status='published';
    update pc_expenses set form_id=fid where id=_eid;
  else fid := e.form_id; end if;
  select fields into flds from pc_forms where id=fid;
  if v is not null then
    select * into pr from pc_requests where id=v;
    if pr.id is null or pr.org_id <> e.org_id or pr.kind <> 'purchase' or pr.status <> 'approved' or (pr.custody_id is not null and pr.custody_id is distinct from e.custody_id) then
      raise exception 'طلب الشراء المسبق غير صالح أو غير معتمد'; end if;
  end if;
  update pc_expenses set custom=_pc_check_answers(flds, coalesce(_d->'custom','{}'), false, _eid), purchase_request_id=v where id=_eid;
end $$;

create or replace function public._pc_expense_submit_check(_eid uuid) returns void
language plpgsql security definer set search_path=public as $$
declare e pc_expenses; f pc_forms; st pc_settings; x jsonb; pr pc_requests;
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
  st := _pc_settings(e.org_id);
  if st.purchase_request_above is not null and e.corrects_id is null and e.total > st.purchase_request_above then
    select * into pr from pc_requests where id=e.purchase_request_id;
    if pr.id is null or pr.status <> 'approved' or pr.amount < e.total then
      raise exception 'المصروف يتجاوز % ريال: يلزم طلب شراء مسبق معتمد لا يقل عن قيمته', st.purchase_request_above; end if;
  end if;
end $$;

create or replace function public._pc_expense_approved(_eid uuid) returns void
language plpgsql security definer set search_path=public as $$
declare e pc_expenses;
begin
  select * into e from pc_expenses where id=_eid;
  if e.purchase_request_id is not null then
    update pc_requests set status='done', done_by=auth.uid(), done_at=now(), rev=rev+1, updated_at=now() where id=e.purchase_request_id and status='approved';
    if not found and e.corrects_id is null and (select purchase_request_above from pc_settings where org_id=e.org_id) < e.total then raise exception 'طلب الشراء المسبق لم يعد معتمدًا'; end if;
  end if;
  if e.custody_id is not null then perform _pc_low_check(e.custody_id); end if;
end $$;

-- Patch existing expense RPCs (hooks only; core logic unchanged).
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.pc_expense_save(uuid,uuid,jsonb,int,uuid)'::regprocedure);
  if position('_pc_expense_ext' in d) = 0 then
    if (length(d) - length(replace(d, E'  return e.id;\nend', ''))) / length(E'  return e.id;\nend') <> 1 then raise exception 'pc_expense_save patch anchor'; end if;
    d := replace(d, E'  return e.id;\nend', E'  perform _pc_expense_ext(e.id, _d, _id is null);\n  return e.id;\nend');
    execute d;
  end if;
  d := pg_get_functiondef('public.pc_expense_action(uuid,text,int,text)'::regprocedure);
  if position('_pc_expense_submit_check' in d) = 0 then
    if (length(d) - length(replace(d, $x$nxt := 'submitted';$x$, ''))) / length($x$nxt := 'submitted';$x$) <> 1
       or (length(d) - length(replace(d, $x$nxt := 'approved';$x$, ''))) / length($x$nxt := 'approved';$x$) <> 1 then raise exception 'pc_expense_action patch anchor'; end if;
    d := replace(d, $x$nxt := 'submitted';$x$, $x$perform _pc_expense_submit_check(_id); nxt := 'submitted';$x$);
    d := replace(d, $x$nxt := 'approved';$x$, $x$perform _pc_expense_approved(_id); nxt := 'approved';$x$);
    execute d;
  end if;
  -- Large result pages (exports) need the export permission, checked on the server.
  for d in select pg_get_functiondef(p) from unnest(array['public.pc_custody_list(uuid,text,text,uuid,boolean,int,int)'::regprocedure, 'public.pc_expense_list(uuid,text,text,uuid,uuid,uuid,date,date,int,int)'::regprocedure]) p loop
    if position('التصدير غير مصرح' in d) = 0 then
      d := replace(d, $x$if perm_scope(_org, me, 'procurement', 'view') is null then raise exception 'غير مصرح' using errcode='42501'; end if;$x$,
        $x$if perm_scope(_org, me, 'procurement', 'view') is null then raise exception 'غير مصرح' using errcode='42501'; end if;
  if coalesce(_limit,50) > 200 and perm_scope(_org, me, 'procurement', 'export') is null then raise exception 'التصدير غير مصرح' using errcode='42501'; end if;$x$);
      if position('التصدير غير مصرح' in d) = 0 then raise exception 'list export patch failed'; end if;
      execute d;
    end if;
  end loop;
  -- Transfer recipients: any active staff member of the organization (caller needs create permission).
  d := pg_get_functiondef('public._people_pool(text,uuid,uuid,uuid)'::regprocedure);
  if position('pc_transfer' in d) = 0 then
    d := replace(d, $x$  if _purpose = 'pc_holder' then$x$, $x$  if _purpose = 'pc_transfer' then
    if perm_scope(org, auth.uid(), 'procurement', 'create') is null then raise exception 'غير مصرح' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m join schools s on s.id=m.school_id
      where m.is_active and s.org_id=org and m.role not in ('student','guardian');
    return;
  end if;
  if _purpose = 'pc_holder' then$x$);
    if position('pc_transfer' in d) = 0 then raise exception '_people_pool patch failed'; end if;
    execute d;
  end if;
end $do$;

-- ===== files =====
create or replace function public._pc_req_ok(_id uuid, _action text) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from pc_requests r left join pc_custodies c on c.id=r.custody_id where r.id=_id
    and (r.to_holder = auth.uid() or _pc_ok(r.org_id, auth.uid(), _action, r.school_id, coalesce(c.holder_id, r.created_by), r.created_by))) $$;

create or replace function public._pc_file_ok(_category text, _id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select case _category
    when 'custody' then _pc_can_custody(_id, 'view')
    when 'expense' then _pc_can_expense(_id, 'view')
    when 'refund' then exists(select 1 from pc_refunds r where r.id=_id and _pc_can_expense(r.expense_id, 'view'))
    when 'request' then _pc_req_ok(_id, 'view')
    else false end $$;

create or replace function public.create_pc_file(_entity text, _id uuid, _name text, _mime text, _size bigint)
returns table(id uuid, storage_path text) language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); sch uuid; pol record; fid uuid := gen_random_uuid(); p text; ok boolean := false; c pc_custodies; e pc_expenses; r pc_refunds; q pc_requests;
begin
  if _entity = 'custody' then
    select * into c from pc_custodies x where x.id=_id;
    ok := c.id is not null and c.status in ('approved','disbursed','settling') and c.holder_id <> me and _pc_ok(c.org_id, me, 'disburse', c.school_id, null, null);
    sch := c.school_id;
  elsif _entity = 'expense' then
    select * into e from pc_expenses x where x.id=_id;
    ok := e.id is not null and e.created_by = me and e.status in ('draft','returned');
    sch := e.school_id;
  elsif _entity = 'refund' then
    select * into r from pc_refunds x where x.id=_id;
    select * into c from pc_custodies x where x.id=r.custody_id;
    ok := r.id is not null and r.status='pending' and (r.created_by = me or ((_pc_ok(r.org_id, me, 'disburse', c.school_id, null, null) or _pc_ok(r.org_id, me, 'approve', c.school_id, null, null)) and me <> c.holder_id));
    sch := c.school_id;
  elsif _entity = 'request' then
    select * into q from pc_requests x where x.id=_id;
    select * into c from pc_custodies x where x.id=q.custody_id;
    ok := q.id is not null and ((q.created_by = me and q.status = 'draft')
      or (q.kind = 'topup' and q.status = 'approved' and me <> c.holder_id and _pc_ok(q.org_id, me, 'disburse', q.school_id, null, null)));
    sch := q.school_id;
  end if;
  if not coalesce(ok,false) then raise exception 'غير مصرح بإرفاق ملف هنا' using errcode='42501'; end if;
  if not section_enabled(school_org(sch), 'finance') then raise exception 'القسم غير مفعّل' using errcode='42501'; end if;
  select * into pol from _file_policy(sch);
  if not (_mime = any(pol.allowed_types)) then raise exception 'نوع الملف غير مسموح'; end if;
  if _size > pol.max_bytes then raise exception 'حجم الملف يتجاوز الحد المسموح (% ميغابايت)', pol.max_bytes/1048576; end if;
  p := sch || '/pc/' || fid;
  insert into files(id, school_id, storage_path, name, mime_type, size_bytes, source_type, source_id, category, uploaded_by)
    values (fid, sch, p, left(_name,200), _mime, _size, 'pc', _id, _entity, me);
  return query select fid, p;
end $$;

create or replace function public.pc_file_remove(_file uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  update files set source_type='cleanup_due' where id=_file and source_type='pc' and uploaded_by=auth.uid()
    and not exists(select 1 from pc_moves m where m.file_id=files.id)
    and ((category='expense' and exists(select 1 from pc_expenses e where e.id=files.source_id and e.status in ('draft','returned')))
      or (category='custody' and exists(select 1 from pc_custodies c where c.id=files.source_id and c.status in ('approved','disbursed','settling')))
      or (category='refund' and exists(select 1 from pc_refunds r where r.id=files.source_id and r.status='pending'))
      or (category='request' and exists(select 1 from pc_requests q where q.id=files.source_id and q.status in ('draft','approved'))));
  if not found then raise exception 'لا يمكن إزالة هذا المرفق'; end if;
end $$;

-- ===== requests =====
create or replace function public._pc_request_row(r public.pc_requests) returns jsonb
language sql stable security definer set search_path=public as $$
  select to_jsonb(r) - 'idem_key' || jsonb_build_object(
    'creator', _pc_name(r.created_by), 'decider', case when r.decided_by is not null then _pc_name(r.decided_by) end,
    'school', (select name from schools where id=r.school_id), 'category', (select name from pc_categories where id=r.category_id),
    'custody_ref', (select ref from pc_custodies where id=r.custody_id), 'holder', (select _pc_name(holder_id) from pc_custodies where id=r.custody_id),
    'holder_id', (select holder_id from pc_custodies where id=r.custody_id),
    'to_holder_name', case when r.to_holder is not null then _pc_name(r.to_holder) end,
    'new_custody_ref', (select ref from pc_custodies where id=r.new_custody_id),
    'files_count', (select count(*) from files where source_type='pc' and category='request' and source_id=r.id)) $$;

create or replace function public.pc_request_save(_org uuid, _id uuid, _d jsonb, _rev int, _key uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); r pc_requests; c pc_custodies; rid uuid; k text; v_school uuid; v_amount numeric := nullif(_d->>'amount','')::numeric;
  v_custody uuid := nullif(_d->>'custody_id','')::uuid; v_to uuid := nullif(_d->>'to_holder','')::uuid; v_cat uuid := nullif(_d->>'category_id','')::uuid;
  v_purpose text := btrim(coalesce(_d->>'purpose','')); v_sup text := nullif(btrim(coalesce(_d->>'supplier','')),'');
begin
  if _id is null and _key is not null then
    select id into rid from pc_requests where idem_key=_key and created_by=me;
    if rid is not null then return rid; end if;
  end if;
  if not section_enabled(_org, 'finance') then raise exception 'القسم غير مفعّل' using errcode='42501'; end if;
  if _id is not null then
    select * into r from pc_requests where id=_id and org_id=_org for update;
    if r.id is null or r.created_by <> me then raise exception 'غير مصرح' using errcode='42501'; end if;
    if r.status <> 'draft' then raise exception 'لا يُعدّل الطلب بعد تقديمه'; end if;
    if r.rev <> _rev then raise exception 'تغيّر السجل؛ حدّث الصفحة'; end if;
    k := r.kind; v_custody := r.custody_id;
  else k := _d->>'kind'; end if;
  if k is null or k not in ('topup','settlement','purchase','adjust','transfer') then raise exception 'نوع الطلب غير صالح'; end if;
  if v_custody is not null then
    select * into c from pc_custodies where id=v_custody and org_id=_org;
    if c.id is null then raise exception 'العهدة غير موجودة'; end if;
    if not (me = c.holder_id or _pc_ok(_org, me, 'create', c.school_id, c.holder_id, null)) or perm_scope(_org, me, 'procurement', 'create') is null then
      raise exception 'لا تملك تقديم طلب على هذه العهدة' using errcode='42501'; end if;
    v_school := c.school_id;
  elsif k = 'purchase' then
    v_school := nullif(_d->>'school_id','')::uuid;
    if school_org(v_school) is distinct from _org then raise exception 'الفرع خارج المؤسسة'; end if;
    if not _pc_ok(_org, me, 'create', v_school, me, null) then raise exception 'غير مصرح' using errcode='42501'; end if;
  else raise exception 'اختر العهدة المرتبطة'; end if;
  if length(v_purpose) < 3 or not _pc_safe(v_purpose) then raise exception 'الغرض أو السبب مطلوب'; end if;
  if v_cat is not null and not exists(select 1 from pc_categories where id=v_cat and org_id=_org) then raise exception 'تصنيف غير صالح'; end if;
  if k = 'topup' then
    if c.status <> 'disbursed' then raise exception 'التعزيز لعهدة مصروفة مفتوحة فقط'; end if;
    if v_amount is null or v_amount <= 0 or v_amount <> round(v_amount,2) then raise exception 'المبلغ غير صالح'; end if;
  elsif k = 'settlement' then
    if c.status <> 'disbursed' then raise exception 'طلب التسوية لعهدة مصروفة مفتوحة فقط'; end if;
    if exists(select 1 from pc_requests x where x.custody_id=c.id and x.kind='settlement' and x.status in ('draft','submitted','approved') and x.id is distinct from _id) then raise exception 'يوجد طلب تسوية مفتوح لهذه العهدة'; end if;
    v_amount := null;
  elsif k = 'purchase' then
    if v_amount is null or v_amount <= 0 or v_amount <> round(v_amount,2) then raise exception 'المبلغ التقديري غير صالح'; end if;
    if v_custody is not null and c.status not in ('approved','disbursed','settling') then raise exception 'العهدة غير مفتوحة'; end if;
  elsif k = 'adjust' then
    if c.status not in ('disbursed','settling') then raise exception 'المعالجة لعهدة مصروفة فقط'; end if;
    if v_amount is null or v_amount = 0 or v_amount <> round(v_amount,2) then raise exception 'مبلغ الفرق غير صالح (سالب للعجز، موجب للزيادة)'; end if;
    if length(v_purpose) < 5 then raise exception 'اشرح سبب العجز أو الزيادة'; end if;
  elsif k = 'transfer' then
    if c.status <> 'disbursed' then raise exception 'النقل لعهدة مصروفة مفتوحة فقط'; end if;
    if v_to is null or v_to = c.holder_id or not _perm_staff(_org, v_to) then raise exception 'اختر مستلمًا جديدًا من موظفي المؤسسة'; end if;
    v_amount := null;
  end if;
  if _id is null then
    insert into pc_requests(org_id, ref, kind, custody_id, school_id, amount, purpose, supplier, category_id, to_holder, created_by, idem_key)
      values (_org, _pc_ref(_org, 'request', 'RQ'), k, v_custody, v_school, v_amount, v_purpose, v_sup, v_cat, case when k='transfer' then v_to end, me, _key) returning * into r;
    perform _pc_log(_org, 'request', r.id, 'create', null, to_jsonb(r) - 'idem_key', null);
    return r.id;
  end if;
  update pc_requests set amount=v_amount, purpose=v_purpose, supplier=v_sup, category_id=v_cat, school_id=v_school, to_holder=case when k='transfer' then v_to end, rev=rev+1, updated_at=now() where id=_id;
  perform _pc_log(_org, 'request', _id, 'update', to_jsonb(r) - 'idem_key', (select to_jsonb(x) - 'idem_key' from pc_requests x where id=_id), null);
  return _id;
end $$;

create or replace function public.pc_request_action(_id uuid, _action text, _rev int, _reason text) returns void
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); r pc_requests; c pc_custodies; holder uuid; lim numeric; b record; nxt text; mid uuid; label text;
begin
  select * into r from pc_requests where id=_id for update;
  if r.id is null or not _pc_req_ok(_id, 'view') then raise exception 'الطلب غير موجود أو خارج نطاقك' using errcode='42501'; end if;
  if not section_enabled(r.org_id, 'finance') then raise exception 'القسم غير مفعّل' using errcode='42501'; end if;
  if r.rev <> _rev then raise exception 'تغيّر السجل؛ حدّث الصفحة'; end if;
  if r.custody_id is not null then select * into c from pc_custodies where id=r.custody_id for update; end if;
  holder := coalesce(c.holder_id, r.created_by);
  label := case r.kind when 'topup' then 'تعزيز' when 'settlement' then 'تسوية' when 'purchase' then 'شراء مسبق' when 'adjust' then 'معالجة فرق' else 'نقل عهدة' end;
  if _action = 'submit' then
    if r.status <> 'draft' or r.created_by <> me then raise exception 'غير مصرح' using errcode='42501'; end if;
    if r.kind = 'settlement' then
      if c.status <> 'disbursed' then raise exception 'العهدة ليست مفتوحة'; end if;
      update pc_custodies set status='settling', rev=rev+1, updated_at=now() where id=c.id;
      perform _pc_log(r.org_id, 'custody', c.id, 'settle_request', jsonb_build_object('status', c.status), jsonb_build_object('status','settling','request', r.id), null);
    elsif r.kind = 'transfer' then
      select * into b from _pc_bal(c.id);
      if b.pending > 0 then raise exception 'لا تُنقل العهدة وعليها مصروفات قيد المراجعة'; end if;
      if b.book <= 0 then raise exception 'لا رصيد لنقله'; end if;
    elsif r.kind = 'topup' and c.status <> 'disbursed' then raise exception 'العهدة ليست مفتوحة';
    end if;
    nxt := 'submitted';
  elsif _action in ('approve','reject','return') then
    if r.status <> 'submitted' then raise exception 'الطلب ليس بانتظار القرار'; end if;
    if me in (r.created_by, holder) or me is not distinct from r.to_holder then raise exception 'لا يمكنك البت في طلب أنت مقدّمه أو صاحب العهدة فيه؛ يبقى بانتظار معتمد آخر'; end if;
    if not _pc_ok(r.org_id, me, 'approve', r.school_id, null, null) then raise exception 'لا تملك صلاحية الاعتماد لهذا الفرع' using errcode='42501'; end if;
    if _action <> 'approve' and length(btrim(coalesce(_reason,''))) < 3 then raise exception 'السبب مطلوب'; end if;
    if _action = 'approve' then
      lim := _pc_limit(r.org_id, me);
      if lim is not null and r.kind in ('topup','purchase','adjust') and abs(r.amount) > lim then raise exception 'المبلغ يتجاوز حد اعتمادك (% ريال)', lim; end if;
      if r.kind = 'adjust' then
        if c.status not in ('disbursed','settling') then raise exception 'العهدة ليست مفتوحة'; end if;
        select * into b from _pc_bal(c.id);
        if b.book + r.amount < b.pending then raise exception 'العجز يتجاوز الرصيد بعد المعلّق'; end if;
        insert into pc_moves(org_id, custody_id, kind, amount, ref, doc_date, note, actor)
          values (r.org_id, c.id, 'adjust', r.amount, r.ref, _pc_today(), (case when r.amount < 0 then 'عجز: ' else 'زيادة: ' end) || r.purpose, me) returning id into mid;
        perform _pc_log(r.org_id, 'custody', c.id, 'adjust', null, jsonb_build_object('move', mid, 'amount', r.amount, 'request', r.id), r.purpose);
        nxt := 'done';
      elsif r.kind = 'transfer' then
        select * into b from _pc_bal(c.id);
        if b.pending > 0 then raise exception 'على العهدة مصروفات قيد المراجعة'; end if;
        nxt := 'approved';
      else nxt := 'approved'; end if;
    elsif _action = 'return' then nxt := 'draft';
    else nxt := 'rejected'; end if;
    if r.kind = 'settlement' and nxt in ('draft','rejected') and c.status = 'settling' then
      update pc_custodies set status='disbursed', rev=rev+1, updated_at=now() where id=c.id;
      perform _pc_log(r.org_id, 'custody', c.id, 'settle_reopened', jsonb_build_object('status','settling'), jsonb_build_object('status','disbursed'), _reason);
    end if;
  elsif _action = 'decline' then
    if r.kind <> 'transfer' or r.status <> 'approved' or r.to_holder is distinct from me then raise exception 'غير مصرح' using errcode='42501'; end if;
    if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'السبب مطلوب'; end if;
    nxt := 'rejected';
  elsif _action = 'cancel' then
    if r.status not in ('draft','submitted','approved') then raise exception 'لا يُلغى هذا الطلب'; end if;
    if me <> r.created_by and not _pc_ok(r.org_id, me, 'cancel', r.school_id, null, null) then raise exception 'غير مصرح' using errcode='42501'; end if;
    if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'السبب مطلوب'; end if;
    if r.kind = 'settlement' and c.status = 'settling' then
      update pc_custodies set status='disbursed', rev=rev+1, updated_at=now() where id=c.id;
      perform _pc_log(r.org_id, 'custody', c.id, 'settle_reopened', jsonb_build_object('status','settling'), jsonb_build_object('status','disbursed'), _reason);
    end if;
    nxt := 'cancelled';
  else raise exception 'إجراء غير معروف'; end if;
  update pc_requests set status=nxt, rev=rev+1, updated_at=now(),
    submitted_at = case when nxt='submitted' then now() else submitted_at end,
    decided_by = case when _action in ('approve','reject','return') then me else decided_by end,
    decided_at = case when _action in ('approve','reject','return') then now() else decided_at end,
    decision_reason = case when _action in ('reject','return','cancel','decline') then btrim(_reason) when _action='approve' then nullif(btrim(coalesce(_reason,'')),'') else decision_reason end,
    done_by = case when nxt='done' then me else done_by end, done_at = case when nxt='done' then now() else done_at end,
    move_id = coalesce(mid, move_id)
   where id=_id;
  perform _pc_log(r.org_id, 'request', _id, _action, jsonb_build_object('status', r.status), jsonb_build_object('status', nxt, 'move', mid), _reason);
  if nxt = 'submitted' then
    perform _pc_notify_can(r.org_id, r.school_id, 'approve', array[r.created_by, holder], 'طلب ' || label || ' بانتظار الاعتماد', r.ref || coalesce(' — ' || r.amount || ' ريال', ''), 'pc-q-sub:' || _id || ':' || r.rev);
  elsif nxt in ('approved','done','rejected','draft') and _action <> 'decline' then
    perform _pc_notify(r.created_by, r.school_id, case nxt when 'rejected' then 'رُفض طلب ' || label when 'draft' then 'أُعيد طلب ' || label || ' للاستكمال' else 'اعتُمد طلب ' || label end,
      r.ref || coalesce(' — ' || btrim(_reason), ''), 'pc-q-' || nxt || ':' || _id || ':' || r.rev);
    if nxt = 'approved' and r.kind = 'topup' then
      perform _pc_notify_can(r.org_id, r.school_id, 'disburse', array[holder], 'تعزيز معتمد بانتظار الصرف', r.ref || ' — ' || r.amount || ' ريال', 'pc-q-dis:' || _id);
    elsif nxt = 'approved' and r.kind = 'transfer' then
      perform _pc_notify(r.to_holder, r.school_id, 'عهدة منقولة إليك بانتظار تسلّمك', r.ref || ' — من ' || _pc_name(holder), 'pc-q-tr:' || _id);
    end if;
  end if;
end $$;

create or replace function public.pc_topup_disburse(_id uuid, _rev int, _method text, _external_ref text, _file uuid, _doc_date date, _note text, _key uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); r pc_requests; c pc_custodies; mid uuid;
begin
  if _key is not null then select id into mid from pc_moves where idem_key=_key and actor=me; if mid is not null then return mid; end if; end if;
  select * into r from pc_requests where id=_id for update;
  if r.id is null or r.kind <> 'topup' then raise exception 'الطلب غير موجود'; end if;
  select * into c from pc_custodies where id=r.custody_id for update;
  if not section_enabled(r.org_id, 'finance') or not _pc_ok(r.org_id, me, 'disburse', r.school_id, null, null) then raise exception 'لا تملك صلاحية الصرف لهذا الفرع' using errcode='42501'; end if;
  if c.holder_id = me then raise exception 'لا يمكنك صرف تعزيز لنفسك'; end if;
  if r.status <> 'approved' then raise exception 'الصرف لتعزيز معتمد فقط'; end if;
  if r.rev <> _rev then raise exception 'تغيّر السجل؛ حدّث الصفحة'; end if;
  if c.status <> 'disbursed' then raise exception 'العهدة ليست مفتوحة'; end if;
  if _method is null or _method not in ('cash','transfer','cheque','other') then raise exception 'طريقة الصرف مطلوبة'; end if;
  if _method <> 'cash' and length(btrim(coalesce(_external_ref,''))) < 2 then raise exception 'مرجع الصرف مطلوب لغير النقدي'; end if;
  if _file is null or not exists(select 1 from files where id=_file and source_type='pc' and category='request' and source_id=_id and uploaded_by=me) then raise exception 'إثبات الصرف مطلوب'; end if;
  if _doc_date is null or _doc_date > _pc_today() then raise exception 'تاريخ الصرف غير صالح'; end if;
  insert into pc_moves(org_id, custody_id, kind, amount, ref, method, external_ref, file_id, doc_date, note, actor, idem_key)
    values (r.org_id, c.id, 'topup', r.amount, r.ref, _method, nullif(btrim(coalesce(_external_ref,'')),''), _file, _doc_date, coalesce(nullif(btrim(coalesce(_note,'')),''), r.purpose), me, _key) returning id into mid;
  update pc_requests set status='done', done_by=me, done_at=now(), move_id=mid, rev=rev+1, updated_at=now() where id=_id;
  perform _pc_log(r.org_id, 'request', _id, 'topup_paid', jsonb_build_object('status','approved'), jsonb_build_object('status','done','move',mid), _note);
  perform _pc_log(r.org_id, 'custody', c.id, 'topup', null, jsonb_build_object('move', mid, 'amount', r.amount, 'request', _id), _note);
  perform _pc_notify(c.holder_id, c.school_id, 'صُرف تعزيز عهدتك — أكّد الاستلام', c.ref || ' — ' || r.amount || ' ريال', 'pc-t-paid:' || mid);
  return mid;
end $$;

create or replace function public.pc_transfer_accept(_id uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); r pc_requests; c pc_custodies; n pc_custodies; b record; ref text;
begin
  select * into r from pc_requests where id=_id for update;
  if r.id is null or r.kind <> 'transfer' or r.to_holder is distinct from me then raise exception 'غير مصرح' using errcode='42501'; end if;
  if not section_enabled(r.org_id, 'finance') then raise exception 'القسم غير مفعّل' using errcode='42501'; end if;
  if r.status = 'done' then return r.new_custody_id; end if;
  if r.status <> 'approved' then raise exception 'النقل غير معتمد'; end if;
  select * into c from pc_custodies where id=r.custody_id for update;
  if c.status <> 'disbursed' then raise exception 'العهدة ليست مفتوحة'; end if;
  select * into b from _pc_bal(c.id);
  if b.pending > 0 then raise exception 'على العهدة مصروفات قيد المراجعة'; end if;
  if b.book <= 0 then raise exception 'لا رصيد لنقله'; end if;
  insert into pc_custodies(org_id, ref, holder_id, school_id, school_ids, purpose, amount, settle_due, status, created_by, submitted_at, decided_by, decided_at, decision_reason)
    values (c.org_id, _pc_ref(c.org_id, 'custody', 'CU'), me, c.school_id, c.school_ids, left('منقولة من ' || c.ref || ' — ' || c.purpose, 500), b.book, greatest(c.settle_due, _pc_today()), 'disbursed',
      r.created_by, r.submitted_at, r.decided_by, r.decided_at, 'نقل عهدة ' || r.ref) returning * into n;
  ref := _pc_ref(c.org_id, 'move', 'MV');
  insert into pc_moves(org_id, custody_id, kind, amount, ref, doc_date, note, actor) values (c.org_id, c.id, 'carry_out', -b.book, ref, _pc_today(), 'نقل إلى ' || _pc_name(me) || ' — ' || n.ref, me);
  insert into pc_moves(org_id, custody_id, kind, amount, ref, doc_date, note, actor, holder_ack_at, holder_ack_by) values (c.org_id, n.id, 'carry_in', b.book, ref, _pc_today(), 'استلام من ' || _pc_name(c.holder_id) || ' — ' || c.ref, me, now(), me);
  update pc_custodies set status='closed', closed_at=now(), closed_by=me, rev=rev+1, updated_at=now() where id=c.id;
  update pc_requests set status='done', done_by=me, done_at=now(), new_custody_id=n.id, rev=rev+1, updated_at=now() where id=_id;
  perform _pc_log(c.org_id, 'custody', c.id, 'transfer_out', jsonb_build_object('status','disbursed'), jsonb_build_object('status','closed','to', n.id, 'amount', b.book), r.purpose);
  perform _pc_log(c.org_id, 'custody', n.id, 'transfer_in', null, jsonb_build_object('from', c.id, 'amount', b.book), r.purpose);
  perform _pc_log(c.org_id, 'request', _id, 'transfer_accepted', null, jsonb_build_object('new_custody', n.id), null);
  perform _pc_notify(c.holder_id, c.school_id, 'تسلّم المستلم الجديد عهدتك', c.ref || ' → ' || n.ref, 'pc-tr-done:' || _id);
  return n.id;
end $$;

create or replace function public.pc_return_cash(_custody uuid, _amount numeric, _method text, _file uuid, _doc_date date, _note text, _key uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); c pc_custodies; b record; mid uuid;
begin
  if _key is not null then select id into mid from pc_moves where idem_key=_key and actor=me; if mid is not null then return mid; end if; end if;
  select * into c from pc_custodies where id=_custody for update;
  if c.id is null or not section_enabled(c.org_id, 'finance') or not _pc_ok(c.org_id, me, 'disburse', c.school_id, null, null) then raise exception 'استلام المبالغ المعادة لمنفذ الصرف المخوّل' using errcode='42501'; end if;
  if c.holder_id = me then raise exception 'لا تستلم المبلغ المعاد من عهدتك'; end if;
  if c.status not in ('disbursed','settling') then raise exception 'العهدة ليست مفتوحة'; end if;
  if _amount is null or _amount <= 0 or _amount <> round(_amount,2) then raise exception 'المبلغ غير صالح'; end if;
  select * into b from _pc_bal(c.id);
  if _amount > b.available then raise exception 'المبلغ يتجاوز المتاح (% ريال)', b.available; end if;
  if _method is null or _method not in ('cash','transfer','cheque','other') then raise exception 'طريقة الإعادة مطلوبة'; end if;
  if _file is null or not exists(select 1 from files where id=_file and source_type='pc' and category='custody' and source_id=_custody and uploaded_by=me) then raise exception 'إثبات الاستلام مطلوب'; end if;
  if _doc_date is null or _doc_date > _pc_today() then raise exception 'تاريخ الاستلام غير صالح'; end if;
  insert into pc_moves(org_id, custody_id, kind, amount, ref, method, file_id, doc_date, note, actor, idem_key)
    values (c.org_id, c.id, 'return', -_amount, _pc_ref(c.org_id, 'move', 'MV'), _method, _file, _doc_date, coalesce(nullif(btrim(coalesce(_note,'')),''), 'إعادة المتبقي للإدارة'), me, _key) returning id into mid;
  perform _pc_log(c.org_id, 'custody', c.id, 'return_cash', null, jsonb_build_object('move', mid, 'amount', _amount), _note);
  perform _pc_notify(c.holder_id, c.school_id, 'استُلم المبلغ المعاد من عهدتك', c.ref || ' — ' || _amount || ' ريال', 'pc-ret:' || mid);
  return mid;
end $$;

create or replace function public.pc_carry(_from uuid, _to uuid, _amount numeric, _reason text, _key uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); a pc_custodies; t pc_custodies; b record; ref text; mid uuid;
begin
  if _key is not null then select id into mid from pc_moves where idem_key=_key and actor=me; if mid is not null then return mid; end if; end if;
  if _from = _to then raise exception 'اختر عهدة أخرى'; end if;
  perform 1 from pc_custodies where id in (_from, _to) order by id for update;
  select * into a from pc_custodies where id=_from;
  select * into t from pc_custodies where id=_to;
  if a.id is null or t.id is null or a.org_id <> t.org_id then raise exception 'العهدة غير موجودة'; end if;
  if not section_enabled(a.org_id, 'finance') or not _pc_ok(a.org_id, me, 'approve', a.school_id, null, null) then raise exception 'الترحيل يحتاج معتمدًا مخوّلًا' using errcode='42501'; end if;
  if me in (a.holder_id, a.created_by, t.created_by) then raise exception 'لا تعتمد ترحيل عهدتك أو طلبك'; end if;
  if t.holder_id <> a.holder_id then raise exception 'الترحيل لعهدة جديدة للمستلم نفسه؛ للنقل لشخص آخر استخدم طلب النقل'; end if;
  if a.status not in ('disbursed','settling') then raise exception 'العهدة المرحَّل منها ليست مفتوحة'; end if;
  if t.status not in ('approved','disbursed') then raise exception 'العهدة المرحَّل إليها يجب أن تكون معتمدة أو مفتوحة'; end if;
  if _amount is null or _amount <= 0 or _amount <> round(_amount,2) then raise exception 'المبلغ غير صالح'; end if;
  select * into b from _pc_bal(a.id);
  if _amount > b.available then raise exception 'المبلغ يتجاوز المتاح (% ريال)', b.available; end if;
  if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'السبب مطلوب'; end if;
  ref := _pc_ref(a.org_id, 'move', 'MV');
  insert into pc_moves(org_id, custody_id, kind, amount, ref, doc_date, note, actor, idem_key) values (a.org_id, a.id, 'carry_out', -_amount, ref, _pc_today(), 'ترحيل إلى ' || t.ref || ' — ' || btrim(_reason), me, _key) returning id into mid;
  insert into pc_moves(org_id, custody_id, kind, amount, ref, doc_date, note, actor) values (a.org_id, t.id, 'carry_in', _amount, ref, _pc_today(), 'ترحيل من ' || a.ref || ' — ' || btrim(_reason), me);
  if t.status = 'approved' then update pc_custodies set status='disbursed', rev=rev+1, updated_at=now() where id=t.id; end if;
  perform _pc_log(a.org_id, 'custody', a.id, 'carry_out', null, jsonb_build_object('to', t.id, 'amount', _amount, 'move', mid), _reason);
  perform _pc_log(a.org_id, 'custody', t.id, 'carry_in', jsonb_build_object('status', t.status), jsonb_build_object('from', a.id, 'amount', _amount), _reason);
  perform _pc_notify(a.holder_id, a.school_id, 'رُحّل رصيد إلى عهدتك الجديدة — أكّد الاستلام', a.ref || ' → ' || t.ref || ' — ' || _amount || ' ريال', 'pc-carry:' || mid);
  return mid;
end $$;

create or replace function public._pc_settle_check(_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare c pc_custodies; b record; drafts int; refunds int; reqs int; settle pc_requests; items jsonb;
begin
  select * into c from pc_custodies where id=_id;
  select * into b from _pc_bal(_id);
  select count(*) into drafts from pc_expenses where custody_id=_id and status='draft';
  select count(*) into refunds from pc_refunds where custody_id=_id and status='pending';
  select count(*) into reqs from pc_requests where custody_id=_id and kind in ('topup','adjust','transfer','purchase') and status in ('submitted','approved');
  select * into settle from pc_requests where custody_id=_id and kind='settlement' and status in ('submitted','approved','done') order by created_at desc limit 1;
  items := jsonb_build_array(
    jsonb_build_object('key','settle','label','طلب التسوية معتمد','ok', settle.status in ('approved','done')),
    jsonb_build_object('key','pending','label','لا مصروفات قيد المراجعة أو معادة للاستكمال','ok', b.pending = 0, 'value', b.pending),
    jsonb_build_object('key','drafts','label','لا مسودات مصروفات غير مقدّمة','ok', drafts = 0, 'value', drafts),
    jsonb_build_object('key','refunds','label','لا استردادات بانتظار التأكيد','ok', refunds = 0, 'value', refunds),
    jsonb_build_object('key','requests','label','لا طلبات تعزيز أو معالجة أو شراء مفتوحة','ok', reqs = 0, 'value', reqs),
    jsonb_build_object('key','balance','label','المتبقي صفر (أُعيد أو رُحّل أو عولج الفرق بقيد معتمد)','ok', b.book = 0, 'value', b.book));
  return jsonb_build_object('items', items, 'ok', not exists(select 1 from jsonb_array_elements(items) x where not (x->>'ok')::boolean),
    'settle_request', settle.id, 'settle_status', settle.status, 'bal', (select to_jsonb(x) from _pc_bal(_id) x),
    'expenses', (select jsonb_build_object('approved', count(*) filter (where status='approved'), 'rejected', count(*) filter (where status='rejected'),
       'net', coalesce(sum(net) filter (where status='approved'),0), 'vat', coalesce(sum(vat) filter (where status='approved'),0), 'total', coalesce(sum(total) filter (where status='approved'),0)) from pc_expenses where custody_id=_id));
end $$;

create or replace function public.pc_custody_close(_id uuid, _rev int, _reason text) returns void
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); c pc_custodies; chk jsonb;
begin
  select * into c from pc_custodies where id=_id for update;
  if c.id is null or not section_enabled(c.org_id, 'finance') or not _pc_ok(c.org_id, me, 'approve', c.school_id, null, null) then raise exception 'الإغلاق لمعتمد مخوّل' using errcode='42501'; end if;
  if me in (c.holder_id, c.created_by) then raise exception 'لا تغلق عهدتك أو عهدة طلبتها؛ تبقى بانتظار معتمد آخر'; end if;
  if c.rev <> _rev then raise exception 'تغيّر السجل؛ حدّث الصفحة'; end if;
  if c.status <> 'settling' then raise exception 'الإغلاق لعهدة تحت التسوية فقط'; end if;
  chk := _pc_settle_check(_id);
  if not (chk->>'ok')::boolean then
    raise exception 'لا يمكن الإغلاق: %', (select string_agg(x->>'label', '، ') from jsonb_array_elements(chk->'items') x where not (x->>'ok')::boolean); end if;
  update pc_custodies set status='closed', closed_at=now(), closed_by=me, rev=rev+1, updated_at=now() where id=_id;
  update pc_requests set status='done', done_by=me, done_at=now(), rev=rev+1, updated_at=now() where id=(chk->>'settle_request')::uuid;
  perform _pc_log(c.org_id, 'custody', _id, 'close', jsonb_build_object('status','settling'), jsonb_build_object('status','closed','check', chk->'items'), _reason);
  perform _pc_notify(c.holder_id, c.school_id, 'سُوّيت عهدتك وأُغلقت', c.ref, 'pc-close:' || _id);
end $$;

create or replace function public.pc_custody_caps(_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); c pc_custodies; can_create boolean; open_settle boolean;
begin
  select * into c from pc_custodies where id=_id;
  if c.id is null or not _pc_ok(c.org_id, me, 'view', c.school_id, c.holder_id, c.created_by) then raise exception 'العهدة غير موجودة أو خارج نطاقك' using errcode='42501'; end if;
  if not section_enabled(c.org_id, 'finance') then raise exception 'القسم غير مفعّل' using errcode='42501'; end if;
  can_create := perm_scope(c.org_id, me, 'procurement', 'create') is not null and (me = c.holder_id or _pc_ok(c.org_id, me, 'create', c.school_id, c.holder_id, null));
  open_settle := exists(select 1 from pc_requests where custody_id=_id and kind='settlement' and status in ('draft','submitted','approved'));
  return jsonb_build_object(
    'topup', can_create and c.status='disbursed',
    'settle', can_create and c.status='disbursed' and not open_settle,
    'adjust', can_create and c.status in ('disbursed','settling'),
    'transfer', can_create and c.status='disbursed',
    'purchase', can_create and c.status in ('approved','disbursed','settling'),
    'return_cash', c.status in ('disbursed','settling') and me <> c.holder_id and _pc_ok(c.org_id, me, 'disburse', c.school_id, null, null),
    'carry', c.status in ('disbursed','settling') and me not in (c.holder_id, c.created_by) and _pc_ok(c.org_id, me, 'approve', c.school_id, null, null),
    'close', c.status='settling' and me not in (c.holder_id, c.created_by) and _pc_ok(c.org_id, me, 'approve', c.school_id, null, null),
    'carry_targets', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'ref', x.ref, 'status', x.status, 'purpose', x.purpose)) from pc_custodies x
       where x.org_id=c.org_id and x.holder_id=c.holder_id and x.id<>c.id and x.status in ('approved','disbursed') and me <> x.created_by),'[]'),
    'requests', coalesce((select jsonb_agg(_pc_request_row(r) order by r.created_at desc) from pc_requests r where r.custody_id=_id),'[]'),
    'settlement', case when c.status in ('disbursed','settling','closed') then _pc_settle_check(_id) end,
    'closed_by', case when c.closed_by is not null then _pc_name(c.closed_by) end);
end $$;

create or replace function public.pc_request_list(_org uuid, _kind text, _status text, _q text, _custody uuid, _limit int, _offset int) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); q text := nullif(btrim(coalesce(_q,'')),''); rows jsonb; n bigint;
begin
  if not section_enabled(_org, 'finance') then raise exception 'القسم غير مفعّل' using errcode='42501'; end if;
  if perm_scope(_org, me, 'procurement', 'view') is null and not exists(select 1 from pc_requests where org_id=_org and to_holder=me) then raise exception 'غير مصرح' using errcode='42501'; end if;
  if coalesce(_limit,50) > 200 and perm_scope(_org, me, 'procurement', 'export') is null then raise exception 'التصدير غير مصرح' using errcode='42501'; end if;
  with v as (select r.* from pc_requests r left join pc_custodies c on c.id=r.custody_id where r.org_id=_org
      and (r.to_holder = me or _pc_ok(_org, me, 'view', r.school_id, coalesce(c.holder_id, r.created_by), r.created_by))
      and (_kind is null or r.kind=_kind) and (_custody is null or r.custody_id=_custody)
      and (_status is null or (_status='open' and r.status in ('draft','submitted','approved')) or r.status=_status)
      and (q is null or r.ref ilike '%'||q||'%' or r.purpose ilike '%'||q||'%' or coalesce(r.supplier,'') ilike '%'||q||'%' or coalesce(c.ref,'') ilike '%'||q||'%'))
  select (select count(*) from v), coalesce((select jsonb_agg(_pc_request_row(x) order by x.created_at desc) from (select * from v order by created_at desc limit least(coalesce(_limit,50),5000) offset coalesce(_offset,0)) x),'[]')
    into n, rows;
  return jsonb_build_object('total', n, 'rows', rows);
end $$;

create or replace function public.pc_request_get(_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); r pc_requests; c pc_custodies; holder uuid; lim numeric;
begin
  select * into r from pc_requests where id=_id;
  if r.id is null or not _pc_req_ok(_id, 'view') then raise exception 'الطلب غير موجود أو خارج نطاقك' using errcode='42501'; end if;
  if not section_enabled(r.org_id, 'finance') then raise exception 'القسم غير مفعّل' using errcode='42501'; end if;
  select * into c from pc_custodies where id=r.custody_id;
  holder := coalesce(c.holder_id, r.created_by); lim := _pc_limit(r.org_id, me);
  return _pc_request_row(r) || jsonb_build_object(
    'files', _pc_files('request', _id),
    'bal', case when c.id is not null then (select to_jsonb(b) from _pc_bal(c.id) b) end,
    'expenses', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'ref', e.ref, 'total', e.total, 'status', e.status)) from pc_expenses e where e.purchase_request_id=_id),'[]'),
    'log', coalesce((select jsonb_agg(jsonb_build_object('at', l.at, 'actor', _pc_name(l.actor), 'action', l.action, 'reason', l.reason) order by l.at) from pc_log l where l.entity='request' and l.entity_id=_id),'[]'),
    'can', jsonb_build_object(
      'edit', r.status='draft' and r.created_by=me,
      'decide', r.status='submitted' and me not in (r.created_by, holder) and me is distinct from r.to_holder and _pc_ok(r.org_id, me, 'approve', r.school_id, null, null)
                and (lim is null or r.kind not in ('topup','purchase','adjust') or abs(r.amount) <= lim),
      'cancel', r.status in ('draft','submitted','approved') and (me = r.created_by or _pc_ok(r.org_id, me, 'cancel', r.school_id, null, null)),
      'disburse', r.kind='topup' and r.status='approved' and me <> holder and _pc_ok(r.org_id, me, 'disburse', r.school_id, null, null),
      'accept', r.kind='transfer' and r.status='approved' and r.to_holder = me));
end $$;

-- ===== tasks (adds requests, top-ups, transfers, closing, due dates) =====
create or replace function public.pc_tasks(_org uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); st pc_settings;
begin
  if not section_enabled(_org, 'finance') then raise exception 'القسم غير مفعّل' using errcode='42501'; end if;
  if perm_scope(_org, me, 'procurement', 'view') is null and not exists(select 1 from pc_requests where org_id=_org and to_holder=me and status='approved') then raise exception 'غير مصرح' using errcode='42501'; end if;
  st := _pc_settings(_org);
  return jsonb_build_object(
    'custody_decide', coalesce((select jsonb_agg(_pc_custody_row(c) order by c.submitted_at) from pc_custodies c where c.org_id=_org and c.status='submitted' and me not in (c.holder_id, c.created_by) and _pc_ok(_org, me, 'approve', c.school_id, null, null)),'[]'),
    'custody_disburse', coalesce((select jsonb_agg(_pc_custody_row(c) order by c.decided_at) from pc_custodies c where c.org_id=_org and c.status='approved' and me <> c.holder_id and _pc_ok(_org, me, 'disburse', c.school_id, null, null)),'[]'),
    'expense_decide', coalesce((select jsonb_agg(_pc_expense_row(e) order by e.submitted_at) from pc_expenses e left join pc_custodies c on c.id=e.custody_id where e.org_id=_org and e.status in ('submitted','in_review')
        and me not in (e.created_by, coalesce(c.holder_id, e.created_by)) and (_pc_ok(_org, me, 'approve', e.school_id, null, null) or _pc_ok(_org, me, 'review', e.school_id, null, null))),'[]'),
    'refund_decide', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'expense_id', r.expense_id, 'ref', e.ref, 'amount', r.amount, 'reason', r.reason, 'by', _pc_name(r.created_by)) order by r.created_at)
        from pc_refunds r join pc_expenses e on e.id=r.expense_id join pc_custodies c on c.id=r.custody_id where r.org_id=_org and r.status='pending' and me not in (r.created_by, c.holder_id)
        and (_pc_ok(_org, me, 'disburse', c.school_id, null, null) or _pc_ok(_org, me, 'approve', c.school_id, null, null))),'[]'),
    'request_decide', coalesce((select jsonb_agg(_pc_request_row(r) order by r.submitted_at) from pc_requests r left join pc_custodies c on c.id=r.custody_id where r.org_id=_org and r.status='submitted'
        and me not in (r.created_by, coalesce(c.holder_id, r.created_by)) and me is distinct from r.to_holder and _pc_ok(_org, me, 'approve', r.school_id, null, null)),'[]'),
    'topup_disburse', coalesce((select jsonb_agg(_pc_request_row(r) order by r.decided_at) from pc_requests r join pc_custodies c on c.id=r.custody_id where r.org_id=_org and r.kind='topup' and r.status='approved'
        and me <> c.holder_id and _pc_ok(_org, me, 'disburse', r.school_id, null, null)),'[]'),
    'transfer_accept', coalesce((select jsonb_agg(_pc_request_row(r)) from pc_requests r where r.org_id=_org and r.kind='transfer' and r.status='approved' and r.to_holder=me),'[]'),
    'settle_close', coalesce((select jsonb_agg(_pc_custody_row(c)) from pc_custodies c where c.org_id=_org and c.status='settling' and me not in (c.holder_id, c.created_by) and _pc_ok(_org, me, 'approve', c.school_id, null, null)
        and exists(select 1 from pc_requests q where q.custody_id=c.id and q.kind='settlement' and q.status='approved')),'[]'),
    'due_soon', coalesce((select jsonb_agg(_pc_custody_row(c) order by c.settle_due) from pc_custodies c where c.org_id=_org and c.holder_id=me and c.status in ('disbursed','settling')
        and c.settle_due <= _pc_today() + st.due_soon_days),'[]'),
    'mine', coalesce((select jsonb_agg(y.x order by y.x->>'updated_at' desc) from (
        select _pc_custody_row(c) || jsonb_build_object('entity','custody') x from pc_custodies c where c.org_id=_org and (c.created_by=me or c.holder_id=me) and c.status in ('draft','submitted','approved')
        union all select _pc_expense_row(e) || jsonb_build_object('entity','expense') from pc_expenses e where e.org_id=_org and e.created_by=me and e.status in ('draft','returned','submitted','in_review')
        union all select _pc_request_row(r) || jsonb_build_object('entity','request') from pc_requests r where r.org_id=_org and r.created_by=me and r.status in ('draft','submitted','approved')) y),'[]'),
    'ack', coalesce((select jsonb_agg(jsonb_build_object('move', m.id, 'custody_id', c.id, 'ref', c.ref, 'amount', m.amount, 'at', m.at, 'kind', m.kind)) from pc_moves m join pc_custodies c on c.id=m.custody_id
        where c.org_id=_org and c.holder_id=me and m.kind in ('disburse','topup','carry_in') and m.holder_ack_at is null),'[]'));
end $$;

-- ===== forms =====
create or replace function public.pc_form_get(_org uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); s boolean;
begin
  if not section_enabled(_org, 'finance') or perm_scope(_org, me, 'procurement', 'view') is null then raise exception 'غير مصرح' using errcode='42501'; end if;
  s := perm_scope(_org, me, 'procurement', 'settings') = 'org';
  return jsonb_build_object('default_core', _pc_check_core(_pc_core_default()), 'can_edit', s,
    'versions', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'version', f.version, 'status', f.status, 'core', f.core, 'fields', f.fields, 'note', f.note,
        'published_at', f.published_at, 'published_by', case when f.published_by is not null then _pc_name(f.published_by) end, 'updated_at', f.updated_at) order by f.version desc)
      from pc_forms f where f.org_id=_org and (f.status <> 'draft' or s)),'[]'));
end $$;

create or replace function public.pc_form_save(_org uuid, _core jsonb, _fields jsonb, _note text) returns uuid
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); fid uuid; c jsonb := _pc_check_core(_core); f jsonb := _pc_check_custom(_fields);
begin
  if not section_enabled(_org, 'finance') or perm_scope(_org, me, 'procurement', 'settings') is distinct from 'org' then raise exception 'تخصيص النموذج لمن يملك صلاحية الإعدادات' using errcode='42501'; end if;
  if not _pc_safe(_note) then raise exception 'ملاحظة غير صالحة'; end if;
  select id into fid from pc_forms where org_id=_org and status='draft' for update;
  if fid is null then
    insert into pc_forms(org_id, version, status, core, fields, note, created_by)
      values (_org, coalesce((select max(version) from pc_forms where org_id=_org),0)+1, 'draft', c, f, nullif(btrim(coalesce(_note,'')),''), me) returning id into fid;
  else update pc_forms set core=c, fields=f, note=nullif(btrim(coalesce(_note,'')),''), updated_at=now() where id=fid; end if;
  perform _pc_log(_org, 'settings', fid, 'form_draft', null, jsonb_build_object('core', c, 'fields', f), null);
  return fid;
end $$;

create or replace function public.pc_form_publish(_org uuid, _reason text) returns uuid
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); fid uuid; v int;
begin
  if not section_enabled(_org, 'finance') or perm_scope(_org, me, 'procurement', 'settings') is distinct from 'org' then raise exception 'نشر النموذج لمن يملك صلاحية الإعدادات' using errcode='42501'; end if;
  if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'السبب مطلوب'; end if;
  select id, version into fid, v from pc_forms where org_id=_org and status='draft' for update;
  if fid is null then raise exception 'لا مسودة لنشرها'; end if;
  update pc_forms set status='archived', updated_at=now() where org_id=_org and status='published';
  update pc_forms set status='published', published_by=me, published_at=now(), updated_at=now() where id=fid;
  perform _pc_log(_org, 'settings', fid, 'form_publish', null, jsonb_build_object('version', v), _reason);
  return fid;
end $$;

create or replace function public.pc_form_discard(_org uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if perm_scope(_org, auth.uid(), 'procurement', 'settings') is distinct from 'org' then raise exception 'غير مصرح' using errcode='42501'; end if;
  delete from pc_forms where org_id=_org and status='draft';
  perform _pc_log(_org, 'settings', null, 'form_discard', null, null, null);
end $$;

-- ===== settings (adds pre-purchase threshold and due-soon days) =====
drop function public.pc_settings_save(uuid,numeric,boolean,boolean,boolean,numeric,int,text);
create or replace function public.pc_settings_save(_org uuid, _vat_rate numeric, _vat_inclusive boolean, _require_attachment boolean, _block_overdue boolean, _low_balance numeric, _rev int, _reason text,
  _purchase_above numeric default null, _due_soon int default 3)
returns void language plpgsql security definer set search_path=public as $$
declare s pc_settings;
begin
  if perm_scope(_org, auth.uid(), 'procurement', 'settings') is distinct from 'org' then raise exception 'إعدادات القسم لمن يملك صلاحية الإعدادات على المؤسسة' using errcode='42501'; end if;
  s := _pc_settings(_org);
  if s.rev <> _rev then raise exception 'تغيّر السجل؛ حدّث الصفحة'; end if;
  if _vat_rate is null or _vat_rate < 0 or _vat_rate > 100 then raise exception 'نسبة الضريبة غير صالحة'; end if;
  if _low_balance is null or _low_balance < 0 then raise exception 'حد انخفاض الرصيد غير صالح'; end if;
  if _purchase_above is not null and _purchase_above <= 0 then raise exception 'حد طلب الشراء المسبق غير صالح'; end if;
  if _due_soon is null or _due_soon < 0 or _due_soon > 60 then raise exception 'أيام التنبيه قبل التسوية بين 0 و60'; end if;
  if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'السبب مطلوب'; end if;
  update pc_settings set vat_rate=_vat_rate, vat_inclusive=_vat_inclusive, require_attachment=_require_attachment, block_overdue=_block_overdue, low_balance=_low_balance,
    purchase_request_above=_purchase_above, due_soon_days=_due_soon, rev=rev+1, updated_by=auth.uid(), updated_at=now() where org_id=_org;
  perform _pc_log(_org, 'settings', null, 'update', to_jsonb(s) - 'org_id', (select to_jsonb(x) - 'org_id' from pc_settings x where org_id=_org), _reason);
end $$;

-- ===== reports =====
create or replace function public.pc_report(_org uuid, _kind text, _d jsonb, _limit int, _offset int) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); f date := nullif(_d->>'from','')::date; t date := nullif(_d->>'to','')::date; sch uuid := nullif(_d->>'school','')::uuid;
  hol uuid := nullif(_d->>'holder','')::uuid; grp text := coalesce(_d->>'group','supplier'); res jsonb; lim int := least(coalesce(_limit,50),5000); off int := coalesce(_offset,0);
begin
  if not section_enabled(_org, 'finance') or perm_scope(_org, me, 'procurement', 'view') is null then raise exception 'غير مصرح' using errcode='42501'; end if;
  if coalesce(_limit,50) > 200 and perm_scope(_org, me, 'procurement', 'export') is null then raise exception 'التصدير غير مصرح' using errcode='42501'; end if;
  if _kind = 'person' then
    with v as (select c.holder_id, c.status, c.settle_due, b.* from pc_custodies c cross join lateral _pc_bal(c.id) b where c.org_id=_org
        and _pc_ok(_org, me, 'view', c.school_id, c.holder_id, c.created_by) and (sch is null or c.school_id=sch) and (hol is null or c.holder_id=hol)
        and c.status in ('disbursed','settling','closed') and (f is null or c.created_at >= f) and (t is null or c.created_at < t + 1)),
    g as (select holder_id, count(*) n, count(*) filter (where status in ('disbursed','settling')) open_n, count(*) filter (where status in ('disbursed','settling') and settle_due < _pc_today()) overdue_n,
        sum(disbursed+topups) disbursed, sum(carried) carried, sum(spent) spent, sum(refunds) refunds, sum(returned) returned, sum(adjusted) adjusted, sum(pending) pending, sum(book) book from v group by holder_id)
    select jsonb_build_object('total', (select count(*) from g),
      'sums', (select jsonb_build_object('disbursed', coalesce(sum(disbursed),0), 'spent', coalesce(sum(spent),0), 'pending', coalesce(sum(pending),0), 'book', coalesce(sum(book),0), 'returned', coalesce(sum(returned),0)) from g),
      'rows', coalesce((select jsonb_agg(jsonb_build_object('holder_id', holder_id, 'name', _pc_name(holder_id), 'count', n, 'open', open_n, 'overdue', overdue_n, 'disbursed', disbursed, 'carried', carried,
        'spent', spent, 'refunds', refunds, 'returned', returned, 'adjusted', adjusted, 'pending', pending, 'book', book) order by book desc) from (select * from g order by book desc limit lim offset off) x),'[]')) into res;
  elsif _kind = 'person_moves' then
    if hol is null then raise exception 'اختر الشخص'; end if;
    with v as (select m.*, c.ref cref, c.purpose from pc_moves m join pc_custodies c on c.id=m.custody_id where c.org_id=_org and c.holder_id=hol
        and _pc_ok(_org, me, 'view', c.school_id, c.holder_id, c.created_by) and (sch is null or c.school_id=sch) and (f is null or m.at >= f) and (t is null or m.at < t + 1)),
    w as (select v.*, sum(amount) over (order by at, id) running from v)
    select jsonb_build_object('total', (select count(*) from w), 'name', _pc_name(hol),
      'sums', (select jsonb_build_object('in', coalesce(sum(amount) filter (where amount > 0),0), 'out', coalesce(-sum(amount) filter (where amount < 0),0), 'net', coalesce(sum(amount),0)) from w),
      'rows', coalesce((select jsonb_agg(jsonb_build_object('at', at, 'custody', cref, 'kind', kind, 'ref', ref, 'note', note, 'amount', amount, 'running', running) order by at, id) from (select * from w order by at, id limit lim offset off) x),'[]')) into res;
  elsif _kind = 'settlements' then
    with v as (select c.*, b.disbursed bd, b.topups bt, b.spent bs, b.refunds br, b.returned bret, b.carried bc, b.adjusted ba, b.book bb, b.pending bp from pc_custodies c cross join lateral _pc_bal(c.id) b
        where c.org_id=_org and c.status in ('settling','closed') and _pc_ok(_org, me, 'view', c.school_id, c.holder_id, c.created_by)
        and (sch is null or c.school_id=sch) and (hol is null or c.holder_id=hol) and (f is null or coalesce(c.closed_at, c.updated_at) >= f) and (t is null or coalesce(c.closed_at, c.updated_at) < t + 1))
    select jsonb_build_object('total', (select count(*) from v),
      'rows', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'ref', ref, 'holder', _pc_name(holder_id), 'school', (select name from schools where id=x.school_id), 'status', status,
        'disbursed', bd+bt, 'spent', bs, 'refunds', br, 'returned', bret, 'carried', bc, 'adjusted', ba, 'pending', bp, 'book', bb, 'closed_at', closed_at,
        'closed_by', case when closed_by is not null then _pc_name(closed_by) end) order by coalesce(closed_at, updated_at) desc) from (select * from v order by coalesce(closed_at, updated_at) desc limit lim offset off) x),'[]')) into res;
  elsif _kind = 'purchases' then
    if grp not in ('supplier','category','school','month') then raise exception 'تجميع غير صالح'; end if;
    with v as (select e.*, case grp when 'supplier' then btrim(e.supplier) when 'category' then coalesce((select name from pc_categories where id=e.category_id), 'بدون تصنيف')
          when 'school' then (select name from schools where id=e.benefit_school_id) else to_char(e.purchase_date, 'YYYY-MM') end g
        from pc_expenses e left join pc_custodies c on c.id=e.custody_id where e.org_id=_org and e.status='approved'
        and _pc_ok(_org, me, 'view', e.school_id, coalesce(c.holder_id, e.created_by), e.created_by)
        and (sch is null or e.benefit_school_id=sch or e.school_id=sch) and (hol is null or coalesce(c.holder_id, e.created_by)=hol)
        and (f is null or e.purchase_date >= f) and (t is null or e.purchase_date <= t)),
    g as (select g, count(*) n, sum(net) net, sum(vat) vat, sum(total) total, count(*) filter (where tax_invoice) tax_n from v group by g)
    select jsonb_build_object('total', (select count(*) from g),
      'sums', (select jsonb_build_object('count', coalesce(sum(n),0), 'net', coalesce(sum(net),0), 'vat', coalesce(sum(vat),0), 'total', coalesce(sum(total),0)) from g),
      'rows', coalesce((select jsonb_agg(jsonb_build_object('name', g, 'count', n, 'tax_count', tax_n, 'net', net, 'vat', vat, 'total', total) order by total desc) from (select * from g order by total desc limit lim offset off) x),'[]')) into res;
  else raise exception 'تقرير غير معروف'; end if;
  return res;
end $$;

-- ===== scheduled alerts =====
create or replace function public.pc_alerts_tick() returns int
language plpgsql security definer set search_path=public as $$
declare c record; st pc_settings; n int := 0; today date := _pc_today();
begin
  for c in select x.* from pc_custodies x where x.status in ('disbursed','settling') and section_enabled(x.org_id, 'finance') loop
    st := _pc_settings(c.org_id);
    if c.settle_due < today then
      perform _pc_notify(c.holder_id, c.school_id, 'تأخرت تسوية عهدتك', c.ref || ' — كان موعدها ' || c.settle_due, 'pc-od:' || c.id || ':' || c.settle_due);
      perform _pc_notify_can(c.org_id, c.school_id, 'approve', array[c.holder_id], 'عهدة متأخرة التسوية', c.ref || ' — ' || _pc_name(c.holder_id), 'pc-od-m:' || c.id || ':' || c.settle_due);
      n := n + 1;
    elsif c.settle_due <= today + st.due_soon_days then
      perform _pc_notify(c.holder_id, c.school_id, 'اقترب موعد تسوية عهدتك', c.ref || ' — ' || c.settle_due, 'pc-due:' || c.id || ':' || c.settle_due);
      n := n + 1;
    end if;
    perform _pc_low_check(c.id);
  end loop;
  return n;
end $$;

-- ===== grants =====
revoke all on function public._pc_safe(text), public._pc_core_default(), public._pc_check_core(jsonb), public._pc_check_custom(jsonb), public._pc_check_answers(jsonb,jsonb,boolean,uuid),
  public._pc_low_check(uuid), public._pc_expense_ext(uuid,jsonb,boolean), public._pc_expense_submit_check(uuid), public._pc_expense_approved(uuid), public._pc_req_ok(uuid,text),
  public._pc_request_row(public.pc_requests), public._pc_settle_check(uuid), public.pc_alerts_tick() from public, anon, authenticated;
grant execute on function public.pc_alerts_tick() to service_role;
revoke all on function public.pc_request_save(uuid,uuid,jsonb,int,uuid), public.pc_request_action(uuid,text,int,text), public.pc_topup_disburse(uuid,int,text,text,uuid,date,text,uuid),
  public.pc_transfer_accept(uuid), public.pc_return_cash(uuid,numeric,text,uuid,date,text,uuid), public.pc_carry(uuid,uuid,numeric,text,uuid), public.pc_custody_close(uuid,int,text),
  public.pc_custody_caps(uuid), public.pc_request_list(uuid,text,text,text,uuid,int,int), public.pc_request_get(uuid), public.pc_form_get(uuid), public.pc_form_save(uuid,jsonb,jsonb,text),
  public.pc_form_publish(uuid,text), public.pc_form_discard(uuid), public.pc_report(uuid,text,jsonb,int,int),
  public.pc_settings_save(uuid,numeric,boolean,boolean,boolean,numeric,int,text,numeric,int), public.create_pc_file(text,uuid,text,text,bigint), public.pc_file_remove(uuid), public.pc_tasks(uuid) from public, anon;
grant execute on function public.pc_request_save(uuid,uuid,jsonb,int,uuid), public.pc_request_action(uuid,text,int,text), public.pc_topup_disburse(uuid,int,text,text,uuid,date,text,uuid),
  public.pc_transfer_accept(uuid), public.pc_return_cash(uuid,numeric,text,uuid,date,text,uuid), public.pc_carry(uuid,uuid,numeric,text,uuid), public.pc_custody_close(uuid,int,text),
  public.pc_custody_caps(uuid), public.pc_request_list(uuid,text,text,text,uuid,int,int), public.pc_request_get(uuid), public.pc_form_get(uuid), public.pc_form_save(uuid,jsonb,jsonb,text),
  public.pc_form_publish(uuid,text), public.pc_form_discard(uuid), public.pc_report(uuid,text,jsonb,int,int),
  public.pc_settings_save(uuid,numeric,boolean,boolean,boolean,numeric,int,text,numeric,int), public.create_pc_file(text,uuid,text,text,bigint), public.pc_file_remove(uuid), public.pc_tasks(uuid) to authenticated;

select cron.schedule('rikaz-pc-alerts', '20 * * * *', $$select public.pc_alerts_tick()$$);