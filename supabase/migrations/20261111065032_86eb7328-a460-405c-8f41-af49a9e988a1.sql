do $$ declare d text := pg_get_functiondef('public.wa_contact_card(uuid)'::regprocedure);
begin d := replace(d, $o$'by', _adm_name(n.author)$o$, $n$'by', coalesce(nullif(_adm_name(n.author),''), (select email from auth.users where id=n.author), 'موظف')$n$);
  if position('coalesce(nullif(_adm_name(n.author)' in d)=0 then raise exception 'patch failed'; end if; execute d; end $$;