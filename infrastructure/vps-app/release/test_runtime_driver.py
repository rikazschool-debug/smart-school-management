import json,pathlib,tempfile,unittest,subprocess,io,contextlib
from unittest.mock import patch,Mock
from server import command,ProductionOperations
from policy import history_key

class RuntimeDriverTests(unittest.TestCase):
    def test_command_keeps_private_stdin_out_of_arguments_and_log(self):
        with tempfile.TemporaryDirectory()as temporary:
            log=pathlib.Path(temporary)/'log'
            with patch('server.subprocess.run',return_value=subprocess.CompletedProcess([],0,b'ok',b''))as run:
                self.assertEqual(command(['node','--input-type=module'],log,input_data=b'private test source'),b'ok')
            self.assertEqual(run.call_args.kwargs['input'],b'private test source');self.assertNotIn('private test source',str(run.call_args.args));self.assertNotIn(b'private test source',log.read_bytes())
    def test_production_probe_uses_stdin_and_public_target_only(self):
        with tempfile.TemporaryDirectory()as temporary:
            root=pathlib.Path(temporary);file=root/'infrastructure/vps-app/isolated-smoke.mjs';file.parent.mkdir(parents=True);file.write_text('isolated synthetic source');file.chmod(0o600)
            operations=object.__new__(ProductionOperations);operations.root=root;operations.work=root
            with patch('server.env_values',return_value={'VITE_SUPABASE_URL':'https://api.kalmalki.com','VITE_SUPABASE_PUBLISHABLE_KEY':'synthetic-public-only'}),patch('server.command')as execute:
                operations._build_image({'commit':'1'*40,'manifest_id':'2'*64})
            args=execute.call_args.args[0]
            self.assertIn('-i',args);self.assertIn('none',args);self.assertIn('--read-only',args);self.assertNotIn('--mount',args);self.assertIn('RIKAZ_SMOKE_EXPECTED_PUBLIC_BACKEND=https://api.kalmalki.com',args);self.assertEqual(execute.call_args.kwargs['input_data'],file.read_bytes())
    def test_validation_progress_stays_in_private_log(self):
        with tempfile.TemporaryDirectory()as temporary:
            root=pathlib.Path(temporary);operations=object.__new__(ProductionOperations);operations.work=root;operations.root=root;operations.trusted_root=root;operations.config={};operations.history=[];operations.db=Mock();operations._build_image=Mock()
            key=history_key([]);proof={'states':{key:{'catalog':{}}}}
            def replay(*args,**kwargs):print('private replay progress');return proof
            output=io.StringIO()
            with patch('server.audit_cloud',return_value={}),patch('server.replay',side_effect=replay),patch('server.compare_catalog'),contextlib.redirect_stdout(output):operations.validate({})
            self.assertEqual(output.getvalue(),'');self.assertIn('private replay progress',(root/'isolated-validation.log').read_text());self.assertEqual((root/'isolated-validation.log').stat().st_mode&0o777,0o600)
