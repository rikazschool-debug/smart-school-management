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
    result=[];seen=set()
    for folder,scope in [(root/'supabase/migrations','shared'),(root/'supabase/vps-migrations','vps')]:
        if not folder.exists()and scope=='vps':continue
        if folder.is_symlink():raise ReleaseError('migration_folder_not_regular')
        for path in sorted(folder.iterdir()):
            match=re.fullmatch(r'(\d{14})_([a-zA-Z0-9_-]+)\.sql',path.name)
            if not match:raise ReleaseError('unexpected_migration_file')
            if match[1]in seen:raise ReleaseError('duplicate_migration_version')
            seen.add(match[1]);source=read_sql(path)
            item={'path':path.relative_to(root).as_posix(),'version':match[1],
                  'name':match[2],'sha256':digest(source),'source_md5':hashlib.md5(source.encode()).hexdigest()}
            if scope=='vps':item['scope']='vps'
            result.append(item)
    return sorted(result,key=lambda m:m['version'])


def target_migrations(manifest,target):
    if target not in {'vps','cloud'}:raise ReleaseError('unknown_database_target')
    ordered=[m for m in manifest['migrations']if m.get('scope','shared')in('shared',target)]
    for rule in manifest.get('migration_prerequisites',[]):
        by_version={m['version']:m for m in ordered}
        if rule['migration']not in by_version:continue
        if rule['before']not in by_version or rule['after']not in by_version:
            raise ReleaseError('migration_prerequisite_target_missing')
        item=by_version[rule['migration']];ordered.remove(item)
        before=next(i for i,m in enumerate(ordered)if m['version']==rule['before'])
        ordered.insert(before,item)
    positions={m['version']:i for i,m in enumerate(ordered)}
    for rule in manifest.get('migration_prerequisites',[]):
        if rule['migration']in positions and not positions[rule['after']]<positions[rule['migration']]<positions[rule['before']]:
            raise ReleaseError('migration_prerequisite_order_invalid')
    return ordered

def normalized_ast(value):
    if isinstance(value,dict):return {k:normalized_ast(v)for k,v in value.items()if k not in {'location','arg_location','stmt_location','stmt_len','list_start','list_end'}}
    if isinstance(value,list):return [normalized_ast(v)for v in value]
    return value

def operational_cloud_overlays(root,files,frozen):
    path=root/'infrastructure/vps-app/operational-cloud-migrations.json'
    if not path.exists():return []
    if path.is_symlink():raise ReleaseError('operational_migration_path_not_regular')
    rows=json.loads(path.read_text());by_version={m['version']:m for m in files};seen=set()
    if not isinstance(rows,list):raise ReleaseError('operational_migration_format_invalid')
    for rule in rows:
        if not isinstance(rule,dict)or set(rule)!={'version','source_sha256','schema_replacement','schema_sha256','schema_statements'}:
            raise ReleaseError('operational_migration_format_invalid')
        old=by_version.get(rule['version']);replacement=by_version.get(rule['schema_replacement']);n=rule['schema_statements']
        if not old or not replacement or old is replacement or old['version']in frozen or replacement['version']in frozen or old.get('scope','shared')!='shared'or replacement.get('scope','shared')!='shared'or old['version']in seen:
            raise ReleaseError('operational_migration_reference_invalid')
        if old['sha256']!=rule['source_sha256']or replacement['sha256']!=rule['schema_sha256']:
            raise ReleaseError('operational_migration_source_changed')
        original=json.loads(parser.parse_sql_json(read_sql(root/old['path'])))['stmts']
        declarative=json.loads(parser.parse_sql_json(read_sql(root/replacement['path'])))['stmts']
        if not isinstance(n,int)or isinstance(n,bool)or not 0<n<len(original)or len(declarative)!=n or normalized_ast(original[:n])!=normalized_ast(declarative):
            raise ReleaseError('operational_schema_replacement_changed')
        if any(next(iter(x['stmt']))not in{'CreateFunctionStmt','DoStmt','GrantStmt','CommentStmt'}for x in declarative):
            raise ReleaseError('operational_schema_replacement_not_declarative')
        old['scope']='cloud';old['qa_replay_path']=replacement['path'];old['qa_replay_sha256']=replacement['sha256'];seen.add(old['version'])
    return rows

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
    operational=operational_cloud_overlays(root,files,frozen)
    additions=[m for m in files if m['version']not in frozen]
    order_path=root/'infrastructure/vps-app/migration-prerequisites.json'
    prerequisites=[]
    if order_path.exists():
        if order_path.is_symlink():raise ReleaseError('migration_prerequisite_path_not_regular')
        prerequisites=json.loads(order_path.read_text())
        if not isinstance(prerequisites,list):raise ReleaseError('migration_prerequisite_format_invalid')
        versions={m['version']for m in files};seen=set()
        for rule in prerequisites:
            if not isinstance(rule,dict)or set(rule)!={'migration','before','after'}or any(not isinstance(v,str)or not re.fullmatch('[0-9]{14}',v)for v in rule.values()):
                raise ReleaseError('migration_prerequisite_format_invalid')
            if rule['migration']in frozen or rule['before']in frozen or set(rule.values())-versions or len(set(rule.values()))!=3 or rule['migration']in seen:
                raise ReleaseError('migration_prerequisite_reference_invalid')
            seen.add(rule['migration'])
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
              'migration_prerequisites':prerequisites,
              'operational_cloud_migrations':operational,
              'risks':{m['version']:m['analysis']['risks']for m in additions if m['analysis']['risks']},
              'protected_runtime_files':protected,'database_rollback':'forward_only',
              'application_rollback':'only_after_old_image_new_schema_compatibility',
              'real_provider_calls_in_tests':False}
    target_migrations(manifest,'cloud');target_migrations(manifest,'vps')
    manifest['manifest_id']=digest(canonical(manifest));return manifest

def verify_manifest(manifest):
    expected=manifest.get('manifest_id');body={k:v for k,v in manifest.items()if k!='manifest_id'}
    if not expected or digest(canonical(body))!=expected:raise ReleaseError('manifest_digest_mismatch')

def validate_history(manifest,base,history,target):
    """Preserve the different approved ledgers; never repair, rewrite or infer an applied row."""
    verify_manifest(manifest)
    actual={m['version']:m for m in history}
    if len(actual)!=len(history):raise ReleaseError('duplicate_history_version')
    common={m['version']:m for m in target_migrations(manifest,target)}
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
    pending=[m for m in target_migrations(manifest,target)if m['version']not in actual]
    # Shared and VPS-only ledgers advance independently. Neither stream may hide a hole,
    # but a later VPS version must not force an unrelated cloud migration to be renamed.
    for scope in ['shared','vps','cloud']:
        prerequisites={r['migration']for r in manifest.get('migration_prerequisites',[])}
        stream=[m['version']for m in target_migrations(manifest,target)if m.get('scope','shared')==scope and m['version']not in prerequisites]
        positions={v:i for i,v in enumerate(stream)}
        applied=[positions[v]for v in stream if v in actual];missing=[positions[v]for v in stream if v not in actual]
        if missing and applied and min(missing)<max(applied):raise ReleaseError('non_suffix_pending_migrations')
    for rule in manifest.get('migration_prerequisites',[]):
        if rule['migration']in actual and rule['after']not in actual:raise ReleaseError('applied_prerequisite_dependency_missing')
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

def registry_prerequisite_codes(root,manifest,versions):
    """Only constant INSERT/ON CONFLICT NOTHING platform catalogue repairs can lag on cloud.

    A missing schema/business migration is never admitted. Both the complete schema
    and the repaired catalogue rows must still match the isolated replay.
    """
    declared={r['migration']for r in manifest.get('migration_prerequisites',[])}
    items={m['version']:m for m in target_migrations(manifest,'cloud')}
    codes=set()
    def constant(value):
        if not isinstance(value,dict):return False
        if set(value)=={'A_Const'}:return True
        if set(value)=={'A_ArrayExpr'}:return all(constant(x)for x in value['A_ArrayExpr'].get('elements',[]))
        return False
    for version in versions:
        if version not in declared or version not in items:raise ReleaseError('cloud_history_not_represented_in_git')
        stmts=json.loads(parser.parse_sql_json(read_sql(root/items[version]['path'])))['stmts']
        if len(stmts)!=1 or set(stmts[0]['stmt'])!={'InsertStmt'}:raise ReleaseError('cloud_missing_migration_is_not_registry_seed')
        node=stmts[0]['stmt']['InsertStmt'];rel=node['relation'];select=node.get('selectStmt',{}).get('SelectStmt',{})
        if set(node)-{'relation','cols','selectStmt','onConflictClause','override'}or node.get('override','OVERRIDING_NOT_SET')!='OVERRIDING_NOT_SET'or rel.get('schemaname')!='public'or rel.get('relname')!='au_events'or node.get('onConflictClause',{}).get('action')!='ONCONFLICT_NOTHING'or set(select)-{'op','valuesLists','limitOption'}or select.get('limitOption','LIMIT_OPTION_DEFAULT')!='LIMIT_OPTION_DEFAULT':
            raise ReleaseError('cloud_missing_migration_is_not_registry_seed')
        cols=[x['ResTarget']['name']for x in node.get('cols',[])];rows=select.get('valuesLists',[])
        if not rows or 'code'not in cols:raise ReleaseError('cloud_registry_seed_invalid')
        for row in rows:
            values=row['List']['items']if isinstance(row,dict)else row
            if len(values)!=len(cols)or not all(constant(v)for v in values):raise ReleaseError('cloud_registry_seed_invalid')
            code=values[cols.index('code')].get('A_Const',{}).get('sval',{}).get('sval')
            if not isinstance(code,str)or not re.fullmatch('[a-z][a-z0-9_.]{1,100}',code):raise ReleaseError('cloud_registry_seed_invalid')
            codes.add(code)
    return sorted(codes)

def registry_prerequisite_query(codes):
    if any(not re.fullmatch('[a-z][a-z0-9_.]{1,100}',c)for c in codes):raise ReleaseError('cloud_registry_seed_invalid')
    quoted=','.join("'"+c+"'"for c in codes)or'NULL'
    return "SELECT coalesce(jsonb_object_agg(code,md5(to_jsonb(e)::text)),'{}') AS registry FROM public.au_events e WHERE code IN("+quoted+")"

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
