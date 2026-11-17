import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, BookMarked, BriefcaseBusiness, FilePlus2, Inbox, Printer } from "lucide-react";
import { Portfolio } from "./pf";
import { db, type Row } from "@/components/crud-page";
import { Uploader } from "@/components/homework/files";
import { MaterialFileViewer } from "@/components/comm/material-file-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { askText } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { printReport } from "@/lib/export";
import { filterRes, INTERNAL_NOTE, OFFICIAL_CLAIM, RES_KIND, RES_LOG, RES_STATUS, resMissing, splitList, type Resource, type ResourceDetail, type ResView } from "./res-model";
import { riyadhText, type SvMe, type SvSearch } from "./model";
import { sv4 as call } from "./pd-api";
import { useLo } from "./lo";

type Go = (s: SvSearch, replace?: boolean) => void;
/** «الموارد والتقارير» — supervisory bulletins and resources (draft → review → publish, versioned). Every rule is enforced by sv5_res_*. */
export function Resources({ org, me, sp, go }: { org: string; me: SvMe; sp: SvSearch; go: Go }) {
  const view: ResView = sp.rs ?? "library";
  const list = useLo<Resource[]>(["res", org], "sv5_res_list", { _org: org });
  const scopes = useLo<{ id: string | null; name: string }[]>(["res-scopes", org], "sv5_res_scopes", { _org: org });
  const canWrite = (scopes.data ?? []).length > 0; const lead = me.owner || me.schools.some((s) => s.principal);
  const open = (id?: string) => go({ tab: "resources", rs: view, ...(id ? { id } : {}) }, false);
  return <div className="space-y-4">
    <nav aria-label="الموارد والتقارير" className="flex flex-wrap gap-2 border-b pb-3">
      <Button variant={view === "library" ? "default" : "ghost"} onClick={() => go({ tab: "resources", rs: "library" })}><BookMarked />النشرات والموارد المنشورة</Button>
      {(canWrite || lead) && <Button variant={view === "manage" ? "default" : "ghost"} onClick={() => go({ tab: "resources", rs: "manage" })}><Inbox />المسودات والمراجعة</Button>}
      <Button variant={view === "portfolio" ? "default" : "ghost"} onClick={() => go({ tab: "resources", rs: "portfolio" })}><BriefcaseBusiness />الملف المهني</Button>
    </nav>
    {view === "portfolio" ? <Portfolio org={org} me={me} go={go} /> : <>
    <p className="text-sm text-muted-foreground">{INTERNAL_NOTE} يُكتب المصدر وحقوق الاستخدام لكل مورد، ولا تُنشر الشواهد أو بيانات الطلاب تلقائيًا. تظهر الموارد المنشورة أيضًا في «المكتبة الرقمية».</p>
    {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} /> :
      sp.id ? <ResourceDetailView id={sp.id} onBack={() => open()} onOpen={(id) => open(id)} /> :
      view === "library" ? <Library list={(list.data ?? []).filter((r) => r.status === "published")} open={open} /> :
      <Manage org={org} list={(list.data ?? []).filter((r) => r.status === "draft" || r.status === "review")} scopes={scopes.data ?? []} open={open} />}
    </>}
  </div>;
}

function Library({ list, open }: { list: Resource[]; open: (id: string) => void }) {
  const [f, setF] = useState({ kind: "", domain: "", subject: "", stage: "", q: "" });
  const uniq = (xs: string[]) => [...new Set(xs)].filter(Boolean).sort((a, b) => a.localeCompare(b, "ar"));
  const rows = filterRes(list, f);
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      <Input className="w-64" aria-label="بحث في الموارد" placeholder="كلمات مفتاحية" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
      <select className={selectCls()} aria-label="نوع المورد" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="">كل الأنواع</option>{Object.entries(RES_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <select className={selectCls()} aria-label="المجال" value={f.domain} onChange={(e) => setF({ ...f, domain: e.target.value })}><option value="">كل المجالات</option>{uniq(list.map((r) => r.domain)).map((x) => <option key={x}>{x}</option>)}</select>
      <select className={selectCls()} aria-label="المادة" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })}><option value="">كل المواد</option>{uniq(list.flatMap((r) => r.subjects)).map((x) => <option key={x}>{x}</option>)}</select>
      <select className={selectCls()} aria-label="المرحلة" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}><option value="">كل المراحل</option>{uniq(list.flatMap((r) => r.stages)).map((x) => <option key={x}>{x}</option>)}</select>
    </div>
    {!rows.length ? <EmptyState title={list.length ? "لا موارد تطابق البحث" : "لا موارد منشورة بعد"} /> : <ResCards rows={rows} open={open} />}
  </div>;
}

function ResCards({ rows, open }: { rows: Resource[]; open: (id: string) => void }) {
  return <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((r) => <li key={r.id} className="flex flex-col gap-1 rounded-lg border bg-card p-3">
    <div className="flex flex-wrap justify-between gap-2"><b>{r.title}</b><span className="rounded bg-muted px-2 text-xs leading-6">{RES_KIND[r.kind]}</span></div>
    <p className="line-clamp-2 text-sm text-muted-foreground">{r.summary || "—"}</p>
    <p className="text-xs text-muted-foreground">{r.domain || "بلا مجال"}{r.subjects.length ? ` · ${r.subjects.join("، ")}` : ""}{r.stages.length ? ` · ${r.stages.join("، ")}` : ""} · {r.scope}</p>
    <p className="text-xs">{RES_STATUS[r.status]} · إصدار {r.version}{r.files ? ` · ${r.files} ملف` : ""} · نموذج داخلي</p>
    {r.status === "draft" && r.review_note && <p className="text-xs text-destructive">أُعيد: {r.review_note}</p>}
    <Button size="sm" variant="outline" className="mt-auto self-start" onClick={() => open(r.id)}>فتح</Button></li>)}</ul>;
}

function Manage({ org, list, scopes, open }: { org: string; list: Resource[]; scopes: { id: string | null; name: string }[]; open: (id: string) => void }) {
  const [creating, setCreating] = useState(false);
  const review = list.filter((r) => r.can_publish); const mine = list.filter((r) => !r.can_publish);
  return <div className="space-y-4">
    {!!scopes.length && !creating && <Button onClick={() => setCreating(true)}><FilePlus2 />مورد جديد</Button>}
    {creating && <ResForm org={org} scopes={scopes} onDone={(id) => { setCreating(false); if (id) open(id); }} />}
    <section aria-label="بانتظار مراجعتك"><h4 className="mb-2 font-semibold">بانتظار مراجعتك ({review.length})</h4>{review.length ? <ResCards rows={review} open={open} /> : <p className="text-sm text-muted-foreground">لا شيء بانتظار مراجعتك.</p>}</section>
    <section aria-label="مسوداتي والمرسلة"><h4 className="mb-2 font-semibold">المسودات والمرسلة ({mine.length})</h4>{mine.length ? <ResCards rows={mine} open={open} /> : <p className="text-sm text-muted-foreground">لا مسودات.</p>}</section>
  </div>;
}

/** Field label at module scope so inputs keep focus while typing. */
function F({ t, children }: { t: string; children: React.ReactNode }) { return <label className="grid gap-1 text-sm"><span className="font-medium">{t}</span>{children}</label>; }

function ResForm({ org, scopes, r, onDone }: { org: string; scopes?: { id: string | null; name: string }[]; r?: ResourceDetail; onDone: (id?: string) => void }) {
  const qc = useQueryClient(); const [busy, setBusy] = useState(false);
  const [p, setP] = useState(() => ({ school_id: r ? r.school_id ?? "" : (scopes?.[0]?.id ?? ""), kind: r?.kind ?? "bulletin", title: r?.title ?? "", summary: r?.summary ?? "", body: r?.body ?? "", domain: r?.domain ?? "",
    subjects: r?.subjects.join("، ") ?? "", stages: r?.stages.join("، ") ?? "", keywords: r?.keywords.join("، ") ?? "", source: r?.source ?? "", usage_rights: r?.usage_rights ?? "", no_personal_data: r?.no_personal_data ?? false }));
  const set = (k: keyof typeof p, v: string | boolean) => setP((x) => ({ ...x, [k]: v }));
  const claim = OFFICIAL_CLAIM.test(`${p.title} ${p.summary}`);
  const miss = resMissing({ ...p, files: r?.file_list.length ?? 0 });
  async function save() { setBusy(true); try { const id = await call("sv5_res_save", { _id: r?.id ?? null, _rev: r?.rev ?? null, _p: { ...p, org_id: org, school_id: p.school_id || null, subjects: splitList(p.subjects), stages: splitList(p.stages), keywords: splitList(p.keywords) } }, "حُفظت المسودة") as string; await qc.invalidateQueries({ queryKey: ["sv5"] }); onDone(id); } catch { /* shown; text kept */ } finally { setBusy(false); } }
  return <section className="space-y-3 rounded-lg border border-primary/40 p-3" aria-label="بيانات المورد">
    <h4 className="font-semibold">{r ? `تعديل المسودة — إصدار ${r.version}` : "مورد جديد"}</h4>
    <div className="grid gap-3 md:grid-cols-3">
      {!r && scopes && <F t="النطاق"><select aria-label="النطاق" className={selectCls()} value={p.school_id} onChange={(e) => set("school_id", e.target.value)}>{scopes.map((s) => <option key={s.id ?? "org"} value={s.id ?? ""}>{s.name}</option>)}</select></F>}
      <F t="نوع المورد"><select aria-label="نوع المورد" className={selectCls()} value={p.kind} onChange={(e) => set("kind", e.target.value)}>{Object.entries(RES_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></F>
      <F t="العنوان"><Input aria-label="العنوان" value={p.title} onChange={(e) => set("title", e.target.value)} /></F>
      <F t="المجال"><Input aria-label="المجال" placeholder="مثال: التدريس، التقويم" value={p.domain} onChange={(e) => set("domain", e.target.value)} /></F>
      <F t="المواد (يفصلها فاصلة)"><Input aria-label="المواد" value={p.subjects} onChange={(e) => set("subjects", e.target.value)} /></F>
      <F t="المراحل (يفصلها فاصلة)"><Input aria-label="المراحل" value={p.stages} onChange={(e) => set("stages", e.target.value)} /></F>
      <F t="كلمات مفتاحية"><Input aria-label="كلمات مفتاحية" value={p.keywords} onChange={(e) => set("keywords", e.target.value)} /></F>
      <F t="المصدر"><Input aria-label="المصدر" placeholder="إعداد داخلي، أو مرجع منشور مع رابطه" value={p.source} onChange={(e) => set("source", e.target.value)} /></F>
      <F t="حقوق الاستخدام"><Input aria-label="حقوق الاستخدام" placeholder="مثال: للاستخدام الداخلي في المجموعة" value={p.usage_rights} onChange={(e) => set("usage_rights", e.target.value)} /></F>
    </div>
    <F t="الملخص"><Textarea aria-label="الملخص" rows={2} value={p.summary} onChange={(e) => set("summary", e.target.value)} /></F>
    <F t="المحتوى (نص)"><Textarea aria-label="المحتوى" rows={6} value={p.body} onChange={(e) => set("body", e.target.value)} /></F>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={p.no_personal_data} onChange={(e) => set("no_personal_data", e.target.checked)} />أؤكد أن المورد ومرفقاته لا تحتوي بيانات طلاب أو شواهد أو أسماء أشخاص دون إذن.</label>
    {claim && <p className="text-sm text-destructive">لا يوصف المحتوى الداخلي بأنه معتمد رسميًا؛ سيرفض الحفظ.</p>}
    {!!miss.length && <p className="text-sm text-muted-foreground">يمكن حفظ المسودة؛ قبل الإرسال أكمل: {miss.join("، ")}</p>}
    <div className="flex gap-2"><Button disabled={busy || p.title.trim().length < 3 || claim} onClick={save}>حفظ المسودة</Button><Button variant="ghost" onClick={() => onDone()}>إلغاء</Button></div>
  </section>;
}

function ResourceDetailView({ id, onBack, onOpen }: { id: string; onBack: () => void; onOpen: (id: string) => void }) {
  const q = useLo<ResourceDetail>(["res-one", id], "sv5_res_get", { _id: id }); const qc = useQueryClient(); const [edit, setEdit] = useState(false); const [busy, setBusy] = useState(false);
  if (q.isLoading) return <LoadingState />; if (q.error || !q.data) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const r = q.data;
  async function run(fn: string, args: Record<string, unknown>, msg: string) { setBusy(true); try { const out = await call(fn, args, msg); await qc.invalidateQueries({ queryKey: ["sv5"] }); return out; } catch { await q.refetch(); return null; } finally { setBusy(false); } }
  async function withNote(fn: string, args: Record<string, unknown>, label: string, msg: string) { const n = await askText(label, { required: true, long: true }); if (n !== null) await run(fn, { ...args, _note: n }, msg); }
  const print = () => printReport({ title: `${RES_KIND[r.kind]}: ${r.title}`, school: r.scope, filters: [], count: false, details: [`الإصدار ${r.version} — ${RES_STATUS[r.status]}${r.published_at ? ` — نُشر ${riyadhText(r.published_at)}` : ""}`, `المجال: ${r.domain} · المواد: ${r.subjects.join("، ") || "—"} · المراحل: ${r.stages.join("، ") || "—"}`, `المصدر: ${r.source} · حقوق الاستخدام: ${r.usage_rights}`], note: INTERNAL_NOTE },
    ["البند", "النص"], [["الملخص", r.summary], ...r.body.split(/\n{2,}/).filter(Boolean).map((t, i) => [i ? "" : "المحتوى", t] as string[]), ...r.file_list.map((f) => ["مرفق", f.name] as string[])]);
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2"><Button variant="ghost" onClick={onBack}><ArrowRight />رجوع</Button><Button className="ms-auto" variant="outline" size="sm" onClick={print}><Printer />طباعة</Button></div>
    <header className="rounded-lg border p-3">
      <div className="flex flex-wrap justify-between gap-2"><h3 className="text-lg font-bold">{r.title}</h3><span className="rounded bg-muted px-2 text-sm leading-7">{RES_KIND[r.kind]} · {RES_STATUS[r.status]} · إصدار {r.version}</span></div>
      <p className="mt-1 rounded bg-muted px-2 py-1 text-xs">{INTERNAL_NOTE}</p>
      <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">{([["النطاق", r.scope], ["المجال", r.domain || "—"], ["المواد", r.subjects.join("، ") || "—"], ["المراحل", r.stages.join("، ") || "—"], ["كلمات مفتاحية", r.keywords.join("، ") || "—"], ["المصدر", r.source || "—"], ["حقوق الاستخدام", r.usage_rights || "—"], ["كتبه", r.creator], ["النشر", r.publisher ? `${r.publisher} — ${riyadhText(r.published_at)}` : "لم يُنشر"]] as const).map(([k, v]) => <div key={k}><dt className="inline font-medium">{k}: </dt><dd className="inline">{v}</dd></div>)}</dl>
      {r.review_note && <p className="mt-1 text-sm">ملاحظة المراجعة: {r.review_note}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {r.can_edit && !edit && <Button size="sm" variant="outline" onClick={() => setEdit(true)}>تعديل</Button>}
        {r.can_edit && <Button size="sm" disabled={busy || !!r.missing.length} title={r.missing.length ? `أكمل: ${r.missing.join("، ")}` : undefined} onClick={() => run("sv5_res_submit", { _id: r.id, _rev: r.rev }, "أُرسل للمراجعة")}>إرسال للمراجعة</Button>}
        {r.can_publish && <><Button size="sm" disabled={busy} onClick={() => run("sv5_res_review", { _id: r.id, _rev: r.rev, _decision: "publish", _note: "" }, "نُشر المورد")}>نشر</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => withNote("sv5_res_review", { _id: r.id, _rev: r.rev, _decision: "return" }, "سبب الإعادة", "أُعيد للكاتب")}>إعادة للكاتب</Button></>}
        {r.can_version && <Button size="sm" variant="outline" disabled={busy} onClick={async () => { const nid = await run("sv5_res_new_version", { _id: r.id }, "أُنشئت مسودة إصدار جديد"); if (typeof nid === "string") onOpen(nid); }}>إصدار جديد</Button>}
        {r.can_retire && <Button size="sm" variant="ghost" disabled={busy} onClick={() => withNote("sv5_res_retire", { _id: r.id, _rev: r.rev }, "سبب الإيقاف", "أُوقف المورد")}>إيقاف النشر</Button>}
      </div>
      {r.can_edit && !!r.missing.length && <p className="mt-1 text-xs text-muted-foreground">قبل الإرسال أكمل: {r.missing.join("، ")}</p>}
    </header>
    {edit && <ResForm org={r.org_id} r={r} onDone={() => setEdit(false)} />}
    <section className="rounded-lg border p-3" aria-label="المحتوى"><h4 className="mb-1 font-semibold">الملخص</h4><p className="text-sm">{r.summary || "—"}</p>
      {r.body && <><h4 className="mb-1 mt-3 font-semibold">المحتوى</h4><p className="whitespace-pre-wrap text-sm leading-7">{r.body}</p></>}</section>
    <section className="space-y-2 rounded-lg border p-3" aria-label="المرفقات"><h4 className="font-semibold">المرفقات ({r.file_list.length})</h4>
      {r.file_list.map((f) => <MaterialFileViewer key={f.id} file={f as unknown as Row} onRemove={r.can_edit ? () => void run("sv5_res_remove_file", { _res: r.id, _file: f.id }, "حُذف الملف من هذا الإصدار") : undefined} />)}
      {r.can_edit && <Uploader label="إرفاق نص أو صورة أو PDF" create={async (f) => { const { data, error } = await db.rpc("sv5_res_add_file", { _res: r.id, _name: f.name, _mime: f.type, _size: f.size }); if (error) throw error; return data as { id: string; storage_path: string }; }}
        release={async (fid) => { const { error } = await db.rpc("sv5_res_remove_file", { _res: r.id, _file: fid }); if (error) throw error; }} onDone={() => { void qc.invalidateQueries({ queryKey: ["sv5"] }); }} />}
      {r.version > 1 && r.can_edit && <p className="text-xs text-muted-foreground">حذف ملف من هذه المسودة لا يحذفه من الإصدار المنشور السابق.</p>}</section>
    {r.versions.length > 1 && <section className="rounded-lg border p-3 text-sm" aria-label="الإصدارات"><h4 className="mb-1 font-semibold">الإصدارات</h4>
      <ul className="flex flex-wrap gap-2">{r.versions.map((v) => <li key={v.id}><Button size="sm" variant={v.id === r.id ? "default" : "outline"} onClick={() => onOpen(v.id)}>إصدار {v.version} — {RES_STATUS[v.status]}</Button></li>)}</ul></section>}
    <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-semibold">سجل المورد ({r.log.length})</summary>
      <ul className="mt-2 space-y-1">{r.log.map((g, i) => <li key={i}>{riyadhText(g.at)} · {g.by}: {RES_LOG[g.action] ?? g.action}{g.note ? ` — ${g.note}` : ""}</li>)}</ul></details>
  </div>;
}

/** Read-only shelf of published supervisory resources inside the existing digital library. */
export function SupervisionShelf({ org }: { org: string }) {
  const list = useLo<Resource[]>(["res", org], "sv5_res_list", { _org: org }); const nav = useNavigate();
  if (list.isLoading) return <LoadingState />; if (list.error) return <ErrorState message={arabicError(list.error)} />;
  const rows = (list.data ?? []).filter((r) => r.status === "published");
  return <div className="space-y-3"><p className="text-sm text-muted-foreground">{INTERNAL_NOTE} تُدار هذه الموارد ومراجعتها من «الإشراف التربوي ← الموارد والتقارير».</p>
    {!rows.length ? <EmptyState title="لا موارد إشرافية منشورة بعد" /> : <ResCards rows={rows} open={(id) => void nav({ to: "/app/supervision", search: { tab: "resources", rs: "library", id } })} />}</div>;
}
