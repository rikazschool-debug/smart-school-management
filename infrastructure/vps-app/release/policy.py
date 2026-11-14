"""Release planning only: immutable sources, standard migration history, no credentials."""
from __future__ import annotations
import hashlib,json,re,pathlib
from pglast import parse_sql,parser

class ReleaseError(RuntimeError):
    pass

def canonical(value):
    return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False)

def digest(value):
    return hashlib.sha256(value if isinstance(value,bytes) else value.encode()).hexdigest()

def read_sql(path):
    if path.is_symlink() or not path.is_file():
        raise ReleaseError('migration_path_not_regular')
    return path.read_bytes().decode('utf-8-sig').replace('\r\n','\n')

def sql_analysis(source):
    """Use the PostgreSQL AST; ambiguous procedural/data/privilege changes require review."""
    try:
        raw=parse_sql(source)
        ast=json.loads(parser.parse_sql_json(source))['stmts']
    except Exception as exc:
        raise ReleaseError('migration_sql_parse_failed') from exc
    if not raw:
        raise ReleaseError('empty_migration')
    kinds=[next(iter(s['stmt']))for s in ast]
    risks=[];blocked=[]
    transactions=[i for i,k in enumerate(kinds)if k=='TransactionStmt']
    body=source
    if transactions:
        outer=(transactions==[0,len(raw)-1] and len(raw)>2 and
               ast[0]['stmt']['TransactionStmt']['kind']=='TRANS_STMT_BEGIN' and
               ast[-1]['stmt']['TransactionStmt']['kind']=='TRANS_STMT_COMMIT')
        if not outer:
            blocked.append('embedded_transaction_control')
        else:
            # pglast's Python nodes report character offsets, including non-ASCII comments.
            body=source[raw[1].stmt_location:raw[-1].stmt_location]
            kinds=kinds[1:-1];ast=ast[1:-1]
    safe={'CreateStmt','CreateSchemaStmt','CreateEnumStmt','CreateSeqStmt','CreateTrigStmt','CommentStmt'}
    hard={'AlterSystemStmt','CopyStmt','CreatedbStmt','DropdbStmt','CreateRoleStmt','AlterRoleStmt','DropRoleStmt','GrantRoleStmt','LoadStmt','CreateFdwStmt','CreateForeignServerStmt','CreateUserMappingStmt','AlterOwnerStmt'}
    for kind,stmt in zip(kinds,ast):
        node=stmt['stmt'][kind]
        if kind in hard:blocked.append(kind)
        elif kind=='IndexStmt':
            if node.get('concurrent'):blocked.append('non_transactional_concurrent_index')
        elif kind=='AlterTableStmt':
            for command in node.get('cmds',[]):
                subtype=command.get('AlterTableCmd',{}).get('subtype','unknown')
                if subtype not in {'AT_AddColumn','AT_AddIndex','AT_AddConstraint'}:risks.append(subtype)
                elif subtype=='AT_AddConstraint':risks.append('constraint_validation_and_lock_review')
                else:
                    detail=canonical(command)
                    if 'CONSTR_NOTNULL'in detail:risks.append('new_not_null_requires_compatibility_review')
        elif kind not in safe:risks.append(kind)
    def walk(value):
        if isinstance(value,dict):
            if 'GrantStmt'in value:
                grant=value['GrantStmt'];roles={r.get('RoleSpec',{}).get('rolename')for r in grant.get('grantees',[])}
                privileges={p.get('AccessPriv',{}).get('priv_name','').lower()for p in grant.get('privileges',[])}
                if grant.get('is_grant')and grant.get('objtype')=='OBJECT_TABLE'and roles&{'anon','authenticated'}and(not grant.get('privileges')or privileges&{'truncate','trigger','references','maintain'}):
                    blocked.append('client_administrative_privilege_regression')
            for item in value.values():walk(item)
        elif isinstance(value,list):
            for item in value:walk(item)
    walk(ast)
    # Function/DO bodies are opaque strings in the outer AST. Deny OS/connection escape primitives
    # in the complete SQL as well; reviewed procedural SQL still receives explicit human review.
    forbidden=r'\b(?:pg_read_file|pg_read_binary_file|pg_ls_dir|pg_write_file|lo_import|lo_export|dblink_connect|dblink_exec|pg_execute_server_program|pg_read_server_files|pg_write_server_files)\b|\bCOPY\s+.*?\bPROGRAM\b|\bALTER\s+SYSTEM\b'
    if re.search(forbidden,source,re.I|re.S):blocked.append('server_or_external_connection_primitive')
    if re.search(r'\bGRANT\s+(?:ALL(?:\s+PRIVILEGES)?|TRUNCATE|TRIGGER|REFERENCES|MAINTAIN)\b[^;]*\bTO\s+(?:anon|authenticated)\b',source,re.I):
        blocked.append('client_administrative_privilege_regression')
    return {'statement_types':sorted(set(kinds)),'risks':sorted(set(risks)),
            'blocked':sorted(set(blocked)),'execution_sql':body}

def migration_files(root):
    folder=root/'supabase/migrations';result=[];seen=set()
    for path in sorted(folder.iterdir()):
        match=re.fullmatch(r'(\d{14})_([a-zA-Z0-9_-]+)\.sql',path.name)
        if not match:raise ReleaseError('unexpected_migration_file')
        if match[1]in seen:raise ReleaseError('duplicate_migration_version')
        seen.add(match[1]);source=read_sql(path)
        result.append({'path':path.relative_to(root).as_posix(),'version':match[1],
                       'name':match[2],'sha256':digest(source),'source_md5':hashlib.md5(source.encode()).hexdigest()})
    return result

def make_manifest(root,sha):
    if not re.fullmatch('[0-9a-f]{40}',sha):raise ReleaseError('full_commit_sha_required')
    base=json.loads((root/'infrastructure/vps-app/baseline/manifest.json').read_text())
    files=migration_files(root);by_path={m['path']:m for m in files}
    for old in base['common_migrations']:
        if old['path']not in by_path or by_path[old['path']]['sha256']!=old['sha256']:
            raise ReleaseError('applied_migration_modified_or_removed')
        if old.get('replay_path')and digest(read_sql(root/old['replay_path']))!=old['replay_sha256']:
            raise ReleaseError('approved_historical_replay_input_changed')
    for relative,expected in base.get('fixture_files',{}).items():
        path=root/relative
        if path.is_symlink()or not path.is_file()or digest(path.read_bytes().replace(b'\r\n',b'\n'))!=expected:
            raise ReleaseError('approved_baseline_fixture_changed')
    for item in base['vps_only']+base.get('optional_vps_only',[]):
        if item.get('path')and digest(read_sql(root/item['path']))!=item['sha256']:
            raise ReleaseError('approved_vps_exception_changed')
    frozen={m['version']for m in base['common_migrations']};last=max(frozen)
    additions=[m for m in files if m['version']not in frozen]
    for item in additions:
        if item['version']<=last or item['version']in{m['version']for m in base['vps_only']+base.get('optional_vps_only',[])}:
            raise ReleaseError('backdated_or_reserved_migration')
        analysis=sql_analysis(read_sql(root/item['path']))
        item['analysis']={k:v for k,v in analysis.items()if k!='execution_sql'}
        if analysis['blocked']:raise ReleaseError('forbidden_migration:'+','.join(analysis['blocked']))
    protected={}
    for relative in base['protected_runtime_files']:
        path=root/relative
        if not path.is_file()or path.is_symlink():raise ReleaseError('protected_runtime_missing')
        protected[relative]=digest(path.read_bytes().replace(b'\r\n',b'\n'))
        if protected[relative]!=base['protected_runtime_files'][relative]:
            raise ReleaseError('runtime_operations_change_requires_separate_review')
    manifest={'format':1,'repository':'rikazschool-debug/smart-school-management','commit':sha,
              'target':'rikaz-vps-production','baseline_sha256':digest(canonical(base)),
              'migrations':files,'additions':[m['version']for m in additions],
              'risks':{m['version']:m['analysis']['risks']for m in additions if m['analysis']['risks']},
              'protected_runtime_files':protected,'database_rollback':'forward_only',
              'application_rollback':'only_after_old_image_new_schema_compatibility',
              'real_provider_calls_in_tests':False}
    manifest['manifest_id']=digest(canonical(manifest));return manifest

def verify_manifest(manifest):
    expected=manifest.get('manifest_id');body={k:v for k,v in manifest.items()if k!='manifest_id'}
    if not expected or digest(canonical(body))!=expected:raise ReleaseError('manifest_digest_mismatch')

def validate_history(manifest,base,history,target):
    """Preserve the different approved ledgers; never repair, rewrite or infer an applied row."""
    verify_manifest(manifest)
    actual={m['version']:m for m in history}
    if len(actual)!=len(history):raise ReleaseError('duplicate_history_version')
    common={m['version']:m for m in manifest['migrations']}
    baseline={m['version']for m in base['common_migrations']}
    required_extras={m['version']for m in base['vps_only']}if target=='vps'else set()
    optional={m['version']:m for m in base.get('optional_vps_only',[])}if target=='vps'else{}
    extras=required_extras|set(optional)
    if target not in {'vps','cloud'}:raise ReleaseError('unknown_database_target')
    if not baseline.union(required_extras).issubset(actual):raise ReleaseError('approved_baseline_missing')
    if set(actual)-set(common)-extras:raise ReleaseError('unrecorded_or_foreign_migration')
    for version,expected in base.get('baseline_history',{}).get(target,{}).items():
        if actual.get(version,{}).get('ledger_md5')!=expected:
            raise ReleaseError('historical_migration_ledger_changed')
    for version,row in actual.items():
        if version in optional and row.get('source_md5')!=optional[version]['source_md5']:
            raise ReleaseError('optional_bootstrap_source_mismatch')
        if version not in baseline and version not in extras:
            if row.get('source_md5')!=common[version]['source_md5']:
                raise ReleaseError('applied_migration_source_mismatch')
    pending=[m for m in manifest['migrations']if m['version']not in actual]
    # Pending files must be a suffix of the shared stream, not holes hidden by a later version.
    applied_common=sorted(set(actual)&set(common))
    if pending and applied_common and min(m['version']for m in pending)<max(applied_common):
        raise ReleaseError('non_suffix_pending_migrations')
    return pending

def require_approval(manifest,approved_id,risk_approval_id):
    verify_manifest(manifest)
    if approved_id!=manifest['manifest_id']:raise ReleaseError('exact_release_approval_required')
    if manifest['risks']and risk_approval_id!=manifest['manifest_id']:
        raise ReleaseError('explicit_database_risk_review_required')

def compare_catalog(expected,actual):
    left={(x['kind'],x['identity']):x['hash']for x in expected['objects']}
    right={(x['kind'],x['identity']):x['hash']for x in actual['objects']}
    differences=[{'kind':key[0],'identity':key[1]}for key in sorted(left.keys()|right.keys())if left.get(key)!=right.get(key)]
    for field in ['publications','privileges','default_privileges']:
        left_rows=sorted(expected.get(field)or[],key=canonical);right_rows=sorted(actual.get(field)or[],key=canonical)
        if left_rows!=right_rows:differences.append({'kind':field,'identity':field})
    if differences:raise ReleaseError('schema_drift:'+canonical(differences[:12]))

def history_key(versions):
    return digest(canonical(sorted(versions)))

def migration_transaction(item,source,expected_versions):
    analysis=sql_analysis(source)
    if analysis['blocked']:raise ReleaseError('migration_not_transaction_safe')
    tag='$rk_source_'+digest(source)[:16]+'$'
    if tag in source:raise ReleaseError('unexpected_sql_delimiter')
    versions=','.join("'"+v+"'"for v in sorted(expected_versions))
    expected='ARRAY['+versions+']::text[]'
    return ("BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='120s';"
            "SELECT pg_advisory_xact_lock(73195640281141);"
            "DO $guard$ BEGIN IF (SELECT coalesce(array_agg(version ORDER BY version),'{}')FROM supabase_migrations.schema_migrations) IS DISTINCT FROM "+expected+
            " THEN RAISE EXCEPTION 'Migration ledger changed';END IF;END $guard$;\n"
            "CREATE TEMP TABLE rk_release_delivery_guard ON COMMIT DROP AS SELECT md5(instance||':'||not_before::text) fingerprint FROM public.rk_delivery_config WHERE singleton;\n"+
            analysis['execution_sql']+"\nDO $boundary$ BEGIN IF (SELECT md5(instance||':'||not_before::text)FROM public.rk_delivery_config WHERE singleton)IS DISTINCT FROM(SELECT fingerprint FROM rk_release_delivery_guard)THEN RAISE EXCEPTION 'Delivery boundary changed';END IF;END $boundary$;\nINSERT INTO supabase_migrations.schema_migrations(version,name,statements)VALUES('"+
            item['version']+"','"+item['name']+"',ARRAY["+tag+source+tag+"]::text[]);NOTIFY pgrst,'reload schema';COMMIT;")
