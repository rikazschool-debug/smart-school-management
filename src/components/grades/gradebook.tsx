import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { ArrowRight, FileDown, FileUp } from "lucide-react";
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
import { CORR_STATUS, ENTRY_STATUS, EVENT_LABEL, GB_STATUS, GB_TONE, parseCell } from "./common";

const sel = selectCls("w-full");
const Badge = ({ s }: { s: string }) => <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${GB_TONE[s] ?? "bg-muted"}`} data-testid="gb-status">{GB_STATUS[s] ?? s}</span>;

/* ================= Overview (completion, pending, averages) ================= */
export function OverviewTab({ S, school, period, onOpen, canOpen }: { S: string; school: string; period: Row | undefined; onOpen: (gb: string) => void; canOpen: boolean }) {
  const qc = useQueryClient();
  const [st, setSt] = useState(""); const [search, setSearch] = useState("");
  const q = useQuery({ queryKey: ["gb-overview", S, period?.["id"]], enabled: !!period, queryFn: async () => {
    const { data, error } = await db.rpc("gb_overview", { _school: S, _period: period!["id"] }); if (error) throw error; return data as Row[];
  } });
  const rows = (q.data ?? []).filter((r) => (!st || r["status"] === st) && (!search || `${r["course_label"]} ${r["teacher_name"] ?? ""}`.includes(search)));
  const open = async (r: Row) => {
    if (r["gradebook_id"]) return onOpen(r["gradebook_id"]);
    const { data, error } = await db.rpc("gb_open", { _course: r["course_id"], _period: period!["id"] });
    if (error) return void toast.error(arabicError(error));
    qc.invalidateQueries({ queryKey: ["gb-overview", S] }); onOpen(data);
  };
  if (!period) return <EmptyState title="لا توجد فترة رصد" hint="تُنشئها الإدارة من تبويب فترات الرصد." />;
  const cols = ["المقرر", "المعلم", "الحالة", "الطلاب", "الخانات المرصودة", "غير المرصودة", "اكتمال الرصد %", "نتائج مكتملة", "المتوسط (من المكتمل)", "تصحيحات معلقة"];
  const line = (r: Row) => [r["course_label"], r["teacher_name"] ?? "—", GB_STATUS[r["status"]], r["students"] ?? 0, r["filled"] ?? 0, r["missing"] ?? 0,
    r["cells"] ? Math.round((1000 * r["filled"]) / r["cells"]) / 10 : "—", r["computed"] ?? 0, r["average"] ?? "—", r["pending_corrections"] ?? 0];
  return (
    <Section title={`سجلات الدرجات — ${period["name"]}`} desc="المتوسط يُحسب من النتائج المكتملة فقط، ولا تُعدّ الخانات غير المرصودة أصفارًا؛ يظهر بجانبه عدد الطلاب الداخلين فيه.">
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <Input placeholder="ابحث بالمادة أو الشعبة أو المعلم" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
        <select aria-label="الحالة" className={selectCls("w-44")} value={st} onChange={(e) => setSt(e.target.value)}><option value="">كل الحالات</option>{Object.entries(GB_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <ExportButtons title={`اكتمال الرصد — ${period["name"]}`} school={school} filters={[st ? GB_STATUS[st]! : "كل الحالات", search].filter(Boolean)} headers={cols} rows={() => rows.map(line)} />
      </div>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !rows.length ? <EmptyState title="لا توجد مقررات ضمن صلاحيتك" /> : (
        <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm"><thead className="bg-muted/50"><tr>{cols.map((h) => <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>)}<th /></tr></thead>
          <tbody>{rows.map((r) => { const l = line(r); return <tr key={r["course_id"]} className="border-t" data-testid="gb-row">
            <td className="px-3 py-2 font-medium">{l[0]}</td><td className="px-3">{l[1]}</td><td className="px-3"><Badge s={r["status"]} /></td>{l.slice(3).map((v, i) => <td key={i} className="px-3">{v}</td>)}
            <td className="px-3">{(r["gradebook_id"] || canOpen) && <Button size="sm" variant="outline" onClick={() => open(r)}>{r["gradebook_id"] ? "فتح" : "بدء الرصد"}</Button>}</td></tr>; })}</tbody></table></div>
      )}
    </Section>
  );
}

/* ================= One gradebook ================= */
type Sheet = { gradebook: Row; period: Row; plan: Row; items: Row[]; students: Row[]; entries: Row[]; events: Row[]; homework: Row[] };
type Cell = { status: string; score: string };

export function GradebookView({ id, school, onBack }: { id: string; school: string; onBack: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["gb-sheet", id], queryFn: async () => { const { data, error } = await db.rpc("gb_sheet", { _gb: id }); if (error) throw error; return data as Sheet; } });
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [corr, setCorr] = useState<{ student: Row; item: Row } | null>(null);
  const k = (s: string, i: string) => `${s}|${i}`;
  useEffect(() => {
    if (!q.data) return;
    const m: Record<string, Cell> = {};
    for (const e of q.data.entries) m[k(e["student_id"], e["item_id"])] = { status: e["status"], score: e["score"] == null ? "" : String(e["score"]) };
    setCells(m); setDirty(new Set());
  }, [q.data]);
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty.size) e.preventDefault(); };
    window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["gb-sheet", id] }); qc.invalidateQueries({ queryKey: ["gb-overview"] }); qc.invalidateQueries({ queryKey: ["gb-corr"] }); };
  const act = async (name: string, fn: () => Promise<{ error: unknown; data?: unknown }>, ok: string) => {
    setBusy(name); const { error } = await fn(); setBusy("");
    if (error) { toast.error(arabicError(error)); return false; }
    toast.success(ok); refresh(); return true;
  };
  const totals = useMemo(() => new Map((q.data?.students ?? []).map((s) => [s["id"], s["total"]])), [q.data]);
  if (q.isLoading) return <LoadingState />;
  if (q.error || !q.data) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const { gradebook: g, plan, items, students, events, homework, period } = q.data;
  const enter = !!g["can_enter"];
  const locked = ["approved", "published"].includes(g["status"]);
  const setCell = (sid: string, iid: string, c: Partial<Cell>) => { const key = k(sid, iid); setCells((m) => ({ ...m, [key]: { ...(m[key] ?? { status: "missing", score: "" }), ...c } })); setDirty((d) => new Set(d).add(key)); };
  const save = async () => {
    const rows = [...dirty].map((key) => { const [student_id, item_id] = key.split("|"); const c = cells[key]!; return { student_id, item_id, status: c.status, score: c.status === "score" ? c.score : null }; });
    if (rows.some((r) => r.status === "score" && r.score === "")) return void toast.error("أدخل الدرجة أو غيّر الحالة");
    if (await act("save", () => db.rpc("gb_set_entries", { _gb: id, _rows: rows, _source: "manual" }), `حُفظت ${rows.length} خانة`)) setDirty(new Set());
  };
  const template = () => exportXlsx({ title: `قالب رصد — ${g["course_label"]}`, school, filters: [period["name"]], note: "اكتب الدرجة رقمًا، أو «غ» للغائب، أو «م» للمعفى. اترك الخانة فارغة لعدم التغيير. لا تغيّر عمود المعرّف." },
    ["المعرّف", "الطالب", ...items.map((i) => `${i["name"]} (من ${i["max_score"]})`)],
    students.filter((s) => s["active"]).map((s) => [s["id"], s["name"], ...items.map((i) => { const c = cells[k(s["id"], i["id"])]; return c?.status === "score" ? Number(c.score) : c?.status === "absent" ? "غ" : c?.status === "exempt" ? "م" : ""; })]));
  const importFile = async (file: File) => {
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellFormula: false });
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, raw: true, defval: "" });
      const hi = aoa.findIndex((r) => String(r[0]).trim() === "المعرّف");
      if (hi < 0) throw new Error("القالب غير صالح: لم يُعثر على عمود المعرّف");
      const ids = new Set(students.map((s) => s["id"]));
      const rows: Row[] = []; const errs: string[] = [];
      aoa.slice(hi + 1).forEach((r, n) => {
        const sid = String(r[0]).trim(); if (!sid) return;
        if (!ids.has(sid)) return void errs.push(`سطر ${n + 1}: طالب غير ضمن المقرر`);
        items.forEach((it, j) => { try { const c = parseCell(r[j + 2]); if (!c) return;
          if (c.status === "score" && (c.score! < 0 || c.score! > Number(it["max_score"]))) throw new Error(`خارج النطاق 0–${it["max_score"]}`);
          rows.push({ student_id: sid, item_id: it["id"], status: c.status, score: c.score ?? null }); } catch (e) { errs.push(`سطر ${n + 1}، ${it["name"]}: ${(e as Error).message}`); } });
      });
      if (errs.length) return void toast.error(`لم يُستورد شيء. ${errs.length} خطأ: ${errs.slice(0, 3).join(" • ")}`);
      if (!rows.length) return void toast.error("لا توجد قيم للاستيراد");
      if (!(await ask(`استيراد ${rows.length} خانة؟ تُستبدل القيم الحالية لهذه الخانات.`))) return;
      await act("import", () => db.rpc("gb_set_entries", { _gb: id, _rows: rows, _source: "import" }), `استُوردت ${rows.length} خانة`);
    } catch (e) { toast.error(arabicError(e)); }
  };
  const disabledWhy = !enter ? (locked ? "السجل مقفل بعد الاعتماد؛ استخدم طلب التصحيح" : g["status"] === "submitted" || g["status"] === "reviewed" ? "السجل قيد المراجعة/الاعتماد" : !g["is_teacher"] ? "الرصد لمعلم المقرر بتكليف ساري فقط" : "فترة الرصد مغلقة أو خارج مواعيدها") : "";

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={async () => { if (!dirty.size || (await ask("توجد تعديلات غير محفوظة. الخروج دون حفظ؟", { destructive: true }))) onBack(); }}><ArrowRight className="size-4" />كل السجلات</Button>
      <Section title={g["course_label"]} desc={`${period["name"]} • الخطة: ${plan["name"]} (إصدار ${plan["version"]}) • المجموع ${plan["total"]}`} action={<Badge s={g["status"]} />}>
        {g["return_reason"] && <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm" data-testid="return-reason">سبب الإعادة: {g["return_reason"]}{g["reopen_until"] ? ` • مفتوح حتى ${new Date(g["reopen_until"]).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh" })}` : ""}</div>}
        {disabledWhy && <p className="mb-3 text-sm text-muted-foreground" data-testid="entry-disabled">{disabledWhy}</p>}
        <div className="mb-3 flex flex-wrap gap-2">
          {enter && <><Button size="sm" disabled={!dirty.size || !!busy} onClick={save}>{busy === "save" ? "جارٍ الحفظ…" : `حفظ مسودة${dirty.size ? ` (${dirty.size})` : ""}`}</Button>
            <Button size="sm" variant="outline" onClick={template}><FileDown className="size-4" />قالب المقرر</Button>
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"><FileUp className="size-4" />استيراد<input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importFile(f); }} /></label>
            <Button size="sm" variant="outline" disabled={!!busy || dirty.size > 0} title={dirty.size ? "احفظ التعديلات أولًا" : ""} onClick={async () => { if (await ask("إرسال السجل للمراجعة؟ لن تتمكن من التعديل حتى يُعاد.")) act("submit", () => db.rpc("gb_submit", { _gb: id }), "أُرسل للمراجعة"); }}>{busy === "submit" ? "…" : "إرسال للمراجعة"}</Button></>}
          {g["status"] === "submitted" && (g["is_dept"] || (!g["has_dept"] && g["is_admin"])) && <>
            <Button size="sm" disabled={!!busy} onClick={async () => { if (await ask("قبول المراجعة ورفع السجل للاعتماد؟")) act("rev", () => db.rpc("gb_review", { _gb: id, _accept: true, _reason: null }), "قُبلت المراجعة"); }}>قبول المراجعة</Button>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={async () => { const r = await askText("سبب الإعادة للمعلم", { required: true }); if (r) act("rev", () => db.rpc("gb_review", { _gb: id, _accept: false, _reason: r }), "أُعيد للمعلم"); }}>إعادة للمعلم</Button></>}
          {g["is_admin"] && (g["status"] === "reviewed" || (g["status"] === "submitted" && !g["has_dept"])) && <>
            <Button size="sm" disabled={!!busy} onClick={async () => { if (await ask("اعتماد النتائج وقفل الرصد؟")) act("app", () => db.rpc("gb_approve", { _gb: id, _accept: true, _reason: null }), "اعتُمد السجل"); }}>اعتماد وقفل</Button>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={async () => { const r = await askText("سبب الإعادة", { required: true }); if (r) act("app", () => db.rpc("gb_approve", { _gb: id, _accept: false, _reason: r }), "أُعيد للمعلم"); }}>إعادة</Button></>}
          {g["is_admin"] && g["status"] === "approved" && <Button size="sm" disabled={!!busy} onClick={async () => { if (await ask(`نشر النتائج لـ ${students.length} طالب وأسرهم؟`)) act("pub", () => db.rpc("gb_publish", { _gb: id }), "نُشرت النتائج"); }}>{busy === "pub" ? "…" : "نشر للطلاب والأسر"}</Button>}
          {g["is_admin"] && ["submitted", "reviewed", "approved", "published"].includes(g["status"]) && <Button size="sm" variant="ghost" disabled={!!busy} onClick={async () => {
            const r = await askText("سبب إعادة فتح هذا السجل فقط (يُفتح 48 ساعة)", { required: true }); if (r) act("reopen", () => db.rpc("gb_reopen", { _gb: id, _reason: r, _hours: 48 }), "أُعيد فتح السجل"); }}>إعادة فتح السجل</Button>}
          <ExportButtons title={`كشف درجات — ${g["course_label"]}`} school={school} filters={[period["name"], GB_STATUS[g["status"]]!]}
            headers={["الطالب", ...items.map((i) => `${i["name"]} (من ${i["max_score"]}، وزن ${i["weight"]})`), `المجموع من ${plan["total"]}`]}
            rows={() => students.map((s) => [s["name"] + (s["active"] ? "" : " (منقول)"), ...items.map((i) => { const c = cells[k(s["id"], i["id"])]; return c?.status === "score" ? Number(c.score) : ENTRY_STATUS[c?.status ?? "missing"]; }), totals.get(s["id"]) ?? "غير مكتمل"])} />
        </div>
        {enter && homework.length > 0 && items.some((i) => i["source"] === "homework") && <HomeworkLink gb={id} items={items.filter((i) => i["source"] === "homework")} homework={homework} onDone={refresh} />}
        {!students.length ? <EmptyState title="لا يوجد طلاب في هذا المقرر" /> : (
          <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm" data-testid="gb-table"><thead className="bg-muted/50"><tr><th className="px-3 py-2 text-start">الطالب</th>
            {items.map((i) => <th key={i["id"]} className="px-2 py-2 text-start">{i["name"]}<div className="text-xs font-normal text-muted-foreground">من {i["max_score"]} • وزن {i["weight"]}{i["source"] === "homework" ? " • واجبات" : ""}</div></th>)}
            <th className="px-3 text-start">المجموع</th></tr></thead>
            <tbody>{students.map((s) => <tr key={s["id"]} className="border-t" data-testid="gb-student">
              <td className="px-3 py-2">{s["name"]}{!s["active"] && <span className="ms-1 text-xs text-muted-foreground">(منقول — محفوظ تاريخيًا)</span>}</td>
              {items.map((i) => { const key = k(s["id"], i["id"]); const c = cells[key] ?? { status: "missing", score: "" };
                return <td key={i["id"]} className={`px-2 py-1 ${dirty.has(key) ? "bg-warning/10" : ""}`}>
                  {enter && s["active"] ? <div className="flex gap-1">
                    <select aria-label={`حالة ${i["name"]} — ${s["name"]}`} className={selectCls("w-24")} value={c.status} onChange={(e) => setCell(s["id"], i["id"], { status: e.target.value })}>
                      {Object.entries(ENTRY_STATUS).filter(([v]) => v !== "exempt" || plan["exempt_policy"] === "redistribute").map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    {c.status === "score" && <Input aria-label={`درجة ${i["name"]} — ${s["name"]}`} className="w-20" type="number" min={0} max={i["max_score"]} step="0.25" value={c.score} onChange={(e) => setCell(s["id"], i["id"], { score: e.target.value })} />}
                  </div> : <button className="text-start disabled:cursor-default" disabled={!(locked && g["is_teacher"])} onClick={() => setCorr({ student: s, item: i })} title={locked && g["is_teacher"] ? "طلب تصحيح" : ""}>
                    {c.status === "score" ? c.score : <span className="text-muted-foreground">{ENTRY_STATUS[c.status]}</span>}</button>}
                </td>; })}
              <td className="px-3 font-semibold">{totals.get(s["id"]) ?? <span className="text-xs font-normal text-muted-foreground">غير مكتمل</span>}</td>
            </tr>)}</tbody></table></div>
        )}
        {locked && g["is_teacher"] && <p className="mt-2 text-xs text-muted-foreground">السجل مقفل. اضغط على أي خانة لطلب تصحيح بسبب، ويبت فيه مدير المدرسة.</p>}
        {dirty.size > 0 && <p className="mt-2 text-xs text-muted-foreground">المجموع يُحدَّث بعد الحفظ (يحسبه الخادم).</p>}
      </Section>
      {corr && <CorrectionForm gb={id} student={corr.student} item={corr.item} current={cells[k(corr.student["id"], corr.item["id"])]} onClose={() => setCorr(null)} onDone={() => { setCorr(null); refresh(); }} />}
      <Section title="سجل العمليات">
        {!events.length ? <EmptyState title="لا توجد عمليات" /> : <ul className="space-y-1 text-sm">{events.map((e, i) => <li key={i} className="flex flex-wrap gap-2 border-b py-1 last:border-0"><span className="font-medium">{EVENT_LABEL[e["action"]] ?? e["action"]}</span><span className="text-muted-foreground">{e["by"] ?? "—"} • {new Date(e["at"]).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh" })}</span>{e["details"]?.["reason"] && <span>— {e["details"]["reason"]}</span>}</li>)}</ul>}
      </Section>
    </div>
  );
}

function HomeworkLink({ gb, items, homework, onDone }: { gb: string; items: Row[]; homework: Row[]; onDone: () => void }) {
  const [item, setItem] = useState(items[0]?.["id"] ?? ""); const [sel2, setSel] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  return (
    <div className="mb-3 rounded-xl border bg-muted/30 p-3 text-sm">
      <div className="mb-2 font-semibold">ربط درجات الواجبات</div>
      <p className="mb-2 text-xs text-muted-foreground">تُحتسب النسبة المتوسطة للدرجات المنشورة فقط في الواجبات المختارة، وتُحوَّل إلى درجة البند القصوى. من ليس له درجة منشورة يبقى «لم تُرصد».</p>
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="البند" className={selectCls("w-40")} value={item} onChange={(e) => setItem(e.target.value)}>{items.map((i) => <option key={i["id"]} value={i["id"]}>{i["name"]}</option>)}</select>
        {homework.map((h) => <label key={h["id"]} className="flex items-center gap-1 rounded border bg-card px-2 py-1"><input type="checkbox" checked={sel2.includes(h["id"])} onChange={(e) => setSel((s) => e.target.checked ? [...s, h["id"]] : s.filter((x) => x !== h["id"]))} />{h["title"]} <span className="text-xs text-muted-foreground">({h["published"]} منشورة)</span></label>)}
        <Button size="sm" disabled={busy || !sel2.length} onClick={async () => {
          if (!(await ask("سحب درجات الواجبات المختارة إلى البند؟ تُستبدل القيم الحالية للطلاب الذين لهم درجات منشورة."))) return;
          setBusy(true); const { data, error } = await db.rpc("gb_pull_homework", { _gb: gb, _item: item, _homework: sel2 }); setBusy(false);
          if (error) return void toast.error(arabicError(error)); toast.success(`رُبطت درجات ${data} طالب`); onDone();
        }}>{busy ? "…" : "ربط"}</Button>
      </div>
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

/* ================= Corrections ================= */
export function CorrectionsTab({ S, school, period, admin }: { S: string; school: string; period: Row | undefined; admin: boolean }) {
  const qc = useQueryClient(); const [busy, setBusy] = useState("");
  const q = useQuery({ queryKey: ["gb-corr", S, period?.["id"]], enabled: !!period, queryFn: async () => { const { data, error } = await db.rpc("gb_corrections_report", { _school: S, _period: period!["id"] }); if (error) throw error; return data as Row[]; } });
  const decide = async (r: Row, ok: boolean) => {
    const note = ok ? ((await ask("اعتماد التصحيح؟ يُعاد الحساب، وإن كانت النتيجة منشورة يُنشر إصدار جديد ويُبلَّغ الطالب وأسرته.")) ? "" : null) : await askText("سبب الرفض", { required: true });
    if (note === null) return;
    setBusy(r["id"]); const { error } = await db.rpc("gb_decide_correction", { _id: r["id"], _approve: ok, _note: note }); setBusy("");
    if (error) return void toast.error(arabicError(error)); toast.success(ok ? "اعتُمد التصحيح" : "رُفض الطلب");
    qc.invalidateQueries({ queryKey: ["gb-corr"] }); qc.invalidateQueries({ queryKey: ["gb-overview"] });
  };
  const v = (s: string, n: unknown) => (s === "score" ? String(n) : ENTRY_STATUS[s] ?? s);
  const cols = ["المقرر", "الطالب", "البند", "الحالي", "المقترح", "السبب", "الدليل", "الحالة", "مقدم الطلب", "تاريخ الطلب", "البات", "ملاحظة القرار"];
  if (!period) return <EmptyState title="لا توجد فترة رصد" />;
  return (
    <Section title="طلبات تصحيح النتائج" desc="لا يعدّل المعلم نتيجة مقفلة مباشرة. القرار لمدير المدرسة، ويُحفظ القديم والجديد والفاعل والسبب.">
      <div className="mb-3"><ExportButtons title={`تعديلات النتائج — ${period["name"]}`} school={school} headers={cols} rows={() => (q.data ?? []).map((r) => [r["course_label"], r["student_name"], r["item_name"], v(r["old_status"], r["old_score"]), v(r["new_status"], r["new_score"]), r["reason"], r["evidence"] ?? "", CORR_STATUS[r["status"]], r["requested_by"] ?? "", r["requested_at"]?.slice(0, 16), r["decided_by"] ?? "", r["decision_note"] ?? ""])} /></div>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : !q.data?.length ? <EmptyState title="لا توجد طلبات تصحيح" /> : (
        <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm"><thead className="bg-muted/50"><tr>{["المقرر", "الطالب", "البند", "الحالي ← المقترح", "السبب", "الحالة", ""].map((h) => <th key={h} className="px-3 py-2 text-start">{h}</th>)}</tr></thead>
          <tbody>{q.data.map((r) => <tr key={r["id"]} className="border-t" data-testid="corr-row"><td className="px-3 py-2">{r["course_label"]}</td><td className="px-3">{r["student_name"]}</td><td className="px-3">{r["item_name"]}</td>
            <td className="px-3">{v(r["old_status"], r["old_score"])} ← <b>{v(r["new_status"], r["new_score"])}</b></td><td className="px-3">{r["reason"]}{r["evidence"] ? <div className="text-xs text-muted-foreground">{r["evidence"]}</div> : null}</td>
            <td className="px-3">{CORR_STATUS[r["status"]]}{r["decision_note"] ? <div className="text-xs text-muted-foreground">{r["decision_note"]}</div> : null}</td>
            <td className="px-3">{admin && r["status"] === "pending" && <div className="flex gap-1"><Button size="sm" disabled={busy === r["id"]} onClick={() => decide(r, true)}>اعتماد</Button><Button size="sm" variant="outline" disabled={busy === r["id"]} onClick={() => decide(r, false)}>رفض</Button></div>}</td></tr>)}</tbody></table></div>
      )}
    </Section>
  );
}

/* ================= Organization owner: branch summary ================= */
export function OrgSummary({ org, name }: { org: string; name: string }) {
  const q = useQuery({ queryKey: ["gb-org", org], queryFn: async () => { const { data, error } = await db.rpc("gb_org_summary", { _org: org }); if (error) throw error; return data as Row[]; } });
  const cols = [["school_name", "الفرع"], ["gradebooks", "السجلات"], ["draft", "مسودة/معاد"], ["submitted", "بانتظار المراجعة"], ["reviewed", "بانتظار الاعتماد"], ["approved", "معتمد"], ["published", "منشور"], ["pending_corrections", "تصحيحات معلقة"]] as const;
  return (
    <Section title="متابعة الفروع" desc="لمالك المؤسسة: حالة الرصد في الفروع دون درجات الطلاب الفردية، ودون صلاحية تعديل.">
      <div className="mb-3">{q.data && <ExportButtons title="متابعة رصد الفروع" school={name} headers={cols.map(([, l]) => l)} rows={() => (q.data ?? []).map((r) => cols.map(([c]) => r[c] ?? 0))} />}</div>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : !q.data?.length ? <EmptyState title="لا توجد بيانات" /> : (
        <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm"><thead className="bg-muted/50"><tr>{cols.map(([c, l]) => <th key={c} className="px-3 py-2 text-start">{l}</th>)}</tr></thead>
          <tbody>{q.data.map((r) => <tr key={r["school_id"]} className="border-t">{cols.map(([c]) => <td key={c} className="px-3 py-2">{r[c] ?? 0}</td>)}</tr>)}</tbody></table></div>
      )}
    </Section>
  );
}
