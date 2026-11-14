"""Opt-in tests require only Docker; the sole target is a newly created network-none DB."""
import concurrent.futures,json,os,pathlib,tempfile,unittest
from policy import ReleaseError,digest
from database import apply_pending,dump_backup,verify_backup_restore
from qa import Sandbox

@unittest.skipUnless(os.environ.get('RK_RELEASE_DB_TESTS')=='1','isolated Docker database tests are opt-in')
class DatabaseReleaseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root=pathlib.Path(__file__).resolve().parents[3]
        cls.sandbox=Sandbox(cls.root).__enter__();cls.db=cls.sandbox.db
    @classmethod
    def tearDownClass(cls):cls.sandbox.cleanup()
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.files=pathlib.Path(self.temp.name);(self.files/'supabase/migrations').mkdir(parents=True)
        self.db.sql("DROP SCHEMA IF EXISTS release_test CASCADE;CREATE SCHEMA release_test;DROP SCHEMA IF EXISTS supabase_migrations CASCADE;CREATE SCHEMA supabase_migrations;CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[]);DROP TABLE IF EXISTS public.rk_delivery_config;CREATE TABLE public.rk_delivery_config(singleton boolean PRIMARY KEY,instance text,not_before timestamptz);INSERT INTO public.rk_delivery_config VALUES(true,'isolated-test',now()-interval'2 days');CREATE TABLE release_test.sentinel(id integer PRIMARY KEY,value text);INSERT INTO release_test.sentinel VALUES(1,'preserve');")
    def tearDown(self):self.temp.cleanup()
    def item(self,sql,version='20270101000000'):
        path='supabase/migrations/'+version+'_test.sql';(self.files/path).write_text(sql)
        return{'path':path,'version':version,'name':'test','sha256':digest(sql)}
    def count(self):return self.db.json("SELECT jsonb_build_object('n',(SELECT count(*)FROM supabase_migrations.schema_migrations))")['n']
    def test_migration_and_ledger_commit_together(self):
        m=self.item('ALTER TABLE release_test.sentinel ADD COLUMN note text;');self.db.apply(m,self.files,[])
        self.assertEqual(self.count(),1);self.assertEqual(self.db.json("SELECT jsonb_build_object('value',value)FROM release_test.sentinel WHERE id=1")['value'],'preserve')
    def test_statement_failure_rolls_back_schema_and_ledger(self):
        m=self.item('ALTER TABLE release_test.sentinel ADD COLUMN note text; SELECT 1/0;')
        with self.assertRaises(ReleaseError):self.db.apply(m,self.files,[])
        self.assertEqual(self.count(),0);self.assertFalse(self.db.json("SELECT jsonb_build_object('present',EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='release_test'AND table_name='sentinel'AND column_name='note'))")['present'])
    def test_repeat_request_cannot_apply_twice(self):
        m=self.item('ALTER TABLE release_test.sentinel ADD COLUMN note text;');self.db.apply(m,self.files,[])
        with self.assertRaises(ReleaseError):self.db.apply(m,self.files,[])
        self.assertEqual(self.count(),1)
    def test_two_concurrent_attempts_have_one_commit(self):
        m=self.item('SELECT pg_sleep(0.2);ALTER TABLE release_test.sentinel ADD COLUMN note text;')
        def attempt():
            try:self.db.apply(m,self.files,[]);return True
            except ReleaseError:return False
        with concurrent.futures.ThreadPoolExecutor(2)as pool:results=list(pool.map(lambda _:attempt(),range(2)))
        self.assertEqual(sum(results),1);self.assertEqual(self.count(),1)
    def test_partial_release_preserves_completed_prefix(self):
        first=self.item('ALTER TABLE release_test.sentinel ADD COLUMN first text;','20270101000000')
        second=self.item('SELECT 1/0;','20270101000001')
        third=self.item('ALTER TABLE release_test.sentinel ADD COLUMN third text;','20270101000002')
        receipt={}
        with self.assertRaises(ReleaseError):list(apply_pending(self.db,self.files,[first,second,third],[],receipt))
        self.assertEqual(receipt['migrations_applied'],['20270101000000']);self.assertEqual(self.count(),1)
    def test_delivery_namespace_and_cutoff_cannot_be_changed_by_release(self):
        original=self.db.json("SELECT jsonb_build_object('boundary',md5(instance||not_before::text))FROM public.rk_delivery_config")['boundary']
        m=self.item("UPDATE public.rk_delivery_config SET not_before=now();")
        with self.assertRaises(ReleaseError):self.db.apply(m,self.files,[])
        after=self.db.json("SELECT jsonb_build_object('boundary',md5(instance||not_before::text))FROM public.rk_delivery_config")['boundary'];self.assertEqual(original,after);self.assertEqual(self.count(),0)
    def test_backup_archive_is_readable_without_restoring_live_database(self):
        proof=dump_backup(self.db,self.files/'backup');self.assertTrue(proof['archive_read_verified']);self.assertGreater(pathlib.Path(proof['file']).stat().st_size,1000)
        self.assertTrue(verify_backup_restore(pathlib.Path(proof['file']),self.root)['isolated_restore_verified'])
    def test_proposed_mcp_metadata_grant_in_isolation_only(self):
        self.db.sql("DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='rikaz_mcp_admin')THEN CREATE ROLE rikaz_mcp_admin;END IF;END $$;GRANT CREATE ON SCHEMA public TO rikaz_mcp_admin;")
        proposed=(self.root/'infrastructure/vps-app/release/mcp-review/permissions.sql.review').read_text()
        self.db.sql(proposed)
        self.db.sql("BEGIN READ ONLY;SET LOCAL ROLE rikaz_mcp_admin;SELECT version,name FROM supabase_migrations.schema_migrations;ROLLBACK;")
        with self.assertRaises(ReleaseError):self.db.sql("SET ROLE rikaz_mcp_admin;CREATE TABLE public.not_allowed(id int);")
        with self.assertRaises(ReleaseError):self.db.sql("SET ROLE rikaz_mcp_admin;SELECT statements FROM supabase_migrations.schema_migrations;")

if __name__=='__main__':unittest.main()
