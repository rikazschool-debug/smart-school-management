// Removes leftover synthetic load-test orgs («حمل الأتمتة <run>») whose own cleanup timed out. TEST database only.
// Refuses anything not named like a load org or created by a non-@rikaz.test account. Deletes students in chunks
// (one big delete hits the statement timeout), then hands the org to the service-only _purge_test_org.
import { createClient } from "@supabase/supabase-js";
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
  let removed = 0;
  for (;;) {
    const ids = ((await admin.from("students").select("id").in("school_id", schools).limit(200)).data ?? []).map((s: any) => s.id);
    if (!ids.length) break;
    for (const t of ["attendance_days", "enrollments", "student_guardians", "sf_obligations"]) await admin.from(t).delete().in("student_id", ids);
    let d = await admin.from("students").delete().in("id", ids);
    for (let i = 0; d.error && i < 12; i++) { // remove the referencing synthetic rows the FK names, then retry
      const t = /on table "(\w+)"$/.exec(d.error.message)?.[1]; if (!t || t === "students") break;
      const x = await admin.from(t).delete().in("student_id", ids); if (x.error) { console.log(o.name, t, x.error.message); break; }
      d = await admin.from("students").delete().in("id", ids);
    }
    if (d.error) { console.log(o.name, "students", d.error.message); break; }
    removed += ids.length;
  }
  const pr = await admin.rpc("_purge_test_org", { _org: o.id, _confirm: "purge:" + o.id });
  console.log(o.name, "students removed", removed, "purge", pr.error?.message ?? JSON.stringify(pr.data));
}
