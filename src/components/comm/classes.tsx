import { useQuery, useQueryClient } from "@tanstack/react-query";
import { selectCls } from "@/components/ui/native-select";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MessageSquare, Search, Users, X } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { arabicError, type AppContext } from "@/lib/session";
import { Thread } from "@/components/comm/thread";
import { timeLabel } from "@/lib/comm";

/** Subject groups: one automatic group per course (subject + section + year), membership from enrollment and live assignment.
 *  Teachers see a roster beside the group (private chats start from it); students see only their subjects; managers monitor. */
export function ClassesTab({ ctx }: { ctx: AppContext & { schoolId: string } }) {
  const qc = useQueryClient();
  const teacher = ctx.role === "teacher";
  const student = ctx.role === "student";
  const groups = useQuery({
    queryKey: ["class-groups", ctx.schoolId],
    queryFn: async () => {
      const { data, error } = await db.rpc("my_class_groups", { _school: ctx.schoolId });
      if (error) throw error;
      return data as Row[];
    },
  });
  const convs = useQuery({
    queryKey: ["convs", ctx.schoolId],
    queryFn: async () => {
      const { data, error } = await db.rpc("my_conversations", { _school: ctx.schoolId });
      if (error) throw error;
      return data as Row[];
    },
  });
  const [course, setCourse] = useState<string>("");
  const [open, setOpen] = useState<string | null>(null);
  const [roster, setRoster] = useState(false);
  useEffect(() => {
    if (!course && groups.data?.length && !student) setCourse(groups.data[0]!["course_id"]);
  }, [groups.data, course, student]);
  const g = groups.data?.find((x) => x["course_id"] === course);
  useEffect(() => { setOpen(g?.["conversation_id"] ?? null); }, [g?.["conversation_id"]]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = (convs.data ?? []).find((c) => c["id"] === open);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["convs"] }); qc.invalidateQueries({ queryKey: ["roster"] }); qc.invalidateQueries({ queryKey: ["class-groups"] }); };

  if (groups.isLoading) return <LoadingState />;
  if (groups.error) return <ErrorState message={arabicError(groups.error)} />;
  if (!groups.data?.length) return <EmptyState title={student ? "لا توجد مجموعات مواد لك في العام الحالي" : "لا توجد مجموعات مواد في العام الحالي"} hint="تظهر مجموعة المادة تلقائيًا من المقرر المعتمد والتسكين وتكليف المعلم." />;

  if (student && !g) return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {groups.data.map((x) => (
        <li key={x["course_id"]}>
          <button onClick={() => setCourse(x["course_id"])} className="w-full rounded-2xl border bg-card p-4 text-start hover:border-primary">
            <span className="flex items-center gap-2"><span className="flex-1 font-bold">{x["subject"]}</span>
              {x["unread"] > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold leading-4 text-primary-foreground">{x["unread"]}</span>}</span>
            <span className="block text-sm text-muted-foreground">{x["section_label"]}</span>
            <span className="block text-xs text-muted-foreground">المعلم: {x["teachers"] ?? "لم يُكلَّف بعد"}</span>
            <span className="block text-[11px] text-muted-foreground">آخر نشاط: {timeLabel(x["last_at"])}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {student ? <Button size="sm" variant="outline" onClick={() => setCourse("")}>كل موادي</Button> : <>
          <label className="text-sm font-semibold" htmlFor="class-pick">مجموعة المادة</label>
          <select id="class-pick" className={selectCls("min-w-0 max-w-full", true)} value={course} onChange={(e) => setCourse(e.target.value)}>
            {groups.data.map((x) => <option key={x["course_id"]} value={x["course_id"]}>{x["subject"]} — {x["section_label"]}{x["unread"] > 0 ? ` (${x["unread"]})` : ""}</option>)}
          </select></>}
        <span className="text-xs text-muted-foreground">{g?.["subject"]} • {g?.["section_label"]} • {g?.["students"] ?? 0} طالب • المعلم: {g?.["teachers"] ?? "—"}</span>
        {g && current?.["group_type"] === "course" && current["my_role"] !== "member" && <ClassSettings conv={current} onDone={refresh} />}
        {!student && <Button size="sm" variant="outline" className="ms-auto md:hidden" onClick={() => setRoster(true)}><Users className="size-4" /> الطلاب</Button>}
      </div>
      <div className={`grid h-[calc(100vh-18rem)] min-h-[28rem] overflow-hidden rounded-2xl border bg-card ${student ? "" : "md:grid-cols-[1fr_17rem]"}`}>
        <section className="flex min-h-0 min-w-0 flex-col">
          {open && open !== g?.["conversation_id"] && (
            <button className="border-b bg-muted/50 px-3 py-1.5 text-start text-xs text-primary underline" onClick={() => setOpen(g?.["conversation_id"] ?? null)}>العودة إلى مجموعة المادة</button>
          )}
          {current ? <Thread key={current["id"]} conv={current} onBack={() => setOpen(g?.["conversation_id"] ?? null)} onChanged={refresh} />
            : convs.isLoading ? <LoadingState />
            : <div className="p-6"><EmptyState title={teacher ? "مجموعة المادة غير متاحة لك" : "متابعة إدارية"} hint={teacher ? "تأكد من اعتماد تكليفك في هذا المقرر." : "المجموعة منشأة تلقائيًا؛ الإدارة تتابع عضويتها وإعداداتها دون الاطلاع على الرسائل الخاصة."} /></div>}
        </section>
        {!student && (
          <aside className={`${roster ? "fixed inset-0 z-50 flex bg-background" : "hidden"} min-h-0 flex-col border-s md:static md:z-auto md:flex`}>
            <Roster course={course} teacher={teacher} active={open} onOpen={(id) => { setOpen(id); setRoster(false); refresh(); }} onClose={() => setRoster(false)} />
          </aside>
        )}
      </div>
    </div>
  );
}

function Roster({ course, teacher, active, onOpen, onClose }: { course: string; teacher: boolean; active: string | null; onOpen: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const r = useQuery({
    queryKey: ["roster", course],
    enabled: !!course,
    queryFn: async () => {
      const { data, error } = await db.rpc("course_roster", { _course: course });
      if (error) throw error;
      return data as Row[];
    },
  });
  const list = useMemo(() => (r.data ?? []).filter((s) => !q.trim() || String(s["full_name"]).includes(q.trim())), [r.data, q]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b p-3">
        <div className="flex items-center gap-2">
          <h3 className="flex-1 font-bold">طلاب المادة <span className="text-xs font-normal text-muted-foreground">({r.data?.length ?? 0})</span></h3>
          <Button size="icon" variant="ghost" className="md:hidden" aria-label="إغلاق قائمة الطلاب" onClick={onClose}><X className="size-4" /></Button>
        </div>
        <div className="relative">
          <Search className="absolute start-2 top-2.5 size-4 text-muted-foreground" />
          <Input className="ps-8" placeholder="بحث في الطلاب" aria-label="بحث في الطلاب" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {r.isLoading ? <div className="p-3"><LoadingState /></div> : r.error ? <div className="p-3"><ErrorState message={arabicError(r.error)} /></div>
          : !list.length ? <div className="p-3"><EmptyState title={r.data?.length ? "لا نتائج" : "لا يوجد طلاب مسكنون بعد"} /></div> : (
          <ul className="divide-y">
            {list.map((s) => (
              <li key={s["student_id"]} className={`flex items-center gap-2 p-3 text-sm ${active && active === s["conversation_id"] ? "bg-muted" : ""}`}>
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{String(s["full_name"]).slice(0, 1)}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate ${s["unread"] > 0 ? "font-bold" : ""}`}>{s["full_name"]}</span>
                  {!s["has_account"] && <span className="block text-[11px] text-muted-foreground">المراسلة المباشرة غير متاحة حتى تفعيل حسابه</span>}
                </span>
                {s["unread"] > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold leading-4 text-primary-foreground" aria-label="رسائل غير مقروءة">{s["unread"]}</span>}
                {teacher && s["can_message"] && (
                  <Button size="sm" variant="outline" disabled={busy === s["student_id"]} aria-label={`مراسلة الطالب ${s["full_name"]}`} onClick={async () => {
                    setBusy(s["student_id"]);
                    const { data, error } = await db.rpc("start_student_conversation", { _student: s["student_id"] });
                    setBusy(null);
                    if (error) return void toast.error(arabicError(error));
                    onOpen(data as string);
                  }}><MessageSquare className="size-3.5" /> مراسلة</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ClassSettings({ conv, onDone }: { conv: Row; onDone: () => void }) {
  const set = async (patch: Partial<{ post: string; replies: boolean; files: boolean }>) => {
    const { error } = await db.rpc("set_class_group_settings", {
      _conv: conv["id"], _post_policy: patch.post ?? conv["post_policy"], _allow_replies: patch.replies ?? conv["allow_replies"], _allow_attachments: patch.files ?? conv["allow_attachments"],
    });
    if (error) toast.error(arabicError(error)); else { toast.success("حُفظ إعداد المجموعة"); onDone(); }
  };
  return (
    <div className="flex flex-wrap gap-1 text-xs">
      <Button size="sm" variant="ghost" onClick={() => set({ post: conv["post_policy"] === "all" ? "moderators" : "all" })}>{conv["post_policy"] === "all" ? "جعلها لإعلانات المعلمين فقط" : "السماح للطلاب بالنشر"}</Button>
      <Button size="sm" variant="ghost" onClick={() => set({ replies: !conv["allow_replies"] })}>{conv["allow_replies"] ? "إغلاق الردود" : "فتح الردود"}</Button>
      <Button size="sm" variant="ghost" onClick={() => set({ files: !conv["allow_attachments"] })}>{conv["allow_attachments"] ? "منع المرفقات" : "السماح بالمرفقات"}</Button>
    </div>
  );
}
