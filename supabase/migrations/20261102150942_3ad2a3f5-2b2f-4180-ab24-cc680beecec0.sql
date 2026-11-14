create or replace function public.adm_party_names(_entity text, _id uuid)
returns table(user_id uuid, full_name text)
language sql stable security definer set search_path=public as $$
  with ids as (
    select unnest(array[t.assignee, t.assigner] || coalesce(t.participants,'{}')) u from adm_tasks t where _entity='task' and t.id=_id
    union select unnest(array[r.submitted_by, r.handler_user]) from adm_requests r where _entity='request' and r.id=_id
    union select e.actor from adm_events e where e.entity=_entity and e.entity_id=_id
    union select f.uploaded_by from files f where f.source_type='admin' and f.source_id=_id
  )
  select i.u, p.full_name from ids i join profiles p on p.id=i.u
  where i.u is not null and _entity in ('task','request') and _adm_can_read(_entity, _id)
$$;
revoke all on function public.adm_party_names(text, uuid) from public, anon;
grant execute on function public.adm_party_names(text, uuid) to authenticated;