do $do$
declare d text := pg_get_functiondef('public.pc_expense_action'::regproc);
  old text := $x$    if not _pc_ok(e.org_id, me, 'approve', e.school_id, null, null) then raise exception 'لا تملك صلاحية الاعتماد لهذا الفرع' using errcode='42501'; end if;
    lim := _pc_limit(e.org_id, me);$x$;
begin
  if position(old in d) = 0 then raise exception 'patch failed'; end if;
  d := replace(d, old, $x$    if not _pc_ok(e.org_id, me, 'approve', e.school_id, null, null) then raise exception 'لا تملك صلاحية الاعتماد لهذا الفرع' using errcode='42501'; end if;
    if nfiles = 0 and length(btrim(coalesce(_reason,''))) < 3 then raise exception 'اعتماد مصروف بلا مرفق يتطلب سببك للموافقة على الاستثناء'; end if;
    lim := _pc_limit(e.org_id, me);$x$);
  execute d;
end $do$;