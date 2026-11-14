import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { inboxPolicy } from "./wati-inbox-policy";

export const requireWatiInboxAuth = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ context, next }) => {
    const policy = inboxPolicy(process.env);
    if (!policy.enabled)
      throw new Error("محادثات WATI الحقيقية غير مفعلة في هذه البيئة؛ رموز الدخول مستقلة.");
    const can = await context.supabase.rpc("wa_org_ok" as never, { _org: policy.org } as never);
    if (can.error || can.data !== true) throw new Error("غير مصرح بمحادثات المؤسسة المرتبطة.");
    return next();
  });
