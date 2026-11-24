create or replace function public._sf_due_reactivate() returns trigger language plpgsql security definer set search_path=public as $$begin
 if new.due_date is null and new.price_id is not null and old.status='void' and new.status='pending' then
  select case when new.term=1 then p.due1 else p.due2 end into new.due_date from sf_prices p where p.id=new.price_id;
 end if; return new; end$$;
drop trigger if exists sf_obligations_due_reactivate on public.sf_obligations;
create trigger sf_obligations_due_reactivate before update on public.sf_obligations for each row execute function public._sf_due_reactivate();
revoke all on function public._sf_due_reactivate() from public,anon,authenticated;