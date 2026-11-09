import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { rpc, type HrEmp } from "@/components/hr/shared";
import { CAL_LABEL, HR_FIELDS, HR_GROUPS, cleanValue, type Cal } from "@/lib/hr-fields";

// Extra employee data (same definitions as the Excel template), grouped like the import.
export const PROFILE_FIELDS = HR_FIELDS.filter((f) => f.where === "prof");
export type Prof = Record<string, string | null | boolean | undefined> & { sensitive?: boolean; manager_id?: string | null; manager?: string | null; manager_no?: string | null; department?: string | null };

export function ProfileFields({ f, set, sensitive, org, self }: { f: Record<string, string>; set: (k: string, v: string) => void; sensitive: boolean; org: string; self?: string }) {
  const emps = useQuery({ queryKey: ["hr-list", org, "", "", "active"], queryFn: () => rpc<HrEmp[]>("hr_employee_list", { _org: org, _school: null, _q: null, _status: "active" }) });
  return (
    <div className="space-y-3">
      {HR_GROUPS.filter((g) => g.key !== "basic" || PROFILE_FIELDS.some((x) => x.group === "basic")).map((g) => {
        const list = PROFILE_FIELDS.filter((x) => x.group === g.key && (!x.sensitive || sensitive));
        const hidden = PROFILE_FIELDS.some((x) => x.group === g.key && x.sensitive && !sensitive);
        if (!list.length && g.key !== "assign" && !hidden) return null;
        return (
          <fieldset key={g.key} className="rounded-lg border p-3">
            <legend className="px-1 text-sm font-semibold">{g.label}{g.key === "basic" ? " (إضافية)" : ""}</legend>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.key === "assign" && <div><Label htmlFor="hp-mgr">المسؤول المباشر</Label>
                <select id="hp-mgr" className={selectCls("mt-1 w-full")} value={f["manager_id"] ?? ""} onChange={(e) => set("manager_id", e.target.value)}>
                  <option value="">بلا</option>{(emps.data ?? []).filter((x) => x.id !== self).map((x) => <option key={x.id} value={x.id}>{x.display_name || x.full_name} — {x.employee_no}</option>)}
                </select></div>}
              {list.map((x) => x.kind === "docdate" ? (
                <div key={x.key}><Label htmlFor={`hp-${x.key}`}>{x.label}</Label>
                  <div className="mt-1 flex gap-1"><Input id={`hp-${x.key}`} dir="ltr" placeholder="1447-05-10 أو 2027-01-31" value={f[x.key] ?? ""} onChange={(e) => set(x.key, e.target.value)} />
                    <select aria-label={`تقويم ${x.label}`} className={selectCls("w-24")} value={f[`${x.key}_cal`] ?? ""} onChange={(e) => set(`${x.key}_cal`, e.target.value)}><option value="">تلقائي</option><option value="hijri">هجري</option><option value="gregorian">ميلادي</option></select></div></div>
              ) : (
                <div key={x.key}><Label htmlFor={`hp-${x.key}`}>{x.label}</Label><Input id={`hp-${x.key}`} className="mt-1" dir={["iban", "digits"].includes(x.kind) || x.key === "name_en" || x.key === "passport_no" ? "ltr" : undefined} value={f[x.key] ?? ""} onChange={(e) => set(x.key, e.target.value)} /></div>
              ))}
            </div>
            {hidden && <p className="mt-2 text-xs text-muted-foreground">بعض حقول هذه المجموعة تحتاج صلاحية «البيانات الحساسة».</p>}
          </fieldset>
        );
      })}
    </div>
  );
}

/** Validate the extra fields with the shared rules; returns payload for hr_employee_profile_save (mode set) or an error. */
export function profilePayload(f: Record<string, string>, sensitive: boolean, prev?: Prof | null): { p: Record<string, string>; err?: string } {
  const p: Record<string, string> = {};
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
  if ("manager_id" in f && (f["manager_id"] ?? "") !== (prev?.manager_id ?? "")) p["manager_id"] = f["manager_id"] ?? "";
  return { p };
}
export const profileForm = (pr: Prof | undefined | null): Record<string, string> => {
  const o: Record<string, string> = { manager_id: pr?.manager_id ?? "" };
  for (const x of PROFILE_FIELDS) { if (x.sensitive && !pr?.sensitive) continue; o[x.key] = String(pr?.[x.key] ?? ""); if (x.kind === "docdate") o[`${x.key}_cal`] = String(pr?.[`${x.key}_cal`] ?? ""); }
  return o;
};

export function ProfileView({ pr }: { pr: Prof | undefined }) {
  if (!pr) return null;
  return (
    <div className="space-y-2">
      {HR_GROUPS.map((g) => {
        const list = PROFILE_FIELDS.filter((x) => x.group === g.key && (!x.sensitive || pr.sensitive || x.key === "passport_no" || x.key === "iban"));
        const extra = g.key === "assign" ? [["المسؤول المباشر", pr.manager ? `${pr.manager}${pr.manager_no ? ` (${pr.manager_no})` : ""}` : null] as const] : [];
        if (!list.length && !extra.length) return null;
        return (
          <div key={g.key}><p className="mb-1 text-xs font-semibold text-muted-foreground">{g.label}</p>
            <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {extra.map(([k, v]) => <div key={k} className="rounded-lg bg-secondary/40 p-2"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="font-medium">{v || "—"}</dd></div>)}
              {list.map((x) => { const v = pr[x.key] as string | null | undefined; const cal = pr[`${x.key}_cal`] as Cal | null | undefined;
                return <div key={x.key} className="rounded-lg bg-secondary/40 p-2"><dt className="text-xs text-muted-foreground">{x.label}</dt><dd className="font-medium">{v ? <bdi dir={["iban", "digits"].includes(x.kind) ? "ltr" : undefined}>{v}{cal ? ` (${CAL_LABEL[cal]})` : ""}</bdi> : "—"}</dd></div>; })}
            </dl></div>
        );
      })}
    </div>
  );
}
