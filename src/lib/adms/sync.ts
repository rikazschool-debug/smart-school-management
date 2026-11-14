// Registry sync client: Rikaz server → bridge GET /integration/v1/health and /integration/v1/sync.
// Every request is freshly signed (new nonce). Each page is applied together with its cursor in one DB transaction.
import { Health, SyncPage, signHeaders, type RegistryKey } from "./contract";

export type SyncDeps = {
  fetch: typeof fetch; nowMs: () => number; cred: RegistryKey;
  cursor: () => Promise<number>;
  apply: (from: number, page: SyncPage) => Promise<void>;
  note: (health: boolean, error: string | null) => Promise<void>;
  limit?: number; maxPages?: number;
};
export type SyncResult = { ok: true; pages: number; items: number; cursor: number; has_more: boolean } | { ok: false; code: string; pages: number; items: number };

async function signedGet(d: SyncDeps, target: string) {
  const headers = await signHeaders("GET", target, d.cred.key_id, d.cred.secret, "", d.nowMs());
  const res = await d.fetch(new URL(target, d.cred.base_url).toString(), { method: "GET", headers, redirect: "manual" });
  let json: unknown = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, json };
}
const code = (r: { status: number; json: unknown }) => {
  const e = (r.json as { error?: unknown } | null)?.error;
  return `http_${r.status}${typeof e === "string" && /^[a-z_]{1,60}$/.test(e) ? ":" + e : ""}`;
};

export async function runSync(d: SyncDeps): Promise<SyncResult> {
  const base = new URL(d.cred.base_url);
  if (base.protocol !== "https:" && !(base.protocol === "http:" && base.hostname === "127.0.0.1")) return { ok: false, code: "base_url_not_https", pages: 0, items: 0 };
  let pages = 0, items = 0;
  const fail = async (c: string) => { await d.note(false, c).catch(() => {}); return { ok: false as const, code: c, pages, items }; };
  try {
    const h = await signedGet(d, "/integration/v1/health");
    if (h.status !== 200) return fail(code(h));
    const hp = Health.safeParse(h.json);
    if (!hp.success) return fail("health_invalid");
    if (hp.data.org_id !== d.cred.bridge_org_id.toLowerCase()) return fail("health_org_mismatch");
    await d.note(true, null);
    let cursor = await d.cursor();
    const limit = Math.min(Math.max(d.limit ?? 100, 1), 500);
    for (let i = 0; i < (d.maxPages ?? 50); i++) {
      const r = await signedGet(d, `/integration/v1/sync?cursor=${cursor}&limit=${limit}`);
      if (r.status !== 200) return fail(code(r));
      const p = SyncPage.safeParse(r.json);
      if (!p.success) return fail("page_invalid");
      if (p.data.org_id !== d.cred.bridge_org_id.toLowerCase()) return fail("page_org_mismatch");
      await d.apply(cursor, p.data); // throws → cursor unchanged; the same page is re-read next time with a new nonce
      pages++; items += p.data.items.length; cursor = p.data.next_cursor;
      if (!p.data.has_more) return { ok: true, pages, items, cursor, has_more: false };
    }
    return { ok: true, pages, items, cursor, has_more: true };
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    return fail(/^[a-z_]{1,60}$/.test(m) ? "apply_" + m : "network_or_apply_error");
  }
}
