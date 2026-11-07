import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useSession } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/roles";
import { PageHeader, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";

// After ID sign-in: a person with more than one role (e.g. staff + guardian) picks which one to open.
// Choosing only changes the displayed workspace; every permission is still checked by the server for that membership.
export const Route = createFileRoute("/_authenticated/app/choose-role")({
  head: () => ({ meta: [{ title: "اختيار الصفة — ركاز" }, { name: "description", content: "اختر الصفة التي تريد الدخول بها." }] }),
  component: ChooseRole,
});

function ChooseRole() {
  const { contexts, setActive, loading } = useSession();
  const navigate = useNavigate();
  const roles = new Set(contexts.map((c) => c.role));
  useEffect(() => {
    if (!loading && roles.size <= 1) {
      if (contexts[0]) setActive(contexts[0].key);
      void navigate({ to: "/app", replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, contexts.length]);
  if (loading || roles.size <= 1) return <LoadingState />;
  return (
    <>
      <PageHeader title="اختر الصفة" desc="لديك أكثر من صفة في ركاز. اختر الصفة التي تريد الدخول بها، ويمكنك التبديل لاحقًا من شريط السياق." />
      <div className="grid gap-3 sm:grid-cols-2">
        {contexts.map((c) => (
          <Button key={c.key} variant="outline" className="h-auto flex-col items-start gap-1 p-4 text-start" onClick={() => { setActive(c.key); void navigate({ to: "/app" }); }}>
            <span className="font-semibold">{ROLE_LABELS[c.role]}</span>
            <span className="text-xs text-muted-foreground">{c.schoolName}{c.orgName ? ` — ${c.orgName}` : ""}</span>
          </Button>
        ))}
      </div>
    </>
  );
}
