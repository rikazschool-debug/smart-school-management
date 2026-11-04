import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState, PageHeader, Section } from "@/components/states";
import { arabicError, useSession } from "@/lib/session";
import { GENDER, STATUS, rpc, type HrAssign, type HrEmp } from "@/components/hr/shared";

export const Route = createFileRoute("/_authenticated/app/my-employment")({
  head: () => ({ meta: [{ title: "ملفي الوظيفي — ركاز" }, { name: "description", content: "بياناتك الوظيفية وتعييناتك وفريقك المباشر." }] }),
  component: Page,
});

type Mine = { employee: HrEmp; assignments: HrAssign[] } | null;
type TeamRow = { id: string; employee_no: string; full_name: string; job_title: string | null; school: string; status: string };

function Page() {
  const { active } = useSession();
  const org = active?.orgId ?? null;
  const mine = useQuery({ queryKey: ["hr-mine-page", org], enabled: !!org, queryFn: () => rpc<Mine>("hr_my_employment", { _org: org }) });
  const team = useQuery({ queryKey: ["hr-team", org], enabled: !!org, queryFn: () => rpc<TeamRow[]>("hr_team", { _org: org }) });
  if (!active) return null;
  return (
    <>
      <PageHeader title="ملفي الوظيفي" desc="بياناتك كما سجّلتها الموارد البشرية. لتصحيح أي بيان تواصل مع الموارد البشرية؛ طلبات التحديث الذاتي تُضاف مع حزمة الطلبات." />
      {mine.isLoading ? <LoadingState /> : mine.error ? <ErrorState message={arabicError(mine.error)} /> : !mine.data ? (
        <EmptyState title="لا يوجد ملف وظيفي لك في هذه المؤسسة" hint="تنشئه الموارد البشرية وتربطه بحسابك." />
      ) : <MyFile d={mine.data} />}
      {(team.data?.length ?? 0) > 0 && (
        <Section title="فريقي المباشر" desc="بيانات أساسية فقط لمن أنت مديره المباشر في تعيين حالي." className="mt-6">
          <ul className="grid gap-2 md:grid-cols-2">
            {team.data!.map((t) => <li key={t.id + t.school} className="rounded-xl border bg-card p-3 text-sm"><span className="block font-semibold">{t.full_name}</span><span className="text-xs text-muted-foreground"><bdi dir="ltr">{t.employee_no}</bdi> · {t.job_title ?? "—"} · {t.school} · {STATUS[t.status]}</span></li>)}
          </ul>
        </Section>
      )}
    </>
  );
}

function MyFile({ d }: { d: NonNullable<Mine> }) {
  const e = d.employee;
  const row = (k: string, v: React.ReactNode) => <div className="rounded-lg bg-secondary/40 p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v || "—"}</dd></div>;
  return (
    <div className="space-y-5">
      <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {row("الاسم", e.full_name)}{row("الرقم الوظيفي", <bdi dir="ltr">{e.employee_no}</bdi>)}{row("المسمى الوظيفي", e.job_title)}{row("الحالة", STATUS[e.status])}
        {row("تاريخ المباشرة", e.hire_date)}{row("الجوال", e.phone && <bdi dir="ltr">{e.phone}</bdi>)}{row("البريد الوظيفي", e.email && <bdi dir="ltr">{e.email}</bdi>)}{row("الجنس", e.gender ? GENDER[e.gender] : null)}
        {row("رقم الهوية", e.national_id && <bdi dir="ltr">{e.national_id}</bdi>)}{row("الجنسية", e.nationality)}{row("تاريخ الميلاد", e.birth_date)}
      </dl>
      <Section title="تعييناتي">
        <ul className="space-y-2">
          {d.assignments.map((a) => (
            <li key={a.id} className={"rounded-lg border bg-card p-3 text-sm " + (a.active ? "" : "opacity-70")}>
              <span className="block font-semibold">{a.school}{!a.active && " (منتهٍ)"}</span>
              <span className="block text-xs text-muted-foreground">{[a.job_title, a.department, a.manager && `المدير المباشر: ${a.manager}`].filter(Boolean).join(" · ")}</span>
              <span className="block text-xs text-muted-foreground"><bdi dir="ltr">{a.start_date}</bdi> ← {a.end_date ? <bdi dir="ltr">{a.end_date}</bdi> : "مستمر"}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
