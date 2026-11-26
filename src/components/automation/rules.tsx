import { useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, Copy, Archive, ArchiveRestore, History, PencilRuler, Play, Power, PowerOff, BadgeCheck } from "lucide-react";
import { ask } from "@/components/confirm";
import { ErrorState, LoadingState, EmptyState } from "@/components/states";
import { selectCls } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { arabicError } from "@/lib/session";
import { fmt, rpc, useOrgSchools, useRegistry, RULE_ST, SCHED, AUDIT_ACT, type Any } from "./lib";
import { serverMsg } from "./designer/meta";

const PAGE = 15;
export function RulesTab({ orgId, openDesigner }: { orgId: string; openDesigner: (id?: string) => void }) {
  const qc = useQueryClient();
  const reg = useRegistry(orgId); const schools = useOrgSchools(orgId);
  const [q, setQ] = useState(""); const [st, setSt] = useState(""); const [sec, setSec] = useState(""); const [sch, setSch] = useState(""); const [sort, setSort] = useState("updated"); const [page, setPage] = useState(0);
  const [hist, setHist] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["au-rules", orgId, q, st, sec, sch, sort, page], placeholderData: keepPreviousData,
    queryFn: () => rpc<Any>("au_rules_list", { _org: orgId, _q: q.trim() || null, _status: st || null, _event: null, _section: sec || null, _school: sch || null, _sort: sort, _limit: PAGE, _offset: page * PAGE }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["au-rules"] });
  const act = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast.success(ok); refresh(); } catch (e) { toast.error(serverMsg(arabicError(e))); } };
  // the list returns the parent section key; show its Arabic name from the registry, never the key itself
  const parentLabel = (k: unknown) => (k ? String(((reg.data?.sections ?? []) as Any[]).find((s) => s.key === k)?.label ?? "") : "");
  const secs = ((reg.data?.sections ?? []) as Any[]).filter((s) => ((reg.data?.events ?? []) as Any[]).some((e) => e.section === s.key && ["wired", "tested"].includes(e.status)));
  const rows = (list.data?.rows ?? []) as Any[]; const total = list.data?.total ?? 0;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-3 shadow-sm">
        <label className="relative min-w-52 flex-1"><Search className="absolute end-auto start-2.5 top-2.5 size-4 text-muted-foreground" />
          <input aria-label="بحث في القواعد" placeholder="بحث بالاسم أو الوصف" className="h-9 w-full rounded-md border border-input bg-background ps-8 text-sm" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} /></label>
        <select aria-label="الحالة" className={selectCls("", true)} value={st} onChange={(e) => { setSt(e.target.value); setPage(0); }}><option value="">كل الحالات (دون المؤرشف)</option>{Object.entries(RULE_ST).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}</select>
        <select aria-label="القسم" className={selectCls("max-w-48", true)} value={sec} onChange={(e) => { setSec(e.target.value); setPage(0); }}><option value="">كل الأقسام</option>{secs.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
        <select aria-label="المدرسة" className={selectCls("max-w-48", true)} value={sch} onChange={(e) => { setSch(e.target.value); setPage(0); }}><option value="">كل المدارس</option>{(schools.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select aria-label="الترتيب" className={selectCls("", true)} value={sort} onChange={(e) => setSort(e.target.value)}><option value="updated">الأحدث تعديلًا</option><option value="name">الاسم</option><option value="priority">الأولوية</option><option value="last_run">آخر تنفيذ</option></select>
        <button onClick={() => openDesigner()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><Plus className="size-4" />قاعدة جديدة</button>
      </div>
      <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">{Object.entries(RULE_ST).map(([k, v]) => <span key={k}><span className={`me-1 rounded-full px-1.5 py-0.5 font-semibold ${v[1]}`}>{v[0]}</span>{v[2]}</span>)}</div>
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} /> : rows.length === 0 ? (
        <EmptyState title="لا توجد قواعد مطابقة" hint="أنشئ قاعدة من المصمم المرئي؛ تُحفظ مسودة معطلة حتى تعتمدها وتفعّلها." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr className="border-b">{["القاعدة", "القسم والحدث", "النطاق", "التشغيل", "الحالة", "الأولوية", "آخر / التالي", "ناجحة / فاشلة", "آخر تعديل", ""].map((h) => <th key={h} className="p-2 text-start font-semibold">{h}</th>)}</tr></thead>
            <tbody>{rows.map((x) => { const s = RULE_ST[x.status]; return (
              <tr key={x.id} className="border-b align-top last:border-0">
                <td className="p-2"><button className="text-start font-semibold hover:text-primary" onClick={() => openDesigner(x.id)}>{x.name}</button>{x.description && <div className="max-w-64 truncate text-xs text-muted-foreground">{x.description}</div>}<div className="text-[11px] text-muted-foreground">{x.created_by ?? ""}</div></td>
                <td className="p-2 text-xs"><div className="font-semibold">{parentLabel(x.parent) ? `${parentLabel(x.parent)} › ` : ""}{x.section_label}</div><div className="text-muted-foreground">{x.event_label}</div></td>
                <td className="p-2 text-xs">{x.schools?.length ? (x.schools as Any[]).map((s) => s.name).join("، ") : x.area === "central" ? "الإدارة المركزية" : "جميع المدارس"}</td>
                <td className="p-2 text-xs">{SCHED[x.schedule] ?? x.schedule}</td>
                <td className="p-2"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${s?.[1]}`} title={s?.[2]}>{s?.[0]}</span>{x.approved_version && <div className="mt-0.5 text-[11px] text-muted-foreground">إصدار معتمد {x.approved_version}</div>}</td>
                <td className="p-2">{x.priority}</td>
                <td className="p-2 text-xs">{fmt(x.last_run_at)}<div className="text-muted-foreground">{x.next_run_at ? fmt(x.next_run_at) : "—"}</div></td>
                <td className="p-2 text-xs">{x.ok} / <span className={x.failed ? "font-bold text-destructive" : ""}>{x.failed}</span></td>
                <td className="p-2 text-xs">{fmt(x.updated_at)}</td>
                <td className="p-2"><div className="flex flex-wrap gap-1">
                  <IB l="فتح في المصمم" onClick={() => openDesigner(x.id)}><PencilRuler className="size-4" /></IB>
                  <IB l="نسخ إلى مسودة جديدة" onClick={() => act(() => rpc("au_rule_clone", { _id: x.id }), "أُنشئت نسخة كمسودة")}><Copy className="size-4" /></IB>
                  <IB l="الإصدارات والسجل" onClick={() => setHist(x.id)}><History className="size-4" /></IB>
                  {(x.status === "draft" || x.status === "changed") && <IB l="اعتماد المسودة" onClick={async () => { if (await ask("اعتماد المسودة كإصدار جديد؟ لن تُفعَّل تلقائيًا.", { ok: "اعتماد" })) void act(() => rpc("au_rule_approve", { _id: x.id }), "اعتُمد إصدار جديد"); }}><BadgeCheck className="size-4" /></IB>}
                  {x.status === "paused" && <IB l="تفعيل" onClick={async () => { if (await ask("التفعيل يجعل القاعدة تعمل على بيانات المجموعة الفعلية. هل تريد التفعيل؟", { ok: "تفعيل", destructive: true })) void act(() => rpc("au_rule_set_active", { _id: x.id, _on: true }), "فُعّلت القاعدة"); }}><Power className="size-4" /></IB>}
                  {x.status === "active" && <IB l="إيقاف مؤقت" onClick={() => act(() => rpc("au_rule_set_active", { _id: x.id, _on: false }), "أوقفت القاعدة")}><PowerOff className="size-4" /></IB>}
                  {x.status === "active" && <IB l="تشغيل الآن" onClick={async () => { if (await ask("تشغيل الإصدار المعتمد الآن على السجلات المطابقة؟", { ok: "تشغيل" })) void act(() => rpc("au_rule_run_now", { _id: x.id }), "أُضيف التشغيل إلى الطابور"); }}><Play className="size-4" /></IB>}
                  {x.status === "archived"
                    ? <IB l="استرجاع من الأرشيف" onClick={() => act(() => rpc("au_rule_archive", { _id: x.id, _on: false }), "استُرجعت القاعدة (موقوفة)")}><ArchiveRestore className="size-4" /></IB>
                    : <IB l="أرشفة" onClick={async () => { if (await ask("أرشفة القاعدة توقفها وتخفيها، مع الإبقاء على سجلات تنفيذها كاملة.", { ok: "أرشفة" })) void act(() => rpc("au_rule_archive", { _id: x.id, _on: true }), "أُرشفت القاعدة"); }}><Archive className="size-4" /></IB>}
                </div></td>
              </tr>); })}</tbody>
          </table>
          <Pager page={page} total={total} size={PAGE} set={setPage} />
        </div>
      )}
      {hist && <Versions id={hist} onClose={() => setHist(null)} onRestored={() => { refresh(); }} />}
    </div>
  );
}

export const IB = ({ l, onClick, children }: { l: string; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" aria-label={l} title={l} onClick={onClick} className="grid size-8 place-items-center rounded-lg border hover:border-primary/50 hover:text-primary">{children}</button>
);
export function Pager({ page, total, size, set }: { page: number; total: number; size: number; set: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="flex items-center justify-between border-t p-2 text-xs text-muted-foreground">
      <span>{total} نتيجة · صفحة {page + 1} من {pages}</span>
      <div className="flex gap-1"><button disabled={page === 0} onClick={() => set(page - 1)} className="rounded border px-2 py-1 disabled:opacity-40">السابق</button><button disabled={page + 1 >= pages} onClick={() => set(page + 1)} className="rounded border px-2 py-1 disabled:opacity-40">التالي</button></div>
    </div>
  );
}

function Versions({ id, onClose, onRestored }: { id: string; onClose: () => void; onRestored: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["au-rule", id], queryFn: () => rpc<Any>("au_rule_get", { _id: id }) });
  const restore = async (v: number) => {
    if (!(await ask(`استبدال المسودة الحالية بمحتوى الإصدار ${v}؟ الإصدار المعتمد الحالي لا يتغير حتى تعتمد من جديد.`, { ok: "استرجاع" }))) return;
    try { await rpc("au_rule_restore_version", { _id: id, _version: v }); toast.success("استُرجع الإصدار إلى المسودة"); qc.invalidateQueries({ queryKey: ["au-rule", id] }); onRestored(); } catch (e) { toast.error(serverMsg(arabicError(e))); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-auto" dir="rtl">
        <DialogHeader><DialogTitle>{q.data?.name ?? "الإصدارات"}</DialogTitle></DialogHeader>
        {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : (
          <div className="space-y-4 text-sm">
            <p className="rounded-lg bg-muted/50 p-2 text-xs">المسودة تُعدَّل بحرية. الإصدار المعتمد نسخة ثابتة لا تتغير. الإصدار المفعّل هو المعتمد عندما تكون القاعدة مفعّلة.</p>
            <div><h4 className="mb-1 font-bold">الإصدارات</h4>
              {(q.data.versions as Any[]).length === 0 ? <p className="text-xs text-muted-foreground">لا توجد إصدارات معتمدة بعد.</p> : (
                <ul className="divide-y rounded-lg border">{(q.data.versions as Any[]).map((v) => (
                  <li key={v.version} className="flex items-center justify-between gap-2 p-2"><div><span className="font-semibold">الإصدار {v.version}</span>
                    {v.is_live ? <span className="ms-2 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">مفعّل</span> : v.is_approved ? <span className="ms-2 rounded-full bg-secondary px-2 py-0.5 text-[11px]">المعتمد الحالي</span> : null}
                    <div className="text-xs text-muted-foreground">اعتمده {v.approved_by ?? "—"} · {fmt(v.approved_at)} · {((v.definition?.steps ?? []) as Any[]).length} خطوة</div></div>
                    <button onClick={() => void restore(v.version)} className="rounded-lg border px-2 py-1 text-xs hover:border-primary/50">استرجاع إلى المسودة</button></li>))}</ul>)}
            </div>
            <div><h4 className="mb-1 font-bold">سجل القاعدة</h4>
              <ul className="max-h-60 divide-y overflow-auto rounded-lg border text-xs">{(q.data.audit as Any[]).map((a, i) => <li key={i} className="flex justify-between gap-2 p-2"><span>{AUDIT_ACT[a.action] ?? a.action}{a.details?.version ? ` — الإصدار ${a.details.version}` : ""}</span><span className="text-muted-foreground">{a.by ?? "—"} · {fmt(a.at)}</span></li>)}</ul>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
