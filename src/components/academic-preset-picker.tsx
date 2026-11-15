import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db, useOptions, type Row } from "@/components/crud-page";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";

/** One ready-made list per kind. Grades are grouped by stage and fill the form's own «المرحلة» field — no second stage picker. */
export function AcademicPresetPicker({ kind, org, school, onSelect }: {
  kind: "stage" | "grade"; org: string; school: string; onSelect: (values: Row) => void;
}) {
  const [selected, setSelected] = useState("");
  const stages = useOptions("stages", "name", kind === "grade" ? school : null, { available: true });
  const catalog = useQuery({
    queryKey: ["academic-catalog", org],
    queryFn: async () => {
      const [base, own] = await Promise.all([
        db.from("academic_catalog").select("*").order("sort_order"),
        db.from("org_academic_catalog").select("*").eq("org_id", org).order("sort_order"),
      ]);
      if (base.error) throw base.error;
      if (own.error) throw own.error;
      return [...base.data, ...own.data] as Row[];
    },
  });
  if (catalog.isLoading || (kind === "grade" && stages.isLoading)) return <LoadingState />;
  if (catalog.error || stages.error) return <ErrorState message={arabicError(catalog.error ?? stages.error)} />;
  const rows = (catalog.data ?? []).filter(r => r["kind"] === kind);
  const groups = kind === "grade"
    ? (stages.data ?? []).map(s => ({ stage: s, items: rows.filter(r => r["stage"] === s.label) })).filter(g => g.items.length > 0)
    : [];
  const pick = (id: string) => {
    setSelected(id);
    const row = rows.find(r => r["id"] === id);
    if (!row) return;
    if (kind === "stage") return onSelect({ name: row["name"], sort_order: row["sort_order"] });
    const stage = stages.data?.find(s => s.label === row["stage"]);
    if (stage) onSelect({ name: row["name"], sort_order: row["sort_order"], stage_id: stage.value });
  };
  return <section className="space-y-3 border-b pb-4">
    <div className="space-y-1.5">
      <Label htmlFor="academic-preset-name">{kind === "stage" ? "المرحلة الجاهزة" : "الصف الجاهز"}</Label>
      <select id="academic-preset-name" className={selectCls("w-full")} value={selected} onChange={e => pick(e.target.value)}>
        <option value="">{kind === "stage" ? "اختر المرحلة" : "اختر الصف"}</option>
        {kind === "stage"
          ? rows.map(r => <option key={r["id"]} value={r["id"]}>{r["name"]}</option>)
          : groups.map(g => <optgroup key={g.stage.value} label={g.stage.label}>
              {g.items.map(r => <option key={r["id"]} value={r["id"]}>{r["name"]}</option>)}
            </optgroup>)}
      </select>
      {kind === "grade" && <p className="text-xs text-muted-foreground">تُملأ المرحلة تلقائيًا في الحقل أدناه.</p>}
    </div>
  </section>;
}

/** «المرحلة الابتدائية» and «الابتدائية» are the same stage (matches server _academic_stage_key). */
export const stageKey = (n: unknown) => String(n ?? "").trim().replace(/^المرحلة\s+/, "");

/** Grade name select: lists only the approved grades of the stage chosen in the same form. */
export function GradeNameSelect({ org, school, value, values, set }: {
  org: string; school: string; value: unknown; values: Row; set: (patch: Row) => void;
}) {
  const stages = useOptions("stages", "name", school);
  const catalog = useQuery({
    queryKey: ["academic-catalog", org],
    enabled: !!org,
    queryFn: async () => {
      const [base, own] = await Promise.all([
        db.from("academic_catalog").select("*").order("sort_order"),
        db.from("org_academic_catalog").select("*").eq("org_id", org).order("sort_order"),
      ]);
      if (base.error) throw base.error;
      if (own.error) throw own.error;
      return [...base.data, ...own.data] as Row[];
    },
  });
  const stage = stages.data?.find(s => s.value === values["stage_id"]);
  const items = stage ? (catalog.data ?? []).filter(r => r["kind"] === "grade" && stageKey(r["stage"]) === stageKey(stage.label)) : [];
  const current = String(value ?? "");
  const known = items.some(r => r["name"] === current);
  return <select id="name" className={selectCls("w-full")} value={current} disabled={!stage || catalog.isLoading}
    onChange={e => { const r = items.find(x => x["name"] === e.target.value); set({ name: e.target.value, sort_order: r?.["sort_order"] ?? null }); }}>
    <option value="">{!stage ? "اختر المرحلة أولًا" : catalog.isLoading ? "جارٍ التحميل…" : items.length ? "اختر الصف" : "لا توجد صفوف معتمدة لهذه المرحلة"}</option>
    {current && !known && <option value={current}>{current}</option>}
    {items.map(r => <option key={r["id"]} value={r["name"]}>{r["name"]}</option>)}
  </select>;
}
