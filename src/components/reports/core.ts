import { db, type Row } from "@/components/crud-page";
import type { ReportTable } from "@/lib/report-builder";

export type P = { school: string; org: string; from: string | null; to: string | null };
export type Def = { group: string; label: string; note: string; summary: string; run: (p: P, detail: boolean) => Promise<ReportTable> };
export { db, type Row };

export const d10 = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : "");
/** Calendar day of a timestamp on the school clock (Asia/Riyadh). */
export const rday = (v: unknown) => {
  if (typeof v !== "string" || !v) return "";
  if (v.length <= 10) return v;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v.slice(0, 10) : d.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
};
/** True when the row's day falls inside the chosen period (end day inclusive). */
export const inPeriod = (v: unknown, p: P) => { const d = rday(v); if (!d) return !p.from && !p.to; return (!p.from || d >= p.from) && (!p.to || d <= p.to); };
export const lbl = (m: Record<string, string>, v: unknown) => (v == null || v === "" ? "" : m[String(v)] ?? String(v));

/** Reads every visible row in pages of 1000 (RLS decides what is visible). */
export async function all(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>, cap = 20000) {
  const out: Row[] = [];
  for (let i = 0; i < cap; i += 1000) {
    const { data, error } = await build(i, i + 999);
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}
/** Pages a section's own list RPC (its permission checks decide what is returned). */
export async function allRpc(call: (limit: number, offset: number) => PromiseLike<{ data: unknown; error: unknown }>, size = 100, cap = 5000) {
  const out: Row[] = [];
  for (let o = 0; o < cap; o += size) {
    const { data, error } = await call(size, o);
    if (error) throw error;
    const rows = (Array.isArray(data) ? data : ((data as { rows?: Row[] } | null)?.rows ?? [])) as Row[];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}
/** Applies the chosen period to a date/timestamp column (end day inclusive). */
export function within<Q extends { gte: (c: string, v: string) => Q; lte: (c: string, v: string) => Q }>(q: Q, col: string, p: P, ts = true) {
  let r = q;
  if (p.from) r = r.gte(col, ts ? `${p.from}T00:00:00+03:00` : p.from);
  if (p.to) r = r.lte(col, ts ? `${p.to}T23:59:59.999+03:00` : p.to);
  return r;
}
