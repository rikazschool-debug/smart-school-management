alter table public.files drop constraint files_source_type_check;
alter table public.files add constraint files_source_type_check check (source_type = any (array['post','message','message_pending','circular','cleanup_due','homework','submission','feedback','pickup','admin','support']));
create or replace function public._support_org_defaults() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into support_categories(org_id, name, sort) select new.id, x.n, x.s from (values ('تقني',1),('أكاديمي',2),('إداري',3),('الحساب والدخول',4),('أخرى',9)) x(n,s);
  return new;
end $$;
revoke all on function public._support_org_defaults() from public, anon, authenticated;
create trigger support_org_defaults after insert on public.organizations for each row execute function public._support_org_defaults();