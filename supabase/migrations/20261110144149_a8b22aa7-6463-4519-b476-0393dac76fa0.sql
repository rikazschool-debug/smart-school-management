create or replace function public._idl_student(_nid text, _csmart text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n text := _idl_nid(_nid); s text := coalesce(_csmart_exact(_csmart),''); h text; fails int; uids uuid[];
begin
  h := _idl_hash(coalesce(n,''));
  select count(*) into fails from id_login_failures where kind = 'student' and key_hash = h and created_at > now() - interval '15 minutes';
  if fails >= 5 then return jsonb_build_object('error','locked'); end if;
  if n is not null and s <> '' then
    -- linked accounts, plus a newly created account still waiting for its first sign-in (account_setup; the student
    -- record is linked only when that step completes, and the app keeps all data closed until then)
    select array_agg(distinct x.uid) into uids from (
      select st.user_id uid from students st
       where _idl_nid(st.national_id) = n and _csmart_exact(st.csmart_no) = s
         and st.user_id is not null and coalesce(st.status,'active') not in ('withdrawn','inactive')
      union
      select a.user_id from account_setup a join students st on st.id = a.subject_id
       where a.kind = 'student' and a.completed_at is null and st.user_id is null
         and _idl_nid(st.national_id) = n and _csmart_exact(st.csmart_no) = s
         and coalesce(st.status,'active') not in ('withdrawn','inactive')
    ) x;
  end if;
  if coalesce(array_length(uids,1),0) <> 1 then
    insert into id_login_failures(kind, key_hash) values ('student', h);
    return jsonb_build_object('error', case when fails + 1 >= 5 then 'locked' else 'mismatch' end);
  end if;
  delete from id_login_failures where kind = 'student' and key_hash = h;
  return jsonb_build_object('user_id', uids[1]);
end $$;
revoke all on function public._idl_student(text, text) from public, anon, authenticated;
grant execute on function public._idl_student(text, text) to service_role;