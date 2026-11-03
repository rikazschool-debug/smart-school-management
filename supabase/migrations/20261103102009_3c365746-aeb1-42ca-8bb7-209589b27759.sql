create table public.pc_settings(
  org_id uuid primary key references public.organizations(id) on delete cascade,
  vat_rate numeric(5,2) not null default 15,
  vat_inclusive boolean not null default false,
  require_attachment boolean not null default true,
  block_overdue boolean not null default true,
  low_balance numeric(14,2) not null default 0,
  rev int not null default 1, updated_by uuid, updated_at timestamptz not null default now());
create table public.pc_categories(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, archived_at timestamptz, created_at timestamptz not null default now(), unique(org_id, name));
create table public.pc_counters(org_id uuid not null references public.organizations(id) on delete cascade, kind text not null, n int not null default 0, primary key(org_id, kind));
create table public.pc_custodies(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  ref text not null, holder_id uuid not null,
  school_id uuid not null references public.schools(id),
  school_ids uuid[] not null default '{}',
  purpose text not null, amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'SAR' check (currency = 'SAR'),
  settle_due date not null,
  status text not null default 'draft' check (status in ('draft','submitted','approved','disbursed','settling','closed','rejected','cancelled')),
  created_by uuid not null, submitted_at timestamptz, decided_by uuid, decided_at timestamptz, decision_reason text, overdue_exception text,
  rev int not null default 1, idem_key uuid unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(org_id, ref));
create index pc_custodies_org_idx on public.pc_custodies(org_id, status);
create index pc_custodies_holder_idx on public.pc_custodies(holder_id);
create table public.pc_expenses(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  ref text not null,
  custody_id uuid references public.pc_custodies(id),
  own_funds boolean not null default false,
  school_id uuid not null references public.schools(id),
  benefit_school_id uuid not null references public.schools(id),
  corrects_id uuid references public.pc_expenses(id),
  description text not null, supplier text not null, invoice_no text, invoice_date date, purchase_date date not null,
  category_id uuid references public.pc_categories(id),
  tax_invoice boolean not null default false, vat_inclusive boolean not null default false, vat_rate numeric(5,2) not null,
  net numeric(14,2) not null default 0, vat numeric(14,2) not null default 0, total numeric(14,2) not null default 0,
  notes text, no_attachment_reason text, no_attachment_ok_by uuid, dup_of uuid,
  status text not null default 'draft' check (status in ('draft','submitted','in_review','returned','approved','rejected','cancelled')),
  created_by uuid not null, submitted_at timestamptz, reviewed_by uuid, decided_by uuid, decided_at timestamptz, decision_reason text,
  rev int not null default 1, idem_key uuid unique,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(org_id, ref),
  check ((custody_id is null) = own_funds));
create index pc_expenses_custody_idx on public.pc_expenses(custody_id, status);
create index pc_expenses_org_idx on public.pc_expenses(org_id, status);
create unique index pc_expenses_dup_approved on public.pc_expenses(org_id, lower(btrim(supplier)), lower(btrim(invoice_no)))
  where status = 'approved' and invoice_no is not null and corrects_id is null;
create table public.pc_expense_lines(
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.pc_expenses(id) on delete cascade,
  ord int not null, description text not null, amount numeric(14,2) not null, taxable boolean not null,
  net numeric(14,2) not null, vat numeric(14,2) not null, total numeric(14,2) not null);
create table public.pc_moves(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  custody_id uuid not null references public.pc_custodies(id),
  kind text not null check (kind in ('disburse','topup','refund','expense','return','carry_out','carry_in','adjust')),
  amount numeric(14,2) not null check (amount <> 0),
  ref text not null, method text, external_ref text, file_id uuid, expense_id uuid references public.pc_expenses(id),
  doc_date date, note text, actor uuid not null, at timestamptz not null default now(),
  holder_ack_at timestamptz, holder_ack_by uuid, idem_key uuid unique);
create index pc_moves_custody_idx on public.pc_moves(custody_id, at);
create table public.pc_refunds(
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  expense_id uuid not null references public.pc_expenses(id), custody_id uuid not null references public.pc_custodies(id),
  amount numeric(14,2) not null check (amount > 0), reason text not null,
  status text not null default 'pending' check (status in ('pending','collected','rejected')),
  created_by uuid not null, decided_by uuid, decided_at timestamptz, decision_reason text, move_id uuid,
  idem_key uuid unique, created_at timestamptz not null default now());
create table public.pc_log(
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id) on delete cascade,
  entity text not null, entity_id uuid, action text not null, actor uuid not null,
  before jsonb, after jsonb, reason text, at timestamptz not null default now());
create index pc_log_entity_idx on public.pc_log(entity_id, at);

grant all on public.pc_settings, public.pc_categories, public.pc_counters, public.pc_custodies, public.pc_expenses, public.pc_expense_lines, public.pc_moves, public.pc_refunds, public.pc_log to service_role;
alter table public.pc_settings enable row level security;
alter table public.pc_categories enable row level security;
alter table public.pc_counters enable row level security;
alter table public.pc_custodies enable row level security;
alter table public.pc_expenses enable row level security;
alter table public.pc_expense_lines enable row level security;
alter table public.pc_moves enable row level security;
alter table public.pc_refunds enable row level security;
alter table public.pc_log enable row level security;

create or replace function public._pc_immutable_trg() returns trigger language plpgsql set search_path=public as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then raise exception 'الحركات المالية والسجل لا تُحذف'; end if;
  if tg_table_name = 'pc_moves' and old.holder_ack_at is null and new.holder_ack_at is not null
     and (to_jsonb(new) - 'holder_ack_at' - 'holder_ack_by') = (to_jsonb(old) - 'holder_ack_at' - 'holder_ack_by') then return new; end if;
  raise exception 'الحركات المالية والسجل لا تُعدّل؛ استخدم حركة تصحيحية';
end $$;
create trigger pc_moves_immutable before update or delete on public.pc_moves for each row execute function public._pc_immutable_trg();
create trigger pc_log_immutable before update or delete on public.pc_log for each row execute function public._pc_immutable_trg();

create or replace function public._pc_today() returns date language sql stable as $$ select (now() at time zone 'Asia/Riyadh')::date $$;

create or replace function public._pc_branches(_org uuid, _uid uuid, _action text) returns uuid[]
language sql stable security definer set search_path=public as $$
  select coalesce(array_agg(distinct s) filter (where s is not null), '{}') from (
    select unnest(coalesce(a.school_ids, (select array_agg(m.school_id) from memberships m where m.org_id=_org and m.user_id=_uid and m.is_active and m.school_id is not null))) s
      from perm_assignments a join perm_roles r on r.id=a.role_id and r.archived_at is null
      join perm_role_grants g on g.role_id=r.id and g.section='procurement' and g.action=_action and g.scope='branch'
     where a.org_id=_org and a.user_id=_uid
    union all
    select m.school_id from perm_overrides o join memberships m on m.org_id=o.org_id and m.user_id=o.user_id and m.is_active
     where o.org_id=_org and o.user_id=_uid and o.section='procurement' and o.action=_action and o.effect='grant' and o.scope='branch') x
$$;

create or replace function public._pc_ok(_org uuid, _uid uuid, _action text, _school uuid, _holder uuid, _creator uuid) returns boolean
language plpgsql stable security definer set search_path=public as $$
declare s text := perm_scope(_org, _uid, 'procurement', _action);
begin
  if s is null or _uid is null then return false; end if;
  if s = 'org' then return true; end if;
  if _uid = _holder or _uid = _creator then return true; end if;
  return s = 'branch' and _school = any(_pc_branches(_org, _uid, _action));
end $$;

create or replace function public._pc_limit(_org uuid, _uid uuid) returns numeric
language sql stable security definer set search_path=public as $$
  select case
    when exists(select 1 from memberships where org_id=_org and user_id=_uid and role='org_owner' and is_active) then null
    when exists(select 1 from perm_overrides where org_id=_org and user_id=_uid and section='procurement' and action='approve' and effect='grant') then null
    when exists(select 1 from perm_assignments a join perm_roles r on r.id=a.role_id and r.archived_at is null join perm_role_grants g on g.role_id=r.id and g.section='procurement' and g.action='approve'
                 where a.org_id=_org and a.user_id=_uid and a.approval_limit is null) then null
    else coalesce((select max(a.approval_limit) from perm_assignments a join perm_roles r on r.id=a.role_id and r.archived_at is null join perm_role_grants g on g.role_id=r.id and g.section='procurement' and g.action='approve'
                 where a.org_id=_org and a.user_id=_uid), 0) end
$$;

create or replace function public._pc_settings(_org uuid) returns public.pc_settings
language plpgsql security definer set search_path=public as $$
declare s pc_settings;
begin
  select * into s from pc_settings where org_id=_org;
  if s.org_id is null then insert into pc_settings(org_id) values (_org) on conflict do nothing; select * into s from pc_settings where org_id=_org; end if;
  return s;
end $$;

create or replace function public._pc_ref(_org uuid, _kind text, _prefix text) returns text
language plpgsql security definer set search_path=public as $$
declare n int;
begin
  insert into pc_counters(org_id, kind, n) values (_org, _kind, 1) on conflict (org_id, kind) do update set n = pc_counters.n + 1 returning pc_counters.n into n;
  return _prefix || '-' || to_char(_pc_today(), 'YYYY') || '-' || lpad(n::text, 4, '0');
end $$;

create or replace function public._pc_log(_org uuid, _entity text, _id uuid, _action text, _before jsonb, _after jsonb, _reason text) returns void
language sql security definer set search_path=public as $$
  insert into pc_log(org_id, entity, entity_id, action, actor, before, after, reason) values (_org, _entity, _id, _action, auth.uid(), _before, _after, _reason) $$;

create or replace function public._pc_name(_u uuid) returns text language sql stable security definer set search_path=public as $$
  select coalesce((select full_name from profiles where id=_u), '—') $$;

create or replace function public._pc_calc(_amount numeric, _taxable boolean, _rate numeric, _incl boolean, out net numeric, out vat numeric, out total numeric)
language plpgsql immutable set search_path=public as $$
begin
  if not _taxable or _rate = 0 then net := round(_amount, 2); vat := 0; total := net;
  elsif _incl then total := round(_amount, 2); net := round(total / (1 + _rate / 100), 2); vat := total - net;
  else net := round(_amount, 2); vat := round(net * _rate / 100, 2); total := net + vat; end if;
end $$;

create or replace function public._pc_bal(_custody uuid, _exclude uuid default null)
returns table(disbursed numeric, topups numeric, refunds numeric, spent numeric, returned numeric, carried numeric, adjusted numeric, book numeric, pending numeric, available numeric)
language sql stable security definer set search_path=public as $$
  with m as (select
      coalesce(sum(amount) filter (where kind='disburse'),0) d, coalesce(sum(amount) filter (where kind='topup'),0) t,
      coalesce(sum(amount) filter (where kind='refund'),0) r, coalesce(-(sum(amount) filter (where kind='expense')),0) e,
      coalesce(-(sum(amount) filter (where kind='return')),0) ret, coalesce(sum(amount) filter (where kind in ('carry_in','carry_out')),0) c,
      coalesce(sum(amount) filter (where kind='adjust'),0) a, coalesce(sum(amount),0) b
    from pc_moves where custody_id=_custody),
  p as (select coalesce(sum(greatest(total,0)),0) p from pc_expenses where custody_id=_custody and status in ('submitted','in_review','returned') and id is distinct from _exclude)
  select m.d, m.t, m.r, m.e, m.ret, m.c, m.a, m.b, p.p, m.b - p.p from m, p $$;

create or replace function public._pc_notify(_user uuid, _school uuid, _title text, _body text, _key text) returns void
language sql security definer set search_path=public as $$ select _notify(_user, _school, 'procurement', _title, _body, '/app/procurement', _key) $$;

create or replace function public._pc_notify_can(_org uuid, _school uuid, _action text, _exclude uuid[], _title text, _body text, _key text) returns void
language plpgsql security definer set search_path=public as $$
declare u uuid;
begin
  for u in select distinct m.user_id from memberships m where m.org_id=_org and m.is_active and m.role not in ('student','guardian') loop
    if not (u = any(coalesce(_exclude,'{}'))) and _pc_ok(_org, u, _action, _school, null, null) then perform _pc_notify(u, _school, _title, _body, _key); end if;
  end loop;
end $$;

create or replace function public._pc_overdue(_org uuid, _holder uuid, _exclude uuid) returns int
language sql stable security definer set search_path=public as $$
  select count(*)::int from pc_custodies where org_id=_org and holder_id=_holder and status in ('disbursed','settling') and settle_due < _pc_today() and id is distinct from _exclude $$;

create or replace function public._pc_can_custody(_id uuid, _action text) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from pc_custodies c where c.id=_id and _pc_ok(c.org_id, auth.uid(), _action, c.school_id, c.holder_id, c.created_by)) $$;

create or replace function public._pc_can_expense(_id uuid, _action text) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from pc_expenses e left join pc_custodies c on c.id=e.custody_id where e.id=_id
    and _pc_ok(e.org_id, auth.uid(), _action, e.school_id, coalesce(c.holder_id, e.created_by), e.created_by)) $$;

create or replace function public._pc_file_ok(_category text, _id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select case _category
    when 'custody' then _pc_can_custody(_id, 'view')
    when 'expense' then _pc_can_expense(_id, 'view')
    when 'refund' then exists(select 1 from pc_refunds r where r.id=_id and _pc_can_expense(r.expense_id, 'view'))
    else false end $$;

create or replace function public.pc_me(_org uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); caps jsonb; s text;
begin
  if not exists(select 1 from memberships where org_id=_org and user_id=me and is_active) then raise exception 'forbidden' using errcode='42501'; end if;
  select jsonb_object_agg(a, perm_scope(_org, me, 'procurement', a)) into caps
    from unnest(array['view','create','edit','review','approve','disburse','cancel','export','settings']) a;
  s := caps->>'create';
  return jsonb_build_object(
    'enabled', section_enabled(_org, 'finance'),
    'is_owner', exists(select 1 from memberships where org_id=_org and user_id=me and role='org_owner' and is_active),
    'caps', caps, 'limit', _pc_limit(_org, me), 'me', me,
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id', sc.id, 'name', sc.name) order by sc.name) from schools sc where sc.org_id=_org),'[]'),
    'create_schools', coalesce((select jsonb_agg(sc.id) from schools sc where sc.org_id=_org and (s='org'
        or (s='branch' and sc.id = any(_pc_branches(_org, me, 'create')))
        or (s is not null and exists(select 1 from memberships m where m.org_id=_org and m.user_id=me and m.is_active and m.school_id=sc.id))
        or (s is not null and exists(select 1 from memberships m where m.org_id=_org and m.user_id=me and m.is_active and m.role='org_owner')))),'[]'),
    'categories', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from pc_categories where org_id=_org and archived_at is null),'[]'),
    'settings', (select to_jsonb(x) - 'org_id' from pc_settings x where org_id=_org));
end $$;

create or replace function public.pc_custody_save(_org uuid, _id uuid, _school uuid, _school_ids uuid[], _holder uuid, _purpose text, _amount numeric, _due date, _rev int, _key uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); c pc_custodies; cid uuid; ben uuid[];
begin
  if _id is null and _key is not null then
    select id into cid from pc_custodies where idem_key=_key and created_by=me;
    if cid is not null then return cid; end if;
  end if;
  if school_org(_school) is distinct from _org then raise exception 'الفرع خارج المؤسسة'; end if;
  ben := array(select distinct x from unnest(coalesce(_school_ids,'{}') || array[_school]) x);
  if exists(select 1 from unnest(ben) x where school_org(x) is distinct from _org) then raise exception 'فرع مستفيد خارج المؤسسة'; end if;
  if _holder is null or not _perm_staff(_org, _holder) then raise exception 'المستلم يجب أن يكون موظفًا نشطًا في المؤسسة'; end if;
  if not _pc_ok(_org, me, 'create', _school, _holder, null) then raise exception 'لا تملك صلاحية إنشاء عهدة لهذا المستلم أو الفرع' using errcode='42501'; end if;
  if length(btrim(coalesce(_purpose,''))) < 3 then raise exception 'الغرض مطلوب'; end if;
  if _amount is null or _amount <= 0 or _amount <> round(_amount, 2) then raise exception 'المبلغ غير صالح (موجب وبحد أقصى منزلتين عشريتين)'; end if;
  if _due is null or _due < _pc_today() then raise exception 'موعد التسوية يجب ألا يسبق اليوم'; end if;
  if _id is null then
    insert into pc_custodies(org_id, ref, holder_id, school_id, school_ids, purpose, amount, settle_due, created_by, idem_key)
      values (_org, _pc_ref(_org, 'custody', 'CU'), _holder, _school, ben, btrim(_purpose), _amount, _due, me, _key) returning * into c;
    perform _pc_log(_org, 'custody', c.id, 'create', null, to_jsonb(c), null);
    return c.id;
  end if;
  select * into c from pc_custodies where id=_id and org_id=_org for update;
  if c.id is null then raise exception 'العهدة غير موجودة'; end if;
  if c.status <> 'draft' then raise exception 'لا تُعدّل العهدة بعد تقديمها'; end if;
  if me not in (c.created_by, c.holder_id) then raise exception 'غير مصرح' using errcode='42501'; end if;
  if c.rev <> _rev then raise exception 'تغيّر السجل؛ حدّث الصفحة'; end if;
  update pc_custodies set holder_id=_holder, school_id=_school, school_ids=ben, purpose=btrim(_purpose), amount=_amount, settle_due=_due, rev=rev+1, updated_at=now() where id=_id;
  perform _pc_log(_org, 'custody', _id, 'update', to_jsonb(c), (select to_jsonb(x) from pc_custodies x where id=_id), null);
  return _id;
end $$;

create or replace function public.pc_custody_action(_id uuid, _action text, _rev int, _reason text, _exception text default null)
returns void language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); c pc_custodies; lim numeric; st pc_settings; nxt text; od int;
begin
  select * into c from pc_custodies where id=_id for update;
  if c.id is null or not _pc_ok(c.org_id, me, 'view', c.school_id, c.holder_id, c.created_by) then raise exception 'العهدة غير موجودة' using errcode='42501'; end if;
  if c.rev <> _rev then raise exception 'تغيّر السجل؛ حدّث الصفحة'; end if;
  if _action = 'submit' then
    if c.status <> 'draft' then raise exception 'العهدة ليست مسودة'; end if;
    if me not in (c.created_by, c.holder_id) or not _pc_ok(c.org_id, me, 'create', c.school_id, c.holder_id, c.created_by) then raise exception 'غير مصرح' using errcode='42501'; end if;
    nxt := 'submitted';
  elsif _action in ('approve','reject','return') then
    if c.status <> 'submitted' then raise exception 'العهدة ليست بانتظار القرار'; end if;
    if me in (c.holder_id, c.created_by) then raise exception 'لا يمكنك البت في عهدة أنت مستلمها أو مقدّمها؛ تبقى بانتظار معتمد آخر'; end if;
    if not _pc_ok(c.org_id, me, 'approve', c.school_id, null, null) then raise exception 'لا تملك صلاحية الاعتماد لهذا الفرع' using errcode='42501'; end if;
    if _action = 'approve' then
      lim := _pc_limit(c.org_id, me);
      if lim is not null and c.amount > lim then raise exception 'المبلغ يتجاوز حد اعتمادك (% ريال)؛ تبقى بانتظار معتمد بحد أعلى', lim; end if;
      st := _pc_settings(c.org_id); od := _pc_overdue(c.org_id, c.holder_id, c.id);
      if st.block_overdue and od > 0 then
        if length(btrim(coalesce(_exception,''))) < 5 then raise exception 'للمستلم % عهدة متأخرة التسوية؛ الاعتماد يتطلب سبب استثناء', od; end if;
        update pc_custodies set overdue_exception=btrim(_exception) where id=_id;
      end if;
      nxt := 'approved';
    else
      if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'السبب مطلوب'; end if;
      nxt := case when _action='reject' then 'rejected' else 'draft' end;
    end if;
  elsif _action = 'cancel' then
    if c.status not in ('draft','submitted','approved') then raise exception 'بعد الصرف تُعالج العهدة بالتسوية أو بحركة تصحيحية، لا بالإلغاء'; end if;
    if me not in (c.created_by, c.holder_id) and not _pc_ok(c.org_id, me, 'cancel', c.school_id, null, null) then raise exception 'غير مصرح' using errcode='42501'; end if;
    if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'السبب مطلوب'; end if;
    nxt := 'cancelled';
  else raise exception 'إجراء غير معروف'; end if;
  update pc_custodies set status=nxt, rev=rev+1, updated_at=now(),
    submitted_at = case when nxt='submitted' then now() else submitted_at end,
    decided_by = case when _action in ('approve','reject','return') then me else decided_by end,
    decided_at = case when _action in ('approve','reject','return') then now() else decided_at end,
    decision_reason = case when _action in ('reject','return','cancel') then btrim(_reason) else decision_reason end
   where id=_id;
  perform _pc_log(c.org_id, 'custody', _id, _action, jsonb_build_object('status', c.status), jsonb_build_object('status', nxt, 'exception', _exception), _reason);
  if nxt = 'submitted' then
    perform _pc_notify_can(c.org_id, c.school_id, 'approve', array[c.holder_id, c.created_by], 'عهدة بانتظار الاعتماد', c.ref || ' — ' || c.amount || ' ريال', 'pc-c-sub:' || _id || ':' || c.rev);
  elsif nxt = 'approved' then
    perform _pc_notify(c.holder_id, c.school_id, 'اعتُمدت عهدتك', c.ref || ' — بانتظار الصرف', 'pc-c-apr:' || _id);
    perform _pc_notify_can(c.org_id, c.school_id, 'disburse', array[c.holder_id], 'عهدة معتمدة بانتظار الصرف', c.ref || ' — ' || c.amount || ' ريال', 'pc-c-dis:' || _id);
  elsif nxt in ('rejected','draft') then
    perform _pc_notify(c.created_by, c.school_id, case when nxt='rejected' then 'رُفضت العهدة' else 'أُعيدت العهدة للاستكمال' end, c.ref || ' — ' || btrim(_reason), 'pc-c-' || nxt || ':' || _id || ':' || c.rev);
  end if;
end $$;

create or replace function public.pc_disburse(_id uuid, _rev int, _method text, _external_ref text, _file uuid, _doc_date date, _note text, _key uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); c pc_custodies; mid uuid; st pc_settings;
begin
  if _key is not null then select id into mid from pc_moves where idem_key=_key and actor=me; if mid is not null then return mid; end if; end if;
  select * into c from pc_custodies where id=_id for update;
  if c.id is null or not _pc_ok(c.org_id, me, 'disburse', c.school_id, null, null) then raise exception 'لا تملك صلاحية الصرف لهذا الفرع' using errcode='42501'; end if;
  if c.holder_id = me then raise exception 'لا يمكنك صرف عهدة لنفسك'; end if;
  if c.status <> 'approved' then raise exception 'الصرف لعهدة معتمدة فقط'; end if;
  if c.rev <> _rev then raise exception 'تغيّر السجل؛ حدّث الصفحة'; end if;
  if _method is null or _method not in ('cash','transfer','cheque','other') then raise exception 'طريقة الصرف مطلوبة'; end if;
  if _method <> 'cash' and length(btrim(coalesce(_external_ref,''))) < 2 then raise exception 'مرجع الصرف مطلوب لغير النقدي'; end if;
  if _file is null or not exists(select 1 from files where id=_file and source_type='pc' and category='custody' and source_id=_id and uploaded_by=me) then raise exception 'إثبات الصرف مطلوب'; end if;
  if _doc_date is null or _doc_date > _pc_today() then raise exception 'تاريخ الصرف غير صالح'; end if;
  st := _pc_settings(c.org_id);
  if st.block_overdue and _pc_overdue(c.org_id, c.holder_id, c.id) > 0 and c.overdue_exception is null then raise exception 'للمستلم عهدة متأخرة التسوية دون استثناء معتمد'; end if;
  insert into pc_moves(org_id, custody_id, kind, amount, ref, method, external_ref, file_id, doc_date, note, actor, idem_key)
    values (c.org_id, _id, 'disburse', c.amount, _pc_ref(c.org_id, 'move', 'MV'), _method, nullif(btrim(coalesce(_external_ref,'')),''), _file, _doc_date, nullif(btrim(coalesce(_note,'')),''), me, _key) returning id into mid;
  update pc_custodies set status='disbursed', rev=rev+1, updated_at=now() where id=_id;
  perform _pc_log(c.org_id, 'custody', _id, 'disburse', jsonb_build_object('status', c.status), jsonb_build_object('status','disbursed','move',mid,'amount',c.amount,'method',_method), _note);
  perform _pc_notify(c.holder_id, c.school_id, 'صُرفت عهدتك — أكّد الاستلام', c.ref || ' — ' || c.amount || ' ريال', 'pc-c-paid:' || mid);
  return mid;
end $$;

create or replace function public.pc_ack(_move uuid) returns void
language plpgsql security definer set search_path=public as $$
declare m pc_moves; c pc_custodies;
begin
  select * into m from pc_moves where id=_move for update;
  select * into c from pc_custodies where id=m.custody_id;
  if m.id is null or c.holder_id <> auth.uid() or m.kind not in ('disburse','topup','carry_in') then raise exception 'غير مصرح' using errcode='42501'; end if;
  if m.holder_ack_at is not null then return; end if;
  update pc_moves set holder_ack_at=now(), holder_ack_by=auth.uid() where id=_move;
  perform _pc_log(c.org_id, 'custody', c.id, 'ack', null, jsonb_build_object('move', _move), null);
end $$;

create or replace function public.pc_expense_save(_org uuid, _id uuid, _d jsonb, _rev int, _key uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); c pc_custodies; e pc_expenses; o pc_expenses; st pc_settings; l jsonb; r record; i int := 0;
  v_school uuid; v_ben uuid; v_own boolean := coalesce((_d->>'own_funds')::boolean, false); v_custody uuid := nullif(_d->>'custody_id','')::uuid;
  v_tax boolean := coalesce((_d->>'tax_invoice')::boolean, false); v_incl boolean; v_corr uuid := nullif(_d->>'corrects_id','')::uuid;
  tn numeric := 0; tv numeric := 0; tt numeric := 0; eid uuid; amt numeric; dup uuid; v_inv text := nullif(btrim(coalesce(_d->>'invoice_no','')),'');
  v_cat uuid := nullif(_d->>'category_id','')::uuid; v_pd date := nullif(_d->>'purchase_date','')::date; v_id date := nullif(_d->>'invoice_date','')::date;
begin
  if _id is null and _key is not null then
    select id into eid from pc_expenses where idem_key=_key and created_by=me;
    if eid is not null then return eid; end if;
  end if;
  st := _pc_settings(_org);
  v_incl := coalesce((_d->>'vat_inclusive')::boolean, st.vat_inclusive);
  if v_own then v_custody := null; v_corr := null; end if;
  if v_custody is not null then
    select * into c from pc_custodies where id=v_custody and org_id=_org for update;
    if c.id is null then raise exception 'العهدة غير موجودة'; end if;
    if c.status not in ('disbursed','settling') then raise exception 'المصروف يُسجَّل على عهدة مصروفة فقط'; end if;
    if not _pc_ok(_org, me, 'create', c.school_id, c.holder_id, null) then raise exception 'لا تملك تسجيل مصروف على هذه العهدة' using errcode='42501'; end if;
    v_school := c.school_id;
    v_ben := coalesce(nullif(_d->>'benefit_school_id','')::uuid, c.school_id);
    if not (v_ben = any(c.school_ids || array[c.school_id])) then raise exception 'الفرع المستفيد ليس ضمن فروع العهدة'; end if;
  else
    if not v_own then raise exception 'اختر العهدة، أو مسار «من مال الموظف»'; end if;
    v_school := nullif(_d->>'school_id','')::uuid;
    if school_org(v_school) is distinct from _org then raise exception 'الفرع خارج المؤسسة'; end if;
    if not _pc_ok(_org, me, 'create', v_school, me, null) then raise exception 'غير مصرح' using errcode='42501'; end if;
    v_ben := v_school;
  end if;
  if v_corr is not null then
    select * into o from pc_expenses where id=v_corr and org_id=_org;
    if o.id is null or o.status <> 'approved' or o.corrects_id is not null or o.custody_id is distinct from v_custody then raise exception 'التصحيح يرتبط بمصروف أصلي معتمد على العهدة نفسها'; end if;
    if length(btrim(coalesce(_d->>'notes',''))) < 5 then raise exception 'سبب التصحيح مطلوب في الملاحظات'; end if;
  end if;
  if length(btrim(coalesce(_d->>'description',''))) < 2 then raise exception 'البيان مطلوب'; end if;
  if length(btrim(coalesce(_d->>'supplier',''))) < 2 then raise exception 'المورد مطلوب'; end if;
  if v_tax and v_inv is null then raise exception 'رقم الفاتورة مطلوب للفاتورة الضريبية'; end if;
  if v_pd is null or v_pd > _pc_today() then raise exception 'تاريخ الشراء غير صالح'; end if;
  if v_id is not null and v_id > _pc_today() then raise exception 'تاريخ الفاتورة لا يتجاوز اليوم'; end if;
  if v_cat is not null and not exists(select 1 from pc_categories where id=v_cat and org_id=_org) then raise exception 'تصنيف غير صالح'; end if;
  if jsonb_typeof(_d->'lines') is distinct from 'array' or jsonb_array_length(_d->'lines') = 0 or jsonb_array_length(_d->'lines') > 50 then raise exception 'أضف بندًا واحدًا على الأقل (حتى 50 بندًا)'; end if;
  for l in select * from jsonb_array_elements(_d->'lines') loop
    amt := (l->>'amount')::numeric;
    if amt is null or amt = 0 or amt <> round(amt, 2) or (amt < 0 and v_corr is null) then raise exception 'مبلغ بند غير صالح'; end if;
    if length(btrim(coalesce(l->>'description',''))) < 1 then raise exception 'بيان البند مطلوب'; end if;
    select * into r from _pc_calc(amt, v_tax and coalesce((l->>'taxable')::boolean, true), st.vat_rate, v_incl);
    tn := tn + r.net; tv := tv + r.vat; tt := tt + r.total;
  end loop;
  if tt = 0 then raise exception 'الإجمالي لا يكون صفرًا'; end if;
  if v_inv is not null and v_corr is null then
    select x.id into dup from pc_expenses x where x.org_id=_org and lower(btrim(x.supplier))=lower(btrim(_d->>'supplier')) and lower(btrim(x.invoice_no))=lower(v_inv)
      and x.status not in ('rejected','cancelled') and x.corrects_id is null and x.id is distinct from _id limit 1;
  end if;
  if _id is null then
    insert into pc_expenses(org_id, ref, custody_id, own_funds, school_id, benefit_school_id, corrects_id, description, supplier, invoice_no, invoice_date, purchase_date, category_id,
        tax_invoice, vat_inclusive, vat_rate, net, vat, total, notes, no_attachment_reason, dup_of, created_by, idem_key)
      values (_org, _pc_ref(_org, 'expense', case when v_corr is null then 'EX' else 'CX' end), v_custody, v_own, v_school, v_ben, v_corr, btrim(_d->>'description'), btrim(_d->>'supplier'), v_inv, v_id, v_pd, v_cat,
        v_tax, v_incl, st.vat_rate, tn, tv, tt, nullif(btrim(coalesce(_d->>'notes','')),''), nullif(btrim(coalesce(_d->>'no_attachment_reason','')),''), dup, me, _key)
      returning * into e;
    perform _pc_log(_org, 'expense', e.id, 'create', null, to_jsonb(e), null);
  else
    select * into e from pc_expenses where id=_id and org_id=_org for update;
    if e.id is null or e.created_by <> me then raise exception 'غير مصرح' using errcode='42501'; end if;
    if e.status not in ('draft','returned') then raise exception 'لا يُعدّل المصروف بعد تقديمه؛ التصحيح بحركة مرتبطة'; end if;
    if e.rev <> _rev then raise exception 'تغيّر السجل؛ حدّث الصفحة'; end if;
    if e.custody_id is distinct from v_custody or e.corrects_id is distinct from v_corr then raise exception 'لا يُغيّر ارتباط المصروف بعد إنشائه'; end if;
    amt := e.total;
    update pc_expenses set benefit_school_id=v_ben, description=btrim(_d->>'description'), supplier=btrim(_d->>'supplier'), invoice_no=v_inv, invoice_date=v_id, purchase_date=v_pd,
        category_id=v_cat, tax_invoice=v_tax, vat_inclusive=v_incl, vat_rate=st.vat_rate, net=tn, vat=tv, total=tt, notes=nullif(btrim(coalesce(_d->>'notes','')),''),
        no_attachment_reason=nullif(btrim(coalesce(_d->>'no_attachment_reason','')),''), dup_of=dup, rev=rev+1, updated_at=now()
     where id=_id returning * into e;
    delete from pc_expense_lines where expense_id=_id;
    perform _pc_log(_org, 'expense', _id, 'update', jsonb_build_object('total', amt), jsonb_build_object('total', tt, 'lines', _d->'lines'), null);
  end if;
  for l in select * from jsonb_array_elements(_d->'lines') loop
    i := i + 1; amt := (l->>'amount')::numeric;
    select * into r from _pc_calc(amt, v_tax and coalesce((l->>'taxable')::boolean, true), st.vat_rate, v_incl);
    insert into pc_expense_lines(expense_id, ord, description, amount, taxable, net, vat, total)
      values (e.id, i, btrim(l->>'description'), amt, v_tax and coalesce((l->>'taxable')::boolean, true), r.net, r.vat, r.total);
  end loop;
  return e.id;
end $$;

create or replace function public.pc_expense_action(_id uuid, _action text, _rev int, _reason text)
returns void language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); e pc_expenses; c pc_custodies; b record; lim numeric; st pc_settings; nfiles int; nxt text; holder uuid; mid uuid;
begin
  select * into e from pc_expenses where id=_id for update;
  if e.id is null or not _pc_can_expense(_id, 'view') then raise exception 'المصروف غير موجود' using errcode='42501'; end if;
  if e.custody_id is not null then select * into c from pc_custodies where id=e.custody_id for update; end if;
  holder := coalesce(c.holder_id, e.created_by);
  if e.rev <> _rev then raise exception 'تغيّر السجل؛ حدّث الصفحة'; end if;
  st := _pc_settings(e.org_id);
  select count(*) into nfiles from files where source_type='pc' and category='expense' and source_id=_id;
  if _action = 'submit' then
    if e.status not in ('draft','returned') then raise exception 'المصروف ليس مسودة'; end if;
    if e.created_by <> me then raise exception 'غير مصرح' using errcode='42501'; end if;
    if c.id is not null and c.status not in ('disbursed','settling') then raise exception 'العهدة لم تعد مفتوحة للمصروفات'; end if;
    if nfiles = 0 and st.require_attachment and length(coalesce(e.no_attachment_reason,'')) < 5 then raise exception 'المرفق مطلوب للتقديم، أو اكتب سبب الاستثناء'; end if;
    if c.id is not null then
      select * into b from _pc_bal(c.id, _id);
      if e.total > b.available then raise exception 'المبلغ يتجاوز المتاح التقديري (% ريال)؛ استخدم مسار «من مال الموظف» أو اطلب تعزيزًا', b.available; end if;
    end if;
    nxt := 'submitted';
  elsif _action = 'review' then
    if e.status <> 'submitted' then raise exception 'المصروف ليس مقدّمًا'; end if;
    if me in (e.created_by, holder) then raise exception 'لا تراجع مصروفك'; end if;
    if not _pc_ok(e.org_id, me, 'review', e.school_id, null, null) then raise exception 'لا تملك صلاحية المراجعة' using errcode='42501'; end if;
    nxt := 'in_review';
  elsif _action in ('return','reject') then
    if e.status not in ('submitted','in_review') then raise exception 'المصروف ليس قيد القرار'; end if;
    if me in (e.created_by, holder) then raise exception 'لا تبت في مصروفك'; end if;
    if not (_pc_ok(e.org_id, me, 'approve', e.school_id, null, null) or (_action='return' and _pc_ok(e.org_id, me, 'review', e.school_id, null, null))) then raise exception 'غير مصرح' using errcode='42501'; end if;
    if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'السبب مطلوب'; end if;
    nxt := case when _action='return' then 'returned' else 'rejected' end;
  elsif _action = 'approve' then
    if e.status not in ('submitted','in_review') then raise exception 'المصروف ليس قيد القرار'; end if;
    if me in (e.created_by, holder) then raise exception 'لا يمكنك اعتماد مصروفك أو مصروف عهدتك؛ يبقى بانتظار معتمد آخر'; end if;
    if not _pc_ok(e.org_id, me, 'approve', e.school_id, null, null) then raise exception 'لا تملك صلاحية الاعتماد لهذا الفرع' using errcode='42501'; end if;
    lim := _pc_limit(e.org_id, me);
    if lim is not null and abs(e.total) > lim then raise exception 'المبلغ يتجاوز حد اعتمادك (% ريال)', lim; end if;
    if nfiles = 0 and st.require_attachment and length(btrim(coalesce(_reason,''))) < 5 then raise exception 'المصروف بلا مرفق: اكتب سبب موافقتك على الاستثناء'; end if;
    if e.invoice_no is not null and e.corrects_id is null and exists(select 1 from pc_expenses x where x.org_id=e.org_id and x.status='approved' and x.corrects_id is null and x.id<>e.id
         and lower(btrim(x.supplier))=lower(btrim(e.supplier)) and lower(btrim(x.invoice_no))=lower(btrim(e.invoice_no))) then raise exception 'فاتورة مكررة: الرقم نفسه لهذا المورد معتمد مسبقًا'; end if;
    if c.id is not null then
      if c.status not in ('disbursed','settling') then raise exception 'العهدة لم تعد مفتوحة'; end if;
      select * into b from _pc_bal(c.id, _id);
      if e.total > b.book - b.pending then raise exception 'المبلغ يتجاوز الرصيد المتاح (% ريال)', b.book - b.pending; end if;
      insert into pc_moves(org_id, custody_id, kind, amount, ref, expense_id, doc_date, note, actor)
        values (e.org_id, c.id, 'expense', -e.total, e.ref, e.id, coalesce(e.invoice_date, e.purchase_date), e.description, me) returning id into mid;
    end if;
    nxt := 'approved';
  elsif _action = 'cancel' then
    if e.status not in ('draft','returned') then raise exception 'يُلغى المصروف قبل تقديمه فقط'; end if;
    if e.created_by <> me then raise exception 'غير مصرح' using errcode='42501'; end if;
    nxt := 'cancelled';
  else raise exception 'إجراء غير معروف'; end if;
  update pc_expenses set status=nxt, rev=rev+1, updated_at=now(),
    submitted_at = case when nxt='submitted' then now() else submitted_at end,
    reviewed_by = case when nxt='in_review' then me else reviewed_by end,
    decided_by = case when nxt in ('approved','rejected','returned') then me else decided_by end,
    decided_at = case when nxt in ('approved','rejected','returned') then now() else decided_at end,
    decision_reason = case when nxt in ('approved','rejected','returned') then nullif(btrim(coalesce(_reason,'')),'') else decision_reason end,
    no_attachment_ok_by = case when nxt='approved' and nfiles = 0 then me else no_attachment_ok_by end
   where id=_id;
  perform _pc_log(e.org_id, 'expense', _id, _action, jsonb_build_object('status', e.status), jsonb_build_object('status', nxt, 'move', mid), _reason);
  if nxt = 'submitted' then
    perform _pc_notify_can(e.org_id, e.school_id, 'approve', array[e.created_by, holder], 'مصروف بانتظار القرار', e.ref || ' — ' || e.supplier || ' — ' || e.total || ' ريال', 'pc-e-sub:' || _id || ':' || e.rev);
  elsif nxt in ('approved','rejected','returned') then
    perform _pc_notify(e.created_by, e.school_id, case nxt when 'approved' then 'اعتُمد المصروف' when 'rejected' then 'رُفض المصروف' else 'أُعيد المصروف للاستكمال' end,
      e.ref || coalesce(' — ' || nullif(btrim(coalesce(_reason,'')),''), ''), 'pc-e-' || nxt || ':' || _id || ':' || e.rev);
    if nxt = 'approved' and c.id is not null then
      select * into b from _pc_bal(c.id);
      if b.book <= st.low_balance then perform _pc_notify(c.holder_id, c.school_id, 'انخفض رصيد العهدة', c.ref || ' — الرصيد ' || b.book || ' ريال', 'pc-low:' || c.id || ':' || _pc_today()); end if;
    end if;
  end if;
end $$;

create or replace function public.pc_refund_create(_expense uuid, _amount numeric, _reason text, _key uuid) returns uuid
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); e pc_expenses; c pc_custodies; rid uuid; used numeric;
begin
  if _key is not null then select id into rid from pc_refunds where idem_key=_key and created_by=me; if rid is not null then return rid; end if; end if;
  select * into e from pc_expenses where id=_expense for update;
  if e.id is null or e.custody_id is null or e.status <> 'approved' then raise exception 'الاسترداد يرتبط بمصروف معتمد على عهدة'; end if;
  select * into c from pc_custodies where id=e.custody_id;
  if not _pc_ok(e.org_id, me, 'create', c.school_id, c.holder_id, null) then raise exception 'غير مصرح' using errcode='42501'; end if;
  if _amount is null or _amount <= 0 or _amount <> round(_amount,2) then raise exception 'المبلغ غير صالح'; end if;
  select coalesce(sum(amount),0) into used from pc_refunds where expense_id=_expense and status in ('pending','collected');
  if used + _amount > e.total then raise exception 'المسترد يتجاوز قيمة المصروف الأصلي (المتبقي % ريال)', e.total - used; end if;
  if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'السبب مطلوب'; end if;
  insert into pc_refunds(org_id, expense_id, custody_id, amount, reason, created_by, idem_key) values (e.org_id, _expense, c.id, _amount, btrim(_reason), me, _key) returning id into rid;
  perform _pc_log(e.org_id, 'expense', _expense, 'refund_request', null, jsonb_build_object('refund', rid, 'amount', _amount), _reason);
  perform _pc_notify_can(e.org_id, c.school_id, 'disburse', array[me, c.holder_id], 'استرداد بانتظار تأكيد التحصيل', e.ref || ' — ' || _amount || ' ريال', 'pc-r-sub:' || rid);
  return rid;
end $$;

create or replace function public.pc_refund_decide(_id uuid, _collect boolean, _reason text) returns void
language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); r pc_refunds; c pc_custodies; e pc_expenses; mid uuid; f uuid;
begin
  select * into r from pc_refunds where id=_id for update;
  if r.id is null then raise exception 'غير موجود'; end if;
  select * into c from pc_custodies where id=r.custody_id for update;
  select * into e from pc_expenses where id=r.expense_id;
  if not (_pc_ok(r.org_id, me, 'disburse', c.school_id, null, null) or _pc_ok(r.org_id, me, 'approve', c.school_id, null, null)) then raise exception 'غير مصرح' using errcode='42501'; end if;
  if me in (r.created_by, c.holder_id) then raise exception 'لا تؤكد استردادًا قدّمته أو يخص عهدتك'; end if;
  if r.status <> 'pending' then raise exception 'تم البت فيه مسبقًا'; end if;
  if _collect then
    select id into f from files where source_type='pc' and category='refund' and source_id=_id order by created_at desc limit 1;
    if f is null then raise exception 'إثبات التحصيل مطلوب'; end if;
    insert into pc_moves(org_id, custody_id, kind, amount, ref, file_id, expense_id, doc_date, note, actor)
      values (r.org_id, c.id, 'refund', r.amount, _pc_ref(r.org_id, 'move', 'MV'), f, r.expense_id, _pc_today(), r.reason, me) returning id into mid;
  elsif length(btrim(coalesce(_reason,''))) < 3 then raise exception 'السبب مطلوب'; end if;
  update pc_refunds set status=case when _collect then 'collected' else 'rejected' end, decided_by=me, decided_at=now(), decision_reason=nullif(btrim(coalesce(_reason,'')),''), move_id=mid where id=_id;
  perform _pc_log(r.org_id, 'expense', r.expense_id, case when _collect then 'refund_collected' else 'refund_rejected' end, null, jsonb_build_object('refund', _id, 'move', mid, 'amount', r.amount), _reason);
  perform _pc_notify(r.created_by, c.school_id, case when _collect then 'أُكّد تحصيل الاسترداد' else 'رُفض الاسترداد' end, e.ref || ' — ' || r.amount || ' ريال', 'pc-r-dec:' || _id);
end $$;

create or replace function public.create_pc_file(_entity text, _id uuid, _name text, _mime text, _size bigint)
returns table(id uuid, storage_path text) language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); sch uuid; pol record; fid uuid := gen_random_uuid(); p text; ok boolean := false; c pc_custodies; e pc_expenses; r pc_refunds;
begin
  if _entity = 'custody' then
    select * into c from pc_custodies x where x.id=_id;
    ok := c.id is not null and c.status = 'approved' and c.holder_id <> me and _pc_ok(c.org_id, me, 'disburse', c.school_id, null, null);
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
  end if;
  if not coalesce(ok,false) then raise exception 'غير مصرح بإرفاق ملف هنا' using errcode='42501'; end if;
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
    and ((category='expense' and exists(select 1 from pc_expenses e where e.id=files.source_id and e.status in ('draft','returned')))
      or (category='custody' and exists(select 1 from pc_custodies c where c.id=files.source_id and c.status='approved') and not exists(select 1 from pc_moves m where m.file_id=files.id))
      or (category='refund' and exists(select 1 from pc_refunds r where r.id=files.source_id and r.status='pending')));
  if not found then raise exception 'لا يمكن إزالة هذا المرفق'; end if;
end $$;

create or replace function public._pc_files(_category text, _id uuid) returns jsonb
language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'storage_path', f.storage_path, 'size', f.size_bytes, 'by', _pc_name(f.uploaded_by), 'uploaded_by', f.uploaded_by, 'at', f.created_at) order by f.created_at),'[]')
  from files f where f.source_type='pc' and f.category=_category and f.source_id=_id $$;

alter table public.files drop constraint files_source_type_check;
alter table public.files add constraint files_source_type_check check (source_type = any (array['post','message','message_pending','circular','cleanup_due','homework','submission','feedback','pickup','admin','support','pc']));
do $do$
declare d text := pg_get_functiondef('public.can_read_file(uuid)'::regprocedure);
begin
  if position('_pc_file_ok' in d) = 0 then
    d := replace(d, $x$or (f.source_type='support' and support_can_read(f.source_id))))$x$, $x$or (f.source_type='support' and support_can_read(f.source_id))
    or (f.source_type='pc' and _pc_file_ok(f.category, f.source_id))))$x$);
    if position('_pc_file_ok' in d) = 0 then raise exception 'can_read_file patch failed'; end if;
    execute d;
  end if;
end $do$;

create or replace function public._pc_custody_row(c public.pc_custodies) returns jsonb
language sql stable security definer set search_path=public as $$
  select to_jsonb(c) - 'idem_key' || jsonb_build_object(
    'holder', _pc_name(c.holder_id), 'creator', _pc_name(c.created_by), 'decider', case when c.decided_by is not null then _pc_name(c.decided_by) end,
    'school', (select name from schools where id=c.school_id),
    'overdue', c.status in ('disbursed','settling') and c.settle_due < _pc_today(),
    'bal', (select to_jsonb(b) from _pc_bal(c.id) b)) $$;

create or replace function public.pc_custody_list(_org uuid, _status text, _q text, _school uuid, _mine boolean, _limit int, _offset int)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); q text := nullif(btrim(coalesce(_q,'')),''); rows jsonb; n bigint;
begin
  if perm_scope(_org, me, 'procurement', 'view') is null then raise exception 'غير مصرح' using errcode='42501'; end if;
  with v as (select c.* from pc_custodies c where c.org_id=_org
      and _pc_ok(_org, me, 'view', c.school_id, c.holder_id, c.created_by)
      and (_school is null or c.school_id=_school) and (not coalesce(_mine,false) or c.holder_id=me)
      and (_status is null or (_status='overdue' and c.status in ('disbursed','settling') and c.settle_due < _pc_today()) or (_status='open' and c.status in ('disbursed','settling')) or c.status=_status)
      and (q is null or c.ref ilike '%'||q||'%' or c.purpose ilike '%'||q||'%' or _pc_name(c.holder_id) ilike '%'||q||'%'))
  select (select count(*) from v), coalesce((select jsonb_agg(_pc_custody_row(x) order by x.created_at desc) from (select * from v order by created_at desc limit least(coalesce(_limit,50),5000) offset coalesce(_offset,0)) x),'[]')
    into n, rows;
  return jsonb_build_object('total', n, 'rows', rows);
end $$;

create or replace function public.pc_custody_get(_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); c pc_custodies; lim numeric;
begin
  select * into c from pc_custodies where id=_id;
  if c.id is null or not _pc_ok(c.org_id, me, 'view', c.school_id, c.holder_id, c.created_by) then raise exception 'العهدة غير موجودة أو خارج نطاقك' using errcode='42501'; end if;
  lim := _pc_limit(c.org_id, me);
  return _pc_custody_row(c) || jsonb_build_object(
    'schools', (select jsonb_agg(name) from schools where id = any(c.school_ids)),
    'moves', coalesce((select jsonb_agg(x order by (x->>'at'), (x->>'id')) from (select jsonb_build_object('id', m.id, 'kind', m.kind, 'amount', m.amount, 'ref', m.ref, 'method', m.method, 'external_ref', m.external_ref, 'doc_date', m.doc_date,
         'note', m.note, 'at', m.at, 'actor', _pc_name(m.actor), 'ack_at', m.holder_ack_at, 'expense_id', m.expense_id,
         'file', (select jsonb_build_object('id', f.id, 'name', f.name, 'storage_path', f.storage_path) from files f where f.id=m.file_id),
         'balance', sum(m.amount) over (order by m.at, m.id)) x from pc_moves m where m.custody_id=_id) y),'[]'),
    'expenses', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'ref', e.ref, 'description', e.description, 'supplier', e.supplier, 'invoice_no', e.invoice_no, 'total', e.total,
         'status', e.status, 'purchase_date', e.purchase_date, 'corrects_id', e.corrects_id) order by e.created_at desc) from pc_expenses e where e.custody_id=_id),'[]'),
    'files', _pc_files('custody', _id),
    'log', coalesce((select jsonb_agg(jsonb_build_object('at', l.at, 'actor', _pc_name(l.actor), 'action', l.action, 'reason', l.reason) order by l.at) from pc_log l where l.entity='custody' and l.entity_id=_id),'[]'),
    'can', jsonb_build_object(
      'edit', c.status='draft' and me in (c.created_by, c.holder_id),
      'submit', c.status='draft' and me in (c.created_by, c.holder_id) and _pc_ok(c.org_id, me, 'create', c.school_id, c.holder_id, c.created_by),
      'decide', c.status='submitted' and me not in (c.created_by, c.holder_id) and _pc_ok(c.org_id, me, 'approve', c.school_id, null, null) and (lim is null or c.amount <= lim),
      'disburse', c.status='approved' and me <> c.holder_id and _pc_ok(c.org_id, me, 'disburse', c.school_id, null, null),
      'cancel', c.status in ('draft','submitted','approved') and (me in (c.created_by, c.holder_id) or _pc_ok(c.org_id, me, 'cancel', c.school_id, null, null)),
      'expense', c.status in ('disbursed','settling') and _pc_ok(c.org_id, me, 'create', c.school_id, c.holder_id, null),
      'ack', c.holder_id = me),
    'overdue_count', _pc_overdue(c.org_id, c.holder_id, c.id));
end $$;

create or replace function public._pc_expense_row(e public.pc_expenses) returns jsonb
language sql stable security definer set search_path=public as $$
  select to_jsonb(e) - 'idem_key' || jsonb_build_object(
    'creator', _pc_name(e.created_by), 'school', (select name from schools where id=e.school_id), 'benefit_school', (select name from schools where id=e.benefit_school_id),
    'category', (select name from pc_categories where id=e.category_id),
    'custody_ref', (select ref from pc_custodies where id=e.custody_id), 'holder', (select _pc_name(holder_id) from pc_custodies where id=e.custody_id),
    'dup_ref', (select ref from pc_expenses where id=e.dup_of),
    'files_count', (select count(*) from files where source_type='pc' and category='expense' and source_id=e.id)) $$;

create or replace function public.pc_expense_list(_org uuid, _status text, _q text, _school uuid, _custody uuid, _category uuid, _from date, _to date, _limit int, _offset int)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); q text := nullif(btrim(coalesce(_q,'')),''); rows jsonb; n bigint; sums jsonb;
begin
  if perm_scope(_org, me, 'procurement', 'view') is null then raise exception 'غير مصرح' using errcode='42501'; end if;
  with v as (select e.* from pc_expenses e left join pc_custodies c on c.id=e.custody_id where e.org_id=_org
      and _pc_ok(_org, me, 'view', e.school_id, coalesce(c.holder_id, e.created_by), e.created_by)
      and (_school is null or e.school_id=_school or e.benefit_school_id=_school) and (_custody is null or e.custody_id=_custody) and (_category is null or e.category_id=_category)
      and (_from is null or e.purchase_date >= _from) and (_to is null or e.purchase_date <= _to)
      and (_status is null or (_status='pending' and e.status in ('submitted','in_review')) or e.status=_status)
      and (q is null or e.ref ilike '%'||q||'%' or e.supplier ilike '%'||q||'%' or e.description ilike '%'||q||'%' or coalesce(e.invoice_no,'') ilike '%'||q||'%'))
  select (select count(*) from v),
    (select jsonb_build_object('net', coalesce(sum(net),0), 'vat', coalesce(sum(vat),0), 'total', coalesce(sum(total),0)) from v),
    coalesce((select jsonb_agg(_pc_expense_row(x) order by x.created_at desc) from (select * from v order by created_at desc limit least(coalesce(_limit,50),5000) offset coalesce(_offset,0)) x),'[]')
    into n, sums, rows;
  return jsonb_build_object('total', n, 'sums', sums, 'rows', rows);
end $$;

create or replace function public.pc_expense_get(_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); e pc_expenses; c pc_custodies; holder uuid; lim numeric; nf int;
begin
  select * into e from pc_expenses where id=_id;
  if e.id is null or not _pc_can_expense(_id, 'view') then raise exception 'المصروف غير موجود أو خارج نطاقك' using errcode='42501'; end if;
  select * into c from pc_custodies where id=e.custody_id;
  holder := coalesce(c.holder_id, e.created_by); lim := _pc_limit(e.org_id, me);
  select count(*) into nf from files where source_type='pc' and category='expense' and source_id=_id;
  return _pc_expense_row(e) || jsonb_build_object(
    'lines', coalesce((select jsonb_agg(to_jsonb(l) - 'expense_id' order by l.ord) from pc_expense_lines l where l.expense_id=_id),'[]'),
    'files', _pc_files('expense', _id),
    'corrections', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'ref', x.ref, 'total', x.total, 'status', x.status) order by x.created_at) from pc_expenses x where x.corrects_id=_id),'[]'),
    'refunds', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'amount', r.amount, 'reason', r.reason, 'status', r.status, 'by', _pc_name(r.created_by), 'created_by', r.created_by, 'at', r.created_at, 'files', _pc_files('refund', r.id),
        'can_decide', r.status='pending' and me not in (r.created_by, holder) and (_pc_ok(e.org_id, me, 'disburse', e.school_id, null, null) or _pc_ok(e.org_id, me, 'approve', e.school_id, null, null))) order by r.created_at) from pc_refunds r where r.expense_id=_id),'[]'),
    'log', coalesce((select jsonb_agg(jsonb_build_object('at', l.at, 'actor', _pc_name(l.actor), 'action', l.action, 'reason', l.reason) order by l.at) from pc_log l where l.entity='expense' and l.entity_id=_id),'[]'),
    'can', jsonb_build_object(
      'edit', e.status in ('draft','returned') and e.created_by = me,
      'review', e.status='submitted' and me not in (e.created_by, holder) and _pc_ok(e.org_id, me, 'review', e.school_id, null, null),
      'return', e.status in ('submitted','in_review') and me not in (e.created_by, holder) and (_pc_ok(e.org_id, me, 'review', e.school_id, null, null) or _pc_ok(e.org_id, me, 'approve', e.school_id, null, null)),
      'decide', e.status in ('submitted','in_review') and me not in (e.created_by, holder) and _pc_ok(e.org_id, me, 'approve', e.school_id, null, null) and (lim is null or abs(e.total) <= lim),
      'correct', e.status='approved' and e.corrects_id is null and e.custody_id is not null and _pc_ok(e.org_id, me, 'create', e.school_id, holder, null),
      'refund', e.status='approved' and e.custody_id is not null and _pc_ok(e.org_id, me, 'create', e.school_id, holder, null)),
    'no_files', nf = 0);
end $$;

create or replace function public.pc_tasks(_org uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid();
begin
  if perm_scope(_org, me, 'procurement', 'view') is null then raise exception 'غير مصرح' using errcode='42501'; end if;
  return jsonb_build_object(
    'custody_decide', coalesce((select jsonb_agg(_pc_custody_row(c) order by c.submitted_at) from pc_custodies c where c.org_id=_org and c.status='submitted' and me not in (c.holder_id, c.created_by) and _pc_ok(_org, me, 'approve', c.school_id, null, null)),'[]'),
    'custody_disburse', coalesce((select jsonb_agg(_pc_custody_row(c) order by c.decided_at) from pc_custodies c where c.org_id=_org and c.status='approved' and me <> c.holder_id and _pc_ok(_org, me, 'disburse', c.school_id, null, null)),'[]'),
    'expense_decide', coalesce((select jsonb_agg(_pc_expense_row(e) order by e.submitted_at) from pc_expenses e left join pc_custodies c on c.id=e.custody_id where e.org_id=_org and e.status in ('submitted','in_review')
        and me not in (e.created_by, coalesce(c.holder_id, e.created_by)) and (_pc_ok(_org, me, 'approve', e.school_id, null, null) or _pc_ok(_org, me, 'review', e.school_id, null, null))),'[]'),
    'refund_decide', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'expense_id', r.expense_id, 'ref', e.ref, 'amount', r.amount, 'reason', r.reason, 'by', _pc_name(r.created_by)) order by r.created_at)
        from pc_refunds r join pc_expenses e on e.id=r.expense_id join pc_custodies c on c.id=r.custody_id where r.org_id=_org and r.status='pending' and me not in (r.created_by, c.holder_id)
        and (_pc_ok(_org, me, 'disburse', c.school_id, null, null) or _pc_ok(_org, me, 'approve', c.school_id, null, null))),'[]'),
    'mine', coalesce((select jsonb_agg(y.x order by y.x->>'updated_at' desc) from (
        select _pc_custody_row(c) || jsonb_build_object('entity','custody') x from pc_custodies c where c.org_id=_org and (c.created_by=me or c.holder_id=me) and c.status in ('draft','submitted','approved')
        union all select _pc_expense_row(e) || jsonb_build_object('entity','expense') from pc_expenses e where e.org_id=_org and e.created_by=me and e.status in ('draft','returned','submitted','in_review')) y),'[]'),
    'ack', coalesce((select jsonb_agg(jsonb_build_object('move', m.id, 'custody_id', c.id, 'ref', c.ref, 'amount', m.amount, 'at', m.at)) from pc_moves m join pc_custodies c on c.id=m.custody_id
        where c.org_id=_org and c.holder_id=me and m.kind in ('disburse','topup','carry_in') and m.holder_ack_at is null),'[]'));
end $$;

create or replace function public.pc_summary(_org uuid, _school uuid, _from date, _to date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare me uuid := auth.uid(); res jsonb;
begin
  if perm_scope(_org, me, 'procurement', 'view') is null then raise exception 'غير مصرح' using errcode='42501'; end if;
  with v as (select c.id, c.status, c.settle_due, c.holder_id, c.school_id, b.disbursed, b.topups, b.spent, b.pending, b.book, b.available
        from pc_custodies c cross join lateral _pc_bal(c.id) b where c.org_id=_org
        and _pc_ok(_org, me, 'view', c.school_id, c.holder_id, c.created_by) and (_school is null or c.school_id=_school)
        and (_from is null or c.created_at >= _from) and (_to is null or c.created_at < _to + 1))
  select jsonb_build_object(
      'open', (select count(*) from v where status in ('disbursed','settling')),
      'overdue', (select count(*) from v where status in ('disbursed','settling') and settle_due < _pc_today()),
      'awaiting', (select count(*) from v where status in ('submitted','approved')),
      'disbursed', (select coalesce(sum(disbursed + topups),0) from v), 'spent', (select coalesce(sum(spent),0) from v), 'pending', (select coalesce(sum(pending),0) from v),
      'book', (select coalesce(sum(book),0) from v where status in ('disbursed','settling')), 'available', (select coalesce(sum(available),0) from v where status in ('disbursed','settling')),
      'by_holder', coalesce((select jsonb_agg(x) from (select jsonb_build_object('name', _pc_name(holder_id), 'count', count(*), 'disbursed', sum(disbursed+topups), 'spent', sum(spent), 'pending', sum(pending), 'book', sum(book)) x from v where status in ('disbursed','settling','closed') group by holder_id) y),'[]'),
      'by_school', coalesce((select jsonb_agg(x) from (select jsonb_build_object('name', (select name from schools where id=school_id), 'count', count(*), 'disbursed', sum(disbursed+topups), 'spent', sum(spent), 'pending', sum(pending), 'book', sum(book)) x from v where status in ('disbursed','settling','closed') group by school_id) y),'[]'))
    into res;
  return res;
end $$;

create or replace function public.pc_settings_save(_org uuid, _vat_rate numeric, _vat_inclusive boolean, _require_attachment boolean, _block_overdue boolean, _low_balance numeric, _rev int, _reason text)
returns void language plpgsql security definer set search_path=public as $$
declare s pc_settings;
begin
  if perm_scope(_org, auth.uid(), 'procurement', 'settings') is distinct from 'org' then raise exception 'إعدادات القسم لمن يملك صلاحية الإعدادات على المؤسسة' using errcode='42501'; end if;
  s := _pc_settings(_org);
  if s.rev <> _rev then raise exception 'تغيّر السجل؛ حدّث الصفحة'; end if;
  if _vat_rate is null or _vat_rate < 0 or _vat_rate > 100 then raise exception 'نسبة الضريبة غير صالحة'; end if;
  if _low_balance is null or _low_balance < 0 then raise exception 'حد انخفاض الرصيد غير صالح'; end if;
  if length(btrim(coalesce(_reason,''))) < 3 then raise exception 'السبب مطلوب'; end if;
  update pc_settings set vat_rate=_vat_rate, vat_inclusive=_vat_inclusive, require_attachment=_require_attachment, block_overdue=_block_overdue, low_balance=_low_balance, rev=rev+1, updated_by=auth.uid(), updated_at=now() where org_id=_org;
  perform _pc_log(_org, 'settings', null, 'update', to_jsonb(s) - 'org_id', (select to_jsonb(x) - 'org_id' from pc_settings x where org_id=_org), _reason);
end $$;

create or replace function public.pc_category_save(_org uuid, _id uuid, _name text, _archived boolean) returns uuid
language plpgsql security definer set search_path=public as $$
declare cid uuid := _id;
begin
  if perm_scope(_org, auth.uid(), 'procurement', 'settings') is null then raise exception 'غير مصرح' using errcode='42501'; end if;
  if length(btrim(coalesce(_name,''))) < 2 then raise exception 'اسم التصنيف مطلوب'; end if;
  if cid is null then insert into pc_categories(org_id, name) values (_org, btrim(_name)) returning id into cid;
  else update pc_categories set name=btrim(_name), archived_at=case when _archived then coalesce(archived_at, now()) end where id=cid and org_id=_org;
    if not found then raise exception 'غير موجود'; end if; end if;
  perform _pc_log(_org, 'settings', cid, 'category', null, jsonb_build_object('name', _name, 'archived', _archived), null);
  return cid;
end $$;

create or replace function public.pc_settings_log(_org uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if perm_scope(_org, auth.uid(), 'procurement', 'settings') is null then raise exception 'غير مصرح' using errcode='42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('at', at, 'actor', _pc_name(actor), 'action', action, 'reason', reason, 'before', before, 'after', after) order by at desc)
    from (select * from pc_log where org_id=_org and entity='settings' order by at desc limit 100) l),'[]');
end $$;

do $do$
declare d text := pg_get_functiondef('public._people_pool(text,uuid,uuid,uuid)'::regprocedure);
begin
  if position('pc_holder' in d) = 0 then
    d := replace(d, $x$  if _purpose = 'perm' then$x$, $x$  if _purpose = 'pc_holder' then
    if perm_scope(org, auth.uid(), 'procurement', 'create') is null then raise exception 'غير مصرح' using errcode='42501'; end if;
    return query select m.user_id, m.school_id, m.role::text from memberships m join schools s on s.id=m.school_id
      where m.is_active and s.org_id=org and m.role not in ('student','guardian') and _pc_ok(org, auth.uid(), 'create', m.school_id, m.user_id, null);
    return;
  end if;
  if _purpose = 'perm' then$x$);
    if position('pc_holder' in d) = 0 then raise exception '_people_pool patch failed'; end if;
    execute d;
  end if;
end $do$;

revoke all on function public._pc_immutable_trg(), public._pc_today(), public._pc_branches(uuid,uuid,text), public._pc_ok(uuid,uuid,text,uuid,uuid,uuid), public._pc_limit(uuid,uuid), public._pc_settings(uuid),
  public._pc_ref(uuid,text,text), public._pc_log(uuid,text,uuid,text,jsonb,jsonb,text), public._pc_name(uuid), public._pc_bal(uuid,uuid), public._pc_notify(uuid,uuid,text,text,text),
  public._pc_notify_can(uuid,uuid,text,uuid[],text,text,text), public._pc_overdue(uuid,uuid,uuid), public._pc_can_custody(uuid,text), public._pc_can_expense(uuid,text),
  public._pc_files(text,uuid), public._pc_custody_row(public.pc_custodies), public._pc_expense_row(public.pc_expenses), public._pc_calc(numeric,boolean,numeric,boolean) from public, anon, authenticated;
grant execute on function public._pc_branches(uuid,uuid,text), public._pc_ok(uuid,uuid,text,uuid,uuid,uuid), public._pc_limit(uuid,uuid), public._pc_bal(uuid,uuid), public._pc_calc(numeric,boolean,numeric,boolean) to service_role;
revoke all on function public._pc_file_ok(text,uuid) from public, anon;
grant execute on function public._pc_file_ok(text,uuid) to authenticated;
revoke all on function public.pc_me(uuid), public.pc_custody_save(uuid,uuid,uuid,uuid[],uuid,text,numeric,date,int,uuid), public.pc_custody_action(uuid,text,int,text,text),
  public.pc_disburse(uuid,int,text,text,uuid,date,text,uuid), public.pc_ack(uuid), public.pc_expense_save(uuid,uuid,jsonb,int,uuid), public.pc_expense_action(uuid,text,int,text),
  public.pc_refund_create(uuid,numeric,text,uuid), public.pc_refund_decide(uuid,boolean,text), public.create_pc_file(text,uuid,text,text,bigint), public.pc_file_remove(uuid),
  public.pc_custody_list(uuid,text,text,uuid,boolean,int,int), public.pc_custody_get(uuid), public.pc_expense_list(uuid,text,text,uuid,uuid,uuid,date,date,int,int), public.pc_expense_get(uuid),
  public.pc_tasks(uuid), public.pc_summary(uuid,uuid,date,date), public.pc_settings_save(uuid,numeric,boolean,boolean,boolean,numeric,int,text), public.pc_category_save(uuid,uuid,text,boolean),
  public.pc_settings_log(uuid) from public, anon;
grant execute on function public.pc_me(uuid), public.pc_custody_save(uuid,uuid,uuid,uuid[],uuid,text,numeric,date,int,uuid), public.pc_custody_action(uuid,text,int,text,text),
  public.pc_disburse(uuid,int,text,text,uuid,date,text,uuid), public.pc_ack(uuid), public.pc_expense_save(uuid,uuid,jsonb,int,uuid), public.pc_expense_action(uuid,text,int,text),
  public.pc_refund_create(uuid,numeric,text,uuid), public.pc_refund_decide(uuid,boolean,text), public.create_pc_file(text,uuid,text,text,bigint), public.pc_file_remove(uuid),
  public.pc_custody_list(uuid,text,text,uuid,boolean,int,int), public.pc_custody_get(uuid), public.pc_expense_list(uuid,text,text,uuid,uuid,uuid,date,date,int,int), public.pc_expense_get(uuid),
  public.pc_tasks(uuid), public.pc_summary(uuid,uuid,date,date), public.pc_settings_save(uuid,numeric,boolean,boolean,boolean,numeric,int,text), public.pc_category_save(uuid,uuid,text,boolean),
  public.pc_settings_log(uuid) to authenticated;

insert into public.pc_categories(org_id, name) select o.id, x.n from public.organizations o cross join (values ('قرطاسية'),('صيانة'),('ضيافة'),('نظافة'),('أخرى')) x(n) on conflict do nothing;