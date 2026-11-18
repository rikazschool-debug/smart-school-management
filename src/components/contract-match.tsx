// Contract matching: upload the full student list exported from «مدارس» for one school + year, preview, then apply via ct_apply.
// The server (ct_preview/ct_apply) is the only source of the result; this screen only reads the file and shows the plan.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { FileSpreadsheet, FileCheck2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { db } from "@/components/crud-page";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";
import { ctHeaderMap, CT_KEYS, type CtKey } from "@/lib/contract-match";

type Side = { year: string | null; status: string | null; type: string | null };
type Plan = {
  year: string; empty: boolean; year_mismatch: string[]; no_id_rows: number; active_without_id: number;
  problems: { line: string; nid: string; why: string }[]; unknown: { line: string; nid: string }[];
  matched: { id: string; name: string; nid: string; old: Side; new: Side; changed: boolean; newer: boolean }[];
  missing: { id: string; name: string; nid: string; old: Side; changed: boolean; newer: boolean }[];
};
const LABEL: Record<CtKey, string> = { nid: "رقم الهوية / الإقامة", status: "حالة العقد", type: "نوع العقد", year: "العام الدراسي (اختياري)" };

async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function ContractMatch({ schoolId }: { schoolId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState("");
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [fname, setFname] = useState("");
  const [hdr, setHdr] = useState(0);
  const [map, setMap] = useState<Partial<Record<CtKey, number>>>({});
  const [plan, setPlan] = useState<Plan | null>(null);
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const school = useQuery({ queryKey: ["ct-school", schoolId], enabled: open, queryFn: async () => {
    const [s, y] = await Promise.all([db.from("schools").select("name").eq("id", schoolId).single(),
      db.from("academic_years").select("id, name, is_current, start_date").eq("school_id", schoolId).order("start_date", { ascending: false })]);
    return { name: s.data?.name as string, years: (y.data ?? []) as { id: string; name: string; is_current: boolean }[] };
  } });

  const reset = () => { setGrid(null); setFname(""); setMap({}); setPlan(null); setFull(false); };
  const rows = useMemo(() => {
    if (!grid || map.nid === undefined) return [];
    return grid.slice(hdr + 1).filter((r) => r.some((c) => String(c ?? "").trim())).map((r, i) => ({
      line: String(hdr + i + 2), nid: r[map.nid!] ?? "", status: map.status !== undefined ? r[map.status] ?? "" : "",
      type: map.type !== undefined ? r[map.type] ?? "" : "", year: map.year !== undefined ? r[map.year] ?? "" : "" }));
  }, [grid, hdr, map]);

  async function onFile(f: File) {
    reset();
    if (!/\.(xlsx|xls)$/i.test(f.name)) return void toast.error("ارفع ملف Excel (xlsx أو xls)");
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array", raw: false });
      const ws = wb.Sheets[wb.SheetNames[0]!]!;
      // raw:false keeps the cell text as shown, so leading zeros in IDs survive
      const g = (XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as unknown[][]).map((r) => r.map((c) => String(c ?? "")));
      if (!g.length) return void toast.error("الملف فارغ");
      const found = ctHeaderMap(g);
      setGrid(g); setFname(f.name); setHdr(found.row); setMap(found.map);
    } catch { toast.error("تعذّرت قراءة الملف — تأكد أنه Excel صالح"); }
  }

  async function preview() {
    if (!year) return void toast.error("اختر العام الدراسي");
    if (map.nid === undefined || map.status === undefined || map.type === undefined) return void toast.error("حدّد أعمدة الهوية وحالة العقد ونوع العقد");
    if (!rows.length) return void toast.error("الملف فارغ — لا توجد صفوف بعد العناوين");
    setBusy(true);
    const { data, error } = await db.rpc("ct_preview", { _school: schoolId, _year: year, _rows: rows });
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    setPlan(data as Plan); setFull(false);
  }

  async function apply() {
    if (!plan) return;
    setBusy(true);
    try {
      const hash = await sha(JSON.stringify(rows.map((r) => [r.nid, r.status, r.type, r.year])));
      const { data, error } = await db.rpc("ct_apply", { _school: schoolId, _year: year, _rows: rows, _hash: hash, _full_confirmed: full });
      if (error) throw error;
      if (data?.already) toast.info("هذا الكشف اعتُمد سابقًا لنفس العام — لم يتغير شيء");
      else toast.success(`اعتُمدت المطابقة: ${data.matched} مطابق، ${data.missing} غير موجود في الكشف`);
      qc.invalidateQueries(); setOpen(false); reset();
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }

  const changedM = plan?.matched.filter((m) => m.changed && !m.newer) ?? [];
  const changedX = plan?.missing.filter((m) => m.changed && !m.newer) ?? [];
  const newer = [...(plan?.matched ?? []), ...(plan?.missing ?? [])].filter((m) => m.newer);
  const blocked = !plan || plan.empty || plan.year_mismatch.length > 0 || (changedX.length > 0 && !full) || (changedM.length + changedX.length === 0);
  const yearName = school.data?.years.find((y) => y.id === year)?.name;
  const show = (s: Side) => [s.year, s.status, s.type].map((x) => x ?? "—").join(" · ");

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => { reset(); setOpen(true); }}><FileCheck2 className="size-4" /> مطابقة العقود</Button>
      <Dialog open={open} onOpenChange={(o) => { if (!busy) setOpen(o); }}>
        <DialogContent dir="rtl" className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader><DialogTitle>مطابقة العقود</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><div className="text-xs text-muted-foreground">المدرسة</div><div className="font-semibold">{school.data?.name ?? "…"}</div></div>
            <label className="text-sm">العام الدراسي
              <select aria-label="العام الدراسي" className={selectCls("mt-1 w-full")} value={year} onChange={(e) => { setYear(e.target.value); setPlan(null); }}>
                <option value="">اختر العام</option>
                {school.data?.years.map((y) => <option key={y.id} value={y.id}>{y.name}{y.is_current ? " (الحالي)" : ""}</option>)}
              </select>
              {school.data && !school.data.years.length && <span className="mt-1 block text-xs text-destructive">لا توجد أعوام دراسية لهذه المدرسة — أضفها من «الإعداد الأكاديمي».</span>}
            </label>
          </div>

          <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void onFile(f); }}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center ${drag ? "border-primary bg-primary/5" : "border-border"}`}>
            {fname ? <FileSpreadsheet className="size-8 text-primary" /> : <Upload className="size-8 text-muted-foreground" />}
            <span className="text-sm font-medium">{fname || "اسحب ملف Excel هنا أو اضغط للاختيار"}</span>
            <input type="file" accept=".xlsx,.xls" className="sr-only" aria-label="ملف كشف العقود" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onFile(f); }} />
          </label>
          <p className="text-xs leading-6 text-muted-foreground">من منصة مدارس، افتح حسابات الطلاب، وحدّد العام الدراسي المطلوب، ثم صدّر كشف الطلاب الكامل للمدرسة. اختر نفس العام الدراسي هنا وارفع ملف Excel لمطابقة العقود برقم الهوية أو الإقامة.</p>

          {grid && (
            <div className="rounded-lg border p-3">
              <div className="mb-2 text-sm font-semibold">أعمدة الملف {map.nid === undefined && <span className="text-destructive">— لم يُتعرّف على العناوين، حدّدها يدويًا</span>}</div>
              <label className="mb-2 block text-xs">صف العناوين
                <select aria-label="صف العناوين" className={selectCls("ms-2 w-24", true)} value={hdr} onChange={(e) => { setHdr(+e.target.value); setPlan(null); }}>
                  {grid.slice(0, 15).map((_, i) => <option key={i} value={i}>{i + 1}</option>)}
                </select>
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                {CT_KEYS.map((k) => (
                  <label key={k} className="text-xs">{LABEL[k]}
                    <select aria-label={`عمود ${LABEL[k]}`} className={selectCls("mt-1 w-full", true)} value={map[k] ?? ""}
                      onChange={(e) => { setMap({ ...map, [k]: e.target.value === "" ? undefined : +e.target.value }); setPlan(null); }}>
                      <option value="">—</option>
                      {(grid[hdr] ?? []).map((h, i) => <option key={i} value={i}>{h || `عمود ${i + 1}`}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">{rows.length} صفًا بعد العناوين</div>
              <Button className="mt-3" size="sm" disabled={busy} onClick={preview}>معاينة المطابقة</Button>
            </div>
          )}

          {plan && (
            <div className="space-y-3" aria-label="نتيجة المعاينة">
              <div className="rounded-md bg-muted p-2 text-sm">النطاق: <b>{school.data?.name}</b> — العام <b>{yearName}</b> (كل طلاب المدرسة؛ غير الموجودين = الطلاب المنتظمون فقط)</div>
              {plan.empty && <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">الملف فارغ أو لا يحتوي أرقام هوية — لا يمكن الاعتماد.</div>}
              {plan.year_mismatch.length > 0 && <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">العام في الملف ({plan.year_mismatch.join("، ")}) لا يطابق العام المختار ({plan.year}) — الاعتماد موقوف.</div>}
              <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
                {[["مطابقون", plan.matched.length], ["غير موجودين في الملف", plan.missing.length], ["هويات غير موجودة في ركاز", plan.unknown.length], ["أخطاء للمراجعة", plan.problems.length + plan.no_id_rows]].map(([l, n]) => (
                  <div key={l as string} className="rounded-md border p-2"><div className="text-xl font-bold">{n}</div><div className="text-xs text-muted-foreground">{l}</div></div>))}
              </div>
              {newer.length > 0 && <div className="rounded-md bg-warning/15 p-2 text-sm">تنبيه: {newer.length} طالب لديهم بيانات عقد من عام أحدث — لن تُستبدل بهذا الكشف: {newer.map((m) => m.name).join("، ")}</div>}
              {plan.problems.length > 0 && <details open className="text-sm"><summary className="font-semibold">أخطاء (لن تُطبّق على أصحابها)</summary>
                <ul className="mt-1 list-disc ps-5">{plan.problems.map((p, i) => <li key={i}>سطر {p.line}: <span dir="ltr">{p.nid}</span> — {p.why}</li>)}</ul></details>}
              {plan.unknown.length > 0 && <details className="text-sm"><summary className="font-semibold">هويات غير موجودة في ركاز (لن يُنشأ طالب)</summary>
                <ul className="mt-1 list-disc ps-5">{plan.unknown.map((p, i) => <li key={i}>سطر {p.line}: <span dir="ltr">{p.nid}</span></li>)}</ul></details>}
              {(changedM.length + changedX.length) > 0 && (
                <div className="overflow-x-auto"><table className="w-full text-xs">
                  <thead><tr className="text-muted-foreground"><th className="p-1 text-start">الطالب</th><th className="p-1 text-start">قبل (العام · الحالة · النوع)</th><th className="p-1 text-start">بعد</th></tr></thead>
                  <tbody>
                    {changedM.map((m) => <tr key={m.id} className="border-t"><td className="p-1">{m.name}</td><td className="p-1">{show(m.old)}</td><td className="p-1 text-primary">{show(m.new)}</td></tr>)}
                    {changedX.map((m) => <tr key={m.id} className="border-t"><td className="p-1">{m.name}</td><td className="p-1">{show(m.old)}</td><td className="p-1 text-destructive">يحتاج تحديث · لا يوجد · لا يوجد</td></tr>)}
                  </tbody></table></div>)}
              {changedX.length > 0 && (
                <label className="flex items-start gap-2 rounded-md border border-destructive/40 p-2 text-sm">
                  <input type="checkbox" aria-label="تأكيد الكشف الكامل" checked={full} onChange={(e) => setFull(e.target.checked)} className="mt-1" />
                  <span>أؤكد أن هذا الملف هو الكشف الكامل لـ{school.data?.name} للعام {yearName}. سيتغير {changedX.length} طالب إلى «يحتاج تحديث / لا يوجد».</span>
                </label>)}
              {changedM.length + changedX.length === 0 && !plan.empty && <div className="text-sm text-muted-foreground">لا يوجد ما يتغير.</div>}
              <Button disabled={blocked || busy} onClick={apply}>اعتماد المطابقة ({changedM.length + changedX.length} طالب)</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
