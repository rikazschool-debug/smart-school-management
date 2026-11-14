import json,pathlib,tempfile,unittest
from unittest.mock import patch
from policy import ReleaseError,canonical,digest
from upgrade import FILES,upgrade

class TrustedUpgradeTests(unittest.TestCase):
    def setUp(self):
        self.temporary=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.temporary.name);self.source=self.root/'source';self.old='a'*64
        self.here=self.source/'infrastructure/vps-app/release';self.here.mkdir(parents=True)
        for name in FILES:(self.here/name).write_text('reviewed fixture '+name)
        self.new=digest(canonical({name:digest((self.here/name).read_bytes())for name in FILES}))
        self.previous=self.root/'opt/rikaz-release/versions'/self.old;(self.previous/'dependencies').mkdir(parents=True)
        (self.previous/'requirements.txt').write_bytes((self.here/'requirements.txt').read_bytes());(self.previous/'dependencies/fixture.txt').write_text('unchanged dependency')
        self.config=self.root/'etc/rikaz/release';self.config.mkdir(parents=True)
        (self.config/'config.json').write_text(' {"enabled":true,"mcp_write_path_reviewed":true,"test_secret":"synthetic-only"}\n')
        (self.config/'staging-receipt.json').write_text(json.dumps({'runner_code_sha256':self.old,'enabled':True}))
        (self.root/'var/lib/rikaz-releases').mkdir(parents=True)
        self.entry=self.root/'usr/local/sbin/rikaz-release-entry';self.entry.parent.mkdir(parents=True);self.entry.write_text('previous trusted wrapper')
    def tearDown(self):self.temporary.cleanup()
    def apply(self,expected=None,reviewed=None):
        with patch('upgrade.os.geteuid',return_value=0):return upgrade(self.source,expected or self.old,reviewed or self.new,'1'*40,_system_root=self.root)
    def test_preserves_active_configuration_and_rollback_wrapper(self):
        before=(self.config/'config.json').read_bytes();result=self.apply()
        self.assertEqual(before,(self.config/'config.json').read_bytes());self.assertTrue(result['configuration_unchanged']);self.assertFalse(result['application_deployed']);self.assertFalse(result['migrations_applied'])
        self.assertEqual((self.previous/('entry-before-'+self.new[:16])).read_text(),'previous trusted wrapper')
        self.assertIn(self.new,self.entry.read_text());self.assertTrue(json.loads((self.config/'staging-receipt.json').read_text())['enabled'])
    def test_refuses_changed_current_runner(self):
        with self.assertRaisesRegex(ReleaseError,'current_runner_changed'):self.apply(expected='b'*64)
        self.assertEqual(self.entry.read_text(),'previous trusted wrapper')
    def test_refuses_unreviewed_digest_or_dependency_change(self):
        with self.assertRaisesRegex(ReleaseError,'digest_mismatch'):self.apply(reviewed='b'*64)
        (self.previous/'requirements.txt').write_text('unreviewed dependency')
        with self.assertRaisesRegex(ReleaseError,'dependency_change'):self.apply()
        self.assertEqual(self.entry.read_text(),'previous trusted wrapper')
