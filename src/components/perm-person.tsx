import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Minus, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { askText } from "@/components/confirm";
import { ErrorState, LoadingState } from "@/components/states";
import { PermTree, type Grant, type PermCatalog } from "@/components/perm-tree";
import { arabicError } from "@/lib/session";
import { ROLE_LABELS, type Role } from "@/lib/roles";

type Eff = { section: string; action: string; scope: string | null; allowed_schools: string[]; base_schools: string[]; source: string | null };
type Effective = { is_owner: boolean; base_roles: { role: string; school: string | null }[]; roles: { id: string; name: string; school_ids: string[] | null; approval_limit: number | null }[]; overrides: { section: string; action: string; effect: string; scope: string | null }[]; effective: Eff[] };
type Changes = { assign: { role_id: string; school_ids: string[] | null; limit: number | null }[]; unassign: string[]; overrides: { section: string; action: string; effect: string | null; scope: string | null }[] };
export const SOURCE: Record<string, string> = { owner: "مالك المؤسسة", role: "من دور مسند", override: "تفويض إضافي", deny: "منع خاص", base: "من دوره الأساسي" };

async function call(fn: string, args: Record<string, unknown>) {
  const { data, error } = await db.rpc(fn as never, args as never);
  if (error) throw error;
  return data as unknown;
}
/** Is the action actually allowed (deny wins; procurement by scope, school sections by branches)? */
export const isOn = (e: Eff) => e.source !== "deny" && (e.section === "procurement" ? !!e.scope : e.allowed_schools.length > 0);
const where = (c: PermCatalog, e: Eff) => (e.section === "procurement" ? (e.scope ? c.scopes[e.scope] : "") : e.allowed_schools.join("، "));
const toGrants = (eff: Eff[]): Grant[] => eff.filter(isOn).map((e) => ({ section: e.section, action: e.action, scope: e.scope ?? "branch" }));

/**
 * One employee: draft role and section changes locally, preview «before / after» on the server (rolled back), then save all at once.
 * Nothing changes for the account until «حفظ التغييرات».
 */
export function PersonPanel({ org, user, name, c, roles }: { org: string; user: string; name: string; c: PermCatalog; roles: Row[] }) {
  const qc = useQueryClient();
  const eff = useQuery({ queryKey: ["perm-eff", org, user], queryFn: async () => (await call("perm_effective", { _org: org, _user: user })) as Effective });
  const dis = useQuery({ queryKey: ["perm-disabled", org], queryFn: async () => (await call("perm_disabled_areas", { _org: org })) as string[] });
  const schools = useQuery({ queryKey: ["org-schools", org], queryFn: async () => { const { data, error } = await db.from("schools").select("id,name,is_active").eq("org_id", org).order("name"); if (error) throw error; return data as Row[]; } });
  const [add, setAdd] = useState<Changes["assign"]>([]);
  const [drop, setDrop] = useState<string[]>([]);
  const [tree, setTree] = useState<Grant[] | null>(null);
  const [pick, setPick] = useState(""); const [limit, setLimit] = useState(""); const [scopeIds, setScopeIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ before: Effective; after: Effective } | null>(null);
  const [busy, setBusy] = useState(false);
  const orig = useMemo(() => (eff.data ? toGrants(eff.data.effective) : []), [eff.data]);
  if (eff.isLoading) return <LoadingState />;
  if (eff.error) return <ErrorState message={arabicError(eff.error)} />;
  const e = eff.data!;
  const cur = tree ?? orig;

  function overrides(): Changes["overrides"] {
    const out: Changes["overrides"] = [];
    const key = (g: { section: string; action: string }) => `${g.section}.${g.action}`;
    const o = new Map(orig.map((g) => [key(g), g])), n = new Map(cur.map((g) => [key(g), g]));
    for (const [k, g] of n) { const was = o.get(k); if (!was || was.scope !== g.scope) out.push({ section: g.section, action: g.action, effect: "grant", scope: g.scope }); }
    for (const [k, g] of o) if (!n.has(k)) {
      const src = e.effective.find((x) => key(x) === k)?.source;
      out.push({ section: g.section, action: g.action, effect: src === "override" ? null : "deny", scope: null });
    }
    return out;
  }
  const changes = (): Changes => ({ assign: add, unassign: drop, overrides: tree ? overrides() : [] });
  const dirty = add.length > 0 || drop.length > 0 || (tree !== null && overrides().length > 0);
  const reset = () => { setAdd([]); setDrop([]); setTree(null); setPreview(null); };

  async function doPreview() {
    setBusy(true);
    try { setPreview((await call("perm_preview", { _org: org, _user: user, _changes: changes() })) as { before: Effective; after: Effective }); }
    catch (er) { toast.error(arabicError(er)); } finally { setBusy(false); }
  }
  async function save() {
    const reason = await askText("سبب التعديل (يُسجَّل)", { required: true, ok: "حفظ التغييرات" }); if (!reason) return;
    setBusy(true);
    try {
      await call("perm_apply", { _org: org, _user: user, _changes: changes(), _reason: reason });
      toast.success("حُفظت التغييرات وتسري من الطلب التالي");
      reset(); for (const k of [["perm-eff", org, user], ["perm-roles", org], ["perm-log", org], ["perm-people", org], ["perm-sections", org]]) qc.invalidateQueries({ queryKey: k });
    } catch (er) { toast.error(arabicError(er)); } finally { setBusy(false); }
  }
  const live = roles.filter((r) => !r["archived"]);
  const sname = (id: string) => schools.data?.find((s) => s["id"] === id)?.["name"] ?? "—";

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 text-sm">
      <div>
        <p className="text-base font-bold">{name}</p>
        <p className="text-xs text-muted-foreground">الدور الأساسي: {e.base_roles.map((b) => `${ROLE_LABELS[b.role as Role] ?? b.role}${b.school ? ` — ${b.school}` : ""}`).join("، ") || "—"}</p>
      </div>
      {e.is_owner ? <p className="rounded-lg bg-secondary/50 p-3">مالك المؤسسة يملك جميع الصلاحيات ولا تُقيَّد صلاحياته.</p> : (<>
        <section>
          <p className="mb-2 font-bold">الأدوار</p>
          <ul className="space-y-1">
            {e.roles.map((r) => { const gone = drop.includes(r.id); return (
              <li key={r.id} className={"flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1 " + (gone ? "border-destructive/40 bg-destructive/5 line-through" : "")}>
                <span className="min-w-0 flex-1">{r.name}<span className="ms-2 text-xs text-muted-foreground">{r.school_ids?.length ? r.school_ids.map(sname).join("، ") : "فروعه كلها"}{r.approval_limit != null && ` • حد الاعتماد ${r.approval_limit} ر.س`}</span></span>
                <Button size="sm" variant="ghost" onClick={() => { setDrop(gone ? drop.filter((x) => x !== r.id) : [...drop, r.id]); setPreview(null); }}>{gone ? "تراجع" : "سحب"}</Button>
              </li>); })}
            {add.map((a) => (
              <li key={a.role_id} className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-2 py-1">
                <span className="min-w-0 flex-1">{live.find((r) => r["id"] === a.role_id)?.["name"]} <span className="text-xs text-muted-foreground">(جديد) {a.school_ids?.length ? a.school_ids.map(sname).join("، ") : "فروعه كلها"}</span></span>
                <Button size="sm" variant="ghost" onClick={() => { setAdd(add.filter((x) => x.role_id !== a.role_id)); setPreview(null); }}>إزالة</Button>
              </li>
            ))}
            {!e.roles.length && !add.length && <li className="text-muted-foreground">لا أدوار إضافية.</li>}
          </ul>
          <div className="mt-2 space-y-2 rounded-lg border border-dashed p-2">
            <div className="flex flex-wrap gap-2">
              <select aria-label="إضافة دور آخر" className={selectCls("min-w-0 flex-1")} value={pick} onChange={(ev) => setPick(ev.target.value)}>
                <option value="">إضافة دور آخر…</option>{live.filter((r) => !e.roles.some((x) => x.id === r["id"]) && !add.some((x) => x.role_id === r["id"])).map((r) => <option key={r["id"]} value={r["id"]}>{r["name"]}</option>)}
              </select>
              <Input className="w-36" inputMode="decimal" placeholder="حد الاعتماد" aria-label="حد الاعتماد" value={limit} onChange={(ev) => setLimit(ev.target.value)} />
              <Button size="sm" variant="outline" disabled={!pick} onClick={() => { setAdd([...add, { role_id: pick, school_ids: scopeIds.length ? scopeIds : null, limit: limit ? Number(limit) : null }]); setPick(""); setLimit(""); setScopeIds([]); setPreview(null); }}><Plus className="size-4" />إضافة</Button>
            </div>
            {pick && (schools.data?.length ?? 0) > 1 && (
              <div className="flex flex-wrap items-center gap-3 text-xs"><span className="font-semibold">نطاق الدور:</span>
                {schools.data!.map((s) => <label key={s["id"]} className="flex items-center gap-1"><input type="checkbox" checked={scopeIds.includes(s["id"])} onChange={() => setScopeIds(scopeIds.includes(s["id"]) ? scopeIds.filter((x) => x !== s["id"]) : [...scopeIds, s["id"]])} />{s["name"]}</label>)}
                <span className="text-muted-foreground">(بلا تحديد = فروعه كلها)</span></div>
            )}
          </div>
        </section>
        <section>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="font-bold">الأقسام والإجراءات (تخصيص لهذا الموظف)</p>
            {tree && <Button size="sm" variant="ghost" onClick={() => { setTree(null); setPreview(null); }}><RotateCcw className="size-4" />إلغاء التخصيص</Button>}
          </div>
          <p className="mb-2 text-xs text-muted-foreground">تعكس الشجرة الوصول الفعلي الحالي. الإضافة هنا تفويض شخصي، والإزالة منع خاص يغلب أي دور.</p>
          <PermTree c={c} value={cur} onChange={(g) => { setTree(g); setPreview(null); }} disabledAreas={dis.data ?? []} />
        </section>
        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button variant="outline" disabled={!dirty || busy} onClick={doPreview}><Eye className="size-4" />معاينة قبل وبعد</Button>
          <Button disabled={!dirty || busy || !preview} onClick={save}>{busy ? "…" : "حفظ التغييرات"}</Button>
          {dirty && <Button variant="ghost" onClick={reset}>تجاهل التعديلات</Button>}
          {!preview && dirty && <span className="self-center text-xs text-muted-foreground">اعرض المعاينة أولًا ثم احفظ.</span>}
        </div>
        {preview && <Diff c={c} p={preview} />}
      </>)}
    </div>
  );
}

/** Before/after: additions, removals and scope changes with their source, plus the employee's menu (permissions only, no personal data). */
function Diff({ c, p }: { c: PermCatalog; p: { before: Effective; after: Effective } }) {
  const k = (e: Eff) => `${e.section}.${e.action}`;
  const b = new Map(p.before.effective.map((e) => [k(e), e]));
  const rows = p.after.effective.map((a) => ({ a, b: b.get(k(a))! })).filter(({ a, b: x }) => isOn(a) !== isOn(x) || where(c, a) !== where(c, x) || a.source !== x.source);
  const sec = (key: string) => c.sections.find((s) => s.key === key)!;
  const act = (e: Eff) => sec(e.section).labels?.[e.action] ?? c.actions[e.action];
  const menu = c.areas.map((ar) => ({ ar, secs: c.sections.filter((s) => s.parent === ar.key && p.after.effective.some((e) => e.section === s.key && isOn(e))) })).filter((x) => x.secs.length);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="rounded-xl border p-3">
        <p className="mb-2 font-bold">المعاينة: ما الذي سيتغير</p>
        {!rows.length ? <p className="text-muted-foreground">لا تغيير في الوصول الفعلي (قد يكون المنح موجودًا من دور آخر).</p> : (
          <ul className="space-y-1">
            {rows.map(({ a, b: x }) => { const on = isOn(a), was = isOn(x); return (
              <li key={k(a)} className={"flex flex-wrap items-start gap-2 rounded-lg p-2 " + (on && !was ? "bg-success/10" : !on && was ? "bg-destructive/5" : "bg-secondary/40")}>
                {on && !was ? <Plus className="mt-0.5 size-4 text-success" /> : !on && was ? <Minus className="mt-0.5 size-4 text-destructive" /> : <RotateCcw className="mt-0.5 size-4 text-primary" />}
                <span className="min-w-0 flex-1"><span className="font-medium">{sec(a.section).label} ← {act(a)}</span>
                  <span className="block text-xs text-muted-foreground">قبل: {was ? `${where(c, x)} (${SOURCE[x.source ?? ""] ?? ""})` : x.source === "deny" ? "ممنوع (منع خاص)" : "غير مسموح"}</span>
                  <span className="block text-xs">بعد: {on ? `${where(c, a)} (${SOURCE[a.source ?? ""] ?? ""})` : a.source === "deny" ? "ممنوع — المنع الخاص يغلب أي دور" : "غير مسموح"}</span></span>
              </li>); })}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">تُجمع الأدوار كلٌّ في نطاقه؛ سحب دور لا يزيل منحًا صحيحًا من دور آخر. فصل المهام (لا اعتماد لمصروفه ولا صرف لنفسه) يبقى مطبقًا على الخادم.</p>
      </div>
      <div className="rounded-xl border p-3">
        <p className="font-bold">قائمة الموظف بعد الحفظ</p>
        <p className="mb-2 text-xs text-muted-foreground">معاينة للصلاحيات فقط — لا دخول بحسابه ولا عرض لبياناته الخاصة.</p>
        <ul className="space-y-2 text-sm">
          <li className="rounded bg-secondary/50 px-2 py-1">الرئيسية · لوحة عملي</li>
          {menu.map(({ ar, secs }) => (
            <li key={ar.key}><p className="text-xs font-semibold text-primary">{ar.label}</p>
              <ul className="ms-2">{secs.map((s) => <li key={s.key}>• {s.label}</li>)}</ul></li>
          ))}
          <li className="text-xs text-muted-foreground">+ الملف الشخصي، التواصل، الإشعارات، الدعم{p.after.base_roles.some((r) => r.role !== "teacher") ? "، وصفحات دوره الأساسي" : ""}</li>
        </ul>
      </div>
    </div>
  );
}
