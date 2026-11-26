import { selectCls } from "@/components/ui/native-select";
import type { Any } from "../lib";
import { SCHED, DOW } from "../lib";
import { CondEditor, condVars, emptyLeaf } from "./cond";
import type { Cond, NodeKind } from "./flow";
import { KIND, START_TYPES } from "./meta";
import { RecipientGroups, type Group } from "./groups";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { rpc } from "../lib";
import { ChannelsEditor } from "./channels";
import { NestedSteps } from "./nested";
import { SourceParams } from "./source-params";

const inp = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";
const Field = ({ l, hint, children }: { l: string; hint?: string; children: React.ReactNode }) => (
  <label className="block space-y-1 text-sm"><span className="font-semibold">{l}</span>{children}{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</label>
);

/** Recipients the engine accepts for this event (same rule as _au_check_steps); the server re-checks on save. "staff" (named person) needs a people pool and is not offered here. */
export function eligibleRecipients(r: Any, ev: Any, forTask: boolean): Any[] {
  if (!ev) return [];
  const allowed = new Set<string>([...(ev.recipients ?? []), "owner", "principal"]);
  return ((r?.recipients ?? []) as Any[]).filter((x) => {
    if (!x.available || x.code === "staff" || !allowed.has(x.code) || (ev.covered ?? []).includes(x.code)) return false;
    if (ev.area === "central" && x.code !== "owner") return false;
    if (x.code === "guardian" && (forTask || ev.sensitivity === "restricted" || !(ev.recipients ?? []).includes("guardian"))) return false;
    return true;
  });
}

export type RuleMeta = { name: string; description: string; event: string; schools: string[] | null; scope: string; schedule: Any; priority: number; extra?: Record<string, unknown> };

export function RuleSettings({ r, meta, set, schools, org }: { r: Any; org: string; meta: RuleMeta; set: (m: Partial<RuleMeta>) => void; schools: { id: string; name: string }[] }) {
  const evs = ((r?.events ?? []) as Any[]).filter((e) => ["wired", "tested"].includes(e.status));
  const ev = evs.find((e) => e.code === meta.event);
  const secs = ((r?.sections ?? []) as Any[]).filter((s) => evs.some((e) => e.section === s.key));
  const parents = [...new Set(secs.map((s) => s.parent ?? "—"))];
  const sec = ev?.section ?? "";
  const vars = ev ? condVars(r, ev.code) : [];
  const wired = useQuery({ queryKey: ["au-source-tables"], staleTime: 300_000, queryFn: async () => new Set(((await supabase.from("au_source_tables").select("event_code")).data ?? []).map((x) => x.event_code as string)) });
  const types = ((r?.triggers ?? []) as Any[]).filter((t) => t.available && (ev?.source_kind === "trigger" ? t.code === "event" : t.code !== "event") && (t.code !== "on_change" || !!wired.data?.has(String(ev?.code))));
  const st = meta.schedule ?? {};
  const setS = (p: Any) => set({ schedule: { ...st, ...p } });
  const changeSource = (next: Any) => {
    if (!next) return;
    const extra = { ...(meta.extra ?? {}) }; delete extra["params"];
    set({ event: next.code, extra, schedule: { type: next.source_kind === "trigger" ? "event" : "condition" } });
  };
  const scopes = ev?.area === "central" ? [["central", "الإدارة المركزية"]] : [["one", "مدرسة محددة"], ["many", "عدة مدارس"], ["all", ev?.area === "shared" ? "مشترك: جميع المدارس والإدارة المركزية" : "جميع مدارس المجموعة"]];
  return (
    <div className="space-y-4">
      <section className="space-y-3">
        <h4 className="text-xs font-bold text-muted-foreground">١. القاعدة</h4>
        <Field l="اسم القاعدة"><input className={inp} value={meta.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field l="الوصف (اختياري)"><textarea className={inp} rows={2} maxLength={500} value={meta.description} onChange={(e) => set({ description: e.target.value })} /></Field>
      </section>
      <section className="space-y-3">
        <h4 className="text-xs font-bold text-muted-foreground">٢–٣. القسم والحدث</h4>
        <Field l="القسم" hint="تظهر الأقسام المرتبطة بالمحرك فقط. الأقسام غير المدعومة وأسبابها في «دليل الأحداث».">
          <select className={selectCls("w-full")} value={sec} onChange={(e) => changeSource(evs.find((x) => x.section === e.target.value))}>
            <option value="" disabled>اختر القسم</option>
            {parents.map((p) => <optgroup key={p} label={p}>{secs.filter((s) => (s.parent ?? "—") === p).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</optgroup>)}
          </select>
        </Field>
        <Field l="الحدث">
          <select className={selectCls("w-full")} value={meta.event} onChange={(e) => changeSource(evs.find((x) => x.code === e.target.value))}>
            <option value="" disabled>اختر الحدث</option>
            {evs.filter((e) => !sec || e.section === sec).map((e) => <option key={e.code} value={e.code}>{e.label}</option>)}
          </select>
        </Field>
        {ev && (
          <div className="rounded-lg border bg-muted/40 p-3 text-xs leading-6">
            <div><b>التوقيت:</b> {ev.timing ?? "—"} · <b>الحساسية:</b> {ev.sensitivity === "restricted" ? "مقيد" : ev.sensitivity === "sensitive" ? "حساس" : "عادي"}</div>
            <div><b>المتغيرات:</b> {vars.map((v) => v.label).join("، ") || "—"}</div>
            {(ev.covered ?? []).length > 0 && <div className="text-muted-foreground">يُبلَّغ أصلًا من خدمة قائمة: {(ev.covered as string[]).join("، ")}</div>}
          </div>
        )}
      </section>
      {ev && (
        <section className="space-y-3">
          <h4 className="text-xs font-bold text-muted-foreground">١. النطاق</h4>
          <Field l="نطاق التطبيق">
            <select className={selectCls("w-full")} value={meta.scope} onChange={(e) => set({ scope: e.target.value, schools: e.target.value === "all" || e.target.value === "central" ? null : (meta.schools ?? []).slice(0, e.target.value === "one" ? 1 : 50) })}>
              {scopes.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          {(meta.scope === "one" || meta.scope === "many") && (
            <div className="max-h-40 space-y-1 overflow-auto rounded-md border p-2 text-sm">
              {schools.map((s) => { const on = (meta.schools ?? []).includes(s.id); return (
                <label key={s.id} className="flex items-center gap-2"><input type={meta.scope === "one" ? "radio" : "checkbox"} name="au-school" checked={on}
                  onChange={() => set({ schools: meta.scope === "one" ? [s.id] : on ? (meta.schools ?? []).filter((x) => x !== s.id) : [...(meta.schools ?? []), s.id] })} />{s.name}</label>); })}
              {schools.length === 0 && <p className="text-xs text-muted-foreground">لا توجد مدارس في المجموعة.</p>}
            </div>
          )}
        </section>
      )}
      {ev && <SourceParams r={r} event={meta.event} org={org} schools={meta.scope === "one" || meta.scope === "many" ? meta.schools : null} value={(meta.extra?.["params"] ?? {}) as Record<string, unknown>} set={(params) => set({ extra: { ...(meta.extra ?? {}), params } })} />}
      {ev && (
        <section className="space-y-3">
          <h4 className="text-xs font-bold text-muted-foreground">٧. التوقيت (توقيت الرياض)</h4>
          <Field l="نوع التشغيل" hint={ev.source_kind === "trigger" ? "هذا الحدث فوري: يُلتقط عند الحفظ ويُنفذ في الدورة التالية." : "تظهر الأنواع المتوافقة مع الحدث فقط."}>
            <select className={selectCls("w-full")} value={st.type ?? ""} onChange={(e) => set({ schedule: { type: e.target.value, quiet: st.quiet ?? true, workdays_only: st.workdays_only ?? false } })}>
              {START_TYPES.map((g) => { const opts = types.filter((t) => g.types.includes(t.code)); return opts.length ? <optgroup key={g.k} label={g.l}>{opts.map((t) => <option key={t.code} value={t.code}>{SCHED[t.code] ?? t.label}</option>)}</optgroup> : null; })}
            </select>
          </Field>
          {["daily", "weekly", "monthly"].includes(st.type) && <Field l="الساعة"><input type="time" className={inp} value={st.at ?? "07:00"} onChange={(e) => setS({ at: e.target.value })} /></Field>}
          {st.type === "weekly" && <Field l="اليوم"><select className={selectCls("w-full")} value={st.dow ?? 0} onChange={(e) => setS({ dow: Number(e.target.value) })}>{DOW.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field>}
          {st.type === "monthly" && <Field l="يوم الشهر (1–28)"><input type="number" min={1} max={28} className={inp} value={st.day ?? 1} onChange={(e) => setS({ day: Number(e.target.value) })} /></Field>}
          {st.type === "at" && <Field l="الموعد"><input type="datetime-local" className={inp} value={st.ts ?? ""} onChange={(e) => setS({ ts: e.target.value })} /></Field>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={st.quiet ?? true} onChange={(e) => setS({ quiet: e.target.checked })} />احترام فترة منع الإشعارات</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={st.workdays_only ?? false} onChange={(e) => setS({ workdays_only: e.target.checked })} />أيام العمل فقط (مع الإجازات الرسمية)</label>
        </section>
      )}
      {ev && (
        <section className="space-y-3">
          <h4 className="text-xs font-bold text-muted-foreground">٨. ضوابط التنفيذ</h4>
          {String(ev.code).startsWith("ds.") && (() => { const ex = meta.extra ?? {}; const on = ex["mode"] === "batch"; const nums = vars.filter((v) => v.type === "number"); const b = (ex["batch"] ?? {}) as Any; return (
            <div className="space-y-2 rounded-md border p-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={on} onChange={(e) => { const n = { ...ex }; if (e.target.checked) n["mode"] = "batch"; else { delete n["mode"]; delete n["batch"]; } set({ extra: n }); }} />تجميع النتائج لكل مدرسة (عنصر واحد بعدد السجلات المطابقة)</label>
              {on && <Field l="مجموع حقل (اختياري)" hint="يُعاد العد والمجموع لحظة كل خطوة؛ إن صار صفرًا ينتهي المسار. المتغيرات: {{batch_count}} و{{batch_total}} و{{batch_list}}.">
                <select className={selectCls("w-full")} value={String(b.sum ?? "")} onChange={(e) => set({ extra: { ...ex, batch: e.target.value ? { sum: e.target.value } : {} } })}><option value="">—</option>{nums.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}</select>
              </Field>}
            </div>); })()}
          <Field l="أولوية القاعدة (1 الأعلى – 9)" hint="عند تعارض قاعدتين على السجل والشخص نفسيهما تُرسل الأعلى أولوية فقط.">
            <input type="number" min={1} max={9} className={inp} value={meta.priority} onChange={(e) => set({ priority: Math.max(1, Math.min(9, Number(e.target.value) || 5)) })} />
          </Field>
          <p className="rounded-md bg-muted/50 p-2 text-xs leading-5 text-muted-foreground">منع التكرار تلقائي لكل سجل وفترة ومستلم. الحد اليومي لكل مستخدم ولولي الأمر وسياسة التأجيل تُضبط على مستوى المجموعة من تبويب «الإعدادات والصلاحيات». مدة صلاحية الإشعار غير مدعومة في المحرك حاليًا.</p>
        </section>
      )}
    </div>
  );
}

const minutesView = (m: number) => (m % 1440 === 0 ? { n: m / 1440, u: 1440 } : m % 60 === 0 ? { n: m / 60, u: 60 } : { n: m, u: 1 });

export function StepProps({ kind, data, set, r, ev, org = "", schools = [], steps = [] }: { kind: NodeKind; data: Record<string, unknown>; set: (d: Record<string, unknown>) => void; r: Any; ev: Any; org?: string; schools?: { id: string; name: string }[]; steps?: string[] }) {
  const groups = data["groups"] as Group[] | undefined;
  const useGroups = Array.isArray(groups);
  const toggleGroups = (on: boolean) => { const d = { ...data }; if (on) { d["groups"] = [{ by: "role", role: ev?.area === "central" ? "owner" : "principal", mode: "all" }]; delete d["recipients"]; delete d["assignee"]; delete d["to"]; } else delete d["groups"]; set(d); };
  const modeSwitch = org && (
    <label className="flex items-center gap-2 rounded-md bg-muted/50 p-2 text-xs"><input type="checkbox" checked={useGroups} onChange={(e) => toggleGroups(e.target.checked)} />اختيار متقدم للمستلمين (أدوار، أشخاص، مسميات، أقسام، مدير مباشر، مسؤول السجل، بديل)</label>
  );
  const groupEditor = useGroups && <RecipientGroups value={groups} onChange={(v) => set({ ...data, groups: v })} org={org} ev={ev} schools={schools} steps={steps.filter((s) => s !== data["key"])} forTask={kind === "task" || kind === "review"} />;
  const keyField = (kind === "notify" || kind === "reminder" || kind === "escalate") && (
    <Field l="اسم الخطوة (اختياري)" hint="لاستخدام مستلمي هذه الخطوة في خطوة لاحقة."><input className={inp} maxLength={40} value={String(data["key"] ?? "")} onChange={(e) => { const d = { ...data }; if (e.target.value.trim()) d["key"] = e.target.value; else delete d["key"]; set(d); }} /></Field>
  );
  const vars = ev ? condVars(r, ev.code) : [];
  const ops = (r?.operators ?? []) as Any[];
  const rc = eligibleRecipients(r, ev, kind === "task" || kind === "review");
  const fam = (Array.isArray(data["recipients"]) && (data["recipients"] as string[]).includes("guardian")) || JSON.stringify(data["groups"] ?? []).includes('"guardian"');
  const tplField = (key: "title" | "body", label: string, rows = 1) => (
    <Field l={label}>
      {rows > 1 ? <textarea className={inp} rows={rows} maxLength={500} value={String(data[key] ?? "")} onChange={(e) => set({ ...data, [key]: e.target.value })} />
        : <input className={inp} maxLength={120} value={String(data[key] ?? "")} onChange={(e) => set({ ...data, [key]: e.target.value })} />}
      {kind !== "task" && kind !== "review" || key === "title" ? (
        (
          <span className="flex flex-wrap gap-1 pt-1">{fam && <span className="w-full text-[11px] text-muted-foreground">لأولياء الأمور: الحقول المسموح بها للأسر فقط.</span>}{vars.filter((v) => !fam || ((v.flags ?? []) as string[]).includes("family")).map((v) => <button type="button" key={v.key} className="rounded-full border px-2 py-0.5 text-[11px] hover:border-primary" onClick={() => set({ ...data, [key]: `${String(data[key] ?? "")}{{${v.key}}}` })}>+ {v.label}</button>)}</span>)
      ) : null}
    </Field>
  );
  const preview = (s: string) => s.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (_, k: string) => `«${vars.find((v) => v.key === k)?.label ?? k}»`);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{KIND[kind].d}</p>
      {(kind === "filter" || kind === "if") && (
        vars.length === 0 ? <p className="text-sm text-muted-foreground">لا متغيرات لهذا الحدث.</p> :
        <CondEditor value={(data["when"] as Cond) ?? { all: [emptyLeaf(vars)] }} onChange={(c) => set({ ...data, when: c })} vars={vars} ops={ops} />
      )}
      {(kind === "notify" || kind === "reminder") && (
        <>
          {modeSwitch}
          {useGroups ? groupEditor : <Field l="المستلمون" hint="تظهر الفئات المؤهلة لهذا الحدث فقط، ويُعاد التحقق من كل شخص لحظة التنفيذ.">
            <span className="block space-y-1 rounded-md border p-2">{rc.map((x) => { const cur = (data["recipients"] as string[] | undefined) ?? []; const on = cur.includes(x.code); return (
              <label key={x.code} className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={on} onChange={() => set({ ...data, recipients: on ? cur.filter((c) => c !== x.code) : [...cur, x.code] })} />{x.label}</label>); })}
              {rc.length === 0 && <span className="text-xs text-muted-foreground">لا مستلمين مؤهلين — اختر الحدث أولًا.</span>}</span>
          </Field>}
          {keyField}
          {tplField("title", "عنوان الإشعار")}
          {tplField("body", "نص الإشعار (اختياري — الافتراضي وصف السجل)", 3)}
          {org && <ChannelsEditor data={data} set={set} org={org} vars={vars} fam={fam} />}
        </>
      )}
      {kind === "escalate" && (
        <>
          {modeSwitch}
          {useGroups ? groupEditor : <Field l="التصعيد إلى"><select className={selectCls("w-full")} value={String(data["to"] ?? "")} onChange={(e) => set({ ...data, to: e.target.value })}><option value="">—</option>{ev?.area !== "central" && <option value="principal">مدير المدرسة</option>}<option value="owner">مدير النظام</option></select></Field>}
          {keyField}
          {tplField("title", "عنوان التصعيد")}
          {tplField("body", "نص التصعيد (اختياري)", 3)}
        </>
      )}
      {(kind === "task" || kind === "review") && (
        <>
          {modeSwitch}
          {useGroups ? groupEditor : <Field l={kind === "task" ? "المكلَّف" : "المراجع"}><select className={selectCls("w-full")} value={String(data[kind === "task" ? "assignee" : "to"] ?? "")} onChange={(e) => set({ ...data, [kind === "task" ? "assignee" : "to"]: e.target.value })}><option value="">—</option>{rc.map((x) => <option key={x.code} value={x.code}>{x.label}</option>)}</select></Field>}
          {useGroups && <p className="text-xs text-muted-foreground">تُنشأ مهمة لكل شخص مؤهل (حتى 10)، ولا يُكلَّف ولي أمر.</p>}
          {tplField("title", kind === "task" ? "عنوان المهمة" : "عنوان طلب المراجعة")}
          {kind === "review" && <Field l="سبب المراجعة"><textarea className={inp} rows={2} maxLength={300} value={String(data["reason"] ?? "")} onChange={(e) => set({ ...data, reason: e.target.value })} /></Field>}
          <Field l="مدة الإنجاز (أيام)"><input type="number" min={1} max={30} className={inp} value={Number(data["due_in_days"] ?? (kind === "review" ? 3 : 2))} onChange={(e) => set({ ...data, due_in_days: Number(e.target.value) })} /></Field>
          <p className="text-xs text-muted-foreground">{kind === "review" ? "يُنشأ باسم النظام مع ذكر القاعدة، ويحتاج تأكيدًا بشريًا." : "تُنشأ عبر مسار التكليفات القائم مع سجل وإشعار للمكلَّف."} لا يُكلَّف ولي أمر.</p>
        </>
      )}
      {kind === "wait" && (() => { const dates = vars.filter((x) => x.type === "date"); const byDate = !!data["until_var"]; return dates.length > 0 ? (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={byDate} onChange={(e) => { const d = { ...data }; if (e.target.checked) { d["until_var"] = dates[0]!.key; d["offset_days"] = 0; delete d["minutes"]; } else { delete d["until_var"]; delete d["offset_days"]; d["minutes"] = 1440; } set(d); }} />الانتظار حتى تاريخ من السجل</label>) : null; })()}
      {kind === "wait" && !!data["until_var"] && (
        <div className="flex gap-2">
          <Field l="حقل التاريخ"><select className={selectCls("w-full")} value={String(data["until_var"])} onChange={(e) => set({ ...data, until_var: e.target.value })}>{vars.filter((x) => x.type === "date").map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></Field>
          <Field l="إزاحة (أيام)" hint="سالب = قبل التاريخ"><input type="number" min={-90} max={90} className={inp} value={Number(data["offset_days"] ?? 0)} onChange={(e) => set({ ...data, offset_days: Number(e.target.value) })} /></Field>
        </div>
      )}
      {kind === "wait" && !data["until_var"] && (() => { const m = Number(data["minutes"] ?? 1440); const v = minutesView(m); return (
        <Field l="مدة الانتظار" hint="من 5 دقائق إلى 30 يومًا. بعد الانتظار يُعاد التحقق من السجل؛ إن لم يعد مطابقًا ينتهي المسار.">
          <span className="flex gap-2"><input type="number" min={1} className={`${inp} w-24`} value={v.n} onChange={(e) => set({ ...data, minutes: Number(e.target.value) * v.u })} />
            <select className={selectCls()} value={v.u} onChange={(e) => set({ ...data, minutes: v.n * Number(e.target.value) })}><option value={1}>دقيقة</option><option value={60}>ساعة</option><option value={1440}>يوم</option></select></span>
        </Field>); })()}
      {(kind === "mt_request" || kind === "hr_letter" || kind === "report" || kind === "wait_until" || kind === "set") && <OpsStep kind={kind} data={data} set={set} r={r} ev={ev} org={org} schools={schools} steps={steps} />}
      {(kind === "notify" || kind === "reminder" || kind === "escalate") && !!data["title"] && (
        <div className="rounded-lg border bg-card p-3 text-sm shadow-sm"><div className="mb-1 text-[11px] text-muted-foreground">معاينة الصياغة</div>
          <div className="font-semibold">{kind === "escalate" ? "تصعيد: " : ""}{preview(String(data["title"]))}</div><div className="text-xs text-muted-foreground">{data["body"] ? preview(String(data["body"])) : "وصف السجل المرتبط"}</div>
          <div className="mt-1 text-[11px] text-primary">الرابط: يفتح السجل المرتبط حسب صلاحية المستلم</div></div>
      )}
    </div>
  );
}

/** Allowed field changes per event (mirror of au_update_fields; the server stays the authority). */
const SET_FIELDS: Record<string, { field: string; label: string; values: [string, string][] }[]> = {
  "adm.task.overdue": [{ field: "priority", label: "أولوية التكليف", values: [["high", "عالية"]] }],
  "ds.maintenance": [{ field: "priority", label: "أولوية طلب الصيانة", values: [["high", "عالية"], ["urgent", "عاجلة"]] }],
};
const PRIOS: [string, string][] = [["low", "منخفضة"], ["normal", "عادية"], ["high", "عالية"], ["urgent", "عاجلة"]];

function OpsStep({ kind, data, set, r, ev, org, schools, steps }: { kind: NodeKind; data: Record<string, unknown>; set: (d: Record<string, unknown>) => void; r: Any; ev: Any; org: string; schools: { id: string; name: string }[]; steps: string[] }) {
  const vars = ev ? condVars(r, ev.code) : [];
  const txt = (k: string, l: string, max = 120, rows = 1) => (
    <Field l={l}>{rows > 1 ? <textarea className={inp} rows={rows} maxLength={max} value={String(data[k] ?? "")} onChange={(e) => set({ ...data, [k]: e.target.value })} />
      : <input className={inp} maxLength={max} value={String(data[k] ?? "")} onChange={(e) => set({ ...data, [k]: e.target.value })} />}
      <span className="flex flex-wrap gap-1 pt-1">{vars.filter((v) => v.type !== "uuid").slice(0, 12).map((v) => <button type="button" key={v.key} className="rounded-full border px-2 py-0.5 text-[11px] hover:border-primary" onClick={() => set({ ...data, [k]: `${String(data[k] ?? "")}{{${v.key}}}` })}>+ {v.label}</button>)}</span>
    </Field>);
  const key = (
    <Field l="اسم الخطوة (حروف إنجليزية صغيرة وأرقام)" hint="لاستخدام نتيجتها لاحقًا، مثل حالة الطلب في «انتظار حتى شرط».">
      <input className={inp} maxLength={20} dir="ltr" value={String(data["key"] ?? "")} onChange={(e) => { const d = { ...data }; const v = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""); if (v) d["key"] = v; else delete d["key"]; set(d); }} />
    </Field>);
  const nested = (k: string, l: string) => <NestedSteps label={l} value={data[k] as Record<string, unknown>[] | undefined} onChange={(v) => { const d = { ...data }; if (v?.length) d[k] = v; else delete d[k]; set(d); }} org={org} ev={ev} schools={schools} steps={steps} />;
  const mk = String(data["kind"] ?? "school");
  const cats = useQuery({ queryKey: ["mt-cats-au", org, mk], enabled: kind === "mt_request" && !!org, queryFn: async () => (await rpc<Any[]>("mt_categories_list", { _org: org, _kind: mk })).filter((c) => !c.is_other) });
  const buses = useQuery({ queryKey: ["mt-buses-au", org], enabled: kind === "mt_request" && mk === "bus" && !!org, queryFn: async () => (await rpc<Any[]>("mt_buses_list", { _org: org })).filter((b) => b.active && schools.some((s) => s.id === b.school_id)) });
  const tpls = useQuery({ queryKey: ["hr-letter-tpls", org], enabled: kind === "hr_letter" && !!org, queryFn: () => rpc<Any[]>("hr_letter_templates", { _org: org }) });
  if (kind === "mt_request") return (
    <div className="space-y-3">
      {key}
      <Field l="نوع الصيانة"><select className={selectCls("w-full")} value={mk} onChange={(e) => { const d: Record<string, unknown> = { ...data, kind: e.target.value }; delete d["category"]; if (e.target.value === "bus") { delete d["place"]; d["bus"] = ev?.code === "ds.api.buses" ? "record" : ""; } else delete d["bus"]; if (e.target.value === "school") delete d["kind"]; set(d); }}>
        <option value="school">صيانة المدرسة</option><option value="bus">صيانة الباصات</option></select></Field>
      {mk === "bus" && <Field l="الباص" hint="يُنشأ الطلب بترقيم صيانة الباصات (MB-) ويُسند لمنفّذ صيانة الباصات في الفرع."><select className={selectCls("w-full")} value={String(data["bus"] ?? "")} onChange={(e) => set({ ...data, bus: e.target.value })}>
        <option value="">—</option>{ev?.code === "ds.api.buses" && <option value="record">الباص نفسه (سجل الحدث)</option>}
        {(buses.data ?? []).map((b: Any) => <option key={b.id} value={b.id}>{b.code}{b.plate ? ` — ${b.plate}` : ""}</option>)}</select></Field>}
      {txt("title", "عنوان الطلب")}{txt("description", "وصف العطل", 500, 3)}{mk === "school" && txt("place", "المكان")}
      <Field l="التصنيف"><select className={selectCls("w-full")} value={String(data["category"] ?? "")} onChange={(e) => set({ ...data, category: e.target.value })}><option value="">—</option>{(cats.data ?? []).map((c: Any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
      {(cats.error || buses.error) && <p role="alert" className="text-xs text-destructive">تعذر تحميل خيارات الصيانة المسموح بها</p>}
      <Field l="الأولوية"><select className={selectCls("w-full")} value={String(data["priority"] ?? "normal")} onChange={(e) => set({ ...data, priority: e.target.value })}>{PRIOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
      <Field l="الإسناد إلى (اختياري)" hint="أول شخص مؤهل وله صلاحية تنفيذ الصيانة؛ وإلا يُطبَّق الإسناد المعتاد للفرع.">
        <RecipientGroups value={(data["assign"] as Group[] | undefined) ?? []} onChange={(v) => { const d = { ...data }; if (v.length) d["assign"] = v; else delete d["assign"]; set(d); }} org={org} ev={ev} schools={schools} steps={steps} forTask />
      </Field>
      {nested("on_fail", "مسار الفشل")}
      <p className="text-xs text-muted-foreground">مقدّم الطلب هو من اعتمد القاعدة، ويجب أن يملك صلاحية تقديم طلبات الصيانة لحظة التنفيذ.</p>
    </div>);
  if (kind === "hr_letter") return (
    <div className="space-y-3">
      {key}
      <Field l="قالب الخطاب"><select className={selectCls("w-full")} value={String(data["template"] ?? "")} onChange={(e) => set({ ...data, template: e.target.value })}><option value="">—</option>{(tpls.data ?? []).map((t: Any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
      {txt("purpose", "الغرض من الخطاب", 300)}
      <Field l="الجهة الموجّه إليها (اختياري)"><input className={inp} maxLength={200} value={String(data["addressee"] ?? "")} onChange={(e) => set({ ...data, addressee: e.target.value })} /></Field>
      {nested("on_fail", "مسار الفشل")}
      <p className="text-xs text-muted-foreground">يُنشأ طلب الخطاب فقط وينتظر المراجعة البشرية؛ لا يُصدر آليًا. القاعدة عالية الخطورة ويعتمدها مدير النظام.</p>
    </div>);
  if (kind === "report") {
    const src = String(data["source"] ?? "");
    const sources = ((r?.events ?? []) as Any[]).filter((e) => String(e.code).startsWith("ds.") && ["wired", "tested"].includes(e.status));
    const fvars = src && src !== "rep.attendance_week" && src !== "doc" ? condVars(r, src).filter((v) => v.type !== "uuid") : [];
    const cur = (data["fields"] as string[] | undefined) ?? [];
    return (
      <div className="space-y-3">
        {key}{txt("title", src === "doc" ? "عنوان المستند" : "عنوان التقرير")}
        <Field l="المصدر"><select className={selectCls("w-full")} value={src} onChange={(e) => { const d: Record<string, unknown> = { ...data, source: e.target.value }; delete d["fields"]; delete d["filter"]; set(d); }}>
          <option value="">—</option><option value="doc">مستند من قالب نصي (PDF محفوظ)</option><option value="rep.attendance_week">الحضور الأسبوعي للمدرسة (آخر 7 أيام)</option>
          {sources.map((e) => <option key={e.code} value={e.code}>{e.label}</option>)}</select></Field>
        {src === "doc" && <>{txt("body", "نص المستند (يُملأ من بيانات السجل)", 4000, 6)}<p className="text-xs text-muted-foreground">يُحفظ ملف PDF على الخادم ويُشارك مع المحددين فقط. الخطابات الرسمية تمر بطلب خطاب الموارد البشرية والاعتماد البشري.</p></>}
        {fvars.length > 0 && <Field l="الحقول (حتى 12)"><span className="block max-h-40 space-y-1 overflow-auto rounded-md border p-2">{fvars.map((v) => { const on = cur.includes(v.key); return (
          <label key={v.key} className="flex items-center gap-2"><input type="checkbox" checked={on} disabled={!on && cur.length >= 12} onChange={() => set({ ...data, fields: on ? cur.filter((x) => x !== v.key) : [...cur, v.key] })} />{v.label}</label>); })}</span></Field>}
        <Field l="يطّلع عليه" hint="من يملك صلاحية قراءة المصدر فقط؛ غيرهم يُسجَّل سبب استبعاده.">
          <RecipientGroups value={(data["share"] as Group[] | undefined) ?? []} onChange={(v) => { const d = { ...data }; if (v.length) d["share"] = v; else delete d["share"]; set(d); }} org={org} ev={ev} schools={schools} steps={steps} forTask />
        </Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!data["notify"]} onChange={(e) => { const d = { ...data }; if (e.target.checked) d["notify"] = true; else delete d["notify"]; set(d); }} />إشعار داخلي بأن التقرير جاهز</label>
        {nested("on_fail", "مسار الفشل")}
      </div>);
  }
  if (kind === "set") {
    const opts = SET_FIELDS[String(ev?.code ?? "")] ?? [];
    const f = opts.find((o) => o.field === data["field"]);
    return opts.length === 0 ? <p className="text-sm text-muted-foreground">لا توجد حقول مسموح بتحديثها لهذا الحدث.</p> : (
      <div className="space-y-3">
        <Field l="الحقل"><select className={selectCls("w-full")} value={String(data["field"] ?? "")} onChange={(e) => set({ ...data, field: e.target.value, value: "" })}><option value="">—</option>{opts.map((o) => <option key={o.field} value={o.field}>{o.label}</option>)}</select></Field>
        {f && <Field l="القيمة الجديدة"><select className={selectCls("w-full")} value={String(data["value"] ?? "")} onChange={(e) => set({ ...data, value: e.target.value })}><option value="">—</option>{f.values.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>}
        {nested("on_fail", "مسار الفشل")}
      </div>);
  }
  // wait_until: record fields + live outputs of named earlier steps
  const outs = steps.flatMap((k) => [{ key: `out_${k}_status`, label: `حالة نتيجة «${k}»`, type: "status", options: null }, { key: `out_${k}_count`, label: `عدد نتيجة «${k}»`, type: "number", options: null }]);
  const wv = [...vars, ...outs];
  return (
    <div className="space-y-3">
      {wv.length > 0 && <CondEditor value={(data["when"] as Cond) ?? { all: [emptyLeaf(wv)] }} onChange={(c) => set({ ...data, when: c })} vars={wv} ops={(r?.operators ?? []) as Any[]} />}
      <div className="flex gap-2">
        <Field l="الفحص كل (دقيقة)"><input type="number" min={15} max={1440} className={inp} value={Number(data["every_minutes"] ?? 60)} onChange={(e) => set({ ...data, every_minutes: Number(e.target.value) })} /></Field>
        <Field l="المهلة القصوى (دقيقة)"><input type="number" min={60} max={43200} className={inp} value={Number(data["max_minutes"] ?? 10080)} onChange={(e) => set({ ...data, max_minutes: Number(e.target.value) })} /></Field>
      </div>
      {nested("timeout", "مسار انتهاء المهلة")}
      <p className="text-xs text-muted-foreground">يُعاد قراءة السجل ونتائج الخطوات في كل فحص. للانتظار حتى قرار اعتماد: اختر حالة نتيجة خطوة «طلب مراجعة» أو «طلب خطاب».</p>
    </div>);
}
