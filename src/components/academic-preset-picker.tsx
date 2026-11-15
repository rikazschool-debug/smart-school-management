import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db, useOptions, type Row } from "@/components/crud-page";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";

export function AcademicPresetPicker({ kind, org, school, onSelect }: {
  kind: "stage" | "grade"; org: string; school: string; onSelect: (values: Row) => void;
}) {
  const [stageId, setStageId] = useState("");
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
  const stageName = stages.data?.find(s => s.value === stageId)?.label;
  const choices = (catalog.data ?? []).filter(r => r["kind"] === kind && (kind === "stage" || r["stage"] === stageName));
  if (catalog.isLoading || (kind === "grade" && stages.isLoading)) return <LoadingState />;
  if (catalog.error || stages.error) return <ErrorState message={arabicError(catalog.error ?? stages.error)} />;
  return <section className="space-y-3 border-b pb-4">
    <h3 className="font-semibold">{kind === "stage" ? "المراحل الجاهزة" : "الصفوف الجاهزة"}</h3>
    {kind === "grade" && <div className="space-y-1.5">
      <Label htmlFor="academic-preset-stage">مرحلة الصف الجاهز</Label>
      <select id="academic-preset-stage" className={selectCls("w-full")} value={stageId} onChange={e => {
        setStageId(e.target.value); setSelected(""); onSelect({ stage_id: e.target.value, name: "", sort_order: null });
      }}><option value="">اختر المرحلة</option>{stages.data?.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
    </div>}
    <div className="space-y-1.5">
      <Label htmlFor="academic-preset-name">{kind === "stage" ? "المرحلة الجاهزة" : "الصف الجاهز"}</Label>
      <select id="academic-preset-name" className={selectCls("w-full")} value={selected} disabled={kind === "grade" && !stageId} onChange={e => {
        setSelected(e.target.value);
        const row = choices.find(r => r["id"] === e.target.value);
        if (row) onSelect({ name: row["name"], sort_order: row["sort_order"], ...(kind === "grade" ? { stage_id: stageId } : {}) });
      }}><option value="">{kind === "stage" ? "اختر المرحلة" : "اختر الصف"}</option>{choices.map(r => <option key={r["id"]} value={r["id"]}>{r["name"]}</option>)}</select>
    </div>
  </section>;
}