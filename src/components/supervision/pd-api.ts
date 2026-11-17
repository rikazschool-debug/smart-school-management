import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { arabicError } from "@/lib/session";
/** Calls one sv4_* RPC; the server decides scope — a refusal is shown as-is and inputs stay on screen. */
export async function sv4(fn: string, args: Record<string, unknown>, okMsg?: string): Promise<unknown> {
  const r = await db.rpc(fn, args); if (r.error) { toast.error(arabicError(r.error)); throw r.error; } if (okMsg) toast.success(okMsg); return r.data;
}
