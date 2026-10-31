import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { arabicError } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "signin" | "signup" | "forgot";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { mode?: Mode } =>
    s["mode"] === "signup" || s["mode"] === "forgot" ? { mode: s["mode"] } : {},
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

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => data.user && navigate({ to: "/app" }));
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) return void toast.error("أدخل بريدًا إلكترونيًا صحيحًا");
    if (mode !== "forgot" && password.length < 8) return void toast.error("كلمة المرور 8 أحرف على الأقل");
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/app" });
      } else if (mode === "signup") {
        if (!name.trim()) throw new Error("الاسم الكامل مطلوب");
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/app`, data: { full_name: name.trim() } },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/app" });
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
      <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground md:flex">
        <span className="font-display text-3xl text-sidebar-primary">ركاز</span>
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
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input id="email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {mode !== "forgot" && (
                <div className="space-y-1.5">
                  <Label htmlFor="password">كلمة المرور</Label>
                  <Input id="password" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} />
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
              <button type="button" className="text-primary" onClick={() => setMode("signup")}>حساب جديد</button>
            )}
            {mode === "signin" && (
              <button type="button" className="text-muted-foreground" onClick={() => setMode("forgot")}>نسيت كلمة المرور؟</button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">إن دُعيت من مدرستك، أنشئ حسابًا بنفس البريد الذي دُعيت به وستظهر لك عضويتك تلقائيًا.</p>
        </form>
      </div>
    </div>
  );
}
