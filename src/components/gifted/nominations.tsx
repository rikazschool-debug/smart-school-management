import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Eye, FilePlus2, MessageSquareWarning, Plus, Search, XCircle } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { askText } from "@/components/confirm";
import { GT_DOMAINS, GT_SOURCES, GT_STATUS, GT_TONE, nomActions, type GtMe, type Nomination } from "./model";
import { NominationWizard, gtToday } from "./nomination-wizard";

export const nomQuery = (school: string) => ({ queryKey: ["gt-noms", school], queryFn: async () => { const r = await db.rpc("gt_nom_list", { _school: school }); if (r.error) throw r.error; return r.data as Nomination[]; } });
const ACT: Record<string, { label: string; icon: typeof Eye; prompt?: string }> = {
  review: { label: "بدء المراجعة", icon: Eye },
  needs_info: { label: "طلب استكمال", icon: MessageSquareWarning, prompt: "ما المطلوب استكماله من المرشِّح؟" },
  approve: { label: "إقرار للرعاية المدرسية", icon: CheckCircle2, prompt: "سبب الإقرار ومستنده (يُحفظ مع اسمك وتاريخ القرار)" },
  reject: { label: "عدم الإقرار", icon: XCircle, prompt: "سبب عدم الإقرار (يظهر للمرشِّح)" },
};

export function Nominations({ school, me, openId, onSel }: { school: string; me: GtMe; openId?: string | undefined; onSel: (id: string | null) => void }) {
  const qc = useQueryClient(); const list = useQuery({ ...nomQuery(school) });
  const [edit, setEdit] = useState<Nomination | "new" | null>(null); const [q, setQ] = useState(""); const [st, setSt] = useState(""); const [busy, setBusy] = useState(false);
  const [ev, setEv] = useState({ note: "", date: gtToday(), domain: "" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["gt-noms", school] });
  if (edit) return <NominationWizard school={school} row={edit === "new" ? undefined : edit} close={(id) => { setEdit(null); refresh(); if (id) onSel(id); }} />;
  if (list.isLoading) return <LoadingState />; if (list.error) return <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} />;
  const rows = (list.data ?? []).filter((r) => (!st || r.status === st) && (!q || r.student.includes(q) || (r.csmart ?? "").includes(q)));
  const open = openId ? (list.data ?? []).find((r) => r.id === openId) : undefined;
  async function act(r: Nomination, a: string) {
    const d = ACT[a]!; let reason: string | null = null;
    if (d.prompt) { reason = await askText(d.prompt); if (!reason?.trim()) return; }
    setBusy(true); try { const x = await db.rpc("gt_nom_act", { _id: r.id, _rev: r.rev, _action: a, _reason: reason }); if (x.error) throw x.error; toast.success("حُفظ القرار"); refresh(); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  async function addEvidence(r: Nomination) {
    setBusy(true); try { const x = await db.rpc("gt_nom_evidence", { _id: r.id, _rev: r.rev, _item: ev }); if (x.error) throw x.error; toast.success("أُضيف الشاهد"); setEv({ note: "", date: gtToday(), domain: "" }); refresh(); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  return <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
    <section className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1"><Search className="absolute start-3 top-3 size-4 text-muted-foreground" /><Input aria-label="بحث" className="ps-9" placeholder="اسم الطالب أو C‑Smart" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select aria-label="الحالة" className={selectCls()} value={st} onChange={(e) => setSt(e.target.value)}><option value="">كل الحالات</option>{Object.entries(GT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        {me.nominate && <Button onClick={() => setEdit("new")}><Plus className="size-4" />ترشيح طالب</Button>}
      </div>
      {!rows.length ? <EmptyState title={list.data?.length ? "لا نتائج بهذا البحث" : "لا توجد ترشيحات بعد"} hint={me.nominate ? "ابدأ بـ«ترشيح طالب»: اختر الطالب، ثم المجال، ثم اكتب ما لاحظته وتاريخه." : undefined} /> :
        <ul className="space-y-2">{rows.map((r) => <li key={r.id}><button type="button" onClick={() => onSel(r.id)} className={`w-full rounded-xl border bg-card p-3 text-start transition hover:shadow-sm ${open?.id === r.id ? "border-primary ring-1 ring-primary" : ""}`}>
          <div className="flex items-center justify-between gap-2"><b className="truncate">{r.student}</b><span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${GT_TONE[r.status]}`}>{GT_STATUS[r.status]}</span></div>
          <p className="mt-1 text-xs text-muted-foreground">{[r.stage, r.grade, r.section].filter(Boolean).join(" · ")} · TAL-{String(r.no).padStart(4, "0")}</p>
          <p className="mt-1 flex flex-wrap gap-1">{r.domains.map((d) => <span key={d} className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">{GT_DOMAINS[d] ?? d}</span>)}</p>
        </button></li>)}</ul>}
    </section>
    <section>{!open ? <div className="grid h-full min-h-48 place-items-center rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">{openId ? "هذا الترشيح غير متاح لحسابك." : "اختر ترشيحًا لعرض تفاصيله."}</div> :
      <div className="space-y-4 rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-lg font-bold">{open.student}</h3><p className="text-xs text-muted-foreground">{[open.stage, open.grade, open.section].filter(Boolean).join(" · ")}{open.csmart ? ` · C‑Smart ${open.csmart}` : ""} · {open.year ?? ""}</p></div><span className={`rounded-full px-2.5 py-1 text-xs ${GT_TONE[open.status]}`}>{GT_STATUS[open.status]}</span></div>
        <dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">المرشِّح</dt><dd>{open.nominator ?? "—"}</dd></div><div><dt className="text-muted-foreground">المصدر</dt><dd>{GT_SOURCES[open.source] ?? open.source}</dd></div>
          {open.decider && <div className="sm:col-span-2"><dt className="text-muted-foreground">القرار</dt><dd>{open.decider} — {new Date(open.decided_at!).toLocaleDateString("ar-SA")}{open.decision_reason ? `: ${open.decision_reason}` : ""}</dd></div>}
          {open.request_note && open.status === "needs_info" && <div className="sm:col-span-2 rounded-lg bg-accent/20 p-2"><dt className="font-semibold">المطلوب استكماله</dt><dd>{open.request_note}</dd></div>}</dl>
        <div><h4 className="mb-2 text-sm font-semibold">المؤشرات والشواهد ({open.indicator_count})</h4>{open.indicators.length ? <ul className="space-y-2">{open.indicators.map((x, i) => <li key={i} className="rounded-lg bg-muted/40 p-2 text-sm"><span className="text-xs text-muted-foreground">{x.date} · {GT_DOMAINS[x.domain] ?? "عام"}{x.added ? " · شاهد إضافي" : ""}</span><p>{x.note}</p></li>)}</ul> : <p className="text-sm text-muted-foreground">التفاصيل متاحة للمنسق والمرشِّح فقط.</p>}</div>
        <p className="rounded-lg border bg-muted/30 p-2 text-xs text-muted-foreground">الإقرار هنا للرعاية المدرسية فقط، ولا يعني تأهيلًا رسميًا لبرنامج خارجي أو نتيجة مقياس.</p>
        <div className="flex flex-wrap gap-2">
          {open.mine && ["draft", "needs_info"].includes(open.status) && <Button onClick={() => setEdit(open)}>استكمال وإرسال</Button>}
          {me.coord && nomActions(open.status).map((a) => { const d = ACT[a]!; return <Button key={a} variant={a === "approve" ? "default" : "outline"} disabled={busy} onClick={() => act(open, a)}><d.icon className="size-4" />{d.label}</Button>; })}
        </div>
        {(me.coord || open.mine) && open.status !== "rejected" && open.status !== "draft" && <div className="space-y-2 rounded-xl border p-3"><h4 className="flex items-center gap-1 text-sm font-semibold"><FilePlus2 className="size-4" />إرفاق شاهد إضافي</h4>
          <div className="grid gap-2 sm:grid-cols-2"><select aria-label="مجال الشاهد" className={selectCls("w-full")} value={ev.domain} onChange={(e) => setEv({ ...ev, domain: e.target.value })}><option value="">— المجال —</option>{open.domains.map((d) => <option key={d} value={d}>{GT_DOMAINS[d]}</option>)}</select><Input aria-label="تاريخ الشاهد" type="date" max={gtToday()} value={ev.date} onChange={(e) => setEv({ ...ev, date: e.target.value })} /></div>
          <Textarea aria-label="وصف الشاهد" rows={2} value={ev.note} onChange={(e) => setEv({ ...ev, note: e.target.value })} placeholder="وصف الشاهد الجديد (10 أحرف على الأقل)" />
          <Button size="sm" variant="outline" disabled={busy || ev.note.trim().length < 10} onClick={() => addEvidence(open)}>إضافة الشاهد</Button></div>}
      </div>}</section>
  </div>;
}
