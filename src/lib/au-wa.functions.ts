import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { auTplRow } from "@/lib/au-wa-tpl";
/**
 * Mirrors the linked WATI account's templates for the automation designer (read-only GET on WATI; nothing is sent).
 * Caller authority is checked first with their own session (au_wa_can_sync → au_manage); the mirror write is service-only.
 */
export const auWaSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { org: string }) => { if (!/^[0-9a-f-]{36}$/i.test(d?.org ?? "")) throw new Error("bad"); return d; })
  .handler(async ({ data, context }) => {
    const ok = await context.supabase.rpc("au_wa_can_sync" as never, { _org: data.org } as never);
    if (ok.error || ok.data !== true) throw new Error("غير مصرح");
    const base = process.env["WATI_API_BASE_URL"], token = process.env["WATI_API_TOKEN"];
    if (!base || !token) throw new Error("ربط WATI غير مُعدّ");
    const origin = new URL(base).origin, auth = `Bearer ${token.replace(/^Bearer\s+/i, "")}`;
    const raw: Record<string, unknown>[] = [];
    for (let pn = 1; pn <= 10; pn++) {
      const r = await fetch(`${origin}/api/ext/v3/messageTemplates?page_size=100&page_number=${pn}`, { headers: { Authorization: auth, "User-Agent": "Rikaz/1.0" }, signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`تعذر جلب القوالب من WATI (${r.status})`);
      const list = (((await r.json()) as { templates?: Record<string, unknown>[] }).templates) ?? [];
      raw.push(...list); if (list.length < 100) break;
    }
    const rows = raw.map(auTplRow).filter((x) => x !== null);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const s = await supabaseAdmin.rpc("_au_wa_sync" as never, { _rows: rows } as never);
    if (s.error) throw new Error("تعذر حفظ القوالب");
    return { total: rows.length, usable: rows.filter((r) => r.usable).length };
  });
