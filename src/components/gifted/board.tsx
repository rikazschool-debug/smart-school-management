import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { selectCls } from "@/components/ui/native-select";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { boardStats, CARE_LABEL, GT_DOMAINS, GT_STATUS, ownerOf, type GtSearch } from "./model";
import { gtToday } from "./nomination-wizard";
import { nomQuery } from "./nominations";
import { planQuery } from "./plans";
import { progQuery } from "./programs";
import { workQuery } from "./works";
import { studentsQuery } from "./reports";

const uniq = (a: (string | null)[]) => [...new Set(a.filter((x): x is string => !!x))].sort();

export function Board({ school, go }: { school: string; go: (s: GtSearch, replace?: boolean) => void }) {
  const nq = useQuery(nomQuery(school)); const st = useQuery(studentsQuery(school)); const pl = useQuery(planQuery(school)); const pg = useQuery(progQuery(school)); const wk = useQuery(workQuery(school));
  const [f, setF] = useState({ stage: "", grade: "", domain: "", owner: "", care: "" });
  const qs = [nq, st, pl, pg, wk];
  if (qs.some((q) => q.isLoading)) return <LoadingState />;
  const err = qs.find((q) => q.error); if (err) return <ErrorState message={arabicError(err.error)} onRetry={() => qs.forEach((q) => void q.refetch())} />;
  const noms = nq.data ?? [], students = st.data ?? [], plans = pl.data ?? [], progs = pg.data ?? [], works = wk.data ?? [];
  if (!noms.length && !plans.length && !progs.length && !works.length) return <div className="rounded-2xl border bg-card p-6"><h3 className="mb-3 font-bold">ابدأ من هنا</h3><ol className="list-inside list-decimal space-y-1 text-sm text-muted-foreground"><li>يرشّح المعلم طالبًا من «الترشيحات» مع مؤشرات وتاريخ.</li><li>يراجع المنسق الترشيح ويطلب استكمالًا أو يقرّه للرعاية المدرسية مع السبب.</li><li>تُبنى للطلبة المقرّين خطط رعاية، ويُضافون إلى برامج، وتُوثّق أعمالهم وإنجازاتهم.</li></ol><Button className="mt-4" onClick={() => go({ tab: "nominations" })}>فتح الترشيحات</Button></div>;
  const s = boardStats(plans, progs, works, gtToday());
  const waiting = noms.filter((r) => ["sent", "review"].includes(r.status));
  const cards: { l: string; v: number; tab: GtSearch["tab"] }[] = [
    { l: "ترشيحات تنتظر المراجعة", v: waiting.length, tab: "nominations" },
    { l: "طلبة في خطط جارية", v: s.inPlan, tab: "plans" },
    { l: "متابعات مستحقة (14 يومًا بلا متابعة)", v: s.dueFollow, tab: "plans" },
    { l: "فرص قريبة (خلال 14 يومًا)", v: s.near, tab: "programs" },
    { l: "مشاركات موثقة", v: s.participations, tab: "works" },
    { l: "إنجازات موثقة", v: s.achievements, tab: "works" },
  ];
  const rows = students.map((r) => ({ ...r, owner: ownerOf(plans, r.id) })).filter((r) => (!f.stage || r.stage === f.stage) && (!f.grade || r.grade === f.grade) && (!f.domain || r.domains.includes(f.domain)) && (!f.owner || r.owner === f.owner) && (!f.care || r.care === f.care));
  const sel = (k: keyof typeof f, label: string, opts: [string, string][]) => <select aria-label={label} className={selectCls()} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}><option value="">{label}: الكل</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
  const pair = (a: string[]) => a.map((x) => [x, x] as [string, string]);
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{cards.map((c) => <button key={c.l} type="button" onClick={() => go({ tab: c.tab })} className="rounded-2xl border bg-card p-4 text-start transition hover:-translate-y-0.5 hover:shadow-md"><p className="text-sm text-muted-foreground">{c.l}</p><p className="mt-1 text-3xl font-bold">{c.v}</p></button>)}</div>
    {!!waiting.length && <div className="rounded-2xl border bg-card p-4"><h3 className="mb-2 font-semibold">تنتظر المراجعة</h3><ul className="divide-y">{waiting.slice(0, 6).map((r) => <li key={r.id}><button type="button" className="flex w-full justify-between py-2 text-start text-sm hover:text-primary" onClick={() => go({ tab: "nominations", id: r.id })}><span>{r.student} · {r.grade ?? ""}</span><span className="text-xs text-muted-foreground">{GT_STATUS[r.status]}</span></button></li>)}</ul></div>}
    <div className="space-y-2 rounded-2xl border bg-card p-4">
      <h3 className="font-semibold">طلبة الرعاية</h3>
      <div className="flex flex-wrap gap-2">{sel("stage", "المرحلة", pair(uniq(students.map((x) => x.stage))))}{sel("grade", "الصف", pair(uniq(students.map((x) => x.grade))))}{sel("domain", "المجال", Object.entries(GT_DOMAINS))}{sel("owner", "المسؤول", pair(uniq(plans.map((p) => p.owner_name))))}{sel("care", "حالة الرعاية", Object.entries(CARE_LABEL))}</div>
      {!rows.length ? <p className="text-sm text-muted-foreground">لا يوجد طلبة يطابقون الفلاتر.</p> :
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50"><tr>{["الطالب", "المرحلة", "الصف", "الشعبة", "المجال", "المسؤول", "حالة الرعاية", "آخر متابعة"].map((h) => <th key={h} className="p-2 text-start font-medium">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id} className={`cursor-pointer border-t hover:bg-muted/30 ${s.dueIds.includes(r.id) ? "bg-accent/10" : ""}`} onClick={() => go({ tab: "students", id: r.id })}><td className="p-2 font-semibold">{r.name}</td><td className="p-2">{r.stage ?? "—"}</td><td className="p-2">{r.grade ?? "—"}</td><td className="p-2">{r.section ?? "—"}</td><td className="p-2">{r.domains.map((d) => GT_DOMAINS[d]).join("، ") || "—"}</td><td className="p-2">{r.owner ?? "—"}</td><td className="p-2">{CARE_LABEL[r.care]}</td><td className="p-2">{r.last ?? (s.dueIds.includes(r.id) ? "مستحقة" : "—")}</td></tr>)}</tbody></table></div>}
      <p className="text-xs text-muted-foreground">كل طالب يُحسب مرة واحدة في كل مؤشر حتى لو تعددت مجالاته أو خططه. الإنجاز الجماعي يُحسب مرة واحدة.</p>
    </div>
  </div>;
}
