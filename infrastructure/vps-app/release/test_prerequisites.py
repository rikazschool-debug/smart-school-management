"""Immutable forward repairs can satisfy missing historical prerequisites once."""
import json,pathlib,tempfile,unittest
from policy import ReleaseError,canonical,digest,make_manifest,target_migrations,validate_history,verify_manifest,registry_prerequisite_codes,registry_prerequisite_query

class PrerequisiteTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name)
        (self.root/'supabase/migrations').mkdir(parents=True)
        (self.root/'supabase/vps-migrations').mkdir()
        (self.root/'infrastructure/vps-app/baseline').mkdir(parents=True)
        self.source='CREATE TABLE public.base(id int);'
        (self.root/'supabase/migrations/20260101000000_base.sql').write_text(self.source)
        self.base={'common_migrations':[{'version':'20260101000000','path':'supabase/migrations/20260101000000_base.sql','sha256':digest(self.source)}],'vps_only':[],'protected_runtime_files':{}}
        (self.root/'infrastructure/vps-app/baseline/manifest.json').write_text(canonical(self.base))
        self.add('20260201000000','CREATE TABLE public.registry(code text primary key);')
        self.add('20260301000000',"INSERT INTO public.registry VALUES('dependent');")
        self.add('20260401000000',"INSERT INTO public.registry VALUES('repair') ON CONFLICT DO NOTHING;")
        self.rules=[{'migration':'20260401000000','after':'20260201000000','before':'20260301000000'}]
        self.write_rules()
    def tearDown(self):self.tmp.cleanup()
    def add(self,version,source,scope='migrations'):
        (self.root/f'supabase/{scope}/{version}_item.sql').write_text(source)
    def write_rules(self):(self.root/'infrastructure/vps-app/migration-prerequisites.json').write_text(canonical(self.rules))
    def manifest(self):return make_manifest(self.root,'1'*40)
    def history(self,m,versions):
        items={x['version']:x for x in m['migrations']}
        return [{'version':v,'source_md5':items[v]['source_md5']}for v in versions]
    def test_repair_runs_between_declared_prerequisites(self):
        m=self.manifest();self.assertEqual([x['version']for x in target_migrations(m,'cloud')],['20260101000000','20260201000000','20260401000000','20260301000000'])
        self.assertEqual((self.root/'supabase/migrations/20260301000000_item.sql').read_text(),"INSERT INTO public.registry VALUES('dependent');")
    def test_existing_cloud_history_only_gets_new_repair(self):
        m=self.manifest();h=self.history(m,['20260101000000','20260201000000','20260301000000'])
        self.assertEqual([x['version']for x in validate_history(m,self.base,h,'cloud')],['20260401000000'])
    def test_partial_release_resumes_after_repair_without_repeating_it(self):
        m=self.manifest();h=self.history(m,['20260101000000','20260201000000','20260401000000'])
        self.assertEqual([x['version']for x in validate_history(m,self.base,h,'vps')],['20260301000000'])
    def test_missing_ordinary_migration_is_still_rejected(self):
        self.add('20260501000000','SELECT 1;');m=self.manifest()
        with self.assertRaisesRegex(ReleaseError,'non_suffix'):
            validate_history(m,self.base,self.history(m,['20260101000000','20260501000000']),'cloud')
    def test_repair_cannot_claim_missing_dependency(self):
        m=self.manifest()
        with self.assertRaisesRegex(ReleaseError,'dependency_missing'):
            validate_history(m,self.base,self.history(m,['20260101000000','20260401000000']),'cloud')
    def test_historical_files_cannot_be_reordered(self):
        self.rules[0]['before']='20260101000000';self.write_rules()
        with self.assertRaisesRegex(ReleaseError,'reference_invalid'):self.manifest()
    def test_unknown_reference_is_rejected(self):
        self.rules[0]['before']='20260501000000';self.write_rules()
        with self.assertRaisesRegex(ReleaseError,'reference_invalid'):self.manifest()
    def test_impossible_order_is_rejected(self):
        self.rules[0]['after']='20260301000000';self.write_rules()
        with self.assertRaises(ReleaseError):self.manifest()
    def test_duplicate_repair_is_rejected(self):
        self.rules*=2;self.write_rules()
        with self.assertRaisesRegex(ReleaseError,'reference_invalid'):self.manifest()
    def test_prerequisite_map_is_frozen_in_manifest(self):
        m=self.manifest();m['migration_prerequisites'][0]['before']='20260201000000'
        with self.assertRaisesRegex(ReleaseError,'digest'):verify_manifest(m)
    def test_vps_origin_prerequisite_is_excluded_from_cloud(self):
        self.add('20260601000000','SELECT 2;','vps-migrations')
        self.rules.append({'migration':'20260601000000','after':'20260201000000','before':'20260301000000'});self.write_rules()
        m=self.manifest()
        self.assertNotIn('20260601000000',[x['version']for x in target_migrations(m,'cloud')])
        self.assertIn('20260601000000',[x['version']for x in target_migrations(m,'vps')])
    def test_conflicting_prerequisite_orders_are_rejected(self):
        self.add('20260601000000','SELECT 2;','vps-migrations')
        self.rules.append({'migration':'20260601000000','after':'20260301000000','before':'20260401000000'});self.write_rules()
        with self.assertRaisesRegex(ReleaseError,'order_invalid'):self.manifest()
    def registry_source(self,sql):
        self.add('20260401000000',sql)
        return registry_prerequisite_codes(self.root,self.manifest(),['20260401000000'])
    def test_cloud_may_lag_only_a_constant_idempotent_registry_seed(self):
        self.assertEqual(self.registry_source("INSERT INTO public.au_events(code,label,recipients) VALUES('evt.trip.upcoming','Trip',ARRAY['organizer']) ON CONFLICT(code) DO NOTHING;"),['evt.trip.upcoming'])
    def test_cloud_cannot_skip_schema_or_business_migration(self):
        for sql in ['CREATE TABLE public.missing(id int);',"INSERT INTO public.students(id)VALUES('x')ON CONFLICT DO NOTHING;", "INSERT INTO public.au_events(code) SELECT 'evt.trip.upcoming' ON CONFLICT DO NOTHING;", "INSERT INTO public.au_events(code)VALUES('evt.trip.upcoming')ON CONFLICT(code) DO UPDATE SET code=excluded.code;", "INSERT INTO public.au_events(code)VALUES('evt.trip.upcoming')ON CONFLICT DO NOTHING RETURNING code;", "INSERT INTO public.au_events(code,label)VALUES('evt.trip.upcoming',current_user)ON CONFLICT DO NOTHING;"]:
            with self.subTest(sql=sql),self.assertRaises(ReleaseError):self.registry_source(sql)
    def test_cloud_registry_hash_query_rejects_untrusted_identifiers(self):
        with self.assertRaises(ReleaseError):registry_prerequisite_query(["evt.trip');DROP TABLE x;--"])
    def test_cloud_cannot_skip_undeclared_registry_seed(self):
        with self.assertRaises(ReleaseError):registry_prerequisite_codes(self.root,self.manifest(),['20260301000000'])
    def operational_fixture(self):
        self.rules=[];self.write_rules()
        schema='CREATE OR REPLACE FUNCTION public.cleanup_guard() RETURNS int LANGUAGE sql AS $$SELECT 1$$;'
        source=schema+"\nDO $$BEGIN RAISE NOTICE 'cloud test cleanup';END$$;"
        self.add('20260301000000',source);self.add('20260501000000',schema)
        rules=[{'version':'20260301000000','source_sha256':digest(source),'schema_replacement':'20260501000000','schema_sha256':digest(schema),'schema_statements':1}]
        (self.root/'infrastructure/vps-app/operational-cloud-migrations.json').write_text(canonical(rules))
    def test_cloud_cleanup_never_enters_vps_migration_stream(self):
        self.operational_fixture();m=self.manifest()
        self.assertNotIn('20260301000000',[x['version']for x in target_migrations(m,'vps')])
        self.assertIn('20260501000000',[x['version']for x in target_migrations(m,'vps')])
        old=next(x for x in target_migrations(m,'cloud')if x['version']=='20260301000000')
        self.assertEqual(old['qa_replay_path'],'supabase/migrations/20260501000000_item.sql')
    def test_original_operational_source_remains_immutable(self):
        self.operational_fixture();self.add('20260301000000','SELECT 1;')
        with self.assertRaisesRegex(ReleaseError,'source_changed'):self.manifest()
    def test_changed_schema_replacement_is_rejected(self):
        self.operational_fixture();self.add('20260501000000','DELETE FROM public.registry;')
        with self.assertRaisesRegex(ReleaseError,'source_changed'):self.manifest()
    def test_business_cleanup_cannot_hide_in_schema_replacement(self):
        self.operational_fixture();path=self.root/'infrastructure/vps-app/operational-cloud-migrations.json';rules=json.loads(path.read_text())
        sql='DELETE FROM public.registry;';self.add('20260501000000',sql);rules[0]['schema_sha256']=digest(sql);path.write_text(canonical(rules))
        with self.assertRaisesRegex(ReleaseError,'replacement_changed'):self.manifest()
    def test_vps_rejects_cloud_only_applied_history(self):
        self.operational_fixture();m=self.manifest()
        with self.assertRaisesRegex(ReleaseError,'foreign_migration'):
            validate_history(m,self.base,self.history(m,['20260101000000','20260301000000']),'vps')

if __name__=='__main__':unittest.main()
