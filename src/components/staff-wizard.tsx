import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { PeoplePicker } from "@/components/people-picker";
import { PasswordInput, passwordScore } from "@/components/password-input";
import { createStaffAccount } from "@/lib/accounts.functions";
import { strongEnough } from "@/lib/people-import";
import { arabicError } from "@/lib/session";
import { NAV_BY_ROLE, NAV_LABELS, ROLE_LABELS, type Role } from "@/lib/roles";
import { PermTree, type PermCatalog, type Grant as TGrant } from "@/components/perm-tree";
import { Diff, draftOverrides, toGrants, type Effective } from "@/components/perm-person";
import { LoadingState, ErrorState } from "@/components/states";

type Grant = { section: string; action: string; scope: string };
type RoleRow = { role_id: string; all: boolean; school_ids: string[]; limit: string };
const BASES: Role[] = ["teacher", "principal", "vice_principal", "dept_head", "supervisor", "student_affairs", "counselor", "nurse", "security"];
const BASE_HINT: Partial<Record<Role, string>> = { teacher: "«معلم» بلا سجل معلم = موظف تشغيل (صيانة، مشتريات…) — تظهر له أقسام أدواره فقط." };
const STEPS = ["بيانات الموظف والفروع", "الدور الأساسي والأدوار", "الأقسام والصلاحيات", "المعاينة والحفظ"];
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,29}$/;

/**
 * «إضافة موظف جديد»: nothing is created while moving between steps; the final save runs one server call
 * (createStaffAccount) that writes memberships, roles and the first-login lock together.
 */
export function StaffWizard({ org, school, grantText, onDone, onCancel, catalog }: { org: string; school: string | null; grantText: (g: Grant[]) => string; onDone: (uid: string) => void; onCancel: () => void; catalog: PermCatalog }) {
  const qc = useQueryClient();
  const run = useServerFn(createStaffAccount);
  const schools = useQuery({ queryKey: ["org-schools", org], queryFn: async () => { const { data, error } = await db.from("schools").select("id,name,is_active").eq("org_id", org).order("name"); if (error) throw error; return data as Row[]; } });
  const roles = useQuery({ queryKey: ["perm-roles", org], queryFn: async () => { const { data, error } = await db.rpc("perm_roles_list", { _org: org }); if (error) throw error; return data as Row[]; } });
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [existing, setExisting] = useState<string[]>([]);
  const [name, setName] = useState(""); const [username, setUsername] = useState(""); const [pw, setPw] = useState("");
  const [taken, setTaken] = useState<boolean | null>(null);
  const [branches, setBranches] = useState<string[]>(school ? [school] : []);
  const [base, setBase] = useState<Role>("teacher");
  const [rows, setRows] = useState<RoleRow[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [tree, setTree] = useState<TGrant[] | null>(null);
  const [undeny, setUndeny] = useState<string[]>([]);
  const [after, setAfter] = useState<Effective | null>(null);
  const dis = useQuery({ queryKey: ["perm-disabled", org], queryFn: async () => { const { data, error } = await db.rpc("perm_disabled_areas" as never, { _org: org } as never); if (error) throw error; return data as unknown as string[]; } });
  const plannedRoles = () => rows.map((x) => ({ role_id: x.role_id, school_ids: x.all ? null : x.school_ids, limit: x.limit ? Number(x.limit) : null }));
  const planKey = JSON.stringify([mode, existing[0], base, branches, rows]);
  /** What the planned base role + roles give, computed by the server on a throw-away copy (nothing saved). */
  const baseline = useQuery({ enabled: step >= 2, queryKey: ["perm-plan", org, planKey], queryFn: async () => {
    const { data, error } = await db.rpc("perm_preview_staff" as never, { _org: org, _uid: mode === "existing" ? existing[0] : null, _base: base, _schools: branches, _roles: plannedRoles(), _overrides: [] } as never);
    if (error) throw error; return data as unknown as { before: Effective | null; after: Effective }; } });
  const effB = baseline.data?.after.effective ?? [];
  const orig = toGrants(effB);
  const cur = tree ?? orig;
  const draft = draftOverrides(effB, orig, cur, undeny);
  async function runPreview() {
    setBusy(true);
    try {
      const { data, error } = await db.rpc("perm_preview_staff" as never, { _org: org, _uid: mode === "existing" ? existing[0] : null, _base: base, _schools: branches, _roles: plannedRoles(), _overrides: draft.overrides } as never);
      if (error) throw error; setAfter((data as unknown as { after: Effective }).after);
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  const live = (roles.data ?? []).filter((r) => !r["archived"]);
  const sname = (id: string) => schools.data?.find((s) => s["id"] === id)?.["name"] ?? "—";
  const u = username.trim().toLowerCase();

  async function checkName() {
    if (!USERNAME.test(u)) return setTaken(null);
    const { data } = await db.rpc("staff_username_free", { _username: u });
    setTaken(!data);
  }
  function err0(): string | null {
    if (mode === "existing") return existing[0] ? (branches.length ? null : "اختر فرعًا واحدًا على الأقل") : "اختر الحساب القائم";
    if (name.trim().length < 3) return "اسم الموظف مطلوب";
    if (!USERNAME.test(u)) return "اسم المستخدم: 3–30 حرفًا إنجليزيًا صغيرًا أو أرقامًا أو . _ - ويبدأ بحرف أو رقم";
    if (taken) return "اسم المستخدم مستخدم من قبل؛ اختر اسمًا آخر";
    const e = strongEnough(pw); if (e) return e;
    return branches.length ? null : "اختر فرعًا واحدًا على الأقل";
  }
  function err1(): string | null {
    if (rows.some((r) => !r.role_id)) return "اختر الدور في كل سطر أو احذفه";
    if (new Set(rows.map((r) => r.role_id)).size !== rows.length) return "الدور نفسه مكرر";
    if (rows.some((r) => !r.all && !r.school_ids.length)) return "حدد فروع كل دور";
    return null;
  }
  async function next() {
    if (step === 0) { if (mode === "new") await checkName(); const e = err0(); if (e) return void toast.error(e); }
    if (step === 1) { const e = err1(); if (e) return void toast.error(e); setTree(null); setUndeny([]); }
    setAfter(null);
    if (step === 2) { if (!baseline.data) return; await runPreview(); }
    setStep(step + 1);
  }
  async function save() {
    if (!reason.trim()) return void toast.error("اكتب سبب الإضافة");
    setBusy(true);
    try {
      const r = await run({ data: {
        orgId: org, existingUserId: mode === "existing" ? (existing[0] ?? null) : null, username: u, fullName: name.trim(), password: pw, base, schools: branches,
        roles: plannedRoles(), overrides: draft.overrides, reason: reason.trim() } });
      toast.success("resumed" in r ? "اكتمل الحساب من المحاولة السابقة دون تكرار" : r.created ? "أُنشئ الحساب — سيُطلب من الموظف تغيير كلمة المرور عند أول دخول" : "أُضيفت الأدوار إلى الحساب القائم دون تغيير كلمة مروره");
      for (const k of ["perm-people", "perm-roles", "perm-log", "staff-logins"]) qc.invalidateQueries({ queryKey: [k, org] });
      onDone(r.userId);
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  const toggle = (arr: string[], id: string) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const score = passwordScore(pw);

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 text-sm">
      <ol className="flex flex-wrap gap-2" aria-label="مراحل الإضافة">
        {STEPS.map((t, i) => (
          <li key={t} className={"flex items-center gap-2 rounded-full border px-3 py-1 text-xs " + (i === step ? "border-primary bg-primary/10 font-semibold text-primary" : i < step ? "text-primary" : "text-muted-foreground")}>
            <span className="grid size-5 place-items-center rounded-full bg-secondary text-[11px]">{i < step ? <Check className="size-3" /> : i + 1}</span>{t}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="نوع الحساب">
            {(["new", "existing"] as const).map((m) => (
              <Button key={m} type="button" size="sm" variant={mode === m ? "default" : "outline"} role="radio" aria-checked={mode === m} onClick={() => setMode(m)}>
                {m === "new" ? "حساب جديد باسم مستخدم" : "ربط حساب قائم في المؤسسة"}
              </Button>
            ))}
          </div>
          {mode === "existing" ? (
            <div><PeoplePicker purpose="perm" school={school} org={org} single value={existing} onChange={setExisting} label="الحساب القائم" showBranch />
              <p className="mt-1 text-xs text-muted-foreground">تُضاف الأدوار إلى الحساب نفسه؛ لا يُنشأ حساب مكرر ولا تتغير كلمة مروره.</p></div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2"><Label htmlFor="sw-name">اسم الموظف</Label><Input id="sw-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="space-y-1"><Label htmlFor="sw-user">اسم المستخدم</Label>
                <Input id="sw-user" dir="ltr" autoComplete="off" value={username} onChange={(e) => { setUsername(e.target.value); setTaken(null); }} onBlur={checkName} placeholder="ahmed.ali" />
                <p className={"text-xs " + (taken ? "text-destructive" : "text-muted-foreground")}>{taken ? "اسم المستخدم مستخدم من قبل؛ اختر اسمًا آخر" : taken === false ? "متاح ✓" : "حروف إنجليزية صغيرة وأرقام و . _ — لا يفرّق بين الحروف الكبيرة والصغيرة."}</p></div>
              <div className="space-y-1"><Label htmlFor="sw-pw">كلمة المرور الأولية</Label>
                <PasswordInput id="sw-pw" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
                <div className="flex gap-1" aria-hidden>{[0, 1, 2].map((i) => <span key={i} className={"h-1 flex-1 rounded " + (i < score ? (score === 3 ? "bg-success" : "bg-warning") : "bg-muted")} />)}</div>
                <p className="text-xs text-muted-foreground">8 أحرف على الأقل، حروف وأرقام معًا. لا تُحفظ ولا تظهر بعد الحفظ، ويُلزم الموظف بتغييرها عند أول دخول.</p></div>
            </div>
          )}
          <fieldset className="rounded-lg border p-3"><legend className="px-1 font-semibold">الفروع</legend>
            {schools.isLoading ? <p className="text-muted-foreground">…</p> : (
              <div className="flex flex-wrap gap-3">{schools.data!.map((s) => (
                <label key={s["id"]} className="flex items-center gap-2"><input type="checkbox" checked={branches.includes(s["id"])} disabled={!s["is_active"]} onChange={() => setBranches(toggle(branches, s["id"]))} />{s["name"]}{!s["is_active"] && " (موقوف)"}</label>
              ))}</div>
            )}
          </fieldset>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <fieldset className="space-y-2"><legend className="mb-2 font-semibold">الدور الأساسي (يحدد لوحة الموظف)</legend>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="الدور الأساسي">
              {BASES.map((b) => (
                <label key={b} className={"flex cursor-pointer items-center gap-2 rounded-lg border p-2 " + (base === b ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted")}>
                  <input type="radio" name="sw-base" className="accent-primary" checked={base === b} onChange={() => setBase(b)} />{ROLE_LABELS[b]}</label>
              ))}
            </div>
            {BASE_HINT[base] && <p className="text-xs text-muted-foreground">{BASE_HINT[base]}</p>}
            <div className="rounded-lg bg-secondary/40 p-3">
              <p className="mb-2 text-xs font-semibold">أقسام لوحة «{ROLE_LABELS[base]}» الافتراضية</p>
              <div className="grid gap-1 sm:grid-cols-3">
                {NAV_BY_ROLE[base].filter((k) => NAV_LABELS[k]).map((k) => (
                  <label key={k} className="flex items-center gap-2 text-xs"><input type="checkbox" checked disabled className="accent-primary" />{NAV_LABELS[k]}</label>
                ))}
              </div>
              {base === "teacher" && <p className="mt-2 rounded bg-warning/15 p-2 text-[11px]">تظهر أقسام المعلم بعد ربط الحساب بسجل معلم في «المعلمون» وإسناد مقررات له؛ قبل ذلك يرى أقسام أدواره الإضافية فقط.</p>}
              <p className="mt-2 text-[11px] text-muted-foreground">مرتبطة بالدور نفسه ونطاقه في الفرع (تُضبط في الإعداد الأكاديمي والجدول)، وتُضاف إليها أقسام الأدوار الإضافية أدناه.</p>
            </div>
          </fieldset>

          <fieldset className="space-y-2"><legend className="mb-1 font-semibold">أدوار إضافية يمكن إسنادها له</legend>
            <p className="text-xs text-muted-foreground">اختر ما يناسب — مثلًا معلم يتولى أيضًا متابعة صيانة المدارس. تظهر تحت كل دور أقسامه الفرعية وإجراءاته، ويمكن تخصيصها في الخطوة التالية.</p>
            {catalog.areas.filter((ar) => live.some((t) => ((t["grants"] as Grant[]) ?? []).some((g) => catalog.sections.find((x) => x.key === g.section)?.parent === ar.key))).map((ar) => (
              <div key={ar.key} className="rounded-lg border p-2">
                <p className="mb-2 text-xs font-bold text-primary">{ar.label}</p>
                <div className="space-y-2">
                  {live.filter((t) => { const gs = (t["grants"] as Grant[]) ?? []; return gs.length && catalog.sections.find((x) => x.key === gs[0]!.section)?.parent === ar.key; }).map((t) => {
                    const i = rows.findIndex((r) => r.role_id === t["id"]); const r = rows[i];
                    const set = (pp: Partial<RoleRow>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...pp } : x)));
                    const gs = (t["grants"] as Grant[]) ?? [];
                    return (
                      <div key={t["id"]} className={"rounded-lg p-2 " + (r ? "bg-primary/5 ring-1 ring-primary/30" : "")}>
                        <label className="flex items-center gap-2"><input type="checkbox" className="accent-primary" aria-label={t["name"]} checked={!!r}
                          onChange={(e) => setRows(e.target.checked ? [...rows, { role_id: t["id"], all: true, school_ids: [], limit: "" }] : rows.filter((x) => x.role_id !== t["id"]))} />
                          <span className="font-medium">{t["name"]}</span>{!t["system"] && <span className="text-xs text-muted-foreground">(مخصص)</span>}</label>
                        <div className="ms-6 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          {gs.map((g) => { const sec = catalog.sections.find((x) => x.key === g.section); return (
                            <label key={g.section + g.action} className="flex items-center gap-1 text-[11px] text-muted-foreground"><input type="checkbox" disabled checked={!!r} />{sec?.label} ← {sec?.labels?.[g.action] ?? catalog.actions[g.action] ?? g.action} ({catalog.scopes[g.scope] ?? g.scope})</label>); })}
                        </div>
                        {r && (
                          <div className="ms-6 mt-2 flex flex-wrap items-center gap-3 text-xs">
                            <span className="font-semibold">النطاق:</span>
                            <label className="flex items-center gap-1"><input type="checkbox" checked={r.all} onChange={(e) => set({ all: e.target.checked })} />فروع الموظف كلها</label>
                            {!r.all && branches.map((b) => <label key={b} className="flex items-center gap-1"><input type="checkbox" checked={r.school_ids.includes(b)} onChange={() => set({ school_ids: toggle(r.school_ids, b) })} />{sname(b)}</label>)}
                            {gs.some((g) => g.section === "procurement") && <Input className="h-8 w-32" inputMode="decimal" placeholder="حد الاعتماد" value={r.limit} onChange={(e) => set({ limit: e.target.value })} aria-label="حد الاعتماد" />}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {!rows.length && <p className="text-xs text-muted-foreground">لا أدوار إضافية — يحمل الموظف أقسام دوره الأساسي فقط.</p>}
          </fieldset>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">الشجرة محمّلة من الدور الأساسي والأدوار المختارة. التحديد = تفويض شخصي؛ إلغاء صلاحية من دور = «منع صريح» ظاهر بالأحمر يمكن رفعه. لا يُحفظ شيء قبل الخطوة الأخيرة.</p>
          {baseline.isLoading ? <LoadingState /> : baseline.error ? <ErrorState message={arabicError(baseline.error)} /> : (
            <PermTree c={catalog} value={cur} onChange={setTree} disabledAreas={dis.data ?? []} denied={draft.denied} sources={draft.sources}
              onUndeny={(k) => { const o = orig.find((g) => `${g.section}.${g.action}` === k); if (o) setTree([...cur, o]); else setUndeny([...undeny, k]); }} />)}
          {(tree || undeny.length > 0) && <Button size="sm" variant="ghost" onClick={() => { setTree(null); setUndeny([]); }}>إلغاء التخصيص والعودة لصلاحيات الأدوار</Button>}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <dl className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <dt className="text-muted-foreground">الحساب</dt><dd>{mode === "new" ? <>{name} — <span dir="ltr" className="font-mono">{u}</span> (جديد، كلمة مرور أولية تُغيَّر عند أول دخول)</> : "حساب قائم — دون تغيير كلمة المرور"}</dd>
            <dt className="text-muted-foreground">الدور الأساسي</dt><dd>{ROLE_LABELS[base]}</dd>
            <dt className="text-muted-foreground">الفروع</dt><dd>{branches.map(sname).join("، ")}</dd>
          </dl>
          <div><p className="mb-1 font-semibold">الأدوار والصلاحيات التي ستُضاف</p>
            {!rows.length ? <p className="text-muted-foreground">لا أدوار إضافية.</p> : (
              <ul className="space-y-2">{rows.map((r) => { const t = live.find((x) => x["id"] === r.role_id); return (
                <li key={r.role_id} className="rounded-lg bg-secondary/40 p-2"><span className="font-semibold">{t?.["name"]}</span>
                  <span className="block text-xs">النطاق: {r.all ? "فروع الموظف كلها" : r.school_ids.map(sname).join("، ")}{r.limit && ` • حد الاعتماد ${r.limit} ر.س`}</span>
                  <span className="block text-xs text-muted-foreground">{grantText((t?.["grants"] as Grant[]) ?? []) || "بلا صلاحيات"}</span></li>); })}</ul>
            )}</div>
          {draft.overrides.length > 0 && <p className="text-xs">تخصيص شخصي: {draft.overrides.filter((o) => o.effect === "grant").length} تفويض، {draft.overrides.filter((o) => o.effect === "deny").length} منع صريح.</p>}
          {after && <Diff c={catalog} p={{ before: baseline.data?.before ?? { ...after, base_roles: [], roles: [], overrides: [], effective: after.effective.map((x) => ({ ...x, scope: null, allowed_schools: [], base_schools: [], source: null })) }, after }} />}
          <p className="text-xs text-muted-foreground">تُطبَّق قيود المنصة والمنع الخاص وفصل المهام (لا اعتماد لمصروفه أو صرف لنفسه) على الخادم مهما تعددت الأدوار. الحفظ عملية واحدة: إما كل شيء أو لا شيء.</p>
          <div className="space-y-1"><Label htmlFor="sw-reason">سبب الإضافة (يُسجَّل)</Label><Input id="sw-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </div>
      )}

      <div className="flex flex-wrap justify-between gap-2 border-t pt-3">
        <Button type="button" variant="ghost" onClick={step ? () => setStep(step - 1) : onCancel}>{step ? "السابق" : "إلغاء"}</Button>
        {step < 3 ? <Button type="button" onClick={next} disabled={busy || (step === 2 && !baseline.data)}>{step === 2 ? "معاينة" : "التالي"}</Button> : <Button type="button" onClick={save} disabled={busy}>{busy ? "جارٍ الحفظ…" : mode === "new" ? "حفظ وإنشاء الحساب" : "حفظ وإضافة الأدوار"}</Button>}
      </div>
    </div>
  );
}
