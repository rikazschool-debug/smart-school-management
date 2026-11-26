import { waTplFromWati } from "@/lib/wa-template";
/**
 * Automation view of the linked WATI account's templates. A template is usable by automation only when it is approved,
 * a UTILITY template (Meta: transactional), not a login/authentication or system template already used by an existing
 * service, and has no media header (automation cannot attach header files). Everything else is mirrored with a reason.
 */
export const AU_RESERVED_TEMPLATES = ["rikaz_login_otp", "rikaz_guardian_account_ready", "rikaz_event_update"];
export type AuTplRow = { name: string; category: string; language: string; status: string; body: string; header: unknown; buttons: unknown; params: string[]; usable: boolean; reason: string | null };
export function auTplRow(raw: Record<string, unknown>): AuTplRow | null {
  const name = String(raw["name"] ?? "").trim(), status = String(raw["status"] ?? "").toLowerCase();
  if (!name || status === "deleted") return null;
  const d = waTplFromWati(raw), category = String(raw["category"] ?? "").toUpperCase();
  let reason: string | null = null;
  if (status !== "approved") reason = "غير معتمد من Meta";
  else if (!d) reason = "قالب دخول أو تحقق أو نوع غير مدعوم";
  else if (AU_RESERVED_TEMPLATES.includes(name)) reason = "مخصص لخدمة قائمة في المنصة";
  else if (category !== "UTILITY") reason = "قالب غير تشغيلي (التسويقية خارج نطاق الأتمتة)";
  else if (d.header && d.header.type !== "text") reason = "يحتاج مرفقًا في الترويسة";
  const lang = raw["language_option"] as Record<string, unknown> | undefined;
  return { name, category, language: d?.language ?? String(lang?.["value"] ?? raw["language"] ?? ""), status, body: d?.body ?? String(raw["body_original"] ?? raw["body"] ?? ""),
    header: d?.header ?? null, buttons: d?.buttons ?? [], params: d ? d.vars.map((v) => v.name) : [], usable: reason === null, reason };
}
