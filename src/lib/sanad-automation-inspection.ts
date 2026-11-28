// Deterministic interpretation of already-authorized RPC results. No model, writes, or execution.
export type Json = Record<string, unknown>;
const object = (v: unknown): Json => v && typeof v === "object" && !Array.isArray(v) ? v as Json : {};
const array = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const number = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : 0;
const ACTIONS: Record<string, string> = { notify: "إشعار", reminder: "تذكير", escalate: "تصعيد", wait: "انتظار", wait_until: "انتظار مشروط", if: "تفرّع", stop: "إنهاء المسار", task: "مهمة", review: "طلب مراجعة", report: "تقرير", doc: "مستند", hr_letter: "طلب خطاب", mt_request: "طلب صيانة", set: "تحديث حقل", compute: "حساب", parallel: "مسارات متوازية" };
const OPS: Record<string, string> = { gt: "أكبر من", gte: "أكبر من أو يساوي", lt: "أقل من", lte: "أقل من أو يساوي", eq: "يساوي", neq: "لا يساوي", within_days: "خلال أيام", empty: "فارغ", not_empty: "غير فارغ" };

export function inspectRule(rule: Json, registry: Json) {
  const def = object(rule["draft"]);
  const labels = new Map(array(registry["variables"]).map((v) => { const x = object(v); return [`${x["event_code"]}|${x["key"]}`, String(x["label"])] as const; }));
  const condition = (value: unknown, depth = 0): string => {
    if (!value || depth > 10) return "";
    const w = object(value);
    if (Array.isArray(w["all"])) return array(w["all"]).map((x) => condition(x, depth + 1)).join(" و ");
    if (Array.isArray(w["any"])) return array(w["any"]).map((x) => condition(x, depth + 1)).join(" أو ");
    if (w["not"]) return `ليس (${condition(w["not"], depth + 1)})`;
    return `${labels.get(`${rule["event"]}|${w["var"]}`) ?? String(w["var"] ?? "شرط")} ${OPS[String(w["op"])] ?? String(w["op"] ?? "")} ${w["value"] === undefined ? "" : JSON.stringify(w["value"])}`.trim();
  };
  const steps: { depth: number; type: string; label: string; minutes?: number }[] = [];
  const walk = (items: unknown, depth = 0) => {
    if (depth > 10) return;
    for (const item of array(items)) {
      const s = object(item), type = String(s["type"] ?? "unknown");
      const minutes = typeof s["minutes"] === "number" ? s["minutes"] : undefined;
      const label = type === "if" ? `إذا ${condition(s["when"])}` : type === "wait" && minutes !== undefined ? `انتظار ${minutes} دقيقة (${minutes / 1440} يوم)` : ACTIONS[type] ?? `إجراء غير معروف: ${type}`;
      steps.push({ depth, type, label, ...(minutes !== undefined ? { minutes } : {}) });
      for (const key of ["then", "else", "on_fail", "timeout", "steps"]) walk(s[key], depth + 1);
      for (const branch of array(s["branches"])) walk(Array.isArray(branch) ? branch : object(branch)["steps"], depth + 1);
    }
  };
  walk(def["steps"]);
  const source = array(registry["events"]).map(object).find((e) => e["code"] === rule["event"]);
  return { source: String(source?.["label"] ?? rule["event"] ?? "—"), condition: condition(def["when"]), mode: def["mode"] === "batch" ? "معالجة مجمّعة" : "معالجة كل سجل مستقلًا", schedule: object(def["schedule"]), active: rule["active"] === true, steps };
}

export function inspectSimulation(value: Json) {
  const items = array(value["items"]);
  const recipients = items.flatMap((i) => array(object(i)["recipients"]).map(object));
  const previews = array(value["preview"]).map(object);
  const missing = previews.reduce((n, p) => n + array(p["wa_missing"]).length, 0);
  return {
    ok: value["ok"] === true, error: typeof value["error"] === "string" ? value["error"] : null,
    matched: number(value["matched"]), excluded: number(value["excluded"]), previewed: items.length,
    noRecipient: recipients.filter((r) => r["none"] === true || number(r["eligible"]) === 0).length,
    deferred: recipients.reduce((n, r) => n + number(r["would_defer"]), 0),
    conflicts: recipients.reduce((n, r) => n + number(r["conflicts"]), 0), missingVariables: missing,
    relatedRules: array(value["other_rules"]).length,
  };
}

export function failureAdvice(reason: string) {
  if (/no_recipient|no_authorized/.test(reason)) return "راجع المسؤولية أو المستلمين المخوّلين أو البديل المحدد؛ لا يُختار شخص عشوائي.";
  if (/not_allowed|authority|forbidden|scope/.test(reason)) return "راجع النطاق والتفويض والصلاحية الحالية قبل أي إعادة محاولة.";
  if (/condition.*false|condition no longer true/.test(reason)) return "زوال الشرط يوقف المسار؛ لا تعِد تشغيله لإجبار التنفيذ.";
  if (/conflict/.test(reason)) return "راجع أولوية القواعد والجمهور لمنع الإرسال المتكرر.";
  if (/cap:/.test(reason)) return "راجع الحد اليومي وموعد التأجيل؛ لا تتجاوز الحد بإعادة المحاولة.";
  if (/loop_guard/.test(reason)) return "راجع مصدر السجل ومسار الخطوات لمنع الحلقة.";
  if (/unknown|timeout|network/.test(reason)) return "تحقق من النتيجة المسجلة أولًا؛ لا تُعد المحاولة تلقائيًا عند غموض النتيجة.";
  return "راجع السبب المسجل ومسار العملية؛ لا توجد نتيجة مؤكدة تبرر إجراءً تلقائيًا.";
}

export function inspectRuns(value: Json) {
  const rows = array(value["rows"]).map(object);
  const counts: Record<string, number> = {};
  const reasons: Record<string, number> = {};
  for (const row of rows) {
    const status = String(row["status"] ?? "unknown"); counts[status] = (counts[status] ?? 0) + 1;
    if (typeof row["error"] === "string" && row["error"]) { const reason = row["error"]; reasons[reason] = (reasons[reason] ?? 0) + 1; }
  }
  return { total: number(value["total"]), inspected: rows.length, sampled: number(value["total"]) > rows.length, counts, reasons };
}