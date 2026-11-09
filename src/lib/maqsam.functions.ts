import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Maqsam (call center) — server side only. The access key/secret are project secrets bound to the one organization that has a
 * mq_link row (مجموعة المالكي التعليمية); every function checks the caller's right on that org through their own RLS client first.
 * Sync pulls the call log (overlapping window, idempotent upsert by Maqsam call id) — calls are never placed from here.
 */
const UUID = /^[0-9a-f-]{36}$/i;

function creds() {
  const id = process.env["MAQSAM_ACCESS_KEY_ID"], secret = process.env["MAQSAM_ACCESS_SECRET"];
  if (!id || !secret) throw new Error("مفاتيح Maqsam غير مضبوطة");
  return "Basic " + btoa(`${id}:${secret}`);
}

async function mq(base: string, path: string) {
  const res = await fetch(`https://api.${base}${path}`, { headers: { Authorization: creds() } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Maqsam ${res.status}: ${text.slice(0, 160)}`);
  const j = JSON.parse(text) as { result?: string; message?: unknown };
  if (j.result !== "success") throw new Error("Maqsam: استجابة غير متوقعة");
  return j.message as Record<string, unknown>[];
}

export async function runSync(orgId: string, force: boolean) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const b = await supabaseAdmin.rpc("_mq_sync_begin" as never, { _org: orgId, _force: force } as never);
  if (b.error) throw new Error("تعذّر بدء المزامنة");
  const st = b.data as unknown as { ok: boolean; base?: string; since?: number; busy?: boolean; fresh?: boolean };
  if (!st.ok) return { skipped: true, busy: !!st.busy, fresh: !!st.fresh };
  try {
    const agents = await mq(st.base!, "/v1/agents");
    let total = 0;
    for (let page = 1; page <= 30; page++) {
      const calls = await mq(st.base!, `/v1/calls/page/${page}?start_time=${st.since}`);
      if (calls.length) {
        const r = await supabaseAdmin.rpc("_mq_ingest" as never, { _org: orgId, _calls: calls, _agents: page === 1 ? agents : [] } as never);
        if (r.error) throw new Error("تعذّر حفظ المكالمات");
        total += calls.length;
      } else if (page === 1) {
        await supabaseAdmin.rpc("_mq_ingest" as never, { _org: orgId, _calls: [], _agents: agents } as never);
      }
      if (calls.length < 100) break;
    }
    await supabaseAdmin.rpc("_mq_sync_end" as never, { _org: orgId, _ok: true, _err: null, _n: total } as never);
    return { skipped: false, count: total };
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

export const mqTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string }) => {
    if (!UUID.test(d?.orgId ?? "")) throw new Error("معرّف غير صالح");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { data: ok } = await context.supabase.rpc("mq_manage_check" as never, { _org: data.orgId } as never);
    if (!ok) throw new Error("غير مصرح");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const agents = await mq("mq.maqsam.com", "/v1/agents");
      await supabaseAdmin.rpc("_mq_test_result" as never, { _org: data.orgId, _ok: true, _err: null } as never);
      return { ok: true, agents: agents.length };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "خطأ";
      await supabaseAdmin.rpc("_mq_test_result" as never, { _org: data.orgId, _ok: false, _err: msg } as never);
      return { ok: false, error: msg };
    }
  });
