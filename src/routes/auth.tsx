import { PasswordInput } from "@/components/password-input";
import { toLoginEmail } from "@/lib/guardian-login";
import { normPhone, studentLoginEmail } from "@/lib/people-import";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { arabicError } from "@/lib/session";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo-accounts";
import { ROLE_LABELS } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "signin" | "signup" | "forgot";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { mode?: Mode; invite?: string } => {
    const out: { mode?: Mode; invite?: string } = {};
    if (s["mode"] === "forgot" || (s["mode"] === "signup" && typeof s["invite"] === "string")) out.mode = s["mode"];
    if (typeof s["invite"] === "string" && UUID_RE.test(s["invite"])) out.invite = s["invite"];
    return out;
  },
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — ركاز" },
      { name: "description", content: "الدخول إلى منصة ركاز لإدارة المدارس أو تسجيل مؤسسة جديدة." },
      { property: "og:title", content: "تسجيل الدخول — ركاز" },
      { property: "og:description", content: "الدخول إلى منصة ركاز لإدارة المدارس." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const search = Route.useSearch();
  const [mode, setMode] = useState<Mode>(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const navigate = useNavigate();
  const go = () => (search.invite ? navigate({ to: "/invite/$token", params: { token: search.invite } }) : navigate({ to: "/app" }));

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => data.user && go());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function demoLogin(email: string) {
    setBusy(true);
    await supabase.auth.signOut();
    localStorage.removeItem("rikaz.activeContext");
    const { error } = await supabase.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    navigate({ to: "/app" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const loginEmail = mode === "signin" ? toLoginEmail(email) : email.trim();
    if (!/^\S+@\S+\.\S+$/.test(loginEmail)) return void toast.error(mode === "signin" ? "أدخل اسم المستخدم أو البريد أو رقم الهوية/الجوال" : "أدخل بريدًا إلكترونيًا صحيحًا");
    if (mode !== "forgot" && password.length < 8) return void toast.error("كلمة المرور 8 أحرف على الأقل");
    setBusy(true);
    try {
      if (mode === "signin") {
        let { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
        // digits = guardian login (legacy) or student national ID
        if (error && /^[\d\s+-]{6,}$/.test(email.trim())) ({ error } = await supabase.auth.signInWithPassword({ email: studentLoginEmail(email), password }));
        if (error) throw error;
        go();
      } else if (mode === "signup") {
        if (!name.trim()) throw new Error("الاسم الكامل مطلوب");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: search.invite ? `${window.location.origin}/invite/${search.invite}` : `${window.location.origin}/app`, data: { full_name: name.trim() } },
        });
        if (error) throw error;
        if (data.session) go();
        else setSent("أرسلنا رابط تأكيد إلى بريدك. افتحه ثم سجّل الدخول.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setSent("إن كان البريد مسجلًا فستصلك رسالة لاستعادة كلمة المرور.");
      }
    } catch (err) {
      toast.error(arabicError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen md:grid-cols-2">
      <div className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground md:flex">
        <span className="font-display text-3xl text-accent">ركاز</span>
        <p className="font-display text-3xl leading-relaxed">مدرسة واحدة أو مجموعة كاملة —<br />كل دور يرى ما يخصه فقط.</p>
        <p className="text-sm opacity-70">منصة إدارة المدارس</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-5">
          <h1 className="font-display text-2xl">
            {mode === "signin" ? "تسجيل الدخول" : mode === "signup" ? "إنشاء حساب" : "استعادة كلمة المرور"}
          </h1>
          {sent ? (
            <p className="rounded-lg bg-secondary p-4 text-sm">{sent}</p>
          ) : (
            <>
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">الاسم الكامل</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="email">{mode === "signin" ? "اسم المستخدم أو البريد أو رقم الهوية" : "البريد الإلكتروني"}</Label>
                <Input id="email" type={mode === "signin" ? "text" : "email"} dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {mode !== "forgot" && (
                <div className="space-y-1.5">
                  <Label htmlFor="password">كلمة المرور</Label>
                  <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
              )}
              <Button className="w-full" disabled={busy}>
                {busy ? "جارٍ…" : mode === "signin" ? "دخول" : mode === "signup" ? "إنشاء الحساب" : "إرسال الرابط"}
              </Button>
            </>
          )}
          <div className="flex justify-between text-sm">
            {mode !== "signin" ? (
              <button type="button" className="text-primary" onClick={() => { setMode("signin"); setSent(null); }}>لدي حساب</button>
            ) : (
              search.invite ? <button type="button" className="text-primary" onClick={() => setMode("signup")}>إنشاء حساب للدعوة</button> : <span />
            )}
            {mode === "signin" && (
              <button type="button" className="text-muted-foreground" onClick={() => setMode("forgot")}>نسيت كلمة المرور؟</button>
            )}
          </div>
          {mode === "signin" && !sent && <PhoneLogin onDone={go} />}
          {mode === "signin" && (
            <div className="space-y-2 rounded-xl border bg-card p-3">
              <p className="text-sm font-semibold">دخول سريع بالحسابات التجريبية</p>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map((d) => (
                  <Button key={d.email} type="button" size="sm" variant="secondary" disabled={busy} onClick={() => demoLogin(d.email)}>
                    {d.label ?? ROLE_LABELS[d.role]}
                  </Button>
                ))}
              </div>
                          </div>
          )}
          {search.invite && <p className="text-xs text-muted-foreground">أنشئ حسابًا بنفس البريد الذي دُعيت به وستظهر لك عضويتك تلقائيًا.</p>}
        </form>
      </div>
    </div>
  );
}

/** Teachers and guardians: mobile + one-time code on WhatsApp (sent by the auth service through WATI; 5-minute expiry enforced by auth).
 *  Only accounts added by a school can receive a code; the reply never says whether the number exists. */
function PhoneLogin({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);
  async function send() {
    const p = normPhone(phone);
    if (!p) return void toast.error("أدخل جوالًا سعوديًا بصيغة 05XXXXXXXX");
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: p, options: { shouldCreateUser: false } });
    setBusy(false);
    // unknown numbers and real sends look the same; only a delivery outage is reported as such
    if (error && /(sending|provider|hook|delivery|503|502|500)/i.test(`${error.message} ${error.status ?? ""}`) && !/signups? not allowed|not found|otp_disabled/i.test(error.message)) {
      return void toast.error("تعذّر إرسال الرمز على واتساب الآن. حاول بعد قليل.");
    }
    if (error && /rate|too many|429|seconds/i.test(`${error.message} ${error.status ?? ""}`)) return void toast.error("طلبت رموزًا كثيرة. انتظر قليلًا ثم أعد المحاولة.");
    setStep("code"); setWait(60);
    setNote("إن كان هذا الجوال مسجلًا في مدرستك فسيصلك رمز على واتساب خلال دقيقة. صلاحية الرمز 5 دقائق ويُستخدم مرة واحدة.");
  }
  async function verify() {
    const p = normPhone(phone);
    if (!p || !/^\d{4,8}$/.test(code.trim())) return void toast.error("أدخل الرمز المكون من أرقام");
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone: p, token: code.trim(), type: "sms" });
    setBusy(false);
    if (error) return void toast.error(/expired/i.test(error.message) ? "انتهت صلاحية الرمز. اطلب رمزًا جديدًا." : "الرمز غير صحيح أو مستخدم من قبل.");
    onDone();
  }
  if (!open) return <Button type="button" variant="outline" className="w-full" onClick={() => setOpen(true)}>الدخول بالجوال ورمز واتساب (المعلم وولي الأمر)</Button>;
  return (
    <div className="space-y-3 rounded-xl border bg-card p-3">
      <p className="text-sm font-semibold">الدخول بالجوال — يصلك الرمز على واتساب</p>
      <div className="space-y-1.5"><Label htmlFor="otp-phone">رقم الجوال</Label><Input id="otp-phone" dir="ltr" inputMode="tel" placeholder="05XXXXXXXX" value={phone} disabled={step === "code"} onChange={(e) => setPhone(e.target.value)} /></div>
      {step === "code" && <div className="space-y-1.5"><Label htmlFor="otp-code">الرمز</Label><Input id="otp-code" dir="ltr" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} /></div>}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
      {step === "phone" ? <Button type="button" className="w-full" disabled={busy} onClick={send}>إرسال الرمز على واتساب</Button> : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy} onClick={verify}>دخول</Button>
          <Button type="button" variant="outline" disabled={busy || wait > 0} onClick={send}>{wait > 0 ? `إعادة الإرسال بعد ${wait} ث` : "إعادة إرسال الرمز"}</Button>
          <Button type="button" variant="ghost" onClick={() => { setStep("phone"); setCode(""); setNote(null); }}>تغيير الرقم</Button>
        </div>
      )}
    </div>
  );
}
