// Live WhatsApp code test on ONE consenting number (owner-approved). Never touches existing accounts:
// it uses a separate test login (metadata otp_live_test) staged with account_setup in the model school and no membership.
//   setup    — create/reuse the isolated test login for --phone
//   local    — signed hook call to the local sender (random test code) → WATI; prints the stored delivery state
//   supabase — real Supabase signInWithOtp (Supabase → Send SMS hook → WATI); prints the stored delivery state
//   status   — print the latest otp_sends rows for the number
//   teardown — delete the test login (only if it carries the otp_live_test mark)
// Usage: NODE_PATH=node_modules bun scripts/otp-live-test.ts <cmd> --phone 9665XXXXXXXX
import { createClient } from "@supabase/supabase-js";

const cmd = process.argv[2] ?? "status";
const phone = (process.argv[process.argv.indexOf("--phone") + 1] ?? "").replace(/\D/g, "");
if (!/^9665\d{8}$/.test(phone)) throw new Error("--phone 9665XXXXXXXX required");
const url = process.env["SUPABASE_URL"]!, srk = process.env["SUPABASE_SERVICE_ROLE_KEY"]!;
const admin = createClient(url, srk, { auth: { persistSession: false } });
const SCHOOL_NAME = "مدرسة ركاز النموذجية";

async function findTestUser() {
  const { data } = await admin.rpc("_auth_user_lookup" as never, { _email: null, _phone: phone } as never);
  const id = (data as unknown as { user_id: string }[] | null)?.[0]?.user_id;
  if (!id) return null;
  const { data: u } = await admin.auth.admin.getUserById(id);
  return u.user ? { id, mine: u.user.user_metadata?.["otp_live_test"] === true } : null;
}

async function status() {
  const { data, error } = await admin.from("otp_sends").select("status,failed_code,failed_detail,created_at,updated_at").eq("phone", phone).order("created_at", { ascending: false }).limit(5);
  if (error) throw error;
  console.table(data);
}

async function waitStatus(since: string, seconds = 90) {
  for (let i = 0; i < seconds / 5; i++) {
    const { data } = await admin.from("otp_sends").select("status,failed_detail").eq("phone", phone).gte("created_at", since).order("created_at", { ascending: false }).limit(1);
    const row = data?.[0] as { status: string; failed_detail: string | null } | undefined;
    console.log(`t+${i * 5}s`, row ? `${row.status}${row.failed_detail ? " — " + row.failed_detail : ""}` : "no row yet");
    if (row && ["delivered", "read", "failed", "refused"].includes(row.status)) return;
    await new Promise((r) => setTimeout(r, 5000));
  }
}

if (cmd === "setup") {
  const ex = await findTestUser();
  if (ex && !ex.mine) throw new Error("this number already belongs to a real login — refusing to touch it");
  let uid = ex?.id;
  if (!uid) {
    const { data, error } = await admin.auth.admin.createUser({ phone, phone_confirm: false, user_metadata: { full_name: "حساب تجربة رمز واتساب", otp_live_test: true } });
    if (error) throw error;
    uid = data.user.id;
  }
  const { data: sc } = await admin.from("schools").select("id").eq("name", SCHOOL_NAME).limit(1).single();
  const { error } = await admin.from("account_setup").upsert({ user_id: uid, school_id: (sc as { id: string }).id, kind: "teacher", subject_id: crypto.randomUUID(), need_phone: true, restore_active: false });
  if (error) throw error;
  console.log("test login ready (isolated, no membership):", uid);
} else if (cmd === "local") {
  const ex = await findTestUser();
  if (!ex?.mine) throw new Error("run setup first");
  const secret = process.env["SEND_SMS_HOOK_SECRET"]!.replace(/^v1,/, "").replace(/^whsec_/, "");
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  const body = JSON.stringify({ user: { id: ex.id, phone }, sms: { otp } });
  const id = `msg_${crypto.randomUUID()}`, ts = String(Math.floor(Date.now() / 1000));
  const key = await crypto.subtle.importKey("raw", Uint8Array.from(atob(secret), (c) => c.charCodeAt(0)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)))));
  const since = new Date(Date.now() - 2000).toISOString();
  const res = await fetch("http://localhost:8080/api/public/auth/send-sms", { method: "POST", headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": ts, "webhook-signature": `v1,${sig}` }, body });
  console.log("sender:", res.status, await res.text());
  await waitStatus(since);
} else if (cmd === "supabase") {
  const anon = createClient(url, process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]!, { auth: { persistSession: false } });
  const since = new Date(Date.now() - 2000).toISOString();
  const { error } = await anon.auth.signInWithOtp({ phone: `+${phone}`, options: { shouldCreateUser: false } });
  console.log("supabase:", error ? `${error.status ?? ""} ${error.message}` : "ok");
  await waitStatus(since);
} else if (cmd === "status") {
  await status();
} else if (cmd === "teardown") {
  const ex = await findTestUser();
  if (!ex) console.log("nothing to remove");
  else if (!ex.mine) throw new Error("not a test login — refusing");
  else { const { error } = await admin.auth.admin.deleteUser(ex.id); if (error) throw error; console.log("removed test login", ex.id); }
}
