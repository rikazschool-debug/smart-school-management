// Removes leftover synthetic load-test orgs («حمل الأتمتة <run>») whose own cleanup timed out. TEST database only.
// Refuses anything not named like a load org or created by a non-@rikaz.test account. Deletes students in chunks
// (one big delete hits the statement timeout), then hands the org to the service-only _purge_test_org.
import { createClient } from "@supabase/supabase-js";
import { chunkDeleteStudents } from "./lib/load-cleanup";
const URL = process.env["SUPABASE_URL"]!;
if (!URL.includes("czoaudsfbinpkwqsmhrd")) throw new Error("test database only");
const admin: any = createClient(URL, process.env["SUPABASE_SERVICE_ROLE_KEY"]!, { auth: { persistSession: false } });
const { data: orgs, error } = await admin.from("organizations").select("id,name,created_by").like("name", "حمل الأتمتة %");
if (error) throw error;
for (const o of orgs ?? []) {
  if (!/^حمل الأتمتة \d+$/.test(o.name)) { console.log("skip", o.name); continue; }
  const u = o.created_by ? (await admin.auth.admin.getUserById(o.created_by)).data?.user : null;
  if (u && !u.email?.endsWith("@rikaz.test")) { console.log("skip non-test creator", o.name); continue; }
  const schools = ((await admin.from("schools").select("id").eq("org_id", o.id)).data ?? []).map((s: any) => s.id);
  const { removed, error: stErr } = await chunkDeleteStudents(admin, schools, o.name); if (stErr) console.log(o.name, stErr);
  const pr = await admin.rpc("_purge_test_org", { _org: o.id, _confirm: "purge:" + o.id });
  console.log(o.name, "students removed", removed, "purge", pr.error?.message ?? JSON.stringify(pr.data));
}
