import { selectCls } from "@/components/ui/native-select";
import type { Any } from "../lib";
import { SCHED, DOW } from "../lib";
import { CondEditor, condVars, emptyLeaf } from "./cond";
import type { Cond, NodeKind } from "./flow";
import { KIND, START_TYPES } from "./meta";
import { RecipientGroups, type Group } from "./groups";

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

export type RuleMeta = { name: string; description: string; event: string; schools: string[] | null; scope: string; schedule: Any; priority: number };

export function RuleSettings({ r, meta, set, schools }: { r: Any; meta: RuleMeta; set: (m: Partial<RuleMeta>) => void; schools: { id: string; name: string }[] }) {
  const evs = ((r?.events ?? []) as Any[]).filter((e) => ["wired", "tested"].includes(e.status));
  const ev = evs.find((e) => e.code === meta.event);
  const secs = ((r?.sections ?? []) as Any[]).filter((s) => evs.some((e) => e.section === s.key));
  const parents = [...new Set(secs.map((s) => s.parent ?? "—"))];
  const sec = ev?.section ?? "";
  const vars = ev ? condVars(r, ev.code) : [];
  const types = ((r?.triggers ?? []) as Any[]).filter((t) => t.available && (ev?.source_kind === "trigger" ? t.code === "event" : t.code !== "event"));
  const st = meta.schedule ?? {};
  const setS = (p: Any) => set({ schedule: { ...st, ...p } });
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
          <select className={selectCls("w-full")} value={sec} onChange={(e) => { const first = evs.find((x) => x.section === e.target.value); if (first) set({ event: first.code, schedule: { type: first.source_kind === "trigger" ? "event" : "condition" } }); }}>
            <option value="" disabled>اختر القسم</option>
            {parents.map((p) => <optgroup key={p} label={p}>{secs.filter((s) => (s.parent ?? "—") === p).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</optgroup>)}
          </select>
        </Field>
        <Field l="الحدث">
          <select className={selectCls("w-full")} value={meta.event} onChange={(e) => { const x = evs.find((y) => y.code === e.target.value); set({ event: e.target.value, schedule: { type: x?.source_kind === "trigger" ? "event" : "condition" } }); }}>
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
        fam ? <span className="block text-xs text-muted-foreground">لا تُستخدم المتغيرات في رسائل أولياء الأمور؛ يصلهم وصف السجل فقط.</span> : (
          <span className="flex flex-wrap gap-1 pt-1">{vars.map((v) => <button type="button" key={v.key} className="rounded-full border px-2 py-0.5 text-[11px] hover:border-primary" onClick={() => set({ ...data, [key]: `${String(data[key] ?? "")}{{${v.key}}}` })}>+ {v.label}</button>)}</span>)
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
      {kind === "wait" && (() => { const m = Number(data["minutes"] ?? 1440); const v = minutesView(m); return (
        <Field l="مدة الانتظار" hint="من 5 دقائق إلى 30 يومًا. بعد الانتظار يُعاد التحقق من السجل؛ إن لم يعد مطابقًا ينتهي المسار.">
          <span className="flex gap-2"><input type="number" min={1} className={`${inp} w-24`} value={v.n} onChange={(e) => set({ ...data, minutes: Number(e.target.value) * v.u })} />
            <select className={selectCls()} value={v.u} onChange={(e) => set({ ...data, minutes: v.n * Number(e.target.value) })}><option value={1}>دقيقة</option><option value={60}>ساعة</option><option value={1440}>يوم</option></select></span>
        </Field>); })()}
      {(kind === "notify" || kind === "reminder" || kind === "escalate") && !!data["title"] && (
        <div className="rounded-lg border bg-card p-3 text-sm shadow-sm"><div className="mb-1 text-[11px] text-muted-foreground">معاينة الصياغة</div>
          <div className="font-semibold">{kind === "escalate" ? "تصعيد: " : ""}{preview(String(data["title"]))}</div><div className="text-xs text-muted-foreground">{data["body"] ? preview(String(data["body"])) : "وصف السجل المرتبط"}</div>
          <div className="mt-1 text-[11px] text-primary">الرابط: يفتح السجل المرتبط حسب صلاحية المستلم</div></div>
      )}
    </div>
  );
}
