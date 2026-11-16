create or replace function public._org_catalog_dup_guard() returns trigger language plpgsql set search_path=public as $$
declare _n text := btrim(regexp_replace(new.name,'\s+',' ','g'));
begin
  if _n = '' then raise exception 'الاسم مطلوب'; end if;
  new.name := _n;
  if exists(select 1 from academic_catalog c where c.kind=new.kind and btrim(c.name)=_n and (new.kind<>'grade' or c.stage is not distinct from new.stage))
     or exists(select 1 from org_academic_catalog c where c.org_id=new.org_id and c.id<>new.id and c.kind=new.kind and btrim(c.name)=_n and (new.kind<>'grade' or c.stage is not distinct from new.stage)) then
    raise exception 'هذا الاسم موجود مسبقًا في القائمة';
  end if;
  return new;
end $$;
create trigger org_catalog_dup_guard before insert or update of name, stage, kind on public.org_academic_catalog for each row execute function public._org_catalog_dup_guard();