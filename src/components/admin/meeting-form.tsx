import { useState } from "react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";
import { STAFF_ROLES, riyadhDate, riyadhTime, useStaff } from "@/components/admin/shared";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

/** Create/edit a meeting through adm_meeting_save (organizer only; draft until invitations are sent). Times are Riyadh local. */
export function MeetingForm({ school, me, meeting, members, onDone, onCancel }: { school: string; me: string; meeting?: Row; members?: string[]; onDone: (id: string) => void; onCancel: () => void }) {
  const staff = useStaff(school);
  const [clientId] = useState(() => crypto.randomUUID());
  const [d, setD] = useState({
    title: meeting?.title ?? "", purpose: meeting?.purpose ?? "", date: meeting ? riyadhDate(meeting.starts_at) : "", time: meeting ? riyadhTime(meeting.starts_at) : "",
    duration_min: meeting?.duration_min ?? 60, location: meeting?.location ?? "", link: meeting?.link ?? "", agenda: meeting?.agenda ?? "",
    privacy: meeting?.privacy ?? "normal", needs_rsvp: meeting?.needs_rsvp ?? true, minutes_writer: meeting?.minutes_writer ?? "", members: members ?? ([] as string[]),
  });
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!d.title.trim() || !d.date || !d.time) return void toast.error("أكمل العنوان والتاريخ والوقت");
    setBusy(true);
    const payload = { ...d, starts_at: `${d.date}T${d.time}:00+03:00` };
    const { data, error } = await db.rpc("adm_meeting_save" as never, { _id: meeting?.id ?? null, _school: meeting ? null : school, _d: payload, _rev: meeting?.rev ?? null, _client: meeting ? null : clientId } as never);
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    toast.success(meeting ? (meeting.status === "scheduled" ? "حُفظ التعديل وأُبلغ المدعوون بالتغيير" : "حُفظ التعديل") : "حُفظ الاجتماع كمسودة");
    onDone((data as Row).id);
  }
  const people = (staff.data ?? []).filter((s) => s.user_id !== me && s.role !== "org_owner");
  const sel = selectCls("w-full");
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-2">
      <div className="md:col-span-2"><Label htmlFor="m-title">العنوان</Label><Input id="m-title" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} /></div>
      <div className="md:col-span-2"><Label htmlFor="m-purpose">الغرض</Label><Input id="m-purpose" value={d.purpose} onChange={(e) => setD({ ...d, purpose: e.target.value })} /></div>
      <div><Label htmlFor="m-date">التاريخ</Label><Input id="m-date" type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></div>
      <div><Label htmlFor="m-time">الوقت (توقيت الرياض)</Label><Input id="m-time" type="time" value={d.time} onChange={(e) => setD({ ...d, time: e.target.value })} /></div>
      <div><Label htmlFor="m-dur">المدة بالدقائق</Label><Input id="m-dur" type="number" min={5} max={600} value={d.duration_min} onChange={(e) => setD({ ...d, duration_min: Number(e.target.value) })} /></div>
      <div><Label htmlFor="m-loc">المكان</Label><Input id="m-loc" value={d.location} onChange={(e) => setD({ ...d, location: e.target.value })} /></div>
      <div className="md:col-span-2"><Label htmlFor="m-link">رابط خارجي (اختياري)</Label><Input id="m-link" dir="ltr" placeholder="https://" value={d.link} onChange={(e) => setD({ ...d, link: e.target.value })} /></div>
      <div className="md:col-span-2"><Label htmlFor="m-agenda">جدول الأعمال</Label><Textarea id="m-agenda" value={d.agenda} onChange={(e) => setD({ ...d, agenda: e.target.value })} /></div>
      <div><Label htmlFor="m-priv">الخصوصية</Label>
        <select id="m-priv" className={sel} value={d.privacy} onChange={(e) => setD({ ...d, privacy: e.target.value })}>
          <option value="normal">عادي (تراه إدارة المدرسة)</option><option value="restricted">مقيد (المنظم والمدعوون وكاتب المحضر فقط)</option>
        </select>
      </div>
      <div><Label htmlFor="m-writer">كاتب المحضر</Label>
        <select id="m-writer" className={sel} value={d.minutes_writer} onChange={(e) => setD({ ...d, minutes_writer: e.target.value })}>
          <option value="">أنا (المنظم)</option>{people.filter((s) => d.members.includes(s.user_id)).map((s) => <option key={s.user_id} value={s.user_id}>{s.full_name}</option>)}
        </select>
      </div>
      <div className="md:col-span-2"><Label>المدعوون</Label>
        <div className="mt-1 flex max-h-40 flex-wrap gap-2 overflow-y-auto">
          {people.map((s) => (
            <label key={s.user_id} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
              <input type="checkbox" checked={d.members.includes(s.user_id)} onChange={(e) => setD({ ...d, members: e.target.checked ? [...d.members, s.user_id] : d.members.filter((x) => x !== s.user_id), minutes_writer: !e.target.checked && d.minutes_writer === s.user_id ? "" : d.minutes_writer })} />
              {s.full_name} — {STAFF_ROLES[s.role] ?? s.role}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">لا تُعرض أرقام التواصل. لا تُنشأ مجموعة تواصل تلقائيًا.</p>
      </div>
      <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={d.needs_rsvp} onChange={(e) => setD({ ...d, needs_rsvp: e.target.checked })} />يُطلب من المدعوين القبول أو الاعتذار</label>
      <div className="flex gap-2 md:col-span-2"><Button onClick={save} disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ"}</Button><Button variant="outline" onClick={onCancel}>إلغاء</Button></div>
    </div>
  );
}
