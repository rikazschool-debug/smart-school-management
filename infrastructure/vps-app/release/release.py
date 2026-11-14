#!/usr/bin/env python3
"""Credential-free review CLI. Production mutations exist only in root-installed server.py."""
import argparse,json,pathlib,sys
from policy import ReleaseError,canonical,make_manifest,verify_manifest,require_approval

def summary(manifest):
    risks=manifest['risks']
    return ('# إصدار ركاز المرشح\n\n'
            '- commit: `'+manifest['commit']+'`\n'
            '- معرّف الاعتماد: `'+manifest['manifest_id']+'`\n'
            '- ملفات الترحيلات: '+str(len(manifest['migrations']))+'\n'
            '- الملفات الجديدة منذ baseline: '+str(len(manifest['additions']))+'\n'
            '- مخاطر تحتاج مراجعة صريحة: '+('نعم'if risks else'لا مخاطر مصنفة في الملفات الجديدة')+'\n\n'
            +('\n'.join('- `'+v+'`: '+', '.join(reasons)for v,reasons in risks.items())+'\n\n'if risks else'')+
            'الترحيلات المعلقة فعليًا تحدد من سجل VPS قبل الكتابة. لا يعاد تطبيق الاستثناء الخاص بالإنتاج.\n\n'
            'هذا التقرير لا ينشر التطبيق. اختيار هذا الإصدار يحتاج تشغيل workflow النشر وموافقة production-vps. '
            'عند وجود مخاطر، اكتب معرّف الاعتماد نفسه في حقل مراجعة مخاطر القاعدة بعد مراجعة SQL. '
            'تغيّر main لاحقًا لا يغيّر الإصدار المحدد.\n')

def main():
    parser=argparse.ArgumentParser();sub=parser.add_subparsers(dest='command',required=True)
    m=sub.add_parser('manifest');m.add_argument('--root',type=pathlib.Path,required=True);m.add_argument('--commit',required=True);m.add_argument('--output',type=pathlib.Path,required=True)
    s=sub.add_parser('summary');s.add_argument('--manifest',type=pathlib.Path,required=True);s.add_argument('--output',type=pathlib.Path,required=True)
    r=sub.add_parser('request');r.add_argument('--manifest',type=pathlib.Path,required=True);r.add_argument('--approved-id',required=True);r.add_argument('--risk-approval-id',default='');r.add_argument('--checks-run-id',type=int,required=True);r.add_argument('--output',type=pathlib.Path,required=True)
    a=parser.parse_args()
    if a.command=='manifest':
        result=make_manifest(a.root.resolve(),a.commit);a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(canonical(result))
        print(canonical({'commit':result['commit'],'manifest_id':result['manifest_id'],'new_migration_files':len(result['additions']),'risk_review_required':bool(result['risks'])}))
    else:
        manifest=json.loads(a.manifest.read_text());verify_manifest(manifest)
        if a.command=='summary':a.output.write_text(summary(manifest))
        else:
            if a.checks_run_id<=0:raise ReleaseError('invalid_checks_run_id')
            require_approval(manifest,a.approved_id,a.risk_approval_id)
            a.output.write_text(canonical({'commit':manifest['commit'],'checks_run_id':a.checks_run_id,'approved_manifest_id':a.approved_id,'risk_approval_id':a.risk_approval_id}))

if __name__=='__main__':
    try:main()
    except ReleaseError as error:print(canonical({'passed':False,'error':str(error).split(':',1)[0]}));raise SystemExit(1)
