do $$
declare d text := pg_get_functiondef('public._hr_assignment_save_base(uuid,uuid,jsonb,text)'::regprocedure);
begin
  d := replace(d, $o$if sch is null or sd is null then raise exception 'المدرسة وتاريخ البداية مطلوبان'; end if;$o$,
 $n$if sd is null then raise exception 'تاريخ البداية مطلوب'; end if;
  if sch is null and coalesce(_p->>'central','') <> 'true' then raise exception 'اختر المدرسة أو الإدارة المركزية'; end if;
  if sch is null and not _hr_org_ok(e.org_id,'edit') then raise exception 'التعيين في الإدارة المركزية يحتاج صلاحية على مستوى المجموعة' using errcode='42501'; end if;$n$);
  d := replace(d, $o$if school_org(sch) is distinct from e.org_id then$o$, $n$if sch is not null and school_org(sch) is distinct from e.org_id then$n$);
  d := replace(d, $o$x.school_id=sch and$o$, $n$x.school_id is not distinct from sch and$n$);
  if position('الإدارة المركزية' in d) = 0 then raise exception 'patch failed'; end if;
  execute d;
end $$;