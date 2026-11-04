import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { completeFirstPassword, completePhoneSetup } from "@/lib/accounts.functions";
import { strongEnough } from "@/lib/people-import";
import { arabicError } from "@/lib/session";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: Gate,
});

/** First-login step for automatically created accounts. The database grants no access until it is completed (account_setup);
 *  this screen only explains and completes it. */
function Gate() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["account-setup-self"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("account_setup" as never).select("need_password, need_phone, completed_at").eq("user_id", u.user?.id ?? "").maybeSingle();
      return { row: data as { need_password: boolean; need_phone: boolean; completed_at: string | null } | null, phoneConfirmed: !!u.user?.phone_confirmed_at };
    },
    staleTime: 60_000,
  });
  const phoneDone = useServerFn(completePhoneSetup);
  const pending = q.data?.row && !q.data.row.completed_at ? q.data.row : null;
  useEffect(() => {
    if (pending?.need_phone && !pending.need_password && q.data?.phoneConfirmed) {
      phoneDone().then(() => { qc.invalidateQueries(); }).catch((e) => toast.error(arabicError(e)));
    }
  }, [pending, q.data?.phoneConfirmed, phoneDone, qc]);
  if (q.isLoading) return null;
  if (pending?.need_password) return <FirstPassword onDone={() => qc.invalidateQueries()} />;
  if (pending?.need_phone) return <Center><p>جارٍ تفعيل حسابك بعد تأكيد جوالك…</p></Center>;
  return <Outlet />;
}

function Center({ children }: { children: React.ReactNode }) {
  return <main dir="rtl" className="grid min-h-dvh place-items-center bg-background p-4"><div className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6">{children}</div></main>;
}

function FirstPassword({ onDone }: { onDone: () => void }) {
  const run = useServerFn(completeFirstPassword);
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const err = strongEnough(p1);
    if (err) return void toast.error(err);
    if (p1 !== p2) return void toast.error("كلمتا المرور غير متطابقتين");
    setBusy(true);
    try { await run({ data: { password: p1 } }); toast.success("حُفظت كلمة المرور الجديدة"); onDone(); }
    catch (e2) { toast.error(arabicError(e2)); } finally { setBusy(false); }
  }
  return (
    <Center>
      <h1 className="text-lg font-bold">غيّر كلمة المرور الأولية</h1>
      <p className="text-sm text-muted-foreground">هذه كلمة مرور مؤقتة. لن تصل إلى ركاز قبل اختيار كلمة مرور جديدة خاصة بك.</p>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1"><Label htmlFor="np1">كلمة المرور الجديدة</Label><PasswordInput id="np1" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="np2">تأكيد كلمة المرور</Label><PasswordInput id="np2" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} /></div>
        <p className="text-xs text-muted-foreground">8 أحرف على الأقل، حروف وأرقام معًا.</p>
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ والمتابعة"}</Button>
        <Button type="button" variant="ghost" className="w-full" onClick={async () => { await supabase.auth.signOut(); location.href = "/auth"; }}>تسجيل الخروج</Button>
      </form>
    </Center>
  );
}
