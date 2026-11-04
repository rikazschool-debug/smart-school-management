import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, ShoppingCart, Trash2 } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/procurement/ui";
import { LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";

type Line = { description: string; qty: string };
type Info = {
  parts: { description: string; qty: number }[]; can_create: boolean; can_suggest: boolean; est_cost: number | null;
  need: { id: string; ref: string; status: string; estimate: number | null; spent: number | null } | null;
};
const NEED_STATUS: Record<string, string> = { draft: "مسودة لدى المدير", awaiting_assignment: "بانتظار إسناد مسؤول المشتريات", in_progress: "قيد الشراء", closed: "مكتمل", closed_partial: "مغلق جزئيًا", cancelled: "ملغى" };
const money = (n: number | null | undefined) => (n == null ? "—" : `${Number(n).toLocaleString("ar-SA")} ر.س`);

/** Purchase need linked to a maintenance request. Maintenance staff only suggest items; the principal creates the need; money flows through procurement. */
export function NeedPanel({ id }: { id: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["mt-need", id], queryFn: async () => { const { data, error } = await db.rpc("mt_need_info", { _id: id }); if (error) throw error; return data as Info; } });
  const [mode, setMode] = useState<null | "suggest" | "create">(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  if (q.isLoading) return <Panel title="احتياج الشراء"><LoadingState rows={1} /></Panel>;
  const d = q.data;
  if (!d || (!d.need && !d.can_create && !d.can_suggest && !d.parts.length)) return null;
  const start = (m: "suggest" | "create") => { setLines(d.parts.length ? d.parts.map((p) => ({ description: p.description, qty: String(p.qty) })) : [{ description: "", qty: "1" }]); setMode(m); };
  async function submit() {
    const clean = lines.filter((l) => l.description.trim()).map((l) => ({ description: l.description.trim(), qty: l.qty }));
    if (!clean.length) { toast.error("أضف بندًا واحدًا على الأقل"); return; }
    setBusy(true);
    const { error } = mode === "suggest" ? await db.rpc("mt_parts_suggest", { _id: id, _lines: clean }) : await db.rpc("mt_need_create", { _id: id, _d: { lines: clean }, _key: key });
    setBusy(false);
    if (error) { toast.error(arabicError(error)); return; }
    toast.success(mode === "suggest" ? "أُرسلت البنود المقترحة لمدير المدرسة" : "أُنشئ احتياج الشراء؛ اعتمده من شاشة المشتريات");
    setMode(null);
    void qc.invalidateQueries({ queryKey: ["mt-need", id] }); void qc.invalidateQueries({ queryKey: ["mt-get", id] });
  }
  return (
    <Panel title="احتياج الشراء">
      <div className="space-y-3 text-sm">
        {d.need ? (
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="font-semibold">{d.need.ref} — {NEED_STATUS[d.need.status] ?? d.need.status}</p>
            {d.need.estimate !== null && <p className="mt-1 text-muted-foreground">التقدير: {money(d.need.estimate)} · المصروف المعتمد: {money(d.need.spent)}</p>}
            {d.need.estimate !== null && <Link to="/app/procurement" search={{ tab: "needs" }} className="mt-2 inline-block text-primary">فتح في المشتريات</Link>}
          </div>
        ) : <p className="text-muted-foreground">لا يوجد احتياج شراء مرتبط. الصيانة لا تتعامل مع المال؛ الشراء يتم عبر المشتريات بعد اعتماد المدير.</p>}
        {d.parts.length > 0 && !mode && (
          <div><p className="mb-1 font-medium">البنود المقترحة من فريق الصيانة</p>
            <ul className="list-inside list-disc text-muted-foreground">{d.parts.map((p, i) => <li key={i}>{p.description} × {p.qty}</li>)}</ul></div>
        )}
        {mode ? (
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="flex gap-2">
                <Input aria-label={`وصف البند ${i + 1}`} placeholder="الصنف أو القطعة" value={l.description} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                <Input aria-label={`كمية البند ${i + 1}`} className="w-20" inputMode="decimal" value={l.qty} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} />
                <Button variant="ghost" size="icon" aria-label="حذف البند" onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setLines([...lines, { description: "", qty: "1" }])}><Plus className="size-4" />بند</Button>
              <Button size="sm" disabled={busy} onClick={() => void submit()}>{mode === "suggest" ? "إرسال للمدير" : "إنشاء احتياج الشراء"}</Button>
              <Button variant="ghost" size="sm" onClick={() => setMode(null)}>إلغاء</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {d.can_suggest && !d.need && <Button variant="outline" size="sm" onClick={() => start("suggest")}>اقتراح بنود شراء</Button>}
            {d.can_create && <Button size="sm" onClick={() => start("create")}><ShoppingCart className="size-4" />تحويل إلى احتياج شراء</Button>}
          </div>
        )}
      </div>
    </Panel>
  );
}
