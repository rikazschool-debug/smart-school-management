// Student add form: pick the guardian from existing guardians of this school or from the group's HR files (teacher/admin staff),
// instead of typing. HR picks go through hr_guardian_from_employee (same login when the employee has one); upsert_student_guardian
// then matches the guardian by the same ID number, so no second record is created.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { Input } from "@/components/ui/input";
import { arabicError } from "@/lib/session";

type Pick = { name: string; id: string; phone: string };
const local = (p: string | null) => { let d = String(p ?? "").replace(/\D/g, ""); if (d.startsWith("966")) d = d.slice(3); if (d.startsWith("0")) d = d.slice(1); return d.slice(0, 9); };

export function GuardianSourcePick({ schoolId, onPick }: { schoolId: string; onPick: (p: Pick) => void }) {
  const [mode, setMode] = useState<"" | "guardian" | "hr">("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const term = q.trim().replace(/[,()*%\\]/g, " ");
  const res = useQuery({ enabled: !!mode && term.length >= 2, queryKey: ["g-src", mode, schoolId, term], queryFn: async () => {
    if (mode === "hr") { const { data, error } = await db.rpc("hr_guardian_candidates", { _school: schoolId, _q: term }); if (error) throw error; return data as Row[]; }
    const { data, error } = await db.from("guardians").select("id, full_name, national_id, phone").eq("school_id", schoolId)
      .or(`full_name.ilike.*${term}*,national_id.ilike.${term}*,phone.ilike.*${term}*`).order("full_name").limit(15);
    if (error) throw error; return data as Row[];
  } });
  async function choose(r: Row) {
    if (!r["national_id"]) return void toast.error("لا يوجد رقم هوية في هذا الملف — أكمله أولًا ليُربط بالطالب");
    if (mode === "hr") {
      setBusy(true);
      const { error } = await db.rpc("hr_guardian_from_employee", { _school: schoolId, _emp: r["id"] });
      setBusy(false);
      if (error) return void toast.error(arabicError(error));
    }
    onPick({ name: r["full_name"], id: r["national_id"], phone: local(r["phone"]) });
    toast.success("اختير ولي الأمر — سيُربط بالطالب عند الحفظ");
    setMode(""); setQ("");
  }
  return (
    <div className="col-span-full space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">مصدر بيانات ولي الأمر:</span>
        {([["", "إدخال يدوي"], ["guardian", "ولي أمر مسجّل"], ["hr", "موظف (معلم/إداري) من الموارد البشرية"]] as const).map(([k, l]) => (
          <label key={k} className="flex items-center gap-1"><input type="radio" name="g-src" className="accent-primary" checked={mode === k} onChange={() => { setMode(k); setQ(""); }} /> {l}</label>
        ))}
      </div>
      {mode && <>
        <Input placeholder={mode === "hr" ? "ابحث بالاسم أو الرقم الوظيفي أو الهوية…" : "ابحث بالاسم أو الهوية أو الجوال…"} value={q} onChange={(e) => setQ(e.target.value)} />
        {res.error && <p className="text-xs text-destructive">{arabicError(res.error)}</p>}
        {res.data?.length === 0 && <p className="text-xs text-muted-foreground">لا نتائج مطابقة.</p>}
        <ul className="max-h-48 divide-y overflow-y-auto">
          {(res.data ?? []).map((r) => (
            <li key={r["id"]}><button type="button" disabled={busy} className="w-full py-1.5 text-start hover:text-primary" onClick={() => void choose(r)}>
              {r["full_name"]} <span className="text-xs text-muted-foreground" dir="ltr">{[r["employee_no"], r["job_title"], r["national_id"] ? `…${String(r["national_id"]).slice(-4)}` : null].filter(Boolean).join(" · ")}</span>
            </button></li>
          ))}
        </ul>
      </>}
    </div>
  );
}
