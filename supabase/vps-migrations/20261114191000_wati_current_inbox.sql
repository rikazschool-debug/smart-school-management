-- VPS only. Existing historical payloads stay untouched; no replay or provider calls.
-- The runtime supplies the approved org/cutoff. The current wa_connection is the only authority.
CREATE FUNCTION public._rk_wa_ingest_live(_org uuid, _not_before timestamptz, _key text, _type text, _payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _id uuid; _received timestamptz; _done boolean; _event_at timestamptz;
BEGIN
  IF _org IS NULL OR _not_before IS NULL OR _not_before > now() + interval '5 minutes'
     OR _org IS DISTINCT FROM (SELECT org_id FROM wa_connection WHERE id='wati_main')
  THEN RAISE EXCEPTION 'wa_connection_unlinked'; END IF;
  IF _type IN ('message','message_bsuid','newContactMessageReceived') THEN
    _event_at := coalesce(_wa_ts(_payload->>'timestamp'),_wa_ts(_payload->>'created'));
    IF _event_at IS NULL OR _event_at < _not_before OR _event_at > now()+interval '5 minutes'
       OR nullif(_payload->>'conversationId','') IS NULL
    THEN RETURN jsonb_build_object('ignored',true,'code','outside_current_intake'); END IF;
  END IF;
  INSERT INTO wa_webhook_events(dedupe_key,event_type,payload) VALUES(_key,_type,_payload)
  ON CONFLICT(dedupe_key) DO NOTHING RETURNING id,received_at INTO _id,_received;
  IF _id IS NULL THEN
    SELECT id,received_at INTO _id,_received FROM wa_webhook_events WHERE dedupe_key=_key;
  END IF;
  IF _received < _not_before THEN RETURN jsonb_build_object('ignored',true,'code','historical_event_held'); END IF;
  _done := _wa_process(_id);
  -- Intentionally no _wa_recover: receiving a new event must never process an old backlog.
  RETURN jsonb_build_object('id',_id,'done',_done);
END $$;
REVOKE ALL ON FUNCTION public._rk_wa_ingest_live(uuid,timestamptz,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._rk_wa_ingest_live(uuid,timestamptz,text,text,jsonb) TO service_role;
