import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { db, useOptions, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState, Section } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { ask, askText } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { PERIOD_STATUS, PLAN_STATUS, contribution } from "./common";

const sel = selectCls("w-full");
type Item = { name: string; max_score: string; weight: string; source: string };

export function usePeriods(S: string) {
  return useQuery({ queryKey: ["gb-periods", S], queryFn: async () => {
    const { data, error } = await db.from("grade_periods").select("*").eq("school_id", S).order("entry_start", { ascending: false });
    if (error) throw error; return data as Row[];
  } });
}

/* ================= Assessment plans ================= */
export function PlansTab({ S, admin }: { S: string; admin: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["gb-plans", S], queryFn: async () => {
    const { data, error } = await db.from("grade_plans").select("*, grade_plan_items(*), academic_years(name), terms(name), grades(name), subjects(name)").eq("school_id", S).order("created_at", { ascending: false });
    if (error) throw error; return data as Row[];
  } });
  const [edit, setEdit] = useState<Row | "new" | null>(null);
  const [busy, setBusy] = useState("");
  const run = async (id: string, fn: () => Promise<{ error: unknown }>, ok: string) => {
    setBusy(id); const { error } = await fn(); setBusy("");
    if (error) return void toast.error(arabicError(error));
    toast.success(ok); qc.invalidateQueries({ queryKey: ["gb-plans", S] });
  };
  if (edit) return <PlanForm S={S} plan={edit === "new" ? null : edit} onDone={() => { setEdit(null); qc.invalidateQueries({ queryKey: ["gb-plans", S] }); }} />;
  return (
    <Section title="خطط التقييم" desc="الدرجة القصوى هي ما يُرصد للبند (مثلًا من 50)، والوزن هو نصيبه من مجموع الخطة (مثلًا 30). المساهمة = الدرجة ÷ القصوى × الوزن، ويُطبق الوزن مرة واحدة. الخطة المعتمدة لا تُعدَّل؛ يُنشأ لها إصدار جديد، والسجلات القائمة تبقى على إصدارها."
      action={admin ? <Button size="sm" onClick={() => setEdit("new")}><Plus className="size-4" />خطة جديدة</Button> : undefined}>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title="لا توجد خطط تقييم" hint={admin ? "أنشئ خطة واعتمدها قبل بدء الرصد." : "ينتظر إعداد الإدارة."} /> : (
        <div className="grid gap-3 md:grid-cols-2">
          {q.data.map((p) => {
            const items = [...(p["grade_plan_items"] ?? [])].sort((a: Row, b: Row) => a["sort_order"] - b["sort_order"]);
            const sw = items.reduce((s: number, i: Row) => s + Number(i["weight"]), 0);
            return (
              <div key={p["id"]} className="rounded-xl border bg-card p-4" data-testid="plan-card">
                <div className="flex items-start justify-between gap-2">
                  <div><div className="font-semibold">{p["name"]} <span className="text-xs text-muted-foreground">إصدار {p["version"]}</span></div>
                    <div className="text-xs text-muted-foreground">{p["academic_years"]?.["name"]}{p["terms"] ? ` • ${p["terms"]["name"]}` : ""} • {p["scope"] === "subject" ? `مادة: ${p["subjects"]?.["name"]}` : p["scope"] === "grade" ? `صف: ${p["grades"]?.["name"]}` : "كل المدرسة"} • يسري من {p["effective_from"]}</div></div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{PLAN_STATUS[p["status"]]}</span>
                </div>
                <table className="mt-3 w-full text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="text-start">البند</th><th className="text-start">القصوى</th><th className="text-start">الوزن</th><th className="text-start">الإدخال</th></tr></thead>
                  <tbody>{items.map((i: Row) => <tr key={i["id"]} className="border-t"><td className="py-1">{i["name"]}</td><td>{i["max_score"]}</td><td>{i["weight"]}</td><td>{i["source"] === "homework" ? "من الواجبات" : "يدوي"}</td></tr>)}</tbody></table>
                <div className={`mt-2 text-xs ${sw === Number(p["total"]) ? "text-muted-foreground" : "text-destructive"}`}>مجموع الأوزان {sw} من {p["total"]} • تقريب {p["decimals"]} منزلة • الغائب: {p["absent_policy"] === "zero" ? "يُحتسب صفرًا معلنًا" : "النتيجة غير مكتملة"} • الإعفاء: {p["exempt_policy"] === "redistribute" ? "إعادة توزيع الأوزان المعلنة" : "غير مسموح"}</div>
                {admin && <div className="mt-3 flex flex-wrap gap-2">
                  {p["status"] === "draft" && <><Button size="sm" variant="outline" onClick={() => setEdit(p)}>تعديل</Button>
                    <Button size="sm" disabled={busy === p["id"]} onClick={async () => { if (await ask("اعتماد الخطة؟ لن تُعدّل بعدها إلا بإصدار جديد.")) run(p["id"], () => db.rpc("gb_approve_plan", { _id: p["id"] }), "اعتُمدت الخطة"); }}>اعتماد</Button></>}
                  {p["status"] !== "draft" && <Button size="sm" variant="outline" disabled={busy === p["id"]} onClick={async () => {
                    const { data } = await db.rpc("gb_plan_impact", { _id: p["id"] });
                    if (await ask(`إنشاء إصدار جديد؟ السجلات الحالية (${data?.gradebooks ?? 0}، منها ${data?.with_entries ?? 0} بها درجات و${data?.locked ?? 0} مقفلة) تبقى على إصدارها، والإصدار الجديد يطبق على السجلات التي تُفتح لاحقًا.`)) run(p["id"], () => db.rpc("gb_new_plan_version", { _id: p["id"] }), "أُنشئ إصدار مسودة");
                  }}>إصدار جديد</Button>}
                  {p["status"] !== "retired" && <Button size="sm" variant="ghost" disabled={busy === p["id"]} onClick={async () => { if (await ask(p["status"] === "draft" ? "حذف المسودة؟" : "إيقاف الخطة؟ لن تُستخدم لسجلات جديدة.", { destructive: true })) run(p["id"], () => db.rpc("gb_retire_plan", { _id: p["id"] }), "تم"); }}>{p["status"] === "draft" ? "حذف" : "إيقاف"}</Button>}
                </div>}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function PlanForm({ S, plan, onDone }: { S: string; plan: Row | null; onDone: () => void }) {
  const years = useOptions("academic_years", "name", S);
  const terms = useOptions("terms", "name", S);
  const grades = useOptions("grades", "name", S);
  const subjects = useOptions("subjects", "name", S);
  const [f, setF] = useState<Record<string, string>>(() => ({
    name: plan?.["name"] ?? "", description: plan?.["description"] ?? "", year_id: plan?.["year_id"] ?? "", term_id: plan?.["term_id"] ?? "",
    scope: plan?.["scope"] ?? "school", grade_id: plan?.["grade_id"] ?? "", subject_id: plan?.["subject_id"] ?? "", total: String(plan?.["total"] ?? 100),
    decimals: String(plan?.["decimals"] ?? 2), rounding: plan?.["rounding"] ?? "half_up", absent_policy: plan?.["absent_policy"] ?? "zero",
    exempt_policy: plan?.["exempt_policy"] ?? "not_allowed", effective_from: plan?.["effective_from"] ?? "",
  }));
  const [items, setItems] = useState<Item[]>(() => plan ? [...plan["grade_plan_items"]].sort((a: Row, b: Row) => a["sort_order"] - b["sort_order"]).map((i: Row) => ({ name: i["name"], max_score: String(i["max_score"]), weight: String(i["weight"]), source: i["source"] }))
    : [{ name: "أعمال السنة", max_score: "50", weight: "30", source: "manual" }, { name: "الاختبار", max_score: "100", weight: "70", source: "manual" }]);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const sw = items.reduce((s, i) => s + (Number(i.weight) || 0), 0);
  const save = async () => {
    if (!f["year_id"]) return void toast.error("اختر السنة الدراسية");
    setBusy(true);
    const { error } = await db.rpc("gb_save_plan", { _id: plan?.["id"] ?? null, _d: { ...f, school_id: S, items } });
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    toast.success("حُفظت الخطة كمسودة"); onDone();
  };
  return (
    <Section title={plan ? "تعديل خطة تقييم" : "خطة تقييم جديدة"} action={<Button size="sm" variant="ghost" onClick={onDone}>رجوع</Button>}>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1 md:col-span-2"><Label htmlFor="pn">اسم الخطة</Label><Input id="pn" value={f["name"]} onChange={set("name")} /></div>
        <div className="space-y-1"><Label htmlFor="pe">تاريخ السريان</Label><Input id="pe" type="date" value={f["effective_from"]} onChange={set("effective_from")} /></div>
        <div className="space-y-1 md:col-span-3"><Label htmlFor="pd">الوصف</Label><Input id="pd" value={f["description"]} onChange={set("description")} /></div>
        <div className="space-y-1"><Label htmlFor="py">السنة</Label><select id="py" className={sel} value={f["year_id"]} onChange={set("year_id")}><option value="">—</option>{years.data?.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="pt">الفصل الدراسي</Label><select id="pt" className={sel} value={f["term_id"]} onChange={set("term_id")}><option value="">كل الفصول</option>{terms.data?.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="ps">نطاق التطبيق</Label><select id="ps" className={sel} value={f["scope"]} onChange={set("scope")}><option value="school">كل المدرسة</option><option value="grade">صف محدد</option><option value="subject">مادة محددة</option></select></div>
        {f["scope"] === "grade" && <div className="space-y-1"><Label htmlFor="pg">الصف</Label><select id="pg" className={sel} value={f["grade_id"]} onChange={set("grade_id")}><option value="">—</option>{grades.data?.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>}
        {f["scope"] === "subject" && <div className="space-y-1"><Label htmlFor="pj">المادة</Label><select id="pj" className={sel} value={f["subject_id"]} onChange={set("subject_id")}><option value="">—</option>{subjects.data?.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>}
        <div className="space-y-1"><Label htmlFor="ptot">مجموع الخطة</Label><Input id="ptot" type="number" value={f["total"]} onChange={set("total")} /></div>
        <div className="space-y-1"><Label htmlFor="pdec">المنازل العشرية</Label><Input id="pdec" type="number" min={0} max={4} value={f["decimals"]} onChange={set("decimals")} /></div>
        <div className="space-y-1"><Label htmlFor="pr">التقريب</Label><select id="pr" className={sel} value={f["rounding"]} onChange={set("rounding")}><option value="half_up">لأقرب قيمة</option><option value="down">للأسفل</option><option value="up">للأعلى</option></select></div>
        <div className="space-y-1"><Label htmlFor="pa">الغائب عن التقييم</Label><select id="pa" className={sel} value={f["absent_policy"]} onChange={set("absent_policy")}><option value="zero">يُحتسب صفرًا (معلن)</option><option value="incomplete">النتيجة غير مكتملة</option></select></div>
        <div className="space-y-1"><Label htmlFor="px">الإعفاء</Label><select id="px" className={sel} value={f["exempt_policy"]} onChange={set("exempt_policy")}><option value="not_allowed">غير مسموح</option><option value="redistribute">مسموح مع إعادة توزيع الأوزان</option></select></div>
      </div>
      <div className="mt-4 overflow-x-auto rounded-xl border">
        <table className="w-full text-sm"><thead className="bg-muted/50"><tr><th className="px-2 py-2 text-start">البند</th><th className="px-2 text-start">الدرجة القصوى</th><th className="px-2 text-start">الوزن</th><th className="px-2 text-start">الإدخال</th><th className="px-2 text-start">مثال: مساهمة الدرجة الكاملة</th><th /></tr></thead>
          <tbody>{items.map((it, i) => (
            <tr key={i} className="border-t">
              <td className="p-1"><Input aria-label={`اسم البند ${i + 1}`} value={it.name} onChange={(e) => setItems((s) => s.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></td>
              <td className="p-1"><Input aria-label={`القصوى ${i + 1}`} type="number" value={it.max_score} onChange={(e) => setItems((s) => s.map((x, j) => j === i ? { ...x, max_score: e.target.value } : x))} /></td>
              <td className="p-1"><Input aria-label={`الوزن ${i + 1}`} type="number" value={it.weight} onChange={(e) => setItems((s) => s.map((x, j) => j === i ? { ...x, weight: e.target.value } : x))} /></td>
              <td className="p-1"><select aria-label={`الإدخال ${i + 1}`} className={sel} value={it.source} onChange={(e) => setItems((s) => s.map((x, j) => j === i ? { ...x, source: e.target.value } : x))}><option value="manual">يدوي</option><option value="homework">مرتبط بالواجبات</option></select></td>
              <td className="px-2 text-muted-foreground">{Number(it.max_score) > 0 ? contribution(Number(it.max_score), Number(it.max_score), Number(it.weight) || 0) : "—"}</td>
              <td><Button size="icon" variant="ghost" aria-label="حذف البند" onClick={() => setItems((s) => s.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button></td>
            </tr>))}</tbody></table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" onClick={() => setItems((s) => [...s, { name: "", max_score: "10", weight: "10", source: "manual" }])}><Plus className="size-4" />بند</Button>
        <span className={`text-sm ${sw === Number(f["total"]) ? "text-muted-foreground" : "font-semibold text-destructive"}`}>مجموع الأوزان {sw} من {f["total"]}{sw !== Number(f["total"]) ? " — لن تُعتمد الخطة حتى يتساويا" : ""}</span>
      </div>
      <div className="mt-4 flex gap-2"><Button disabled={busy} onClick={save}>{busy ? "جارٍ الحفظ…" : "حفظ كمسودة"}</Button><Button variant="ghost" onClick={onDone}>إلغاء</Button></div>
    </Section>
  );
}

/* ================= Grading periods ================= */
export function PeriodsTab({ S, admin }: { S: string; admin: boolean }) {
  const qc = useQueryClient();
  const q = usePeriods(S);
  const years = useOptions("academic_years", "name", S);
  const terms = useOptions("terms", "name", S);
  const blank = { name: "", year_id: "", term_id: "", entry_start: "", entry_end: "", submit_by: "", review_by: "", approve_by: "", publish_by: "" };
  const [f, setF] = useState<Record<string, string> & { id?: string }>(blank);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const refresh = () => qc.invalidateQueries({ queryKey: ["gb-periods", S] });
  const save = async () => {
    setBusy(true);
    const { id, ...d } = f;
    const { error } = await db.rpc("gb_save_period", { _id: id ?? null, _d: { ...d, school_id: S } });
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    toast.success("حُفظت الفترة"); setF(blank); refresh();
  };
  const status = async (p: Row, st: string) => {
    let reason: string | null = "";
    if (p["status"] === "locked" && st !== "locked") { reason = await askText("سبب إعادة فتح الفترة المقفلة", { required: true }); if (reason === null) return; }
    else if (!(await ask(st === "locked" ? "قفل الفترة؟ يتوقف كل رصد فيها." : st === "closed" ? "إغلاق الفترة؟" : "فتح الفترة؟"))) return;
    const { error } = await db.rpc("gb_set_period_status", { _id: p["id"], _status: st, _reason: reason });
    if (error) return void toast.error(arabicError(error));
    toast.success("تم"); refresh();
  };
  const D = (k: string, l: string) => <div className="space-y-1"><Label htmlFor={`pr-${k}`}>{l}</Label><Input id={`pr-${k}`} type="date" value={f[k]} onChange={set(k)} /></div>;
  return (
    <Section title="فترات الرصد" desc="الرصد متاح للمعلم فقط والفترة مفتوحة وتاريخ اليوم (بتوقيت الرياض) بين بداية الرصد ونهايته، أو خلال إعادة فتح محددة لسجل بعينه.">
      {admin && <div className="mb-4 grid gap-3 rounded-xl border bg-card p-3 md:grid-cols-4">
        <div className="space-y-1"><Label htmlFor="pr-name">الاسم</Label><Input id="pr-name" value={f["name"]} onChange={set("name")} /></div>
        <div className="space-y-1"><Label htmlFor="pr-y">السنة</Label><select id="pr-y" className={sel} value={f["year_id"]} onChange={set("year_id")} disabled={!!f.id}><option value="">—</option>{years.data?.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="pr-t">الفصل</Label><select id="pr-t" className={sel} value={f["term_id"]} onChange={set("term_id")}><option value="">—</option>{terms.data?.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></div>
        {D("entry_start", "بداية الرصد")}{D("entry_end", "نهاية الرصد")}{D("submit_by", "موعد الإرسال")}{D("review_by", "موعد المراجعة")}{D("approve_by", "موعد الاعتماد")}{D("publish_by", "موعد النشر")}
        <div className="flex items-end gap-2"><Button disabled={busy} onClick={save}>{busy ? "…" : f.id ? "حفظ التعديل" : "إضافة فترة"}</Button>{f.id && <Button variant="ghost" onClick={() => setF(blank)}>إلغاء</Button>}</div>
      </div>}
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : !q.data?.length ? <EmptyState title="لا توجد فترات رصد" /> : (
        <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm"><thead className="bg-muted/50"><tr>{["الفترة", "الرصد", "الإرسال", "المراجعة", "الاعتماد", "النشر", "الحالة", ""].map((h) => <th key={h} className="px-3 py-2 text-start">{h}</th>)}</tr></thead>
          <tbody>{q.data.map((p) => <tr key={p["id"]} className="border-t">
            <td className="px-3 py-2 font-medium">{p["name"]}</td><td className="px-3">{p["entry_start"]} ← {p["entry_end"]}</td><td className="px-3">{p["submit_by"] ?? "—"}</td><td className="px-3">{p["review_by"] ?? "—"}</td><td className="px-3">{p["approve_by"] ?? "—"}</td><td className="px-3">{p["publish_by"] ?? "—"}</td>
            <td className="px-3">{PERIOD_STATUS[p["status"]]}{p["status_reason"] ? <div className="text-xs text-muted-foreground">{p["status_reason"]}</div> : null}</td>
            <td className="px-3">{admin && <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="ghost" onClick={() => setF({ id: p["id"], name: p["name"], year_id: p["year_id"], term_id: p["term_id"] ?? "", entry_start: p["entry_start"], entry_end: p["entry_end"], submit_by: p["submit_by"] ?? "", review_by: p["review_by"] ?? "", approve_by: p["approve_by"] ?? "", publish_by: p["publish_by"] ?? "" })}>تعديل</Button>
              {(["open", "closed", "locked"] as const).filter((s) => s !== p["status"]).map((s) => <Button key={s} size="sm" variant="outline" onClick={() => status(p, s)}>{s === "open" ? "فتح" : s === "closed" ? "إغلاق" : "قفل"}</Button>)}
            </div>}</td></tr>)}</tbody></table></div>
      )}
    </Section>
  );
}
