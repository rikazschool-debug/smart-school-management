// In-app field test guide for real phones and barcode readers. Nothing is stored: the result is copied as text for the school's record.
import { useEffect, useState } from "react";
import { ClipboardCopy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";

const STEPS = [
  { k: "camera", t: "تشغيل الكاميرا ومنح الإذن", d: "من «مسح الحضور والبحث» اختر «كاميرا الهاتف» ثم «تشغيل الكاميرا» واسمح بالإذن. جرّب الرفض مرة للتأكد من ظهور رسالة واضحة." },
  { k: "card", t: "مسح بطاقة مطبوعة", d: "ثبّت البطاقة داخل الإطار على بعد 10–20 سم. يجب أن تظهر «قُرئت البطاقة — بانتظار تأكيد الخادم» ثم «أكد الخادم تسجيل الحضور» مع الاسم والصف." },
  { k: "torch", t: "اختبار الإضاءة (إن ظهر الزر)", d: "زر الإضاءة يظهر فقط إذا دعمه الهاتف. في إضاءة ضعيفة شغّله وأعد المسح. إن لم يظهر فسجّل «غير مدعوم»." },
  { k: "multi", t: "عدة طلاب وتكرار بطاقة", d: "امسح 3 بطاقات مختلفة متتالية، ثم أعد مسح الأولى: يجب أن تظهر «تم تسجيل الحضور مسبقًا» بوقت التسجيل الأول ولا يزيد العدّاد." },
  { k: "reader", t: "القارئ الخارجي", d: "وصّل قارئ الباركود (USB/Bluetooth بوضع لوحة المفاتيح) واختر «قارئ باركود». امسح بطاقة: يكتب القارئ الرمز ويضغط Enter تلقائيًا." },
  { k: "leave", t: "إيقاف الكاميرا عند المغادرة", d: "أثناء تشغيل الكاميرا انتقل لتبويب آخر أو صغّر المتصفح: يجب أن ينطفئ مؤشر الكاميرا في الهاتف." },
] as const;
type Res = "" | "pass" | "fail" | "na";

export function FieldTestGuide({ schoolName }: { schoolName: string }) {
  const [device, setDevice] = useState("");
  const [env, setEnv] = useState({ ua: "", bd: "…" });
  const [res, setRes] = useState<Record<string, Res>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  useEffect(() => {
    const BD = (window as unknown as { BarcodeDetector?: { getSupportedFormats: () => Promise<string[]> } }).BarcodeDetector;
    const ua = navigator.userAgent;
    if (!BD) setEnv({ ua, bd: "غير متوفر — سيُستخدم ZXing" });
    else void BD.getSupportedFormats().then((f) => setEnv({ ua, bd: f.includes("code_128") ? "متوفر (code_128)" : "متوفر دون code_128 — سيُستخدم ZXing" })).catch(() => setEnv({ ua, bd: "خطأ — سيُستخدم ZXing" }));
  }, []);
  const label = { pass: "نجح", fail: "فشل", na: "غير مدعوم/لم يُجرب", "": "—" } as const;
  const copy = async () => {
    const lines = [`تقرير اختبار ميداني — ${schoolName}`, `التاريخ: ${new Date().toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" })}`, `الجهاز: ${device || "—"}`, `المتصفح: ${env.ua}`, `BarcodeDetector: ${env.bd}`, "",
      ...STEPS.map((s, i) => `${i + 1}. ${s.t}: ${label[res[s.k] ?? ""]}${notes[s.k] ? ` — ${notes[s.k]}` : ""}`)];
    try { await navigator.clipboard.writeText(lines.join("\n")); toast.success("نُسخ التقرير — الصقه في سجل المدرسة أو أرسله للإدارة"); } catch { toast.error("تعذر النسخ"); }
  };
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5">
      <div>
        <h2 className="font-bold">دليل الاختبار الميداني للكاميرا والقارئ</h2>
        <p className="text-sm text-muted-foreground">استخدم بطاقات طلاب حقيقية مطبوعة. لا يُحفظ هنا شيء؛ انسخ النتيجة في النهاية. صيغة البطاقة: Code 128.</p>
      </div>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <label className="space-y-1"><span className="font-medium">الجهاز (الطراز ونظام التشغيل)</span><Input value={device} onChange={(e) => setDevice(e.target.value)} placeholder="مثال: iPhone 13 — iOS 18" /></label>
        <div className="space-y-1"><span className="font-medium">واجهة المسح الأصلية</span><p className="rounded-lg border bg-muted/40 p-2">{env.bd}</p></div>
      </div>
      <ol className="space-y-3">
        {STEPS.map((s, i) => (
          <li key={s.k} className="rounded-xl border p-3 text-sm">
            <p className="font-semibold">{i + 1}. {s.t}</p>
            <p className="mt-1 text-muted-foreground">{s.d}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <select aria-label={`نتيجة ${s.t}`} className={selectCls("w-44")} value={res[s.k] ?? ""} onChange={(e) => setRes({ ...res, [s.k]: e.target.value as Res })}>
                <option value="">— النتيجة —</option><option value="pass">نجح</option><option value="fail">فشل</option><option value="na">غير مدعوم/لم يُجرب</option>
              </select>
              <Input className="min-w-48 flex-1" placeholder="ملاحظة (اختياري)" value={notes[s.k] ?? ""} onChange={(e) => setNotes({ ...notes, [s.k]: e.target.value })} />
            </div>
          </li>
        ))}
      </ol>
      <Button onClick={copy}><ClipboardCopy className="size-4" />نسخ تقرير الاختبار</Button>
    </section>
  );
}
