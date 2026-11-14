/**
 * Per-organization Maqsam credentials. Stored AES-GCM encrypted (key derived from MQ_CRED_KEY) in mq_creds, which has no
 * client grants; read only through the service-only _mq_creds_get. The project secrets MAQSAM_ACCESS_* remain a fallback for
 * the original organization only, until its owner saves its own link.
 */
const LEGACY_ORG = "a9a4b7e2-ab44-4bcf-a1bf-ebce6489f074";

async function aesKey() {
  const raw = process.env["MQ_CRED_KEY"];
  if (!raw) throw new Error("مفتاح التشفير غير مضبوط");
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", d, "AES-GCM", false, ["encrypt", "decrypt"]);
}
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function encrypt(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(plain)));
  return b64(iv) + "." + b64(ct);
}
async function decrypt(s: string) {
  const [iv, ct] = s.split(".");
  const p = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv!) }, await aesKey(), unb64(ct!));
  return new TextDecoder().decode(p);
}

export const authHeader = (id: string, secret: string) => "Basic " + btoa(`${id}:${secret}`);

/** Normalizes "https://mq.maqsam.com/" → "mq.maqsam.com"; only *.maqsam.com hosts are accepted. */
export function normBase(u: string) {
  const h = u.trim().replace(/^https?:\/\//i, "").replace(/^api\./i, "").replace(/\/.*$/, "").toLowerCase();
  if (!/^([a-z0-9-]+\.)*maqsam\.com$/.test(h)) throw new Error("الرابط الأساسي يجب أن يكون على نطاق maqsam.com");
  return h;
}

export async function orgCreds(orgId: string): Promise<{ base: string; auth: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const r = await supabaseAdmin.rpc("_mq_creds_get" as never, { _org: orgId } as never);
  const c = r.data as unknown as { base_url: string; key_enc: string; secret_enc: string } | null;
  if (c?.key_enc) return { base: c.base_url, auth: authHeader(await decrypt(c.key_enc), await decrypt(c.secret_enc)) };
  if (orgId === LEGACY_ORG) {
    const id = process.env["MAQSAM_ACCESS_KEY_ID"], secret = process.env["MAQSAM_ACCESS_SECRET"];
    if (id && secret) return { base: "mq.maqsam.com", auth: authHeader(id, secret) };
  }
  return null;
}

/** Read-only probe (agents list). */
export async function probe(base: string, auth: string) {
  const res = await fetch(`https://api.${base}/v1/agents`, { headers: { Authorization: auth } });
  const text = await res.text();
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? "بيانات الربط غير صحيحة" : `Maqsam ${res.status}`);
  const j = JSON.parse(text) as { result?: string; message?: unknown[] };
  if (j.result !== "success") throw new Error("Maqsam: استجابة غير متوقعة");
  return (j.message ?? []).length;
}
