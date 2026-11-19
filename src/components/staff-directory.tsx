import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, ChevronDown, FileDown, FileSpreadsheet, Pencil, Printer, Search, Tags, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exportPdf, exportXlsx, printReport } from "@/lib/export";
import { db } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Input } from "@/components/ui/input";
import { arabicError } from "@/lib/session";
import { StaffPresence, useStaffPresence } from "@/components/education/staff-presence";
import { useSchoolPerms } from "@/lib/school-perms";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ACCOUNT_LABEL, STAFF_FILTERS, matchesStaffFilters, staffCounts, staffFilterOptions, type StaffFilters } from "@/components/staff-directory-model";
import { StaffDirectoryFilter } from "@/components/staff-directory-filter";
import { StaffDirectoryAction, type StaffTools } from "@/components/staff-directory-actions";
import { supabase } from "@/integrations/supabase/client";

type StaffRow = { employee_id: string; full_name: string; employee_no: string | null; job_title: string | null; assignment_note: string | null; department: string | null; phone: string | null; kind: string; school_name: string | null; account: keyof typeof ACCOUNT_LABEL };
const EMPTY_STAFF: StaffRow[] = [];
const staffNumber = new Intl.NumberFormat("ar-SA");

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
  const tools = useQuery({ queryKey: ["staff-directory-tools", schoolId], queryFn: async () => {
    const { data, error } = await supabase.rpc("staff_directory_tools", { _school: schoolId });
    if (error) throw error;
    return data as unknown as StaffTools;
  } });
  const [filters, setFilters] = useState<StaffFilters>({});
  const [s, setS] = useState("");
  const [action, setAction] = useState<{ mode: "assignment" | "tags"; ids: string[]; initial: string } | null>(null);
  const staffTools = tools.data;
  const tagView = staffTools?.tag_view === true;
  const tagOpts = staffTools?.tags ?? [];
  const employeeTags = (id: string) => {
    const ids = staffTools?.employees[id]?.tags ?? [];
    return tagOpts.filter((t) => ids.includes(t.id));
  };
  const all = q.data ?? EMPTY_STAFF;
  const counts = useMemo(() => staffCounts(all), [all]);
  const filterGroups = useMemo(() => STAFF_FILTERS.filter(([key]) => key !== "tag" || tagView).map(([key, label, empty]) => ({
    key, label, options: key === "account" ? Object.entries(ACCOUNT_LABEL).map(([value, label]) => ({ value, label }))
      : key === "tag" ? (staffTools?.tags ?? []).map(({ id, name }) => ({ value: id, label: name }))
      : staffFilterOptions(all.map((r) => r[key]), empty),
  })), [all, tagView, staffTools]);
  useEffect(() => setSelected(new Set()), [schoolId, s, filters]);
  const rows = useMemo(() => {
    const term = s.trim();
    return all.filter((r) => matchesStaffFilters(r, filters, tagView ? staffTools?.employees[r.employee_id]?.tags ?? [] : undefined)
      && (!term || [r.full_name, r.employee_no, r.job_title, r.assignment_note, idView ? identity.data?.get(r.employee_id) : ""].some((v) => (v ?? "").includes(term))));
  }, [all, s, filters, idView, identity.data, tagView, staffTools]);
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  if (idView && identity.error) return <ErrorState message={arabicError(identity.error)} onRetry={() => identity.refetch()} />;
  const picked = rows.filter((r) => selected.has(r.employee_id));
  const meta = () => ({ title: "الكادر التعليمي والإداري", school: all[0]?.school_name ?? undefined, filters: [
    ...(s.trim() ? [`بحث: ${s.trim()}`] : []),
    ...filterGroups.flatMap(({ key, label, options }) => {
      const names = options.filter(({ value }) => filters[key]?.has(value)).map((option) => option.label);
      return names.length ? [`${label}: ${names.join("، ")}`] : [];
    }),
    ...(picked.length ? [`المحددون: ${picked.length}`] : []),
  ] });
  const headers = ["الرقم الوظيفي", "الاسم", ...(idView ? ["الهوية"] : []), "رقم الجوال", "القسم", "المسمى الوظيفي", "الإسناد", ...(tagView ? ["الوسوم"] : []), "حساب الدخول"];
  const body = () => (picked.length ? picked : rows).map((r) => [r.employee_no, r.full_name, ...(idView ? [identity.data?.get(r.employee_id) ?? ""] : []), r.phone, r.department, r.job_title, r.assignment_note, ...(tagView ? [employeeTags(r.employee_id).map((t) => t.name).join("، ")] : []), ACCOUNT_LABEL[r.account]]);
  const ready = rows.length > 0 && !q.isFetching && !(idView && identity.isFetching) && !tools.isFetching;
  const output = async (format: "print" | "excel" | "pdf") => {
    try {
      if (format === "print") printReport(meta(), headers, body());
      else if (format === "excel") exportXlsx(meta(), headers, body());
      else await exportPdf(meta(), headers, body());
    } catch (error) { toast.error(arabicError(error)); }
  };
  const exportMenu = <Popover><PopoverTrigger asChild><Button variant="outline" size="sm" disabled={!ready}><FileDown className="size-4" />تصدير<ChevronDown className="size-4" /></Button></PopoverTrigger>
    <PopoverContent dir="rtl" align="start" className="w-40 space-y-1 p-2">
      <Button className="w-full justify-start" variant="ghost" size="sm" onClick={() => void output("excel")}><FileSpreadsheet className="size-4" />Excel</Button>
      <Button className="w-full justify-start" variant="ghost" size="sm" onClick={() => void output("pdf")}><FileDown className="size-4" />PDF</Button>
    </PopoverContent></Popover>;
  const openAction = (mode: "assignment" | "tags") => setAction({ mode, ids: picked.map((r) => r.employee_id), initial: picked.length === 1 ? picked[0]?.assignment_note ?? "" : "" });
  return (
    <div dir="rtl" className="min-w-0 space-y-4">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Object.entries(counts).map(([label, count]) => (
          <div key={label} className="rounded-lg border bg-card p-4"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-display text-2xl tabular-nums">{staffNumber.format(count)}</dd></div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full min-w-0 sm:w-auto sm:min-w-56 sm:flex-1"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="بحث في الكادر" placeholder="بحث في الكادر" value={s} onChange={(e) => setS(e.target.value)} className="ps-9" /></div>
        {filterGroups.map(({ key, label, options }) => <StaffDirectoryFilter key={key} label={label} options={options} selected={filters[key]}
          onChange={(values) => setFilters((current) => ({ ...current, [key]: values }))} />)}
        {!picked.length && exportMenu}
      </div>
      {tools.error && <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">تعذّر تحميل الوسوم وإجراءات التعديل <Button variant="outline" size="sm" onClick={() => void tools.refetch()}>إعادة المحاولة</Button></div>}
      {picked.length > 0 && <div aria-label="إجراءات المحددين" className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
        <span className="px-2 text-sm font-medium" aria-live="polite">المحددون: {picked.length}</span>
        <Button variant="outline" size="sm" disabled={!ready} onClick={() => void output("print")}><Printer className="size-4" />طباعة</Button>
        {exportMenu}
        {picked.every((r) => staffTools?.employees[r.employee_id]?.assignment_edit) && <Button variant="outline" size="sm" onClick={() => openAction("assignment")}><Pencil className="size-4" />الإسناد</Button>}
        {picked.every((r) => staffTools?.employees[r.employee_id]?.tags_edit) && <Button variant="outline" size="sm" onClick={() => openAction("tags")}><Tags className="size-4" />الوسوم</Button>}
        <Button variant="ghost" size="sm" className="ms-auto" onClick={() => setSelected(new Set())}>إلغاء التحديد</Button>
      </div>}
      {!rows.length ? <EmptyState title={all.length ? "لا نتائج مطابقة" : "لا يوجد موظفون مكلّفون بهذه المدرسة في الموارد البشرية"} /> : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm text-start">
            <thead className="bg-muted/50 text-muted-foreground"><tr><th className="px-3 py-2"><input type="checkbox" aria-label="تحديد الكادر المعروض" checked={rows.length > 0 && rows.every((r) => selected.has(r.employee_id))} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.employee_id)) : new Set())} /></th>{[...headers, "الحالة"].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.employee_id}>
                  <td className="px-3 py-2"><input type="checkbox" aria-label={`تحديد ${r.full_name}`} checked={selected.has(r.employee_id)} onChange={(e) => setSelected((old) => { const next = new Set(old); if (e.target.checked) next.add(r.employee_id); else next.delete(r.employee_id); return next; })} /></td>
                  <td className="px-3 py-2"><bdi dir="ltr">{r.employee_no || "—"}</bdi></td>
                  <td className="px-3 py-2 font-medium"><bdi>{r.full_name}</bdi></td>
                  {idView && <td className="px-3 py-2"><bdi dir="ltr">{identity.data?.get(r.employee_id) || "—"}</bdi></td>}
                  <td className="px-3 py-2"><bdi dir="ltr">{r.phone || "—"}</bdi></td>
                  <td className="px-3 py-2"><bdi>{r.department || "—"}</bdi></td>
                  <td className="px-3 py-2"><bdi>{r.job_title || "—"}</bdi></td>
                  <td className="px-3 py-2"><bdi>{r.assignment_note || "—"}</bdi></td>
                  {tagView && <td className="px-3 py-2"><div className="flex min-w-20 flex-wrap gap-1">{employeeTags(r.employee_id).map((t) => <bdi key={t.id} className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{t.name}</bdi>)}{!employeeTags(r.employee_id).length && "—"}</div></td>}
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
      {action && <StaffDirectoryAction {...action} schoolId={schoolId} tags={tagOpts} onClose={() => setAction(null)} />}
    </div>
  );
}
