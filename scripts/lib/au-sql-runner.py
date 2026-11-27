# Test-only: builds scripts/_run-<suite>.ts from an existing automation suite so it runs through scripts/lib/sql-admin.ts (scoped SQL token, no service key).
# Usage: python3 scripts/lib/au-sql-runner.py automation-platform-e-e2e; then SB_TOKEN_FILE=... SB_REF=... NODE_PATH=node_modules tsx scripts/_run-<suite>.ts
import sys,re
n=sys.argv[1]; s=open(f'/tmp/repo/scripts/{n}.ts').read()
s=s.replace('import "./lib/user-pool.ts";\n','').replace('import "./lib/au-suite-lock.ts";\n','')
s=re.sub(r'import \{ renderPendingFiles \} from "\.\./src/lib/au-files\.server";','import { sqlAdmin } from "./lib/sql-admin";\nconst renderPendingFiles = async (_u: string, _n: number) => { for (let i = 0; i < 40; i++) { const p = await (admin as any).from("au_files").select("id").eq("status", "pending"); if (!(p.data ?? []).length) break; await new Promise((r) => setTimeout(r, 5000)); } return 0; };',s)
if 'sqlAdmin' not in s: s=s.replace('import { createClient }','import { sqlAdmin } from "./lib/sql-admin";\nimport { createClient }',1)
s=s.replace('/dev-server/.env','/tmp/repo/.env')
s=s.replace('const admin = createClient(process.env["SUPABASE_URL"]!, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });','const admin: any = sqlAdmin();')
s=re.sub(r'const (\w+) = createClient\(process\.env\["SUPABASE_URL"\]!, process\.env\["SUPABASE_SERVICE_ROLE_KEY"\]!, \{ auth: \{ persistSession: false \} \}\);', r'const \1: any = sqlAdmin();', s)
open(f'/tmp/repo/scripts/_run-{n}.ts','w').write(s)
