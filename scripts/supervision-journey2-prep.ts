// Prep for scripts/supervision-journey2.py (needs supervision-e2e --keep fixture). Uses only the fixture's accounts:
// a complete support-visit draft by the supervisor, and a principal-authored submitted record (self-approval check).
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
const FX = JSON.parse(readFileSync("/tmp/browser/supervision/fixture.json", "utf8"));
const URL = process.env.SUPABASE_URL!, PK = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
async function as(who: string) { const c = createClient(URL, PK, { auth: { persistSession: false } }); const s = await c.auth.signInWithPassword({ email: FX.users[who], password: FX.pw }); if (s.error) throw s.error; return c; }
const iso = (sec: number) => new Date(Date.now() + sec * 1000).toISOString();
const te1 = (await admin.from("teachers").select("id").eq("school_id", FX.A).eq("email", FX.users.t1).single()).data!.id;
const sup = await as("sup"), pr = await as("pr"), owner = await as("owner");
const full = { scheduled_at: iso(-3600), actual_at: iso(-3000), lesson: "النسبة والتناسب", visit_kind: "مجدولة", feedback: "تغذية راجعة وصفية للمعلمة", feedback_at: iso(-2000),
  obs: { o1: { level: "متمكن" }, o2: { state: "nl" }, o3: { level: "في طور النمو" }, o4: { state: "na", reason: "لا يوجد تقويم في هذه الحصة" }, o5: { level: "متمكن" }, o6: { level: "متمكن" } }, recs: [{ text: "تنويع أسئلة التقويم", follow_due: "2026-12-15" }] };
const r2 = await sup.rpc("sv_rec_save", { _id: null, _rev: null, _p: { school_id: FX.A, form_key: "support_visit", teacher_id: te1, data: full } });
if (r2.error) throw r2.error;
const list = (await owner.rpc("sv_form_list", { _org: FX.org })).data as any[];
const orgKeys = new Set(list.filter((f) => f.org_id === FX.org && f.status === "published").map((f) => f.key));
const tpl = list.find((f) => f.is_template && !orgKeys.has(f.key));
// principal-authored record for the self-approval check
let own: string | null = null, ownErr: string | null = null;
for (const k of ["minutes", "pd_need", "program", "work_review"]) {
  const f = list.find((x) => x.org_id === FX.org && x.key === k && x.status === "published"); if (!f) continue;
  const c = await pr.rpc("sv_rec_save", { _id: null, _rev: null, _p: { school_id: FX.A, form_key: k, teacher_id: f.spec?.teacher ? te1 : null, data: {} } });
  if (c.error) { ownErr = `${k}: ${c.error.message}`; continue; }
  own = c.data as string; ownErr = null; break;
}
writeFileSync("/tmp/browser/supervision/fixture2.json", JSON.stringify({ r2: r2.data, tpl_title: tpl?.title, tpl_key: tpl?.key, adopted: [...orgKeys], own, ownErr }, null, 1));
console.log({ r2: r2.data, tpl: tpl?.title, own, ownErr });
