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
import { autoAccounts, provisionAccounts, type AutoResult } from "@/lib/accounts.functions";
import { normPhone } from "@/lib/people-import";
import { arabicError } from "@/lib/session";

export const ACCOUNT_STATE: Record<string, string> = {
  linked: "الحساب جاهز ومربوط",
  pending_phone: "بانتظار أول دخول بالهوية ورمز التحقق",
  pending_password: "بانتظار تغيير كلمة المرور الأولية",
  none: "بلا حساب",
  review: "يحتاج مراجعة: الجوال/الهوية لحساب شخص آخر — لم يُربط",
  missing_phone: "بيانات ناقصة: أضف جوال ولي الأمر ليُنشأ حسابه تلقائيًا",
  missing_id: "بيانات ناقصة: أضف رقم هوية الطالب ليُنشأ حسابه تلقائيًا",
};

/** Stored «account ready» message state (acct_outbox.status) in plain words. */
export const MSG_STATE: Record<string, string> = { queued: "قيد الإرسال", sending: "قيد الإرسال", waiting_template: "بانتظار القالب", accepted: "أُرسلت رسالة الجوال", failed: "تعذّر — ستُعاد المحاولة", unknown: "غير مؤكد — راجع WATI", skipped: "لم يُرسل (قبل اعتماد القالب)" };

const MSG: Record<string, string> = { queued: "رسالة الجوال قيد الإرسال", accepted: "أُرسلت رسالة على الجوال", waiting_template: "رسالة الجوال بانتظار اعتماد قالب واتساب", failed: "تعذّر إرسال رسالة الجوال وستُعاد المحاولة" };

/** Plain-language summary of the automatic logins (student + guardians) and the WhatsApp message. */
export function autoSummary(r: AutoResult): string {
  const parts: string[] = [];
  if (r.student) parts.push(`الطالب: ${r.student.state === "error" ? r.student.msg ?? "تعذّر" : ACCOUNT_STATE[r.student.state] ?? r.student.state}`);
  for (const g of r.guardians) parts.push(`ولي الأمر ${g.name}: ${g.state === "error" ? g.msg ?? "تعذّر" : ACCOUNT_STATE[g.state] ?? g.state}${MSG[g.message] ? ` — ${MSG[g.message]}` : ""}`);
  return parts.join("\n");
}

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

/**
 * Student → guardian by name + national ID (mobile optional). Same ID or mobile in the school reuses the one guardian — never by name alone.
 * After saving, the student's and the guardian's logins are created automatically (autoAccounts); without a mobile the guardian
 * waits as «بيانات ناقصة» and gets the account + message as soon as the mobile is added.
 */
export function GuardianQuickAdd({ studentId, onDone }: { studentId: string; studentName?: string | undefined; onDone: () => void }) {
  const qc = useQueryClient();
  const auto = useServerFn(autoAccounts);
  const [f, setF] = useState({ name: "", phone: "", nid: "", rel: "father" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function finish() {
    try { setResult(autoSummary(await auto({ data: { studentId } }))); } catch (err) { setResult(`حُفظت البيانات، وتعذّر إنشاء الحسابات الآن: ${arabicError(err)}`); }
    qc.invalidateQueries();
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return void toast.error("أدخل اسم ولي الأمر");
    if (!/^[12]\d{9}$/.test(f.nid.replace(/\D/g, ""))) return void toast.error("أدخل رقم هوية ولي الأمر أو إقامته (10 أرقام)");
    const phone = f.phone.trim() ? normPhone(f.phone) : null;
    if (f.phone.trim() && !phone) return void toast.error("الجوال بصيغة 05XXXXXXXX أو اتركه فارغًا");
    setBusy(true);
    try {
      const { error } = await supabase.rpc("upsert_student_guardian", { _student: studentId, _name: f.name, _phone: phone ?? "", _national_id: f.nid, _relationship: f.rel });
      if (error) throw error;
      await finish();
    } catch (err) { toast.error(arabicError(err)); } finally { setBusy(false); }
  }

  if (result) return (
    <div className="space-y-3">
      <p className="whitespace-pre-line rounded-lg bg-secondary p-3 text-sm">{result}</p>
      <Button onClick={onDone}>تم</Button>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs text-muted-foreground">إن كان رقم الهوية أو الجوال مسجلًا لولي أمر في المدرسة يُضاف الطالب إلى حسابه نفسه. لا يُربط بالاسم وحده.</p>
      <div className="space-y-1.5"><Label htmlFor="gq-n">اسم ولي الأمر</Label><Input id="gq-n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="gq-i">رقم هوية ولي الأمر أو إقامته</Label><Input id="gq-i" dir="ltr" inputMode="numeric" value={f.nid} onChange={(e) => setF({ ...f, nid: e.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="gq-p">جوال ولي الأمر (اختياري — يلزم لرمز الدخول والرسالة)</Label><Input id="gq-p" dir="ltr" inputMode="tel" placeholder="05XXXXXXXX" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
      <div className="space-y-1.5"><Label htmlFor="gq-r">صلة القرابة</Label>
        <select id="gq-r" className={selectCls()} value={f.rel} onChange={(e) => setF({ ...f, rel: e.target.value })}>
          <option value="father">الأب</option><option value="mother">الأم</option><option value="brother">الأخ</option><option value="sister">الأخت</option><option value="other">أخرى</option>
        </select>
      </div>
      <div className="flex gap-2"><Button type="submit" disabled={busy}>حفظ ولي الأمر وإنشاء الحسابات</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => { setBusy(true); void finish().finally(() => setBusy(false)); }}>لاحقًا (حساب الطالب فقط)</Button></div>
    </form>
  );
}
