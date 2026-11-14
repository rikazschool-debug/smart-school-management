import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { arabicError } from "@/lib/session";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [
      { title: "قبول دعوة — ركاز" },
      { name: "description", content: "قبول دعوة الانضمام إلى مدرسة على منصة ركاز." },
      { property: "og:title", content: "قبول دعوة — ركاز" },
      { property: "og:description", content: "قبول دعوة الانضمام إلى مدرسة على منصة ركاز." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InvitePage,
});

type Preview = { school_name: string | null; role: Role | null; email_hint: string | null; status: string; email_matches: boolean; email_confirmed: boolean };

const STATUS_MSG: Record<string, string> = {
  not_found: "رابط الدعوة غير صحيح.",
  accepted: "تم استخدام هذه الدعوة مسبقًا.",
  revoked: "ألغيت هذه الدعوة. اطلب من مدرستك دعوة جديدة.",
  expired: "انتهت صلاحية هذه الدعوة. اطلب من مدرستك إعادة إرسالها.",
};

function InvitePage() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "signedout" | "ready">("loading");
  const [p, setP] = useState<Preview | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = /^[0-9a-f-]{36}$/i.test(token);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return setState("signedout");
      setEmail(data.user.email ?? "");
      if (!valid) { setP({ school_name: null, role: null, email_hint: null, status: "not_found", email_matches: false, email_confirmed: false }); return setState("ready"); }
      const { data: rows, error } = await supabase.rpc("invitation_preview", { _token: token });
      if (error) toast.error(arabicError(error));
      setP((rows?.[0] as Preview) ?? null);
      setState("ready");
    })();
  }, [token, valid]);

  async function accept() {
    setBusy(true);
    const { error } = await supabase.rpc("accept_invitation", { _token: token });
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    toast.success("تم قبول الدعوة");
    localStorage.removeItem("rikaz.activeContext");
    navigate({ to: "/app" });
  }

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border bg-card p-6 text-center">
        <h1 className="text-2xl font-bold">دعوة للانضمام</h1>
        {state === "loading" && <p className="text-muted-foreground">جارٍ التحقق…</p>}
        {state === "signedout" && (
          <>
            <p className="text-muted-foreground">سجّل الدخول أو أنشئ حسابًا بالبريد الذي وصلته الدعوة لقبولها.</p>
            <div className="flex justify-center gap-2">
              <Button asChild><Link to="/auth" search={{ invite: token }}>تسجيل الدخول</Link></Button>
              <Button asChild variant="outline"><Link to="/auth" search={{ invite: token, mode: "signup" }}>إنشاء حساب</Link></Button>
            </div>
          </>
        )}
        {state === "ready" && p && (
          p.status !== "pending" ? <p className="text-destructive">{STATUS_MSG[p.status]}</p> : (
            <>
              <p>تدعوك <b>{p.school_name}</b> للانضمام بدور <b>{p.role ? ROLE_LABELS[p.role] : ""}</b>.</p>
              <p className="text-sm text-muted-foreground">الدعوة موجهة إلى <span dir="ltr">{p.email_hint}</span></p>
              {!p.email_matches ? (
                <p className="text-destructive">أنت مسجل بالبريد <span dir="ltr">{email}</span>، والدعوة لبريد آخر. سجّل الخروج وادخل بالبريد الصحيح.</p>
              ) : !p.email_confirmed ? (
                <p className="text-destructive">أكّد بريدك الإلكتروني أولًا من الرسالة التي وصلتك، ثم عد لهذا الرابط.</p>
              ) : (
                <Button onClick={accept} disabled={busy}>قبول الدعوة</Button>
              )}
              {!p.email_matches && <Button variant="outline" onClick={async () => { await supabase.auth.signOut(); setState("signedout"); }}>تسجيل الخروج</Button>}
            </>
          )
        )}
      </div>
    </main>
  );
}
