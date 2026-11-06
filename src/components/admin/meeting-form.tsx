import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { arabicError, type AppContext } from "@/lib/session";
import { riyadhDate, riyadhTime } from "@/components/admin/shared";
import { DeptPicker } from "@/components/comm/dept-picker";
import { PeoplePicker, usePeopleByIds, type Person } from "@/components/people-picker";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const addMin = (hhmm: string, min: number) => { const [h, m] = hhmm.split(":").map(Number); const t = (h! * 60 + m! + min) % 1440; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
const diffMin = (a: string, b: string) => { const [h1, m1] = a.split(":").map(Number); const [h2, m2] = b.split(":").map(Number); return h2! * 60 + m2! - (h1! * 60 + m1!); };

/** Create/edit a meeting through adm_meeting_save (organizer only; draft until invitations are sent). Invitees come from adm_meeting_candidates,
 *  which applies the organizer's scope (own school, or the owner's branches). Times are Riyadh local. */
export function MeetingForm({ school, ctx, me, meeting, members, onDone, onCancel }: { school: string | null; ctx?: AppContext; me: string; meeting?: Row; members?: string[]; onDone: (id: string) => void; onCancel: () => void }) {
  const owner = ctx?.role === "org_owner";
  const [clientId] = useState(() => crypto.randomUUID());
  const start = meeting ? riyadhTime(meeting.starts_at) : "";
  const [d, setD] = useState({
    title: meeting?.title ?? "", purpose: meeting?.purpose ?? "", date: meeting ? riyadhDate(meeting.starts_at) : "", time: start,
    end: meeting ? addMin(start, meeting.duration_min) : "", location: meeting?.location ?? "", link: meeting?.link ?? "", agenda: meeting?.agenda ?? "",
    privacy: meeting?.privacy ?? "normal", needs_rsvp: meeting?.needs_rsvp ?? true, minutes_writer: meeting?.minutes_writer ?? "", members: members ?? ([] as string[]),
    mode: meeting?.mode ?? "in_person", scope: meeting?.scope ?? "school", host: meeting?.school_id ?? school ?? "", change_reason: "",
  });
  const a0 = meeting?.audience as Row | null | undefined;
  const [aud, setAud] = useState({ on: !!a0, all_schools: !!a0?.all_schools, schools: (a0?.schools ?? []) as string[], categories: (a0?.categories ?? []) as string[], departments: (a0?.departments ?? []) as string[] });
  const [busy, setBusy] = useState(false);
  const schools = useQuery({
    enabled: owner && !!ctx?.orgId,
    queryKey: ["org-schools", ctx?.orgId],
    queryFn: async () => ((await db.from("schools").select("id, name").eq("org_id", ctx!.orgId!).order("name")).data ?? []) as Row[],
  });
  const host = d.host || school || "";
  const pickScope = { purpose: "meeting" as const, school: host || null, org: d.scope === "org" ? (ctx?.orgId ?? null) : null };
  const chosen = usePeopleByIds(pickScope, d.members);
  const byId: Map<string, Person> = chosen.data ?? new Map();
  const canAud = !meeting || meeting.status === "draft";
  const target = aud.on && canAud ? { mode: "all", all_schools: aud.all_schools, schools: d.scope === "school" ? [host] : aud.schools, categories: aud.categories, departments: aud.departments } : null;
  const audSchools = d.scope === "school" ? [host] : aud.all_schools ? (schools.data ?? []).map((x) => x.id as string) : aud.schools;

  const preview = useQuery({
    enabled: !!target && !!host && aud.categories.length > 0 && audSchools.length > 0,
    queryKey: ["meet-aud-preview", host, d.scope, target, d.members],
    queryFn: async () => { const { data, error } = await db.rpc("adm_meeting_audience_preview" as never, { _school: host, _scope: d.scope, _t: target, _picks: d.members } as never); if (error) throw error; return data as Row; },
  });
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  async function save() {
    if (!d.title.trim() || !d.date || !d.time || !d.end) return void toast.error("أكمل العنوان والتاريخ ووقتي البداية والنهاية");
    if (diffMin(d.time, d.end) < 5) return void toast.error("وقت النهاية يجب أن يكون بعد البداية");
    if (d.mode === "in_person" && !d.location.trim()) return void toast.error("حدد القاعة أو المكان للاجتماع الحضوري");
    if (!host) return void toast.error("اختر الفرع المستضيف");
    if (target && (!aud.categories.length || !audSchools.length)) return void toast.error("اختر الفروع والفئات للدعوة الجماعية");
    if (meeting?.status === "scheduled" && !d.change_reason.trim()) return void toast.error("اكتب سبب التعديل؛ سيُبلغ به المدعوون");
    setBusy(true);
    const payload = { ...d, starts_at: `${d.date}T${d.time}:00+03:00`, ends_at: `${d.date}T${d.end}:00+03:00`, link: d.mode === "virtual" ? "" : d.link };
    const { data, error } = await db.rpc("adm_meeting_save" as never, { _id: meeting?.id ?? null, _school: meeting ? (owner ? host : null) : host, _d: payload, _rev: meeting?.rev ?? null, _client: meeting ? null : clientId } as never);
    if (error) { setBusy(false); return void toast.error(arabicError(error)); }
    if (canAud && (target || meeting?.audience)) {
      const r = data as Row;
      const { error: e2 } = await db.rpc("adm_meeting_set_audience" as never, { _id: r.id, _rev: r.rev, _t: target } as never);
      if (e2) { setBusy(false); toast.error(arabicError(e2)); return onDone(r.id); }
    }
    setBusy(false);
    toast.success(meeting ? (meeting.status === "scheduled" ? "حُفظ التعديل وأُبلغ المدعوون بالسبب" : "حُفظ التعديل") : "حُفظت المسودة — لم تُرسل أي دعوة بعد");
    onDone((data as Row).id);
  }
  const sel = selectCls("w-full");
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-2">
      <div className="md:col-span-2"><Label htmlFor="m-title">العنوان</Label><Input id="m-title" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></div>
      <div className="md:col-span-2"><Label htmlFor="m-purpose">الهدف</Label><Input id="m-purpose" value={d.purpose} onChange={(e) => setD({ ...d, purpose: e.target.value })} /></div>
      <div className="md:col-span-2"><Label htmlFor="m-agenda">جدول الأعمال</Label><Textarea id="m-agenda" value={d.agenda} onChange={(e) => setD({ ...d, agenda: e.target.value })} /></div>
      <fieldset className="md:col-span-2">
        <legend className="mb-1 text-sm font-medium">نوع الاجتماع</legend>
        <div className="flex flex-wrap gap-2">
          {[["in_person", "حضوري"], ["virtual", "افتراضي — صوت ومشاركة شاشة"]].map(([k, l]) => (
            <label key={k} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${d.mode === k ? "border-primary bg-accent" : ""}`}>
              <input type="radio" name="m-mode" checked={d.mode === k} onChange={() => setD({ ...d, mode: k! })} />{l}
            </label>
          ))}
        </div>
        {!meeting && (
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => {
            const now = new Date(Date.now() + 3 * 3600e3); const t = now.toISOString().slice(11, 16);
            setD({ ...d, mode: "virtual", date: now.toISOString().slice(0, 10), time: t, end: addMin(t, 30) });
          }}>اجتماع أونلاين فوري (يبدأ الآن)</Button>
        )}
      </fieldset>
      {owner && (
        <>
          <div><Label htmlFor="m-scope">نطاق المدعوين</Label>
            <select id="m-scope" className={sel} value={d.scope} onChange={(e) => setD({ ...d, scope: e.target.value, members: [], minutes_writer: "" })}>
              <option value="school">فرع واحد (الفرع المستضيف)</option><option value="org">عدة فروع داخل المؤسسة</option>
            </select>
          </div>
          <div><Label htmlFor="m-host">الفرع المستضيف</Label>
            <select id="m-host" className={sel} value={d.host} onChange={(e) => setD({ ...d, host: e.target.value, members: d.scope === "school" ? [] : d.members })}>
              <option value="">اختر الفرع</option>{(schools.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </>
      )}
      <div><Label htmlFor="m-date">التاريخ</Label><Input id="m-date" type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></div>
      <div className="grid grid-cols-2 gap-2">
        <div><Label htmlFor="m-time">البداية (الرياض)</Label><Input id="m-time" type="time" value={d.time} onChange={(e) => setD({ ...d, time: e.target.value, end: d.end || (e.target.value ? addMin(e.target.value, 60) : "") })} /></div>
        <div><Label htmlFor="m-end">النهاية (الرياض)</Label><Input id="m-end" type="time" value={d.end} onChange={(e) => setD({ ...d, end: e.target.value })} /></div>
      </div>
      {d.mode === "in_person" ? (
        <>
          <div><Label htmlFor="m-loc">القاعة أو المكان</Label><Input id="m-loc" value={d.location} onChange={(e) => setD({ ...d, location: e.target.value })} /></div>
          <div><Label htmlFor="m-link">رابط خارجي (اختياري)</Label><Input id="m-link" dir="ltr" placeholder="https://" value={d.link} onChange={(e) => setD({ ...d, link: e.target.value })} /></div>
        </>
      ) : <p className="self-end rounded-lg bg-accent p-2 text-xs md:col-span-2">تُنشأ غرفة صوت ومشاركة شاشة داخل ركاز للمنظم والمدعوين فقط بعد إرسال الدعوات. لا كاميرا ولا تسجيل.</p>}
      <div><Label htmlFor="m-priv">نطاق الاطلاع</Label>
        <select id="m-priv" className={sel} value={d.privacy} onChange={(e) => setD({ ...d, privacy: e.target.value })}>
          <option value="normal">عادي (تراه إدارة المدرسة المستضيفة)</option><option value="restricted">مقيد (المنظم والمدعوون وكاتب المحضر فقط)</option>
        </select>
      </div>
      <div><Label htmlFor="m-writer">كاتب المحضر</Label>
        <select id="m-writer" className={sel} value={d.minutes_writer} onChange={(e) => setD({ ...d, minutes_writer: e.target.value })}>
          <option value="">أنا (المنظم)</option>{d.members.map((u) => <option key={u} value={u}>{byId.get(u)?.full_name ?? "مستخدم"}</option>)}
        </select>
      </div>
      <div className="space-y-2 md:col-span-2">
        <Label>المدعوون</Label>
        <PeoplePicker {...pickScope} label="المدعوون" exclude={[me]} value={d.members} onChange={(v) => setD({ ...d, members: v, minutes_writer: v.includes(d.minutes_writer) ? d.minutes_writer : "" })} />
        <p className="text-xs text-muted-foreground">كل شخص يُدعى مرة واحدة ولو تعددت أدواره. اختيار الفئة يعرض أسماءها فقط، ولا يُدعى أحد حتى تختاره.</p>
      </div>
      {canAud && (
        <fieldset className="space-y-2 rounded-lg border p-3 md:col-span-2">
          <legend className="px-1 text-sm font-medium">دعوة فئة كاملة</legend>
          <div className="flex flex-wrap gap-2">
            {([[false, "اختيار أشخاص بالاسم فقط"], [true, "جميع المطابقين"]] as const).map(([v, l]) => (
              <label key={String(v)} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${aud.on === v ? "border-primary bg-accent" : ""}`}>
                <input type="radio" name="m-aud" checked={aud.on === v} onChange={() => setAud({ ...aud, on: v })} />{l}
              </label>
            ))}
          </div>
          {aud.on && (
            <>
              {d.scope === "org" && (
                <div className="flex flex-wrap gap-2 text-sm" aria-label="فروع الدعوة">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={aud.all_schools} onChange={(e) => setAud({ ...aud, all_schools: e.target.checked, departments: [] })} />جميع الفروع</label>
                  {!aud.all_schools && (schools.data ?? []).map((x) => <label key={x.id} className="flex items-center gap-1"><input type="checkbox" checked={aud.schools.includes(x.id)} onChange={() => setAud({ ...aud, schools: toggle(aud.schools, x.id), departments: [] })} />{x.name}</label>)}
                </div>
              )}
              <div className="flex flex-wrap gap-3 text-sm" aria-label="فئات الدعوة">
                {[["guardian", "أولياء الأمور"], ["teacher", "المعلمون"], ["staff", "الإداريون"]].map(([k, l]) => <label key={k} className="flex items-center gap-1"><input type="checkbox" checked={aud.categories.includes(k!)} onChange={() => setAud({ ...aud, categories: toggle(aud.categories, k!) })} />{l}</label>)}
              </div>
              <div className="space-y-1 text-xs"><span className="text-muted-foreground">الأقسام والأشخاص المرتبطون بها (اختياري):</span>
                <DeptPicker org={ctx?.orgId ?? null} schools={audSchools} value={aud.departments} onChange={(v) => setAud({ ...aud, departments: v })} /></div>
              <p className="rounded-lg bg-accent p-2 text-sm" data-testid="aud-count">
                {preview.isFetching ? "جارٍ حساب المدعوين…" : preview.error ? arabicError(preview.error) : preview.data
                  ? <>عدد المدعوين الفريدين: <b>{preview.data.count}</b>{Object.entries(preview.data.by_school ?? {}).map(([n, k]) => ` — ${n}: ${k}`).join("")}</>
                  : "اختر الفروع والفئات لعرض العدد."}
              </p>
              <p className="text-xs text-muted-foreground">يتحقق الخادم من القائمة عند إرسال الدعوات، ويرفض الإرسال إذا تغيّرت بعد الحفظ. الطلاب لا يُدعون.</p>
            </>
          )}
        </fieldset>
      )}
      <div className="md:col-span-2">
        <p className="text-xs text-muted-foreground">لا يُدرج الطلاب وأولياء الأمور والحسابات الموقوفة. لا تُنشأ مجموعة تواصل يدوية.</p>
      </div>
      <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={d.needs_rsvp} onChange={(e) => setD({ ...d, needs_rsvp: e.target.checked })} />يُطلب من المدعوين القبول أو الاعتذار</label>
      {meeting?.status === "scheduled" && <div className="md:col-span-2"><Label htmlFor="m-reason">سبب التعديل (يُبلغ للمدعوين)</Label><Input id="m-reason" value={d.change_reason} onChange={(e) => setD({ ...d, change_reason: e.target.value })} /></div>}
      <div className="flex gap-2 md:col-span-2"><Button onClick={save} disabled={busy}>{busy ? "جارٍ الحفظ…" : meeting?.status === "scheduled" ? "حفظ التعديل وإبلاغ المدعوين" : "حفظ مسودة"}</Button><Button variant="outline" onClick={onCancel}>إلغاء</Button></div>
    </div>
  );
}
