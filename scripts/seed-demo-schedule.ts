// Upgrades the demo school for package 2: current academic year, bell times, a second (science) teacher.
// Run after seed-demo.ts: NODE_PATH=node_modules bun scripts/seed-demo-schedule.ts  (idempotent)
import { createClient } from "@supabase/supabase-js";

const a = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const must = <T,>(r: { data: T; error: unknown }) => { if (r.error) throw r.error; return r.data; };

const school = must(await a.from("schools").select("id").eq("name", "مدرسة ركاز النموذجية").single()) as { id: string };
const S = school.id;
const year = must(await a.from("academic_years").select("id").eq("school_id", S).order("created_at").limit(1).single()) as { id: string };
await a.from("academic_years").update({ name: "1448 هـ", start_date: "2026-08-23", end_date: "2027-06-10" }).eq("id", year.id);
await a.from("terms").update({ start_date: "2026-08-23", end_date: "2027-01-07" }).eq("year_id", year.id);
await a.from("teacher_assignments").update({ start_date: "2026-08-23" }).eq("school_id", S);
await a.from("classrooms").update({ title: "الرياضيات — أول متوسط — شعبة أ — 1448 هـ" }).eq("school_id", S);

await a.from("school_day_settings").upsert({ school_id: S, study_days: [0, 1, 2, 3, 4], day_start: "07:00", day_end: "12:30" });
const { count } = await a.from("periods").select("id", { count: "exact", head: true }).eq("school_id", S);
if (!count) {
  must(await a.from("periods").insert([
    { school_id: S, sort_order: 1, name: "الحصة الأولى", start_time: "07:00", end_time: "07:45" },
    { school_id: S, sort_order: 2, name: "الحصة الثانية", start_time: "07:50", end_time: "08:35" },
    { school_id: S, sort_order: 3, name: "الفسحة", start_time: "08:35", end_time: "09:00", kind: "break" },
    { school_id: S, sort_order: 4, name: "الحصة الثالثة", start_time: "09:00", end_time: "09:45" },
    { school_id: S, sort_order: 5, name: "الحصة الرابعة", start_time: "09:50", end_time: "10:35" },
  ]));
  must(await a.from("rooms").insert([{ school_id: S, name: "قاعة 101" }, { school_id: S, name: "معمل العلوم" }]));
}
const sci = (await a.from("teachers").select("id").eq("school_id", S).eq("full_name", "أ. فهد القحطاني").maybeSingle()).data;
if (!sci) {
  const t = must(await a.from("teachers").insert({ school_id: S, full_name: "أ. فهد القحطاني", specialization: "علوم" }).select().single()) as { id: string };
  const c = must(await a.from("courses").select("id, subjects!inner(name)").eq("school_id", S).eq("subjects.name", "العلوم").limit(1).single()) as { id: string };
  must(await a.from("teacher_assignments").insert({ school_id: S, course_id: c.id, teacher_id: t.id, status: "approved", start_date: "2026-08-23", decided_at: new Date().toISOString() }));
  const cr = (await a.from("classrooms").select("id").eq("course_id", c.id).maybeSingle()).data;
  if (!cr) must(await a.from("classrooms").insert({ school_id: S, course_id: c.id, title: "العلوم — أول متوسط — شعبة أ — 1448 هـ" }));
}
console.log("demo schedule data ready");
