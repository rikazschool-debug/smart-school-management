// Test-only stand-in for the service-role client: runs the same calls through the scoped Management API SQL endpoint
// (no service key needed). Supports the subset the automation suites use. Never used by the app.
import { readFileSync } from "fs";
const TOKEN = readFileSync(process.env["SB_TOKEN_FILE"]!, "utf8").trim();
const REF = process.env["SB_REF"]!;
export async function sql(q: string): Promise<{ rows?: any[]; error?: { message: string } }> {
  for (let i = 0; i < 5; i++) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "curl/8" }, body: JSON.stringify({ query: q }) });
    const t = await r.text();
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 1500 * (i + 1))); continue; }
    let j: any; try { j = JSON.parse(t); } catch { return { error: { message: t.slice(0, 300) } }; }
    if (!r.ok) return { error: { message: String(j.message ?? t).replace(/^Failed to run sql query: ERROR:\s*/, "").slice(0, 600) } };
    return { rows: j };
  }
  return { error: { message: "sql api unavailable" } };
}
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const lit = (v: any): string => v === null || v === undefined ? "NULL" : typeof v === "object" ? q(JSON.stringify(v)) + "::jsonb" : q(String(v));
const id = (s: string) => `"${s.replace(/"/g, "")}"`;
const pgArr = (a: any[]) => q("{" + a.map((x) => `"${String(x).replace(/(["\\])/g, "\\$1")}"`).join(",") + "}");
type F = string;
class QB implements PromiseLike<any> {
  op = "select"; cols = "*"; filters: F[] = []; payload: any; ord: string[] = []; lim?: number; mode: "many" | "single" | "maybe" = "many"; head = false; count = false;
  constructor(private t: string) {}
  select(c = "*", o?: any) { if (this.op === "select") { this.cols = c; if (o?.head) this.head = true; if (o?.count) this.count = true; } else { this.cols = c; (this as any).ret = true; } return this; }
  insert(p: any) { this.op = "insert"; this.payload = p; return this; }
  upsert(p: any, o?: any) { this.op = "upsert"; this.payload = p; (this as any).onc = o?.onConflict; return this; }
  update(p: any) { this.op = "update"; this.payload = p; return this; }
  delete() { this.op = "delete"; return this; }
  private f(c: string, o: string, v: any) { this.filters.push(`${id(c)} ${o} ${lit(v)}`); return this; }
  eq(c: string, v: any) { return this.f(c, "=", v); } neq(c: string, v: any) { return this.f(c, "<>", v); }
  gt(c: string, v: any) { return this.f(c, ">", v); } gte(c: string, v: any) { return this.f(c, ">=", v); } lt(c: string, v: any) { return this.f(c, "<", v); } lte(c: string, v: any) { return this.f(c, "<=", v); }
  like(c: string, v: any) { return this.f(c, "like", v); } ilike(c: string, v: any) { return this.f(c, "ilike", v); }
  is(c: string, v: any) { this.filters.push(`${id(c)} is ${v === null ? "null" : v ? "true" : "false"}`); return this; }
  in(c: string, v: any[]) { this.filters.push(v.length ? `${id(c)} in (${v.map(lit).join(",")})` : "false"); return this; }
  not(c: string, o: string, v: any) { if (o === "is") this.filters.push(`${id(c)} is not ${v === null ? "null" : v}`); else if (o === "in") this.filters.push(`${id(c)} not in (${(Array.isArray(v) ? v : String(v).replace(/[()]/g, "").split(",")).map(lit).join(",")})`); else this.filters.push(`not (${id(c)} ${o === "eq" ? "=" : o === "neq" ? "<>" : o} ${lit(v)})`); return this; }
  contains(c: string, v: any) { this.filters.push(`${id(c)} @> ${Array.isArray(v) ? pgArr(v) : lit(v)}`); return this; }
  order(c: string, o: any = {}) { this.ord.push(`${id(c)} ${o.ascending === false ? "desc" : "asc"}`); return this; }
  limit(n: number) { this.lim = n; return this; }
  single() { this.mode = "single"; return this; } maybeSingle() { this.mode = "maybe"; return this; }
  private where() { return this.filters.length ? " where " + this.filters.join(" and ") : ""; }
  private build(): string {
    const T = `public.${id(this.t)}`;
    if (this.op === "select") return `select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) r, (select count(*) from ${T}${this.where()}) c from (select * from ${T}${this.where()}${this.ord.length ? " order by " + this.ord.join(",") : ""}${this.lim ? " limit " + this.lim : ""}) x`;
    let body: string;
    if (this.op === "insert" || this.op === "upsert") {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
      const oc = (this as any).onc ? ` on conflict (${String((this as any).onc).split(",").map(id).join(",")}) do update set ${Object.keys(rows[0]).map((k) => `${id(k)}=excluded.${id(k)}`).join(",")}` : this.op === "upsert" ? " on conflict do nothing" : "";
      const ks = [...new Set(rows.flatMap((r: any) => Object.keys(r)))].map(id).join(","); body = `insert into ${T} (${ks}) select ${ks} from jsonb_populate_recordset(null::${T}, ${lit(rows)})${oc} returning *`;
    } else if (this.op === "update") {
      const set = Object.keys(this.payload).map((k) => `${id(k)} = (jsonb_populate_record(null::${T}, ${lit(this.payload)})).${id(k)}`).join(", ");
      body = `update ${T} set ${set}${this.where()} returning *`;
    } else body = `delete from ${T}${this.where()} returning *`;
    return `with w as (${body}) select coalesce(jsonb_agg(to_jsonb(w)),'[]'::jsonb) r, count(*) c from w`;
  }
  async run() {
    if (/\w\s*(!inner)?\(/.test(this.cols) && this.cols.includes("(") && this.op === "select") return { data: null, error: { message: "embedded select unsupported in sql-admin: " + this.cols }, count: null, status: 400 };
    const r = await sql(this.build());
    if (r.error) return { data: null, error: { message: r.error.message, code: /duplicate key/.test(r.error.message) ? "23505" : "sql" }, count: null, status: 400 };
    let rows: any[] = r.rows![0].r; const cnt = Number(r.rows![0].c);
    if (this.cols !== "*" && !this.cols.includes("(")) { const ks = this.cols.split(",").map((s) => s.trim()).filter(Boolean); rows = rows.map((x) => Object.fromEntries(ks.map((k) => [k, x[k]]))); }
    if (this.mode === "single") { if (rows.length !== 1) return { data: null, error: { message: rows.length ? "multiple rows" : "no rows", code: "PGRST116" }, count: cnt, status: 406 }; return { data: rows[0], error: null, count: cnt, status: 200 }; }
    if (this.mode === "maybe") return { data: rows[0] ?? null, error: null, count: cnt, status: 200 };
    const wantsRows = this.op === "select" || this.cols !== "*" || (this as any).ret === true;
    return { data: this.head ? null : (this.op === "select" || wantsRows ? rows : null), error: null, count: this.count || this.head ? cnt : null, status: 200 };
  }
  then<A, B>(f?: any, g?: any): Promise<A | B> { return this.run().then(f, g); }
}
async function rpc(fn: string, args: Record<string, any> = {}) {
  const mk = (arrAsPg: boolean) => Object.entries(args).map(([k, v]) => `${id(k)} => ${Array.isArray(v) && arrAsPg ? pgArr(v) : lit(v)}`).join(", ");
  let r = await sql(`select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) r from (select * from public.${id(fn)}(${mk(true)})) t`);
  if (r.error && Object.values(args).some(Array.isArray) && /does not exist|invalid input syntax|malformed/.test(r.error.message)) r = await sql(`select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) r from (select * from public.${id(fn)}(${mk(false)})) t`);
  if (r.error) return { data: null, error: { message: r.error.message, code: /duplicate key/.test(r.error.message) ? "23505" : "sql" } };
  const rows: any[] = r.rows![0].r;
  if (rows.length >= 1 && rows.every((x) => Object.keys(x).length === 1 && fn in x)) {
    const ps = await sql(`select bool_or(proretset) s from pg_proc where proname=${lit(fn)} and pronamespace='public'::regnamespace`);
    if (ps.rows?.[0]?.s) return { data: rows.map((x) => x[fn]), error: null }; // set-returning function: always a list, even for one row
  }
  if (rows.length === 1 && Object.keys(rows[0]).length === 1 && fn in rows[0]) return { data: rows[0][fn] === "" ? null : rows[0][fn], error: null };
  return { data: rows, error: null };
}
export function sqlAdmin() {
  const noop = { remove: async () => ({ data: null, error: null }), upload: async () => ({ data: null, error: null }), download: async () => ({ data: null, error: { message: "storage unsupported in sql-admin" } }) };
  return {
    from: (t: string) => new QB(t), rpc,
    storage: { from: () => noop },
    auth: { admin: {
      async createUser(o: any) {
        const r = await sql(`with u as (insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change,email_change_token_current,reauthentication_token,phone_change,phone_change_token)
          values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(),'authenticated','authenticated',${lit(o.email)}, extensions.crypt(${lit(o.password)}, extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, ${lit(o.user_metadata ?? {})}, now(), now(), '','','','','','','','') returning id, email),
          i as (insert into auth.identities (id,user_id,provider_id,provider,identity_data,created_at,updated_at,last_sign_in_at) select gen_random_uuid(), id, id::text, 'email', jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now(), now() from u) select id from u`);
        if (r.error) return { data: { user: null }, error: { message: r.error.message } };
        return { data: { user: { id: r.rows![0].id, email: o.email } }, error: null };
      },
      async deleteUser(uid: string) { const r = await sql(`delete from auth.users where id=${lit(uid)}`); return { data: null, error: r.error ?? null }; },
    } },
  } as any;
}
