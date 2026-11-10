import { PasswordInput } from "@/components/password-input";
import { toLoginEmail } from "@/lib/guardian-login";
import { studentLoginEmail } from "@/lib/people-import";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Brand } from "@/components/site/shell";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { requestIdCode, studentSignIn, verifyIdCode } from "@/lib/id-login.functions";
import { idLoginMessage } from "@/lib/id-login";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { arabicError } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, GraduationCap, HeartHandshake, Sparkles, type LucideIcon } from "lucide-react";

type Mode = "signin" | "signup" | "forgot";
type Entry = "student" | "guardian" | "staff";
const ENTRIES: { key: Entry; tab: string; icon: LucideIcon; title: string; desc: string }[] = [
  { key: "student", tab: "الطالب", icon: GraduationCap, title: "الدخول إلى حساب الطالب", desc: "برقم الهوية أو الإقامة ورقم الطالب في C‑Smart" },
  { key: "guardian", tab: "ولي الأمر", icon: HeartHandshake, title: "الدخول إلى حساب ولي الأمر", desc: "برقم الهوية أو الإقامة ورمز يصل إلى جوالك المسجل في المدرسة" },
  { key: "staff", tab: "الإدارة والموظفون", icon: Building2, title: "الدخول إلى حساب الإدارة والموظفين", desc: "برقم الهوية أو الإقامة ورمز يصل إلى جوالك المسجل" },
];
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
  const [entry, setEntry] = useState<Entry>(search.invite ? "staff" : "student");
  const navigate = useNavigate();
  const go = () => (search.invite ? navigate({ to: "/invite/$token", params: { token: search.invite } }) : navigate({ to: "/app" }));

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => data.user && go());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground md:flex">
        <div className="site-glow absolute -left-24 -top-24 size-96 rounded-full bg-accent/25 blur-3xl" />
        <div className="site-glow absolute -bottom-32 -right-20 size-96 rounded-full bg-primary-foreground/10 blur-3xl" style={{ animationDelay: "3s" }} />
        <div className="site-page relative"><Brand light /></div>
        <div className="site-page relative space-y-6" style={{ animationDelay: "150ms" }}>
          <p className="font-display text-4xl leading-relaxed">مدرسة واحدة أو مجموعة كاملة —<br /><span className="text-accent">كل دور يرى ما يخصه فقط.</span></p>
          <ul className="space-y-3 text-primary-foreground/85">
            {["الطالب برقم الهوية ورقم الطالب", "ولي الأمر برمز يصل إلى جواله", "الإدارة والموظفون برمز تحقق"].map((x, i) => (
              <li key={x} className="site-page flex items-center gap-3" style={{ animationDelay: `${300 + i * 100}ms` }}><span className="size-2 rounded-full bg-accent" />{x}</li>
            ))}
          </ul>
        </div>
        <div className="relative flex items-center justify-between text-sm text-primary-foreground/70">
          <span>منصة إدارة المدارس</span>
          <Link to="/" className="hover:text-primary-foreground">العودة للموقع ←</Link>
        </div>
      </div>
      <div className="site-hero-grad flex items-center justify-center p-6">
        <div className="site-page w-full max-w-md space-y-5 rounded-3xl border bg-card/90 p-6 shadow-xl backdrop-blur md:p-8">
          <div className="md:hidden"><Brand /></div>
          {mode === "signin" && (
            <>
              <div>
                <h1 className="font-display text-2xl">مرحبًا بك في ركاز</h1>
                <p className="mt-1 text-sm text-muted-foreground">اختر نوع حسابك للمتابعة</p>
              </div>
              <div role="tablist" aria-label="نوع الحساب" className="relative grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1.5">
                <span aria-hidden className="absolute inset-y-1.5 rounded-xl bg-card shadow-md transition-all duration-500 ease-out"
                  style={{ width: "calc((100% - 0.75rem - 0.5rem) / 3)", insetInlineStart: `calc(0.375rem + ${ENTRIES.findIndex((x) => x.key === entry)} * ((100% - 0.75rem - 0.5rem) / 3 + 0.25rem))` }} />
                {ENTRIES.map((x) => (
                  <button key={x.key} role="tab" type="button" aria-selected={entry === x.key} onClick={() => setEntry(x.key)}
                    className={`relative z-10 flex flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 text-xs font-semibold transition-colors duration-300 ${entry === x.key ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                    <x.icon className={`size-5 transition-transform duration-500 ${entry === x.key ? "scale-110" : ""}`} />
                    <span className="leading-tight">{x.tab}</span>
                  </button>
                ))}
              </div>
              <p key={entry} className="site-page flex items-start gap-2 rounded-xl bg-secondary/60 px-3 py-2 text-xs text-muted-foreground"><Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />{ENTRIES.find((x) => x.key === entry)!.desc}</p>
            </>
          )}
          {mode === "signin" && entry === "student" ? (
            <div key="student" className="site-page">
              <StudentLogin onDone={() => navigate({ to: "/app" })} />
            </div>
          ) : mode === "signin" && entry === "guardian" ? (
            <div key="guardian" className="site-page">
              <IdLogin title="الدخول إلى حساب ولي الأمر" onDone={() => navigate({ to: "/app/choose-role" })} />
            </div>
          ) : (
            <div key="staff" className="site-page space-y-5">
              {mode === "signin" && !sent && <IdLogin title="الدخول إلى حساب الإدارة والموظفين" onDone={() => (search.invite ? go() : navigate({ to: "/app/choose-role" }))} />}              {/* sign-in is by ID only (user request); the password form stays for invitation signup and reset */}
              {(mode !== "signin" || !!search.invite) && <form onSubmit={submit} className="space-y-5">
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
              </form>}
            </div>
          )}
          {mode === "signin" && (
            <div><PlatformOwnerLogin onDone={() => navigate({ to: "/app" })} /></div>
          )}
          {search.invite && <p className="text-xs text-muted-foreground">أنشئ حسابًا بنفس البريد الذي دُعيت به وستظهر لك عضويتك تلقائيًا.</p>}
        </div>
      </div>
    </div>
  );
}

/** Platform owner controls every organization, so it never uses the shared demo password: its own password is typed here. */
const PLATFORM_OWNER_EMAIL = "owner@platform.rikaz.app";
function PlatformOwnerLogin({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await supabase.auth.signOut();
    localStorage.removeItem("rikaz.activeContext");
    const { error } = await supabase.auth.signInWithPassword({ email: PLATFORM_OWNER_EMAIL, password: pw });
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    onDone();
  }
  if (!open) return <Button type="button" size="sm" variant="outline" className="w-full" onClick={() => setOpen(true)}>مالك المنصة</Button>;
  return (
    <form onSubmit={login} className="space-y-2 rounded-lg border bg-background p-2">
      <Label htmlFor="po-pw" className="text-xs">كلمة مرور مالك المنصة (خاصة، ليست كلمة المرور التجريبية)</Label>
      <PasswordInput id="po-pw" value={pw} onChange={(e) => setPw(e.target.value)} />
      <Button className="w-full" size="sm" disabled={busy || pw.length < 8}>{busy ? "جارٍ…" : "دخول مالك المنصة"}</Button>
    </form>
  );
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
