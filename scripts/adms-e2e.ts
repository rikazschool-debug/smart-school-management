// ZKTeco ADMS link: real bridge process (bridge/adms-bridge.mjs) + simulated device HTTP pushes → signed intake → punches.
// Checks: serial binding, attendance-only forwarding, PIN = employee number, unmatched review + link moves rows,
// other-school PIN, resend idempotency, wrong serial at bridge and server, status fields, key rotation, permissions.
// Needs the dev server on :8080. Run: NODE_PATH=node_modules bun scripts/adms-e2e.ts
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { spawn } from "child_process";
import { TestRun } from "./lib/test-run";
const env = Object.fromEntries(readFileSync("/dev-server/.env", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const URL = env.VITE_SUPABASE_URL, PK = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const shim = (key: string) => (input: any, init: any = {}) => { const h = new Headers(init.headers); if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization"); h.set("apikey", key); return fetch(input, { ...init, headers: h }); };
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const tr = new TestRun(admin, "adm");
const run = Date.now(), pw = "Test-pass-" + run;
let ok = 0, bad = 0;
const check = (n: string, c: boolean, e?: unknown) => { c ? ok++ : bad++; console.log(c ? "PASS" : "FAIL", n, c ? "" : JSON.stringify(e)?.slice(0, 400)); };
const has = (r: any, s: string) => String(r?.error?.message ?? "").includes(s);
async function user(tag: string) {
  const email = `adm-${tag}-${run}@rikaz.test`;
  await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  const c = createClient(URL, PK, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: shim(PK) as any } });
  const s = await c.auth.signInWithPassword({ email, password: pw }); if (s.error) throw s.error;
  tr.addUser(s.data.user!.id); return { c, id: s.data.user!.id };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function bridge(port: number, id: string, secret: string, sn: string) {
  const p = spawn("node", ["/dev-server/bridge/adms-bridge.mjs"], { env: { ...process.env, RIKAZ_URL: "http://localhost:8080", DEVICE_ID: id, DEVICE_SECRET: secret, DEVICE_SN: sn, PORT: String(port), TZ_OFFSET: "+03:00" } });
  p.stdout.on("data", (d) => process.env.DEBUG && console.log(String(d))); p.stderr.on("data", (d) => console.log("bridge err", String(d)));
  return p;
}
// Riyadh local "YYYY-MM-DD HH:MM:SS", hours ago
const local = (hAgo: number) => new Date(Date.now() + 3 * 3600_000 - hAgo * 3600_000).toISOString().slice(0, 19).replace("T", " ");
const orgs: string[] = []; const procs: any[] = [];
try {
  const owner = await user("owner"), plain = await user("plain");
  const org = (await owner.c.rpc("create_organization", { _org_name: "مؤسسة البصمة", _school_name: "فرع أ" })).data; orgs.push(org);
  const A = (await admin.from("schools").select("id").eq("org_id", org).single()).data!.id; tr.addSchool(A);
  const B = (await admin.from("schools").insert({ org_id: org, name: "فرع ب" }).select().single()).data!.id; tr.addSchool(B);
  await admin.from("memberships").insert({ user_id: plain.id, org_id: org, school_id: A, role: "teacher" });
  const mk = async (s: string, n: string) => (await owner.c.rpc("hr_employee_save", { _org: org, _id: null, _p: { full_name: n, school_id: s, job_title: "موظف", hire_date: "2024-09-01" } })).data as string;
  const E = await mk(A, "موظف أ"), F = await mk(A, "موظف بلا رقم مطابق"), G = await mk(B, "موظف ب");
  const no = async (id: string) => (await admin.from("hr_employees").select("employee_no").eq("id", id).single()).data!.employee_no as string;
  const eNo = await no(E), gNo = await no(G);

  const dev = (await owner.c.rpc("hr_att_device_save", { _org: org, _school: A, _name: "بوابة أ" })).data as { id: string; secret: string };
  const SN = "CQZ7" + String(run).slice(-8);
  check("non-HR user cannot configure device", has(await plain.c.rpc("hr_att_device_config", { _id: dev.id, _school: A, _serial: SN }), "غير مصرح"));
  check("serial format validated", has(await owner.c.rpc("hr_att_device_config", { _id: dev.id, _school: A, _serial: "ab-1" }), "الرقم التسلسلي"));
  // before serial is set, the bridge path is refused
  const old = dev.secret;
  const rot = (await owner.c.rpc("hr_att_device_rotate", { _id: dev.id })).data as { secret: string };
  check("rotation issues a different key", !!rot?.secret && rot.secret !== old, rot);
  const pOld = bridge(18091, dev.id, old, SN); procs.push(pOld);
  const pNoSn = bridge(18092, dev.id, rot.secret, SN); procs.push(pNoSn);
  await sleep(800);
  const post = (port: number, sn: string, table: string, body: string) => fetch(`http://localhost:${port}/iclock/cdata?SN=${sn}&table=${table}&Stamp=1`, { method: "POST", body });
  const r0 = await post(18092, SN, "ATTLOG", `${eNo}\t${local(2)}\t0\t1\t0\n`);
  check("serial not set in Rikaz → refused, device will resend", r0.status === 500, r0.status);
  check("config saved", !(await owner.c.rpc("hr_att_device_config", { _id: dev.id, _school: A, _serial: SN })).error);
  const rOld = await post(18091, SN, "ATTLOG", `${eNo}\t${local(2)}\t0\t1\t0\n`);
  check("old (leaked) key no longer accepted", rOld.status === 500, rOld.status);

  const hs = await (await fetch(`http://localhost:18092/iclock/cdata?SN=${SN}&options=all`)).text();
  check("handshake asks for attendance only", hs.includes("TransFlag=TransData AttLog") && hs.includes(`GET OPTION FROM: ${SN}`), hs);
  check("other device serial ignored by bridge", (await post(18092, "OTHER123", "ATTLOG", `${eNo}\t${local(1)}\t0\t1\n`)).status === 403);
  const tIn = local(3), tOut = local(1);
  const body = `${eNo}\t${tIn}\t0\t1\t0\n${eNo}\t${tOut}\t1\t1\t0\n77777\t${tIn}\t0\t1\t0\n${gNo}\t${tIn}\t0\t1\t0\n`;
  const r1 = await post(18092, SN, "ATTLOG", body);
  if (process.env.DEBUG) { const x = await admin.rpc("_hr_att_ingest2" as any, { _dev: dev.id, _sn: SN, _rows: [{ employee_no: "77777", at: new Date().toISOString(), ref: "dbg1" }], _info: {} }); console.log("DBG", x.error?.message, x.data); }
  check("device push accepted", r1.status === 200 && (await r1.text()) === "OK: 4", r1.status);
  const punches = async (emp: string) => (await admin.from("hr_att_punches").select("at,source,device_id").eq("employee_id", emp)).data ?? [];
  const pe = await punches(E);
  check("in + out landed on the correct employee file", pe.length === 2 && pe.every((p: any) => p.source === "device" && p.device_id === dev.id), pe);
  check("other-school employee not recorded", (await punches(G)).length === 0);
  await post(18092, SN, "ATTLOG", body);
  check("resend adds nothing", (await punches(E)).length === 2);
  const bio = await post(18092, SN, "BIODATA", "Pin=1\tNo=0\tTmp=AAAA\n");
  const op = await post(18092, SN, "OPERLOG", "USER PIN=1\tName=x\n");
  check("templates/user data acknowledged but not forwarded", bio.status === 200 && op.status === 200 && (await admin.from("hr_att_unmatched").select("id").eq("pin", "1").eq("device_id", dev.id)).data?.length === 0);

  const um = (await owner.c.rpc("hr_att_unmatched_list", { _dev: dev.id })).data as any[];
  check("unmatched listed for review (unknown + other school)", um.length === 2 && um.find((u) => u.pin === "77777")?.reason === "unknown_pin" && um.find((u) => u.pin === gNo)?.reason === "other_school", um);
  check("cannot link to employee of another school", has(await owner.c.rpc("hr_att_pin_link", { _dev: dev.id, _pin: gNo, _emp: G }), "مدرسة"));
  const ln = (await owner.c.rpc("hr_att_pin_link", { _dev: dev.id, _pin: "77777", _emp: F })).data;
  check("linking moves waiting rows to the employee", ln?.moved === 1 && (await punches(F)).length === 1, ln);
  await post(18092, SN, "ATTLOG", `77777\t${local(0.5)}\t1\t1\t0\n`);
  check("remembered link used for new rows", (await punches(F)).length === 2);
  check("dismiss needs reason", has(await owner.c.rpc("hr_att_unmatched_dismiss", { _dev: dev.id, _pin: gNo, _reason: "" }), "السبب"));
  await owner.c.rpc("hr_att_unmatched_dismiss", { _dev: dev.id, _pin: gNo, _reason: "موظف زائر" });
  check("review list empty after decisions", ((await owner.c.rpc("hr_att_unmatched_list", { _dev: dev.id })).data as any[]).length === 0);

  await fetch(`http://localhost:18092/iclock/getrequest?SN=${SN}`); await sleep(2500);
  const st = ((await owner.c.rpc("hr_att_setup", { _org: org })).data as any).devices.find((d: any) => d.id === dev.id);
  check("status: last contact, device contact, last record", !!st.last_seen && !!st.device_seen && !!st.last_punch_at && st.serial_no === SN && st.unmatched === 0, st);
  const pBad = bridge(18093, dev.id, rot.secret, "WRONGSN999"); procs.push(pBad); await sleep(800);
  check("bridge configured with another serial refused by Rikaz", (await post(18093, "WRONGSN999", "ATTLOG", `${eNo}\t${local(0.2)}\t0\t1\n`)).status === 500);
} catch (e) { bad++; console.log("FAIL crash", e); }
finally { for (const p of procs) p.kill(); for (const o of orgs) await tr.purgeOrg(o).catch((e: unknown) => console.log("cleanup", e)); for (const u of tr.users) await admin.auth.admin.deleteUser(u); }
console.log(`\n${ok} passed, ${bad} failed`); process.exit(bad ? 1 : 0);
