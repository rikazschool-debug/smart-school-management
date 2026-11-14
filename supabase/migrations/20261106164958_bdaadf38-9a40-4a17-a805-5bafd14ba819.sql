do $$ declare d text; begin
  d := pg_get_functiondef('public.support_action(uuid,text,integer,text,text)'::regprocedure);
  if position($q$from support_route_candidates(t.school_id, null, null, t.id) p where p.user_id=nu$q$ in d) = 0 then raise exception 'revert failed'; end if;
  d := replace(d, $q$from support_route_candidates(t.school_id, null, null, t.id) p where p.user_id=nu$q$, $q$from _people_pool('support_assign', t.school_id, null, t.id) p where p.user_id=nu$q$);
  d := replace(d, $q$لا يمكن الإسناد لهذا الشخص (خارج فرع التذكرة أو موقوف)$q$, $q$لا يمكن الإسناد لهذا الشخص (خارج المؤسسة أو موقوف)$q$);
  execute d;
end $$;