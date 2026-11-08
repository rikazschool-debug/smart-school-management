create or replace function pg_temp.patch(_fn regprocedure, _pairs text[]) returns void language plpgsql as $$
declare d text := pg_get_functiondef(_fn); i int; begin
  for i in 1 .. array_length(_pairs, 1) / 2 loop
    if position(_pairs[2*i-1] in d) = 0 then raise exception 'patch anchor not found in %: %', _fn, left(_pairs[2*i-1], 60); end if;
    d := replace(d, _pairs[2*i-1], _pairs[2*i]);
  end loop;
  execute d;
end $$;
select pg_temp.patch('public._evt_file_slot(evt_items,jsonb,text,uuid,text,text,bigint)', array[
  $a$'evt_pending', _item.id, _key, _user);$a$, $a$'evt_pending', _item.id, _key, coalesce(_user, _item.created_by));$a$]);
select pg_temp.patch('public._evt_app_files_trg()', array[
  $a$and (fr.uploaded_by is null or fr.uploaded_by = new.applicant_user))) then$a$,
  $a$and (case when new.applicant_user is null then new.source = 'link' else fr.uploaded_by = new.applicant_user end))) then$a$]);