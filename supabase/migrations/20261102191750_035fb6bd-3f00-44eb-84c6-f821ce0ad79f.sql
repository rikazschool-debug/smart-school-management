create or replace function public._tt_unav_on(_teacher uuid, _day integer, _period uuid, _date date)
returns text language plpgsql stable security definer set search_path to 'public' as $function$
declare u record; les uuid[]; n int; dn text[] := array['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت']; lbl text; begin
  for u in select * from teacher_unavailability x where x.teacher_id=_teacher and (x.day is null or x.day=_day) and x.hard
           and (x.valid_to is null or x.valid_to >= _date) and (x.valid_from is null or x.valid_from <= _date) loop
    if les is null then les := _tt_day_lessons((select school_id from teachers where id=_teacher), _day); n := coalesce(array_length(les,1),0); end if;
    lbl := case u.kind when 'day' then 'لا يدرّس يوم ' || dn[_day+1] when 'period' then 'غير متاح في هذه الحصة' when 'first' then 'لا يدرّس أول حصة' when 'last' then 'لا يدرّس آخر حصة' else 'لا يدرّس آخر حصتين' end;
    if u.kind='day' or (u.kind='period' and u.period_id=_period) or (u.kind='first' and n>0 and les[1]=_period)
       or (u.kind='last' and n>0 and les[n]=_period) or (u.kind='last2' and n>0 and (les[n]=_period or (n>1 and les[n-1]=_period))) then
      return lbl || coalesce(' (' || nullif(btrim(u.reason),'') || ')', '');
    end if;
  end loop;
  return null; end $function$;
revoke all on function public._tt_unav_on(uuid, integer, uuid, date) from public, anon, authenticated;