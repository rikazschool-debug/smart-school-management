alter function public._perm_valid(text,text,text) rename to _perm_valid_pre332;
create function public._perm_valid(_section text,_action text,_scope text) returns boolean language sql immutable set search_path=public as $$ select case when _section='people_family' then _action in ('view','edit','place') and (_scope is null or _scope in ('branch','org')) else _perm_valid_pre332(_section,_action,_scope) end $$;
revoke all on function public._perm_valid(text,text,text) from public,anon;
grant execute on function public._perm_valid(text,text,text) to authenticated,service_role;
create or replace function public.perm_catalog() returns jsonb language sql stable security definer set search_path=public as $$
select jsonb_set(b,'{sections}', (select jsonb_agg(case
 when s->>'key'='people_family' then jsonb_set(jsonb_set(s,'{actions}',s->'actions'||'["place"]'::jsonb),'{labels}',(s->'labels')||jsonb_build_object('place','تسكين الطلاب ونقلهم بين الشعب دون تعديل ملفاتهم','edit','إضافة الطلاب وأولياء الأمور والربط وتعديل ملفاتهم (يشمل التسكين ما لم يُمنع)'))
 when s->>'key'='people' then jsonb_set(s,'{label}',to_jsonb('الوسوم وبطاقات الأشخاص والملاحظات'::text))
 when s->>'key'='school_schedule' then s||jsonb_build_object('children',jsonb_build_array('عرض الجدول المنشور لكل المدرسة — قابل للتفويض','إعدادات الجدول والتوليد وتعديل المسودة والنشر — للمالك ومدير المدرسة فقط'))
 when s->>'key'='bt_schedule' then s||jsonb_build_object('locked_reason','عرض حسب نطاق الدور الأساسي؛ لا يُمنح من قالب، ويمكن إيقافه للموظف.')
 when s->>'key' like 'bt\_%' then s||jsonb_build_object('locked_reason','مرتبط بالدور الأساسي وتكليفاته؛ لا يُمنح من قالب، ويمكن إيقافه للموظف.')
 else s end order by o) from jsonb_array_elements(b->'sections') with ordinality t(s,o))||jsonb_build_array(
 jsonb_build_object('key','academic_setup_info','label','الإعداد الأكاديمي','parent','school_admin','actions','[]'::jsonb,'scopes','[]'::jsonb,'locked_reason','الإدارة للمالك ومدير المدرسة؛ ليست صلاحية قابلة للتفويض حاليًا.','children',jsonb_build_array('السنوات والفصول الدراسية','المراحل والصفوف','الشعب','الأقسام والمواد','نطاق الوكلاء والمشرفين')),
 jsonb_build_object('key','course_assignments_info','label','المقررات والتكليفات','parent','school_admin','actions','[]'::jsonb,'scopes','[]'::jsonb,'locked_reason','الإدارة والاعتماد للمالك ومدير المدرسة؛ العرض وطلبات التكليف حسب الدور والنطاق الحالي.','children',jsonb_build_array('المقررات','تكليفات المعلمين','طلب التكليف','اعتماد التكليف وإنهاؤه')),
 jsonb_build_object('key','admin_work_info','label','التكليفات والطلبات','parent','school_admin','actions','[]'::jsonb,'scopes','[]'::jsonb,'locked_reason','تتبع الدور ونطاق التكليف والمشاركة؛ لا تمنح هذه القائمة وصولًا إضافيًا.','children',jsonb_build_array('التكليفات — المدير والوكيل والمشرف حسب نطاقهم','الطلبات — مقدم الطلب والمعالج المخول','تقديم طلب — موظفو المدرسة','إعداد النماذج — مدير المدرسة','المناوبات — حسب الدور والنطاق')),
 jsonb_build_object('key','results_info','label','النتائج','parent','school_admin','actions','[]'::jsonb,'scopes','[]'::jsonb,'locked_reason','العرض حسب المقرر والدور؛ رصد الدرجة لمعلم المقرر فقط.','children',jsonb_build_array('نتائج الواجبات والاختبارات','أرشيف الدرجات الفصلية — قراءة فقط'))))
from (select _perm_catalog_v19() b offset 0) x $$;
create function public.can_place_students(_school uuid) returns boolean language sql stable security definer set search_path=public as $$
select coalesce(exists(select 1 from schools where id=_school and is_active) and (is_org_owner(school_org(_school)) or (not _perm_denied(school_org(_school),auth.uid(),'people_family','place') and (can_edit_students(_school) or perm_allows(_school,'people_family','place')))),false) $$;
revoke all on function public.can_place_students(uuid) from public,anon;
grant execute on function public.can_place_students(uuid) to authenticated,service_role;
create function public.student_place(_student uuid,_section uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare st students; sc sections; current_id uuid; result_id uuid; old_section uuid;
begin
 if auth.uid() is null then raise exception 'غير مصرح' using errcode='42501'; end if;
 select * into st from students where id=_student for update;
 if st.id is null or not can_place_students(st.school_id) then raise exception 'ليست لديك صلاحية تسكين الطالب' using errcode='42501'; end if;
 select * into sc from sections where id=_section;
 if sc.id is null or sc.school_id<>st.school_id then raise exception 'الطالب والشعبة يجب أن يكونا في نفس المدرسة'; end if;
 select id,section_id into current_id,old_section from enrollments where student_id=st.id and year_id=sc.year_id and status='active' for update;
 if current_id is not null and old_section=sc.id then return current_id; end if;
 perform 1 from sections where id=sc.id or id=old_section order by id for update;
 if current_id is not null then update enrollments set status='ended',end_date=school_today() where id=current_id; end if;
 insert into enrollments(school_id,student_id,section_id,year_id,start_date) values(st.school_id,st.id,sc.id,sc.year_id,school_today()) returning id into result_id;
 perform _access_audit(school_org(st.school_id),st.school_id,'student_placement',st.user_id,null,null,jsonb_build_object('section',old_section),jsonb_build_object('student',st.id,'section',sc.id,'enrollment',result_id),'تسكين الطالب');
 return result_id;
end $$;
revoke all on function public.student_place(uuid,uuid) from public,anon;
grant execute on function public.student_place(uuid,uuid) to authenticated,service_role;
alter policy "enr insert" on public.enrollments with check (can_place_students(school_id));
alter policy "enr update" on public.enrollments using (can_place_students(school_id)) with check (can_place_students(school_id));