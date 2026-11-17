import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { validateSupervisionFile } from "./supervision-file-validation";
type Meta = { id: string; path: string; name: string; mime: string; size: number; hash: string | null };
export const uploadSupervisionEvidence = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: FormData) => {
  if (!(d instanceof FormData)) throw Error("طلب رفع غير صالح"); return d;
}).handler(async ({ data, context }) => {
  setResponseHeader("Cache-Control", "no-store");
  const file = data.get("file"), id = data.get("id");
  if (!(file instanceof File) || typeof id !== "string") throw Error("الملف غير موجود");
  const m = await context.supabase.rpc("sv3_file_meta", { _file: id, _write: true }); if (m.error) throw Error(m.error.message);
  const meta = m.data as unknown as Meta;
  const bytes = new Uint8Array(await file.arrayBuffer()); validateSupervisionFile(bytes, meta.mime, meta.name);
  if (bytes.length !== meta.size || file.type !== meta.mime) throw Error("حجم الملف أو نوعه لا يطابق طلب الرفع");
  // Only after the session-scoped RPC authorizes this exact pending file.
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const up = await supabaseAdmin.storage.from("rikaz-files").upload(meta.path, bytes, { contentType: meta.mime, upsert: false }); if (up.error) throw Error("تعذر حفظ الملف");
  const again = await context.supabase.rpc("sv3_file_meta", { _file: id, _write: true }); if (again.error) throw Error("انتهت صلاحية الرفع؛ لم يعتمد الملف");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)); const hash = Array.from(digest, (b) => b.toString(16).padStart(2,"0")).join("");
  const seal = await supabaseAdmin.rpc("_sv3_file_seal", { _file: id, _hash: hash }); if (seal.error) throw Error("تعذر اعتماد الملف"); return { id };
});
export const readSupervisionEvidence = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).inputValidator((d: { id: string }) => d).handler(async ({ data, context }) => {
  setResponseHeader("Cache-Control", "no-store");
  const m = await context.supabase.rpc("sv3_file_meta", { _file: data.id, _write: false }); if (m.error) throw Error("الملف غير متاح ضمن صلاحيتك الحالية");
  const meta = m.data as unknown as Meta;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const r = await supabaseAdmin.storage.from("rikaz-files").download(meta.path); if (r.error || !r.data) throw Error("تعذر قراءة الملف");
  const again = await context.supabase.rpc("sv3_file_meta", { _file: data.id, _write: false }); if (again.error) throw Error("انتهت صلاحية الاطلاع");
  const bytes = new Uint8Array(await r.data.arrayBuffer());
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2,"0")).join("");
  if (bytes.length !== meta.size || hash !== meta.hash) throw Error("تعذر التحقق من سلامة الملف");
  let binary = ""; for (let i=0;i<bytes.length;i+=8192) binary += String.fromCharCode(...bytes.subarray(i,i+8192));
  return { base64: btoa(binary), mime: meta.mime, name: meta.name };
});