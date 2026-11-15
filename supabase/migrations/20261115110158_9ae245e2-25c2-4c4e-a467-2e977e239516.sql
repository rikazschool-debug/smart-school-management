create or replace function public._family_request_guard() returns trigger language plpgsql set search_path=public as $$ begin
if new.kind not in ('mother_account','withdrawal','data_change','other') or length(trim(new.body))<3 or length(new.body)>10000 then raise exception 'بيانات الطلب غير صالحة'; end if;
if new.status not in ('processing','accepted','rejected') then raise exception 'حالة غير صالحة'; end if;
if tg_op='INSERT' then new.requested_by:=auth.uid(); new.status:='processing'; new.response:=null; new.rejection_reason:=null; new.decided_by:=null; new.decided_at:=null;
else
if (new.id,new.ref,new.org_id,new.school_id,new.student_id,new.requested_by,new.kind,new.body,new.created_at) is distinct from (old.id,old.ref,old.org_id,old.school_id,old.student_id,old.requested_by,old.kind,old.body,old.created_at) then raise exception 'لا يسمح بتغيير هوية أو نطاق الطلب'; end if;
if old.status<>'processing' then raise exception 'تمت معالجة الطلب بالفعل'; end if;
if new.status='rejected' and length(trim(coalesce(new.rejection_reason,'')))<3 then raise exception 'سبب الرفض مطلوب'; end if;
if new.status in ('accepted','rejected') and length(trim(coalesce(new.response,'')))<3 then raise exception 'رد الإدارة مطلوب'; end if;
new.decided_by:=auth.uid(); new.decided_at:=now(); end if; new.updated_at:=now(); return new; end $$;
revoke all on function public._family_request_guard() from public,anon,authenticated;