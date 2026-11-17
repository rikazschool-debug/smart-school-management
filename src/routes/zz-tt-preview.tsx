import { createFileRoute } from "@tanstack/react-router";
import { TimetableView } from "@/components/family/timetable-view";
const subj = ["الرياضيات", "اللغة العربية", "العلوم", "اللغة الإنجليزية", "التربية الإسلامية", "الاجتماعيات"];
const rows = [0, 1, 2, 3, 4].flatMap((d) => [1, 2, 3, 4, 5, 6, 7].filter((p) => (d + p) % 5 !== 0).map((p) => ({ day: d, period: `الحصة ${p}`, sort: p, start: `${String(6 + p).padStart(2, "0")}:00:00`, end: `${String(6 + p).padStart(2, "0")}:45:00`, subject: subj[(d * 3 + p) % 6]!, teacher: "معلم " + ((d + p) % 4 + 1) })));
export const Route = createFileRoute("/zz-tt-preview")({ component: () => <div dir="rtl" className="mx-auto max-w-5xl p-4"><TimetableView rows={rows} /></div> });
