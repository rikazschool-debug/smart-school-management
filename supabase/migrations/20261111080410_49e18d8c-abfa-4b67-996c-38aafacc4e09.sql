CREATE OR REPLACE FUNCTION public.wa_bot_choices() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
declare o uuid := _wa_org();
begin
  if not _wa_can(o) then raise exception 'forbidden'; end if;
  return jsonb_build_object(
    'choices', coalesce((select jsonb_agg(jsonb_build_object('key', g.key, 'id', g.id, 'title', g.title, 'count', g.n, 'last_at', g.last_at,
          'link', (select jsonb_build_object('school_id', b.school_id, 'school', s.name) from wa_bot_branches b join schools s on s.id=b.school_id where b.org_id=o and b.choice_key=g.key))
        order by g.n desc) from (
        select coalesce(m.choice_id, 't:'||_wa_norm(m.choice_title)) as key, max(m.choice_id) as id, max(m.choice_title) as title, count(*) as n, max(coalesce(m.wa_at,m.created_at)) as last_at
        from wa_messages m join wa_conversations c on c.id=m.conversation_id
        where c.org_id=o and m.direction='in' and m.choice_title is not null
        group by 1) g), '[]'::jsonb),
    'links', coalesce((select jsonb_agg(jsonb_build_object('key', b.choice_key, 'id', b.choice_id, 'title', b.choice_title, 'school_id', b.school_id, 'school', s.name))
        from wa_bot_branches b join schools s on s.id=b.school_id where b.org_id=o), '[]'::jsonb),
    'schools', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) order by s.name) from schools s where s.org_id=o and s.is_active), '[]'::jsonb));
end $$;