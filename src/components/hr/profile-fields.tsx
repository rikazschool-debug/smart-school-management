import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { rpc, type HrEmp } from "@/components/hr/shared";
import { bi } from "@/lib/hr-bilingual";
import { EnHint } from "@/components/hr/en-hint";
import { CAL_LABEL, HR_FIELDS, HR_GROUPS, HR_OPTIONS, ID_TYPES, MID_KEYS, cleanValue, isMidPay, passportDateErr, type Cal, type HrGroup } from "@/lib/hr-fields";
/** shown in the basic form next to the ID number (EmpFields), not in this list */
export const ID_KEYS = ["id_type", "id_version"];

// Extra employee data (same definitions as the Excel template), grouped like the import.
/** shown when no direct manager is set: requests then go straight to HR (server: pending_hr). */
export const DEFAULT_MGR = "الموارد البشرية";
export const OWNER_MGR = "مالك المجموعة";
const OWNER_VAL = "@owner";
/** a group-owner account chosen as the named direct manager (server creates/uses the owner's HR file) */
const OWNER_ACC = "@owner:";
export type HrOwner = { user_id: string; name: string; employee_id: string | null };
export const useHrOwners = (org: string) => useQuery({ queryKey: ["hr-owners", org], queryFn: () => rpc<HrOwner[]>("hr_org_owners", { _org: org }) });
export const PROFILE_FIELDS = HR_FIELDS.filter((f) => f.where === "prof");
export type Prof = Record<string, string | null | boolean | undefined> & { sensitive?: boolean; manager_id?: string | null; manager?: string | null; manager_no?: string | null; manager_kind?: string | null; department?: string | null };

/** fields frozen (disabled, kept empty on save) until their switch is on */
const frozen = (k: string, f: Record<string, string>) => (k.startsWith("licence_") && f["has_licence"] !== "yes") || (MID_KEYS.includes(k) && !isMidPay(f["pay_method"]));

export function ProfileFields({ f, set, sensitive, org, self, only }: { f: Record<string, string>; set: (k: string, v: string) => void; sensitive: boolean; org: string; self?: string; only?: HrGroup }) {
  const emps = useQuery({ queryKey: ["hr-list", org, "", "", "active"], queryFn: () => rpc<HrEmp[]>("hr_employee_list", { _org: org, _school: null, _q: null, _status: "active" }) });
  const owners = useHrOwners(org);
  const ownerEmp = new Set((owners.data ?? []).map((o) => o.employee_id).filter(Boolean));
  return (
    <div className="space-y-3">
      {HR_GROUPS.filter((g) => !only || g.key === only).map((g) => {
        const list = PROFILE_FIELDS.filter((x) => x.group === g.key && (!x.sensitive || sensitive) && !ID_KEYS.includes(x.key));
        const hidden = PROFILE_FIELDS.some((x) => x.group === g.key && x.sensitive && !sensitive);
        if (!list.length && g.key !== "job" && !hidden) return null;
        const body = (<>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.key === "job" && <div><Label htmlFor="hp-mgr">{bi("manager", "المسؤول المباشر")}</Label>
                <select id="hp-mgr" className={selectCls("mt-1 w-full")} value={f["manager_id"] ?? ""} onChange={(e) => set("manager_id", e.target.value)}>
                  <option value="">{DEFAULT_MGR} (افتراضي)</option><option value={OWNER_VAL}>{OWNER_MGR} (أي مالك، بدل الموارد البشرية)</option>
                  {(owners.data ?? []).filter((o) => !o.employee_id || o.employee_id !== self).map((o) => <option key={o.user_id} value={o.employee_id ?? `${OWNER_ACC}${o.user_id}`}>حساب المالك: {o.name}</option>)}
                  {(emps.data ?? []).filter((x) => x.id !== self && !ownerEmp.has(x.id)).map((x) => <option key={x.id} value={x.id}>{x.display_name || x.full_name} — {x.employee_no}</option>)}
                </select><p className="mt-1 text-xs text-muted-foreground">«الموارد البشرية»: تذهب الطلبات (إجازات، استئذان) مباشرة إلى الموارد البشرية. «مالك المجموعة»: تصل للمالك وحده ويبت فيها. «حساب المالك»: يعتمد المالك مسؤولًا مباشرًا ثم تنتقل للموارد البشرية. أو اختر موظفًا بعينه. لا يكون الشخص مسؤولًا عن نفسه.</p></div>}
              {list.map((x) => { const off = frozen(x.key, f); const opts = HR_OPTIONS[x.key]; return x.kind === "check" ? (
                <div key={x.key} className="flex items-end pb-2"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" id={`hp-${x.key}`} checked={f[x.key] === "yes"} onChange={(e) => set(x.key, e.target.checked ? "yes" : "")} />{bi(x.key, x.label)}</label></div>
              ) : x.kind === "docdate" ? (
                <div key={x.key}><Label htmlFor={`hp-${x.key}`}>{bi(x.key, x.label)}</Label>
                  <div className="mt-1 flex gap-1"><Input id={`hp-${x.key}`} dir="ltr" disabled={off} placeholder={off ? "غير مطلوب" : "1447-05-10 أو 2027-01-31"} value={off ? "" : f[x.key] ?? ""} onChange={(e) => set(x.key, e.target.value)} />
                    <select aria-label={`تقويم ${x.label}`} disabled={off} className={selectCls("w-24")} value={f[`${x.key}_cal`] ?? ""} onChange={(e) => set(`${x.key}_cal`, e.target.value)}><option value="">تلقائي</option><option value="hijri">هجري</option><option value="gregorian">ميلادي</option></select></div>
                  {x.key === "passport_expiry" && passportDateErr(f) && <p role="alert" className="mt-1 text-xs text-destructive">{passportDateErr(f)}</p>}</div>
              ) : opts ? (
                <div key={x.key}><Label htmlFor={`hp-${x.key}`}>{bi(x.key, x.label)}</Label>
                  <select id={`hp-${x.key}`} className={selectCls("mt-1 w-full")} value={f[x.key] ?? ""} onChange={(e) => set(x.key, e.target.value)}>
                    <option value="">—</option>{opts.map((o) => <option key={o} value={o}>{o}</option>)}
                    {f[x.key] && !opts.includes(f[x.key]!) && <option value={f[x.key]}>{f[x.key]}</option>}
                  </select><EnHint k={x.key} v={f[x.key]} /></div>
              ) : (
                <div key={x.key}><Label htmlFor={`hp-${x.key}`}>{bi(x.key, x.label)}</Label><Input id={`hp-${x.key}`} className="mt-1" disabled={off} placeholder={off ? "غير مطلوب" : undefined} maxLength={x.max} dir={["iban", "digits"].includes(x.kind) || x.key === "name_en" || x.key === "passport_no" ? "ltr" : undefined} value={off ? "" : f[x.key] ?? ""} onChange={(e) => set(x.key, e.target.value)} />
                  {x.max ? <p className="mt-1 text-xs text-muted-foreground">{(f[x.key] ?? "").length}/{x.max} خانة</p> : <EnHint k={x.key} v={f[x.key]} />}</div>
              ); })}
            </div>
            {hidden && <p className="mt-2 text-xs text-muted-foreground">بعض حقول هذه المجموعة تحتاج صلاحية «البيانات الحساسة».</p>}
        </>);
        return only ? <div key={g.key}>{body}</div> : (
          <fieldset key={g.key} className="rounded-lg border p-3">
            <legend className="px-1 text-sm font-semibold">{g.label}{g.key === "personal" ? " (إضافية)" : ""}</legend>{body}
          </fieldset>
        );
      })}
    </div>
  );
}

/** Validate the extra fields with the shared rules; returns payload for hr_employee_profile_save (mode set) or an error. */
export function profilePayload(f: Record<string, string>, sensitive: boolean, prev?: Prof | null): { p: Record<string, string>; err?: string } {
  const p: Record<string, string> = {};
  const pe = sensitive ? passportDateErr(f) : ""; if (pe) return { p, err: pe };
  f = { ...f };
  if ("has_licence" in f && f["has_licence"] !== "yes") { f["licence_type"] = ""; f["licence_expiry"] = ""; f["licence_expiry_cal"] = ""; }
  if (f["id_type"] === "none") f["id_version"] = "";
  if ("pay_method" in f && !isMidPay(f["pay_method"])) for (const k of MID_KEYS) if (k in f) f[k] = "";
  for (const x of PROFILE_FIELDS) {
    if (x.sensitive && !sensitive) continue;
    if (!(x.key in f)) continue;
    const c = cleanValue(x, f[x.key]);
    if (c.err) return { p, err: c.err };
    if (x.kind === "docdate") {
      const want = f[`${x.key}_cal`] as Cal | "" | undefined;
      if (c.v && want && c.cal && want !== c.cal) return { p, err: `${x.label}: التاريخ لا يوافق التقويم المختار` };
      p[`${x.key}_cal`] = c.v ? (want || c.cal || "") : "";
    }
    p[x.key] = c.v;
  }
  if ("manager_id" in f) {
    const want = f["manager_id"] ?? "", had = prev?.manager_id ? String(prev.manager_id) : prev?.manager_kind === "owner" ? OWNER_VAL : "";
    if (want !== had) {
      if (want === OWNER_VAL) p["manager_kind"] = "owner";
      else if (want === "") p["manager_kind"] = "hr";
      else if (want.startsWith(OWNER_ACC)) p["manager_owner"] = want.slice(OWNER_ACC.length);
      else p["manager_id"] = want;
    }
  }
  return { p };
}
export const profileForm = (pr: Prof | undefined | null): Record<string, string> => {
  const o: Record<string, string> = { manager_id: pr?.manager_id ? String(pr.manager_id) : pr?.manager_kind === "owner" ? OWNER_VAL : "" };
  for (const x of PROFILE_FIELDS) { if (x.sensitive && !pr?.sensitive) continue; o[x.key] = String(pr?.[x.key] ?? ""); if (x.kind === "docdate") o[`${x.key}_cal`] = String(pr?.[`${x.key}_cal`] ?? ""); }
  return o;
};

export function ProfileView({ pr }: { pr: Prof | undefined }) {
  if (!pr) return null;
  return (
    <div className="space-y-2">
      {HR_GROUPS.map((g) => {
        const list = PROFILE_FIELDS.filter((x) => x.group === g.key && (!x.sensitive || pr.sensitive || x.key === "passport_no" || x.key === "iban"));
        const extra = g.key === "job" ? [["المسؤول المباشر", pr.manager ? `${pr.manager}${pr.manager_no ? ` (${pr.manager_no})` : ""}` : pr.manager_kind === "owner" ? OWNER_MGR : `${DEFAULT_MGR} (افتراضي)`] as const] : [];
        if (!list.length && !extra.length) return null;
        return (
          <div key={g.key}><p className="mb-1 text-xs font-semibold text-muted-foreground">{g.label}</p>
            <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {extra.map(([k, v]) => <div key={k} className="rounded-lg bg-secondary/40 p-2"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v || "—"}</dd></div>)}
              {list.map((x) => { const v0 = pr[x.key] as string | null | undefined; const v = x.kind === "idtype" ? (v0 ? ID_TYPES[v0] ?? v0 : v0) : x.kind === "check" ? (v0 === "yes" ? "نعم" : v0) : v0; const cal = pr[`${x.key}_cal`] as Cal | null | undefined;
                return <div key={x.key} className="rounded-lg bg-secondary/40 p-2"><dt className="text-xs text-muted-foreground">{x.label}</dt><dd className="font-medium">{v ? <bdi dir={["iban", "digits"].includes(x.kind) ? "ltr" : undefined}>{v}{cal ? ` (${CAL_LABEL[cal]})` : ""}</bdi> : "—"}</dd></div>; })}
            </dl></div>
        );
      })}
    </div>
  );
}
