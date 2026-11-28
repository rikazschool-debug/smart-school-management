"""Cloud can remain read-only only when declared repairs are already equivalent."""
import copy,json,pathlib,shutil,tempfile,unittest
from unittest.mock import patch
from policy import ReleaseError,canonical,digest,make_manifest,history_key,target_migrations
from server import audit_cloud

class CloudRepairAuditTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.base=pathlib.Path(self.tmp.name);self.source=self.base/'fixture';self.work=self.base/'work';self.work.mkdir()
        (self.source/'supabase/migrations').mkdir(parents=True);(self.source/'infrastructure/vps-app/baseline').mkdir(parents=True)
        self.sha='1'*40;initial='CREATE TABLE public.base(id int);';schema='CREATE OR REPLACE FUNCTION public.guard() RETURNS int LANGUAGE sql AS $$SELECT 1$$;'
        sources={'20260101000000':initial,'20260201000000':'CREATE TABLE public.au_events(code text primary key,label text);','20260301000000':schema+"DO $$BEGIN RAISE NOTICE 'one-time test cleanup';END$$;",'20260401000000':"INSERT INTO public.au_events(code,label) VALUES('evt.trip.upcoming','Trip')ON CONFLICT(code)DO NOTHING;",'20260501000000':schema}
        for version,sql in sources.items():(self.source/f'supabase/migrations/{version}_item.sql').write_text(sql)
        baseline={'common_migrations':[{'version':'20260101000000','path':'supabase/migrations/20260101000000_item.sql','sha256':digest(initial)}],'vps_only':[],'protected_runtime_files':{},'baseline_history':{'cloud':{'20260101000000':'known'}}}
        (self.source/'infrastructure/vps-app/baseline/manifest.json').write_text(canonical(baseline))
        (self.source/'infrastructure/vps-app/migration-prerequisites.json').write_text(canonical([{'migration':'20260401000000','after':'20260201000000','before':'20260501000000'}]))
        (self.source/'infrastructure/vps-app/operational-cloud-migrations.json').write_text(canonical([{'version':'20260301000000','source_sha256':digest(sources['20260301000000']),'schema_replacement':'20260501000000','schema_sha256':digest(schema),'schema_statements':1}]))
        self.manifest=make_manifest(self.source,self.sha);items={m['version']:m for m in self.manifest['migrations']}
        self.history=[{'version':v,'ledger_md5':'known'if v=='20260101000000'else'unchanged','source_md5':items[v]['source_md5']}for v in ['20260101000000','20260201000000','20260301000000']]
        self.catalog={'objects':[]};self.registry={'evt.trip.upcoming':'registry-fingerprint'}
        key=history_key([x['version']for x in target_migrations(self.manifest,'cloud')])
        self.proof={'states':{key:{'catalog':self.catalog}},'prerequisite_registry':self.registry.copy()}
        self.trusted=self.base/'trusted';self.trusted.mkdir();(self.trusted/'catalog.sql').write_text('SELECT inspection')
        credential=self.base/'credential';credential.write_text('synthetic-only-not-a-token')
        self.config={'baseline_sha256':digest(canonical(baseline)),'cloud_read_credential_file':str(credential)}
    def tearDown(self):self.tmp.cleanup()
    def read(self,credential,query):
        if 'AS history' in query:return [{'history':copy.deepcopy(self.history)}]
        if 'AS registry' in query:return [{'registry':copy.deepcopy(self.registry)}]
        return [{'inspection':copy.deepcopy(self.catalog)}]
    def audit(self):
        with patch('server.https_json',return_value={'sha':self.sha}),patch('server.fetch_source',side_effect=lambda sha,dest:shutil.copytree(self.source,dest)),patch('server.replay',return_value=self.proof),patch('server.cloud_read',side_effect=self.read):
            return audit_cloud(self.trusted,self.work,self.config)
    def test_existing_equivalent_state_requires_no_cloud_write(self):
        r=self.audit();self.assertTrue(r['passed']);self.assertTrue(r['queries_read_only'])
        self.assertEqual(r['unapplied_noop_registry_repairs'],['20260401000000'])
        self.assertEqual(r['unapplied_schema_equivalent_replacements'],['20260501000000'])
        self.assertEqual(r['operational_cleanup_excluded_from_vps'],['20260301000000'])
    def test_unknown_missing_migration_is_not_skipped(self):
        self.history=[x for x in self.history if x['version']!='20260201000000']
        with self.assertRaisesRegex(ReleaseError,'history_not_represented'):self.audit()
    def test_existing_registry_rows_must_match_replay(self):
        self.registry['evt.trip.upcoming']='different'
        with self.assertRaisesRegex(ReleaseError,'registry_seed_drift'):self.audit()
    def test_operational_source_provenance_must_match(self):
        self.history[-1]['source_md5']='different'
        with self.assertRaisesRegex(ReleaseError,'history_source_mismatch'):self.audit()
    def test_baseline_ledger_is_never_repaired(self):
        self.history[0]['ledger_md5']='different'
        with self.assertRaisesRegex(ReleaseError,'historical_ledger_changed'):self.audit()

if __name__=='__main__':unittest.main()
