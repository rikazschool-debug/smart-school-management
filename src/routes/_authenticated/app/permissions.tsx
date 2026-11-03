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

export const Route = createFileRoute("/_authenticated/app/permissions")({
  head: () => ({ meta: [{ title: "إعداد المستخدمين والصلاحيات — ركاز" }, { name: "description", content: "الأدوار والمسميات وصلاحيات الأقسام ونطاقاتها." }] }),
  component: Page,
});

type Catalog = { sections: { key: string; label: string; actions: string[] }[]; actions: Record<string, string>; scopes: Record<string, string> };
type Grant = { section: string; action: string; scope: string };
const SOURCE: Record<string, string> = { owner: "مالك المؤسسة", role: "من الدور", override: "تفويض إضافي", deny: "منع خاص" };

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
        <Roles org={active.orgId} />
        <Person org={active.orgId} school={active.schoolId} />
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
    try { await call("perm_role_archive", { _org: org, _id: r["id"], _archive: on, _reason: reason }); qc.invalidateQueries({ queryKey: ["perm-roles", org] }); }
    catch (e) { toast.error(arabicError(e)); }
  }
  const setScope = (section: string, action: string, scope: string) => setEdit((e) => e && ({ ...e, grants: [...e.grants.filter((g) => !(g.section === section && g.action === action)), ...(scope ? [{ section, action, scope }] : [])] }));
  return (
    <Section title="الأدوار والمسميات الوظيفية">
      <div className="mb-3"><Button size="sm" onClick={() => setEdit({ id: null, name: "", description: "", grants: [] })}>دور مخصص جديد</Button></div>
      <ul className="divide-y rounded-xl border bg-card">
        {roles.data!.map((r) => (
          <li key={r["id"]} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{r["name"]} <span className="text-xs font-normal text-muted-foreground">{r["system"] ? "قالب النظام" : "مخصص"}{r["archived"] ? " • مؤرشف" : ""} • {r["holders"]} مستخدم</span></span>
              <span className="block text-xs text-muted-foreground">{(r["grants"] as Grant[]).map((g) => `${c.actions[g.action]} (${c.scopes[g.scope]})`).join("، ") || "بلا صلاحيات"}</span>
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
          {c.sections.map((s) => (
            <div key={s.key}>
              <p className="mb-2 text-sm font-bold">{s.label}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {s.actions.map((a) => { const cur = edit.grants.find((g) => g.section === s.key && g.action === a)?.scope ?? ""; return (
                  <label key={a} className="flex items-center gap-2 text-sm"><span className="w-24 shrink-0">{c.actions[a]}</span>
                    <select className={selectCls("w-full min-w-0", true)} value={cur} onChange={(e) => setScope(s.key, a, e.target.value)}>
                      <option value="">لا</option>{Object.entries(c.scopes).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select></label>); })}
              </div>
            </div>
          ))}
          <p className="rounded-lg bg-secondary/50 p-2 text-xs">معاينة ما سيظهر للحساب: {edit.grants.length ? edit.grants.map((g) => `${c.actions[g.action]} — ${c.scopes[g.scope]}`).join("، ") : "لا شيء"}. {edit.id ? "التعديل يسري على جميع حاملي الدور من الطلب التالي؛ الاستثناءات الشخصية تبقى كما هي." : ""}</p>
          <div className="flex gap-2"><Button size="sm" onClick={save}>حفظ</Button><Button size="sm" variant="ghost" onClick={() => setEdit(null)}>إلغاء</Button></div>
        </div>
      )}
    </Section>
  );
}

function Person({ org, school }: { org: string; school: string | null }) {
  const qc = useQueryClient();
  const cat = useCatalog();
  const [ids, setIds] = useState<string[]>([]);
  const user = ids[0];
  const roles = useQuery({ queryKey: ["perm-roles", org], queryFn: async () => (await call("perm_roles_list", { _org: org })) as Row[] });
  const eff = useQuery({ queryKey: ["perm-eff", org, user], enabled: !!user, queryFn: async () => (await call("perm_effective", { _org: org, _user: user })) as Row });
  const [role, setRole] = useState(""); const [limit, setLimit] = useState("");
  const refresh = () => { qc.invalidateQueries({ queryKey: ["perm-eff", org, user] }); qc.invalidateQueries({ queryKey: ["perm-roles", org] }); qc.invalidateQueries({ queryKey: ["perm-log", org] }); };
  async function run(fn: string, args: Record<string, unknown>, ask: string) {
    const reason = await askText(ask, { required: true }); if (!reason) return;
    try { await call(fn, { ...args, _reason: reason }); toast.success("تم الحفظ"); refresh(); } catch (e) { toast.error(arabicError(e)); }
  }
  const c = cat.data;
  return (
    <Section title="صلاحيات شخص">
      <PeoplePicker purpose="perm" school={school} org={org} single value={ids} onChange={setIds} label="الموظف" showBranch />
      {user && (eff.isLoading || !c ? <LoadingState /> : eff.error ? <ErrorState message={arabicError(eff.error)} /> : (
        <div className="mt-4 space-y-4 rounded-xl border bg-card p-4 text-sm">
          <div>
            <p className="mb-2 font-bold">الأدوار المسندة</p>
            {!(eff.data!["roles"] as Row[]).length ? <p className="text-muted-foreground">لا أدوار إضافية.</p> : (
              <ul className="space-y-1">{(eff.data!["roles"] as Row[]).map((r) => (
                <li key={r["id"]} className="flex items-center gap-2">{r["name"]}{r["approval_limit"] != null && ` — حد الاعتماد ${r["approval_limit"]} ر.س`}
                  <Button size="sm" variant="ghost" onClick={() => run("perm_assign", { _org: org, _user: user, _role: r["id"], _assign: false, _school_ids: null, _limit: null }, "سبب سحب الدور")}>سحب</Button></li>))}</ul>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <select className={selectCls("min-w-0")} value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">اختر دورًا</option>{roles.data?.filter((r) => !r["archived"]).map((r) => <option key={r["id"]} value={r["id"]}>{r["name"]}</option>)}
              </select>
              <Input className="w-40" inputMode="decimal" placeholder="حد الاعتماد (اختياري)" value={limit} onChange={(e) => setLimit(e.target.value)} />
              <Button size="sm" disabled={!role} onClick={() => run("perm_assign", { _org: org, _user: user, _role: role, _assign: true, _school_ids: null, _limit: limit ? Number(limit) : null }, "سبب إسناد الدور")}>إسناد</Button>
            </div>
            {role && <p className="mt-1 text-xs text-muted-foreground">سيُحمَّل: {(roles.data?.find((r) => r["id"] === role)?.["grants"] as Grant[] | undefined)?.map((g) => `${c.actions[g.action]} (${c.scopes[g.scope]})`).join("، ") || "لا شيء"}</p>}
          </div>
          <div>
            <p className="mb-2 font-bold">الصلاحيات الفعلية — المشتريات والعهد</p>
            <ul className="divide-y rounded-lg border">{(eff.data!["effective"] as Row[]).map((e) => (
              <li key={e["action"]} className="flex flex-wrap items-center gap-2 p-2">
                <span className="w-24">{c.actions[e["action"]]}</span>
                <span className="min-w-0 flex-1 text-xs">{e["scope"] ? `${c.scopes[e["scope"]]} — ${SOURCE[e["source"]] ?? ""}` : e["source"] === "deny" ? "ممنوع (منع خاص)" : "غير مسموح"}</span>
                {!eff.data!["is_owner"] && (<>
                  <Button size="sm" variant="ghost" onClick={() => run("perm_override_set", { _org: org, _user: user, _section: "procurement", _action: e["action"], _effect: "deny", _scope: null }, "سبب المنع")}>منع</Button>
                  <Button size="sm" variant="ghost" onClick={() => run("perm_override_set", { _org: org, _user: user, _section: "procurement", _action: e["action"], _effect: "grant", _scope: "branch" }, "سبب التفويض (نطاق: فروع محددة)")}>تفويض</Button>
                  {(e["source"] === "deny" || e["source"] === "override") && <Button size="sm" variant="ghost" onClick={() => run("perm_override_set", { _org: org, _user: user, _section: "procurement", _action: e["action"], _effect: null, _scope: null }, "سبب إزالة الاستثناء")}>إزالة الاستثناء</Button>}
                </>)}
              </li>))}</ul>
          </div>
        </div>
      ))}
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
