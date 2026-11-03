import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { ErrorState, ForbiddenState, LoadingState, PageHeader, Section } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { askText } from "@/components/confirm";
import { PeoplePicker } from "@/components/people-picker";
import { arabicError, useSession } from "@/lib/session";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { BASE_TABS, peopleForTab, type PermPerson } from "@/lib/perm-tabs";

export const Route = createFileRoute("/_authenticated/app/permissions")({
  head: () => ({ meta: [{ title: "إعداد المستخدمين والصلاحيات — ركاز" }, { name: "description", content: "الأدوار والمسميات وصلاحيات الأقسام ونطاقاتها." }] }),
  component: Page,
});

type Sec = { key: string; label: string; parent: string; actions: string[]; scopes: string[]; labels?: Record<string, string>; sensitive?: boolean };
type Catalog = { areas: { key: string; label: string; soon?: boolean }[]; sections: Sec[]; actions: Record<string, string>; scopes: Record<string, string>; locked: string[] };
type Grant = { section: string; action: string; scope: string };
const SOURCE: Record<string, string> = { owner: "مالك المؤسسة", role: "من دور مسند", override: "تفويض إضافي", deny: "منع خاص", base: "من دوره الأساسي" };
const actLabel = (c: Catalog, section: string, a: string) => c.sections.find((s) => s.key === section)?.labels?.[a] ?? c.actions[a];
const grantText = (c: Catalog, gs: Grant[]) => gs.map((g) => `${actLabel(c, g.section, g.action)} (${c.scopes[g.scope]})`).join("، ");

async function call(fn: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(fn as never, args as never);
  if (error) throw error;
  return data as unknown;
}

function Page() {
  const { active } = useSession();
  if (!active) return null;
  if (active.role !== "org_owner" || !active.orgId) return <ForbiddenState />;
  return (
    <>
      <Link to="/app" className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowRight className="size-4" />الرئيسية</Link>
      <PageHeader title="إعداد المستخدمين والصلاحيات" desc="الدور الوظيفي يحدد الأقسام والإجراءات والنطاق، وهو منفصل عن القسم الأكاديمي والفرع. المنع الخاص يغلب أي منح." />
      <p className="mb-6 text-sm"><Link to="/app/members" className="text-primary underline">المستخدمون والدعوات والعضويات</Link> — الأدوار الأساسية الحالية (معلم، وكيل، مشرف...) تبقى كما هي دون توسيع.</p>
      <div className="space-y-8">
        <People org={active.orgId} school={active.schoolId} />
        <Roles org={active.orgId} />
        <Log org={active.orgId} />
      </div>
    </>
  );
}

function useCatalog() {
  return useQuery({ queryKey: ["perm-catalog"], queryFn: async () => (await call("perm_catalog", {})) as Catalog });
}

function Roles({ org }: { org: string }) {
  const qc = useQueryClient();
  const cat = useCatalog();
  const roles = useQuery({ queryKey: ["perm-roles", org], queryFn: async () => (await call("perm_roles_list", { _org: org })) as Row[] });
  const [edit, setEdit] = useState<{ id: string | null; name: string; description: string; grants: Grant[] } | null>(null);
  if (roles.isLoading || cat.isLoading) return <LoadingState />;
  if (roles.error || cat.error) return <ErrorState message={arabicError(roles.error ?? cat.error)} />;
  const c = cat.data!;
  async function save() {
    if (!edit) return;
    const reason = await askText("سبب التغيير", { required: true, ok: "حفظ" });
    if (!reason) return;
    try { await call("perm_role_save", { _org: org, _id: edit.id, _name: edit.name, _description: edit.description, _grants: edit.grants, _reason: reason }); toast.success("حُفظ الدور"); setEdit(null); qc.invalidateQueries({ queryKey: ["perm-roles", org] }); qc.invalidateQueries({ queryKey: ["perm-eff"] }); }
    catch (e) { toast.error(arabicError(e)); }
  }
  async function archive(r: Row, on: boolean) {
    const reason = await askText(on ? "سبب الأرشفة" : "سبب الاستعادة", { required: true });
    if (!reason) return;
    try { await call("perm_role_archive", { _org: org, _id: r["id"], _archive: on, _reason: reason }); qc.invalidateQueries({ queryKey: ["perm-roles", org] }); qc.invalidateQueries({ queryKey: ["perm-people", org] }); }
    catch (e) { toast.error(arabicError(e)); }
  }
  const setScope = (section: string, action: string, scope: string) => setEdit((e) => e && ({ ...e, grants: [...e.grants.filter((g) => !(g.section === section && g.action === action)), ...(scope ? [{ section, action, scope }] : [])] }));
  return (
    <Section title="الأدوار والمسميات الوظيفية">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setEdit({ id: null, name: "", description: "", grants: [] })}>دور مخصص جديد</Button>
        <select aria-label="ابدأ من قالب" className={selectCls("min-w-0")} value="" onChange={(e) => { const r = roles.data!.find((x) => x["id"] === e.target.value); if (r) setEdit({ id: null, name: `${r["name"]} (مخصص)`, description: r["description"] ?? "", grants: r["grants"] as Grant[] }); }}>
          <option value="">أو ابدأ من دور جاهز (وكيل، أمن، مسؤول مشتريات…)</option>
          {roles.data!.filter((r) => r["system"]).map((r) => <option key={r["id"]} value={r["id"]}>{r["name"]}</option>)}
        </select>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">الأدوار الجاهزة تطابق ما يملكه صاحب الدور اليوم؛ إسنادها لشخص آخر يمنحه هذه الصلاحيات في فرعه فقط ما لم تحدد غير ذلك. لا يتغير شيء لأي حساب قائم تلقائيًا.</p>
      <ul className="divide-y rounded-xl border bg-card">
        {roles.data!.map((r) => (
          <li key={r["id"]} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{r["name"]} <span className="text-xs font-normal text-muted-foreground">{r["system"] ? "قالب النظام" : "مخصص"}{r["archived"] ? " • مؤرشف" : ""} • {r["holders"]} مستخدم</span></span>
              <span className="block text-xs text-muted-foreground">{grantText(c, r["grants"] as Grant[]) || "بلا صلاحيات"}</span>
            </span>
            {r["system"] ? (
              <Button size="sm" variant="outline" onClick={() => setEdit({ id: null, name: `${r["name"]} (نسخة)`, description: r["description"] ?? "", grants: r["grants"] as Grant[] })}>نسخ إلى دور مخصص</Button>
            ) : (<>
              <Button size="sm" variant="outline" onClick={() => setEdit({ id: r["id"], name: r["name"], description: r["description"] ?? "", grants: r["grants"] as Grant[] })}>تعديل</Button>
              <Button size="sm" variant="ghost" onClick={() => archive(r, !r["archived"])}>{r["archived"] ? "استعادة" : "أرشفة"}</Button>
            </>)}
          </li>
        ))}
      </ul>
      {edit && (
        <div className="mt-4 space-y-3 rounded-xl border bg-card p-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="اسم الدور" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <Input placeholder="الوصف" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
          </div>
          {c.areas.map((ar) => (
            <fieldset key={ar.key} className="rounded-lg border p-3">
              <legend className="px-1 text-sm font-bold">{ar.label}</legend>
              {ar.soon ? <p className="text-xs text-muted-foreground">تحت الإنشاء — لا توجد صلاحيات لهذا القسم بعد.</p> : c.sections.filter((s) => s.parent === ar.key).map((s) => (
                <div key={s.key} className="mb-3 last:mb-0">
                  <p className="mb-2 text-sm font-semibold">{s.label}{s.sensitive && <span className="ms-2 text-xs font-normal text-muted-foreground">يتيح الاطلاع على أسماء الطلاب في الفرع</span>}</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {s.actions.map((a) => { const cur = edit.grants.find((g) => g.section === s.key && g.action === a)?.scope ?? ""; return (
                      <label key={a} className="flex items-center gap-2 text-sm"><span className="w-40 shrink-0 text-xs sm:text-sm">{actLabel(c, s.key, a)}</span>
                        <select className={selectCls("w-full min-w-0", true)} value={cur} onChange={(e) => setScope(s.key, a, e.target.value)}>
                          <option value="">لا</option>{s.scopes.map((k) => <option key={k} value={k}>{c.scopes[k]}</option>)}
                        </select></label>); })}
                  </div>
                </div>
              ))}
            </fieldset>
          ))}
          <p className="text-xs text-muted-foreground">لا تُفوَّض: {c.locked.join("؛ ")}.</p>
          <p className="rounded-lg bg-secondary/50 p-2 text-xs">معاينة ما سيظهر للحساب: {grantText(c, edit.grants) || "لا شيء"}. {edit.id ? "التعديل يسري على جميع حاملي الدور من الطلب التالي؛ الاستثناءات الشخصية تبقى كما هي." : ""}</p>
          <div className="flex gap-2"><Button size="sm" onClick={save}>حفظ</Button><Button size="sm" variant="ghost" onClick={() => setEdit(null)}>إلغاء</Button></div>
        </div>
      )}
    </Section>
  );
}

function People({ org, school }: { org: string; school: string | null }) {
  const qc = useQueryClient();
  const cat = useCatalog();
  const roles = useQuery({ queryKey: ["perm-roles", org], queryFn: async () => (await call("perm_roles_list", { _org: org })) as Row[] });
  const people = useQuery({ queryKey: ["perm-people", org], queryFn: async () => (await call("perm_people", { _org: org })) as PermPerson[] });
  const [tab, setTab] = useState("all");
  const [user, setUser] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [add, setAdd] = useState<string[]>([]);
  if (roles.isLoading || people.isLoading || cat.isLoading) return <LoadingState />;
  if (roles.error || people.error || cat.error) return <ErrorState message={arabicError(roles.error ?? people.error ?? cat.error)} />;
  const all = people.data!;
  const tabs = [
    { key: "all", label: "كل الموظفين", n: all.length },
    ...BASE_TABS.map((r) => ({ key: `base:${r}`, label: ROLE_LABELS[r], n: peopleForTab(all, `base:${r}`).length })).filter((t) => t.n > 0),
    ...roles.data!.filter((r) => !r["archived"]).map((r) => ({ key: `role:${r["id"]}`, label: r["name"] as string, n: Number(r["holders"]), extra: true })),
  ];
  const cur = tabs.find((t) => t.key === tab) ?? tabs[0];
  const list = peopleForTab(all, cur.key).filter((p) => !q.trim() || p.name.includes(q.trim()));
  const sel = user ? all.find((p) => p.user_id === user) : null;
  const roleId = cur.key.startsWith("role:") ? cur.key.slice(5) : null;
  async function assignToRole() {
    if (!roleId || !add[0]) return;
    const reason = await askText("سبب إسناد الدور", { required: true }); if (!reason) return;
    try { await call("perm_assign", { _org: org, _user: add[0], _role: roleId, _assign: true, _school_ids: null, _limit: null, _reason: reason }); toast.success("أُسند الدور"); setAdd([]);
      qc.invalidateQueries({ queryKey: ["perm-people", org] }); qc.invalidateQueries({ queryKey: ["perm-roles", org] }); qc.invalidateQueries({ queryKey: ["perm-log", org] }); qc.invalidateQueries({ queryKey: ["perm-eff"] }); }
    catch (e) { toast.error(arabicError(e)); }
  }
  return (
    <Section title="الصلاحيات حسب الدور">
      <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="الأدوار" className={`${sel ? "hidden md:block" : ""}`}>
          <ul className="flex gap-2 overflow-x-auto pb-2 md:flex-col md:gap-1 md:overflow-visible md:pb-0">
            {tabs.map((t, i) => (
              <li key={t.key} className="shrink-0">
                {"extra" in t && !("extra" in (tabs[i - 1] ?? {})) && <p className="mb-1 mt-3 hidden px-2 text-xs font-semibold text-muted-foreground md:block">أدوار الصلاحيات</p>}
                <button type="button" aria-current={t.key === cur.key ? "true" : undefined} onClick={() => { setTab(t.key); setUser(null); }}
                  className={`flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-sm md:border-transparent ${t.key === cur.key ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card hover:bg-secondary md:bg-transparent"}`}>
                  <span className="truncate">{t.label}</span><span className="text-xs text-muted-foreground">{t.n}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0">
          {sel ? (
            <>
              <button type="button" onClick={() => setUser(null)} className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowRight className="size-4" />{cur.label}</button>
              <PersonPanel org={org} user={sel.user_id} name={sel.name} c={cat.data!} roles={roles.data!} />
            </>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Input aria-label="بحث بالاسم" placeholder="بحث بالاسم" className="w-full sm:w-64" value={q} onChange={(e) => setQ(e.target.value)} />
                {roleId && <p className="text-xs text-muted-foreground">يحمل: {grantText(cat.data!, (roles.data!.find((r) => r["id"] === roleId)?.["grants"] as Grant[]) ?? []) || "بلا صلاحيات"}</p>}
              </div>
              {roleId && (
                <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
                  <div className="min-w-0 flex-1"><PeoplePicker purpose="perm" school={school} org={org} single value={add} onChange={setAdd} label="إضافة شخص إلى هذا الدور" showBranch /></div>
                  <Button size="sm" disabled={!add[0]} onClick={assignToRole}>إسناد</Button>
                </div>
              )}
              {!list.length ? <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">لا يوجد أشخاص في هذا التبويب.</p> : (
                <ul className="divide-y rounded-xl border bg-card">
                  {list.map((p) => (
                    <li key={p.user_id}>
                      <button type="button" onClick={() => setUser(p.user_id)} className="flex min-h-12 w-full items-center gap-3 p-3 text-start text-sm hover:bg-secondary/50">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{p.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {p.base.map((b) => `${ROLE_LABELS[b.role] ?? b.role}${b.school ? ` — ${b.school}` : ""}${b.active ? "" : " (موقوف)"}`).join("، ") || "—"}
                            {p.roles.length ? ` • ${p.roles.map((id) => roles.data!.find((r) => r["id"] === id)?.["name"]).filter(Boolean).join("، ")}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-primary">الصلاحيات</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </Section>
  );
}

function PersonPanel({ org, user, name, c, roles }: { org: string; user: string; name: string; c: Catalog; roles: Row[] }) {
  const qc = useQueryClient();
  const eff = useQuery({ queryKey: ["perm-eff", org, user], queryFn: async () => (await call("perm_effective", { _org: org, _user: user })) as Row });
  const [role, setRole] = useState(""); const [limit, setLimit] = useState("");
  const refresh = () => { for (const k of [["perm-eff", org, user], ["perm-roles", org], ["perm-log", org], ["perm-people", org]]) qc.invalidateQueries({ queryKey: k }); };
  async function run(fn: string, args: Record<string, unknown>, ask: string) {
    const reason = await askText(ask, { required: true }); if (!reason) return;
    try { await call(fn, { ...args, _reason: reason }); toast.success("تم الحفظ"); refresh(); } catch (e) { toast.error(arabicError(e)); }
  }
  if (eff.isLoading) return <LoadingState />;
  if (eff.error) return <ErrorState message={arabicError(eff.error)} />;
  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 text-sm">
      <div>
        <p className="text-base font-bold">{name}</p>
        <p className="text-xs text-muted-foreground">الدور الأساسي: {(eff.data!["base_roles"] as Row[]).map((b) => `${ROLE_LABELS[b["role"] as Role] ?? b["role"]}${b["school"] ? ` — ${b["school"]}` : ""}`).join("، ") || "—"}</p>
      </div>
      <div>
        <p className="mb-2 font-bold">الأدوار المسندة</p>
        {!(eff.data!["roles"] as Row[]).length ? <p className="text-muted-foreground">لا أدوار إضافية.</p> : (
          <ul className="space-y-1">{(eff.data!["roles"] as Row[]).map((r) => (
            <li key={r["id"]} className="flex flex-wrap items-center gap-2">{r["name"]}{r["approval_limit"] != null && ` — حد الاعتماد ${r["approval_limit"]} ر.س`}
              <Button size="sm" variant="ghost" onClick={() => run("perm_assign", { _org: org, _user: user, _role: r["id"], _assign: false, _school_ids: null, _limit: null }, "سبب سحب الدور")}>سحب</Button></li>))}</ul>
        )}
        {!eff.data!["is_owner"] && (
          <div className="mt-2 flex flex-wrap gap-2">
            <select aria-label="اختر دورًا" className={selectCls("min-w-0 flex-1 sm:flex-none")} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">اختر دورًا</option>{roles.filter((r) => !r["archived"]).map((r) => <option key={r["id"]} value={r["id"]}>{r["name"]}</option>)}
            </select>
            <Input className="w-full sm:w-40" inputMode="decimal" placeholder="حد الاعتماد (اختياري)" value={limit} onChange={(e) => setLimit(e.target.value)} />
            <Button size="sm" disabled={!role} onClick={() => run("perm_assign", { _org: org, _user: user, _role: role, _assign: true, _school_ids: null, _limit: limit ? Number(limit) : null }, "سبب إسناد الدور")}>إسناد</Button>
          </div>
        )}
        {role && <p className="mt-1 text-xs text-muted-foreground">سيُحمَّل: {grantText(c, (roles.find((r) => r["id"] === role)?.["grants"] as Grant[] | undefined) ?? []) || "لا شيء"}</p>}
      </div>
      <EffectiveList c={c} eff={eff.data!} onOverride={(section, action, effect, scope, ask) => run("perm_override_set", { _org: org, _user: user, _section: section, _action: action, _effect: effect, _scope: scope }, ask)} />
    </div>
  );
}

const ACT: Record<string, string> = { role_create: "إنشاء دور", role_update: "تعديل دور", role_archive: "أرشفة دور", role_restore: "استعادة دور", assign: "إسناد دور", unassign: "سحب دور", override: "استثناء شخصي" };
function Log({ org }: { org: string }) {
  const q = useQuery({ queryKey: ["perm-log", org], queryFn: async () => (await call("perm_log_list", { _org: org })) as Row[] });
  return (
    <Section title="سجل تغييرات الصلاحيات">
      {q.isLoading ? <LoadingState rows={2} /> : !q.data?.length ? <p className="text-sm text-muted-foreground">لا تغييرات بعد.</p> : (
        <ul className="max-h-72 space-y-1 overflow-auto rounded-xl border bg-card p-3 text-xs">
          {q.data.map((l, i) => <li key={i}>{new Date(l["at"]).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })} — {l["actor"]}: {ACT[l["action"]] ?? l["action"]} {l["role"] ?? ""} {l["target"] ? `← ${l["target"]}` : ""} ({l["reason"]})</li>)}
        </ul>
      )}
    </Section>
  );
}

function EffectiveList({ c, eff, onOverride }: { c: Catalog; eff: Row; onOverride: (section: string, action: string, effect: string | null, scope: string | null, ask: string) => void }) {
  const list = eff["effective"] as Row[];
  return (
    <div className="space-y-3">
      <p className="font-bold">الصلاحيات الفعلية</p>
      {c.sections.map((s) => (
        <div key={s.key}>
          <p className="mb-1 text-xs font-semibold text-muted-foreground">{c.areas.find((a) => a.key === s.parent)?.label} ← {s.label}</p>
          <ul className="divide-y rounded-lg border">
            {list.filter((e) => e["section"] === s.key).map((e) => {
              const where = s.key === "procurement" ? (e["scope"] ? c.scopes[e["scope"]] : "") : (e["allowed_schools"] as string[]).join("، ");
              const on = s.key === "procurement" ? !!e["scope"] : (e["allowed_schools"] as string[]).length > 0;
              return (
                <li key={e["action"]} className="flex flex-wrap items-center gap-2 p-2">
                  <span className="w-44 shrink-0">{actLabel(c, s.key, e["action"])}</span>
                  <span className="min-w-0 flex-1 text-xs">{e["source"] === "deny" ? "ممنوع (منع خاص)" : on ? `${where} — ${SOURCE[e["source"]] ?? ""}` : "غير مسموح"}</span>
                  {!eff["is_owner"] && (<>
                    <Button size="sm" variant="ghost" onClick={() => onOverride(s.key, e["action"], "deny", null, "سبب المنع")}>منع</Button>
                    <Button size="sm" variant="ghost" onClick={() => onOverride(s.key, e["action"], "grant", "branch", s.key === "procurement" ? "سبب التفويض (نطاق: فروعه)" : "سبب التفويض (في الفروع التي يعمل بها)")}>تفويض</Button>
                    {(e["source"] === "deny" || e["source"] === "override") && <Button size="sm" variant="ghost" onClick={() => onOverride(s.key, e["action"], null, null, "سبب إزالة الاستثناء")}>إزالة الاستثناء</Button>}
                  </>)}
                </li>);
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
