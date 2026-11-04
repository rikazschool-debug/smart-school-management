import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";
import { rpc, type HrEmp, type HrMe } from "@/components/hr/shared";

// HR employee import: template → column map → per-row preview with errors → row-by-row save
// through hr_employee_save (same server checks as the form; no bulk privileged path).
type F = { key: string; label: string; required?: boolean; sensitive?: boolean; syn: string[] };
const FIELDS: F[] = [
  { key: "full_name", label: "الاسم الكامل", required: true, syn: ["الاسم", "اسم الموظف", "name", "full name"] },
  { key: "school", label: "المدرسة", required: true, syn: ["الفرع", "school"] },
  { key: "employee_no", label: "الرقم الوظيفي", syn: ["رقم الموظف", "employee no"] },
  { key: "job_title", label: "المسمى الوظيفي", syn: ["الوظيفة", "job"] },
  { key: "department", label: "القسم", syn: ["department"] },
  { key: "hire_date", label: "تاريخ التعيين", syn: ["تاريخ المباشرة", "hire date"] },
  { key: "phone", label: "الجوال", syn: ["رقم الجوال", "الهاتف", "phone"] },
  { key: "email", label: "البريد", syn: ["البريد الإلكتروني", "email"] },
  { key: "gender", label: "الجنس", syn: ["gender"] },
  { key: "national_id", label: "رقم الهوية", sensitive: true, syn: ["الهوية", "السجل المدني", "id"] },
  { key: "nationality", label: "الجنسية", sensitive: true, syn: ["nationality"] },
  { key: "birth_date", label: "تاريخ الميلاد", sensitive: true, syn: ["الميلاد", "birth date"] },
];
const n = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, " ").replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").toLowerCase();
const digits = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\s/g, "");
function toDate(v: unknown): string | null {
  if (v == null || v === "") return "";
  if (typeof v === "number") { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : null; }
  const s = digits(String(v)).replace(/\//g, "-");
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/); if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return null;
}
type Row = { i: number; p: Record<string, string>; errs: string[]; state: "new" | "dup" | "bad" | "ok" | "fail"; msg?: string | undefined };

export function HrImport({ org, m, existing, onClose, onDone }: { org: string; m: HrMe; existing: HrEmp[]; onClose: () => void; onDone: () => void }) {
  const [raw, setRaw] = useState<{ name: string; head: string[]; data: unknown[][] } | null>(null);
  const [map, setMap] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false), [res, setRes] = useState<Row[] | null>(null);
  const schools = m.schools.filter((s) => s.create || m.caps.create);
  const sens = m.caps.sensitive;
  const fields = FIELDS.filter((f) => !f.sensitive || sens);

  const template = () => {
    const ws = XLSX.utils.aoa_to_sheet([fields.map((f) => f.label), fields.map((f) => f.key === "school" ? schools[0]?.name ?? "" : f.key === "hire_date" ? "2026-09-01" : f.key === "gender" ? "ذكر" : "")]);
    ws["!cols"] = fields.map(() => ({ wch: 20 })); const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
    XLSX.utils.book_append_sheet(wb, ws, "الموظفون"); XLSX.writeFile(wb, "قالب-استيراد-الموظفين.xlsx");
  };
  const load = async (file: File) => {
    const wb = XLSX.read(await file.arrayBuffer());
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, raw: true, defval: "" });
    const head = (aoa[0] ?? []).map((h) => String(h).trim());
    const data = aoa.slice(1).filter((r) => r.some((c) => String(c).trim() !== ""));
    const mp: Record<string, number> = {};
    for (const f of fields) { const k = head.findIndex((h) => [f.label, ...f.syn].map(n).includes(n(h))); if (k >= 0) mp[f.key] = k; }
    setRaw({ name: file.name, head, data }); setMap(mp); setRes(null);
  };

  const rows = useMemo<Row[]>(() => {
    if (!raw) return [];
    const exNo = new Set(existing.map((e) => n(e.employee_no)));
    const exId = new Set(existing.filter((e) => e.sensitive && e.national_id).map((e) => e.national_id!));
    const seenNo = new Set<string>(), seenId = new Set<string>();
    return raw.data.map((r, i) => {
      const g = (k: string) => (map[k] == null ? "" : r[map[k]!]);
      const p: Record<string, string> = {}, errs: string[] = [];
      for (const f of fields) if (!["school", "hire_date", "birth_date", "gender"].includes(f.key)) p[f.key] = String(g(f.key) ?? "").trim();
      if (!p["full_name"]) errs.push("الاسم مطلوب");
      const sn = n(g("school")); const sc = schools.find((s) => n(s.name) === sn);
      if (!sn) errs.push("المدرسة مطلوبة"); else if (!sc) errs.push("مدرسة غير معروفة أو غير مصرح بها"); else p["school_id"] = sc.id;
      for (const k of ["hire_date", "birth_date"]) { if (map[k] == null) continue; const d = toDate(g(k)); if (d === null) errs.push(`${FIELDS.find((f) => f.key === k)!.label} غير صحيح`); else p[k] = d; }
      const gv = n(g("gender")); p["gender"] = ["ذكر", "male", "m"].map(n).includes(gv) ? "male" : ["انثى", "female", "f"].map(n).includes(gv) ? "female" : "";
      if (gv && !p["gender"]) errs.push("الجنس: ذكر أو أنثى");
      if (p["national_id"]) { p["national_id"] = digits(p["national_id"]); if (!/^\d{5,20}$/.test(p["national_id"])) errs.push("رقم الهوية أرقام فقط (5–20)"); }
      if (p["phone"]) p["phone"] = digits(p["phone"]);
      if (p["email"] && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p["email"])) errs.push("بريد غير صحيح");
      let dup = "";
      if (p["employee_no"]) { const k = n(p["employee_no"]); if (exNo.has(k)) dup = "الرقم الوظيفي موجود مسبقًا"; else if (seenNo.has(k)) errs.push("الرقم الوظيفي مكرر في الملف"); seenNo.add(k); }
      if (p["national_id"]) { if (exId.has(p["national_id"])) dup = "رقم الهوية مسجل لموظف في المؤسسة"; else if (seenId.has(p["national_id"])) errs.push("رقم الهوية مكرر في الملف"); seenId.add(p["national_id"]); }
      return { i: i + 2, p, errs, state: errs.length ? "bad" : dup ? "dup" : "new", msg: dup || undefined };
    });
  }, [raw, map, existing]); // eslint-disable-line react-hooks/exhaustive-deps

  const missing = FIELDS.filter((f) => f.required && map[f.key] == null);
  const ready = rows.filter((r) => r.state === "new");
  const run = async () => {
    setBusy(true); const out: Row[] = [];
    for (const r of rows) {
      if (r.state !== "new") { out.push(r); continue; }
      try { await rpc("hr_employee_save", { _org: org, _id: null, _p: r.p, _reason: `استيراد Excel: ${raw!.name} — صف ${r.i}` }); out.push({ ...r, state: "ok" }); }
      catch (e) { out.push({ ...r, state: "fail", msg: arabicError(e) }); }
    }
    setRes(out); setBusy(false); onDone();
    const ok = out.filter((x) => x.state === "ok").length; toast.success(`أُضيف ${ok} موظفًا`);
  };
  const report = () => {
    const ws = XLSX.utils.aoa_to_sheet([["الصف", "الاسم", "النتيجة", "التفاصيل"], ...res!.map((r) => [r.i, r.p["full_name"] ?? "", LBL[r.state], [...r.errs, r.msg].filter(Boolean).join("، ")])]);
    const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] }; XLSX.utils.book_append_sheet(wb, ws, "النتائج"); XLSX.writeFile(wb, "تقرير-استيراد-الموظفين.xlsx");
  };
  const shown = res ?? rows;

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2"><h3 className="flex-1 font-bold">استيراد موظفين من Excel</h3><Button size="icon" variant="ghost" aria-label="إغلاق" onClick={onClose}><X className="size-4" /></Button></div>
      <p className="text-sm text-muted-foreground">يُنشأ ملف موظف بلا حساب دخول، ويمكن ربطه بحساب أو سجل معلم لاحقًا. لا يُحفظ أي صف قبل المعاينة، والصفوف الموجودة مسبقًا تُتخطى ولا تُكرر.{!sens && " أعمدة الهوية والجنسية والميلاد مخفية لأنها تحتاج صلاحية البيانات الحساسة."}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={template}><Download className="size-4" />تنزيل القالب</Button>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-sm"><Upload className="size-4" />اختيار ملف
          <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" aria-label="ملف الاستيراد" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} /></label>
        {raw && <span className="self-center text-sm">{raw.name} — {raw.data.length} صف</span>}
      </div>
      {raw && !res && (
        <div className="grid gap-2 sm:grid-cols-3">
          {fields.map((f) => (
            <label key={f.key} className="text-xs">{f.label}{f.required && " *"}
              <select aria-label={`عمود ${f.label}`} className={selectCls("mt-1 w-full")} value={map[f.key] ?? ""} onChange={(e) => setMap((x) => { const y = { ...x }; if (e.target.value === "") delete y[f.key]; else y[f.key] = +e.target.value; return y; })}>
                <option value="">— غير موجود —</option>{raw.head.map((h, k) => <option key={k} value={k}>{h || `عمود ${k + 1}`}</option>)}
              </select></label>
          ))}
        </div>
      )}
      {raw && missing.length > 0 && <p className="text-sm text-destructive">حدد عمود: {missing.map((f) => f.label).join("، ")}</p>}
      {raw && missing.length === 0 && (
        <>
          <div className="flex flex-wrap gap-3 text-sm">
            {(["new", "dup", "bad", "ok", "fail"] as const).map((s) => { const c = shown.filter((r) => r.state === s).length; return c ? <span key={s} className={`rounded px-2 py-0.5 ${CLS[s]}`}>{LBL[s]}: {c}</span> : null; })}
          </div>
          <div className="max-h-96 overflow-auto rounded border">
            <table className="w-full text-sm"><thead className="sticky top-0 bg-muted"><tr><th className="p-2 text-start">الصف</th><th className="p-2 text-start">الاسم</th><th className="p-2 text-start">المدرسة</th><th className="p-2 text-start">النتيجة</th></tr></thead>
              <tbody>{shown.map((r) => (
                <tr key={r.i} className="border-t"><td className="p-2">{r.i}</td><td className="p-2">{r.p["full_name"] || "—"}</td><td className="p-2">{schools.find((s) => s.id === r.p["school_id"])?.name ?? "—"}</td>
                  <td className="p-2"><span className={`rounded px-1.5 ${CLS[r.state]}`}>{LBL[r.state]}</span> <span className="text-xs text-muted-foreground">{[...r.errs, r.msg].filter(Boolean).join("، ")}</span></td></tr>
              ))}</tbody></table>
          </div>
          {!res ? <Button disabled={busy || ready.length === 0} onClick={run}>{busy ? "جارٍ الحفظ…" : `حفظ ${ready.length} صفًا صالحًا`}</Button>
            : <Button variant="outline" onClick={report}><Download className="size-4" />تقرير النتائج</Button>}
        </>
      )}
    </div>
  );
}
const LBL: Record<Row["state"], string> = { new: "جاهز", dup: "موجود — يُتخطى", bad: "خطأ", ok: "أُضيف", fail: "رفضه الخادم" };
const CLS: Record<Row["state"], string> = { new: "bg-secondary", dup: "bg-muted", bad: "bg-destructive/10 text-destructive", ok: "bg-primary/10 text-primary", fail: "bg-destructive/10 text-destructive" };
