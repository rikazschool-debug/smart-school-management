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
-- Six November 17 migrations: run on synthetic fixtures only, inside this rolled-back sandbox.
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
INSERT INTO user_active_context(user_id,org_id,school_id,role) VALUES
('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','org_owner')
ON CONFLICT(user_id) DO UPDATE SET org_id=excluded.org_id,school_id=excluded.school_id,role=excluded.role;
SELECT pg_temp.verify(_co_ok('20000000-0000-4000-8000-000000000001'),'collaboration permits owner in matching branch context');
SELECT pg_temp.verify(NOT _co_ok('20000000-0000-4000-8000-000000000002'),'collaboration denies foreign organization');
SELECT pg_temp.verify(_perm_valid('gifted_care','view','branch') AND _perm_valid('school_map','edit','org'),'new catalog entries can be delegated');
SELECT pg_temp.verify(NOT _perm_valid('school_map','delete_everything','org'),'unsupported map action denied');
SELECT pg_temp.verify(jsonb_typeof(perm_effective('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001')->'effective')='array','optimized permission result preserves public contract');
SELECT pg_temp.verify(jsonb_array_length(support_topics())=8,'support topic catalog complete');
SELECT pg_temp.verify(NOT has_function_privilege('anon','support_submit(jsonb)','execute') AND NOT has_function_privilege('anon','support_list_details(jsonb)','execute') AND NOT has_function_privilege('anon','support_topics()','execute'),'new support RPCs deny anonymous callers');
SELECT pg_temp.verify(has_function_privilege('authenticated','support_submit(jsonb)','execute') AND NOT has_function_privilege('authenticated','_support_contact_check()','execute'),'support capability uses public RPC, not trigger execution');
DO $$ DECLARE t uuid; t2 uuid; payload jsonb; BEGIN
 payload:=jsonb_build_object('mode','own','scope','school','school','30000000-0000-4000-8000-000000000001','title','QA support contact','body','Synthetic isolated support check','priority','normal','client_key','qa-six-support','contact_name','Synthetic contact','contact_phone','+966500000009','topic','attendance','subtopic','الاستفسار عن تأخر أو غياب الطالب');
 t:=support_submit(payload);t2:=support_submit(payload);
 PERFORM pg_temp.verify(t=t2,'support client key prevents duplicate ticket');
 PERFORM pg_temp.verify((SELECT contact_name='Synthetic contact' AND contact_phone='+966500000009' AND topic='attendance' FROM support_tickets WHERE id=t),'contact fields persisted on authorized ticket');
 PERFORM pg_temp.verify(EXISTS(SELECT 1 FROM jsonb_array_elements(support_list_details(jsonb_build_object('_box','mine','_school','30000000-0000-4000-8000-000000000001'))) r WHERE r->>'id'=t::text AND r->>'contact_name'='Synthetic contact'),'scoped support list exposes new fields');
 BEGIN
  PERFORM support_submit(payload||jsonb_build_object('client_key','qa-six-bad-phone','contact_phone','not-a-phone'));
  RAISE EXCEPTION 'QA invalid phone unexpectedly accepted';
 EXCEPTION WHEN OTHERS THEN
  IF SQLERRM<>'اكتب رقم هاتف صحيحًا من 7 إلى 15 رقمًا' THEN RAISE; END IF;
 END;
END $$;
INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data) VALUES('10000000-0000-4000-8000-000000000003','staff@six-qa.invalid','{}','{"full_name":"Synthetic Staff Six"}');
DO $$ DECLARE m uuid; BEGIN
 INSERT INTO memberships(user_id,org_id,school_id,role) VALUES('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','counselor') RETURNING id INTO m;
 PERFORM change_member_role(m,'teacher');PERFORM change_member_role(m,'teacher');
 PERFORM pg_temp.verify((SELECT count(*)=1 FROM teachers WHERE user_id='10000000-0000-4000-8000-000000000003' AND school_id='30000000-0000-4000-8000-000000000001'),'role change creates exactly one same-login teacher');
END $$;
SELECT jsonb_build_object('passed',true,'current_inbox',true,'historical_events_held',true,'duplicate_blocked',true,'cross_org_denied',true,'maqsam_setup_without_calls',true,'scheduled_commands',15,'collaboration_context',true,'support_contacts',true,'teacher_record_idempotency',true,'network','none','transaction_rolled_back',true);
ROLLBACK;
