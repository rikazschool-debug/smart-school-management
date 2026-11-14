import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ErrorState, LoadingState, PageHeader, Section } from "@/components/states";
import { arabicError } from "@/lib/session";
import { rpc } from "@/components/hr/shared";
import { NoticeFiles } from "@/components/comm/notice-files";

// Recipient view of a sent notice; bc_my allows only actual recipients or scoped viewers.
export const Route = createFileRoute("/_authenticated/app/notice/$id")({
  head: () => ({ meta: [{ title: "إشعار — ركاز" }, { name: "description", content: "تفاصيل الإشعار ومرفقاته" }, { property: "og:title", content: "إشعار — ركاز" }, { property: "og:description", content: "تفاصيل الإشعار ومرفقاته" }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Page,
});

type My = { id: string; ref: string; title: string; body: string; sent_at: string; sender: string };

function Page() {
  const { id } = Route.useParams();
  const q = useQuery({ queryKey: ["bc-my", id], queryFn: () => rpc<My>("bc_my", { _id: id }) });
  return (
    <div className="space-y-4">
      <PageHeader title="إشعار" />
      {q.isLoading ? <LoadingState rows={2} /> : q.error ? <ErrorState message={arabicError(q.error)} /> : (
        <Section title={q.data!.title} desc={`${q.data!.ref} · ${q.data!.sender} · ${new Date(q.data!.sent_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}`}>
          <p className="whitespace-pre-wrap text-sm">{q.data!.body}</p>
          <div className="mt-3"><NoticeFiles id={id} editable={false} /></div>
        </Section>
      )}
    </div>
  );
}
