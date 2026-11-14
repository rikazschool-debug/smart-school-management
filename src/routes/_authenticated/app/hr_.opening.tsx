import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { HrPageTop } from "@/components/hr/navigation";
import { PageHeader } from "@/components/states";
import { useSession } from "@/lib/session";
import { OpeningBalances } from "@/components/hr/p10";

type Search = { k?: "leave" | "advance" };
export const Route = createFileRoute("/_authenticated/app/hr_/opening")({
  validateSearch: (s: Record<string, unknown>): Search => (s["k"] === "advance" ? { k: "advance" } : {}),
  head: () => ({ meta: [{ title: "ترحيل الأرصدة الافتتاحية — ركاز" }, { name: "description", content: "ترحيل أرصدة الإجازات والسلف القائمة من النظام السابق بمعاينة ومطابقة واعتماد من شخص ثانٍ." }, { property: "og:title", content: "ترحيل الأرصدة الافتتاحية — ركاز" }, { property: "og:description", content: "أرصدة افتتاحية للإجازات والسلف بمطابقة المصدر." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});

function Page() {
  const { active } = useSession();
  const { k = "leave" } = Route.useSearch();
  const nav = useNavigate({ from: "/app/hr/opening" });
  if (!active) return null;
  return (
    <>
      <HrPageTop title="ترحيل الأرصدة الافتتاحية" desc="ارفع الملف ← معاينة لكل صف ← حفظ مع إجمالي المصدر ← يعتمد شخص آخر بعد المطابقة. إعادة رفع الملف نفسه لا تكرر شيئًا." />
      <nav aria-label="نوع الرصيد" className="mb-4 flex gap-2 text-sm">
        {([["leave", "أرصدة الإجازات"], ["advance", "السلف القائمة"]] as const).map(([v, l]) => <button key={v} type="button" onClick={() => nav({ search: v === "leave" ? {} : { k: v } })} className={"rounded-lg px-3 py-1.5 " + (k === v ? "bg-primary text-primary-foreground" : "border bg-card hover:border-primary")} aria-current={k === v ? "page" : undefined}>{l}</button>)}
      </nav>
      {active.orgId && <OpeningBalances key={k} org={active.orgId} kind={k} />}
    </>
  );
}
