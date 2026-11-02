import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { supabase } from "@/integrations/supabase/client";
import { createGuardianAccount } from "@/lib/guardian-account.functions";
import { arabicError } from "@/lib/session";

type Creds = { login: string; password: string };

/** Shows a freshly created login once, for the school to hand to the guardian. */
export function CredsCard({ c, name }: { c: Creds; name?: string }) {
  const text = `حساب ولي الأمر${name ? ` (${name})` : ""} في ركاز\nاسم الدخول: ${c.login}\nكلمة المرور المؤقتة: ${c.password}`;
  return (
    <div className="space-y-2 rounded-lg border border-primary/40 bg-secondary p-3 text-sm">
      <p className="font-semibold">تم إنشاء الحساب — سلّم هذه البيانات لولي الأمر، فلن تظهر مرة أخرى:</p>
      <p>اسم الدخول: <span dir="ltr" className="font-mono">{c.login}</span></p>
      <p>كلمة المرور المؤقتة: <span dir="ltr" className="font-mono">{c.password}</span></p>
      <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(text); toast.success("نُسخت البيانات"); }}><Copy className="size-4" /> نسخ</Button>
    </div>
  );
}

export function CreateAccountButton({ guardianId, name }: { guardianId: string; name?: string }) {
  const create = useServerFn(createGuardianAccount);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState<Creds | null>(null);
  if (creds) return <CredsCard c={creds} name={name} />;
  return (
    <Button size="sm" variant="ghost" disabled={busy} onClick={async () => {
      setBusy(true);
      try { setCreds(await create({ data: { guardianId } })); qc.invalidateQueries(); }
      catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
    }}><KeyRound className="size-4" /> إنشاء حساب دخول</Button>
  );
}

/** Student → guardian by name + ID/phone. Same ID or phone in the school reuses the one guardian account. */
export function GuardianQuickAdd({ studentId, studentName, onDone }: { studentId: string; studentName?: string; onDone: () => void }) {
  const qc = useQueryClient();
  const create = useServerFn(createGuardianAccount);
  const [f, setF] = useState({ name: "", phone: "", nid: "", rel: "father" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ creds?: Creds; existing?: boolean } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return void toast.error("أدخل اسم ولي الأمر");
    if (!f.phone.trim() && !f.nid.trim()) return void toast.error("أدخل رقم الهوية أو الجوال");
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("upsert_student_guardian", { _student: studentId, _name: f.name, _phone: f.phone, _national_id: f.nid, _relationship: f.rel });
      if (error) throw error;
      const g = (data as { guardian_id: string; has_account: boolean; created: boolean }[])[0]!;
      if (g.has_account) { setResult({ existing: true }); toast.success("رُبط الطالب بحساب ولي الأمر الموجود"); }
      else setResult({ creds: await create({ data: { guardianId: g.guardian_id } }), existing: !g.created });
      qc.invalidateQueries();
    } catch (err) { toast.error(arabicError(err)); } finally { setBusy(false); }
  }

  if (result) return (
    <div className="space-y-3">
      {result.creds ? <CredsCard c={result.creds} name={f.name} /> : (
        <p className="rounded-lg bg-secondary p-3 text-sm">ولي الأمر لديه حساب مسبقًا، وأُضيف {studentName ?? "الطالب"} إلى أبنائه في الحساب نفسه.</p>
      )}
      <Button onClick={onDone}>تم</Button>
    </div>
  );

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs text-muted-foreground">إن كان رقم الهوية أو الجوال مسجلًا لولي أمر في المدرسة، يُضاف الطالب إلى حسابه نفسه، وإلا يُنشأ حساب جديد بكلمة مرور مؤقتة.</p>
      <div className="space-y-1.5"><Label>اسم ولي الأمر</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>رقم الهوية</Label><Input dir="ltr" inputMode="numeric" value={f.nid} onChange={(e) => setF({ ...f, nid: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>رقم الجوال</Label><Input dir="ltr" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
      <div className="space-y-1.5"><Label>صلة القرابة</Label>
        <select className={selectCls} value={f.rel} onChange={(e) => setF({ ...f, rel: e.target.value })}>
          <option value="father">الأب</option><option value="mother">الأم</option><option value="brother">الأخ</option><option value="other">أخرى</option>
        </select>
      </div>
      <div className="flex gap-2"><Button type="submit" disabled={busy}>حفظ ولي الأمر</Button><Button type="button" variant="ghost" onClick={onDone}>لاحقًا</Button></div>
    </form>
  );
}
