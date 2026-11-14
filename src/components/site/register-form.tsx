import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { arabicError } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, ClipboardList, Headphones, ShieldCheck } from "lucide-react";

const STAGES = [["kg", "رياض الأطفال"], ["primary", "ابتدائي"], ["middle", "متوسط"], ["secondary", "ثانوي"], ["intl", "مسار دولي"]] as const;
const schema = z.object({
  org_name: z.string().trim().min(2, "اسم المؤسسة مطلوب").max(150),
  contact_name: z.string().trim().min(2, "اسم المسؤول مطلوب").max(100),
  job_title: z.string().trim().max(100),
  phone: z.string().trim().regex(/^\+?[0-9]{9,15}$/, "رقم الجوال غير صحيح"),
  email: z.union([z.literal(""), z.string().trim().email("البريد الإلكتروني غير صحيح").max(255)]),
  city: z.string().trim().max(80),
  schools_count: z.string().regex(/^\d{0,3}$/, "عدد غير صحيح"),
  students_count: z.string().regex(/^\d{0,6}$/, "عدد غير صحيح"),
  notes: z.string().trim().max(1000),
});
type F = z.infer<typeof schema>;
const EMPTY: F = { org_name: "", contact_name: "", job_title: "", phone: "", email: "", city: "", schools_count: "", students_count: "", notes: "" };

export function RegisterForm() {
  const [f, setF] = useState<F>(EMPTY);
  const [stages, setStages] = useState<string[]>([]);
  const [err, setErr] = useState<Partial<Record<keyof F, string>>>({});
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState<string | null>(null);
  const set = (k: keyof F) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = schema.safeParse(f);
    if (!r.success) { const m: typeof err = {}; for (const i of r.error.issues) m[i.path[0] as keyof F] ??= i.message; setErr(m); return; }
    setErr({}); setBusy(true);
    const { data, error } = await supabase.rpc("signup_request_submit" as never, { _p: { ...r.data, stages } } as never);
    setBusy(false);
    if (error) { toast.error(arabicError(error)); return; }
    setRef(String(data));
  }

  if (ref) return (
    <div className="site-page rounded-3xl border bg-card p-10 text-center shadow-xl">
      <CheckCircle2 className="mx-auto size-14 text-primary" />
      <h2 className="mt-4 font-display text-2xl">وصل طلبك</h2>
      <p className="mt-2 text-muted-foreground">رقم الطلب</p>
      <p className="mt-1 font-display text-4xl tracking-wider text-primary" dir="ltr">{ref}</p>
      <p className="mt-4 text-sm text-muted-foreground">احتفظ بهذا الرقم، وسيتواصل معك فريق ركاز على الجوال المسجل.</p>
      <Button asChild className="mt-6"><Link to="/">العودة للرئيسية</Link></Button>
    </div>
  );

  const field = (k: keyof F, label: string, props: Record<string, unknown> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={k}>{label}</Label>
      <Input id={k} value={f[k]} onChange={set(k)} aria-invalid={!!err[k]} {...props} />
      {err[k] && <p className="text-xs text-destructive">{err[k]}</p>}
    </div>
  );
  return (
    <form onSubmit={submit} className="rounded-3xl border bg-card/90 p-6 shadow-xl backdrop-blur md:p-8" noValidate>
      <h2 className="font-display text-xl">بيانات المؤسسة</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {field("org_name", "اسم المؤسسة أو المدرسة *")}
        {field("city", "المدينة")}
        {field("schools_count", "عدد المدارس / الفروع", { inputMode: "numeric", dir: "ltr" })}
        {field("students_count", "عدد الطلاب تقريبًا", { inputMode: "numeric", dir: "ltr" })}
      </div>
      <div className="mt-4 space-y-1.5">
        <Label>المراحل الدراسية</Label>
        <div className="flex flex-wrap gap-2">
          {STAGES.map(([k, l]) => { const on = stages.includes(k); return (
            <button key={k} type="button" aria-pressed={on} onClick={() => setStages((s) => on ? s.filter((x) => x !== k) : [...s, k])}
              className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{l}</button>
          ); })}
        </div>
      </div>
      <h2 className="mt-8 font-display text-xl">بيانات المسؤول</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {field("contact_name", "الاسم *")}
        {field("job_title", "المسمى الوظيفي")}
        {field("phone", "رقم الجوال *", { inputMode: "tel", dir: "ltr", placeholder: "05xxxxxxxx" })}
        {field("email", "البريد الإلكتروني", { type: "email", dir: "ltr" })}
      </div>
      <div className="mt-4 space-y-1.5">
        <Label htmlFor="notes">ملاحظات أو احتياجات خاصة</Label>
        <Textarea id="notes" rows={3} value={f.notes} onChange={set("notes")} />
      </div>
      <Button type="submit" size="lg" className="mt-6 w-full" disabled={busy}>{busy ? "جارٍ الإرسال…" : "إرسال الطلب"}</Button>
      <p className="mt-3 text-center text-xs text-muted-foreground">لا يُنشأ حساب تلقائيًا؛ يراجع فريق ركاز طلبك ويتواصل معك.</p>
    </form>
  );
}

export const REGISTER_POINTS = [
  { icon: ClipboardList, t: "أرسل بيانات مدارسك", d: "دقيقتان فقط لتعبئة الطلب." },
  { icon: Headphones, t: "نتواصل معك", d: "يراجع فريق ركاز الطلب ويحدد معك الباقة." },
  { icon: ShieldCheck, t: "نجهّز حسابك", d: "يُنشأ حساب المالك بدعوة آمنة باسمك." },
];
