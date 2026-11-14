/**
 * WATI template helpers shared by the server (validation) and the screen (fields/preview). Variables are the WATI parameter
 * names written as {{name}} in body_original, a media header link or a dynamic button URL — never Meta positions alone.
 */
export type WaTplButton = { type: string; text: string; url?: string | undefined };
export type WaTpl = {
  id: string; name: string; category: string; language: string; body: string;
  header: { type: string; link?: string | undefined; text?: string | undefined } | null;
  buttons: WaTplButton[]; vars: { name: string; where: "body" | "header" | "button"; sample: string }[];
};

/** Authentication / login-code templates are never sent by hand. */
export function waTplBlocked(t: { category?: unknown; name?: unknown; body?: unknown }) {
  const cat = String(t.category ?? "").toUpperCase();
  if (cat === "AUTHENTICATION") return true;
  return /otp|login|verif|auth|passcode|رمز (?:التحقق|الدخول)|كلمة المرور/i.test(`${t.name ?? ""} ${t.body ?? ""}`);
}

const VAR = /\{\{\s*([^{}\s]+)\s*\}\}/g;
const names = (s: string | undefined | null) => [...(s ?? "").matchAll(VAR)].map((m) => m[1]!);

/** Raw WATI v3 template → DTO, or null when it is not an approved, manually sendable template. */
export function waTplFromWati(raw: Record<string, unknown>): WaTpl | null {
  if (String(raw["status"] ?? "").toLowerCase() !== "approved") return null;
  if (raw["type"] && raw["type"] !== "template") return null;
  if (Array.isArray(raw["carousel_cards"]) && (raw["carousel_cards"] as unknown[]).length) return null; // carousels: not supported here
  const body = String(raw["body_original"] ?? raw["body"] ?? "");
  if (waTplBlocked({ category: raw["category"], name: raw["name"], body })) return null;
  const h = raw["header"] as Record<string, unknown> | null | undefined;
  const ht = String(h?.["type"] ?? "none").toLowerCase();
  const header = h && ht !== "none" ? { type: ht, link: (h["link"] as string) || undefined, text: (h["text"] as string) || undefined } : null;
  const buttons = ((raw["buttons"] as Record<string, unknown>[] | null) ?? []).map((b) => {
    const p = (b["parameter"] as Record<string, unknown> | undefined) ?? {};
    return { type: String(b["type"] ?? ""), text: String(p["text"] ?? ""), url: (p["url"] as string) || undefined };
  });
  const samples = new Map(((raw["custom_params"] as { name: string; value: string }[] | null) ?? []).map((p) => [String(p.name), String(p.value ?? "")]));
  const vars: WaTpl["vars"] = []; const seen = new Set<string>();
  const add = (n: string, where: "body" | "header" | "button") => { if (!seen.has(n)) { seen.add(n); vars.push({ name: n, where, sample: samples.get(n) ?? "" }); } };
  names(header?.text).forEach((n) => add(n, "header")); names(header?.link).forEach((n) => add(n, "header"));
  names(body).forEach((n) => add(n, "body"));
  buttons.forEach((b) => names(b.url).forEach((n) => add(n, "button")));
  const lang = raw["language_option"] as Record<string, unknown> | undefined;
  return { id: String(raw["id"] ?? ""), name: String(raw["name"] ?? ""), category: String(raw["category"] ?? ""),
    language: String(lang?.["text"] ?? lang?.["value"] ?? raw["language"] ?? ""), body, header, buttons, vars };
}

/** Prefill from the chat's own data only; unknown names (e.g. «2», amounts, dates) stay empty for the sender to fill. */
export function waTplAutofill(t: WaTpl, ctx: { name?: string | null; branch?: string | null }) {
  const out: Record<string, string> = {};
  const nm = (ctx.name ?? "").trim();
  for (const v of t.vars) {
    const k = v.name.toLowerCase();
    if (nm && ["name", "customer_name", "contact_name", "full_name", "guardian_name"].includes(k)) out[v.name] = nm;
    else if (nm && k === "first_name") out[v.name] = nm.split(/\s+/)[0]!;
    else if (ctx.branch && ["branch", "school", "school_name", "branch_name"].includes(k)) out[v.name] = ctx.branch;
    else out[v.name] = "";
  }
  return out;
}

export const waTplFill = (s: string, vals: Record<string, string>) => s.replace(VAR, (m, n: string) => (vals[n]?.trim() ? vals[n]! : m));

/** Server-side check of the values against the live template: every variable filled, none extra, links https. */
export function waTplCheck(t: WaTpl, vals: Record<string, string>) {
  const keys = Object.keys(vals);
  for (const k of keys) if (!t.vars.some((v) => v.name === k)) return `متغير غير موجود في القالب: ${k}`;
  for (const v of t.vars) {
    const x = (vals[v.name] ?? "").trim();
    if (!x) return `أكمل قيمة «${v.name}»`;
    if (x.length > 1000) return `قيمة «${v.name}» طويلة`;
    if (v.where === "header" && t.header && t.header.type !== "text" && !/^https:\/\/\S+$/i.test(x)) return `«${v.name}» يجب أن يكون رابط https للمرفق`;
  }
  return null;
}
