import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { buildAutomationDraft } from "./sanad-automation.server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** «سند» drafts an automation rule from Arabic text, as the signed-in user (RLS client); it never saves, approves or activates. */
export const sanadAutomationDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orgId: string; text: string }) => {
    const text = String(d?.text ?? "").trim();
    if (!UUID.test(String(d?.orgId ?? ""))) throw new Error("مجموعة غير صالحة");
    if (text.length < 10 || text.length > 1200) throw new Error("اكتب وصفًا من 10 إلى 1200 حرف");
    return { orgId: String(d.orgId), text };
  })
  .handler(async ({ data, context }) => {
    const key = process.env["GEMINI_API_KEY"];
    if (!key) return { error: "لم يُضبط مفتاح سند بعد" };
    return buildAutomationDraft(context.supabase as never, data.orgId, data.text, key);
  });
