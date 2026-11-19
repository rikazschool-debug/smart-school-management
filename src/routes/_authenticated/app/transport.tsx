import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/states";
import { UnderConstruction } from "@/components/owner-portal";

export const Route = createFileRoute("/_authenticated/app/transport")({
  head: () => ({ meta: [{ title: "النقل المدرسي — ركاز" }, { name: "description", content: "النقل المدرسي — تحت الإنشاء." }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <>
      <PageHeader title="النقل المدرسي" />
      <UnderConstruction title="تشغيل النقل المدرسي" hint="المسارات وتوزيع الطلاب والتتبع وتطبيق السائق مؤجلة. بيانات الباصات وصيانتها متاحة في «الصيانة والطلبات»." />
    </>
  ),
});
