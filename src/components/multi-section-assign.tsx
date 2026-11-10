// Assign one teacher to one subject across several sections at once: per section the course (subject+section+year)
// is reused or created, then a pending teacher_assignments row is filed — each approval prepares that section's classroom.
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Layers } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";

export function MultiSectionAssign({ schoolId, canCreateCourses }: { schoolId: string; canCreateCourses: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [teacher, setTeacher] = useState(""), [subject, setSubject] = useState(""), [year, setYear] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10)), [end, setEnd] = useState("");
  const [periods, setPeriods] = useState("4");
  const [busy, setBusy] = useState(false);
  const sel = selectCls("w-full");

  const data = useQuery({
    enabled: open,
    queryKey: ["multi-assign", schoolId],
    queryFn: async () => {
      const [t, s, y, sec, co] = await Promise.all([
        db.from("teachers").select("id, full_name").eq("school_id", schoolId).eq("status", "active").order("full_name"),
        db.from("subjects").select("id, name").eq("school_id", schoolId).order("name"),
        db.from("academic_years").select("id, name, is_current").eq("school_id", schoolId).order("start_date", { ascending: false }),
        db.from("sections").select("id, name, year_id, grades(name, sort_order, stages(name, sort_order))").eq("school_id", schoolId),
        db.from("courses").select("id, subject_id, section_id, year_id, teacher_assignments(status, teachers(full_name))").eq("school_id", schoolId),
      ]);
      for (const r of [t, s, y, sec, co]) if (r.error) throw r.error;
      return { teachers: t.data as Row[], subjects: s.data as Row[], years: y.data as Row[], sections: sec.data as Row[], courses: co.data as Row[] };
    },
  });
  const yearId = year || data.data?.years.find((x) => x["is_current"])?.["id"] || "";
  const groups = useMemo(() => {
    const m = new Map<string, { label: string; order: number; items: Row[] }>();
    for (const s of data.data?.sections ?? []) {
      if (s["year_id"] !== yearId) continue;
      const g = s["grades"] ?? {}; const label = `${g.stages?.name ? g.stages.name + " — " : ""}${g.name ?? ""}`;
      const cur = m.get(label) ?? { label, order: (g.stages?.sort_order ?? 0) * 1000 + (g.sort_order ?? 0), items: [] as Row[] };
      cur.items.push(s); m.set(label, cur);
    }
    return [...m.values()].sort((a, b) => a.order - b.order).map((g) => ({ ...g, items: g.items.sort((a, b) => String(a["name"]).localeCompare(String(b["name"]), "ar")) }));
  }, [data.data, yearId]);
  const courseOf = (sec: string) => data.data?.courses.find((c) => c["subject_id"] === subject && c["section_id"] === sec && c["year_id"] === yearId);
  const takenBy = (sec: string) => (courseOf(sec)?.["teacher_assignments"] as Row[] | undefined)?.find((a) => a["status"] === "approved" || a["status"] === "pending")?.["teachers"]?.full_name as string | undefined;

  function toggle(id: string) { const n = new Set(picked); if (n.has(id)) n.delete(id); else n.add(id); setPicked(n); }

  async function save() {
    if (!teacher || !subject || !yearId) return void toast.error("اختر المعلم والمادة والسنة");
    if (!picked.size) return void toast.error("اختر شعبة واحدة على الأقل");
    if (end && end < start) return void toast.error("نهاية السريان قبل بدايته");
    setBusy(true);
    let ok = 0; const fails: string[] = [];
    for (const sec of picked) {
      const label = data.data?.sections.find((x) => x["id"] === sec); const name = `${label?.["grades"]?.name ?? ""} / ${label?.["name"] ?? ""}`;
      try {
        let cid = courseOf(sec)?.["id"] as string | undefined;
        if (!cid) {
          if (!canCreateCourses) throw new Error("لا يوجد مقرر لهذه المادة في الشعبة؛ تطلب إنشاءه من الإدارة");
          const c = await db.from("courses").insert({ school_id: schoolId, year_id: yearId, subject_id: subject, section_id: sec, weekly_periods: Number(periods) || null }).select("id").single();
          if (c.error) throw c.error; cid = c.data.id as string;
        }
        if (takenBy(sec)) throw new Error(`مكلف بها ${takenBy(sec)}`);
        const a = await db.from("teacher_assignments").insert({ school_id: schoolId, course_id: cid, teacher_id: teacher, start_date: start, end_date: end || null, status: "pending" });
        if (a.error) throw a.error;
        ok++;
      } catch (e) { fails.push(`${name}: ${arabicError(e)}`); }
    }
    setBusy(false);
    qc.invalidateQueries();
    if (ok) toast.success(`أُرسل ${ok} تكليف للاعتماد — يُجهَّز لكل شعبة فصلها الرقمي عند الاعتماد`);
    if (fails.length) toast.error(fails.join("\n"), { duration: 10000 });
    if (!fails.length) { setOpen(false); setPicked(new Set()); }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Layers className="size-4" /> تكليف معلم بعدة شعب</Button>
      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent dir="rtl" className="max-h-[90dvh] max-w-2xl overflow-y-auto">
          <DialogHeader><DialogTitle>تكليف معلم بعدة شعب</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">اختر المعلم والمادة ثم كل الشعب التي يدرّسها. يُرسل تكليف مستقل لكل شعبة للاعتماد، وبعد الاعتماد يظهر للمعلم الفصل الرقمي لكل شعبة.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><Label htmlFor="ma-t">المعلم *</Label>
              <select id="ma-t" className={sel} value={teacher} onChange={(e) => setTeacher(e.target.value)}>
                <option value="">— اختر المعلم —</option>{data.data?.teachers.map((t) => <option key={t["id"]} value={t["id"]}>{t["full_name"]}</option>)}
              </select></div>
            <div className="space-y-1"><Label htmlFor="ma-s">المادة *</Label>
              <select id="ma-s" className={sel} value={subject} onChange={(e) => { setSubject(e.target.value); setPicked(new Set()); }}>
                <option value="">— اختر المادة —</option>{data.data?.subjects.map((t) => <option key={t["id"]} value={t["id"]}>{t["name"]}</option>)}
              </select></div>
            <div className="space-y-1"><Label htmlFor="ma-y">السنة الدراسية</Label>
              <select id="ma-y" className={sel} value={yearId} onChange={(e) => { setYear(e.target.value); setPicked(new Set()); }}>
                {data.data?.years.map((t) => <option key={t["id"]} value={t["id"]}>{t["name"]}{t["is_current"] ? " (الحالية)" : ""}</option>)}
              </select></div>
            <div className="space-y-1"><Label htmlFor="ma-p">الحصص الأسبوعية (للمقررات الجديدة)</Label><Input id="ma-p" type="number" min={0} value={periods} onChange={(e) => setPeriods(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="ma-st">بداية السريان *</Label><Input id="ma-st" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="ma-en">نهاية السريان</Label><Input id="ma-en" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between"><Label>الشعب *</Label><span className="text-xs text-muted-foreground">المختار: {picked.size}</span></div>
            {!subject ? <p className="text-sm text-muted-foreground">اختر المادة أولًا لعرض الشعب.</p> : !groups.length ? <p className="text-sm text-muted-foreground">لا توجد شعب في هذه السنة.</p> : groups.map((g) => (
              <fieldset key={g.label} className="rounded-lg border p-3">
                <legend className="px-1 text-sm font-semibold">{g.label}</legend>
                <div className="flex flex-wrap gap-2">
                  {g.items.map((s) => {
                    const by = takenBy(s["id"]); const on = picked.has(s["id"]);
                    return (
                      <button key={s["id"]} type="button" disabled={!!by} onClick={() => toggle(s["id"])} aria-pressed={on} title={by ? `مكلف بها ${by}` : undefined}
                        className={`rounded-full border px-3 py-1 text-sm transition ${on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"} disabled:cursor-not-allowed disabled:opacity-50`}>
                        شعبة {s["name"]}{by ? ` — ${by}` : ""}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
          <div className="flex justify-end"><Button onClick={save} disabled={busy}>{busy ? "جارٍ الإرسال…" : `إرسال ${picked.size || ""} تكليف`}</Button></div>
        </DialogContent>
      </Dialog>
    </>
  );
}
