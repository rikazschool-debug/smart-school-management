import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
import { ask } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { formatAcademicYear } from "@/lib/academic-year";
import { SF_KEY, money } from "@/lib/student-finance/labels";

const STATE: Record<string, string> = { new: "جديد — سيُنشأ", exists: "لديه مستحقات", partial: "مستحقات جزئية — مراجعة منفصلة", no_price: "لا توجد رسوم معتمدة لصفه" };

function useYears(schoolId: string) {
  return useQuery({ queryKey: ["sf-years", schoolId], queryFn: async () => { const { data, error } = await db.from("academic_years").select("id,name,is_current").eq("school_id", schoolId).order("start_date", { ascending: false }); if (error) throw error; return data as Row[]; } });
}

/** «تهيئة مستحقات الطلاب»: server preview first; creation only after the owner confirms (sf_bulk_apply). */
export function BulkSetup({ schoolId }: { schoolId: string }) {
  const qc = useQueryClient();
  const years = useYears(schoolId);
  const [year, setYear] = useState(""); const [grade, setGrade] = useState("");
  const yearId = year || (years.data?.find((y) => y["is_current"]) ?? years.data?.[0])?.["id"] || "";
  const grades = useQuery({ queryKey: ["sf-grades", schoolId], queryFn: async () => { const { data, error } = await db.from("grades").select("id,name,stages(name)").eq("school_id", schoolId); if (error) throw error; return data as Row[]; } });
  const pv = useQuery({ enabled: !!yearId, queryKey: [...SF_KEY, "bulk", schoolId, yearId, grade], queryFn: async () => { const { data, error } = await db.rpc("sf_bulk_preview", { _school: schoolId, _year: yearId, _grade: grade || null, _students: null }); if (error) throw error; return data as Row; }, retry: false });
  const [busy, setBusy] = useState(false);
  const rows = (pv.data?.["rows"] ?? []) as Row[];
  const newCount = rows.filter((r) => r["state"] === "new").length;
  const apply = async () => {
    if (!(await ask(`إنشاء مستحقات ${newCount} طالبًا بإجمالي ${money(pv.data?.["new_total"])} قبل الخصومات؟ لن تُمس الحسابات التي لديها مستحقات سابقة.`))) return;
    setBusy(true); const { data, error } = await db.rpc("sf_bulk_apply", { _school: schoolId, _year: yearId, _grade: grade || null, _students: null }); setBusy(false);
    if (error) toast.error(arabicError(error)); else { toast.success(`أُنشئت ${(data as Row)["obligations"]} مستحقات لـ ${(data as Row)["students"]} طالب`); void qc.invalidateQueries({ queryKey: SF_KEY }); }
  };
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">تهيئة مستحقات الطلاب</h2>
      <div className="flex flex-wrap gap-2">
        <select aria-label="العام الدراسي" className={selectCls("min-w-40", true)} value={yearId} onChange={(e) => setYear(e.target.value)}>{(years.data ?? []).map((y) => <option key={y["id"]} value={y["id"]}>{formatAcademicYear(y["name"])}</option>)}</select>
        <select aria-label="الصف" className={selectCls("min-w-40", true)} value={grade} onChange={(e) => setGrade(e.target.value)}><option value="">كل الصفوف</option>{(grades.data ?? []).map((g) => <option key={g["id"]} value={g["id"]}>{g["stages"]?.name} — {g["name"]}</option>)}</select>
      </div>
      {pv.error ? <p className="text-sm text-muted-foreground">{arabicError(pv.error)}</p> : pv.data && <>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {[["الطلاب المحددون", String(pv.data["selected"])], ["لديهم مستحقات سابقة", String(pv.data["existing"])], ["بلا تهيئة رسوم", String(pv.data["no_price"])], ["سيُنشأ لهم", String(newCount)], ["إجمالي المستحقات الجديدة", money(pv.data["new_total"])]].map(([l, v]) => <div key={l} className="rounded-xl border bg-card p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="mt-1 font-bold">{v}</div></div>)}
        </div>
        <p className="text-xs text-muted-foreground">{pv.data["note"]} المدفوعات والأرصدة السابقة لا تتغير.</p>
        <div className="max-h-80 overflow-auto rounded-2xl border bg-card">
          <table className="w-full text-sm"><thead className="sticky top-0 bg-muted/80 text-xs"><tr>{["الطالب", "الصف", "الشعبة", "الفصول", "الرسوم", "حالة الحساب"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
            <tbody>{rows.map((r) => <tr key={r["student_id"]} className="border-t"><td className="p-2">{r["name"]}</td><td className="p-2">{r["grade"]}</td><td className="p-2">{r["section"]}</td><td className="p-2">{(r["terms"] as number[]).map((t) => t === 1 ? "الأول" : "الثاني").join("، ") || "—"}</td><td className="p-2">{money(r["price"])}</td><td className="p-2">{STATE[r["state"]]}</td></tr>)}</tbody></table>
          {!rows.length && <p className="p-6 text-center text-sm text-muted-foreground">لا يوجد طلاب مسكّنون في هذا النطاق.</p>}
        </div>
        <Button disabled={!newCount || busy} onClick={apply}>اعتماد إنشاء المستحقات ({newCount})</Button>
      </>}
    </section>
  );
}

/** Bus seats per direction from the actual subscriptions (sf_bus_occupancy). */
export function BusOccupancy({ schoolId }: { schoolId: string }) {
  const years = useYears(schoolId);
  const [year, setYear] = useState(""); const [term, setTerm] = useState(1);
  const yearId = year || (years.data?.find((y) => y["is_current"]) ?? years.data?.[0])?.["id"] || "";
  const q = useQuery({ enabled: !!yearId, queryKey: [...SF_KEY, "buses", schoolId, yearId, term], queryFn: async () => { const { data, error } = await db.rpc("sf_bus_occupancy", { _school: schoolId, _year: yearId, _term: term }); if (error) throw error; return data as Row[]; }, retry: false });
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold">إشغال الباصات</h2>
      <div className="flex flex-wrap gap-2">
        <select aria-label="العام الدراسي" className={selectCls("min-w-40", true)} value={yearId} onChange={(e) => setYear(e.target.value)}>{(years.data ?? []).map((y) => <option key={y["id"]} value={y["id"]}>{formatAcademicYear(y["name"])}</option>)}</select>
        <select aria-label="الفصل" className={selectCls("min-w-32", true)} value={term} onChange={(e) => setTerm(Number(e.target.value))}><option value={1}>الفصل الأول</option><option value={2}>الفصل الثاني</option></select>
      </div>
      {q.error ? <p className="text-sm text-muted-foreground">{arabicError(q.error)}</p> : <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full text-sm"><thead className="bg-muted/50 text-xs"><tr>{["الباص", "السعة", "الطلاب", "ذهاب وعودة", "ذهاب فقط", "عودة فقط", "متاح للذهاب", "متاح للعودة", "الإشغال"].map((h) => <th key={h} className="p-2 text-start">{h}</th>)}</tr></thead>
          <tbody>{(q.data ?? []).map((b) => <tr key={b["bus_id"]} className="border-t"><td className="p-2">{b["code"]} <span className="text-xs text-muted-foreground">{b["plate"]}</span></td><td className="p-2">{b["capacity"]}</td><td className="p-2">{b["students"]}</td><td className="p-2">{b["round_trip"]}</td><td className="p-2">{b["outbound"]}</td><td className="p-2">{b["return"]}</td><td className="p-2">{b["free_out"]}</td><td className="p-2">{b["free_ret"]}</td><td className="p-2 font-semibold">{b["occupancy"]}%</td></tr>)}</tbody></table>
        {!q.isLoading && !(q.data ?? []).length && <p className="p-6 text-center text-sm text-muted-foreground">لا توجد باصات مسجلة لهذا الفرع.</p>}
      </div>}
    </section>
  );
}
