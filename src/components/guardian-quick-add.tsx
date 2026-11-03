import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { supabase } from "@/integrations/supabase/client";
import { provisionAccounts } from "@/lib/accounts.functions";
import { normPhone } from "@/lib/people-import";
import { arabicError } from "@/lib/session";

export const ACCOUNT_STATE: Record<string, string> = {
  linked: "الحساب جاهز ومربوط",
  pending_phone: "بانتظار أول دخول بالجوال ورمز واتساب",
  pending_password: "بانتظار تغيير كلمة المرور الأولية",
  none: "بلا حساب",
};

/** Guardian login = mobile + WhatsApp code. Created with no access until the guardian confirms the mobile on first sign-in. */
export function CreateAccountButton({ guardianId }: { guardianId: string; name?: string | undefined }) {
  const run = useServerFn(provisionAccounts);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <Button size="sm" variant="ghost" disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        const [r] = await run({ data: { kind: "guardian", ids: [guardianId] } });
        if (r?.state === "error") toast.error(r.msg ?? "تعذّر إنشاء الحساب"); else toast.success(ACCOUNT_STATE[r?.state ?? "none"]);
        qc.invalidateQueries();
      } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
    }}><KeyRound className="size-4" /> إنشاء حساب دخول</Button>
  );
}

/** Student → guardian by name + mobile (ID optional). Same ID or mobile in the school reuses the one guardian and account — never by name alone. */
export function GuardianQuickAdd({ studentId, studentName, onDone }: { studentId: string; studentName?: string | undefined; onDone: () => void }) {
  const qc = useQueryClient();
  const run = useServerFn(provisionAccounts);
  const [f, setF] = useState({ name: "", phone: "", nid: "", rel: "father" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return void toast.error("أدخل اسم ولي الأمر");
    const phone = normPhone(f.phone);
    if (!phone) return void toast.error("أدخل جوال ولي الأمر بصيغة 05XXXXXXXX");
    if (f.nid.trim() && !/^[12]\d{9}$/.test(f.nid.replace(/\D/g, ""))) return void toast.error("هوية ولي الأمر 10 أرقام");
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("upsert_student_guardian", { _student: studentId, _name: f.name, _phone: phone, _national_id: f.nid, _relationship: f.rel });
      if (error) throw error;
      const g = (data as { guardian_id: string; has_account: boolean; created: boolean }[])[0]!;
      if (g.has_account) setResult(`ولي الأمر لديه حساب مسبقًا، وأُضيف ${studentName ?? "الطالب"} إلى أبنائه في الحساب نفسه.`);
      else {
        const [r] = await run({ data: { kind: "guardian", ids: [g.guardian_id] } });
        setResult(r?.state === "error" ? `حُفظ ولي الأمر، وتعذّر إنشاء الحساب: ${r.msg}` : `${ACCOUNT_STATE[r?.state ?? "none"]}. يدخل ولي الأمر بجواله ويصله الرمز على واتساب، ولا يرى بيانات أبنائه قبل ذلك.`);
      }
      qc.invalidateQueries();
    } catch (err) { toast.error(arabicError(err)); } finally { setBusy(false); }
  }

  if (result) return (
    <div className="space-y-3">
      <p className="rounded-lg bg-secondary p-3 text-sm">{result}</p>
      <Button onClick={onDone}>تم</Button>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs text-muted-foreground">إن كان الجوال أو رقم الهوية مسجلًا لولي أمر في المدرسة يُضاف الطالب إلى حسابه نفسه. لا يُربط بالاسم وحده.</p>
      <div className="space-y-1.5"><Label htmlFor="gq-n">اسم ولي الأمر</Label><Input id="gq-n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="gq-p">جوال ولي الأمر</Label><Input id="gq-p" dir="ltr" inputMode="tel" placeholder="05XXXXXXXX" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="gq-i">رقم الهوية (اختياري)</Label><Input id="gq-i" dir="ltr" inputMode="numeric" value={f.nid} onChange={(e) => setF({ ...f, nid: e.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="gq-r">صلة القرابة</Label>
        <select id="gq-r" className={selectCls()} value={f.rel} onChange={(e) => setF({ ...f, rel: e.target.value })}>
          <option value="father">الأب</option><option value="mother">الأم</option><option value="brother">الأخ</option><option value="sister">الأخت</option><option value="other">أخرى</option>
        </select>
      </div>
      <div className="flex gap-2"><Button type="submit" disabled={busy}>حفظ ولي الأمر</Button><Button type="button" variant="ghost" onClick={onDone}>لاحقًا</Button></div>
    </form>
  );
}
