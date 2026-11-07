import { PasswordInput } from "@/components/password-input";
import { toLoginEmail } from "@/lib/guardian-login";
import { studentLoginEmail } from "@/lib/people-import";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { requestIdCode, studentSignIn, verifyIdCode } from "@/lib/id-login.functions";
import { idLoginMessage } from "@/lib/id-login";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { arabicError } from "@/lib/session";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo-accounts";
import { ROLE_LABELS } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "signin" | "signup" | "forgot";
type Entry = "student" | "guardian" | "staff";
const ENTRIES: { key: Entry; title: string; desc: string }[] = [
  { key: "student", title: "الدخول إلى حساب الطالب", desc: "برقم الهوية أو الإقامة ورقم الطالب في C‑Smart" },
  { key: "guardian", title: "الدخول إلى حساب ولي الأمر", desc: "برقم الهوية أو الإقامة ورمز يصل إلى جوالك المسجل في المدرسة" },
  { key: "staff", title: "الدخول إلى حساب الإدارة والموظفين", desc: "برقم الهوية ورمز التحقق، أو باسم المستخدم وكلمة المرور" },
];
/** Demo buttons only in the review (preview / local) environment, never on the published site. */
const isReviewHost = (h: string) => h === "localhost" || h.startsWith("127.") || h.startsWith("id-preview--") || h.endsWith(".lovableproject.com") || h.includes("preview--");
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
  const [entry, setEntry] = useState<Entry | null>(search.invite ? "staff" : null);
  const [review, setReview] = useState(false);
  useEffect(() => { setReview(isReviewHost(window.location.hostname)); }, []);
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
        <div className="w-full max-w-sm space-y-5">
          {mode === "signin" && !entry ? (
            <>
              <h1 className="font-display text-2xl">تسجيل الدخول</h1>
              <p className="text-sm text-muted-foreground">اختر نوع حسابك</p>
              <div className="space-y-3">
                {ENTRIES.map((x) => (
                  <button key={x.key} type="button" onClick={() => setEntry(x.key)} className="w-full rounded-xl border bg-card p-4 text-start transition hover:border-primary hover:bg-secondary">
                    <span className="block font-semibold">{x.title}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{x.desc}</span>
                  </button>
                ))}
              </div>
            </>
          ) : mode === "signin" && entry === "student" ? (
            <>
              <BackToEntries onClick={() => setEntry(null)} />
              <StudentLogin onDone={() => navigate({ to: "/app" })} />
            </>
          ) : mode === "signin" && entry === "guardian" ? (
            <>
              <BackToEntries onClick={() => setEntry(null)} />
              <IdLogin title="الدخول إلى حساب ولي الأمر" onDone={() => navigate({ to: "/app/choose-role" })} />
            </>
          ) : (
            <>
              {mode === "signin" && <BackToEntries onClick={() => setEntry(null)} />}
              {mode === "signin" && !sent && <IdLogin title="الدخول برقم الهوية أو الإقامة" onDone={() => (search.invite ? go() : navigate({ to: "/app/choose-role" }))} />}
              <form onSubmit={submit} className="space-y-5">
                <h2 className="font-display text-xl">
                  {mode === "signin" ? "أو باسم المستخدم وكلمة المرور" : mode === "signup" ? "إنشاء حساب" : "استعادة كلمة المرور"}
                </h2>
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
                      <Label htmlFor="email">{mode === "signin" ? "اسم المستخدم أو البريد" : "البريد الإلكتروني"}</Label>
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
                    <button type="button" className="text-primary" onClick={() => { setMode("signin"); setSent(null); setEntry("staff"); }}>لدي حساب</button>
                  ) : (
                    search.invite ? <button type="button" className="text-primary" onClick={() => setMode("signup")}>إنشاء حساب للدعوة</button> : <span />
                  )}
                  {mode === "signin" && (
                    <button type="button" className="text-muted-foreground" onClick={() => setMode("forgot")}>نسيت كلمة المرور؟</button>
                  )}
                </div>
              </form>
            </>
          )}
          {mode === "signin" && review && (
            <div className="space-y-2 rounded-xl border border-dashed bg-card p-3">
              <p className="text-sm font-semibold">دخول سريع بالحسابات التجريبية <span className="text-xs font-normal text-muted-foreground">(بيئة المراجعة فقط)</span></p>
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
        </div>
      </div>
    </div>
  );
}

function BackToEntries({ onClick }: { onClick: () => void }) {
  return <button type="button" className="text-sm text-primary" onClick={onClick}>→ الرجوع إلى أنواع الحسابات</button>;
}

async function openWithToken(token: string) {
  await supabase.auth.signOut();
  localStorage.removeItem("rikaz.activeContext");
  const { error } = await supabase.auth.verifyOtp({ token_hash: token, type: "magiclink" });
  if (error) throw error;
}

/** Staff, teachers and guardians: ID/iqama → 6-digit code on WhatsApp to the mobile in the school record (all checks server-side). */
function IdLogin({ onDone, title }: { onDone: () => void; title: string }) {
  const reqFn = useServerFn(requestIdCode);
  const verFn = useServerFn(verifyIdCode);
  const [nid, setNid] = useState("");
  const [code, setCode] = useState("");
  const [ch, setCh] = useState<{ id: string; masked: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function send() {
    setBusy(true); setMsg(null);
    try {
      const r = await reqFn({ data: { nid } });
      if ("error" in r && r.error) setMsg(r.error);
      else if ("challenge" in r && r.challenge) { setCh({ id: r.challenge, masked: r.masked ?? "" }); setCode(""); }
    } catch { setMsg(idLoginMessage("server")); } finally { setBusy(false); }
  }
  async function verify() {
    if (!ch) return;
    setBusy(true); setMsg(null);
    try {
      const r = await verFn({ data: { challenge: ch.id, code } });
      if (r.error || !r.token) { setMsg(r.error ?? idLoginMessage("server")); return; }
      await openWithToken(r.token);
      onDone();
    } catch { setMsg(idLoginMessage("server")); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <h1 className="font-display text-xl">{title}</h1>
      <div className="space-y-1.5"><Label htmlFor="idl-nid">رقم الهوية أو الإقامة</Label><Input id="idl-nid" dir="ltr" inputMode="numeric" maxLength={10} value={nid} disabled={!!ch} onChange={(e) => setNid(e.target.value)} /></div>
      {ch && <div className="space-y-1.5"><Label htmlFor="idl-code">الرمز المرسل على واتساب إلى {ch.masked}</Label><Input id="idl-code" dir="ltr" inputMode="numeric" maxLength={6} autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} /></div>}
      {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
      {!ch ? <Button type="button" className="w-full" disabled={busy} onClick={send}>إرسال الرمز</Button> : (
        <div className="flex gap-2">
          <Button type="button" className="flex-1" disabled={busy || code.length !== 6} onClick={verify}>تأكيد الدخول</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={send}>إعادة الإرسال</Button>
          <Button type="button" variant="ghost" onClick={() => { setCh(null); setMsg(null); }}>تغيير</Button>
        </div>
      )}
    </div>
  );
}

/** Students: ID/iqama + C-Smart student number; a match opens the student's own account (no code, no PIN). */
function StudentLogin({ onDone }: { onDone: () => void }) {
  const fn = useServerFn(studentSignIn);
  const [nid, setNid] = useState("");
  const [no, setNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function go() {
    setBusy(true); setMsg(null);
    try {
      const r = await fn({ data: { nid, csmart: no } });
      if (r.error || !r.token) { setMsg(r.error ?? idLoginMessage("server")); return; }
      await openWithToken(r.token);
      onDone();
    } catch { setMsg(idLoginMessage("server")); } finally { setBusy(false); }
  }
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <h1 className="font-display text-xl">الدخول إلى حساب الطالب</h1>
      <div className="space-y-1.5"><Label htmlFor="st-nid">رقم الهوية أو الإقامة</Label><Input id="st-nid" dir="ltr" inputMode="numeric" maxLength={10} value={nid} onChange={(e) => setNid(e.target.value)} /></div>
      <div className="space-y-1.5"><Label htmlFor="st-no">رقم الطالب الداخلي — C‑Smart</Label><Input id="st-no" dir="ltr" value={no} onChange={(e) => setNo(e.target.value)} /></div>
      {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
      <Button type="button" className="w-full" disabled={busy || !nid || !no} onClick={go}>دخول</Button>
    </div>
  );
}
