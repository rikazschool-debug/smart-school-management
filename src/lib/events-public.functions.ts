// Public course registration (no Rikaz account). Every rule runs in service-only SQL (_evt_public_*): link state, form version,
// answer validation, duplicate/idempotency and rate limits. This layer adds the anti-bot checks (honeypot + minimum fill time)
// and passes a hashed client address — the raw IP is never stored. Nothing here creates an account or a student record.
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

const TOKEN = /^[0-9a-f]{36}$/;
const CODE = /^[0-9a-f]{48}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function clientHash(): Promise<string> {
  const raw = (getRequestHeader("cf-connecting-ip") || getRequestHeader("x-forwarded-for") || "?").split(",")[0]!.trim();
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("evt:" + raw));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

// results travel as JSON text (the SQL result is plain JSON) and are parsed by the wrappers below
async function call(fn: string, args: Record<string, unknown>): Promise<string> {
  const sb = await admin();
  const { data, error } = await sb.rpc(fn as never, args as never);
  if (error) { console.error("evt public", fn, error.message); return JSON.stringify({ error: "server" }); }
  return JSON.stringify(data ?? { error: "server" });
}

/** answers: only plain JSON values (string | boolean | string[]), bounded size. */
function cleanAnswers(a: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!a || typeof a !== "object" || Array.isArray(a)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(a as Record<string, unknown>)) {
    if (++n > 100 || !/^[a-z0-9_]{1,40}$/.test(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 4000);
    else if (typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === "string").slice(0, 50).map((x) => String(x).slice(0, 200));
  }
  return out;
}

export const getPublicCourseFn = createServerFn({ method: "GET" })
  .inputValidator((d: { token: string }) => ({ token: String(d?.token ?? "").toLowerCase().slice(0, 64) }))
  .handler(async ({ data }) => {
    if (!TOKEN.test(data.token)) return JSON.stringify({ state: "invalid" });
    return call("_evt_public_get", { _token: data.token });
  });

export const submitPublicCourseFn = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; version: number; answers: unknown; clientKey: string; hp?: string; elapsed?: number }) => ({
    token: String(d?.token ?? "").toLowerCase().slice(0, 64), version: Number(d?.version) || 0, answers: cleanAnswers(d?.answers),
    clientKey: String(d?.clientKey ?? ""), hp: String(d?.hp ?? ""), elapsed: Number(d?.elapsed) || 0,
  }))
  .handler(async ({ data }) => {
    if (!TOKEN.test(data.token) || !UUID.test(data.clientKey)) return JSON.stringify({ error: "invalid", message: "طلب غير صالح" });
    // anti-bot: hidden field must stay empty and a human needs a few seconds to fill the form
    if (data.hp || data.elapsed < 4000) return JSON.stringify({ error: "bot" });
    return call("_evt_public_submit", { _token: data.token, _ip: await clientHash(), _version: data.version, _answers: data.answers, _client_key: data.clientKey });
  });

export const trackPublicAppFn = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string }) => ({ code: String(d?.code ?? "").toLowerCase().slice(0, 64) }))
  .handler(async ({ data }) => {
    if (!CODE.test(data.code)) return JSON.stringify({ error: "invalid" });
    return call("_evt_public_track", { _code: data.code, _ip: await clientHash() });
  });

export const updatePublicAppFn = createServerFn({ method: "POST" })
  .inputValidator((d: { code: string; rev: number; action: "update" | "withdraw"; answers?: unknown }) => ({
    code: String(d?.code ?? "").toLowerCase().slice(0, 64), rev: Number(d?.rev) || 0, action: d?.action === "withdraw" ? "withdraw" : "update", answers: cleanAnswers(d?.answers),
  }))
  .handler(async ({ data }) => {
    if (!CODE.test(data.code)) return JSON.stringify({ error: "invalid" });
    return call("_evt_public_update", { _code: data.code, _ip: await clientHash(), _rev: data.rev, _action: data.action, _answers: data.answers });
  });

export const PUBLIC_ERR: Record<string, string> = {
  rate: "محاولات كثيرة من هذا الجهاز؛ انتظر قليلًا ثم أعد المحاولة.",
  closed: "التسجيل غير متاح الآن لهذه الدورة.",
  duplicate: "يوجد طلب سابق للمشارك نفسه في هذه الدورة (الاسم والجوال وتاريخ الميلاد). لتسجيل أخ أو أخت استخدم اسم المشارك الخاص به.",
  bot: "تعذر التحقق من الإرسال. انتظر ثوانيَ ثم أرسل مرة أخرى.",
  invalid: "البيانات غير صحيحة.",
  changed: "تغيّر الطلب؛ حدّث الصفحة.",
  server: "تعذر الاتصال بالخادم؛ أعد المحاولة.",
};

type In<F> = F extends (o: { data: infer D }) => unknown ? D : never;
const parse = (t: string) => JSON.parse(t) as Record<string, unknown>;
export const getPublicCourse = async (o: { data: In<typeof getPublicCourseFn> }) => parse(await getPublicCourseFn(o));
export const submitPublicCourse = async (o: { data: In<typeof submitPublicCourseFn> }) => parse(await submitPublicCourseFn(o));
export const trackPublicApp = async (o: { data: In<typeof trackPublicAppFn> }) => parse(await trackPublicAppFn(o));
export const updatePublicApp = async (o: { data: In<typeof updatePublicAppFn> }) => parse(await updatePublicAppFn(o));
