import { createFileRoute } from "@tanstack/react-router";
import { Home } from "@/components/dashboard/home";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({ meta: [
    { title: "الرئيسية — لوحة ركاز" },
    { name: "description", content: "الرئيسية في ركاز: الجدول والأعمال والأقسام المتاحة لكل حساب مدرسي." },
    { property: "og:title", content: "الرئيسية — لوحة ركاز" },
    { property: "og:description", content: "الرئيسية في ركاز: الجدول والأعمال والأقسام المتاحة لكل حساب مدرسي." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: Page,
});

function Page() {
  return <Home />;
}
