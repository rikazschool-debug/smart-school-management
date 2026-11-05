import type React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ask, askText } from "@/components/confirm";
import { VersionCard } from "@/components/hr/version-card";
import { C_STATUS, type CDetail, type CVersion } from "@/components/hr/contracts-shared";
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
      ) : <><MyFile d={mine.data} /><MyContracts org={org!} /></>}
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

function MyContracts({ org }: { org: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["hr-my-contracts", org], queryFn: () => rpc<CDetail[]>("hr_my_contracts", { _org: org }) });
  const ack = useMutation({
    mutationFn: (a: { id: string; version: number; decision: "accept" | "reject"; reason: string | null }) => rpc("hr_contract_ack", { _id: a.id, _version: a.version, _decision: a.decision, _reason: a.reason, _paper: false }),
    onSuccess: () => { toast.success("سُجّل قرارك"); qc.invalidateQueries({ queryKey: ["hr-my-contracts"] }); },
    onError: (e) => { toast.error(arabicError(e)); qc.invalidateQueries({ queryKey: ["hr-my-contracts"] }); },
  });
  const decide = async (id: string, v: CVersion, decision: "accept" | "reject") => {
    if (decision === "accept") { if (await ask(`قبول الإصدار ${v.version} من العقد؟ يُسجَّل قبولك ووقته ورقم الإصدار، ولا يُعدّل هذا الإصدار بعده.`, { ok: "قبول" })) ack.mutate({ id, version: v.version, decision, reason: null }); }
    else { const r = await askText("سبب الرفض", { required: true, ok: "رفض" }); if (r) ack.mutate({ id, version: v.version, decision, reason: r }); }
  };
  if (q.isLoading) return <LoadingState rows={1} />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  if (!q.data!.length) return null;
  return (
    <Section title="عقدي" desc="عقودك فقط. الإقرار هنا إقرار داخلي في ركاز، وليس توقيعًا إلكترونيًا موثقًا من جهة خارجية." className="mt-6">
      <ul className="space-y-3">
        {q.data!.map((d) => {
          const pending = d.versions.find((v) => v.status === "issued");
          return (
            <li key={d.contract.id} className="space-y-2 rounded-xl border bg-card p-3 text-sm">
              <p className="font-semibold">العقد <bdi dir="ltr">{d.contract.contract_no}</bdi> · {d.contract.school} · {C_STATUS[d.contract.status]}</p>
              {pending && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-warning/10 p-2">
                  <span className="flex-1">الإصدار {pending.version} بانتظار قرارك.</span>
                  <Button size="sm" disabled={ack.isPending} onClick={() => decide(d.contract.id, pending, "accept")}>قبول</Button>
                  <Button size="sm" variant="outline" disabled={ack.isPending} onClick={() => decide(d.contract.id, pending, "reject")}>رفض</Button>
                </div>
              )}
              <ul className="space-y-2">{d.versions.map((v) => <VersionCard key={v.id} v={v} current={v.version === d.contract.in_force} />)}</ul>
            </li>
          );
        })}
      </ul>
    </Section>
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
