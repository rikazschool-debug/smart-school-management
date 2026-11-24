// Branding stamped on every export (PDF, print, Excel): the active school's (or group's) name + logo.
// Set once by the app layout from the current context; exports read it synchronously.
// The logo is stored as a data URL so offscreen rendering (html-to-image) and print windows never hit CORS/expiry.
export type ExportBrand = { name: string; logo: string | null };
let brand: ExportBrand = { name: "", logo: null };
const cache = new Map<string, string | null>();

let override: ExportBrand | null = null;
export const getExportBrand = () => override ?? brand;

async function toData(logoUrl: string) {
  const key = logoUrl.split("?")[0]!;
  if (!cache.has(key)) {
    try {
      const b = await (await fetch(logoUrl)).blob();
      cache.set(key, await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = no; r.readAsDataURL(b); }));
    } catch { cache.set(key, null); }
  }
  return cache.get(key) ?? null;
}

export async function setExportBrand(name: string, logoUrl: string | null | undefined) {
  brand = { name, logo: logoUrl ? await toData(logoUrl) : null };
}

/** A page working on a school other than the active context (e.g. the owner picking a school) brands its exports with that school; null clears. */
export async function setExportBrandOverride(name: string | null, logoUrl?: string | null) {
  if (name === null) { override = null; return; }
  const logo = logoUrl ? await toData(logoUrl) : null;
  override = { name, logo };
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Professional letterhead: logo + school name on the right, optional side block on the left, brand rule below. */
export function brandHeaderHtml(opts: { fallbackName?: string | undefined; side?: string } = {}) {
  const b = getExportBrand();
  const name = b.name || opts.fallbackName || "";
  if (!name && !b.logo && !opts.side) return "";
  const logo = b.logo ? `<img src="${esc(b.logo)}" alt="" style="width:58px;height:58px;object-fit:contain;border-radius:10px;border:1px solid #dde3e1;background:#fff;padding:3px">` : "";
  return `<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:3px solid #1f5f4f;padding-bottom:10px;margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:12px">${logo}<div><div style="font-size:19px;font-weight:700;color:#1f2a44">${esc(name)}</div><div style="font-size:10px;color:#667">تقرير صادر من منصة ركاز</div></div></div>
    ${opts.side ? `<div style="font-size:11px;color:#444;line-height:1.8;text-align:left">${opts.side}</div>` : ""}</div>`;
}
