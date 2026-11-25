/** Shared, browser-safe helpers for the public Rikaz API (gateway + webhook sender). */

/** Same rule as SQL _api_url_ok: https only, named public host, default port, no credentials, no internal names or IP literals. */
export function webhookUrlOk(raw: string): boolean {
  if (!raw || raw.length > 500) return false;
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  if (u.port && u.port !== "443") return false;
  const host = u.hostname.toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host)) return false;
  if (/^[0-9.]+$/.test(host)) return false;
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain|arpa)$/.test(host)) return false;
  if (/(^|\.)(supabase\.co|supabase\.in|supabase\.net)$/.test(host)) return false;
  return true;
}

/** Key environment from its prefix; null = not a Rikaz key. */
export function keyEnv(token: string): "live" | "test" | null {
  if (/^rk_live_[A-Za-z0-9_-]{40,60}$/.test(token)) return "live";
  if (/^rk_test_[A-Za-z0-9_-]{40,60}$/.test(token)) return "test";
  return null;
}

export function bearer(h: Headers): string {
  const a = h.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(a.trim());
  return (m?.[1] ?? h.get("x-api-key") ?? "").trim();
}

export async function sha256Hex(s: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Splits "/students/abc" into ["students","abc"]; rejects anything odd. */
export function apiPath(splat: string): string[] | null {
  const parts = splat.split("/").filter(Boolean);
  if (parts.length > 2 || parts.some((p) => !/^[A-Za-z0-9_-]{1,64}$/.test(p))) return null;
  return parts;
}
