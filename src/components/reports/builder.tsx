import { useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, Play, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { all, within, d10, type Def, type Row, db } from "@/components/reports/core";
import { MORE_REPORTS } from "@/components/reports/more";
import { EmptyState, PageHeader } from "@/components/states";
import { exportPdf, exportXlsx, printReport } from "@/lib/export";
import { DAY_STATUS } from "@/lib/attendance";
import { ENR } from "@/components/admissions/shared";
import { KIND as EVT_KIND } from "@/components/events/shared";
import { groupCount, overlaps, periodBounds, periodLabel, type ReportTable } from "@/lib/report-builder";

const ACTIVE: Record<string, string> = { active: "نشط", inactive: "غير نشط" };
const HW: Record<string, string> = { draft: "مسودة", published: "منشور", closed: "مغلق", cancelled: "ملغى" };
const EVS: Record<string, string> = { draft: "مسودة", published: "منشور", closed: "مغلق", cancelled: "ملغى", done: "منتهٍ" };

const BASE: Record<string, Def> = {
  students_count: {
    group: "الطلاب", label: "أعداد الطلاب حسب الصف والشعبة", summary: "حسب الصف والشعبة", note: "الطلاب المسكّنون خلال الفترة",
    run: async (p, detail) => {
      const rows = (await all((a, b) => db.from("enrollments").select("status, start_date, end_date, sections(name, grades(name, sort_order)), students(full_name, national_id)").eq("school_id", p.school).range(a, b)))
        .filter((r) => overlaps(r["start_date"], r["end_date"], p.from, p.to));
      if (detail) return { headers: ["الطالب", "رقم الهوية", "الصف", "الشعبة", "حالة القيد", "تاريخ البداية"], rows: rows.map((r) => [r["students"]?.full_name, r["students"]?.national_id, r["sections"]?.grades?.name, r["sections"]?.name, ENR[r["status"]] ?? r["status"], r["start_date"]]) };
      return groupCount(rows, ["الصف", "الشعبة"], (r) => [r["sections"]?.grades?.name ?? "", r["sections"]?.name ?? ""]);
    },
  },
  students: {
    group: "الطلاب", label: "سجل الطلاب", summary: "حسب الحالة والجنس", note: "حسب تاريخ الإضافة",
    run: async (p, detail) => {
      const rows = await all((a, b) => within(db.from("students").select("full_name, national_id, gender, status, created_at").eq("school_id", p.school), "created_at", p).order("full_name").range(a, b));
      const g = (v: string) => (v === "male" ? "ذكر" : v === "female" ? "أنثى" : v ?? "");
      if (detail) return { headers: ["الطالب", "رقم الهوية", "الجنس", "الحالة", "تاريخ الإضافة"], rows: rows.map((r) => [r["full_name"], r["national_id"], g(r["gender"]), ACTIVE[r["status"]] ?? r["status"], d10(r["created_at"])]) };
      return groupCount(rows, ["الحالة", "الجنس"], (r) => [ACTIVE[r["status"]] ?? r["status"], g(r["gender"])]);
    },
  },
  attendance: {
    group: "الحضور والغياب", label: "الحضور اليومي", summary: "حسب الحالة", note: "حسب تاريخ اليوم الدراسي",
    run: async (p, detail) => {
      const rows = await all((a, b) => within(db.from("attendance_days").select("date, status, late_minutes, students(full_name)").eq("school_id", p.school), "date", p, false).order("date").range(a, b));
      if (detail) return { headers: ["التاريخ", "الطالب", "الحالة", "دقائق التأخر"], rows: rows.map((r) => [r["date"], r["students"]?.full_name, DAY_STATUS[r["status"]] ?? r["status"], r["late_minutes"] ?? ""]) };
      return groupCount(rows, ["الحالة"], (r) => [DAY_STATUS[r["status"]] ?? r["status"]]);
    },
  },
  teachers: {
    group: "المعلمون والجدول", label: "الكادر التعليمي", summary: "حسب التخصص والحالة", note: "حسب تاريخ الإضافة",
    run: async (p, detail) => {
      const rows = await all((a, b) => within(db.from("teachers").select("full_name, specialization, status, created_at").eq("school_id", p.school), "created_at", p).order("full_name").range(a, b));
      if (detail) return { headers: ["المعلم", "التخصص", "الحالة", "تاريخ الإضافة"], rows: rows.map((r) => [r["full_name"], r["specialization"], ACTIVE[r["status"]] ?? r["status"], d10(r["created_at"])]) };
      return groupCount(rows, ["التخصص", "الحالة"], (r) => [r["specialization"] ?? "", ACTIVE[r["status"]] ?? r["status"]]);
    },
  },
  guardians: {
    group: "الطلاب", label: "أولياء الأمور", summary: "حسب صلة القرابة", note: "روابط الطلاب المضافة خلال الفترة",
    run: async (p, detail) => {
      const rows = await all((a, b) => within(db.from("student_guardians").select("relationship, verified, created_at, guardians(full_name), students(full_name)").eq("school_id", p.school), "created_at", p).range(a, b));
      if (detail) return { headers: ["ولي الأمر", "الطالب", "الصلة", "موثّق", "تاريخ الربط"], rows: rows.map((r) => [r["guardians"]?.full_name, r["students"]?.full_name, r["relationship"], r["verified"] ? "نعم" : "لا", d10(r["created_at"])]) };
      return groupCount(rows, ["الصلة", "موثّق"], (r) => [r["relationship"] ?? "", r["verified"] ? "نعم" : "لا"]);
    },
  },
  homework: {
    group: "الشؤون التعليمية", label: "الواجبات والاختبارات", summary: "حسب النوع والحالة", note: "حسب تاريخ الإنشاء",
    run: async (p, detail) => {
      const rows = await all((a, b) => within(db.from("homework").select("title, kind, status, created_at, due_at").eq("school_id", p.school), "created_at", p).order("created_at").range(a, b));
      const k = (v: string) => (v === "test" ? "اختبار" : "واجب");
      if (detail) return { headers: ["العنوان", "النوع", "الحالة", "تاريخ الإنشاء", "موعد التسليم"], rows: rows.map((r) => [r["title"], k(r["kind"]), HW[r["status"]] ?? r["status"], d10(r["created_at"]), d10(r["due_at"])]) };
      return groupCount(rows, ["النوع", "الحالة"], (r) => [k(r["kind"]), HW[r["status"]] ?? r["status"]]);
    },
  },
  events: {
    group: "الأنشطة والفعاليات", label: "الأنشطة والفعاليات", summary: "حسب النوع والحالة", note: "حسب تاريخ الإنشاء",
    run: async (p, detail) => {
      const rows = await all((a, b) => within(db.from("evt_items").select("title, kind, status, location, created_at").eq("school_id", p.school), "created_at", p).order("created_at").range(a, b));
      const k = (v: string) => EVT_KIND[v as keyof typeof EVT_KIND] ?? v;
      if (detail) return { headers: ["العنوان", "النوع", "الحالة", "المكان", "تاريخ الإنشاء"], rows: rows.map((r) => [r["title"], k(r["kind"]), EVS[r["status"]] ?? r["status"], r["location"], d10(r["created_at"])]) };
      return groupCount(rows, ["النوع", "الحالة"], (r) => [k(r["kind"]), EVS[r["status"]] ?? r["status"]]);
    },
  },
};

const REPORTS: Record<string, Def> = { ...BASE, ...MORE_REPORTS };
const GROUPS = [...new Set(Object.values(REPORTS).map((r) => r.group))];

/** One builder for any section: pick a report, a period and a layout; output through the shared export helpers. */
export function ReportBuilder({ schoolId, orgId, schoolName }: { schoolId: string; orgId: string; schoolName: string }) {
  const [kind, setKind] = useState("students_count");
  const [detail, setDetail] = useState(false);
  const month = new Date().toISOString().slice(0, 8);
  const [from, setFrom] = useState(`${month}01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<{ title: string; filters: string[]; t: ReportTable } | null>(null);
  const def = REPORTS[kind]!;

  const run = async () => {
    const b = periodBounds(from, to);
    if (b.error) return void toast.error(b.error);
    setBusy(true);
    try {
      const t = await def.run({ school: schoolId, org: orgId, from: b.from, to: b.to }, detail);
      setOut({ title: def.label, filters: [periodLabel(b.from, b.to), detail ? "قائمة تفصيلية" : `ملخص ${def.summary}`, def.note], t });
    } catch (e) { const m = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : ""; toast.error(/permission|denied|forbidden|غير مصرح|صلاحية|not allowed/i.test(m) ? "لا تملك صلاحية عرض بيانات هذا القسم" : "تعذر إعداد التقرير، حاول مرة أخرى"); } finally { setBusy(false); }
  };
  const meta = out ? { title: out.title, school: schoolName, filters: out.filters } : null;
  const save = async (k: "xlsx" | "pdf" | "print") => {
    if (!out || !meta) return;
    if (!out.t.rows.length) return void toast.error("لا توجد سجلات في التقرير");
    try { if (k === "xlsx") exportXlsx(meta, out.t.headers, out.t.rows); else if (k === "pdf") await exportPdf(meta, out.t.headers, out.t.rows); else printReport(meta, out.t.headers, out.t.rows); }
    catch (e) { toast.error(e instanceof Error && e.message ? e.message : "تعذر التصدير"); }
  };

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="التقارير" title="منشئ التقارير" desc="اختر التقرير والفترة وشكل العرض، ثم اعرضه أو صدّره PDF أو Excel أو اطبعه. يظهر فقط ما تسمح لك صلاحياتك برؤيته." />
      <div className="grid gap-4 rounded-xl border bg-card p-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5 lg:col-span-2"><Label htmlFor="rb-kind" className="font-semibold">نوع التقرير</Label>
          <select id="rb-kind" className={selectCls()} value={kind} onChange={(e) => { setKind(e.target.value); setOut(null); }}>
            {GROUPS.map((g) => <optgroup key={g} label={g}>{Object.entries(REPORTS).filter(([, r]) => r.group === g).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}</optgroup>)}
          </select></div>
        <div className="space-y-1.5"><Label htmlFor="rb-from" className="font-semibold">من تاريخ</Label><Input id="rb-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="rb-to" className="font-semibold">إلى تاريخ</Label><Input id="rb-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div className="space-y-1.5 lg:col-span-2"><span className="text-sm font-semibold">شكل العرض</span>
          <div role="radiogroup" className="flex gap-1 rounded-lg border p-1">
            {[[false, `ملخص بالأعداد (${def.summary})`], [true, "قائمة تفصيلية"]].map(([v, l]) => (
              <button key={String(v)} type="button" role="radio" aria-checked={detail === v} onClick={() => { setDetail(v as boolean); setOut(null); }}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm ${detail === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{l as string}</button>
            ))}
          </div></div>
        <div className="flex items-end lg:col-span-2"><Button onClick={run} disabled={busy} className="w-full"><Play className="size-4" />{busy ? "جارٍ الإعداد…" : "عرض التقرير"}</Button></div>
      </div>
      {out && (
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h2 className="font-display text-lg">{out.title}</h2><p className="text-xs text-muted-foreground">{out.filters.join(" · ")}</p></div>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="outline" onClick={() => save("pdf")}><FileText className="size-4" />PDF</Button>
              <Button size="sm" variant="outline" onClick={() => save("xlsx")}><FileSpreadsheet className="size-4" />Excel</Button>
              <Button size="sm" variant="outline" onClick={() => save("print")}><Printer className="size-4" />طباعة</Button>
            </div>
          </div>
          {out.t.rows.length === 0 ? <EmptyState title="لا توجد سجلات في هذه الفترة" /> : (
            <div className="max-h-[60vh] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted"><tr>{out.t.headers.map((h) => <th key={h} className="p-2 text-start font-semibold">{h}</th>)}</tr></thead>
                <tbody>{out.t.rows.map((r, i) => <tr key={i} className={`border-t ${!detail && i === out.t.rows.length - 1 ? "bg-secondary font-bold" : ""}`}>{r.map((c, j) => <td key={j} className="p-2">{c ?? ""}</td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
