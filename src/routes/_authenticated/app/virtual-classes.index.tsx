import { createFileRoute } from "@tanstack/react-router";
import { VirtualClasses } from "@/components/virtual-classes";
import { EmptyState, ForbiddenState, PageHeader } from "@/components/states";
import { useSession } from "@/lib/session";
import { NAV_BY_ROLE } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/app/virtual-classes/")({
  head: () => ({ meta: [{ title: "الحصص الافتراضية | ركاز" }, { name: "description", content: "جدولة حصص افتراضية للفصول بالصوت ومشاركة الشاشة مع سجل حضور المعلمين والطلاب" }] }),
  component: Page,
});

function Page() {
  const { active } = useSession();
  if (!active || !NAV_BY_ROLE[active.role].includes("virtual")) return <ForbiddenState />;
  if (!active.schoolId) return <EmptyState title="اختر مدرسة أولًا" hint="الحصص الافتراضية تُدار لكل مدرسة من قائمة المدارس أعلى الصفحة." />;
  const manage = active.role === "principal" || active.role === "org_owner";
  return (
    <>
      <PageHeader title="الحصص الافتراضية" desc="صوت جماعي ومشاركة شاشة لطلاب الفصل — جدولة مستقلة عن الجدول المدرسي، مع سجل حضور بالتوقيت." />
      <VirtualClasses school={active.schoolId} canManage={manage} isStudent={active.role === "student"} />
    </>
  );
}
