do $do$
declare d text := pg_get_functiondef('public._people_pool(text,uuid,uuid,uuid)'::regprocedure);
  old text := $x$and not _mt_ok(m.user_id, m.school_id, 'bus', 'execute') and not _mt_ok(m.user_id, m.school_id, 'school', 'execute');$x$;
begin
  if position(old in d) = 0 then raise exception 'pool patch failed'; end if;
  d := replace(d, old, $x$and not _mt_ok(m.user_id, m.school_id, 'bus', 'execute') and not _mt_ok(m.user_id, m.school_id, 'school', 'execute') and (_school is null or m.school_id = _school);$x$);
  execute d;
end $do$;