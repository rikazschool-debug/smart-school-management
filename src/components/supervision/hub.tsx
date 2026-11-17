import { useQuery } from "@tanstack/react-query";
import { ClipboardList, FileStack, GraduationCap, KeyRound, ShieldCheck, Users } from "lucide-react";
import { db } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { arabicError, useSession } from "@/lib/session";
import { Assignments } from "./assign";
import { Delegations } from "./delegations";
import { FormLibrary } from "./forms";
import { Records } from "./records";
import { PlansVisits } from "./work";
import { TeachersDevelopment } from "./pd";
import type { SvMe, SvSearch, SvTab } from "./model";

export function SupervisionHub({ sp, go }: { sp: SvSearch; go: (s: SvSearch, replace?: boolean) => void }) {
  const { active } = useSession(); const org = active?.orgId;
  const me = useQuery({ queryKey: ["sv-me", org], enabled: !!org, queryFn: async () => { const r = await db.rpc("sv_me", { _org: org }); if (r.error) throw r.error; return r.data as SvMe; } });
  if (!org) return <EmptyState title="اختر المؤسسة أولًا" />;
  if (me.isLoading) return <LoadingState />; if (me.error || !me.data) return <ErrorState message={arabicError(me.error)} onRetry={() => me.refetch()} />;
  const m = me.data; const anyPrincipal = m.schools.some((s) => s.principal); const anySup = m.schools.some((s) => s.supervisor) || m.live.length > 0;
  const tabs: { id: SvTab; label: string; hint: string; icon: typeof Users; on: boolean }[] = [
    { id: "work", label: "الخطط والزيارات", hint: "التخطيط والجدولة والمتابعة", icon: ClipboardList, on: true },
    { id: "pd", label: "المعلمون والتطوير", hint: "الاحتياجات والخطط والبرامج", icon: GraduationCap, on: true },
    { id: "records", label: "السجلات الإشرافية", hint: "مسودات ومراجعة واعتماد", icon: ClipboardList, on: true },
    { id: "assign", label: "الإسناد الإشرافي", hint: "المشرف والفرع والمعلمون", icon: Users, on: m.owner || anyPrincipal || anySup || m.schools.some((s) => s.can_assign) },
    { id: "forms", label: "مكتبة النماذج", hint: "التعريفات والإصدارات", icon: FileStack, on: m.owner || m.forms_admin || anyPrincipal || anySup },
    { id: "deleg", label: "التفويضات", hint: "بالعمل والنطاق والمدة", icon: KeyRound, on: m.owner },
  ];
  const shown = tabs.filter((t) => t.on); const cur = sp.tab && shown.some((t) => t.id === sp.tab) ? sp.tab : "records";
  return <div className="space-y-5">
    <PageHeader title="الإشراف التربوي" desc="الإسناد، والنماذج وإصداراتها، والسجلات ومراجعتها واعتمادها" />
    <p className="flex items-start gap-2 text-sm text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0" />يعمل المشرف داخل فرعه وإسناده الساري فقط، ويعتمد مدير المدرسة التقرير النهائي. لا أحد يعتمد عمله، ولا درجات أو أوزان غير معتمدة.</p>
    {shown.length > 1 && <nav aria-label="أقسام الإشراف التربوي" className="rounded-2xl border bg-gradient-to-b from-card to-muted/40 p-2 shadow-sm">
      <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] lg:grid lg:grid-cols-6 lg:overflow-visible">
        {shown.map((t) => { const on = cur === t.id; return <button key={t.id} type="button" aria-label={t.label} aria-current={on ? "page" : undefined} onClick={() => go({ tab: t.id })} className={`flex min-w-[10rem] shrink-0 items-center gap-2 rounded-xl px-2.5 py-2.5 text-start transition-all lg:min-w-0 ${on ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25" : "hover:bg-card hover:shadow-md"}`}>
          <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${on ? "bg-primary-foreground/15" : "bg-primary/10 text-primary"}`}><t.icon className="size-4" /></span>
          <span className="min-w-0"><span className="block truncate text-sm font-semibold">{t.label}</span><span className={`block truncate text-[11px] ${on ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{t.hint}</span></span></button>; })}
      </div></nav>}
    {cur === "records" && <Records org={org} me={m} openId={sp.id} onSel={(id) => go({ tab: "records", ...(id ? { id } : {}) }, false)} />}
    {cur === "pd" && <TeachersDevelopment org={org} me={m} sp={sp} go={go} />}
    {cur === "work" && <PlansVisits org={org} me={m} sp={sp} go={go} />}
    {cur === "assign" && <Assignments org={org} me={m} />}
    {cur === "forms" && <FormLibrary org={org} me={m} />}
    {cur === "deleg" && <Delegations org={org} me={m} />}
  </div>;
}
