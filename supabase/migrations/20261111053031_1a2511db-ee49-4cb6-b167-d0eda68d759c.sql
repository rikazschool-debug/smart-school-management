with b as (select id, org_id from schools where name='مدارس الضاحية الأهلية للبنات' limit 1),
mv as (
  select distinct m.id, m.school_id old_school from memberships m
  join hr_employees e on e.user_id=m.user_id
  join hr_assignments a on a.employee_id=e.id and (a.end_date is null or a.end_date>=current_date)
  join b on a.school_id=b.id
  where m.is_active and m.role not in ('student','guardian') and m.school_id<>b.id
    and not exists (select 1 from memberships m2 where m2.user_id=m.user_id and m2.school_id=b.id and m2.role=m.role)
),
up as (update memberships m set school_id=(select id from b) from mv where m.id=mv.id returning m.id, m.user_id, mv.old_school)
insert into access_audit(org_id, school_id, action, target_user, target_membership, before, after, reason)
select (select org_id from b), (select id from b), 'membership_branch_fix', up.user_id, up.id,
  jsonb_build_object('school_id', up.old_school), jsonb_build_object('school_id',(select id from b)),
  'مطابقة فرع حساب الدخول مع ملف الموارد البشرية (طلب المالك)'
from up;