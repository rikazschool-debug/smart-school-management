import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, ChevronDown, FileDown, FileSpreadsheet, Search, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportPdf, exportXlsx } from "@/lib/export";
import { db } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";
import { StaffPresence, useStaffPresence } from "@/components/education/staff-presence";
import { useSchoolPerms } from "@/lib/school-perms";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { matchesStaffDepartment } from "@/components/staff-department-filter";

export type StaffRow = { employee_id: string; full_name: string; employee_no: string | null; job_title: string | null; assignment_note: string | null; department: string | null; phone: string | null; kind: string; school_name: string | null; account: "linked" | "inactive" | "none" };

export const ACCOUNT_LABEL: Record<StaffRow["account"], string> = { linked: "حساب مرتبط", inactive: "حساب موقوف", none: "لا يوجد حساب مرتبط" };

/** Staff directory with branch-scoped HR fields and separately authorized identity. */
export function StaffDirectory({ schoolId }: { schoolId: string }) {
  const presence = useStaffPresence(schoolId);
  const idView = !!useSchoolPerms(schoolId)?.["people_identity.view"];
  const identity = useQuery({ enabled: idView, queryKey: ["staff-hr-identity", schoolId], queryFn: async () => {
    const { data, error } = await db.rpc("staff_hr_identity", { _school: schoolId });
    if (error) throw error;
    return new Map<string, string | null>(((data ?? []) as { employee_id: string; national_id: string | null }[]).map((row) => [row.employee_id, row.national_id]));
  } });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const q = useQuery({
    queryKey: ["staff-directory", schoolId],
    queryFn: async () => {
      const { data, error } = await db.rpc("school_staff_directory_details", { _school: schoolId });
      if (error) throw error;
      return (data ?? []) as StaffRow[];
    },
  });
  const departmentOpts = useMemo(() => [...new Set((q.data ?? []).map((r) => r.department))].sort((a, b) => a === null ? 1 : b === null ? -1 : a.localeCompare(b, "ar")), [q.data]);
  const titleOpts = useMemo(() => [...new Set((q.data ?? []).flatMap((r) => r.assignment_note ? [r.assignment_note] : []))].sort(), [q.data]);
  const [s, setS] = useState(""); const [kind, setKind] = useState(""); const [acc, setAcc] = useState("");
  const [departments, setDepartments] = useState<Set<string | null>>(new Set()); const [title, setTitle] = useState("");
  useEffect(() => setDepartments(new Set()), [schoolId]);
  useEffect(() => setSelected(new Set()), [schoolId, s, kind, acc, departments, title]);
  const rows = useMemo(() => (q.data ?? []).filter((r) => (!kind || r.kind === kind) && (!acc || r.account === acc)
    && matchesStaffDepartment(r.department, departments) && (!title || r.assignment_note === title)
    && (!s.trim() || [r.full_name, r.employee_no, r.job_title, r.assignment_note, idView ? identity.data?.get(r.employee_id) : ""].some((v) => (v ?? "").includes(s.trim())))), [q.data, s, kind, acc, departments, title, idView, identity.data]);
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  if (idView && identity.error) return <ErrorState message={arabicError(identity.error)} onRetry={() => identity.refetch()} />;
  const all = q.data ?? [];
  const meta = () => ({ title: "الكادر التعليمي والإداري", school: all[0]?.school_name ?? undefined, filters: [s && `بحث: ${s}`, kind, departments.size ? `القسم: ${[...departments].map((d) => d ?? "بلا قسم").join("، ")}` : "", title, acc && ACCOUNT_LABEL[acc as StaffRow["account"]]].filter(Boolean) as string[] });
  const headers = ["الاسم", "الرقم الوظيفي", ...(idView ? ["الهوية / الإقامة"] : []), "رقم الهاتف", "المسمى الوظيفي", "مسمى الإسناد", "النوع", "القسم", "حساب الدخول"];
  const body = () => rows.filter((r) => !selected.size || selected.has(r.employee_id)).map((r) => [r.full_name, r.employee_no, ...(idView ? [identity.data?.get(r.employee_id) ?? ""] : []), r.phone, r.job_title, r.assignment_note, r.kind, r.department, ACCOUNT_LABEL[r.account]]);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[["إجمالي الكادر", all.length], ["تعليمي", all.filter((r) => r.kind === "تعليمي").length], ["إداري", all.filter((r) => r.kind === "إداري").length]].map(([l, n]) => (
          <div key={l} className="rounded-xl border bg-card p-4"><p className="text-sm text-muted-foreground">{l}</p><p className="font-display text-2xl">{n}</p></div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1"><Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="بحث في الكادر" placeholder="بحث بالاسم أو الرقم الوظيفي أو الإسناد" value={s} onChange={(e) => setS(e.target.value)} className="pr-9" /></div>
        <select aria-label="النوع" className={selectCls("w-36")} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">كل الأنواع</option><option value="تعليمي">تعليمي</option><option value="إداري">إداري</option></select>
        <Popover>
          <PopoverTrigger asChild><Button variant="outline" aria-label="تصفية حسب القسم">{departments.size ? `الأقسام (${departments.size})` : "كل الأقسام"}<ChevronDown className="size-4" /></Button></PopoverTrigger>
          <PopoverContent dir="rtl" align="start" className="space-y-2 p-3">
            <div className="flex items-center justify-between"><span className="text-sm font-semibold">الأقسام</span><Button size="sm" variant="ghost" disabled={!departments.size} onClick={() => setDepartments(new Set())}>مسح التحديد</Button></div>
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {departmentOpts.map((department) => <label key={department === null ? "empty" : `department:${department}`} className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                <input type="checkbox" className="mt-1" checked={departments.has(department)} onChange={(e) => {
                  const checked = e.target.checked;
                  setDepartments((old) => { const next = new Set(old); if (checked) next.add(department); else next.delete(department); return next; });
                }} />{department ?? "بلا قسم"}
              </label>)}
              {!departmentOpts.length && <p className="text-sm text-muted-foreground">لا توجد أقسام</p>}
            </div>
          </PopoverContent>
        </Popover>
        <select aria-label="مسمى الإسناد" className={selectCls("w-44")} value={title} onChange={(e) => setTitle(e.target.value)}>
          <option value="">كل مسميات الإسناد</option>{titleOpts.map((x) => <option key={x} value={x}>{x}</option>)}</select>
        <Button variant="outline" size="sm" disabled={!rows.length || q.isFetching || (idView && identity.isFetching)} onClick={() => exportXlsx(meta(), headers, body())}><FileSpreadsheet className="size-4" />Excel</Button>
        <Button variant="outline" size="sm" disabled={!rows.length || q.isFetching || (idView && identity.isFetching)} onClick={() => void exportPdf(meta(), headers, body())}><FileDown className="size-4" />PDF</Button>
        <select aria-label="حالة الحساب" className={selectCls("w-44")} value={acc} onChange={(e) => setAcc(e.target.value)}>
          <option value="">كل الحسابات</option>{Object.entries(ACCOUNT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </div>
      {!rows.length ? <EmptyState title={all.length ? "لا نتائج مطابقة" : "لا يوجد موظفون مكلّفون بهذه المدرسة في الموارد البشرية"} /> : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-3 py-2"><input type="checkbox" aria-label="تحديد الكادر المعروض" checked={rows.length > 0 && rows.every((r) => selected.has(r.employee_id))} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.employee_id)) : new Set())} /></th>{[...headers, "الحالة"].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.employee_id}>
                  <td className="px-3 py-2"><input type="checkbox" aria-label={`تحديد ${r.full_name}`} checked={selected.has(r.employee_id)} onChange={(e) => setSelected((old) => { const next = new Set(old); if (e.target.checked) next.add(r.employee_id); else next.delete(r.employee_id); return next; })} /></td>
                  <td className="px-3 py-2 font-medium">{r.full_name}</td>
                  <td className="px-3 py-2" dir="ltr" style={{ textAlign: "right" }}>{r.employee_no || "—"}</td>
                  {idView && <td className="px-3 py-2"><bdi dir="ltr">{identity.data?.get(r.employee_id) || "—"}</bdi></td>}
                  <td className="px-3 py-2"><bdi dir="ltr">{r.phone || "—"}</bdi></td>
                  <td className="px-3 py-2">{r.job_title || "—"}</td>
                  <td className="px-3 py-2">{r.assignment_note || "—"}</td>
                  <td className="px-3 py-2"><span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{r.kind}</span></td>
                  <td className="px-3 py-2">{r.department || "—"}</td>
                  <td className="px-3 py-2">{r.account === "linked"
                    ? <span className="flex items-center gap-1 text-xs text-primary"><BadgeCheck className="size-3.5" />{ACCOUNT_LABEL.linked}</span>
                    : <span className="flex items-center gap-1 text-xs text-muted-foreground"><UserX className="size-3.5" />{ACCOUNT_LABEL[r.account]}</span>}</td>
                  <td className="px-3 py-2"><StaffPresence data={presence.data?.get(r.employee_id)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
