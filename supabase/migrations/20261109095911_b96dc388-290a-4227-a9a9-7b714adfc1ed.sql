create or replace function public._mq_rec_consume(_token text) returns jsonb language plpgsql security definer set search_path=public as $$
declare t mq_rec_tokens; c mq_calls; ok boolean; begin
  select * into t from mq_rec_tokens where token=_token for update;
  if t.token is null or t.expires_at < now() or (t.mode='download' and t.used_at is not null) then return jsonb_build_object('ok',false); end if;
  select * into c from mq_calls where id=t.call_id;
  perform set_config('request.jwt.claims', jsonb_build_object('sub',t.user_id,'role','authenticated')::text, true);
  ok := _mq_can(c, t.mode);
  if not ok then return jsonb_build_object('ok',false); end if;
  update mq_rec_tokens set used_at=coalesce(used_at,now()) where token=_token;
  return jsonb_build_object('ok',true,'ext_id',c.ext_id,'mode',t.mode,'org',c.org_id,'base',(select base_url from mq_link where org_id=c.org_id));
end $$;
revoke all on function public._mq_rec_consume(text) from public, anon, authenticated;