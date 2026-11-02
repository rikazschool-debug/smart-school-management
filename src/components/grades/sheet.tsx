// One gradebook (course × period): teacher entry, review, approval, publishing, exceptions, homework link, import.
// Every action is a gb_* RPC; the server re-checks role, assignment, status and entry window. The UI only explains.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { AlertTriangle, ArrowRight, FileDown, FileUp, RefreshCw, Search } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState, Section } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { ask, askText } from "@/components/confirm";
import { ExportButtons } from "@/components/list-tools";
import { exportXlsx } from "@/lib/export";
import { arabicError } from "@/lib/session";
import { ENTRY_STATUS, EVENT_LABEL, GB_STATUS, GB_TONE, checkGradeImport, fileKey, previewTotal, type ImportError, type ImportRow } from "./common";

type Sheet = { gradebook: Row; period: Row; plan: Row; items: Row[]; students: Row[]; entries: Row[]; events: Row[]; homework: Row[]; exceptions: Row[]; drift: Row[] };
type Cell = { status: string; score: string };
type RowErr = { code: string; message: string; current?: { status: string; score: number | null; at: string } | null };

const sel = selectCls("w-full");
const fmt = (d: string | null | undefined) => (d ? new Date(d).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }) : "—");
const Badge = ({ s }: { s: string }) => <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${GB_TONE[s] ?? "bg-muted"}`} data-testid="gb-status">{GB_STATUS[s] ?? s}</span>;
const show = (c: { status: string; score?: unknown } | undefined) => (!c || c.status === "missing" ? ENTRY_STATUS["missing"] : c.status === "score" ? String(c.score) : ENTRY_STATUS[c.status]);
const k = (s: string, i: string) => `${s}|${i}`;

export function GradebookView({ id, school, onBack }: { id: string; school: string; onBack: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["gb-sheet", id], queryFn: async () => { const { data, error } = await db.rpc("gb_sheet", { _gb: id }); if (error) throw error; return data as Sheet; } });
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [bases, setBases] = useState<Record<string, string | null>>({});
  const [errs, setErrs] = useState<Record<string, RowErr>>({});
  const [busy, setBusy] = useState("");
  const [corr, setCorr] = useState<{ student: Row; item: Row } | null>(null);
  const [search, setSearch] = useState(""); const [filter, setFilter] = useState("all");
  const [imp, setImp] = useState<{ name: string; key: string; rows: (ImportRow & { base: string | null })[]; errors: ImportError[]; diff: string[][] } | null>(null);
  const [pubPrev, setPubPrev] = useState<Row | null>(null);
  const [note, setNote] = useState<{ sid: string; text: string } | null>(null);
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;

  const server = useMemo(() => {
    const m: Record<string, Cell & { at: string }> = {};
    for (const e of q.data?.entries ?? []) m[k(e["student_id"], e["item_id"])] = { status: e["status"], score: e["score"] == null ? "" : String(e["score"]), at: e["at"] };
    return m;
  }, [q.data]);
  // refresh keeps unsaved local edits (and their original base) — a refetch never wipes typed values
  useEffect(() => {
    if (!q.data) return;
    setCells((prev) => { const m: Record<string, Cell> = {}; for (const [key, v] of Object.entries(server)) m[key] = { status: v.status, score: v.score }; for (const key of dirtyRef.current) if (prev[key]) m[key] = prev[key]!; return m; });
  }, [server, q.data]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty.size) e.preventDefault(); };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["gb-sheet", id] }); qc.invalidateQueries({ queryKey: ["gb-overview"] }); qc.invalidateQueries({ queryKey: ["gb-corr"] }); };
  const act = async (name: string, fn: () => Promise<{ error: unknown; data?: unknown }>, ok: string) => {
    setBusy(name); const { error } = await fn(); setBusy("");
    if (error) { toast.error(arabicError(error)); refresh(); return false; }
    toast.success(ok); refresh(); return true;
  };

  if (q.isLoading) return <LoadingState />;
  if (q.error || !q.data) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const { gradebook: g, plan, items, students, events, homework, period, exceptions, drift } = q.data;
  const enter = !!g["can_enter"];
  const locked = ["approved", "published"].includes(g["status"]);
  const active = students.filter((s) => s["active"]);
  const reviewer = g["status"] === "submitted" && (g["is_dept"] || (!g["has_dept"] && g["is_admin"]));
  const approver = g["is_admin"] && (g["status"] === "reviewed" || (g["status"] === "submitted" && !g["has_dept"]));

  const cellOf = (sid: string, iid: string) => cells[k(sid, iid)] ?? { status: "missing", score: "" };
  const setCell = (sid: string, iid: string, c: Partial<Cell>) => {
    const key = k(sid, iid);
    setCells((m) => ({ ...m, [key]: { ...(m[key] ?? { status: "missing", score: "" }), ...c } }));
    setDirty((d) => new Set(d).add(key));
    setBases((b) => (key in b ? b : { ...b, [key]: server[key]?.at ?? null }));
    setErrs((e) => { if (!e[key] || e[key]!.code === "conflict") return e; const n = { ...e }; delete n[key]; return n; });
  };
  const preview = (sid: string) => previewTotal(plan as never, items as never, (iid) => cellOf(sid, iid));
  const filled = active.reduce((n, s) => n + items.filter((i) => cellOf(s["id"], i["id"]).status !== "missing").length, 0);
  const cellsTotal = active.length * items.length;
  const rowState = (s: Row) => items.some((i) => cellOf(s["id"], i["id"]).status === "missing") ? "incomplete" : "complete";
  const shown = students.filter((s) => (!search || String(s["name"]).includes(search.trim()))
    && (filter === "all" || (filter === "errors" ? items.some((i) => errs[k(s["id"], i["id"])]) : filter === "unsaved" ? items.some((i) => dirty.has(k(s["id"], i["id"]))) : s["active"] && rowState(s) === filter)));

  const save = async () => {
    const keys = [...dirty];
    const local: Record<string, RowErr> = {};
    const rows = keys.flatMap((key) => {
      const [student_id, item_id] = key.split("|"); const c = cells[key]!;
      if (c.status === "score" && (c.score === "" || Number.isNaN(Number(c.score)))) { local[key] = { code: "empty", message: "أدخل الدرجة أو غيّر الحالة" }; return []; }
      return [{ student_id, item_id, status: c.status, score: c.status === "score" ? Number(c.score) : null, base: bases[key] ?? null }];
    });
    if (!rows.length) { setErrs((e) => ({ ...e, ...local })); return void toast.error("لا توجد قيم صالحة للحفظ"); }
    setBusy("save");
    const { data, error } = await db.rpc("gb_save_entries", { _gb: id, _rows: rows, _source: "manual" });
    setBusy("");
    if (error) { toast.error(`لم يُحفظ شيء: ${arabicError(error)}. تعديلاتك ما زالت في الصفحة.`, { action: { label: "إعادة المحاولة", onClick: () => void save() } }); return; }
    const failed: Record<string, RowErr> = { ...local };
    for (const e of (data["errors"] as Row[]) ?? []) failed[k(e["student_id"], e["item_id"])] = { code: e["code"], message: e["message"], current: e["current"] };
    const stillDirty = new Set(keys.filter((key) => failed[key]));
    setDirty(stillDirty); setErrs(failed);
    setBases((b) => Object.fromEntries(Object.entries(b).filter(([key]) => stillDirty.has(key))));
    const nf = Object.keys(failed).length;
    if (nf) { setFilter("errors"); toast.warning(`حُفظت ${data["valid"]} خانة، وتعذّر حفظ ${nf}. راجع الخانات المعلَّمة بالأحمر.`); }
    else toast.success(`حُفظت ${data["valid"]} خانة (نسخة السجل ${data["revision"]})`);
    refresh();
  };
  const resolve = (key: string, keepMine: boolean) => {
    const e = errs[key]; if (!e?.current) return;
    if (keepMine) setBases((b) => ({ ...b, [key]: e.current!.at }));
    else {
      setCells((m) => ({ ...m, [key]: { status: e.current!.status, score: e.current!.score == null ? "" : String(e.current!.score) } }));
      setDirty((d) => { const n = new Set(d); n.delete(key); return n; });
    }
    setErrs((x) => { const n = { ...x }; delete n[key]; return n; });
  };

  const template = () => exportXlsx({ title: `قالب رصد — ${g["course_label"]}`, school, filters: [period["name"], `خطة ${plan["name"]} إصدار ${plan["version"]}`],
    note: "اكتب الدرجة رقمًا ثابتًا (بلا صيغ)، أو «غ» للغائب، أو «م» للمعفى إن سمحت الخطة. اترك الخانة فارغة لعدم التغيير. لا تغيّر عمود المعرّف؛ الطالب والمقرر والدرجة القصوى تُحدَّد من النظام لا من الملف." },
    ["المعرّف", "الطالب", ...items.map((i) => `${i["name"]} (من ${i["max_score"]})`)],
    active.map((s) => [s["id"], s["name"], ...items.map((i) => { const c = server[k(s["id"], i["id"])]; return c?.status === "score" ? Number(c.score) : c?.status === "absent" ? "غ" : c?.status === "exempt" ? "م" : ""; })]));
  const readImport = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellFormula: true, cellHTML: false, bookVBA: false });
      const ws = wb.Sheets[wb.SheetNames[0]!]!;
      const formulas = Object.keys(ws).filter((a) => !a.startsWith("!") && (ws[a] as XLSX.CellObject).f).map((a) => ({ line: XLSX.utils.decode_cell(a).r + 1, student: "—", item: a, message: "خلية صيغة؛ استبدلها بقيمة ثابتة" }));
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" });
      const res = checkGradeImport(aoa, students.map((s) => ({ id: s["id"], name: s["name"], active: !!s["active"] })), items.map((i) => ({ id: i["id"], name: i["name"], max_score: i["max_score"] })));
      if (plan["exempt_policy"] !== "redistribute") res.rows.forEach((r) => { if (r.status === "exempt") res.errors.push({ line: 0, student: students.find((s) => s["id"] === r.student_id)?.["name"], item: items.find((i) => i["id"] === r.item_id)?.["name"], message: "سياسة الخطة لا تسمح بالإعفاء" }); });
      const name = (sid: string) => students.find((s) => s["id"] === sid)?.["name"] ?? sid;
      const iname = (iid: string) => items.find((i) => i["id"] === iid)?.["name"] ?? iid;
      const changed = res.rows.filter((r) => { const c = server[k(r.student_id, r.item_id)]; return !c || c.status !== r.status || (r.status === "score" && Number(c.score) !== r.score); });
      setImp({ name: file.name, key: await fileKey(buf), errors: [...formulas, ...res.errors],
        rows: changed.map((r) => ({ ...r, base: server[k(r.student_id, r.item_id)]?.at ?? null })),
        diff: changed.map((r) => [name(r.student_id), iname(r.item_id), show(server[k(r.student_id, r.item_id)]), show({ status: r.status, score: r.score })]) });
    } catch (e) { toast.error(arabicError(e)); }
  };
  const runImport = async () => {
    if (!imp) return;
    setBusy("import");
    const { data, error } = await db.rpc("gb_save_entries", { _gb: id, _rows: imp.rows, _source: "import", _atomic: true, _batch: imp.key });
    setBusy("");
    if (error) return void toast.error(arabicError(error));
    if ((data["errors"] as Row[]).length) {
      const nm = (sid: string) => students.find((s) => s["id"] === sid)?.["name"] ?? "—"; const im = (iid: string) => items.find((i) => i["id"] === iid)?.["name"] ?? "—";
      setImp({ ...imp, errors: (data["errors"] as Row[]).map((e) => ({ line: 0, student: nm(e["student_id"]), item: im(e["item_id"]), message: e["message"] })) });
      return void toast.error("رفض الخادم الدفعة كاملة؛ لم يُحفظ شيء. راجع تقرير الأخطاء.");
    }
    toast.success(`استُوردت ${data["valid"]} خانة`); setImp(null); refresh();
  };
  const openPublish = async () => {
    setBusy("pubprev"); const { data, error } = await db.rpc("gb_publish_preview", { _gb: id }); setBusy("");
    if (error) return void toast.error(arabicError(error)); setPubPrev(data);
  };

  const disabledWhy = !enter ? (locked ? "السجل مقفل بعد الاعتماد؛ استخدم طلب التصحيح" : g["status"] === "submitted" || g["status"] === "reviewed" ? "السجل قيد المراجعة/الاعتماد" : !g["is_teacher"] ? "الرصد لمعلم المقرر بتكليف ساري فقط" : "فترة الرصد مغلقة أو خارج مواعيدها (بتوقيت الرياض)") : "";
  const usedElsewhere = (itemId: string) => new Set(q.data!.entries.filter((e) => e["item_id"] !== itemId && e["source"] === "homework").flatMap((e) => (e["homework_ids"] as string[]) ?? []));

  const cellEdit = (s: Row, i: Row) => {
    const key = k(s["id"], i["id"]); const c = cellOf(s["id"], i["id"]); const er = errs[key];
    const can = enter && s["active"] && s["can_enter"];
    return (
      <div className={`rounded-md p-1 ${er ? "bg-destructive/10 ring-1 ring-destructive" : dirty.has(key) ? "bg-warning/10" : ""}`} data-testid={er ? "cell-error" : undefined}>
        {can ? <div className="flex gap-1">
          <select aria-label={`حالة ${i["name"]} — ${s["name"]}`} className={selectCls("w-24")} value={c.status} onChange={(e) => setCell(s["id"], i["id"], { status: e.target.value })}>
            {Object.entries(ENTRY_STATUS).filter(([v]) => v !== "exempt" || plan["exempt_policy"] === "redistribute").map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          {c.status === "score" && <Input aria-label={`درجة ${i["name"]} — ${s["name"]}`} className="w-20" type="number" inputMode="decimal" min={0} max={i["max_score"]} step="0.25" value={c.score} onChange={(e) => setCell(s["id"], i["id"], { score: e.target.value })} />}
        </div> : <button className="text-start disabled:cursor-default" disabled={!(locked && g["is_teacher"])} onClick={() => setCorr({ student: s, item: i })} title={locked && g["is_teacher"] ? "طلب تصحيح" : ""}>
          {c.status === "score" ? c.score : <span className="text-muted-foreground">{ENTRY_STATUS[c.status]}</span>}</button>}
        {er && <div className="mt-1 text-xs text-destructive">{er.message}
          {er.code === "conflict" && er.current && <div className="mt-1 flex flex-wrap items-center gap-1 text-foreground">القيمة الأحدث: <b>{show({ status: er.current.status, score: er.current.score })}</b>
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => resolve(key, false)}>اعتماد الأحدث</Button>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => resolve(key, true)}>إبقاء تعديلي</Button></div>}</div>}
      </div>
    );
  };
  const total = (s: Row) => {
    const hasDirty = items.some((i) => dirty.has(k(s["id"], i["id"])));
    const v = hasDirty ? preview(s["id"]) : s["total"];
    return <span className="font-semibold">{v ?? <span className="text-xs font-normal text-muted-foreground">غير مكتمل</span>}{hasDirty && <span className="ms-1 text-xs font-normal text-muted-foreground">(معاينة)</span>}</span>;
  };
  const noteBtn = (s: Row) => s["note"] || (enter && s["active"] && s["can_enter"]) ? (
    <button className="text-xs text-primary underline-offset-2 hover:underline disabled:text-muted-foreground disabled:no-underline" disabled={!(enter && s["can_enter"])} onClick={() => setNote({ sid: s["id"], text: s["note"] ?? "" })}>
      {s["note"] ? `ملاحظة للأسرة: ${s["note"]}` : "+ ملاحظة للأسرة"}</button>) : null;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={async () => { if (!dirty.size || (await ask("توجد تعديلات غير محفوظة. الخروج دون حفظ؟", { destructive: true }))) onBack(); }}><ArrowRight className="size-4" />كل السجلات</Button>
      <Section title={g["course_label"]} desc={`${period["name"]} (${period["entry_start"]} ← ${period["entry_end"]}) • الخطة: ${plan["name"]} إصدار ${plan["version"]} • المجموع ${plan["total"]}`} action={<Badge s={g["status"]} />}>
        <div className="mb-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-card p-2"><div className="text-xs text-muted-foreground">اكتمال الرصد</div><b data-testid="completion">{cellsTotal ? Math.round((1000 * filled) / cellsTotal) / 10 : 0}%</b> <span className="text-xs text-muted-foreground">({filled} من {cellsTotal} خانة للطلاب الحاليين؛ «لم تُرصد» لا تُحتسب)</span></div>
          <div className="rounded-lg border bg-card p-2"><div className="text-xs text-muted-foreground">آخر حفظ</div>{fmt(g["last_saved_at"])}{g["last_saved_by_name"] ? ` — ${g["last_saved_by_name"]}` : ""}</div>
          <div className="rounded-lg border bg-card p-2"><div className="text-xs text-muted-foreground">نسخة السجل</div><b data-testid="revision">{g["revision"]}</b>{g["reviewed_revision"] != null && <span className="text-xs text-muted-foreground"> • روجعت النسخة {g["reviewed_revision"]}</span>}{g["approved_revision"] != null && <span className="text-xs text-muted-foreground"> • اعتُمدت {g["approved_revision"]}</span>}</div>
          <div className="rounded-lg border bg-card p-2"><div className="text-xs text-muted-foreground">الطلاب</div>{active.length} حالي{students.length > active.length ? ` • ${students.length - active.length} منقول (محفوظ تاريخيًا)` : ""}</div>
        </div>
        {g["dept_missing"] && <Note tone="warning">لا يوجد رئيس قسم مخوّل لمادة هذا المقرر؛ تتولى إدارة المدرسة المراجعة بدلًا منه، ولا تُتجاوز المراجعة.</Note>}
        {g["return_reason"] && <Note tone="destructive" testid="return-reason">سبب الإعادة: {g["return_reason"]}{g["reopen_until"] ? ` • مفتوح حتى ${fmt(g["reopen_until"])}` : ""}</Note>}
        {exceptions.length > 0 && <Note tone="info">استثناء موعد ساري: {exceptions.map((x) => `${x["student_name"] ?? "المقرر كاملًا"} حتى ${fmt(x["expires_at"])} (${x["reason"]})`).join(" • ")}</Note>}
        {drift.length > 0 && <Note tone="warning" testid="drift">تغيّرت درجات واجبات مصدر بعد ربطها في {drift.length} خانة ({drift.slice(0, 3).map((d) => `${d["student_name"]}/${d["item_name"]}: ${d["stored"]} ← ${d["current"] ?? "لا قيمة"}`).join("، ")}). لا تُعدَّل القيم تلقائيًا؛ {locked ? "قدّم طلب تصحيح إن لزم." : enter ? "أعد الجلب بعد المعاينة." : "يلزم إعادة السجل للمعلم قبل الاعتماد."}</Note>}
        {disabledWhy && <p className="mb-3 text-sm text-muted-foreground" data-testid="entry-disabled">{disabledWhy}</p>}

        <div className="mb-3 flex flex-wrap gap-2">
          {enter && <>
            <Button size="sm" disabled={!dirty.size || !!busy} onClick={save}>{busy === "save" ? "جارٍ الحفظ…" : `حفظ مسودة${dirty.size ? ` (${dirty.size})` : ""}`}</Button>
            <Button size="sm" variant="outline" onClick={template}><FileDown className="size-4" />قالب المقرر</Button>
            <label className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm ${dirty.size ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-muted"}`} title={dirty.size ? "احفظ التعديلات أولًا" : ""}><FileUp className="size-4" />استيراد
              <input type="file" accept=".xlsx,.xls" className="hidden" disabled={dirty.size > 0} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void readImport(f); }} /></label>
            <Button size="sm" variant="outline" disabled={!!busy || dirty.size > 0} title={dirty.size ? "احفظ التعديلات أولًا" : ""} onClick={async () => {
              const miss = cellsTotal - filled;
              if (miss > 0) return void toast.error(`توجد ${miss} خانة غير مرصودة. ارصدها أو حدد غائب/معفى قبل الإرسال.`, { action: { label: "عرض الناقص", onClick: () => setFilter("incomplete") } });
              if (await ask(`إرسال النسخة ${g["revision"]} للمراجعة؟ لن تتمكن من التعديل حتى تُعاد.`)) act("submit", () => db.rpc("gb_submit", { _gb: id }), "أُرسل للمراجعة"); }}>{busy === "submit" ? "…" : "إرسال للمراجعة"}</Button></>}
          {reviewer && <>
            <Button size="sm" disabled={!!busy} onClick={async () => { if (await ask(`قبول مراجعة النسخة ${g["revision"]} ورفعها للاعتماد؟`)) act("rev", () => db.rpc("gb_review", { _gb: id, _accept: true, _reason: null }), "قُبلت المراجعة"); }}>قبول المراجعة</Button>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={async () => { const r = await askText("ملاحظات الإعادة للمعلم (ما المطلوب تعديله)", { required: true }); if (r) act("rev", () => db.rpc("gb_review", { _gb: id, _accept: false, _reason: r }), "أُعيد للمعلم"); }}>إعادة للمعلم</Button></>}
          {approver && <>
            <Button size="sm" disabled={!!busy || drift.length > 0} title={drift.length ? "تغيّرت مصادر واجبات؛ أعد السجل للمعلم" : ""} onClick={async () => { if (await ask(`اعتماد النسخة ${g["revision"]} وقفل الرصد؟`)) act("app", () => db.rpc("gb_approve", { _gb: id, _accept: true, _reason: null, _revision: g["revision"] }), "اعتُمد السجل"); }}>اعتماد وقفل</Button>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={async () => { const r = await askText("سبب الإعادة", { required: true }); if (r) act("app", () => db.rpc("gb_approve", { _gb: id, _accept: false, _reason: r }), "أُعيد للمعلم"); }}>إعادة</Button></>}
          {g["is_admin"] && g["status"] === "approved" && <Button size="sm" disabled={!!busy} onClick={openPublish}>{busy === "pubprev" ? "…" : "معاينة النشر"}</Button>}
          {g["is_admin"] && ["submitted", "reviewed", "approved", "published"].includes(g["status"]) && <Button size="sm" variant="ghost" disabled={!!busy} onClick={async () => {
            const r = await askText("سبب إعادة فتح هذا السجل فقط (يُفتح 48 ساعة)", { required: true }); if (r) act("reopen", () => db.rpc("gb_reopen", { _gb: id, _reason: r, _hours: 48 }), "أُعيد فتح السجل"); }}>إعادة فتح السجل</Button>}
          <ExportButtons title={`كشف رصد داخلي — ${g["course_label"]}`} school={school} filters={[period["name"], GB_STATUS[g["status"]]!, `نسخة ${g["revision"]}`]}
            headers={["الطالب", ...items.map((i) => `${i["name"]} (من ${i["max_score"]}، وزن ${i["weight"]})`), `المجموع من ${plan["total"]}`]}
            rows={() => students.map((s) => [s["name"] + (s["active"] ? "" : " (منقول)"), ...items.map((i) => { const c = server[k(s["id"], i["id"])]; return c?.status === "score" ? Number(c.score) : ENTRY_STATUS[c?.status ?? "missing"]!; }), s["total"] ?? "غير مكتمل"])} />
        </div>

        {pubPrev && <PublishPreview p={pubPrev} busy={busy === "pub"} onCancel={() => setPubPrev(null)} onPublish={async (allow) => {
          if (await act("pub", () => db.rpc("gb_publish", { _gb: id, _allow_incomplete: allow }), "نُشرت النتائج")) setPubPrev(null); }} />}
        {imp && <ImportReview imp={imp} busy={busy === "import"} onCancel={() => setImp(null)} onConfirm={runImport} school={school} label={g["course_label"]} />}
        {g["is_admin"] && !locked && <ExceptionsPanel gb={id} students={active} exceptions={exceptions} periodLocked={period["status"] === "locked"} onDone={refresh} />}
        {enter && homework.length > 0 && items.some((i) => i["source"] === "homework") && <HomeworkLink gb={id} items={items.filter((i) => i["source"] === "homework")} homework={homework} usedElsewhere={usedElsewhere} disabled={dirty.size > 0} onDone={refresh} />}
        {note && <div className="mb-3 rounded-xl border bg-muted/30 p-3 text-sm">
          <Label htmlFor="gb-note">ملاحظة للأسرة — {students.find((s) => s["id"] === note.sid)?.["name"]} (تظهر بعد النشر فقط، حتى 500 حرف)</Label>
          <Input id="gb-note" className="mt-1" maxLength={500} value={note.text} onChange={(e) => setNote({ ...note, text: e.target.value })} />
          <div className="mt-2 flex gap-2"><Button size="sm" disabled={busy === "note"} onClick={async () => { if (await act("note", () => db.rpc("gb_set_note", { _gb: id, _student: note.sid, _note: note.text }), "حُفظت الملاحظة")) setNote(null); }}>حفظ الملاحظة</Button><Button size="sm" variant="ghost" onClick={() => setNote(null)}>إلغاء</Button></div>
        </div>}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative"><Search className="absolute end-2 top-2.5 size-4 text-muted-foreground" /><Input placeholder="ابحث باسم الطالب" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56 pe-8" /></div>
          <select aria-label="تصفية الطلاب" className={selectCls("w-48")} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">كل الطلاب ({students.length})</option><option value="incomplete">ناقص الرصد</option><option value="complete">مكتمل الرصد</option>
            <option value="unsaved">غير محفوظ ({[...new Set([...dirty].map((x) => x.split("|")[0]))].length})</option><option value="errors">فيه أخطاء ({Object.keys(errs).length})</option></select>
          {g["status"] === "returned" && <span className="text-xs text-destructive">السجل معاد للمعالجة</span>}
          <Button size="sm" variant="ghost" onClick={() => q.refetch()}><RefreshCw className="size-4" />تحديث</Button>
        </div>
        {!students.length ? <EmptyState title="لا يوجد طلاب في هذا المقرر" /> : !shown.length ? <EmptyState title="لا يوجد طلاب مطابقون" /> : <>
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block"><table className="w-full text-sm" data-testid="gb-table"><thead className="bg-muted/50"><tr><th className="px-3 py-2 text-start">الطالب</th>
            {items.map((i) => <th key={i["id"]} className="px-2 py-2 text-start">{i["name"]}<div className="text-xs font-normal text-muted-foreground">من {i["max_score"]} • وزن {i["weight"]}{i["source"] === "homework" ? " • واجبات" : ""}</div></th>)}
            <th className="px-3 text-start">المجموع من {plan["total"]}</th></tr></thead>
            <tbody>{shown.map((s) => <tr key={s["id"]} className="border-t align-top" data-testid="gb-student">
              <td className="px-3 py-2">{s["name"]}{!s["active"] && <span className="ms-1 text-xs text-muted-foreground">(منقول — محفوظ تاريخيًا)</span>}<div>{noteBtn(s)}</div></td>
              {items.map((i) => <td key={i["id"]} className="px-1 py-1">{cellEdit(s, i)}</td>)}
              <td className="px-3 py-2">{total(s)}</td></tr>)}</tbody></table></div>
          <div className="space-y-2 md:hidden" data-testid="gb-cards">{shown.map((s) => <div key={s["id"]} className="rounded-xl border bg-card p-3" data-testid="gb-card">
            <div className="mb-2 flex items-start justify-between gap-2"><div className="font-medium">{s["name"]}{!s["active"] && <span className="ms-1 text-xs text-muted-foreground">(منقول)</span>}</div>{total(s)}</div>
            <div className="space-y-2">{items.map((i) => <div key={i["id"]}><div className="mb-0.5 text-xs text-muted-foreground">{i["name"]} — من {i["max_score"]} • وزن {i["weight"]}</div>{cellEdit(s, i)}</div>)}</div>
            <div className="mt-2">{noteBtn(s)}</div></div>)}</div>
        </>}
        {enter && dirty.size > 0 && <div className="sticky bottom-2 z-10 mt-3 flex items-center justify-between gap-2 rounded-xl border bg-card p-2 shadow-sm md:hidden"><span className="text-sm">{dirty.size} خانة غير محفوظة</span><Button size="sm" disabled={!!busy} onClick={save}>{busy === "save" ? "…" : "حفظ"}</Button></div>}
        {locked && g["is_teacher"] && <p className="mt-2 text-xs text-muted-foreground">السجل مقفل. اضغط على أي خانة لطلب تصحيح بسبب، ويبت فيه مدير المدرسة.</p>}
        {dirty.size > 0 && <p className="mt-2 text-xs text-muted-foreground">«معاينة» تحسب المجموع بالقاعدة نفسها قبل الحفظ؛ القيمة المعتمدة يحسبها الخادم بعد الحفظ.</p>}
      </Section>
      {corr && <CorrectionForm gb={id} student={corr.student} item={corr.item} current={cells[k(corr.student["id"], corr.item["id"])]} onClose={() => setCorr(null)} onDone={() => { setCorr(null); refresh(); }} />}
      <Section title="سجل العمليات">
        {!events.length ? <EmptyState title="لا توجد عمليات" /> : <ul className="space-y-1 text-sm">{events.map((e, i) => <li key={i} className="flex flex-wrap gap-2 border-b py-1 last:border-0"><span className="font-medium">{EVENT_LABEL[e["action"]] ?? e["action"]}</span><span className="text-muted-foreground">{e["by"] ?? "—"} • {fmt(e["at"])}</span>{e["details"]?.["revision"] != null && <span className="text-xs text-muted-foreground">نسخة {e["details"]["revision"]}</span>}{e["details"]?.["errors"] ? <span className="text-xs text-destructive">{e["details"]["errors"]} خانة مرفوضة</span> : null}{e["details"]?.["reason"] && <span>— {e["details"]["reason"]}</span>}</li>)}</ul>}
      </Section>
    </div>
  );
}

function Note({ tone, children, testid }: { tone: "warning" | "destructive" | "info"; children: React.ReactNode; testid?: string }) {
  const c = tone === "destructive" ? "border-destructive/30 bg-destructive/5" : tone === "warning" ? "border-warning/40 bg-warning/10" : "border-primary/20 bg-primary/5";
  return <div className={`mb-3 flex gap-2 rounded-lg border p-3 text-sm ${c}`} data-testid={testid}><AlertTriangle className="mt-0.5 size-4 shrink-0" /><div>{children}</div></div>;
}

function PublishPreview({ p, busy, onCancel, onPublish }: { p: Row; busy: boolean; onCancel: () => void; onPublish: (allowIncomplete: boolean) => void }) {
  const [ok, setOk] = useState(false); const inc = (p["incomplete"] as string[]) ?? [];
  return (
    <div className="mb-3 rounded-xl border bg-card p-3 text-sm" data-testid="publish-preview">
      <div className="mb-2 font-semibold">معاينة النشر</div>
      <ul className="mb-2 space-y-1">
        <li>النطاق: <b>{p["scope"]}</b> — {p["period"]} فقط (لا يشمل مقررات أو شعبًا أخرى)</li>
        <li>الطلاب: {p["students"]}{p["transferred"] ? ` (منهم ${p["transferred"]} منقول تُحفظ نتيجته تاريخيًا)` : ""} • مكتملة: {p["complete"]} • غير مكتملة: {inc.length}</li>
        <li>يُشعَر {p["recipients"]} مستخدمًا (الطلاب وأولياء الأمور الموثّقون) مرة واحدة لكل إصدار.</li>
        <li>النسخة المنشورة: {p["revision"]}{p["result_version"] > 0 ? ` • إصدار نتائج جديد رقم ${p["result_version"] + 1}` : ""}</li>
      </ul>
      {inc.length > 0 && <label className="mb-2 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-1" />
        <span>أوافق على نشر {inc.length} نتيجة غير مكتملة تظهر للأسرة «غير مكتملة» دون مجموع: {inc.slice(0, 6).join("، ")}{inc.length > 6 ? "…" : ""}</span></label>}
      <div className="flex gap-2"><Button size="sm" disabled={busy || (inc.length > 0 && !ok)} onClick={() => onPublish(inc.length > 0)}>{busy ? "جارٍ النشر…" : "نشر للطلاب والأسر"}</Button><Button size="sm" variant="ghost" onClick={onCancel}>إلغاء</Button></div>
    </div>
  );
}

function ImportReview({ imp, busy, onCancel, onConfirm, school, label }: { imp: { name: string; rows: unknown[]; errors: ImportError[]; diff: string[][] }; busy: boolean; onCancel: () => void; onConfirm: () => void; school: string; label: string }) {
  const bad = imp.errors.length > 0;
  return (
    <div className="mb-3 rounded-xl border bg-card p-3 text-sm" data-testid="import-review">
      <div className="mb-1 font-semibold">مراجعة الاستيراد — {imp.name}</div>
      <p className="mb-2 text-muted-foreground">{bad ? `${imp.errors.length} خطأ؛ لا يُستورد شيء حتى تُصحَّح كل الأخطاء (الدفعة كاملة أو لا شيء).` : `${imp.diff.length} خانة ستتغير. الخانات الفارغة في الملف لا تُغيَّر.`}</p>
      {bad ? <div className="mb-2 max-h-60 overflow-auto rounded border"><table className="w-full text-xs"><thead className="bg-muted/50"><tr>{["السطر", "الطالب", "البند/الخلية", "الخطأ"].map((h) => <th key={h} className="px-2 py-1 text-start">{h}</th>)}</tr></thead>
        <tbody>{imp.errors.map((e, i) => <tr key={i} className="border-t" data-testid="import-error"><td className="px-2 py-1">{e.line || "—"}</td><td className="px-2">{e.student}</td><td className="px-2">{e.item}</td><td className="px-2 text-destructive">{e.message}</td></tr>)}</tbody></table></div>
        : imp.diff.length > 0 && <div className="mb-2 max-h-60 overflow-auto rounded border"><table className="w-full text-xs"><thead className="bg-muted/50"><tr>{["الطالب", "البند", "الحالي", "الجديد"].map((h) => <th key={h} className="px-2 py-1 text-start">{h}</th>)}</tr></thead>
          <tbody>{imp.diff.map((d, i) => <tr key={i} className="border-t" data-testid="import-diff"><td className="px-2 py-1">{d[0]}</td><td className="px-2">{d[1]}</td><td className="px-2 text-muted-foreground">{d[2]}</td><td className="px-2 font-semibold">{d[3]}</td></tr>)}</tbody></table></div>}
      <div className="flex flex-wrap gap-2">
        {bad && <Button size="sm" variant="outline" onClick={() => exportXlsx({ title: `أخطاء استيراد — ${label}`, school, filters: [imp.name] }, ["السطر", "الطالب", "البند/الخلية", "الخطأ"], imp.errors.map((e) => [e.line || "—", e.student, e.item, e.message]))}><FileDown className="size-4" />تنزيل تقرير الأخطاء</Button>}
        {!bad && <Button size="sm" disabled={busy || !imp.diff.length} onClick={onConfirm}>{busy ? "جارٍ الاستيراد…" : `تأكيد استيراد ${imp.diff.length} خانة`}</Button>}
        <Button size="sm" variant="ghost" onClick={onCancel}>إغلاق</Button>
      </div>
    </div>
  );
}

function ExceptionsPanel({ gb, students, exceptions, periodLocked, onDone }: { gb: string; students: Row[]; exceptions: Row[]; periodLocked: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false); const [sid, setSid] = useState(""); const [reason, setReason] = useState(""); const [days, setDays] = useState("2"); const [busy, setBusy] = useState(false);
  const grant = async () => {
    setBusy(true);
    const until = new Date(Date.now() + Number(days) * 86400e3).toISOString();
    const { error } = await db.rpc("gb_grant_exception", { _gb: gb, _student: sid || null, _reason: reason, _until: until }); setBusy(false);
    if (error) return void toast.error(arabicError(error)); toast.success("مُنح الاستثناء وأُبلغ المعلم"); setOpen(false); setReason(""); onDone();
  };
  return (
    <div className="mb-3 rounded-xl border bg-muted/20 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">استثناءات موعد الرصد</span>
        {!open && <Button size="sm" variant="outline" disabled={periodLocked} title={periodLocked ? "الفترة مقفلة" : ""} onClick={() => setOpen(true)}>منح استثناء</Button>}</div>
      <p className="text-xs text-muted-foreground">يفتح الرصد لهذا المقرر أو لطالب واحد فقط بعد انتهاء الموعد، بسبب ومدة محددة. لا يتجاوز قفل الفترة.</p>
      {exceptions.map((x) => <div key={x["id"]} className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2" data-testid="exception-row">
        <span>{x["student_name"] ?? "المقرر كاملًا"} — حتى {fmt(x["expires_at"])} — {x["reason"]} <span className="text-xs text-muted-foreground">({x["by"]})</span></span>
        <Button size="sm" variant="ghost" onClick={async () => { const r = await askText("سبب الإلغاء (اختياري)"); if (r === null) return; const { error } = await db.rpc("gb_revoke_exception", { _id: x["id"], _reason: r }); if (error) return void toast.error(arabicError(error)); toast.success("أُلغي الاستثناء"); onDone(); }}>إلغاء</Button></div>)}
      {open && <div className="mt-2 grid gap-2 md:grid-cols-4">
        <div className="space-y-1"><Label htmlFor="ex-s">النطاق</Label><select id="ex-s" className={sel} value={sid} onChange={(e) => setSid(e.target.value)}><option value="">المقرر كاملًا</option>{students.map((s) => <option key={s["id"]} value={s["id"]}>{s["name"]}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="ex-d">المدة</Label><select id="ex-d" className={sel} value={days} onChange={(e) => setDays(e.target.value)}>{["1", "2", "3", "7", "14"].map((d) => <option key={d} value={d}>{d} يوم</option>)}</select></div>
        <div className="space-y-1 md:col-span-2"><Label htmlFor="ex-r">السبب</Label><Input id="ex-r" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <div className="flex gap-2 md:col-span-4"><Button size="sm" disabled={busy || !reason.trim()} onClick={grant}>{busy ? "…" : "منح"}</Button><Button size="sm" variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button></div>
      </div>}
    </div>
  );
}

const LACK: Record<string, string> = { not_submitted: "لم يسلّم", returned: "معاد للاستكمال", unpublished: "مصحح غير منشور", ungraded: "لم يُصحح" };
function HomeworkLink({ gb, items, homework, usedElsewhere, disabled, onDone }: { gb: string; items: Row[]; homework: Row[]; usedElsewhere: (item: string) => Set<string>; disabled: boolean; onDone: () => void }) {
  const [item, setItem] = useState(items[0]?.["id"] ?? ""); const [chosen, setChosen] = useState<string[]>([]);
  const [method, setMethod] = useState("average"); const [missing, setMissing] = useState("available");
  const [pv, setPv] = useState<Row | null>(null); const [busy, setBusy] = useState(false);
  const used = usedElsewhere(item);
  const reset = () => setPv(null);
  const run = async (fn: "gb_homework_preview" | "gb_pull_homework") => {
    setBusy(true); const { data, error } = await db.rpc(fn, { _gb: gb, _item: item, _homework: chosen, _method: method, _missing: missing }); setBusy(false);
    if (error) return void toast.error(arabicError(error));
    if (fn === "gb_homework_preview") setPv(data); else { toast.success(`رُبطت درجات ${data} طالب`); setPv(null); onDone(); }
  };
  const max = items.find((i) => i["id"] === item)?.["max_score"];
  return (
    <div className="mb-3 rounded-xl border bg-muted/30 p-3 text-sm">
      <div className="mb-1 font-semibold">ربط درجات الواجبات</div>
      <p className="mb-2 text-xs text-muted-foreground">يُحتسب أحدث تصحيح منشور لكل واجب فقط (المحاولة المعتمدة)، ويحوَّل إلى درجة البند القصوى ({max}) ثم يُطبَّق وزن البند مرة واحدة في المجموع. غير المسلَّم أو المعاد أو غير المنشور لا يُحوَّل إلى صفر؛ يبقى الطالب «لم تُرصد». الواجب لا يُحتسب في بندين.</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1"><Label htmlFor="hl-i">البند</Label><select id="hl-i" className={selectCls("w-40")} value={item} onChange={(e) => { setItem(e.target.value); setChosen([]); reset(); }}>{items.map((i) => <option key={i["id"]} value={i["id"]}>{i["name"]}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="hl-m">طريقة الحساب</Label><select id="hl-m" className={selectCls("w-44")} value={method} onChange={(e) => { setMethod(e.target.value); reset(); }}><option value="average">متوسط النسب</option><option value="sum">مجموع الدرجات ÷ مجموع القصوى</option></select></div>
        <div className="space-y-1"><Label htmlFor="hl-x">الواجبات الناقصة</Label><select id="hl-x" className={selectCls("w-56")} value={missing} onChange={(e) => { setMissing(e.target.value); reset(); }}><option value="available">احسب من المنشور المتاح</option><option value="require_all">لا تحسب إلا إذا اكتملت كلها</option></select></div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">{homework.map((h) => { const dis = used.has(h["id"]); return <label key={h["id"]} className={`flex items-center gap-1 rounded border bg-card px-2 py-1 ${dis ? "opacity-50" : ""}`}><input type="checkbox" disabled={dis} checked={chosen.includes(h["id"])} onChange={(e) => { setChosen((s) => e.target.checked ? [...s, h["id"]] : s.filter((x) => x !== h["id"])); reset(); }} />{h["title"]} <span className="text-xs text-muted-foreground">(من {h["max_score"]} • {h["published"]} منشورة{dis ? " • محسوب في بند آخر" : ""})</span></label>; })}</div>
      <div className="mt-2 flex gap-2"><Button size="sm" variant="outline" disabled={busy || !chosen.length || disabled} title={disabled ? "احفظ التعديلات أولًا" : ""} onClick={() => run("gb_homework_preview")}>{busy && !pv ? "…" : "معاينة"}</Button></div>
      {pv && <div className="mt-2" data-testid="hw-preview">
        <div className="max-h-72 overflow-auto rounded border bg-card"><table className="w-full text-xs"><thead className="bg-muted/50"><tr>{["الطالب", "الحالي", "الناتج", "واجبات محسوبة", "غير محسوبة"].map((h) => <th key={h} className="px-2 py-1 text-start">{h}</th>)}</tr></thead>
          <tbody>{(pv["students"] as Row[]).map((s) => <tr key={s["student_id"]} className="border-t"><td className="px-2 py-1">{s["name"]}</td><td className="px-2">{show({ status: s["current_status"], score: s["current_score"] })}</td>
            <td className="px-2 font-semibold">{s["value"] ?? <span className="font-normal text-muted-foreground">لا يتغير (لم تُرصد)</span>}</td><td className="px-2">{s["used"]}</td>
            <td className="px-2">{(s["lacking"] as Row[]).map((l) => `${l["title"]}: ${LACK[l["reason"]] ?? l["reason"]}`).join("، ") || "—"}</td></tr>)}</tbody></table></div>
        <div className="mt-2 flex gap-2"><Button size="sm" disabled={busy} onClick={async () => { if (await ask("اعتماد الجلب؟ تُستبدل قيم البند للطلاب الذين لهم ناتج فقط، ويُحفظ مرجع المصدر ونسخته.")) void run("gb_pull_homework"); }}>{busy ? "…" : "اعتماد الجلب"}</Button><Button size="sm" variant="ghost" onClick={reset}>إلغاء</Button></div>
      </div>}
    </div>
  );
}

function CorrectionForm({ gb, student, item, current, onClose, onDone }: { gb: string; student: Row; item: Row; current: Cell | undefined; onClose: () => void; onDone: () => void }) {
  const [st, setSt] = useState("score"); const [score, setScore] = useState(""); const [reason, setReason] = useState(""); const [ev, setEv] = useState(""); const [busy, setBusy] = useState(false);
  return (
    <Section title={`طلب تصحيح — ${student["name"]} / ${item["name"]}`} desc={`القيمة الحالية: ${current?.status === "score" ? current.score : ENTRY_STATUS[current?.status ?? "missing"]}`}>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="space-y-1"><Label htmlFor="cs">الحالة المقترحة</Label><select id="cs" className={sel} value={st} onChange={(e) => setSt(e.target.value)}><option value="score">درجة</option><option value="absent">غائب</option><option value="exempt">معفى</option></select></div>
        {st === "score" && <div className="space-y-1"><Label htmlFor="cv">الدرجة المقترحة (من {item["max_score"]})</Label><Input id="cv" type="number" value={score} onChange={(e) => setScore(e.target.value)} /></div>}
        <div className="space-y-1 md:col-span-2"><Label htmlFor="cr">السبب</Label><Input id="cr" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <div className="space-y-1 md:col-span-4"><Label htmlFor="ce">الدليل (اختياري)</Label><Input id="ce" value={ev} onChange={(e) => setEv(e.target.value)} placeholder="مثلًا: ورقة الاختبار رقم…" /></div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button disabled={busy || !reason.trim()} onClick={async () => {
          setBusy(true); const { error } = await db.rpc("gb_request_correction", { _gb: gb, _student: student["id"], _item: item["id"], _status: st, _score: st === "score" ? Number(score) : null, _reason: reason, _evidence: ev }); setBusy(false);
          if (error) return void toast.error(arabicError(error)); toast.success("أُرسل طلب التصحيح للمدير"); onDone();
        }}>{busy ? "…" : "إرسال الطلب"}</Button><Button variant="ghost" onClick={onClose}>إلغاء</Button>
      </div>
    </Section>
  );
}
