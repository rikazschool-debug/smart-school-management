import { Bell, BellRing, Flag, ListChecks, FileSearch, Hourglass, GitBranch, Split, OctagonX, Filter, Zap, type LucideIcon } from "lucide-react";
import type { NodeKind } from "./flow";

export const KIND: Record<NodeKind, { l: string; d: string; i: LucideIcon; group: "start" | "cond" | "action" | "flow" }> = {
  trigger: { l: "البداية", d: "الحدث ونطاق القاعدة وتوقيت تشغيلها", i: Zap, group: "start" },
  filter: { l: "شرط القاعدة", d: "شرط بسيط أو مركب (و / أو / ليس) يحدد السجلات المطابقة", i: Filter, group: "cond" },
  if: { l: "إعادة التحقق (إذا / وإلا)", d: "يعيد فحص الشرط لحظة التنفيذ ويفتح مسارين", i: GitBranch, group: "cond" },
  notify: { l: "إشعار داخلي", d: "إشعار داخل التطبيق للمستلمين المؤهلين", i: Bell, group: "action" },
  reminder: { l: "تذكير", d: "تذكير داخل التطبيق", i: BellRing, group: "action" },
  escalate: { l: "تصعيد", d: "إشعار لمدير المدرسة أو مدير النظام", i: Flag, group: "action" },
  task: { l: "مهمة متابعة", d: "تكليف عبر مسار التكليفات القائم", i: ListChecks, group: "action" },
  review: { l: "طلب مراجعة باسم النظام", d: "تكليف يحتاج تأكيدًا بشريًا", i: FileSearch, group: "action" },
  wait: { l: "انتظار", d: "يؤجل بقية المسار ثم يعيد التحقق من السجل", i: Hourglass, group: "flow" },
  parallel: { l: "فروع متوازية", d: "فرعان أو ثلاثة تُنفذ معًا", i: Split, group: "flow" },
  stop: { l: "إنهاء المسار", d: "يوقف المسار هنا", i: OctagonX, group: "flow" },
};
export const START_TYPES: { k: string; l: string; types: string[] }[] = [
  { k: "event", l: "فور وقوع الحدث", types: ["event"] },
  { k: "condition", l: "عند تحقق الشرط", types: ["condition"] },
  { k: "schedule", l: "تشغيل مجدول", types: ["every_5m", "every_15m", "every_30m", "hourly", "daily", "weekly", "monthly", "at"] },
  { k: "manual", l: "تشغيل يدوي", types: ["manual"] },
];

const SERVER: [RegExp, string][] = [
  [/recipient (\w+) already notified by an existing service/, "المستلم «$1» يُبلَّغ أصلًا من خدمة قائمة لهذا الحدث"],
  [/recipient (\w+) not allowed/, "المستلم «$1» غير مؤهل لهذا الحدث"], [/assignee (\w+) not allowed/, "المكلَّف «$1» غير مؤهل لهذا الحدث"],
  [/guardian not allowed/, "لا يُسمح بولي الأمر في هذا الحدث"], [/central events notify the owner only/, "أحداث الإدارة المركزية تُرسل لمدير النظام فقط"],
  [/variables are not allowed in family messages/, "لا يُسمح بالمتغيرات في رسائل أولياء الأمور"], [/variable (\w+) not allowed/, "المتغير «$1» غير مسموح لهذا الحدث"],
  [/message may not contain code or markup/, "الرسالة لا تقبل أكوادًا أو وسومًا أو أقواسًا"], [/schedule (\w+) does not fit this event/, "نوع التشغيل لا يناسب هذا الحدث"],
  [/at needs a future Riyadh time/, "اختر موعدًا مستقبليًا بتوقيت الرياض"], [/tasks need a school event/, "المهام تحتاج حدثًا مدرسيًا"],
  [/too many steps/, "عدد الخطوات يتجاوز 15"], [/too many conditions/, "الشروط تتجاوز 20"], [/nesting too deep/, "التداخل أعمق من المسموح"],
  [/unknown operator|operator .* not valid/, "نوع المقارنة لا يناسب المتغير"], [/number expected|percent 0..100|date YYYY-MM-DD|boolean expected|text expected|unknown status value|one value required|list value required/, "قيمة الشرط غير صالحة لنوع المتغير"],
  [/unknown variable/, "متغير غير معروف لهذا الحدث"], [/name 3..120/, "اسم القاعدة من 3 إلى 120 حرفًا"], [/event not ready/, "الحدث غير جاهز للتشغيل"],
  [/step (\w+) not available/, "الخطوة «$1» غير متاحة في المحرك"], [/archived rule/, "القاعدة مؤرشفة — استرجعها أولًا"], [/approve first/, "اعتمد القاعدة أولًا"],
  [/school/i, "الفرع المختار خارج مجموعتك أو غير نشط"],
];
export function serverMsg(m: string): string {
  for (const [r, s] of SERVER) { const x = r.exec(m); if (x) return s.replace("$1", x[1] ?? ""); }
  return m;
}
