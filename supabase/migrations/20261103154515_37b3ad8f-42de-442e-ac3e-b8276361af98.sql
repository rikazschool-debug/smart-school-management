alter table public.pc_requests drop constraint pc_requests_status_check;
alter table public.pc_requests add constraint pc_requests_status_check check (status in ('draft','submitted','approved','rejected','cancelled','done','awaiting_assignment','in_progress','closed_partial'));

-- Reservation: a quantity is held from submission until rejection/cancellation; drafts reserve nothing; only approved counts as purchased.
create or replace function public._pc_need_used(_line uuid, _approved_only boolean) returns numeric
language sql stable security definer set search_path=public as $$
  select coalesce(sum(el.qty),0) from pc_expense_lines el join pc_expenses e on e.id=el.expense_id
   where el.need_line_id=_line and (case when _approved_only then e.status='approved' else e.status in ('submitted','in_review','returned','approved') end) $$;

create or replace function public._pc_need_used_excl(_line uuid, _eid uuid) returns numeric
language sql stable security definer set search_path=public as $$
  select coalesce(sum(el.qty),0) from pc_expense_lines el join pc_expenses e on e.id=el.expense_id
   where el.need_line_id=_line and e.id<>_eid and e.status in ('submitted','in_review','returned','approved') $$;

-- Net spent on a need: approved linked invoices + their approved corrections − collected refunds.
create or replace function public._pc_need_net(_req uuid) returns numeric
language sql stable security definer set search_path=public as $$
  with base as (select id from pc_expenses where purchase_request_id=_req and status='approved' and corrects_id is null),
  allx as (select id, total from pc_expenses where status='approved' and (id in (select id from base) or corrects_id in (select id from base)))
  select coalesce((select sum(total) from allx),0) - coalesce((select sum(amount) from pc_refunds where status='collected' and expense_id in (select id from allx)),0) $$;

-- Corrections never carry need quantities (prevents double execution).
create or replace function public._pc_need_corr_trg() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.need_line_id is not null and exists(select 1 from pc_expenses where id=new.expense_id and corrects_id is not null) then
    raise exception 'التصحيح يعدّل المبلغ فقط ولا يُربط بكميات طلب الاحتياج'; end if;
  return new;
end $$;
drop trigger if exists pc_need_corr on public.pc_expense_lines;
create trigger pc_need_corr before insert or update of need_line_id on public.pc_expense_lines for each row execute function public._pc_need_corr_trg();

do $$ declare d text; begin
  -- draft save: compare others' reservations + this invoice
  d := pg_get_functiondef('public._pc_expense_ext(uuid,jsonb,boolean)'::regprocedure);
  d := replace(d, $x$if _pc_need_used(nl.id, false) > nl.qty then raise exception 'الكمية لبند «%» تتجاوز المتبقي (% من %)', nl.description, nl.qty - (_pc_need_used(nl.id, false) - (select sum(qty) from pc_expense_lines where expense_id=_eid and need_line_id=nl.id)), nl.qty; end if;$x$,
    $x$if _pc_need_used_excl(nl.id, _eid) + (select sum(qty) from pc_expense_lines where expense_id=_eid and need_line_id=nl.id) > nl.qty then raise exception 'الكمية لبند «%» تتجاوز المتبقي (% من %)', nl.description, nl.qty - _pc_need_used_excl(nl.id, _eid), nl.qty; end if;$x$);
  if d not like '%_pc_need_used_excl%' then raise exception 'ext patch failed'; end if;
  execute d;
  -- submit: lock the need so concurrent submissions serialize, then reserve
  d := pg_get_functiondef('public._pc_expense_submit_check(uuid)'::regprocedure);
  d := replace(d, $x$select * into pr from pc_requests where id=e.purchase_request_id;$x$, $x$select * into pr from pc_requests where id=e.purchase_request_id for update;$x$);
  d := replace(d, $x$for nl in select n.* from pc_need_lines n where n.request_id=pr.id loop
      if _pc_need_used(nl.id, false) > nl.qty then$x$, $x$for nl in select n.* from pc_need_lines n where n.request_id=pr.id loop
      if _pc_need_used_excl(nl.id, _eid) + coalesce((select sum(qty) from pc_expense_lines where expense_id=_eid and need_line_id=nl.id),0) > nl.qty then$x$);
  if d not like '%for update%' or d not like '%_pc_need_used_excl%' then raise exception 'submit patch failed'; end if;
  execute d;
  -- partial close keeps a distinct status
  d := pg_get_functiondef('public.pc_need_action(uuid,text,integer,text,uuid)'::regprocedure);
  d := replace(d, $x$update pc_requests set status='done', done_by=me,$x$, $x$update pc_requests set status=case when coalesce(full_done,false) then 'done' else 'closed_partial' end, done_by=me,$x$);
  d := replace(d, $x$else 'اكتمل طلب الاحتياج' end$x$, $x$when 'close' then case when coalesce(full_done,false) then 'اكتمل طلب الاحتياج' else 'أُغلق طلب الاحتياج بتنفيذ جزئي' end else 'تحديث طلب الاحتياج' end$x$);
  if d not like '%closed_partial%' then raise exception 'action patch failed'; end if;
  execute d;
  d := pg_get_functiondef('public.pc_need_get(uuid)'::regprocedure);
  d := replace(d, $x$'lines', _pc_need_lines_json(_id),$x$, $x$'lines', _pc_need_lines_json(_id), 'net_spent', _pc_need_net(_id),$x$);
  if d not like '%net_spent%' then raise exception 'get patch failed'; end if;
  execute d;
end $$;

revoke all on function public._pc_need_used_excl(uuid,uuid), public._pc_need_net(uuid), public._pc_need_corr_trg() from public, anon, authenticated;
revoke all on table public.pc_need_lines from anon, authenticated;
alter table public.pc_need_lines enable row level security;