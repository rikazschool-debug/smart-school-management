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
import { PermTree } from "@/components/perm-tree";
import { PersonPanel, confirmDiscard } from "@/components/perm-person";
import { StaffWizard } from "@/components/staff-wizard";
import { PasswordInput } from "@/components/password-input";
import { resetStaffPassword } from "@/lib/accounts.functions";
import { useServerFn } from "@tanstack/react-start";
import { BASE_TABS, peopleForTab, type PermPerson } from "@/lib/perm-tabs";

export const Route = createFileRoute("/_authenticated/app/permissions")({
  head: () => ({ meta: [{ title: "إعداد المستخدمين والصلاحيات — ركاز" }, { name: "description", content: "الأدوار والمسميات وصلاحيات الأقسام ونطاقاتها." }] }),
  component: Page,
});

type Sec = { key: string; label: string; parent: string; actions: string[]; scopes: string[]; labels?: Record<string, string>; sensitive?: boolean };
type Catalog = { areas: { key: string; label: string; soon?: boolean }[]; sections: Sec[]; actions: Record<string, string>; scopes: Record<string, string>; locked: string[] };
type Grant = { section: string; action: string; scope: string };
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
      <p className="mb-4 text-sm"><Link to="/app/members" className="text-primary underline">الدعوات والعضويات</Link> — الأدوار الأساسية الحالية تبقى كما هي حتى يُحفظ تعديل صريح.</p>
      <Tabs org={active.orgId} school={active.schoolId} />
    </>
  );
}

function Tabs({ org, school }: { org: string; school: string | null }) {
  const cat = useCatalog();
  const [tab, setTab] = useState<"users" | "roles" | "log">("users");
  const [sub, setSub] = useState<"actions" | "templates">("actions");
  const [wiz, setWiz] = useState(false);
  const [focus, setFocus] = useState<string | null>(null);
  const gt = (g: Grant[]) => (cat.data ? grantText(cat.data, g) : "");
  const T = (k: string, label: string, on: boolean, fn: () => void) => (
    <button key={k} type="button" role="tab" aria-selected={on} onClick={fn} className={"min-h-9 rounded-lg px-4 text-sm " + (on ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted")}>{label}</button>
  );
  return (
    <div className="space-y-5">
      <div role="tablist" className="flex flex-wrap gap-1 rounded-xl border bg-card p-1">
        {T("users", "إدارة المستخدمين", tab === "users", () => setTab("users"))}
        {T("roles", "الأدوار والصلاحيات", tab === "roles", () => setTab("roles"))}
        {T("log", "سجل التغييرات", tab === "log", () => setTab("log"))}
      </div>
      {tab === "users" && cat.data && <UsersBySection org={org} c={cat.data} />}
      {tab === "roles" && (
        <div className="space-y-4">
          <div role="tablist" className="flex flex-wrap gap-2">
            {[["actions", "إضافة وتعديل الموظفين"], ["templates", "قوالب الأدوار والمسميات"]].map(([k, l]) => (
              <Button key={k} size="sm" role="tab" aria-selected={sub === k} variant={sub === k ? "default" : "outline"} onClick={() => setSub(k as "actions" | "templates")}>{l}</Button>
            ))}
          </div>
          {sub === "templates" ? <Roles org={org} /> : wiz && cat.data ? (
            <StaffWizard org={org} school={school} grantText={gt} catalog={cat.data as never} onCancel={() => setWiz(false)} onDone={(uid) => { setWiz(false); setFocus(uid); }} />
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => setWiz(true)} className="rounded-xl border bg-card p-4 text-start hover:border-primary/40">
                  <span className="block font-bold">إضافة موظف جديد</span><span className="text-xs text-muted-foreground">اسم مستخدم وكلمة مرور أولية، الفروع، الدور الأساسي وأدوار إضافية، ثم معاينة قبل الحفظ.</span></button>
                <a href="#edit-staff" className="rounded-xl border bg-card p-4 text-start hover:border-primary/40">
                  <span className="block font-bold">تعديل صلاحيات موظف حالي</span><span className="text-xs text-muted-foreground">اختر الموظف من القائمة أدناه لإضافة دور أو سحبه أو استثناء شخصي أو إعادة كلمة المرور.</span></a>
              </div>
              <div id="edit-staff"><People key={focus ?? ""} org={org} school={school} initialUser={focus} /></div>
            </>
          )}
        </div>
      )}
      {tab === "log" && <Log org={org} />}
    </div>
  );
}

function useDisabled(org: string) {
  return useQuery({ queryKey: ["perm-disabled", org], queryFn: async () => (await call("perm_disabled_areas", { _org: org })) as string[] });
}

function useCatalog() {
  return useQuery({ queryKey: ["perm-catalog"], queryFn: async () => (await call("perm_catalog", {})) as Catalog });
}

function Roles({ org }: { org: string }) {
  const qc = useQueryClient();
  const cat = useCatalog();
  const roles = useQuery({ queryKey: ["perm-roles", org], queryFn: async () => (await call("perm_roles_list", { _org: org })) as Row[] });
  const [edit, setEdit] = useState<{ id: string | null; name: string; description: string; grants: Grant[] } | null>(null);
  const dis = useDisabled(org);
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
          <PermTree c={c} value={edit.grants} onChange={(g) => setEdit({ ...edit, grants: g })} disabledAreas={dis.data ?? []} />
          <p className="text-xs text-muted-foreground">لا تُفوَّض: {c.locked.join("؛ ")}.</p>
          <p className="rounded-lg bg-secondary/50 p-2 text-xs">معاينة ما سيظهر للحساب: {grantText(c, edit.grants) || "لا شيء"}. {edit.id ? "التعديل يسري على جميع حاملي الدور من الطلب التالي؛ الاستثناءات الشخصية تبقى كما هي." : ""}</p>
          <div className="flex gap-2"><Button size="sm" onClick={save}>حفظ</Button><Button size="sm" variant="ghost" onClick={() => setEdit(null)}>إلغاء</Button></div>
        </div>
      )}
    </Section>
  );
}

function People({ org, school, initialUser = null }: { org: string; school: string | null; initialUser?: string | null }) {
  const qc = useQueryClient();
  const cat = useCatalog();
  const roles = useQuery({ queryKey: ["perm-roles", org], queryFn: async () => (await call("perm_roles_list", { _org: org })) as Row[] });
  const people = useQuery({ queryKey: ["perm-people", org], queryFn: async () => (await call("perm_people", { _org: org })) as PermPerson[] });
  const [tab, setTab] = useState("all");
  const [user, setUser] = useState<string | null>(initialUser);
  const [branch, setBranch] = useState(""); const [state, setState] = useState("");
  const logins = useQuery({ queryKey: ["staff-logins", org], queryFn: async () => (await call("staff_logins_list", { _org: org })) as { user_id: string; username: string; pending: boolean }[] });
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
  const cur = tabs.find((t) => t.key === tab) ?? tabs[0]!;
  const branchNames = [...new Set(all.flatMap((p) => p.base.map((b) => b.school).filter(Boolean)))] as string[];
  const login = (id: string) => logins.data?.find((l) => l.user_id === id);
  const list = peopleForTab(all, cur.key).filter((p) => (!q.trim() || p.name.includes(q.trim()) || (login(p.user_id)?.username ?? "").includes(q.trim().toLowerCase()))
    && (!branch || p.base.some((b) => b.school === branch))
    && (!state || (state === "active" ? p.base.some((b) => b.active) && !login(p.user_id)?.pending : state === "pending" ? !!login(p.user_id)?.pending : !p.base.some((b) => b.active) && !login(p.user_id)?.pending)));
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
                <button type="button" aria-current={t.key === cur.key ? "true" : undefined} onClick={async () => { if (!(await confirmDiscard())) return; setTab(t.key); setUser(null); }}
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
              <button type="button" onClick={async () => { if (await confirmDiscard()) setUser(null); }} className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowRight className="size-4" />{cur.label}</button>
              {login(sel.user_id) && <ResetPassword org={org} user={sel.user_id} username={login(sel.user_id)!.username} />}
              <PersonPanel key={sel.user_id} org={org} user={sel.user_id} name={sel.name} c={cat.data!} roles={roles.data!} />
            </>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Input aria-label="بحث بالاسم" placeholder="بحث بالاسم أو اسم المستخدم" className="w-full sm:w-64" value={q} onChange={(e) => setQ(e.target.value)} />
                {branchNames.length > 1 && <select aria-label="الفرع" className={selectCls("w-40")} value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">كل الفروع</option>{branchNames.map((b) => <option key={b}>{b}</option>)}</select>}
                <select aria-label="حالة الحساب" className={selectCls("w-40")} value={state} onChange={(e) => setState(e.target.value)}><option value="">كل الحالات</option><option value="active">نشط</option><option value="pending">بانتظار أول دخول</option><option value="stopped">موقوف</option></select>
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
                          <span className="block truncate font-semibold">{p.name}{login(p.user_id) && <span dir="ltr" className="ms-2 font-mono text-xs font-normal text-muted-foreground">{login(p.user_id)!.username}</span>}{login(p.user_id)?.pending && <span className="ms-2 rounded bg-warning/15 px-1.5 text-xs font-normal">بانتظار أول دخول</span>}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {p.base.map((b) => `${ROLE_LABELS[b.role] ?? b.role}${b.school ? ` — ${b.school}` : ""}${b.active ? "" : " (موقوف)"}`).join("، ") || "—"}
                            {p.roles.length ? ` • ${p.roles.map((id) => roles.data!.find((r) => r["id"] === id)?.["name"]).filter(Boolean).join("، ")}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-primary">إدارة الحساب والصلاحيات</span>
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

function ResetPassword({ org, user, username }: { org: string; user: string; username: string }) {
  const run = useServerFn(resetStaffPassword);
  const qc = useQueryClient();
  const [pw, setPw] = useState(""); const [busy, setBusy] = useState(false);
  async function go() {
    const reason = await askText("سبب إصدار كلمة مرور مؤقتة", { required: true }); if (!reason) return;
    setBusy(true);
    try { await run({ data: { orgId: org, userId: user, password: pw, reason } }); setPw(""); toast.success("صدرت كلمة مرور مؤقتة؛ أُغلقت جلساته وسيُلزم بتغييرها عند الدخول"); qc.invalidateQueries({ queryKey: ["staff-logins", org] }); }
    catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  return (
    <div className="mb-4 space-y-2 rounded-xl border bg-card p-4 text-sm">
      <p className="font-bold">بيانات الدخول</p>
      <p className="text-xs text-muted-foreground">اسم المستخدم: <span dir="ltr" className="font-mono">{username}</span> — كلمة المرور لا تُعرض ولا تُسترجع.</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-64"><PasswordInput aria-label="كلمة مرور مؤقتة جديدة" placeholder="كلمة مرور مؤقتة جديدة" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <Button size="sm" variant="outline" disabled={busy || pw.length < 8} onClick={go}>إصدار كلمة مرور مؤقتة</Button>
      </div>
    </div>
  );
}

/** «إدارة المستخدمين»: main areas → sections → the people who actually hold access there (each person once per section). */
function UsersBySection({ org, c }: { org: string; c: Catalog }) {
  const people = useQuery({ queryKey: ["perm-people", org], queryFn: async () => (await call("perm_people", { _org: org })) as PermPerson[] });
  const secs = useQuery({ queryKey: ["perm-sections", org], queryFn: async () => (await call("perm_section_people", { _org: org })) as { user_id: string; sections: string[] }[] });
  const roles = useQuery({ queryKey: ["perm-roles", org], queryFn: async () => (await call("perm_roles_list", { _org: org })) as Row[] });
  const logins = useQuery({ queryKey: ["staff-logins", org], queryFn: async () => (await call("staff_logins_list", { _org: org })) as { user_id: string; username: string; pending: boolean }[] });
  const dis = useDisabled(org);
  const [area, setArea] = useState("all"); const [sec, setSec] = useState("");
  const [role, setRole] = useState(""); const [branch, setBranch] = useState(""); const [state, setState] = useState(""); const [q, setQ] = useState("");
  const [user, setUser] = useState<string | null>(null);
  if (people.isLoading || secs.isLoading || roles.isLoading) return <LoadingState />;
  if (people.error || secs.error || roles.error) return <ErrorState message={arabicError(people.error ?? secs.error ?? roles.error)} />;
  const all = people.data!;
  const has = new Map(secs.data!.map((x) => [x.user_id, new Set(x.sections)]));
  const inArea = (p: PermPerson, a: string) => c.sections.some((s) => s.parent === a && has.get(p.user_id)?.has(s.key));
  const login = (id: string) => logins.data?.find((l) => l.user_id === id);
  const status = (p: PermPerson) => (login(p.user_id)?.pending ? "pending" : p.base.some((b) => b.active) ? "active" : "stopped");
  const branches = [...new Set(all.flatMap((p) => p.base.map((b) => b.school).filter(Boolean)))] as string[];
  const list = all.filter((p) => (area === "all" || inArea(p, area)) && (!sec || has.get(p.user_id)?.has(sec))
    && (!role || (role.startsWith("base:") ? p.base.some((b) => b.role === role.slice(5)) : p.roles.includes(role)))
    && (!branch || p.base.some((b) => b.school === branch)) && (!state || status(p) === state)
    && (!q.trim() || p.name.includes(q.trim()) || (login(p.user_id)?.username ?? "").includes(q.trim().toLowerCase())));
  const sel = user ? all.find((p) => p.user_id === user) : null;
  const ST: Record<string, string> = { active: "نشط", pending: "بانتظار أول دخول", stopped: "موقوف" };
  if (sel) return (
    <div>
      <button type="button" onClick={() => setUser(null)} className="mb-3 inline-flex items-center gap-1 text-sm text-primary"><ArrowRight className="size-4" />المستخدمون</button>
      {login(sel.user_id) && <ResetPassword org={org} user={sel.user_id} username={login(sel.user_id)!.username} />}
      <PersonPanel org={org} user={sel.user_id} name={sel.name} c={c} roles={roles.data!} />
    </div>
  );
  return (
    <div className="grid gap-4 md:grid-cols-[15rem_minmax(0,1fr)]">
      <nav aria-label="الأقسام">
        <ul className="flex gap-2 overflow-x-auto pb-2 md:flex-col md:gap-1 md:overflow-visible">
          {[{ key: "all", label: "كل المستخدمين", soon: false }, ...c.areas].map((a) => {
            const n = a.key === "all" ? all.length : all.filter((p) => inArea(p, a.key)).length;
            const locked = dis.data?.includes(a.key);
            return (
              <li key={a.key} className="shrink-0">
                <button type="button" aria-current={area === a.key ? "true" : undefined} onClick={() => { setArea(a.key); setSec(""); }}
                  className={"flex w-full items-center justify-between gap-2 whitespace-nowrap rounded-lg border px-3 py-2 text-sm md:border-transparent " + (area === a.key ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-card hover:bg-secondary md:bg-transparent")}>
                  <span className="truncate">{a.label}</span>
                  <span className="text-xs text-muted-foreground">{a.soon ? "تحت الإنشاء" : locked ? "معلّق" : n}</span>
                </button>
              </li>);
          })}
        </ul>
      </nav>
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
          <Input aria-label="بحث" placeholder="بحث بالاسم أو اسم المستخدم" className="w-full sm:w-56" value={q} onChange={(e) => setQ(e.target.value)} />
          {area !== "all" && <select aria-label="القسم الفرعي" className={selectCls("w-44")} value={sec} onChange={(e) => setSec(e.target.value)}>
            <option value="">كل الأقسام الفرعية</option>{c.sections.filter((s) => s.parent === area).map((s) => <option key={s.key} value={s.key}>{s.label} ({all.filter((p) => has.get(p.user_id)?.has(s.key)).length})</option>)}</select>}
          <select aria-label="الدور" className={selectCls("w-44")} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">كل الأدوار</option>
            {BASE_TABS.map((r) => <option key={r} value={`base:${r}`}>{ROLE_LABELS[r]}</option>)}
            {roles.data!.filter((r) => !r["archived"]).map((r) => <option key={r["id"]} value={r["id"]}>{r["name"]}</option>)}
          </select>
          {branches.length > 1 && <select aria-label="الفرع" className={selectCls("w-40")} value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">كل الفروع</option>{branches.map((b) => <option key={b}>{b}</option>)}</select>}
          <select aria-label="حالة الحساب" className={selectCls("w-40")} value={state} onChange={(e) => setState(e.target.value)}><option value="">كل الحالات</option>{Object.entries(ST).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </div>
        <p className="text-xs text-muted-foreground">{list.length} مستخدم — الأعداد من الصلاحيات الفعلية، والشخص يظهر مرة واحدة في كل قسم مخوّل له.</p>
        {!list.length ? <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">لا يوجد مستخدمون مطابقون.</p> : (
          <ul className="divide-y rounded-xl border bg-card">
            {list.map((p) => (
              <li key={p.user_id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{p.name}{login(p.user_id) && <span dir="ltr" className="ms-2 font-mono text-xs font-normal text-muted-foreground">{login(p.user_id)!.username}</span>}
                    <span className={"ms-2 rounded px-1.5 text-xs font-normal " + (status(p) === "active" ? "bg-success/10 text-success" : status(p) === "pending" ? "bg-warning/15" : "bg-muted text-muted-foreground")}>{ST[status(p)]}</span></span>
                  <span className="block text-xs text-muted-foreground">الفروع: {[...new Set(p.base.map((b) => b.school).filter(Boolean))].join("، ") || "—"}</span>
                  <span className="block text-xs text-muted-foreground">الأدوار: {[...new Set(p.base.map((b) => ROLE_LABELS[b.role] ?? b.role)), ...p.roles.map((id) => roles.data!.find((r) => r["id"] === id)?.["name"] as string).filter(Boolean)].join("، ")}</span>
                </span>
                <Button size="sm" variant="outline" onClick={() => setUser(p.user_id)}>إدارة الحساب والصلاحيات</Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
