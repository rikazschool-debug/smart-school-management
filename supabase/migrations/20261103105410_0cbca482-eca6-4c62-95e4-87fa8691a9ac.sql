do $do$
declare d text; old text := $x$if b.book <= st.low_balance then perform _pc_notify(c.holder_id, c.school_id, 'انخفض رصيد العهدة', c.ref || ' — الرصيد ' || b.book || ' ريال', 'pc-low:' || c.id || ':' || _pc_today()); end if;$x$;
begin
  d := pg_get_functiondef('public.pc_expense_action(uuid,text,int,text)'::regprocedure);
  if position(old in d) > 0 then
    d := replace(d, old, 'null;');
    execute d;
  end if;
end $do$;