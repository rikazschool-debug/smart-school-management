import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CalendarDays, ClipboardList, Landmark, School, UserRound } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { StatusPill } from "@/components/family-visits/shared";
import { StudentHomework } from "@/routes/_authenticated/app/homework.index";
import { DAYS_AR } from "@/lib/timetable-model";
import { arabicError } from "@/lib/session";
import { cn } from "@/lib/utils";

/** One child's (or the student's own) overview. Everything comes from family_child, which checks the link on the server. */
export type ChildData = {
  student: { id: string; name: string; csmart_no: string | null; school_id: string; school: string; section: string | null; grade: string | null };
  viewer: "guardian" | "student";
  timetable: { day: number; period: string; sort: number; start: string | null; end: string | null; subject: string; teacher: string | null }[];
  classrooms: { id: string; title: string; subject: string }[];
  visits?: { id: string; status: string; date: string; time: string; source: string }[] | null;
  finance?: {
    linked: boolean; balance: number | null; currency: string | null; synced_at: string | null;
    payments: { amount: number; paid_at: string; ref: string | null }[];
    banks: { bank: string; holder: string; iban: string }[]; links: { label: string; url: string }[]; note: string | null;
  };
};

export function useChild(studentId: string) {
  return useQuery({
    queryKey: ["family-child", studentId],
    queryFn: async () => {
      const { data, error } = await db.rpc("family_child", { _student: studentId });
      if (error) throw error;
      return data as ChildData;
    },
    retry: false,
  });
}

type Tab = "schedule" | "classrooms" | "homework" | "visits" | "finance";

export function ChildOverview({ studentId }: { studentId: string }) {
  const q = useChild(studentId);
  const [tab, setTab] = useState<Tab>("schedule");
  if (q.isLoading) return <LoadingState />;
  if (q.error) return (q.error as { code?: string }).code === "42501" || /not_allowed/.test(String((q.error as Error).message))
    ? <EmptyState title="لا يمكنك فتح هذا الملف" hint="يظهر فقط الأبناء المرتبطون بحسابك بعلاقة موثقة من المدرسة." />
    : <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data!;
  const guardian = d.viewer === "guardian";
  const tabs: { k: Tab; label: string; icon: typeof BookOpen }[] = [
    { k: "schedule", label: "الجدول", icon: CalendarDays },
    { k: "classrooms", label: "الفصل الرقمي", icon: School },
    { k: "homework", label: "الواجبات", icon: ClipboardList },
    ...(guardian ? [{ k: "visits" as Tab, label: "الزيارات", icon: UserRound }, { k: "finance" as Tab, label: "البيانات المالية", icon: Landmark }] : []),
  ];
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-card p-5" aria-label="الابن المختار">
        {guardian && <p className="text-xs text-muted-foreground">تتابع الآن</p>}
        <p className="text-xl font-bold">{d.student.name}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {d.student.school}{d.student.grade ? ` · ${d.student.grade}` : ""}{d.student.section ? ` / شعبة ${d.student.section}` : " · لم يُسكَّن في شعبة بعد"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">رقم الطالب في C‑Smart: {d.student.csmart_no ?? "غير مسجّل بعد"}</p>
      </div>
      <div role="tablist" aria-label="أقسام الابن" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.k} role="tab" aria-selected={tab === t.k} onClick={() => setTab(t.k)}
            className={cn("inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm", tab === t.k ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}>
            <t.icon className="size-4" />{t.label}
          </button>
        ))}
      </div>
      {tab === "schedule" && <Timetable rows={d.timetable} />}
      {tab === "classrooms" && (!d.classrooms.length ? <EmptyState title="لا توجد فصول رقمية لشعبته بعد" /> : (
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {d.classrooms.map((c) => (
            <li key={c.id}><Link to="/app/classrooms/$id" params={{ id: c.id }} className="block rounded-xl border bg-card p-4 hover:border-primary/40">
              <p className="font-semibold">{c.subject}</p><p className="text-sm text-muted-foreground">{c.title}</p></Link></li>
          ))}
        </ul>
      ))}
      {tab === "homework" && <StudentHomework studentId={d.student.id} guardian={guardian} />}
      {tab === "visits" && guardian && (
        <div className="space-y-3">
          <Link to="/app/family-visits" className="inline-block rounded-md border px-3 py-1.5 text-sm text-primary">طلب زيارة أو إدارة المواعيد ←</Link>
          {!d.visits?.length ? <EmptyState title="لا توجد زيارات لهذا الابن" /> : (
            <ul className="space-y-2">{d.visits.map((v) => (
              <li key={v.id} className="flex items-center justify-between rounded-xl border bg-card p-3 text-sm">
                <span>{v.date} · {String(v.time).slice(0, 5)} · {v.source === "school" ? "استدعاء من المدرسة" : "طلب منك"}</span><StatusPill s={v.status} />
              </li>))}</ul>
          )}
        </div>
      )}
      {tab === "finance" && guardian && d.finance && <Finance f={d.finance} />}
    </div>
  );
}

function Timetable({ rows }: { rows: ChildData["timetable"] }) {
  if (!rows.length) return <EmptyState title="لا يوجد جدول منشور لشعبته بعد" />;
  const days = [...new Set(rows.map((r) => r.day))].sort();
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {days.map((day) => (
        <div key={day} className="rounded-xl border bg-card p-4">
          <p className="mb-2 font-bold">{DAYS_AR[day]}</p>
          <ul className="space-y-1.5 text-sm">
            {rows.filter((r) => r.day === day).map((r, i) => (
              <li key={i} className="flex justify-between gap-2"><span>{r.period} · {r.subject}</span><span className="text-muted-foreground">{r.teacher ?? ""}</span></li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

const money = (n: number, c: string | null) => new Intl.NumberFormat("ar-SA", { style: "currency", currency: c ?? "SAR" }).format(Math.abs(n));

function Finance({ f }: { f: NonNullable<ChildData["finance"]> }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-card p-5">
        {!f.linked ? (
          <>
            <p className="font-bold">بانتظار الربط المالي</p>
            <p className="mt-1 text-sm text-muted-foreground">سيظهر هنا المستحق أو الرصيد الدائن وسجل السداد وآخر تحديث عند ربط النظام المالي للمدرسة.</p>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{Number(f.balance) > 0 ? "المستحق" : Number(f.balance) < 0 ? "رصيد دائن" : "لا يوجد مستحق"}</p>
            <p className="text-2xl font-bold">{money(Number(f.balance ?? 0), f.currency)}</p>
            <p className="mt-1 text-xs text-muted-foreground">آخر تحديث: {f.synced_at ? new Date(f.synced_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" }) : "—"}</p>
            <p className="mb-2 mt-4 font-semibold">سجل السداد</p>
            {!f.payments.length ? <p className="text-sm text-muted-foreground">لا توجد عمليات سداد مسجلة.</p> : (
              <ul className="space-y-1 text-sm">{f.payments.map((p, i) => <li key={i} className="flex justify-between"><span>{new Date(p.paid_at).toLocaleDateString("ar-SA", { timeZone: "Asia/Riyadh" })}{p.ref ? ` · ${p.ref}` : ""}</span><span>{money(p.amount, f.currency)}</span></li>)}</ul>
            )}
          </>
        )}
      </div>
      {(f.banks.length > 0 || f.links.length > 0) && (
        <div className="rounded-xl border bg-card p-5">
          <p className="mb-2 font-semibold">طرق السداد المعتمدة لمدرسة الابن</p>
          {f.banks.map((b, i) => <p key={i} className="text-sm">{b.bank} — {b.holder} — <span dir="ltr" className="font-mono">{b.iban}</span></p>)}
          <div className="mt-3 flex flex-wrap gap-2">
            {f.links.map((l, i) => <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="rounded-md border px-3 py-1.5 text-sm text-primary">{l.label} ↗</a>)}
          </div>
          {f.note && <p className="mt-2 text-sm text-muted-foreground">{f.note}</p>}
          <p className="mt-3 text-xs text-muted-foreground">فتح رابط السداد لا يعني اكتمال الدفع؛ تظهر العملية في السجل بعد تأكيدها من النظام المالي.</p>
        </div>
      )}
    </div>
  );
}
