// Guardians + child relationships: Excel template → column mapping → server dry-run preview per row → row-by-row import.
// The server (import_guardian_row) decides create / link / exists / conflict; imported links stay unverified until approved.
import { useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Users } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { arabicError } from "@/lib/session";
import { checkGuardianRows, FIELDS, parseWorkbook, templateBook, type RawRow } from "@/lib/people-import";

type Outcome = { action: "create" | "link" | "exists" | "conflict" | "error" | "skipped"; reason: string };
type Line = { row: RawRow; payload: Record<string, string>; preview: Outcome; result?: Outcome };
const LABEL: Record<Outcome["action"], string> = { create: "إنشاء", link: "ربط بقائم", exists: "مربوط مسبقًا", conflict: "تعارض", error: "خطأ", skipped: "متخطى" };
const TONE: Record<Outcome["action"], string> = { create: "text-primary", link: "text-primary", exists: "text-muted-foreground", conflict: "text-destructive", error: "text-destructive", skipped: "text-muted-foreground" };
const fields = FIELDS.guardians;

async function counts(schoolId: string) {
  const [g, l] = await Promise.all([
    db.from("guardians").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
    db.from("student_guardians").select("id", { count: "exact", head: true }).eq("school_id", schoolId),
  ]);
  return { guardians: g.count ?? 0, links: l.count ?? 0 };
}

async function runRows(schoolId: string, lines: Line[], dry: boolean, set: (i: number, o: Outcome) => void) {
  // sequential when writing so a guardian created on one row is reused by the next row of the same person
  const step = dry ? 10 : 1;
  for (let i = 0; i < lines.length; i += step) {
    await Promise.all(lines.slice(i, i + step).map(async (ln, k) => {
      const { data, error } = await db.rpc("import_guardian_row", { _school: schoolId, _row: ln.payload, _dry: dry });
      set(i + k, error ? { action: "error", reason: arabicError(error) } : (data as Outcome));
    }));
  }
}

export function GuardianImport({ schoolId }: { schoolId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [buf, setBuf] = useState<ArrayBuffer | null>(null);
  const [map, setMap] = useState<Record<string, number> | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [before, setBefore] = useState<{ guardians: number; links: number } | null>(null);
  const [after, setAfter] = useState<{ guardians: number; links: number } | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const reset = () => { setBuf(null); setMap(null); setHeaders([]); setLines(null); setBefore(null); setAfter(null); setDone(false); };

  async function preview(rows: RawRow[]) {
    const { data: sc } = await db.from("schools").select("name").eq("id", schoolId).single();
    const checks = checkGuardianRows(rows, String(sc?.["name"] ?? ""));
    const next: Line[] = rows.map((row, i) => ({ row, payload: checks[i]!.payload, preview: checks[i]!.errors.length ? { action: "error", reason: checks[i]!.errors.join("، ") } : { action: "skipped", reason: "…" } }));
    const todo = next.map((l, i) => [l, i] as const).filter(([l]) => l.preview.action !== "error");
    await runRows(schoolId, todo.map(([l]) => l), true, (k, o) => { next[todo[k]![1]]!.preview = o; });
    setLines([...next]); setBefore(await counts(schoolId)); setDone(false); setAfter(null);
  }
  async function onFile(f: File, override?: Record<string, number>) {
    setBusy(true);
    try {
      if (f.size > 5 * 1024 * 1024) throw new Error("الملف أكبر من 5 ميجابايت");
      const b = await f.arrayBuffer(); setBuf(b);
      const p = parseWorkbook(b, "guardians", override);
      if (p.problems.length) throw new Error(p.problems.join("؛ "));
      if (!p.rows.length) throw new Error("لم يُعثر على صفوف بيانات تحت العناوين");
      if (p.rows.length > 2000) throw new Error("الحد الأقصى 2000 صف في الدفعة");
      setMap(p.mapping); setHeaders(p.headers);
      await preview(p.rows);
    } catch (e) { toast.error(arabicError(e)); reset(); } finally { setBusy(false); }
  }
  async function remap(key: string, col: string) {
    if (!buf || !map) return;
    const next = { ...map }; if (col === "") delete next[key]; else next[key] = Number(col);
    setBusy(true);
    try { const p = parseWorkbook(buf, "guardians", next); setMap(next); await preview(p.rows); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  async function write(onlyFailed = false) {
    if (!lines) return;
    setBusy(true);
    const next = lines.map((l) => ({ ...l }));
    const pick = next.map((l, i) => [l, i] as const).filter(([l]) => onlyFailed ? l.result?.action === "error" : ["create", "link"].includes(l.preview.action));
    if (!onlyFailed) for (const l of next) if (!["create", "link"].includes(l.preview.action)) l.result = l.preview.action === "exists" ? { action: "skipped", reason: l.preview.reason } : l.preview;
    try {
      await runRows(schoolId, pick.map(([l]) => l), false, (k, o) => { next[pick[k]![1]]!.result = o; });
      setLines(next); setDone(true); setAfter(await counts(schoolId)); qc.invalidateQueries();
      toast.success("اكتمل الاستيراد — راجع التقرير");
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  function report() {
    if (!lines) return;
    const head = ["الورقة · السطر", "ولي الأمر", "هوية ولي الأمر", "هوية الابن", "C‑Smart", "المعاينة", "النتيجة", "السبب"];
    const body = lines.map((l) => { const o = l.result ?? l.preview; return [`${l.row.sheet} · ${l.row.line}`, l.payload["full_name"], l.payload["national_id"], l.payload["student_nid"], l.payload["student_csmart"], LABEL[l.preview.action], l.result ? LABEL[l.result.action] : "—", o.reason]; });
    const ws = XLSX.utils.aoa_to_sheet([head, ...body]);
    // keep IDs as text in the report too (leading zeros)
    for (let r = 1; r <= body.length; r++) for (const c of [2, 3, 4]) { const a = XLSX.utils.encode_cell({ r, c }); if (ws[a]) { ws[a].t = "s"; ws[a].z = "@"; } }
    const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, "النتائج"); XLSX.writeFile(wb, "نتائج-أولياء-الأمور.xlsx");
  }

  const tally = (k: "preview" | "result") => {
    const t: Record<string, number> = {};
    for (const l of lines ?? []) { const o = k === "preview" ? l.preview : l.result; if (o) t[o.action] = (t[o.action] ?? 0) + 1; }
    return t;
  };
  const pv = tally("preview"), rs = tally("result");
  const ready = (pv["create"] ?? 0) + (pv["link"] ?? 0);
  const colName = (c: number) => `${XLSX.utils.encode_col(c)}${headers[c] ? ` — ${headers[c]}` : ""}`;
  const cols = Math.max(0, ...headers.map((_, i) => i)) + 1;

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { reset(); setOpen(true); }}><Users className="size-4" /> استيراد أولياء الأمور والعلاقات</Button>
      <Dialog open={open} onOpenChange={(o) => { if (!busy && !o) setOpen(false); }}>
        <DialogContent dir="rtl" className="max-h-[92dvh] max-w-5xl overflow-y-auto">
          <DialogHeader><DialogTitle>استيراد أولياء الأمور وعلاقات الأبناء</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">صف لكل علاقة: كرّر بيانات ولي الأمر في أكثر من صف لربطه بعدة أبناء، ويُعاد استخدام سجله برقم هويته. الابن يُحدَّد بهويته أو رقمه في C‑Smart ويجب أن يكون مستوردًا مسبقًا. كل علاقة جديدة تبقى «بانتظار التوثيق» حتى يعتمدها مدير الطلاب، ولا يرى ولي الأمر بيانات الابن قبل ذلك.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => XLSX.writeFile(templateBook("guardians"), "قالب-أولياء-الأمور-والعلاقات.xlsx")}>تنزيل القالب الفارغ</Button>
            <label className="inline-flex cursor-pointer items-center rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted">
              اختيار ملف .xlsx
              <input type="file" accept=".xlsx,.xls" className="sr-only" aria-label="ملف استيراد أولياء الأمور" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onFile(f); }} />
            </label>
            {lines && <Button variant="outline" size="sm" onClick={report}>تنزيل تقرير النتائج</Button>}
          </div>
          {busy && <p className="text-sm">جارٍ المعالجة…</p>}
          {map && lines && (
            <div className="space-y-3">
              <details open={!done} className="rounded-lg border p-2">
                <summary className="cursor-pointer text-sm font-medium">ربط الأعمدة — عدّل إن لزم</summary>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {fields.map((f) => (
                    <label key={f.key} className="space-y-1 text-xs">
                      <span>{f.label}{f.required ? " *" : ""}</span>
                      <select className={selectCls()} value={map[f.key] ?? ""} disabled={busy || done} onChange={(e) => void remap(f.key, e.target.value)}>
                        <option value="">— بدون —</option>
                        {Array.from({ length: cols }, (_, c) => <option key={c} value={c}>{colName(c)}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              </details>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="rounded-lg border p-2">
                  <p className="font-medium">المعاينة ({lines.length} صف)</p>
                  <p>إنشاء: {pv["create"] ?? 0} · ربط بقائم: {pv["link"] ?? 0} · مربوط مسبقًا: {pv["exists"] ?? 0} · تعارض: {pv["conflict"] ?? 0} · خطأ: {pv["error"] ?? 0}</p>
                  {before && <p className="text-xs text-muted-foreground">قبل: {before.guardians} ولي أمر · {before.links} علاقة</p>}
                </div>
                {done && (
                  <div className="rounded-lg border p-2">
                    <p className="font-medium">النتيجة</p>
                    <p>منشأ: {rs["create"] ?? 0} · مربوط: {rs["link"] ?? 0} · مرفوض: {(rs["conflict"] ?? 0) + (rs["error"] ?? 0)} · متخطى: {rs["skipped"] ?? 0}</p>
                    {after && <p className="text-xs text-muted-foreground">بعد: {after.guardians} ولي أمر · {after.links} علاقة</p>}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {!done && <Button disabled={busy || !ready} onClick={() => void write()}>استيراد {ready} صف صالح</Button>}
                {done && (rs["error"] ?? 0) > 0 && <Button variant="outline" disabled={busy} onClick={() => void write(true)}>إعادة محاولة الصفوف المتعثرة</Button>}
              </div>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-muted"><tr>{["السطر", "ولي الأمر", "الهوية", "الجوال", "الابن (هوية / C‑Smart)", "المعاينة", done ? "النتيجة" : "", "السبب"].map((h, i) => <th key={i} className="p-1.5 text-start">{h}</th>)}</tr></thead>
                  <tbody>
                    {lines.map((l, i) => { const o = l.result ?? l.preview; return (
                      <tr key={i} className="border-t">
                        <td className="p-1.5">{l.row.sheet} · {l.row.line}</td>
                        <td className="p-1.5">{l.payload["full_name"]}</td>
                        <td className="p-1.5" dir="ltr">{l.payload["national_id"]}</td>
                        <td className="p-1.5" dir="ltr">{l.payload["phone"]}</td>
                        <td className="p-1.5" dir="ltr">{l.payload["student_nid"] || "—"} / {l.payload["student_csmart"] || "—"}</td>
                        <td className={`p-1.5 ${TONE[l.preview.action]}`}>{LABEL[l.preview.action]}</td>
                        <td className={`p-1.5 ${l.result ? TONE[l.result.action] : ""}`}>{l.result ? LABEL[l.result.action] : ""}</td>
                        <td className="p-1.5">{o.reason}</td>
                      </tr>
                    ); })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
