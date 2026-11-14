import copy,hashlib,json,pathlib,tempfile,unittest
from policy import *
from server import coordinate,deployment_lock

class ReleasePolicyTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.temp.name)
        (self.root/'supabase/migrations').mkdir(parents=True);(self.root/'infrastructure/vps-app/baseline').mkdir(parents=True)
        path='supabase/migrations/20260101000000_initial.sql';self.old='CREATE TABLE public.example(id integer);\n';(self.root/path).write_text(self.old)
        self.base={'common_migrations':[{'path':path,'version':'20260101000000','sha256':digest(self.old)}],'vps_only':[{'version':'20260102000000'}],'protected_runtime_files':{}}
        (self.root/'infrastructure/vps-app/baseline/manifest.json').write_text(canonical(self.base))
        self.sha='1'*40
    def tearDown(self):self.temp.cleanup()
    def manifest(self):return make_manifest(self.root,self.sha)
    def add(self,sql,version='20260201000000',name='add_column'):
        (self.root/('supabase/migrations/'+version+'_'+name+'.sql')).write_text(sql)
    def test_freezes_exact_commit(self):self.assertEqual(self.manifest()['commit'],self.sha)
    def test_refuses_floating_main(self):
        with self.assertRaisesRegex(ReleaseError,'full_commit'):make_manifest(self.root,'main')
    def test_changed_historical_file_rejected(self):
        (self.root/self.base['common_migrations'][0]['path']).write_text(self.old+'-- changed')
        with self.assertRaisesRegex(ReleaseError,'applied_migration'):self.manifest()
    def test_deleted_historical_file_rejected(self):
        (self.root/self.base['common_migrations'][0]['path']).unlink()
        with self.assertRaisesRegex(ReleaseError,'applied_migration'):self.manifest()
    def test_duplicate_version_rejected(self):
        self.add('SELECT 1;',version='20260101000000',name='duplicate')
        with self.assertRaisesRegex(ReleaseError,'duplicate'):self.manifest()
    def test_backdated_version_rejected(self):
        self.add('CREATE TABLE public.x(id int);',version='20250101000000')
        with self.assertRaisesRegex(ReleaseError,'backdated'):self.manifest()
    def test_reserved_vps_version_rejected(self):
        self.add('CREATE TABLE public.x(id int);',version='20260102000000')
        with self.assertRaisesRegex(ReleaseError,'reserved'):self.manifest()
    def test_safe_addition_is_pending(self):
        self.add('ALTER TABLE public.example ADD COLUMN note text;')
        m=self.manifest();self.assertFalse(m['risks']);self.assertEqual(m['additions'],['20260201000000'])
    def test_drop_requires_explicit_risk_review(self):
        self.add('DROP TABLE public.example;');m=self.manifest()
        with self.assertRaisesRegex(ReleaseError,'risk_review'):require_approval(m,m['manifest_id'],'')
        require_approval(m,m['manifest_id'],m['manifest_id'])
    def test_wrong_approval_rejected(self):
        m=self.manifest()
        with self.assertRaisesRegex(ReleaseError,'exact_release'):require_approval(m,'2'*64,'')
    def test_tampered_manifest_rejected(self):
        m=self.manifest();m['commit']='2'*40
        with self.assertRaisesRegex(ReleaseError,'digest'):verify_manifest(m)
    def test_cloud_and_vps_expected_histories_differ(self):
        m=self.manifest();common=[{'version':'20260101000000'}]
        self.assertEqual(validate_history(m,self.base,common,'cloud'),[])
        self.assertEqual(validate_history(m,self.base,common+[{'version':'20260102000000'}],'vps'),[])
    def test_missing_vps_exception_not_repaired(self):
        with self.assertRaisesRegex(ReleaseError,'baseline_missing'):validate_history(self.manifest(),self.base,[{'version':'20260101000000'}],'vps')
    def test_unknown_applied_version_rejected(self):
        with self.assertRaisesRegex(ReleaseError,'foreign'):validate_history(self.manifest(),self.base,[{'version':'20260101000000'},{'version':'20250105000000'}],'cloud')
    def test_existing_new_migration_not_reapplied(self):
        self.add('CREATE TABLE public.x(id int);');m=self.manifest();new=m['migrations'][-1]
        history=[{'version':'20260101000000'},{'version':new['version'],'source_md5':new['source_md5']}]
        self.assertEqual(validate_history(m,self.base,history,'cloud'),[])
    def test_changed_applied_new_migration_rejected(self):
        self.add('CREATE TABLE public.x(id int);');m=self.manifest()
        with self.assertRaisesRegex(ReleaseError,'source_mismatch'):validate_history(m,self.base,[{'version':'20260101000000'},{'version':'20260201000000','source_md5':'wrong'}],'cloud')
    def test_hole_in_migration_suffix_rejected(self):
        self.add('SELECT 1;');self.add('SELECT 2;',version='20260301000000');m=self.manifest();latest=m['migrations'][-1]
        with self.assertRaisesRegex(ReleaseError,'non_suffix'):validate_history(m,self.base,[{'version':'20260101000000'},{'version':latest['version'],'source_md5':latest['source_md5']}],'cloud')
    def test_ledger_not_rewritten(self):
        self.base['baseline_history']={'cloud':{'20260101000000':'known'}}
        with self.assertRaisesRegex(ReleaseError,'ledger_changed'):validate_history(self.manifest(),self.base,[{'version':'20260101000000','ledger_md5':'other'}],'cloud')
    def test_schema_drift_in_same_number_of_objects_detected(self):
        a={'objects':[{'kind':'function','identity':'public.f()','hash':'one'}]};b=copy.deepcopy(a);b['objects'][0]['hash']='two'
        with self.assertRaisesRegex(ReleaseError,'schema_drift'):compare_catalog(a,b)
    def test_grant_drift_detected(self):
        with self.assertRaisesRegex(ReleaseError,'schema_drift'):compare_catalog({'objects':[],'privileges':['safe']},{'objects':[],'privileges':['all']})
    def test_default_privilege_drift_detected(self):
        with self.assertRaisesRegex(ReleaseError,'schema_drift'):compare_catalog({'objects':[],'default_privileges':[]},{'objects':[],'default_privileges':['truncate']})
    def test_sql_string_semicolon_not_a_second_statement(self):
        a=sql_analysis("CREATE TABLE public.x(note text DEFAULT 'DROP TABLE;');");self.assertEqual(a['statement_types'],['CreateStmt'])
    def test_unicode_outer_transaction(self):
        a=sql_analysis('-- عربي\nBEGIN;CREATE TABLE public.x(id int);COMMIT;');self.assertFalse(a['blocked']);self.assertEqual(len(parse_sql(a['execution_sql'])),1)
    def test_embedded_commit_blocked(self):self.assertIn('embedded_transaction_control',sql_analysis('CREATE TABLE x(id int);COMMIT;')['blocked'])
    def test_procedural_body_requires_review(self):self.assertIn('DoStmt',sql_analysis('DO $$ BEGIN PERFORM 1; END $$;')['risks'])
    def test_concurrent_index_requires_separate_plan(self):self.assertIn('non_transactional_concurrent_index',sql_analysis('CREATE INDEX CONCURRENTLY x ON t(id);')['blocked'])
    def test_type_change_requires_review(self):self.assertTrue(sql_analysis('ALTER TABLE public.x ALTER COLUMN id TYPE text;')['risks'])
    def test_disable_rls_requires_review(self):self.assertTrue(sql_analysis('ALTER TABLE public.x DISABLE ROW LEVEL SECURITY;')['risks'])
    def test_copy_program_blocked(self):self.assertTrue(sql_analysis("COPY public.x TO PROGRAM 'echo';")['blocked'])
    def test_create_role_blocked(self):self.assertIn('CreateRoleStmt',sql_analysis('CREATE ROLE unsafe SUPERUSER;')['blocked'])
    def test_quoted_grantee_cannot_bypass_privilege_guard(self):self.assertIn('client_administrative_privilege_regression',sql_analysis('GRANT ALL ON TABLE public.x TO "anon";')['blocked'])
    def test_default_grants_cannot_bypass_guard(self):self.assertIn('client_administrative_privilege_regression',sql_analysis('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT TRUNCATE ON TABLES TO authenticated;')['blocked'])
    def test_function_os_primitive_blocked(self):self.assertIn('server_or_external_connection_primitive',sql_analysis("CREATE FUNCTION public.f() RETURNS text LANGUAGE sql AS $$ SELECT pg_read_file('/etc/passwd') $$;")['blocked'])
    def test_transaction_and_standard_ledger_are_atomic(self):
        item={'version':'20260201000000','name':'add'};sql=migration_transaction(item,'CREATE TABLE x(id int);',['20260101000000'])
        self.assertTrue(sql.startswith('BEGIN;'));self.assertIn('pg_advisory_xact_lock',sql);self.assertLess(sql.index('CREATE TABLE'),sql.index('INSERT INTO supabase_migrations'));self.assertTrue(sql.endswith('COMMIT;'))
    def test_second_deployment_lock_refused(self):
        path=self.root/'release.lock'
        with deployment_lock(path):
            with self.assertRaisesRegex(ReleaseError,'already_running'):
                with deployment_lock(path):pass
        with deployment_lock(path):pass
    def test_metadata_row_order_is_not_drift(self):
        compare_catalog({'objects':[],'privileges':[{'x':'a'},{'x':'b'}]}, {'objects':[],'privileges':[{'x':'b'},{'x':'a'}]})

class FakeOperations:
    def __init__(self,fail=None):self.fail=fail;self.calls=[];self.saved=[]
    def event(self,name):
        self.calls.append(name)
        if self.fail==name:raise ReleaseError('injected_failure')
    def save(self,r):self.saved.append(copy.deepcopy(r))
    def preflight(self,m):self.event('preflight')
    def validate(self,m):self.event('validate')
    def backup(self):self.event('backup');return{'verified':True}
    def migrate(self):
        self.event('migrate_first');yield'first'
        self.event('migrate_second');yield'second'
    def switch_application(self):self.event('switch')
    def health(self):self.event('health')
    def rollback_application(self):self.event('rollback_app')
    def health_previous(self):self.event('previous_health')
    def restore_worker(self):self.event('restore_worker')

class CoordinatorTests(unittest.TestCase):
    def manifest(self,risks=None):
        m={'commit':'1'*40,'risks':risks or{}};m['manifest_id']=digest(canonical(m));return m
    def execute(self,ops,m=None,risk=None):
        m=m or self.manifest();r={};return coordinate(ops,m,m['manifest_id'],risk or'',r)
    def test_successful_order(self):
        o=FakeOperations();r=self.execute(o);self.assertTrue(r['success']);self.assertEqual(o.calls,['preflight','validate','backup','migrate_first','migrate_second','switch','health','restore_worker'])
    def test_no_write_after_validation_failure(self):
        o=FakeOperations('validate')
        with self.assertRaises(ReleaseError):self.execute(o)
        self.assertNotIn('backup',o.calls);self.assertNotIn('switch',o.calls)
    def test_backup_failure_blocks_database_and_app(self):
        o=FakeOperations('backup')
        with self.assertRaises(ReleaseError):self.execute(o)
        self.assertNotIn('migrate_first',o.calls);self.assertNotIn('switch',o.calls)
    def test_first_completed_migration_recorded_on_second_failure(self):
        o=FakeOperations('migrate_second')
        with self.assertRaises(ReleaseError):self.execute(o)
        self.assertEqual(o.saved[-1]['migrations_applied'],['first']);self.assertNotIn('switch',o.calls)
    def test_health_failure_rolls_back_app_only(self):
        o=FakeOperations('health')
        with self.assertRaises(ReleaseError):self.execute(o)
        self.assertIn('rollback_app',o.calls);self.assertNotIn('rollback_db',o.calls);self.assertEqual(o.saved[-1]['application_rollback'],'completed')
    def test_partial_switch_failure_also_rolls_back_app(self):
        o=FakeOperations('switch')
        with self.assertRaises(ReleaseError):self.execute(o)
        self.assertIn('rollback_app',o.calls)
    def test_breaking_migration_never_automatically_rolled_back(self):
        o=FakeOperations('health');m=self.manifest({'new':['DropStmt']})
        with self.assertRaises(ReleaseError):self.execute(o,m,m['manifest_id'])
        self.assertNotIn('rollback_app',o.calls);self.assertEqual(o.saved[-1]['application_rollback'],'blocked_database_compatibility_requires_review')
    def test_risk_without_specific_approval_cannot_start(self):
        o=FakeOperations();m=self.manifest({'new':['DropStmt']})
        with self.assertRaises(ReleaseError):self.execute(o,m)
        self.assertEqual(o.calls,[])

if __name__=='__main__':unittest.main()
