import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Eye, Minus, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { ask, askText } from "@/components/confirm";
import { ErrorState, LoadingState } from "@/components/states";
import { PermTree, type Grant, type PermCatalog } from "@/components/perm-tree";
import { arabicError } from "@/lib/session";
import { NAV_BY_ROLE, NAV_LABELS, ROLE_LABELS, type Role } from "@/lib/roles";

/** Unsaved draft in the open employee panel; the picker asks before discarding it. */
export const permDraft = { dirty: false };
export async function confirmDiscard() { return !permDraft.dirty || (await ask("لديك تعديلات غير محفوظة على صلاحيات هذا الموظف. تجاهلها والمتابعة؟", { destructive: true, ok: "تجاهل التعديلات" })); }
/** Pages that come with the base role and wait for a condition before they open. */
const NAV_COND: Partial<Record<string, string>> = { classroom: "يحتاج تكليفًا تعليميًا ساريًا", homework: "يحتاج تكليفًا تعليميًا ساريًا", schedule: "يظهر بعد نشر الجدول", my_employment: "بعد تفعيل خدمات الموظف من الموارد البشرية" };

export type Eff = { section: string; action: string; scope: string | null; allowed_schools: string[]; base_schools: string[]; source: string | null };
export type Effective = { is_owner: boolean; base_roles: { role: string; school: string | null }[]; roles: { id: string; name: string; school_ids: string[] | null; approval_limit: number | null }[]; overrides: { section: string; action: string; effect: string; scope: string | null }[]; effective: Eff[] };
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
export const toGrants = (eff: Eff[]): Grant[] => eff.filter(isOn).map((e) => ({ section: e.section, action: e.action, scope: e.scope ?? "branch" }));

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
  const [undeny, setUndeny] = useState<string[]>([]);
  const [pick, setPick] = useState(""); const [limit, setLimit] = useState(""); const [scopeIds, setScopeIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ before: Effective; after: Effective } | null>(null);
  const [busy, setBusy] = useState(false);
  const orig = useMemo(() => (eff.data ? toGrants(eff.data.effective) : []), [eff.data]);
  useEffect(() => () => { permDraft.dirty = false; }, []);
  if (eff.isLoading) return <LoadingState />;
  if (eff.error) return <ErrorState message={arabicError(eff.error)} />;
  const e = eff.data!;
  const cur = tree ?? orig;

  const draft = draftOverrides(e.effective, orig, cur, undeny);
  function overrides(): Changes["overrides"] { return draft.overrides; }
  const changes = (): Changes => ({ assign: add, unassign: drop, overrides: overrides() });
  const dirty = add.length > 0 || drop.length > 0 || overrides().length > 0;
  permDraft.dirty = dirty;
  const reset = () => { setAdd([]); setDrop([]); setTree(null); setUndeny([]); setPreview(null); };
  async function restoreDefaults() {
    const personal = e.effective.filter((x) => x.source === "deny" || x.source === "override");
    if (!personal.length) { toast.info("لا تخصيصات شخصية؛ الموظف يتبع أدواره بالفعل"); return; }
    if (!(await ask(`ستُزال ${personal.length} من التخصيصات الشخصية (منح ومنع) ويعود الموظف لصلاحيات أدواره فقط. تبقى مسودة حتى تحفظها.`, { ok: "استعادة افتراضي الدور" }))) return;
    setTree(orig.filter((g) => e.effective.find((x) => `${x.section}.${x.action}` === `${g.section}.${g.action}`)?.source !== "override"));
    setUndeny(e.effective.filter((x) => x.source === "deny").map((x) => `${x.section}.${x.action}`)); setPreview(null);
  }

  async function doPreview() {
    setBusy(true);
    try { setPreview((await call("perm_preview", { _org: org, _user: user, _changes: changes() })) as { before: Effective; after: Effective }); }
    catch (er) { toast.error(arabicError(er)); } finally { setBusy(false); }
  }
  async function save() {
    const reason = await askText("سبب التعديل (يُسجَّل)", { required: true, ok: "حفظ التغييرات" }); if (!reason) return;
    setBusy(true);
    try {
      // someone else may have changed this employee while we edited: never write over it
      const fresh = (await call("perm_effective", { _org: org, _user: user })) as Effective;
      if (JSON.stringify(fresh.effective) !== JSON.stringify(e.effective) || JSON.stringify(fresh.roles) !== JSON.stringify(e.roles)) {
        toast.error("تغيّرت صلاحيات هذا الموظف أثناء تحريرك. حُدّثت الحالة المحفوظة؛ راجع الفرق وأعد التعديل.");
        reset(); qc.invalidateQueries({ queryKey: ["perm-eff", org, user] }); return;
      }
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
        <p className="text-xs text-muted-foreground">الأدوار الإضافية: {e.roles.map((r) => r.name).join("، ") || "لا يوجد"}</p>
        <p className="text-xs text-muted-foreground">الصفة التي تُعدَّل: موظف. صفة ولي الأمر (إن وُجدت) منفصلة ولا تتأثر بهذه الشاشة.</p>
      </div>
      {!e.is_owner && <CurrentAccess c={c} e={e} cur={cur} onToggle={(k, on) => {
        const o = orig.find((g) => `${g.section}.${g.action}` === k);
        if (!on) { setTree(cur.filter((g) => `${g.section}.${g.action}` !== k)); setUndeny(undeny.filter((x) => x !== k)); }
        else if (o) setTree([...cur.filter((g) => `${g.section}.${g.action}` !== k), o]);
        else if (e.effective.find((x) => `${x.section}.${x.action}` === k)?.source === "deny") setUndeny([...undeny.filter((x) => x !== k), k]);
        else { const [sec, act] = k.split("."); const cs = c.sections.find((x) => x.key === sec); if (cs && !cs.base_only) setTree([...cur, { section: sec!, action: act!, scope: cs.scopes[0]! }]); }
        setPreview(null);
      }} undeny={undeny} />}
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
            <span className="flex flex-wrap gap-1">
              {(tree || undeny.length > 0) && <Button size="sm" variant="ghost" onClick={() => { setTree(null); setUndeny([]); setPreview(null); }}>تجاهل تعديلات الشجرة</Button>}
              <Button size="sm" variant="outline" onClick={restoreDefaults}><RotateCcw className="size-4" />استعادة افتراضي الدور</Button>
            </span>
          </div>
          <p className="mb-2 text-xs text-muted-foreground">تعكس الشجرة الوصول الفعلي الحالي. الإضافة هنا تفويض شخصي. إلغاء صلاحية من دور = «منع صريح» ظاهر بالأحمر؛ «رفع المنع» يعيدها لقواعد الدور دون منع خفي.</p>
          <PermTree c={c} value={cur} onChange={(g) => { setTree(g); setPreview(null); }} disabledAreas={dis.data ?? []} denied={draft.denied} sources={draft.sources} orig={orig} personal={Object.fromEntries(e.effective.filter((x) => x.source === "override" || x.source === "deny").map((x) => [`${x.section}.${x.action}`, x.source!]))}
            onUndeny={(k) => { const o = orig.find((g) => `${g.section}.${g.action}` === k); if (o && !cur.some((g) => `${g.section}.${g.action}` === k)) setTree([...cur, o]); else setUndeny([...undeny, k]); setPreview(null); }} />
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

/**
 * Draft personal changes against the current effective access.
 * New tick → grant; untick of own grant → back to role rules (no deny); untick of role/base access → explicit deny (shown);
 * «رفع المنع» on an existing deny → removal of the override.
 */
export function draftOverrides(effective: Eff[], orig: Grant[], cur: Grant[], undeny: string[]) {
  const key = (g: { section: string; action: string }) => `${g.section}.${g.action}`;
  const src = new Map(effective.map((x) => [key(x), x.source]));
  const out: Changes["overrides"] = [];
  const o = new Map(orig.map((g) => [key(g), g])), n = new Map(cur.map((g) => [key(g), g]));
  for (const [k, g] of n) { const was = o.get(k); if (!was || was.scope !== g.scope) out.push({ section: g.section, action: g.action, effect: "grant", scope: g.scope }); }
  for (const [k, g] of o) if (!n.has(k)) out.push({ section: g.section, action: g.action, effect: src.get(k) === "override" ? null : "deny", scope: null });
  for (const k of undeny) if (!n.has(k)) { const [section, action] = k.split("."); out.push({ section: section!, action: action!, effect: null, scope: null }); }
  const denied = [...effective.filter((x) => x.source === "deny").map(key).filter((k) => !undeny.includes(k) && !n.has(k)), ...out.filter((x) => x.effect === "deny").map(key)];
  const sources: Record<string, string> = {};
  for (const [k] of n) sources[k] = o.has(k) ? SOURCE[src.get(k) ?? ""] ?? "" : "تفويض شخصي (جديد)";
  return { overrides: out, denied, sources };
}

/** Before/after: additions, removals and scope changes with their source, plus the employee's menu (permissions only, no personal data). */
export function Diff({ c, p }: { c: PermCatalog; p: { before: Effective; after: Effective } }) {
  const k = (e: Eff) => `${e.section}.${e.action}`;
  const b = new Map(p.before.effective.map((e) => [k(e), e]));
  const rows = p.after.effective.map((a) => ({ a, b: b.get(k(a))! })).filter(({ a, b: x }) => isOn(a) !== isOn(x) || ((isOn(a) || isOn(x)) && (where(c, a) !== where(c, x) || a.source !== x.source)) || (a.source === "deny") !== (x.source === "deny"));
  const sec = (key: string) => c.sections.find((s) => s.key === key)!;
  const act = (e: Eff) => sec(e.section).labels?.[e.action] ?? c.actions[e.action];
  const menu = c.areas.map((ar) => ({ ar, secs: c.sections.filter((s) => s.parent === ar.key && p.after.effective.some((e) => e.section === s.key && isOn(e))) })).filter((x) => x.secs.length);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="rounded-xl border p-3">
        <p className="mb-2 font-bold">المعاينة: ما الذي سيتغير</p>
        {!p.after.base_roles.length && <p className="mb-2 rounded bg-warning/15 p-2 text-xs">الحساب موقوف: الصلاحيات تُحفظ الآن وتسري فور تفعيله، لذا لا تظهر أقسام الفروع هنا.</p>}
        <p className="mb-2 text-xs text-muted-foreground">تُحسب «بعد» كما ستكون بعد أول دخول للموظف؛ المعاينة لا تفعّل الحساب ولا تحفظ شيئًا.</p>
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

/** Read-only: what is saved on the server now — granted sections/actions with source and where, plus the pages of the base role. */
function CurrentAccess({ c, e, cur, onToggle, undeny }: { c: PermCatalog; e: Effective; cur: Grant[]; onToggle: (key: string, on: boolean) => void; undeny: string[] }) {
  const on = e.effective.filter(isOn);
  // every area → section → action (sub-sections included); ticked = has it now
  const effOf = (sec: string, a: string): Eff => e.effective.find((x) => x.section === sec && x.action === a) ?? { section: sec, action: a, scope: null, allowed_schools: [], base_schools: [], source: null };
  const groups = c.areas.filter((ar) => !ar.soon).map((ar) => ({ ar, secs: c.sections.filter((s) => s.parent === ar.key).map((s) => ({ s, acts: s.actions.map((a) => effOf(s.key, a)).filter((x) => x.source !== "deny") })).filter((x) => x.acts.length) })).filter((x) => x.secs.length);
  void on;
  const denies = e.effective.filter((x) => x.source === "deny");
  const navKeys = [...new Set(e.base_roles.flatMap((b) => NAV_BY_ROLE[b.role as Role] ?? []))];
  return (
    <section aria-label="الأقسام والإجراءات الممنوحة للموظف حاليًا" className="rounded-xl border bg-secondary/20 p-3">
      <p className="font-bold">الأقسام والإجراءات الممنوحة للموظف حاليًا</p>
      <p className="mb-2 text-xs text-muted-foreground">الحالة المحفوظة في الخادم. يمكنك التعديل هنا مباشرة أو في الشجرة أدناه؛ لا شيء يُحفظ قبل «حفظ التغييرات».</p>
      <div className="grid gap-3 lg:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold text-primary">صفحات دوره الأساسي</p>
          <ul className="flex flex-wrap gap-1">{navKeys.map((k) => <li key={k} className="flex items-center gap-1 rounded border bg-card px-2 py-0.5 text-xs"><CheckCircle2 className="size-3 text-success" />{NAV_LABELS[k] ?? k}{NAV_COND[k] && <span className="text-muted-foreground">— {NAV_COND[k]}</span>}</li>)}</ul>
          <p className="mt-1 text-[11px] text-muted-foreground">مصدرها الدور الأساسي، ونطاقها مدرسته وتكليفاته أو بياناته الشخصية فقط.</p>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-primary">أقسام الصلاحيات</p>
          <p className="mb-1 text-[11px] text-muted-foreground">العلامة = متاح له الآن. أزل العلامة لإيقافه (مسودة حتى الحفظ)، وأعدها للتراجع.</p>
          {!groups.length && !denies.length ? <p className="text-xs text-muted-foreground">لا أقسام.</p> : (
            <ul className="space-y-2 text-xs">{groups.map(({ ar, secs }) => <li key={ar.key}><span className="font-semibold">{ar.label}</span>
              <ul className="ms-2 mt-1 space-y-1">{secs.map(({ s, acts }) => <li key={s.key}><span className="font-medium">{s.label}</span>
                <ul className="ms-2">{acts.map((a) => { const k = `${a.section}.${a.action}`; const now = cur.some((g) => `${g.section}.${g.action}` === k); const had = isOn(a); return (
                  <li key={k}><label className={"flex items-start gap-2 rounded px-1 py-0.5 " + (now && had ? "bg-muted text-muted-foreground" : now ? "bg-success/10" : had ? "bg-destructive/5 text-destructive" : "")}>
                    <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={now} disabled={!!s.locked_reason || (!had && !!s.base_only)} aria-label={`${s.label} ← ${s.labels?.[a.action] ?? c.actions[a.action] ?? a.action}`} onChange={(ev) => onToggle(k, ev.target.checked)} />
                    <span>{s.labels?.[a.action] ?? c.actions[a.action] ?? a.action} <span className="opacity-70">{had && <>({SOURCE[a.source ?? ""] ?? ""}{where(c, a) ? ` · ${where(c, a)}` : ""})</>}{had && !now && " — سيُوقف عند الحفظ"}{!had && now && " — يُمنح عند الحفظ"}{!had && s.base_only && " — يأتي مع الدور الأساسي فقط"}</span></span></label></li>); })}</ul></li>)}</ul></li>)}
              {denies.map((d) => { const k = `${d.section}.${d.action}`; const sec = c.sections.find((x) => x.key === d.section); const lifted = undeny.includes(k); return (
                <li key={k}><label className={"flex items-start gap-2 rounded px-1 py-0.5 " + (lifted ? "bg-success/10" : "bg-destructive/5 text-destructive")}>
                  <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={lifted} aria-label={`${sec?.label ?? d.section} ← ${sec?.labels?.[d.action] ?? c.actions[d.action] ?? d.action}`} onChange={(ev) => onToggle(k, ev.target.checked)} />
                  <span>{sec?.label ?? d.section} ← {sec?.labels?.[d.action] ?? c.actions[d.action] ?? d.action} — {lifted ? "يُرفع المنع عند الحفظ" : "منع خاص"}</span></label></li>); })}
            </ul>)}
        </div>
      </div>
    </section>
  );
}
