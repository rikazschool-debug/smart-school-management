import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { ErrorState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { arabicError, useSession } from "@/lib/session";

export const PLANS: Record<string, { label: string; sections: string }> = {
  basic: { label: "الأساسية", sections: "الإدارة المدرسية" },
  advanced: { label: "المتقدمة", sections: "الإدارة المدرسية، الموارد البشرية، القبول" },
  enterprise: { label: "المؤسسية", sections: "كل الأقسام" },
};

function Editor({ o, onDone }: { o: Row; onDone: () => void }) {
  const [plan, setPlan] = useState(String(o["plan"] ?? "basic"));
  const [start, setStart] = useState(String(o["starts_on"] ?? new Date().toISOString().slice(0, 10)));
  const [end, setEnd] = useState(String(o["ends_on"] ?? ""));
  const [note, setNote] = useState(String(o["note"] ?? ""));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const { error } = await db.rpc("platform_sub_save" as never, { _org: o["org_id"], _plan: plan, _start: start, _end: end || null, _note: note } as never);
    setBusy(false);
    if (error) { toast.error(arabicError(error)); return; }
    toast.success("تم حفظ الاشتراك وتطبيق أقسام الباقة"); onDone();
  };
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-5">
      <select className={selectCls()} value={plan} onChange={(e) => setPlan(e.target.value)}>
        {Object.entries(PLANS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
      </select>
      <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} aria-label="البداية" />
      <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="النهاية" />
      <Input placeholder="ملاحظة" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button onClick={save} disabled={busy || !end}>حفظ</Button>
      <p className="text-xs text-muted-foreground sm:col-span-5">أقسام الباقة: {PLANS[plan]?.sections}</p>
    </div>
  );
}

/** Platform owner: per-group plan + dates; saving applies plan sections server-side (platform_sub_save). */
export function PlatformSubs() {
  const { active } = useSession();
  const qc = useQueryClient();
  const ok = active?.role === "platform_admin";
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["platform-subs"], enabled: ok, queryFn: async () => { const { data, error } = await db.rpc("platform_subs_list" as never); if (error) throw error; return (data ?? []) as Row[]; } });
  if (!ok) return <ForbiddenState />;
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  const rows = q.data ?? [];
  return (
    <div className="space-y-4">
      <PageHeader title="الاشتراكات والصلاحيات" desc="باقة كل مجموعة ومدة اشتراكها. عند انتهاء المدة تصبح المجموعة للقراءة فقط." />
      <div className="grid gap-3">
        {rows.map((o) => {
          const id = String(o["org_id"]);
          const st = !o["plan"] ? ["بلا اشتراك", "bg-muted text-muted-foreground"] : o["expired"] ? ["منتهٍ — قراءة فقط", "bg-destructive/10 text-destructive"] : ["نشط", "bg-primary/10 text-primary"];
          return (
            <div key={id} className="rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1">
                  <div className="font-bold">{String(o["org_name"])}</div>
                  <div className="text-sm text-muted-foreground">
                    {o["plan"] ? `${PLANS[String(o["plan"])]?.label} · ${String(o["starts_on"])} ← ${String(o["ends_on"])}` : "لم يُحدد اشتراك"} · {String(o["schools"])} فروع
                  </div>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st[1]}`}>{st[0]}</span>
                <Button variant="outline" size="sm" onClick={() => setOpen(open === id ? null : id)}>{open === id ? "إغلاق" : "تعديل"}</Button>
              </div>
              {open === id && <Editor o={o} onDone={() => { setOpen(null); qc.invalidateQueries({ queryKey: ["platform-subs"] }); }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
