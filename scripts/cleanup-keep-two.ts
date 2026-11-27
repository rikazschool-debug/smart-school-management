// TEST database (rikaz2027) only: removes every organization except the two kept by ID, using the approved
// service-only _purge_test_org (which itself refuses both kept IDs). Students go first in small chunks
// (scripts/lib/load-cleanup.ts). Resumable: each run works on whatever orgs remain. Protected financial history is
// never bypassed; orgs it blocks are reported, not forced. Storage files become unlinked and are removed by run_file_cleanup.
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";
import { chunkDeleteStudents } from "./lib/load-cleanup";
const URL = process.env["SUPABASE_URL"]!;
if (!URL.includes("czoaudsfbinpkwqsmhrd")) throw new Error("test database (rikaz2027) only");
const KEEP = new Set(["a9a4b7e2-ab44-4bcf-a1bf-ebce6489f074", "916b6457-526a-48d0-b854-85547fb72305"]);
const admin: any = createClient(URL, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const orgs = ((await admin.from("organizations").select("id,name").order("created_at")).data ?? []).filter((o: any) => !KEEP.has(o.id));
const out: any[] = [];
for (const o of orgs) {
  const schools = ((await admin.from("schools").select("id").eq("org_id", o.id)).data ?? []).map((s: any) => s.id);
  const st = schools.length ? await chunkDeleteStudents(admin, schools, o.name) : { removed: 0 };
  const pr = await admin.rpc("_purge_test_org", { _org: o.id, _confirm: "purge:" + o.id });
  const res = { id: o.id, name: o.name, students: st.removed, ok: !pr.error && pr.data?.ok, error: pr.error?.message ?? pr.data?.error ?? st.error ?? null };
  out.push(res); if (!res.ok) console.log("KEPT", o.name, res.error);
}
writeFileSync(process.argv[2] ?? "/tmp/bk/cleanup.json", JSON.stringify(out, null, 1));
console.log("orgs", orgs.length, "deleted", out.filter((r) => r.ok).length, "blocked", out.filter((r) => !r.ok).length);
