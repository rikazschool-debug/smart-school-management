create or replace function public.gv_settings_save(_school uuid, _p jsonb) returns void
language plpgsql security definer set search_path to 'public' as $$
declare d int[]; st time; en time; sm int; begin
  if not _gv_ok(_school,'settings') then raise exception 'ضبط المواعيد لمن يملك صلاحية الإعدادات' using errcode='42501'; end if;
  d := coalesce((select array_agg(distinct x::int order by x::int) from jsonb_array_elements_text(coalesce(_p->'days','[]')) x), '{}');
  if array_length(d,1) is null or exists(select 1 from unnest(d) x where x < 0 or x > 6) then raise exception 'اختر يومًا واحدًا على الأقل'; end if;
  st := (_p->>'start_time')::time; en := (_p->>'end_time')::time; sm := (_p->>'slot_minutes')::int;
  if st is null or en is null or en <= st then raise exception 'وقت النهاية يجب أن يكون بعد البداية'; end if;
  if sm is null or sm < 10 or sm > 120 then raise exception 'مدة الخانة بين 10 و120 دقيقة'; end if;
  if st + make_interval(mins => sm) > en then raise exception 'الفترة أقصر من خانة واحدة'; end if;
  insert into gv_settings(school_id, enabled, days, start_time, end_time, slot_minutes, updated_by, updated_at)
    values (_school, coalesce((_p->>'enabled')::boolean, true), d, st, en, sm, auth.uid(), now())
    on conflict (school_id) do update set enabled=excluded.enabled, days=excluded.days, start_time=excluded.start_time, end_time=excluded.end_time,
      slot_minutes=excluded.slot_minutes, updated_by=excluded.updated_by, updated_at=now();
end $$;