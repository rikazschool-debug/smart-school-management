import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Users, GraduationCap, Building2, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/roles";
import { LoadingState } from "@/components/states";

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
  // non-teaching staff on a teacher-type membership show their permission template name (server: my_membership_titles)
  const titles = useQuery({ queryKey: ["my-membership-titles"], queryFn: async () => {
    const r = await supabase.rpc("my_membership_titles" as never);
    if (r.error) return {} as Record<string, string>;
    return Object.fromEntries(((r.data ?? []) as { membership_id: string; title: string | null }[]).filter((x) => x.title).map((x) => [x.membership_id, x.title!]));
  } });
  useEffect(() => {
    if (!loading && roles.size <= 1) {
      if (contexts[0]) setActive(contexts[0].key);
      void navigate({ to: "/app", replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, contexts.length]);
  if (loading || roles.size <= 1) return <LoadingState />;
  return (
    <div className="mx-auto max-w-3xl py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold">أهلًا بك في ركاز</h1>
        <p className="mt-2 text-muted-foreground">لديك أكثر من صفة. اختر الصفة التي تريد الدخول بها، ويمكنك التبديل لاحقًا من شريط السياق.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {contexts.map((c) => {
          const label = titles.data?.[c.key] ?? ROLE_LABELS[c.role];
          const Icon = c.role === "guardian" ? Users : c.role === "student" ? GraduationCap : Briefcase;
          const kind = c.role === "guardian" ? "حساب الأسرة" : c.role === "student" ? "حساب الطالب" : "حساب الموظف";
          return (
            <button key={c.key} type="button" onClick={() => { setActive(c.key); void navigate({ to: "/app" }); }}
              className="group relative overflow-hidden rounded-2xl border bg-card p-6 text-start shadow-sm transition hover:-translate-y-0.5 hover:border-primary hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-primary to-primary/30" />
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-7 w-7" /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-muted-foreground">{kind}</div>
                  <div className="mt-1 text-lg font-bold">{label}</div>
                  <div className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground"><Building2 className="h-4 w-4 shrink-0" /><span className="truncate">{c.schoolName}</span></div>
                  {c.orgName && <div className="mt-1 truncate text-xs text-muted-foreground">{c.orgName}</div>}
                </div>
                <ChevronLeft className="h-5 w-5 self-center text-muted-foreground transition group-hover:-translate-x-1 group-hover:text-primary" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
