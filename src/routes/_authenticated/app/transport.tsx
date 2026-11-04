import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/states";
import { UnderConstruction } from "@/components/owner-portal";

export const Route = createFileRoute("/_authenticated/app/transport")({
  head: () => ({ meta: [{ title: "النقل المدرسي — ركاز" }, { name: "description", content: "النقل المدرسي — تحت الإنشاء." }, { name: "robots", content: "noindex" }] }),
  component: () => (
    <>
      <Link to="/app/operations" className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowRight className="size-4" />النقل المدرسي والصيانة</Link>
      <PageHeader title="النقل المدرسي" />
      <UnderConstruction title="تشغيل النقل المدرسي" hint="المسارات وتوزيع الطلاب والتتبع وتطبيق السائق مؤجلة. بيانات الباصات وصيانتها متاحة في «الصيانة والطلبات»." />
    </>
  ),
});
