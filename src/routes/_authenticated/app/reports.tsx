import { createFileRoute } from "@tanstack/react-router";
import { RequireSchool } from "@/components/require-school";
import { ReportBuilder } from "@/components/reports/builder";

export const Route = createFileRoute("/_authenticated/app/reports")({
  head: () => ({ meta: [{ title: "منشئ التقارير — ركاز" }, { name: "description", content: "إعداد تقارير أي قسم في ركاز بفترة محددة وتصديرها PDF أو Excel أو طباعتها." },
    { property: "og:title", content: "منشئ التقارير — ركاز" }, { property: "og:description", content: "تقارير الأقسام بفترة محددة وتصدير PDF وExcel." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: () => <RequireSchool nav="reports">{(ctx) => <ReportBuilder schoolId={ctx.schoolId} schoolName={ctx.schoolName ?? ""} />}</RequireSchool>,
});
