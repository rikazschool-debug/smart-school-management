import { useState } from "react";
import { SUBJECT_PRESETS, subjectPresets } from "@/lib/subject-presets";
import { selectCls } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";

export function SubjectPresetPicker({ onSelect }: { onSelect: (name: string) => void }) {
  const [stage, setStage] = useState("");
  const [grade, setGrade] = useState("");
  const [subject, setSubject] = useState("");
  const grades = Object.keys(SUBJECT_PRESETS[stage] ?? {});
  return <section className="space-y-3 border-b pb-4">
    <h3 className="font-semibold">المقررات الجاهزة</h3>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="space-y-1.5"><Label htmlFor="preset-stage">المرحلة</Label>
        <select id="preset-stage" className={selectCls("w-full")} value={stage} onChange={e => { setStage(e.target.value); setGrade(""); setSubject(""); }}>
          <option value="">اختر المرحلة</option>{Object.keys(SUBJECT_PRESETS).map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
      <div className="space-y-1.5"><Label htmlFor="preset-grade">الصف / المستوى</Label>
        <select id="preset-grade" className={selectCls("w-full")} value={grade} disabled={!stage} onChange={e => { setGrade(e.target.value); setSubject(""); }}>
          <option value="">اختر الصف / المستوى</option>{grades.map(g => <option key={g} value={g}>{stage === "رياض الأطفال" ? ({ KG1: "مستوى أول", KG2: "مستوى ثاني", KG3: "مستوى ثالث" }[g] ?? g) : g}</option>)}
        </select>
      </div>
      <div className="space-y-1.5"><Label htmlFor="preset-subject">المقرر الجاهز</Label>
        <select id="preset-subject" className={selectCls("w-full")} value={subject} disabled={!grade} onChange={e => { setSubject(e.target.value); if (e.target.value) onSelect(e.target.value); }}>
          <option value="">اختر المقرر</option>{subjectPresets(stage, grade).map(name => <option key={name}>{name}</option>)}
        </select>
      </div>
    </div>
  </section>;
}