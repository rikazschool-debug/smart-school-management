import { createFileRoute, Link } from "@tanstack/react-router";
import { RequireSchool } from "@/components/require-school";
import { ReportBuilder } from "@/components/reports/builder";

export const Route = createFileRoute("/_authenticated/app/reports")({
  head: () => ({ meta: [{ title: "منشئ التقارير — ركاز" }, { name: "description", content: "إعداد تقارير أي قسم في ركاز بفترة محددة وتصديرها PDF أو Excel أو طباعتها." },
    { property: "og:title", content: "منشئ التقارير — ركاز" }, { property: "og:description", content: "تقارير الأقسام بفترة محددة وتصدير PDF وExcel." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <RequireSchool nav="reports">{(ctx) => (<div className="space-y-3"><Link to="/app/auto-reports" className="inline-block text-sm font-semibold text-primary hover:underline">تقارير الأتمتة المشتركة معي ←</Link><ReportBuilder schoolId={ctx.schoolId} orgId={ctx.orgId ?? ""} schoolName={ctx.schoolName ?? ""} /></div>)}</RequireSchool>,
});
