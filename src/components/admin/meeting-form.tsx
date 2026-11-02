import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { arabicError, type AppContext } from "@/lib/session";
import { STAFF_ROLES, riyadhDate, riyadhTime } from "@/components/admin/shared";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;
type Cand = { user_id: string; full_name: string; school_id: string; school_name: string; roles: string; dept_name: string | null };

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
  const [f, setF] = useState({ q: "", branch: "", role: "", dept: "" });
  const [busy, setBusy] = useState(false);
  const schools = useQuery({
    enabled: owner && !!ctx?.orgId,
    queryKey: ["org-schools", ctx?.orgId],
    queryFn: async () => ((await db.from("schools").select("id, name").eq("org_id", ctx!.orgId!).order("name")).data ?? []) as Row[],
  });
  const host = d.host || school || "";
  const depts = useQuery({
    enabled: !!(f.branch || host),
    queryKey: ["adm-depts", f.branch || host],
    queryFn: async () => ((await db.from("departments").select("id, name").eq("school_id", f.branch || host).order("name")).data ?? []) as Row[],
  });
  const cands = useQuery({
    enabled: !!host,
    queryKey: ["adm-meet-cands", host, d.scope, f],
    queryFn: async () => {
      const { data, error } = await db.rpc("adm_meeting_candidates" as never, { _school: host, _scope: d.scope, _q: f.q.trim() || null, _branch: f.branch || null, _role: f.role || null, _dept: f.dept || null } as never);
      if (error) throw error;
      return data as unknown as Cand[];
    },
  });
  // names for selected people independent of the current filter
  const all = useQuery({
    enabled: !!host,
    queryKey: ["adm-meet-cands", host, d.scope, "all"],
    queryFn: async () => ((await db.rpc("adm_meeting_candidates" as never, { _school: host, _scope: d.scope, _q: null, _branch: null, _role: null, _dept: null } as never)).data ?? []) as unknown as Cand[],
  });
  const byId = useMemo(() => new Map((all.data ?? []).map((c) => [c.user_id, c])), [all.data]);
  const roleLabel = (rs: string) => rs.split(",").map((r) => STAFF_ROLES[r] ?? r).join("، ");

  async function save() {
    if (!d.title.trim() || !d.date || !d.time || !d.end) return void toast.error("أكمل العنوان والتاريخ ووقتي البداية والنهاية");
    if (diffMin(d.time, d.end) < 5) return void toast.error("وقت النهاية يجب أن يكون بعد البداية");
    if (d.mode === "in_person" && !d.location.trim()) return void toast.error("حدد القاعة أو المكان للاجتماع الحضوري");
    if (!host) return void toast.error("اختر الفرع المستضيف");
    if (meeting?.status === "scheduled" && !d.change_reason.trim()) return void toast.error("اكتب سبب التعديل؛ سيُبلغ به المدعوون");
    setBusy(true);
    const payload = { ...d, starts_at: `${d.date}T${d.time}:00+03:00`, ends_at: `${d.date}T${d.end}:00+03:00`, link: d.mode === "virtual" ? "" : d.link };
    const { data, error } = await db.rpc("adm_meeting_save" as never, { _id: meeting?.id ?? null, _school: meeting ? (owner ? host : null) : host, _d: payload, _rev: meeting?.rev ?? null, _client: meeting ? null : clientId } as never);
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    toast.success(meeting ? (meeting.status === "scheduled" ? "حُفظ التعديل وأُبلغ المدعوون بالسبب" : "حُفظ التعديل") : "حُفظت المسودة — لم تُرسل أي دعوة بعد");
    onDone((data as Row).id);
  }
  const toggle = (id: string, on: boolean) => setD({ ...d, members: on ? [...new Set([...d.members, id])] : d.members.filter((x) => x !== id), minutes_writer: !on && d.minutes_writer === id ? "" : d.minutes_writer });
  const sel = selectCls("w-full");
  const list = (cands.data ?? []).filter((c) => c.user_id !== me);
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
        <div className="flex flex-wrap gap-2">
          <Input aria-label="بحث عن مدعو" placeholder="بحث بالاسم" className="h-9 w-48" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
          {owner && d.scope === "org" && <select aria-label="الفرع" className={selectCls("", true)} value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value, dept: "" })}><option value="">كل الفروع</option>{(schools.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
          <select aria-label="الدور" className={selectCls("", true)} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="">كل الأدوار</option>{Object.entries(STAFF_ROLES).filter(([k]) => k !== "org_owner").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select aria-label="القسم" className={selectCls("", true)} value={f.dept} onChange={(e) => setF({ ...f, dept: e.target.value })}><option value="">كل الأقسام</option>{(depts.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          {list.length > 0 && <Button size="sm" variant="outline" onClick={() => setD({ ...d, members: [...new Set([...d.members, ...list.map((c) => c.user_id)])] })}>إضافة كل النتائج ({list.length})</Button>}
        </div>
        <div className="max-h-48 overflow-y-auto rounded-lg border">
          {cands.isLoading ? <p className="p-2 text-xs text-muted-foreground">جارٍ التحميل…</p> : cands.error ? <p className="p-2 text-xs text-destructive">{arabicError(cands.error)}</p> : !list.length ? <p className="p-2 text-xs text-muted-foreground">لا نتائج مطابقة.</p> : (
            <ul>{list.map((c) => (
              <li key={c.user_id}><label className="flex min-h-10 items-center gap-2 border-b px-2 text-sm last:border-0">
                <input type="checkbox" checked={d.members.includes(c.user_id)} onChange={(e) => toggle(c.user_id, e.target.checked)} />
                <span>{c.full_name}</span><span className="text-xs text-muted-foreground">{roleLabel(c.roles)}{c.dept_name ? ` · ${c.dept_name}` : ""}{d.scope === "org" ? ` · ${c.school_name}` : ""}</span>
              </label></li>
            ))}</ul>
          )}
        </div>
        <div className="rounded-lg bg-muted/50 p-2">
          <p className="mb-1 text-xs font-medium">المختارون ({d.members.length}) — كل شخص يُدعى مرة واحدة ولو تعددت أدواره</p>
          <div className="flex flex-wrap gap-1">{d.members.map((u) => (
            <span key={u} className="flex items-center gap-1 rounded-md border bg-card px-2 py-0.5 text-xs">{byId.get(u)?.full_name ?? "مستخدم غير متاح"}{d.scope === "org" && byId.get(u) ? ` (${byId.get(u)!.school_name})` : ""}
              <button aria-label={`إزالة ${byId.get(u)?.full_name ?? ""}`} onClick={() => toggle(u, false)}><X className="size-3" /></button></span>
          ))}</div>
        </div>
        <p className="text-xs text-muted-foreground">لا يُدرج الطلاب وأولياء الأمور والحسابات الموقوفة. لا تُنشأ مجموعة تواصل يدوية.</p>
      </div>
      <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={d.needs_rsvp} onChange={(e) => setD({ ...d, needs_rsvp: e.target.checked })} />يُطلب من المدعوين القبول أو الاعتذار</label>
      {meeting?.status === "scheduled" && <div className="md:col-span-2"><Label htmlFor="m-reason">سبب التعديل (يُبلغ للمدعوين)</Label><Input id="m-reason" value={d.change_reason} onChange={(e) => setD({ ...d, change_reason: e.target.value })} /></div>}
      <div className="flex gap-2 md:col-span-2"><Button onClick={save} disabled={busy}>{busy ? "جارٍ الحفظ…" : meeting?.status === "scheduled" ? "حفظ التعديل وإبلاغ المدعوين" : "حفظ مسودة"}</Button><Button variant="outline" onClick={onCancel}>إلغاء</Button></div>
    </div>
  );
}
