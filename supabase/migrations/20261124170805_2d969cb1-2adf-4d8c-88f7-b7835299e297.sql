-- Guardian finance: keep showing a child who left (withdrawn/graduated/not renewed) while a balance or credit is still open.
create or replace function public.sf_family(_year text default null) returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
 declare r jsonb:='[]'; st record; yk text; y uuid; begin
 if auth.uid() is null then raise exception 'غير مصرح' using errcode='42501'; end if;
 for st in select distinct s.id,s.school_id,s.full_name from students s join student_guardians sg on sg.student_id=s.id and sg.verified and sg.can_follow join guardians g on g.id=sg.guardian_id and g.user_id=auth.uid() join schools sc on sc.id=s.school_id and sc.is_active and section_enabled(sc.org_id,'finance')
   where s.status='active' or exists(select 1 from sf_obligations b where b.student_id=s.id and b.status<>'void' and ((_sf_balance(b.id)->>'remaining')::numeric>0 or (_sf_balance(b.id)->>'credit')::numeric>0)) order by s.full_name loop
  yk:=coalesce(_year,(select name from academic_years where school_id=st.school_id and is_current order by start_date desc limit 1),(select name from academic_years where school_id=st.school_id order by start_date desc limit 1));
  y:=(select id from academic_years where school_id=st.school_id and name=yk limit 1);
  r:=r||jsonb_build_array(sf_get(st.id,y)||jsonb_build_object('year_key',yk,'year_missing',y is null));
 end loop;
 return jsonb_build_object('children',r,'years',coalesce((select jsonb_agg(distinct (x->>'name')) from jsonb_array_elements(r) c cross join lateral jsonb_array_elements(c->'years') x),'[]'),'year',_year); end$function$;