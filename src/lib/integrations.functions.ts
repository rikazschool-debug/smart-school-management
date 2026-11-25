import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hmacHex, webhookUrlOk } from "@/lib/api-gateway";

type Claimed = { id: string; url: string; secret: string; event: string; attempt: number; payload: unknown };

/**
 * Manual webhook dispatch (owner button). Automatic sending stays off until the owner approves the first integration.
 * The owner is checked with the caller's own client; claiming/results use the service role (secrets never reach the browser).
 */
export const dispatchWebhooks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(d?.orgId ?? "")) throw new Error("بيانات غير صالحة");
    return { orgId: d.orgId };
  })
  .handler(async ({ data, context }) => {
    const own = await context.supabase.rpc("is_org_owner" as never, { _org: data.orgId } as never);
    if (own.error || own.data !== true) throw new Error("غير مصرح");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const c = await supabaseAdmin.rpc("api_dispatch_claim" as never, { _org: data.orgId, _limit: 20 } as never);
    if (c.error) throw new Error("تعذر تجهيز الإرسال");
    const rows = (c.data ?? []) as unknown as Claimed[];
    let delivered = 0, failed = 0;
    await Promise.all(rows.map(async (d) => {
      let ok = false, code: number | null = null, error: string | null = null;
      if (!webhookUrlOk(d.url)) error = "رابط غير مسموح";
      else {
        try {
          const body = JSON.stringify(d.payload);
          const ts = Math.floor(Date.now() / 1000).toString();
          const sig = await hmacHex(d.secret, `${ts}.${body}`);
          const res = await fetch(d.url, {
            method: "POST", body, redirect: "manual", signal: AbortSignal.timeout(10_000),
            headers: { "Content-Type": "application/json", "User-Agent": "Rikaz-Webhooks/1", "X-Rikaz-Event": d.event, "X-Rikaz-Delivery": d.id, "X-Rikaz-Attempt": String(d.attempt), "X-Rikaz-Timestamp": ts, "X-Rikaz-Signature": `sha256=${sig}` },
          });
          code = res.status; ok = res.status >= 200 && res.status < 300;
          if (!ok) error = `HTTP ${res.status}`;
          await res.body?.cancel();
        } catch (e) {
          error = e instanceof Error && e.name === "TimeoutError" ? "انتهت مهلة الاتصال (10 ثوانٍ)" : "تعذر الاتصال بالعنوان";
        }
      }
      if (ok) delivered++; else failed++;
      await supabaseAdmin.rpc("api_dispatch_result" as never, { _id: d.id, _ok: ok, _code: code, _error: error } as never);
    }));
    return { sent: rows.length, delivered, failed };
  });
