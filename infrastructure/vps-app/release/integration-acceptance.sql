-- Executed only inside qa.Sandbox (network none). Everything, including fixtures, rolls back.
BEGIN;
CREATE FUNCTION pg_temp.verify(ok boolean, description text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'QA assertion: %',description; END IF; END $$;
INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
VALUES ('10000000-0000-4000-8000-000000000001','owner@integration.invalid','{}','{}'),
       ('10000000-0000-4000-8000-000000000002','other@integration.invalid','{}','{}');
INSERT INTO organizations(id,name,created_by) VALUES
('20000000-0000-4000-8000-000000000001','Isolated Org A','10000000-0000-4000-8000-000000000001'),
('20000000-0000-4000-8000-000000000002','Isolated Org B','10000000-0000-4000-8000-000000000002');
INSERT INTO schools(id,org_id,name) VALUES
('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Isolated A'),
('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Isolated B');
INSERT INTO memberships(user_id,org_id,role) VALUES
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','org_owner'),
('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','org_owner');
DELETE FROM wa_connection;
INSERT INTO wa_connection(id,org_id) VALUES('wati_main','20000000-0000-4000-8000-000000000001');
-- A historical event must never be recovered while processing a new one.
INSERT INTO wa_webhook_events(dedupe_key,event_type,payload,received_at)
VALUES('qa-old','message',jsonb_build_object('id','qa-old','conversationId','qa-old-chat','waId','966500000001','text','Synthetic historical','type','text','timestamp',extract(epoch from now()-interval '1 day')::bigint),now()-interval '1 day');
SELECT _rk_wa_ingest_live('20000000-0000-4000-8000-000000000001',now()-interval '1 minute','qa-new','message',jsonb_build_object('id','qa-new','conversationId','qa-current-chat','waId','966500000001','text','Synthetic current','type','text','timestamp',extract(epoch from now())::bigint));
SELECT pg_temp.verify((SELECT processed_at IS NULL AND attempts=0 FROM wa_webhook_events WHERE dedupe_key='qa-old'),'old event remains unprocessed');
SELECT pg_temp.verify((SELECT processed_at IS NOT NULL FROM wa_webhook_events WHERE dedupe_key='qa-new'),'new event is processed');
SELECT _rk_wa_ingest_live('20000000-0000-4000-8000-000000000001',now()-interval '1 minute','qa-new','message',jsonb_build_object('id','qa-new','conversationId','qa-current-chat','waId','966500000001','text','Synthetic current','type','text','timestamp',extract(epoch from now())::bigint));
SELECT pg_temp.verify((SELECT count(*)=1 FROM wa_messages WHERE wati_msg_id='qa-new'),'webhook duplicate stored once');
SELECT pg_temp.verify((SELECT unread=1 FROM wa_conversations WHERE wati_conv_id='qa-current-chat'),'duplicate does not increase unread');
SELECT pg_temp.verify(NOT EXISTS(SELECT 1 FROM wa_conversations WHERE wati_conv_id='qa-old-chat'),'history not imported');
SELECT pg_temp.verify((_rk_wa_ingest_live('20000000-0000-4000-8000-000000000001',now()-interval '1 minute','qa-old','message',jsonb_build_object('id','qa-old','conversationId','qa-old-chat','timestamp',extract(epoch from now())::bigint))->>'code')='historical_event_held','old receipt stays held even after provider retry');
SELECT pg_temp.verify((_rk_wa_ingest_live('20000000-0000-4000-8000-000000000001',now()-interval '1 minute','qa-backfill','message',jsonb_build_object('id','qa-backfill','conversationId','qa-backfill-chat','timestamp',extract(epoch from now()-interval '1 day')::bigint))->>'code')='outside_current_intake','provider history rejected');
SELECT pg_temp.verify(NOT has_function_privilege('anon','_rk_wa_ingest_live(uuid,timestamp with time zone,text,text,jsonb)','execute') AND NOT has_function_privilege('authenticated','_rk_wa_ingest_live(uuid,timestamp with time zone,text,text,jsonb)','execute'),'inbox ingest service-only');
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SELECT pg_temp.verify(wa_org_ok('20000000-0000-4000-8000-000000000001'),'linked owner has inbox access');
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
SELECT pg_temp.verify(NOT wa_org_ok('20000000-0000-4000-8000-000000000001'),'other organization has no inbox access');
-- Registering a number uses the existing registry; no call is required or created.
INSERT INTO mq_link(org_id,enabled)VALUES('20000000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
SELECT mq_number_register('20000000-0000-4000-8000-000000000001','+966500000002','30000000-0000-4000-8000-000000000001','Synthetic service');
SELECT mq_number_register('20000000-0000-4000-8000-000000000001','966500000002',NULL,NULL);
SELECT pg_temp.verify((SELECT count(*)=1 AND bool_and(school_id='30000000-0000-4000-8000-000000000001') FROM mq_numbers WHERE org_id='20000000-0000-4000-8000-000000000001'),'number setup idempotent and preserves existing mapping');
DO $$ BEGIN
 BEGIN PERFORM mq_number_register('20000000-0000-4000-8000-000000000001','966500000003','30000000-0000-4000-8000-000000000002'); RAISE EXCEPTION 'cross-org school accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
 BEGIN PERFORM mq_number_register('20000000-0000-4000-8000-000000000001','966500000003'); RAISE EXCEPTION 'other owner accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT pg_temp.verify(NOT EXISTS(SELECT 1 FROM mq_calls),'number setup creates no calls');
-- Exact existing scheduled commands, on a clean synthetic database and with cron off.
SELECT run_file_cleanup(); SELECT check_cleanup_health();
SELECT hw_tick(); SELECT support_sla_tick(); SELECT ev_monthly_tick(); SELECT mq_followup_tick();
SELECT att_tick(); SELECT adm_daily_reminders(); SELECT pc_alerts_tick(); SELECT mt_alerts_tick();
SELECT ad_alerts_tick(); SELECT hr_contract_alerts_tick(); SELECT hr_doc_alerts_tick(); SELECT hr_in_alerts_tick(); SELECT sanad_alerts_tick();
SELECT pg_temp.verify(NOT EXISTS(SELECT 1 FROM acct_outbox) AND NOT EXISTS(SELECT 1 FROM evt_outbox),'scheduled commands do not enqueue external historical messages');
SELECT pg_temp.verify(current_setting('cron.launch_active_jobs')='off','QA scheduler remains off');
SELECT jsonb_build_object('passed',true,'current_inbox',true,'historical_events_held',true,'duplicate_blocked',true,'cross_org_denied',true,'maqsam_setup_without_calls',true,'scheduled_commands',15,'network','none','transaction_rolled_back',true);
ROLLBACK;
