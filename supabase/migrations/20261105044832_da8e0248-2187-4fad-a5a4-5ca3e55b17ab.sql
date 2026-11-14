do $do$
declare d text;
begin
  d := pg_get_functiondef((select oid from pg_proc where proname='hr_doc_upload_start' and pronamespace='public'::regnamespace));
  if position('elsif cid is not null then update hr_documents set contract_id=cid where id=d.id;' in d) = 0 then raise exception 'pattern not found'; end if;
  d := replace(d, 'elsif cid is not null then update hr_documents set contract_id=cid where id=d.id;',
    'elsif cid is not null and d.accepted_version is null then update hr_documents set contract_id=cid where id=d.id; -- never re-link an accepted document before its new version is accepted');
  execute d;
end $do$;