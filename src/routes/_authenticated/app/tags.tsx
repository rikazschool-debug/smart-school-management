import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, ForbiddenState, LoadingState, EmptyState } from "@/components/states";
import { useSession } from "@/lib/session";
import { TagsAdmin } from "@/components/people/tags-admin";
import { KIND_LABEL, TagChip, usePpCaps, useSchoolOrg, useTags, type PersonKind } from "@/components/people/shared";

export const Route = createFileRoute("/_authenticated/app/tags")({
  component: Page,
  head: () => ({ meta: [{ title: "الوسوم — ركاز" }, { name: "description", content: "وسوم الطلاب والمعلمين وأولياء الأمور الداخلية" }] }),
});

const KINDS: PersonKind[] = ["student", "teacher", "guardian"];

/** Tags dictionary grouped by person type; server (pp_caps / pp_tag_list / pp_tag_save) decides access. */
function Page() {
  const { active } = useSession();
  const schoolId = active?.schoolId ?? null;
  const caps = usePpCaps(schoolId);
  const org = useSchoolOrg(schoolId).data;
  const tags = useTags(org, !!caps.data?.view);
  if (!active) return <ForbiddenState />;
  if (!schoolId) return <EmptyState title="اختر مدرسة من شريط السياق أولًا" />;
  if (caps.isLoading) return <LoadingState />;
  if (!caps.data?.view) return <ForbiddenState />;
  return (
    <>
      <PageHeader title="الوسوم" desc="وسوم داخلية للطلاب والمعلمين وأولياء الأمور — لا تمنح صلاحيات ولا تظهر لصاحب الحساب." />
      <div className="grid gap-3 md:grid-cols-3">
        {KINDS.map((k) => {
          const list = (tags.data ?? []).filter((t) => t.kinds.includes(k));
          return (
            <section key={k} className="rounded-xl border bg-card p-3">
              <h2 className="mb-2 font-bold">وسوم {KIND_LABEL[k]} <span className="text-xs font-normal text-muted-foreground">({list.length})</span></h2>
              {list.length ? (
                <ul className="space-y-1.5">
                  {list.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm">
                      <TagChip t={t} />{!t.active && <span className="rounded bg-muted px-1.5 text-xs">معطل</span>}
                      <span className="ms-auto text-xs text-muted-foreground">{t.uses ?? 0} إسناد</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">لا وسوم بعد.</p>}
            </section>
          );
        })}
      </div>
      {caps.data.tags_manage && org && <div className="mt-4"><TagsAdmin org={org} defaultOpen /></div>}
    </>
  );
}
