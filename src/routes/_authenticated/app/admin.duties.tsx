import { PeoplePicker } from "@/components/people-picker";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { ExportButtons } from "@/components/list-tools";
import { ask, askText } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { arabicError, useSession, type AppContext } from "@/lib/session";
import { useSchoolPerms } from "@/lib/school-perms";
import {
  ADM_PAGE, AdminFiles, DAY_NAMES, DUTY_KIND, DUTY_STATUS, EXEC_STATUS, PagerBar, Pill, STAFF_ROLES, Timeline,
  addDays, dayName, fetchAllRows, fmt, hm, isLead, riyadhToday, useStaff, weekStartOf,
} from "@/components/admin/shared";

export const Route = createFileRoute("/_authenticated/app/admin/duties")({
  head: () => ({ meta: [{ title: "المناوبات والإشراف اليومي | ركاز" }, { name: "description", content: "جداول المناوبة الأسبوعية والتغطية ومناوباتي" }] }),
  component: () => <RequireSchool nav="duties">{(ctx) => <Duties ctx={ctx} />}</RequireSchool>,
});

type Ctx = AppContext & { schoolId: string };

function Duties({ ctx }: { ctx: Ctx }) {
  const p = useSchoolPerms(ctx.schoolId);
  const lead = p ? !!(p["duty_rosters.view"] || p["duty_rosters.edit"]) : isLead(ctx.role);
  const manage = !!p?.["duty_rosters.edit"];
  const setupView = !!(p?.["duty_setup.view"] || p?.["duty_setup.edit"]);
  const setupEdit = !!p?.["duty_setup.edit"];
  const tabs = [["mine", "مناوباتي"], ...(lead ? [["week", "جدول الأسبوع"], ["list", "القائمة والتقارير"], ["changes", "طلبات الاعتذار والتغيير"]] : []), ...(setupView ? [["setup", "الإعداد والسياسة"]] : [])] as const;
  const [picked, setTab] = useState<string | null>(null);
  const tab = picked && tabs.some(([k]) => k === picked) ? picked : lead ? "week" : "mine";
  return (
    <div>
      <Link to="/app/admin" className="text-sm text-primary">← الإدارة المدرسية</Link>
      <PageHeader eyebrow={ctx.schoolName} title="المناوبات والإشراف اليومي" desc={lead ? "اقتراح التوزيع والتعديل والنشر والتغطية والبدلاء." : "مناوباتك المنشورة، والإقرار وتوثيق التنفيذ."} />
      <div role="tablist" className="mb-4 flex flex-wrap gap-2 border-b pb-2">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-10 rounded-lg px-4 text-sm font-semibold ${tab === k ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{l}</button>
        ))}
      </div>
      {tab === "mine" && <MyDuties ctx={ctx} />}
      {(tab === "week" || tab === "changes" || tab === "setup") && ((tab === "setup" && !setupEdit) || (tab !== "setup" && !manage)) && <p className="mb-3 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">صلاحيتك هنا للعرض فقط.</p>}
      {tab === "week" && lead && <Week ctx={ctx} manage={manage} />}
      {tab === "list" && lead && <DutyList ctx={ctx} />}
      {tab === "changes" && lead && <Changes ctx={ctx} manage={manage} />}
      {tab === "setup" && setupView && <fieldset disabled={!setupEdit} className="min-w-0"><Setup ctx={ctx} /></fieldset>}
    </div>
  );
}

function useRun() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function run(fn: string, args: Record<string, unknown>, ok: string) {
    setBusy(true);
    const { data, error } = await db.rpc(fn as never, args as never);
    setBusy(false);
    if (error) { toast.error(arabicError(error)); qc.invalidateQueries({ queryKey: ["duty"] }); return null; }
    toast.success(ok);
    qc.invalidateQueries({ queryKey: ["duty"] });
    qc.invalidateQueries({ queryKey: ["adm-events"] });
    return (data ?? true) as unknown;
  }
  return { run, busy };
}

// ---------------- my duties ----------------
function MyDuties({ ctx }: { ctx: Ctx }) {
  const { user } = useSession();
  const today = riyadhToday();
  const [range, setRange] = useState("week");
  const from = range === "past" ? addDays(today, -30) : range === "week" ? weekStartOf(today) : today;
  const to = range === "past" ? today : range === "week" ? addDays(weekStartOf(today), 6) : addDays(today, 60);
  const q = useQuery({
    queryKey: ["duty", "mine", ctx.schoolId, range],
    queryFn: async () => {
      const { data, error } = await db.rpc("adm_duty_list" as never, { _school: ctx.schoolId, _scope: "mine", _q: null, _from: from, _to: to, _status: null, _post: null, _limit: 100, _offset: 0 } as never);
      if (error) throw error;
      return data as Row[];
    },
  });
  const { run, busy } = useRun();
  const [files, setFiles] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="الفترة" className={selectCls("", true)} value={range} onChange={(e) => setRange(e.target.value)}>
          <option value="week">هذا الأسبوع</option><option value="upcoming">القادمة (60 يومًا)</option><option value="past">السابقة (30 يومًا)</option>
        </select>
        <span className="text-xs text-muted-foreground">تظهر هنا المناوبات المنشورة فقط. الاعتذار لا يلغي المناوبة؛ يراجعه الوكيل.</span>
      </div>
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title="لا توجد مناوبات" hint="ستظهر مناوباتك هنا بعد نشر الجدول." /> : (
        <ul className="space-y-2">
          {q.data.map((d) => {
            const live = d.status === "assigned";
            return (
              <li key={d.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{d.post}</span>
                  <span className="text-sm text-muted-foreground">{dayName(d.date)} {d.date} · {hm(d.start_time)}–{hm(d.end_time)}</span>
                  <Pill tone={live ? "ok" : "muted"}>{DUTY_STATUS[d.status]}</Pill>
                  {d.substitute && <Pill tone="warn">بديل</Pill>}
                  {live && <Pill tone={d.exec_status === "done" ? "ok" : d.exec_status === "not_done" ? "bad" : "muted"}>{EXEC_STATUS[d.exec_status]}</Pill>}
                  {live && <Pill tone={d.ack_at ? "ok" : "warn"}>{d.ack_at ? "اطّلعت" : "لم تطّلع بعد"}</Pill>}
                  {d.open_change && <Pill tone="warn">{d.open_change === "excuse" ? "اعتذار قيد المراجعة" : "طلب تغيير قيد المراجعة"}</Pill>}
                </div>
                {d.cancel_reason && <p className="mt-1 text-sm text-muted-foreground">السبب: {d.cancel_reason}</p>}
                {d.exec_note && <p className="mt-1 text-sm text-muted-foreground">ملاحظة التنفيذ: {d.exec_note}</p>}
                {live && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!d.ack_at && <Button size="sm" disabled={busy} onClick={() => run("adm_duty_ack", { _id: d.id }, "سُجّل اطلاعك")}>إقرار الاستلام</Button>}
                    {d.date <= today && d.exec_status === "pending" && <Button size="sm" variant="outline" disabled={busy} onClick={async () => { const n = await askText("ملاحظة التنفيذ (اختيارية)"); if (n !== null) run("adm_duty_exec", { _id: d.id, _status: "done", _note: n, _rev: d.rev }, "وُثّق التنفيذ"); }}>نُفذت</Button>}
                    {d.date <= today && d.exec_status === "pending" && <Button size="sm" variant="outline" disabled={busy} onClick={async () => { const n = await askText("سبب تعذر التنفيذ", { required: true }); if (n) run("adm_duty_exec", { _id: d.id, _status: "not_done", _note: n, _rev: d.rev }, "وُثّق التعذر"); }}>تعذر التنفيذ</Button>}
                    {!d.open_change && d.date >= today && <Button size="sm" variant="outline" disabled={busy} onClick={async () => { const n = await askText("سبب الاعتذار", { required: true }); if (n) run("adm_duty_request_change", { _id: d.id, _kind: "excuse", _reason: n }, "أُرسل الاعتذار للوكيل"); }}>اعتذار</Button>}
                    {!d.open_change && d.date >= today && <Button size="sm" variant="outline" disabled={busy} onClick={async () => { const n = await askText("ما التغيير المطلوب؟", { required: true }); if (n) run("adm_duty_request_change", { _id: d.id, _kind: "change", _reason: n }, "أُرسل طلب التغيير"); }}>طلب تغيير</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setFiles(files === d.id ? null : d.id)}>{files === d.id ? "إخفاء المرفقات" : "المرفقات"}</Button>
                  </div>
                )}
                {files === d.id && <div className="mt-3"><AdminFiles entity="duty" id={d.id} userId={user.id} canAdd={live && d.exec_status === "pending"} title="مرفقات المناوبة" /></div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------------- week roster (lead) ----------------
function Week({ ctx, manage }: { ctx: Ctx; manage: boolean }) {
  const qc = useQueryClient();
  const [week, setWeek] = useState(() => weekStartOf(riyadhToday()));
  const [day, setDay] = useState("");
  const { run, busy } = useRun();
  const roster = useQuery({
    queryKey: ["duty", "roster", ctx.schoolId, week],
    queryFn: async () => {
      const { data, error } = await db.from("adm_duty_rosters" as never).select("*").eq("school_id", ctx.schoolId).eq("week_start", week).maybeSingle();
      if (error) throw error;
      return data as Row | null;
    },
  });
  const R = roster.data;
  const cov = useQuery({
    enabled: !!R,
    queryKey: ["duty", "coverage", R?.id, R?.rev],
    queryFn: async () => ((await db.rpc("adm_duty_coverage" as never, { _roster: R!.id } as never)).data ?? []) as Row[],
  });
  const asg = useQuery({
    enabled: !!R,
    queryKey: ["duty", "asg", R?.id, R?.rev],
    queryFn: async () => fetchAllRows((o) => db.rpc("adm_duty_list" as never, { _school: ctx.schoolId, _scope: "all", _q: null, _from: week, _to: addDays(week, 6), _status: null, _post: null, _limit: 100, _offset: o } as never)),
  });
  const [preview, setPreview] = useState<Row | null>(null);
  const [adding, setAdding] = useState<{ post_id: string; date: string } | null>(null);
  const [subFor, setSubFor] = useState<Row | null>(null);
  const [pick, setPick] = useState("");
  const refresh = () => { qc.invalidateQueries({ queryKey: ["duty"] }); setPreview(null); };

  async function open() { const r = await run("adm_duty_roster_open", { _school: ctx.schoolId, _week: week }, "أُنشئ جدول الأسبوع كمسودة"); if (r) refresh(); }
  async function suggest() {
    if (asg.data?.some((a) => a.status === "assigned") && !(await ask("سيُستبدل كل ما اقترحه النظام سابقًا في هذه المسودة، ويبقى ما أسندته يدويًا. متابعة؟"))) return;
    const r = await run("adm_duty_suggest", { _roster: R!.id, _rev: R!.rev }, "اكتمل الاقتراح");
    if (r) refresh();
  }
  async function showPreview() {
    const { data, error } = await db.rpc("adm_duty_preview" as never, { _roster: R!.id } as never);
    if (error) return void toast.error(arabicError(error));
    setPreview(data as Row);
  }
  async function publish() { const r = await run("adm_duty_publish", { _roster: R!.id, _rev: R!.rev }, "نُشر الجدول وأُشعر الموظفون المعنيون"); if (r) refresh(); }
  async function add() {
    if (!adding || !pick) return;
    const r = await run("adm_duty_assign", { _roster: R!.id, _post: adding.post_id, _date: adding.date, _user: pick, _client: crypto.randomUUID() }, "أُسندت المناوبة");
    if (r) { setAdding(null); setPick(""); }
  }
  async function remove(a: Row) {
    if (R!.status === "draft") { if (await ask(`حذف ${a.user_name} من هذه المناوبة؟`)) run("adm_duty_remove", { _id: a.id, _reason: null }, "حُذفت من المسودة"); return; }
    const r = await askText("سبب إلغاء المناوبة (يُبلغ الموظف)", { required: true });
    if (r) run("adm_duty_remove", { _id: a.id, _reason: r }, "أُلغيت المناوبة وأُبلغ الموظف");
  }
  async function substitute() {
    if (!subFor || !pick) return;
    const r = await askText("سبب تعيين البديل", { required: true });
    if (!r) return;
    const ok = await run("adm_duty_substitute", { _id: subFor.id, _user: pick, _reason: r, _client: crypto.randomUUID() }, "عُيّن البديل لهذا اليوم فقط");
    if (ok) { setSubFor(null); setPick(""); }
  }

  const rows = (cov.data ?? []).filter((c) => !day || c.date === day);
  const byKey = (c: Row) => (asg.data ?? []).filter((a) => a.date === c.date && a.post === c.post && a.status === "assigned");
  const conflicts = (asg.data ?? []).filter((a) => a.conflict);
  const gapsTotal = (cov.data ?? []).reduce((s, c) => s + Math.max(c.required - c.assigned, 0), 0);
  const report = R?.report as Row | undefined;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setWeek(addDays(week, -7))}>الأسبوع السابق</Button>
        <div><Label htmlFor="wk">بداية الأسبوع (الأحد)</Label><Input id="wk" type="date" value={week} onChange={(e) => e.target.value && setWeek(weekStartOf(e.target.value))} className="h-9 w-44" /></div>
        <Button size="sm" variant="outline" onClick={() => setWeek(addDays(week, 7))}>الأسبوع التالي</Button>
        <select aria-label="عرض يوم" className={selectCls("", true)} value={day} onChange={(e) => setDay(e.target.value)}>
          <option value="">عرض أسبوعي</option>
          {Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((d) => <option key={d} value={d}>{DAY_NAMES[i(d)]} {d}</option>)}
        </select>
      </div>
      <fieldset disabled={!manage} className="min-w-0 space-y-4">
      {roster.isLoading ? <LoadingState /> : roster.error ? <ErrorState message={arabicError(roster.error)} /> : !R ? (
        <EmptyState title="لا يوجد جدول مناوبات لهذا الأسبوع" {...(manage ? { hint: "أنشئ مسودة ثم اقترح التوزيع أو أسند يدويًا.", action: <Button onClick={open} disabled={busy}>إنشاء جدول الأسبوع</Button> } : {})} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-4">
            <Pill tone={R.status === "published" ? "ok" : "warn"}>{R.status === "published" ? `منشور — إصدار ${R.version}` : "مسودة (لا يراها الموظفون)"}</Pill>
            {R.effective_from && <span className="text-xs text-muted-foreground">سريان من {R.effective_from} · نُشر {fmt(R.published_at)}</span>}
            <span className="text-sm">النقص في التغطية: <b>{gapsTotal}</b></span>
            {conflicts.length > 0 && <Pill tone="bad">{conflicts.length} تعارض</Pill>}
            <div className="ms-auto flex flex-wrap gap-2">
              {R.status === "draft" && <Button size="sm" variant="outline" disabled={busy} onClick={suggest}>اقتراح توزيع</Button>}
              {R.status === "draft" && <Button size="sm" disabled={busy} onClick={showPreview}>معاينة قبل النشر</Button>}
              <ExportButtons title={`جدول المناوبات — أسبوع ${week}`} school={ctx.schoolName} headers={["اليوم", "التاريخ", "الموقع", "الوقت", "المطلوب", "المسند", "الأسماء", "النقص"]}
                filters={[R.status === "published" ? `منشور — إصدار ${R.version}` : "مسودة", day ? `يوم ${day}` : "الأسبوع كاملًا"]}
                rows={() => rows.map((c) => [dayName(c.date), c.date, c.post, `${hm(c.start_time)}–${hm(c.end_time)}`, c.required, c.assigned, c.names ?? "", Math.max(c.required - c.assigned, 0)])} />
            </div>
          </div>
          {preview && (
            <div className="space-y-2 rounded-xl border-2 border-primary bg-card p-4">
              <p className="font-semibold">معاينة النشر</p>
              <p className="text-sm">سيُشعر {preview.recipients.length} موظفًا فقط (المسندة إليهم مناوبات):</p>
              <ul className="flex flex-wrap gap-2 text-xs">{preview.recipients.map((r: Row) => <li key={r.user_id} className="rounded-md border px-2 py-1">{r.name} — {r.count}</li>)}</ul>
              <p className="text-sm">النقص في التغطية: {preview.gaps}</p>
              {preview.conflicts.length > 0 ? (
                <div className="rounded-lg bg-destructive/10 p-2 text-sm text-destructive">
                  <p className="font-medium">تعارضات تمنع النشر:</p>
                  <ul>{preview.conflicts.map((c: Row) => <li key={c.id}>{c.name} — {c.post} {c.date}: {c.reason}</li>)}</ul>
                </div>
              ) : <p className="text-sm text-primary">لا توجد تعارضات.</p>}
              <div className="flex gap-2"><Button disabled={busy || preview.conflicts.length > 0} onClick={publish}>نشر الجدول</Button><Button variant="outline" onClick={() => setPreview(null)}>إغلاق</Button></div>
            </div>
          )}
          {report?.method && (
            <details className="rounded-xl border bg-card p-4 text-sm">
              <summary className="cursor-pointer font-semibold">طريقة الاقتراح وما لم يُغطَّ ({report.gaps?.length ?? 0})</summary>
              <p className="mt-2 text-muted-foreground">{report.method}</p>
              {report.gaps?.length > 0 && (
                <ul className="mt-2 space-y-1">{report.gaps.map((g: Row, k: number) => (
                  <li key={k} className="rounded-md bg-accent p-2">{dayName(g.date)} {g.date} — {g.post} {hm(g.start)}: ينقص {g.missing} من المؤهلين ({g.eligible}). الأسباب: {Object.entries(g.reasons ?? {}).map(([r, n]) => `${r} (${n})`).join("، ") || "—"}</li>
                ))}</ul>
              )}
            </details>
          )}
          {conflicts.length > 0 && (
            <div className="rounded-xl border border-destructive bg-destructive/5 p-4 text-sm">
              <p className="font-semibold text-destructive">تعارضات حالية (لم يُغيَّر أي شيء تلقائيًا)</p>
              <ul className="mt-1">{conflicts.map((a) => <li key={a.id}>{a.user_name} — {a.post} {a.date}: {a.conflict}</li>)}</ul>
            </div>
          )}
          {cov.isLoading || asg.isLoading ? <LoadingState /> : !rows.length ? <EmptyState title="لا توجد مواقع مناوبة فعالة في أيام الدراسة" hint="يضيف مدير المدرسة المواقع من تبويب الإعداد." /> : (
            <div className="space-y-2">
              {rows.map((c) => {
                const people = byKey(c);
                const short = c.required - c.assigned;
                return (
                  <div key={c.date + c.post_id} className="rounded-xl border bg-card p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{dayName(c.date)} {c.date}</span>
                      <span>{c.post}</span><span className="text-xs text-muted-foreground">{DUTY_KIND[c.kind]} · {hm(c.start_time)}–{hm(c.end_time)}</span>
                      <Pill tone={short > 0 ? "bad" : "ok"}>{c.assigned}/{c.required}</Pill>
                      {short > 0 && <Button size="sm" variant="outline" className="ms-auto" onClick={() => { setAdding({ post_id: c.post_id, date: c.date }); setPick(""); }}>إسناد</Button>}
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {people.map((a) => (
                        <li key={a.id} className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${a.conflict ? "border-destructive" : ""}`}>
                          <span>{a.user_name}</span>
                          {a.substitute && <Pill tone="warn">بديل</Pill>}
                          {R.status === "published" && <span className="text-muted-foreground">· {a.ack_at ? "اطّلع" : "لم يطّلع"} · {EXEC_STATUS[a.exec_status]}</span>}
                          {a.open_change && <Pill tone="warn">{a.open_change === "excuse" ? "اعتذار" : "طلب تغيير"}</Pill>}
                          {R.status === "published" && c.date >= riyadhToday() && <button className="text-primary underline" onClick={() => { setSubFor(a); setPick(""); }}>بديل</button>}
                          <button className="text-destructive underline" onClick={() => remove(a)}>{R.status === "draft" ? "حذف" : "إلغاء"}</button>
                        </li>
                      ))}
                    </ul>
                    {adding && adding.post_id === c.post_id && adding.date === c.date && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <div className="w-full"><PeoplePicker purpose="duty" school={ctx.schoolId} post={c.post_id} label="الموظف" single compact exclude={people.map((p) => p.user_id)} value={pick ? [pick] : []} onChange={(v) => setPick(v[0] ?? "")} /></div>
                        <Button size="sm" disabled={busy || !pick} onClick={add}>إسناد</Button><Button size="sm" variant="ghost" onClick={() => setAdding(null)}>إلغاء</Button>
                        <span className="text-xs text-muted-foreground">يرفض النظام أي شخص لديه حصة أو غياب أو عدم توافر أو مناوبة متداخلة.</span>
                      </div>
                    )}
                    {subFor && people.some((p) => p.id === subFor.id) && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-accent p-2">
                        <span className="text-sm">بديل عن {subFor.user_name} ليوم {c.date} فقط:</span>
                        <div className="w-full"><PeoplePicker purpose="duty" school={ctx.schoolId} post={c.post_id} label="البديل" single compact exclude={[subFor.user_id]} value={pick ? [pick] : []} onChange={(v) => setPick(v[0] ?? "")} /></div>
                        <Button size="sm" disabled={busy || !pick} onClick={substitute}>تعيين البديل</Button><Button size="sm" variant="ghost" onClick={() => setSubFor(null)}>إلغاء</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <section><h2 className="mb-2 font-semibold">سجل الجدول</h2><Timeline entity="duty" id={R.id} /></section>
        </>
      )}
      </fieldset>
    </div>
  );
}
const i = (d: string) => new Date(d + "T00:00:00Z").getUTCDay();

// ---------------- list + reports (lead) ----------------
function DutyList({ ctx }: { ctx: Ctx }) {
  const today = riyadhToday();
  const [from, setFrom] = useState(weekStartOf(today));
  const [to, setTo] = useState(addDays(weekStartOf(today), 6));
  const [status, setStatus] = useState("");
  const [post, setPost] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const posts = useQuery({ queryKey: ["duty", "posts", ctx.schoolId], queryFn: async () => ((await db.from("adm_duty_posts" as never).select("id, name").eq("school_id", ctx.schoolId).order("name")).data ?? []) as Row[] });
  const args = (limit: number, offset: number) => ({ _school: ctx.schoolId, _scope: "all", _q: q.trim() || null, _from: from || null, _to: to || null, _status: status || null, _post: post || null, _limit: limit, _offset: offset });
  const list = useQuery({
    queryKey: ["duty", "list", ctx.schoolId, from, to, status, post, q, page],
    queryFn: async () => { const { data, error } = await db.rpc("adm_duty_list" as never, args(ADM_PAGE, page * ADM_PAGE) as never); if (error) throw error; return data as Row[]; },
  });
  const load = useQuery({
    enabled: !!from && !!to,
    queryKey: ["duty", "load", ctx.schoolId, from, to],
    queryFn: async () => ((await db.rpc("adm_duty_load" as never, { _school: ctx.schoolId, _from: from, _to: to } as never)).data ?? []) as Row[],
  });
  const total = Number(list.data?.[0]?.total ?? 0);
  const sel = selectCls("", true);
  const filt = [`من ${from || "—"} إلى ${to || "—"}`, status ? `الحالة: ${DUTY_STATUS[status] ?? EXEC_STATUS[status] ?? "لم يطّلع"}` : "كل الحالات", ...(post ? [`الموقع: ${posts.data?.find((p) => p.id === post)?.name}`] : []), ...(q.trim() ? [`بحث: ${q.trim()}`] : [])];
  const reset = () => { setPage(0); };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <Input aria-label="بحث" placeholder="بحث بالاسم أو الموقع" value={q} onChange={(e) => { setQ(e.target.value); reset(); }} className="h-9 w-48" />
        <div><Label htmlFor="df">من</Label><Input id="df" type="date" value={from} onChange={(e) => { setFrom(e.target.value); reset(); }} className="h-9" /></div>
        <div><Label htmlFor="dt">إلى</Label><Input id="dt" type="date" value={to} onChange={(e) => { setTo(e.target.value); reset(); }} className="h-9" /></div>
        <select aria-label="الحالة" className={sel} value={status} onChange={(e) => { setStatus(e.target.value); reset(); }}>
          <option value="">كل الحالات</option>{Object.entries(DUTY_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          {Object.entries(EXEC_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}<option value="unacknowledged">لم يطّلع</option>
        </select>
        <select aria-label="الموقع" className={sel} value={post} onChange={(e) => { setPost(e.target.value); reset(); }}>
          <option value="">كل المواقع</option>{posts.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <Button size="sm" variant="ghost" onClick={() => { setQ(""); setStatus(""); setPost(""); setFrom(weekStartOf(today)); setTo(addDays(weekStartOf(today), 6)); reset(); }}>مسح الفلاتر</Button>
        <div className="ms-auto"><ExportButtons title="المناوبات" school={ctx.schoolName} headers={["التاريخ", "اليوم", "الموقع", "الوقت", "الموظف", "الحالة", "الاطلاع", "التنفيذ", "ملاحظة/سبب", "الجدول"]} filters={filt}
          rows={async () => (await fetchAllRows((o) => db.rpc("adm_duty_list" as never, args(100, o) as never))).map((d) => [d.date, dayName(d.date), d.post, `${hm(d.start_time)}–${hm(d.end_time)}`, d.user_name + (d.substitute ? " (بديل)" : ""), DUTY_STATUS[d.status], d.ack_at ? "نعم" : "لا", EXEC_STATUS[d.exec_status], d.exec_note ?? d.cancel_reason ?? "", d.roster_status === "published" ? "منشور" : "مسودة"])} /></div>
      </div>
      <p className="text-xs text-muted-foreground">{total} نتيجة</p>
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} /> : !list.data?.length ? <EmptyState title="لا توجد مناوبات مطابقة" /> : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/50 text-right"><tr>{["التاريخ", "الموقع", "الوقت", "الموظف", "الحالة", "الاطلاع", "التنفيذ"].map((h) => <th key={h} className="p-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>{list.data.map((d) => (
              <tr key={d.id} className="border-t"><td className="p-2">{dayName(d.date)} {d.date}</td><td className="p-2">{d.post}</td><td className="p-2">{hm(d.start_time)}–{hm(d.end_time)}</td>
                <td className="p-2">{d.user_name}{d.substitute ? " (بديل)" : ""}{d.conflict ? <span className="block text-xs text-destructive">{d.conflict}</span> : null}</td>
                <td className="p-2">{DUTY_STATUS[d.status]}{d.roster_status === "draft" ? " · مسودة" : ""}</td><td className="p-2">{d.ack_at ? "نعم" : "لا"}</td><td className="p-2">{EXEC_STATUS[d.exec_status]}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <PagerBar page={page} total={total} setPage={setPage} />
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">عبء المناوبات لكل موظف</h2>
          <div className="ms-auto"><ExportButtons title="عبء المناوبات" school={ctx.schoolName} headers={["الموظف", "عدد المناوبات", "الدقائق", "نُفذت", "تعذرت", "لم توثق", "طلبات اعتذار/تغيير"]} filters={[`من ${from} إلى ${to}`, "الجداول المنشورة فقط"]}
            rows={() => (load.data ?? []).map((l) => [l.user_name, l.duties, l.minutes, l.done, l.not_done, l.pending, l.changes])} /></div>
        </div>
        <p className="text-xs text-muted-foreground">العبء = عدد المناوبات المسندة القائمة ومجموع دقائقها في الجداول المنشورة للفترة. التغطية = المسند ÷ المطلوب لكل موقع في أيام الدراسة. لا تُحسب أي مخالفة أو خصم من هذه الأرقام.</p>
        {!load.data?.length ? <p className="text-sm text-muted-foreground">لا توجد مناوبات منشورة في الفترة.</p> : (
          <div className="overflow-x-auto rounded-xl border bg-card"><table className="w-full text-sm">
            <thead className="bg-muted/50 text-right"><tr>{["الموظف", "المناوبات", "الدقائق", "نُفذت", "تعذرت", "لم توثق"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
            <tbody>{load.data.map((l) => <tr key={l.user_id} className="border-t"><td className="p-2">{l.user_name}</td><td className="p-2">{l.duties}</td><td className="p-2">{l.minutes}</td><td className="p-2">{l.done}</td><td className="p-2">{l.not_done}</td><td className="p-2">{l.pending}</td></tr>)}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}

// ---------------- excuse/change requests (lead) ----------------
function Changes({ ctx, manage }: { ctx: Ctx; manage: boolean }) {
  const [status, setStatus] = useState("open");
  const q = useQuery({ queryKey: ["duty", "changes", ctx.schoolId, status], queryFn: async () => ((await db.rpc("adm_duty_change_list" as never, { _school: ctx.schoolId, _status: status || null } as never)).data ?? []) as Row[] });
  const { run, busy } = useRun();
  return (
    <div className="space-y-3">
      <select aria-label="الحالة" className={selectCls("", true)} value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="open">قيد المراجعة</option><option value="accepted">مقبولة</option><option value="declined">مرفوضة</option><option value="">الكل</option>
      </select>
      <p className="text-xs text-muted-foreground">القبول لا يلغي المناوبة؛ عيّن بديلًا من «جدول الأسبوع» عند الحاجة (تعيين البديل يقبل الطلب تلقائيًا).</p>
      {!q.data?.length ? <EmptyState title="لا توجد طلبات" /> : (
        <ul className="space-y-2">{q.data.map((c) => (
          <li key={c.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{c.user_name}</span><span className="text-sm">{c.post} — {dayName(c.date)} {c.date}</span>
              <Pill tone="warn">{c.kind === "excuse" ? "اعتذار" : "طلب تغيير"}</Pill><Pill tone={c.status === "accepted" ? "ok" : c.status === "declined" ? "bad" : "muted"}>{c.status === "open" ? "قيد المراجعة" : c.status === "accepted" ? "مقبول" : "مرفوض"}</Pill></div>
            <p className="mt-1 text-sm">{c.reason}</p>
            {c.decision_note && <p className="text-xs text-muted-foreground">القرار: {c.decision_note}</p>}
            {c.status === "open" && manage && <div className="mt-2 flex gap-2">
              <Button size="sm" disabled={busy} onClick={async () => { const n = await askText("ملاحظة (اختيارية)"); if (n !== null) run("adm_duty_decide_change", { _id: c.id, _accept: true, _note: n }, "قُبل الطلب"); }}>قبول</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={async () => { const n = await askText("سبب الرفض", { required: true }); if (n) run("adm_duty_decide_change", { _id: c.id, _accept: false, _note: n }, "رُفض الطلب"); }}>رفض</Button>
            </div>}
          </li>
        ))}</ul>
      )}
    </div>
  );
}

// ---------------- setup (principal) ----------------
function Setup({ ctx }: { ctx: Ctx }) {
  const qc = useQueryClient();
  const staff = useStaff(ctx.schoolId);
  const { run, busy } = useRun();
  const settings = useQuery({ queryKey: ["duty", "settings", ctx.schoolId], queryFn: async () => ((await db.from("adm_duty_settings" as never).select("*").eq("school_id", ctx.schoolId).maybeSingle()).data ?? { max_per_week: 3, load_weeks: 4 }) as Row });
  const posts = useQuery({ queryKey: ["duty", "posts-all", ctx.schoolId], queryFn: async () => ((await db.from("adm_duty_posts" as never).select("*").eq("school_id", ctx.schoolId).order("start_time")).data ?? []) as Row[] });
  const ex = useQuery({ queryKey: ["duty", "exempt", ctx.schoolId], queryFn: async () => ((await db.from("adm_duty_exempt" as never).select("*").eq("school_id", ctx.schoolId)).data ?? []) as Row[] });
  const [cap, setCap] = useState<number | "">("");
  const [lw, setLw] = useState<number | "">("");
  const blank = { name: "", kind: "break", days: [0, 1, 2, 3, 4], start_time: "", end_time: "", required: 1, eligible_roles: ["teacher"], active: true };
  const [edit, setEdit] = useState<Row | null>(null);
  const [exU, setExU] = useState(""); const [exR, setExR] = useState(""); const [exD, setExD] = useState("");
  const nm = (u: string) => staff.data?.find((s) => s.user_id === u)?.full_name ?? "—";
  async function savePost() {
    const r = await run("adm_duty_save_post", { _id: edit!.id ?? null, _school: ctx.schoolId, _d: edit }, "حُفظ الموقع");
    if (r) { setEdit(null); qc.invalidateQueries({ queryKey: ["duty"] }); }
  }
  const s = settings.data ?? {};
  return (
    <div className="space-y-6">
      <section className="space-y-2 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">سياسة العبء</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div><Label htmlFor="cap">الحد الأقصى للمناوبات أسبوعيًا للشخص</Label><Input id="cap" type="number" min={1} max={30} value={cap === "" ? s.max_per_week ?? 3 : cap} onChange={(e) => setCap(Number(e.target.value))} className="h-9 w-32" /></div>
          <div><Label htmlFor="lw">أسابيع العبء السابق المحتسبة</Label><Input id="lw" type="number" min={0} max={26} value={lw === "" ? s.load_weeks ?? 4 : lw} onChange={(e) => setLw(Number(e.target.value))} className="h-9 w-32" /></div>
          <Button size="sm" disabled={busy} onClick={() => run("adm_duty_save_settings", { _school: ctx.schoolId, _max: cap === "" ? s.max_per_week ?? 3 : cap, _weeks: lw === "" ? s.load_weeks ?? 4 : lw }, "حُفظت السياسة")}>حفظ</Button>
        </div>
        <p className="text-xs text-muted-foreground">لا ترتبط المناوبات بالإجازات أو الأجور أو الخصومات.</p>
      </section>
      <section className="space-y-2">
        <div className="flex items-center gap-2"><h2 className="font-semibold">مواقع المناوبة</h2><Button size="sm" className="ms-auto" onClick={() => setEdit({ ...blank })}>موقع جديد</Button></div>
        {edit && (
          <div className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-3">
            <div><Label htmlFor="pn">اسم الموقع</Label><Input id="pn" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            <div><Label htmlFor="pk">النوع</Label><select id="pk" className={selectCls("w-full")} value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>{Object.entries(DUTY_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div><Label htmlFor="pr">العدد المطلوب</Label><Input id="pr" type="number" min={1} max={20} value={edit.required} onChange={(e) => setEdit({ ...edit, required: Number(e.target.value) })} /></div>
            <div><Label htmlFor="ps">من</Label><Input id="ps" type="time" value={hm(edit.start_time)} onChange={(e) => setEdit({ ...edit, start_time: e.target.value })} /></div>
            <div><Label htmlFor="pe">إلى</Label><Input id="pe" type="time" value={hm(edit.end_time)} onChange={(e) => setEdit({ ...edit, end_time: e.target.value })} /></div>
            <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />فعال</label>
            <div className="md:col-span-3"><Label>الأيام</Label><div className="mt-1 flex flex-wrap gap-2">{DAY_NAMES.map((d, k) => (
              <label key={k} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs"><input type="checkbox" checked={edit.days.includes(k)} onChange={(e) => setEdit({ ...edit, days: e.target.checked ? [...edit.days, k] : edit.days.filter((x: number) => x !== k) })} />{d}</label>
            ))}</div></div>
            <div className="md:col-span-3"><Label>الفئات المؤهلة</Label><div className="mt-1 flex flex-wrap gap-2">{Object.entries(STAFF_ROLES).map(([k, v]) => (
              <label key={k} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs"><input type="checkbox" checked={edit.eligible_roles.includes(k)} onChange={(e) => setEdit({ ...edit, eligible_roles: e.target.checked ? [...edit.eligible_roles, k] : edit.eligible_roles.filter((x: string) => x !== k) })} />{v}</label>
            ))}</div></div>
            <div className="flex gap-2 md:col-span-3"><Button disabled={busy} onClick={savePost}>حفظ الموقع</Button><Button variant="outline" onClick={() => setEdit(null)}>إلغاء</Button></div>
          </div>
        )}
        {!posts.data?.length ? <EmptyState title="لا توجد مواقع" hint="أضف مواقع مثل الفسحة والبوابة والممرات." /> : (
          <ul className="space-y-2">{posts.data.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-sm">
              <span className="font-semibold">{p.name}</span><span>{DUTY_KIND[p.kind]}</span><span>{hm(p.start_time)}–{hm(p.end_time)}</span><span>المطلوب {p.required}</span>
              <span className="text-xs text-muted-foreground">{(p.days as number[]).map((d) => DAY_NAMES[d]).join("، ")} · {(p.eligible_roles as string[]).map((r) => STAFF_ROLES[r] ?? r).join("، ")}</span>
              {!p.active && <Pill>غير فعال</Pill>}
              <Button size="sm" variant="outline" className="ms-auto" onClick={() => setEdit({ ...p })}>تعديل</Button>
            </li>
          ))}</ul>
        )}
      </section>
      <section className="space-y-2 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">الاستثناءات التشغيلية</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-full"><PeoplePicker purpose="duty" school={ctx.schoolId} label="الموظف المستثنى" single compact value={exU ? [exU] : []} onChange={(v) => setExU(v[0] ?? "")} /></div>
          <Input aria-label="السبب" placeholder="السبب" value={exR} onChange={(e) => setExR(e.target.value)} className="h-9 w-56" />
          <div><Label htmlFor="exd">حتى (اختياري)</Label><Input id="exd" type="date" value={exD} onChange={(e) => setExD(e.target.value)} className="h-9" /></div>
          <Button size="sm" disabled={busy || !exU} onClick={async () => { const r = await run("adm_duty_set_exempt", { _school: ctx.schoolId, _user: exU, _reason: exR, _until: exD || null, _remove: false }, "أُضيف الاستثناء"); if (r) { setExU(""); setExR(""); setExD(""); } }}>إضافة</Button>
        </div>
        <ul className="space-y-1 text-sm">{ex.data?.map((x) => (
          <li key={x.user_id} className="flex items-center gap-2">{nm(x.user_id)} — {x.reason}{x.until ? ` (حتى ${x.until})` : ""}<button className="text-destructive underline" onClick={() => run("adm_duty_set_exempt", { _school: ctx.schoolId, _user: x.user_id, _reason: null, _until: null, _remove: true }, "أُزيل الاستثناء")}>إزالة</button></li>
        ))}</ul>
      </section>
    </div>
  );
}
