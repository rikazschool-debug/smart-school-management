import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { maqsamCutoff, maqsamSince, currentMaqsamCalls } from "./maqsam-window";

/**
 * Maqsam (call center) — server side only. The access key/secret are project secrets bound to the one organization that has a
 * mq_link row (مجموعة المالكي التعليمية); every function checks the caller's right on that org through their own RLS client first.
 * Sync pulls the call log (overlapping window, idempotent upsert by Maqsam call id) — calls are never placed from here.
 */
const UUID = /^[0-9a-f-]{36}$/i;
/** VPS-only setup capability; Lovable keeps its existing API and database contract. */
export const mqPreparation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(() => ({ manualNumbers: process.env["MAQSAM_NEW_ONLY"] === "true" }));
/** The project Maqsam keys belong to this organization only (مجموعة المالكي التعليمية). */
export const MAQSAM_ORG = "a9a4b7e2-ab44-4bcf-a1bf-ebce6489f074";

async function mq(base: string, auth: string, path: string) {
  const res = await fetch(`https://api.${base}${path}`, { headers: { Authorization: auth } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Maqsam HTTP ${res.status}`);
  const j = JSON.parse(text) as { result?: string; message?: unknown };
  if (j.result !== "success") throw new Error("Maqsam: استجابة غير متوقعة");
  return j.message as Record<string, unknown>[];
}

export async function runSync(orgId: string, force: boolean) {
  const cutoff = maqsamCutoff(process.env);
  const { orgCreds } = await import("./maqsam-creds.server");
  const cr = await orgCreds(orgId);
  if (!cr) return { skipped: true, busy: false, fresh: false };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const b = await supabaseAdmin.rpc("_mq_sync_begin" as never, { _org: orgId, _force: force } as never);
  if (b.error) throw new Error("تعذّر بدء المزامنة");
  const st = b.data as unknown as { ok: boolean; base?: string; since?: number; busy?: boolean; fresh?: boolean };
  if (!st.ok) return { skipped: true, busy: !!st.busy, fresh: !!st.fresh };
  try {
    const agents = await mq(cr.base, cr.auth, "/v1/agents");
    let total = 0, heldHistorical = 0;
    for (let page = 1; page <= 30; page++) {
      const batch = await mq(cr.base, cr.auth, `/v1/calls/page/${page}?start_time=${maqsamSince(st.since, cutoff)}`);
      const calls = currentMaqsamCalls(batch, cutoff); heldHistorical += batch.length - calls.length;
      if (calls.length) {
        const r = await supabaseAdmin.rpc("_mq_ingest" as never, { _org: orgId, _calls: calls, _agents: page === 1 ? agents : [] } as never);
        if (r.error) throw new Error("تعذّر حفظ المكالمات");
        total += calls.length;
      } else if (page === 1) {
        await supabaseAdmin.rpc("_mq_ingest" as never, { _org: orgId, _calls: [], _agents: agents } as never);
      }
      if (batch.length < 100) break;
    }
    await supabaseAdmin.rpc("_mq_sync_end" as never, { _org: orgId, _ok: true, _err: null, _n: total } as never);
    return { skipped: false, count: total, heldHistorical };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "خطأ";
    await supabaseAdmin.rpc("_mq_sync_end" as never, { _org: orgId, _ok: false, _err: msg, _n: 0 } as never);
    throw new Error("تعذّر الاتصال بـ Maqsam — التذاكر تعمل كالمعتاد. " + msg.replace(/Basic\s+\S+/g, ""));
  }
}

/** Anyone who may view calls triggers a throttled sync (≤ 1/min); "force" is for the link manager. */
export const mqSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; force?: boolean }) => {
    if (!UUID.test(d?.orgId ?? "")) throw new Error("معرّف غير صالح");
    return { orgId: d.orgId, force: !!d.force };
  })
  .handler(async ({ data, context }) => {
    const fn = data.force ? "mq_manage_check" : "mq_view_check";
    const { data: ok } = await context.supabase.rpc(fn as never, { _org: data.orgId } as never);
    if (!ok) throw new Error("غير مصرح");
    return runSync(data.orgId, data.force);
  });

const credIn = (d: { orgId: string; base?: string; keyId?: string; secret?: string }) => {
  if (!UUID.test(d?.orgId ?? "")) throw new Error("معرّف غير صالح");
  const t = (v?: string) => (typeof v === "string" ? v.trim().slice(0, 300) : "");
  return { orgId: d.orgId, base: t(d.base), keyId: t(d.keyId), secret: t(d.secret) };
};

/** Owner-only read-only test. With new key+secret it tests those (nothing saved); without, it tests the saved link. */
export const mqTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(credIn)
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("mq_owner_check" as never, { _org: data.orgId } as never);
    if (!ok) throw new Error("غير مصرح");
    const c = await import("./maqsam-creds.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      let n: number;
      if (data.keyId || data.secret) {
        if (!data.keyId || !data.secret) return { ok: false, error: "أدخل رقم المفتاح وكلمة المرور معًا" };
        n = await c.probe(c.normBase(data.base || "mq.maqsam.com"), c.authHeader(data.keyId, data.secret));
        return { ok: true, agents: n, unsaved: true };
      }
      const cr = await c.orgCreds(data.orgId);
      if (!cr) return { ok: false, error: "لا يوجد ربط محفوظ" };
      n = await c.probe(cr.base, cr.auth);
      await supabaseAdmin.rpc("_mq_test_result" as never, { _org: data.orgId, _ok: true, _err: null } as never);
      return { ok: true, agents: n };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطأ";
      if (!(data.keyId || data.secret)) await supabaseAdmin.rpc("_mq_test_result" as never, { _org: data.orgId, _ok: false, _err: msg } as never);
      return { ok: false, error: msg };
    }
  });

/** Owner-only: verifies new credentials with a read-only call first; the working link is replaced only when they pass. */
export const mqSaveCreds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(credIn)
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("mq_owner_check" as never, { _org: data.orgId } as never);
    if (!ok) throw new Error("غير مصرح");
    if (!data.keyId || !data.secret) return { ok: false, error: "أدخل رقم المفتاح وكلمة المرور" };
    const c = await import("./maqsam-creds.server");
    let base: string;
    try { base = c.normBase(data.base || "mq.maqsam.com"); await c.probe(base, c.authHeader(data.keyId, data.secret)); }
    catch (e) { return { ok: false, error: (e instanceof Error ? e.message : "خطأ") + " — بقي الربط السابق كما هو" }; }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await supabaseAdmin.rpc("_mq_creds_put" as never, { _org: data.orgId, _base: base, _kenc: await c.encrypt(data.keyId), _senc: await c.encrypt(data.secret),
      _hint: "…" + data.keyId.slice(-4), _user: context.userId } as never);
    if (r.error) return { ok: false, error: "تعذّر حفظ الربط" };
    return { ok: true };
  });
