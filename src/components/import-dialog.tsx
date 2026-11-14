// Excel template import (students / teachers): download template → upload → validate → preview → import → per-row results.
// Writes go through the RLS-bound client row by row, so permissions, school scope and section capacity stay server-enforced.
import { useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { FileUp } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { arabicError } from "@/lib/session";

export type ImportKind = "students" | "teachers";
type Col = { h: string; key: string; required?: boolean; hint: string };
const SPEC: Record<ImportKind, { title: string; cols: Col[]; sample: string[] }> = {
  students: {
    title: "الطلاب",
    cols: [
      { h: "الاسم الكامل", key: "full_name", required: true, hint: "مطلوب" },
      { h: "رقم الهوية", key: "national_id", hint: "اختياري، فريد" },
      { h: "تاريخ الميلاد", key: "birth_date", hint: "YYYY-MM-DD" },
      { h: "الجنس", key: "gender", hint: "ذكر / أنثى" },
      { h: "البريد", key: "email", hint: "اختياري" },
      { h: "الشعبة", key: "section", hint: "اسم الصف/اسم الشعبة مثل الأول/أ (اختياري)" },
    ],
    sample: ["محمد أحمد العتيبي", "1100000001", "2012-05-14", "ذكر", "", "الأول/أ"],
  },
  teachers: {
    title: "المعلمون",
    cols: [
      { h: "الاسم الكامل", key: "full_name", required: true, hint: "مطلوب" },
      { h: "البريد", key: "email", hint: "لدعوته لاحقًا، فريد" },
      { h: "الجوال", key: "phone", hint: "اختياري" },
      { h: "التخصص", key: "specialization", hint: "اختياري" },
      { h: "القسم", key: "department", hint: "اسم قسم موجود (اختياري)" },
    ],
    sample: ["أ. سارة الحربي", "sara@example.com", "0500000000", "رياضيات", "الرياضيات"],
  },
};

export function downloadTemplate(kind: ImportKind) {
  const s = SPEC[kind];
  const ws = XLSX.utils.aoa_to_sheet([s.cols.map((c) => c.h), s.sample]);
  // text format on the data area (rows 2–1001) so IDs/phones keep leading zeros when typed in Excel
  for (let r = 1; r <= 1000; r++) s.cols.forEach((_, c) => { const a = XLSX.utils.encode_cell({ r, c }); ws[a] = ws[a] ?? { t: "s", v: "" }; ws[a].z = "@"; });
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 1000, c: s.cols.length - 1 } });
  ws["!cols"] = s.cols.map(() => ({ wch: 24 }));
  const help = XLSX.utils.aoa_to_sheet([["العمود", "الوصف"], ...s.cols.map((c) => [c.h, c.hint])]);
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  XLSX.utils.book_append_sheet(wb, ws, "البيانات");
  XLSX.utils.book_append_sheet(wb, help, "تعليمات");
  XLSX.writeFile(wb, `قالب-${s.title}.xlsx`);
}

/** Reads the first sheet without evaluating anything. Formula cells inside the data range are reported (row/column)
 *  and must be replaced by fixed values — a cached formula result is never trusted silently. */
export function readSheet(buf: ArrayBuffer): { rows: Row[]; formulas: string[] } {
  const wb = XLSX.read(buf, { type: "array", cellFormula: true, sheetStubs: true, cellHTML: false, cellDates: false, bookVBA: false });
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  const formulas: string[] = [];
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  const head = Array.from({ length: range.e.c + 1 }, (_, c) => String(ws[XLSX.utils.encode_cell({ r: 0, c })]?.v ?? ""));
  for (let r = 1; r <= range.e.r; r++) for (let c = 0; c <= range.e.c; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c })];
    if (cell?.f) formulas.push(`السطر ${r + 1}، عمود «${head[c] || XLSX.utils.encode_col(c)}»`);
  }
  // w = displayed text: keeps leading zeros of text cells; numbers come as typed
  const rows = XLSX.utils.sheet_to_json<Row>(ws, { defval: "", raw: false, dateNF: "yyyy-mm-dd" })
    .filter((r) => Object.values(r).some((v) => String(v ?? "").trim() !== "")); // template's pre-formatted empty rows
  return { rows, formulas };
}

export type Checked = { line: number; data: Row; errors: string[]; section_id?: string | null; department_id?: string | null };

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** Pure validation (unit-tested): required, formats, duplicates inside the file and against existing keys. */
export function validateRows(kind: ImportKind, raw: Row[], existing: { ids: Set<string>; emails: Set<string> }, lookups: { sections: Map<string, string>; departments: Map<string, string> }): Checked[] {
  const seenId = new Set<string>(), seenEmail = new Set<string>();
  return raw.map((r, i) => {
    const d: Row = {};
    for (const c of SPEC[kind].cols) d[c.key] = String(r[c.h] ?? "").trim();
    const e: string[] = [];
    if (!d["full_name"]) e.push("الاسم مطلوب");
    const email = (d["email"] as string).toLowerCase();
    if (email && !isEmail(email)) e.push("بريد غير صالح");
    if (email && (seenEmail.has(email) || existing.emails.has(email))) e.push("البريد مكرر");
    if (email) seenEmail.add(email);
    const out: Checked = { line: i + 2, data: d, errors: e };
    if (kind === "students") {
      const nid = d["national_id"] as string;
      if (nid && (seenId.has(nid) || existing.ids.has(nid))) e.push("رقم الهوية مكرر");
      if (nid) seenId.add(nid);
      if (d["birth_date"] && !isDate(d["birth_date"])) e.push("تاريخ الميلاد بصيغة YYYY-MM-DD");
      if (d["gender"] && !["ذكر", "أنثى"].includes(d["gender"])) e.push("الجنس: ذكر أو أنثى");
      if (d["section"]) { out.section_id = lookups.sections.get(String(d["section"]).replace(/\s*\/\s*/, "/")) ?? null; if (!out.section_id) e.push("الشعبة غير موجودة في السنة الحالية"); }
    } else if (d["department"]) {
      out.department_id = lookups.departments.get(d["department"]) ?? null;
      if (!out.department_id) e.push("القسم غير موجود");
    }
    return out;
  });
}

type Result = { line: number; name: string; ok: boolean; msg: string };

export function ImportButton({ kind, schoolId }: { kind: ImportKind; schoolId: string }) {
  const qc = useQueryClient();
  const s = SPEC[kind];
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Checked[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const reset = () => { setRows(null); setResults(null); };

  async function onFile(f: File) {
    reset(); setBusy(true);
    try {
      if (f.size > 2 * 1024 * 1024) throw new Error("الملف أكبر من 2 ميجابايت");
      const { rows: raw, formulas } = readSheet(await f.arrayBuffer());
      if (formulas.length) throw new Error(`الملف يحتوي صيغًا؛ استبدلها بقيم ثابتة ثم أعد الرفع: ${formulas.slice(0, 5).join(" · ")}${formulas.length > 5 ? ` (+${formulas.length - 5})` : ""}`);
      const missing = s.cols.filter((c) => c.required && !(raw[0] && c.h in raw[0])).map((c) => c.h);
      if (!raw.length) throw new Error("الملف لا يحتوي صفوف بيانات");
      if (missing.length) throw new Error(`أعمدة مطلوبة مفقودة: ${missing.join("، ")} — استخدم القالب`);
      if (raw.length > 1000) throw new Error("الحد الأقصى 1000 صف في الدفعة");
      const [ex, secs, deps] = await Promise.all([
        db.from(kind).select(kind === "students" ? "national_id, email" : "email").eq("school_id", schoolId),
        kind === "students" ? db.from("sections").select("id, name, grades(name), academic_years!inner(is_current)").eq("school_id", schoolId).eq("academic_years.is_current", true) : { data: [] },
        kind === "teachers" ? db.from("departments").select("id, name").eq("school_id", schoolId) : { data: [] },
      ]);
      if (ex.error) throw ex.error;
      const existing = { ids: new Set<string>(((ex.data ?? []) as Row[]).map((x) => x["national_id"]).filter(Boolean)), emails: new Set<string>(((ex.data ?? []) as Row[]).map((x) => String(x["email"] ?? "").toLowerCase()).filter(Boolean)) };
      const sections = new Map<string, string>(((secs.data ?? []) as Row[]).map((x) => [`${x["grades"]?.["name"]}/${x["name"]}`, x["id"]]));
      const departments = new Map<string, string>(((deps.data ?? []) as Row[]).map((x) => [x["name"], x["id"]]));
      setRows(validateRows(kind, raw, existing, { sections, departments }));
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }

  async function run() {
    if (!rows) return;
    setBusy(true);
    const out: Result[] = [];
    for (const r of rows) {
      const name = String(r.data["full_name"] ?? "");
      if (r.errors.length) { out.push({ line: r.line, name, ok: false, msg: `لم يُستورد: ${r.errors.join("، ")}` }); continue; }
      const d = r.data;
      const payload: Row = kind === "students"
        ? { school_id: schoolId, full_name: d["full_name"], national_id: d["national_id"] || null, birth_date: d["birth_date"] || null, gender: d["gender"] === "ذكر" ? "male" : d["gender"] === "أنثى" ? "female" : null, email: (d["email"] as string).toLowerCase() || null, status: "active" }
        : { school_id: schoolId, full_name: d["full_name"], email: (d["email"] as string).toLowerCase() || null, phone: d["phone"] || null, specialization: d["specialization"] || null, department_id: r.department_id ?? null, status: "active" };
      const ins = await db.from(kind).insert(payload).select("id").single();
      if (ins.error) { out.push({ line: r.line, name, ok: false, msg: arabicError(ins.error) }); continue; }
      if (kind === "students" && r.section_id) {
        const { data: sec } = await db.from("sections").select("year_id").eq("id", r.section_id).single();
        const en = await db.from("enrollments").insert({ student_id: ins.data.id, section_id: r.section_id, year_id: sec?.year_id, school_id: schoolId });
        out.push({ line: r.line, name, ok: true, msg: en.error ? `أُضيف دون تسكين: ${arabicError(en.error)}` : "أُضيف وسُكّن" });
      } else out.push({ line: r.line, name, ok: true, msg: "أُضيف" });
    }
    setResults(out); setBusy(false);
    qc.invalidateQueries();
    toast.success(`اكتمل الاستيراد: ${out.filter((x) => x.ok).length} ناجح، ${out.filter((x) => !x.ok).length} مرفوض`);
  }

  function downloadReport() {
    if (!results) return;
    const ws = XLSX.utils.aoa_to_sheet([["السطر", "الاسم", "النتيجة", "التفاصيل"], ...results.map((r) => [r.line, r.name, r.ok ? "ناجح" : "مرفوض", r.msg])]);
    const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, "النتائج");
    XLSX.writeFile(wb, `نتائج-استيراد-${s.title}.xlsx`);
  }

  const valid = rows?.filter((r) => !r.errors.length).length ?? 0;
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { reset(); setOpen(true); }}><FileUp className="size-4" /> استيراد</Button>
      <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
        <DialogContent dir="rtl" className="max-h-[90dvh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>استيراد {s.title} من Excel</DialogTitle></DialogHeader>
          <ol className="list-decimal space-y-1 ps-5 text-sm text-muted-foreground">
            <li>نزّل القالب واملأه دون تغيير عناوين الأعمدة.</li>
            <li>ارفع الملف لمراجعة الصفوف قبل الحفظ؛ الصفوف ذات الأخطاء لا تُستورد.</li>
            <li>{kind === "teachers" ? "إضافة ملف المعلم لا تنشئ حسابًا أو دورًا؛ الدعوة للدخول يرسلها مالك المؤسسة." : "التسكين يخضع لسعة الشعبة؛ تُرفض الزيادة ويُضاف الطالب دون تسكين."}</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadTemplate(kind)}>تنزيل القالب</Button>
            <label className="inline-flex cursor-pointer items-center rounded-md border bg-background px-3 py-1.5 text-sm hover:bg-muted">
              اختيار ملف .xlsx
              <input type="file" accept=".xlsx,.xls" className="sr-only" aria-label="ملف الاستيراد" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onFile(f); }} />
            </label>
          </div>
          {busy && <p className="text-sm">جارٍ المعالجة…</p>}
          {rows && !results && (
            <div className="space-y-2">
              <p className="text-sm">المعاينة: <b>{rows.length}</b> صف — <span className="text-primary">{valid} صالح</span> · <span className="text-destructive">{rows.length - valid} به أخطاء</span></p>
              <div className="max-h-72 overflow-auto rounded-lg border">
                <table className="w-full text-xs"><thead className="sticky top-0 bg-muted"><tr><th className="p-1.5 text-start">السطر</th>{s.cols.map((c) => <th key={c.key} className="p-1.5 text-start">{c.h}</th>)}<th className="p-1.5 text-start">الحالة</th></tr></thead>
                  <tbody>{rows.map((r) => (
                    <tr key={r.line} className={`border-t ${r.errors.length ? "bg-destructive/5" : ""}`}>
                      <td className="p-1.5">{r.line}</td>{s.cols.map((c) => <td key={c.key} className="p-1.5">{String(r.data[c.key] ?? "")}</td>)}
                      <td className="p-1.5">{r.errors.length ? <span className="text-destructive">{r.errors.join("، ")}</span> : "صالح"}</td>
                    </tr>))}</tbody></table>
              </div>
              <Button disabled={busy || !valid} onClick={run}>استيراد {valid} صف صالح</Button>
            </div>
          )}
          {results && (
            <div className="space-y-2">
              <p className="text-sm">النتيجة: <span className="text-primary">{results.filter((r) => r.ok).length} ناجح</span> · <span className="text-destructive">{results.filter((r) => !r.ok).length} مرفوض</span></p>
              <ul className="max-h-60 space-y-1 overflow-auto text-xs">{results.map((r) => <li key={r.line} className={r.ok ? "" : "text-destructive"}>السطر {r.line} — {r.name}: {r.msg}</li>)}</ul>
              <div className="flex gap-2"><Button variant="outline" size="sm" onClick={downloadReport}>تنزيل تقرير النتائج</Button><Button size="sm" onClick={reset}>دفعة جديدة</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
