create or replace function public._hr_login_follow_trg() returns trigger
language plpgsql security definer set search_path=public as $$
declare u uuid; m record;
begin
  if new.school_id is null or not coalesce(new.is_primary,false) then return new; end if;
  if new.start_date is not null and new.start_date > current_date then return new; end if;
  if new.end_date is not null and new.end_date < current_date then return new; end if;
  if tg_op='UPDATE' and old.school_id is not distinct from new.school_id and old.is_primary is not distinct from new.is_primary then return new; end if;
  select user_id into u from hr_employees where id=new.employee_id;
  if u is null then return new; end if;
  for m in select * from memberships x join schools s on s.id=x.school_id
           where x.user_id=u and s.org_id=new.org_id and x.school_id<>new.school_id
             and x.role not in ('student','guardian','org_owner') loop
    if exists(select 1 from memberships y where y.user_id=u and y.school_id=new.school_id and y.role=m.role) then
      update memberships set is_active=false where id=m.id;
    else
      update memberships set school_id=new.school_id where id=m.id;
    end if;
    insert into access_audit(org_id, school_id, actor, action, target_user, target_membership, before, after, reason)
    values (new.org_id, new.school_id, auth.uid(), 'membership_follow_hr', u, m.id,
      jsonb_build_object('school_id', m.school_id, 'role', m.role), jsonb_build_object('school_id', new.school_id),
      'نقل حساب الدخول تلقائيًا مع تعيين الموارد البشرية');
  end loop;
  return new;
end $$;
revoke all on function public._hr_login_follow_trg() from public, anon, authenticated;
drop trigger if exists hr_login_follow on public.hr_assignments;
create trigger hr_login_follow after insert or update of school_id, is_primary, start_date, end_date on public.hr_assignments
for each row execute function public._hr_login_follow_trg();