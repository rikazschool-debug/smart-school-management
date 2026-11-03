import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, KeyRound } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { ask } from "@/components/confirm";
import { ACCOUNT_STATE } from "@/components/guardian-quick-add";
import { issueStudentPassword, provisionAccounts } from "@/lib/accounts.functions";
import { arabicError } from "@/lib/session";

/** Login state of a student/teacher row (from account_status — never a password) with the allowed actions. */
export function AccountPanel({ kind, id, canWrite }: { kind: "student" | "teacher"; id: string; canWrite: boolean }) {
  const qc = useQueryClient();
  const provision = useServerFn(provisionAccounts);
  const issue = useServerFn(issueStudentPassword);
  const [busy, setBusy] = useState(false);
  const [creds, setCreds] = useState<{ login: string; password: string } | null>(null);
  const st = useQuery({
    queryKey: ["account-status", kind, id],
    queryFn: async () => {
      const { data, error } = await db.rpc("account_status" as never, { _kind: kind, _ids: [id] } as never);
      if (error) throw error;
      return ((data as unknown as { state: string }[])[0]?.state ?? "none") as string;
    },
  });
  const state = st.data ?? "none";
  return (
    <div className="space-y-2 rounded-lg border p-3 text-sm">
      <p><span className="font-semibold">حساب الدخول: </span>{st.isLoading ? "…" : ACCOUNT_STATE[state] ?? state}</p>
      <p className="text-xs text-muted-foreground">{kind === "student" ? "يدخل الطالب برقم هويته وكلمة مرور أولية، ويُلزم بتغييرها قبل الوصول لأي بيانات." : "يدخل المعلم بجواله ورمز يصله على واتساب."}</p>
      {canWrite && state === "none" && (
        <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
          setBusy(true);
          try { const [r] = await provision({ data: { kind, ids: [id] } }); if (r?.state === "error") toast.error(r.msg ?? "تعذّر"); else toast.success(ACCOUNT_STATE[r!.state]); qc.invalidateQueries({ queryKey: ["account-status"] }); }
          catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
        }}>إنشاء حساب الدخول</Button>
      )}
      {canWrite && kind === "student" && !creds && (
        <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
          if (state === "linked" && !(await ask("إصدار كلمة مرور أولية جديدة يوقف دخول الطالب الحالي حتى يغيّرها. متابعة؟", { ok: "إصدار" }))) return;
          setBusy(true);
          try { setCreds(await issue({ data: { studentId: id } })); qc.invalidateQueries({ queryKey: ["account-status"] }); }
          catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
        }}><KeyRound className="size-4" /> {state === "linked" ? "استعادة الحساب (كلمة مرور أولية جديدة)" : "إصدار كلمة مرور أولية"}</Button>
      )}
      {creds && (
        <div className="space-y-1 rounded-lg border border-primary/40 bg-secondary p-3">
          <p className="font-semibold">سلّمها للطالب الآن — لن تظهر مرة أخرى ولا تُحفظ:</p>
          <p>اسم الدخول (رقم الهوية): <span dir="ltr" className="font-mono">{creds.login}</span></p>
          <p>كلمة المرور الأولية: <span dir="ltr" className="font-mono">{creds.password}</span></p>
          <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard.writeText(`ركاز — اسم الدخول: ${creds.login}\nكلمة المرور الأولية: ${creds.password}`); toast.success("نُسخت"); }}><Copy className="size-4" /> نسخ</Button>
        </div>
      )}
    </div>
  );
}
