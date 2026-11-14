import { RikazLogo } from "@/components/logo";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormFields, missingRequired } from "@/components/events/form-render";
import { AUDIENCE, MODE, fmtD, fmtDT, newClientKey, type Answers, type Field } from "@/components/events/shared";
import { PUBLIC_ERR, getPublicCourse, publicFiles, submitPublicCourse } from "@/lib/events-public.functions";
import { publicUploader } from "@/components/events/upload";
import { PublicFiles } from "@/components/events/public-files";

export const Route = createFileRoute("/join/$token")({
  head: () => ({ meta: [
    { title: "التسجيل في دورة — ركاز" }, { name: "description", content: "نموذج التسجيل في دورة تنظمها المدرسة. لا يلزم حساب في ركاز." },
    { property: "og:title", content: "التسجيل في دورة — ركاز" }, { property: "og:description", content: "سجّل في الدورة وتابع حالة طلبك برابط آمن." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" },
  ] }),
  component: JoinPage,
});

type Pub = {
  state: string; error?: string;
  item?: { title: string; description: string | null; school: string; org: string; category: string | null; location: string | null; mode: string; trainer: string | null;
    conditions: string | null; reg_opens: string | null; reg_closes: string | null; audience: string; capacity: number | null; full: boolean; cancel_reason: string | null;
    sessions: { starts_at: string; ends_at: string | null; title: string | null; location: string | null }[] };
  form?: { version: number; fields: Field[] };
};

const STATE_MSG: Record<string, string> = {
  invalid: "الرابط غير صحيح أو لم يعد متاحًا.", link_off: "أوقفت المدرسة رابط التسجيل لهذه الدورة.", closed: "التسجيل مغلق حاليًا.",
  not_yet: "لم يبدأ التسجيل بعد.", ended: "انتهت فترة التسجيل.", cancelled: "أُلغيت الدورة.", no_form: "نموذج التسجيل غير جاهز بعد.",
  internal_only: "التسجيل في هذه الدورة لطلاب المدارس من حساباتهم في ركاز.",
};

function JoinPage() {
  const { token } = Route.useParams();
  const q = useQuery({ queryKey: ["evt-pub", token], queryFn: () => getPublicCourse({ data: { token } }) as Promise<Pub> });
  const [answers, setAnswers] = useState<Answers>({});
  const [fields, setFields] = useState<Field[] | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ ref: string; track?: string | undefined; dup?: boolean } | null>(null);
  const [hp, setHp] = useState("");
  const started = useRef(Date.now());
  const key = useRef<string>("");
  useEffect(() => { key.current = newClientKey(); }, []);
  useEffect(() => { if (q.data?.form && !fields) { setFields(q.data.form.fields); setVersion(q.data.form.version); } }, [q.data, fields]);

  if (q.isLoading) return <Shell><p className="text-muted-foreground">جارٍ التحميل…</p></Shell>;
  if (q.error || !q.data || q.data.error) return <Shell><p className="text-destructive">تعذر تحميل الصفحة.</p><Button className="mt-3" variant="outline" onClick={() => q.refetch()}>إعادة المحاولة</Button></Shell>;
  const d = q.data;
  if (!d.item) return <Shell><h1 className="text-xl font-bold">التسجيل في دورة</h1><p className="mt-2 text-muted-foreground">{STATE_MSG[d.state] ?? STATE_MSG["invalid"]}</p></Shell>;
  const it = d.item;
  const trackUrl = done?.track && typeof window !== "undefined" ? `${window.location.origin}/join/track/${done.track}` : null;

  async function send() {
    if (!fields || busy) return;
    const miss = missingRequired(fields, answers);
    if (miss) { setErr(`الحقل «${miss}» مطلوب`); return; }
    setBusy(true); setErr(null);
    try {
      const r = (await submitPublicCourse({ data: { token, version, answers, clientKey: key.current, hp, elapsed: Date.now() - started.current } })) as Record<string, unknown>;
      if (r["ok"]) { setDone({ ref: String(r["ref"]), track: r["track"] ? String(r["track"]) : undefined, dup: !!r["dup"] }); return; }
      if (r["error"] === "version") {
        // the form changed while filling: keep what still matches and show the new version
        setFields(r["fields"] as Field[]); setVersion(Number(r["version"]));
        setErr("حدّثت المدرسة نموذج التسجيل أثناء تعبئتك. أبقينا إجاباتك؛ راجع الحقول ثم أرسل مجددًا.");
        return;
      }
      setErr(String(r["message"] ?? PUBLIC_ERR[String(r["error"])] ?? PUBLIC_ERR["server"]));
    } catch { setErr(PUBLIC_ERR["server"]!); } finally { setBusy(false); }
  }

  return (
    <Shell>
      <p className="text-xs text-muted-foreground">{it.org} · {it.school}</p>
      <h1 className="mt-1 text-2xl font-bold">{it.title}</h1>
      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        {it.category && <Row k="التصنيف" v={it.category} />}<Row k="طريقة الحضور" v={MODE[it.mode] ?? it.mode} />
        {it.location && <Row k="المكان" v={it.location} />}{it.trainer && <Row k="المدرب" v={it.trainer} />}
        <Row k="الفئة" v={AUDIENCE[it.audience] ?? it.audience} />{it.capacity && <Row k="المقاعد" v={String(it.capacity)} />}
        {it.reg_closes && <Row k="آخر موعد للتسجيل" v={fmtDT(it.reg_closes)} />}
      </dl>
      {it.description && <p className="mt-3 whitespace-pre-wrap text-sm">{it.description}</p>}
      {it.sessions.length > 0 && (
        <div className="mt-3"><p className="text-sm font-semibold">المواعيد</p>
          <ul className="mt-1 space-y-0.5 text-sm">{it.sessions.map((s, i) => <li key={i}>{s.title ? `${s.title}: ` : ""}{fmtDT(s.starts_at)}{s.location ? ` — ${s.location}` : ""}</li>)}</ul></div>
      )}
      {it.conditions && <div className="mt-3 rounded-lg bg-muted p-3 text-sm"><p className="font-semibold">الشروط</p><p className="whitespace-pre-wrap">{it.conditions}</p></div>}
      {it.full && d.state === "open" && <p className="mt-3 rounded-lg bg-warning/20 p-2 text-sm">اكتملت المقاعد المقبولة؛ يمكنك التقديم وسيُراجع طلبك عند توفر مقعد.</p>}

      {done ? (
        <div className="mt-6 rounded-xl border border-success/40 bg-success/10 p-4" role="status">
          <p className="flex items-center gap-2 font-bold text-success"><CheckCircle2 className="size-5" /> {done.dup ? "استلمنا طلبك مسبقًا" : "تم استلام طلبك"}</p>
          <p className="mt-2 text-sm">الرقم المرجعي: <b dir="ltr">{done.ref}</b></p>
          {trackUrl ? (
            <div className="mt-3 space-y-2 text-sm">
              <p>احفظ رابط المتابعة التالي؛ هو الطريقة الوحيدة لمعرفة حالة طلبك واستكمال المطلوب:</p>
              <p dir="ltr" className="break-all rounded bg-card p-2 text-xs">{trackUrl}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(trackUrl); toast.success("نُسخ الرابط"); }}><Copy className="size-4" /> نسخ رابط المتابعة</Button>
                <Button size="sm" asChild><a href={trackUrl}>فتح صفحة المتابعة</a></Button>
              </div>
            </div>
          ) : done.dup ? <p className="mt-2 text-sm text-muted-foreground">استخدم رابط المتابعة الذي ظهر لك عند الإرسال الأول.</p> : null}
        </div>
      ) : null}
      {!done && <PublicFiles title="مرفقات الدورة" load={() => publicFiles({ data: { token } })} qk={["evt-pub-files", token]} />}
      {done ? null : d.state === "open" && fields ? (
        <form className="mt-6 space-y-4" onSubmit={(e) => { e.preventDefault(); void send(); }} noValidate>
          <h2 className="text-lg font-bold">نموذج التسجيل</h2>
          <FormFields fields={fields} value={answers} onChange={setAnswers} disabled={busy} upload={publicUploader(token, () => key.current)} />
          {/* honeypot: hidden from people, bots fill it */}
          <div aria-hidden className="absolute -left-[9999px] h-0 overflow-hidden"><label>اترك هذا الحقل فارغًا<input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} /></label></div>
          {err && <p role="alert" className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive">{err}</p>}
          <Button type="submit" disabled={busy} className="w-full sm:w-auto">{busy ? "جارٍ الإرسال…" : "إرسال الطلب"}</Button>
          <p className="text-xs text-muted-foreground">التقديم لا ينشئ حسابًا ولا سجل طالب في المدرسة. نستخدم بياناتك لهذه الدورة فقط.</p>
        </form>
      ) : (
        <div className="mt-6 rounded-xl border bg-muted p-4 text-sm">
          <p>{STATE_MSG[d.state] ?? "التسجيل غير متاح."}</p>
          {it.cancel_reason && <p className="mt-1 text-muted-foreground">السبب: {it.cancel_reason}</p>}
          {it.reg_opens && d.state === "not_yet" && <p className="mt-1">يبدأ التسجيل: {fmtDT(it.reg_opens)}</p>}
          {d.state === "internal_only" && <Button asChild size="sm" className="mt-3"><Link to="/auth">الدخول إلى ركاز للتسجيل</Link></Button>}
        </div>
      )}
      <p className="mt-6 text-center text-xs text-muted-foreground">آخر تحديث للصفحة {fmtD(new Date().toISOString())}</p>
    </Shell>
  );
}

function Row({ k, v }: { k: string; v: string }) { return <div className="flex gap-2"><dt className="text-muted-foreground">{k}:</dt><dd className="font-medium">{v}</dd></div>; }

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" className="min-h-screen bg-background px-4 py-8">
      <main className="relative mx-auto max-w-2xl rounded-2xl border bg-card p-5 shadow-sm sm:p-8">
        <p className="mb-4 flex items-center gap-2 font-display text-lg text-primary"><RikazLogo className="size-8" /> ركاز</p>
        {children}
      </main>
    </div>
  );
}
