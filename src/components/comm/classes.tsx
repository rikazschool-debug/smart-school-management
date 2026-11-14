import { askText } from "@/components/confirm";
import { PresenceBadge, usePresenceConv, usePresenceMyConvs, type Presence } from "@/lib/presence";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { selectCls } from "@/components/ui/native-select";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MessageSquare, Search, Settings2, Users, X } from "lucide-react";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { arabicError, type AppContext } from "@/lib/session";
import { Thread } from "@/components/comm/thread";
import { timeLabel } from "@/lib/comm";

/** Section groups: one automatic group per section + year (students, assigned teachers, verified guardians, principal as moderator).
 *  Membership and settings change only through class_group_* RPCs; the principal/owner manages members with recorded reasons. */
export function ClassesTab({ ctx, focus, only }: { ctx: AppContext & { schoolId: string }; focus?: string | undefined; only?: string | undefined }) {
  const qc = useQueryClient();
  const teacher = ctx.role === "teacher";
  const simple = ctx.role === "student" || ctx.role === "guardian";
  const groups = useQuery({
    queryKey: ["class-groups", ctx.schoolId],
    queryFn: async () => {
      const { data, error } = await db.rpc("my_section_groups", { _school: ctx.schoolId });
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
  const [pick, setPick] = useState<string>(only ?? focus ?? "");
  // inside a digital classroom: exactly that class's group (the server still decides membership / principal access)
  const data = useMemo(() => (groups.data ?? []).filter((x) => !only || x["conversation_id"] === only), [groups.data, only]);
  const [open, setOpen] = useState<string | null>(null);
  const [side, setSide] = useState(false);
  useEffect(() => {
    if (!pick && data.length && (!simple || data.length === 1)) setPick(data[0]!["conversation_id"]);
  }, [data, pick, simple]);
  const g = data.find((x) => x["conversation_id"] === pick);
  useEffect(() => { setOpen(g?.["conversation_id"] ?? null); }, [g?.["conversation_id"]]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = (convs.data ?? []).find((c) => c["id"] === open);
  const course = useQuery({
    queryKey: ["section-course", g?.["section_id"]],
    enabled: teacher && !!g,
    queryFn: async () => ((await db.from("courses").select("id").eq("section_id", g!["section_id"]).limit(1)).data?.[0]?.["id"] ?? "") as string,
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["convs"] }); qc.invalidateQueries({ queryKey: ["roster"] }); qc.invalidateQueries({ queryKey: ["class-groups"] }); qc.invalidateQueries({ queryKey: ["cg-members"] }); qc.invalidateQueries({ queryKey: ["people"] }); };

  if (groups.isLoading) return <LoadingState />;
  if (groups.error) return <ErrorState message={arabicError(groups.error)} onRetry={() => groups.refetch()} />;
  if (!data.length) return <EmptyState title={only ? "مجموعة هذا الفصل غير متاحة لك" : "لا توجد مجموعات فصول لك في العام الحالي"} hint="تظهر مجموعة الفصل تلقائيًا من التسكين وتكليف المعلم وعلاقة ولي الأمر الموثقة." />;

  if (simple && !g) return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((x) => (
        <li key={x["conversation_id"]}>
          <button onClick={() => setPick(x["conversation_id"])} className="w-full rounded-2xl border bg-card p-4 text-start hover:border-primary">
            <span className="flex items-center gap-2"><span className="flex-1 font-bold">{x["section_label"]}</span>
              {x["unread"] > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold leading-4 text-primary-foreground">{x["unread"]}</span>}</span>
            {x["children"] && <span className="block text-sm text-primary">أبنائي: {x["children"]}</span>}
            <span className="block text-xs text-muted-foreground">المعلمون: {x["teachers"] ?? "لم يُكلَّف بعد"}</span>
            <span className="block text-[11px] text-muted-foreground">آخر نشاط: {timeLabel(x["last_at"])}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center">
        {only ? null : simple ? (data.length > 1 && <Button size="sm" variant="outline" className="self-start" onClick={() => setPick("")}>← كل المجموعات</Button>) : (
          <div className="min-w-0 sm:w-72">
            <label className="sr-only" htmlFor="class-pick">مجموعة الشعبة</label>
            <select id="class-pick" className={selectCls("w-full font-semibold")} value={pick} onChange={(e) => setPick(e.target.value)}>
              {data.map((x) => <option key={x["conversation_id"]} value={x["conversation_id"]}>{x["section_label"]}{x["unread"] > 0 ? ` (${x["unread"]} جديدة)` : ""}</option>)}
            </select>
          </div>)}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs">
          <span className="rounded-full bg-secondary px-2.5 py-1 font-medium text-secondary-foreground">{g?.["section_label"]}</span>
          {g?.["children"] && <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">أبنائي: {g["children"]}</span>}
          <span className="rounded-full bg-muted px-2.5 py-1">{g?.["students"] ?? 0} طالب • {g?.["members"] ?? 0} عضو</span>
          <span className="rounded-full bg-muted px-2.5 py-1">{POST_LABEL[g?.["post_policy"]] ?? ""}</span>
        </div>
        <div className="flex shrink-0 gap-2">
          {g?.["can_manage"] && current && <ClassSettings conv={current} onDone={refresh} />}
          {!simple && <Button size="sm" variant="outline" className="md:hidden" onClick={() => setSide(true)}><Users className="size-4" /> الأعضاء</Button>}
        </div>
      </div>
      {g && Number(g["members"]) <= 1 && (
        <p role="status" className="rounded-xl border border-dashed bg-muted/40 p-3 text-sm text-muted-foreground">
          لا يوجد أعضاء في هذه المجموعة بعد غير المدير. يُضاف الطلاب والمعلمون وأولياء الأمور تلقائيًا عند اكتمال التسكين والتكليف والعلاقات الموثقة وتجهيز حساباتهم.
        </p>
      )}
      <div className={`grid h-[calc(100dvh-21rem)] min-h-[26rem] overflow-hidden rounded-2xl border bg-card shadow-sm ${simple ? "" : "md:grid-cols-[1fr_19rem]"}`}>
        <section className="flex min-h-0 min-w-0 flex-col">
          {open && open !== g?.["conversation_id"] && (
            <button className="border-b bg-muted/50 px-3 py-1.5 text-start text-xs text-primary underline" onClick={() => setOpen(g?.["conversation_id"] ?? null)}>العودة إلى مجموعة الشعبة</button>
          )}
          {current ? <Thread key={current["id"]} conv={current} onBack={() => setOpen(g?.["conversation_id"] ?? null)} onChanged={refresh} />
            : convs.isLoading ? <LoadingState />
            : <div className="p-6"><EmptyState title={g?.["can_manage"] ? "أنت تدير هذه المجموعة" : "المجموعة غير متاحة لك"} hint={g?.["can_manage"] ? "مدير المدرسة يُضاف مشرفًا تلقائيًا؛ إن لم تظهر الرسائل فأنت تدير من حساب المالك. استخدم إدارة الأعضاء." : "تأكد من اعتماد تكليفك أو علاقتك بالشعبة."} /></div>}
        </section>
        {!simple && g && (
          <aside className={`${side ? "fixed inset-0 z-50 flex bg-background" : "hidden"} min-h-0 flex-col border-s md:static md:z-auto md:flex`}>
            {g["can_manage"] ? <Members conv={g["conversation_id"]} onClose={() => setSide(false)} onChanged={refresh} />
              : <Roster course={course.data ?? ""} teacher={teacher} active={open} onOpen={(id) => { setOpen(id); setSide(false); refresh(); }} onClose={() => setSide(false)} />}
          </aside>
        )}
      </div>
    </div>
  );
}

const POST_LABEL: Record<string, string> = { all: "النشر لجميع الأعضاء", moderators: "النشر للمعلمين والمشرفين فقط", staff_guardians: "النشر للمعلمين والمشرفين وأولياء الأمور" };
const REASON: Record<string, string> = { principal: "مدير المدرسة", teacher: "معلم مكلف", student: "طالب مسكن", guardian: "ولي أمر", manual: "إضافة يدوية" };

function Members({ conv, onClose, onChanged }: { conv: string; onClose: () => void; onChanged: () => void }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const pres = usePresenceConv(conv);
  const m = useQuery({ queryKey: ["cg-members", conv], queryFn: async () => { const { data, error } = await db.rpc("class_group_members", { _conv: conv }); if (error) throw error; return data as Row[]; } });
  const cand = useQuery({ queryKey: ["cg-cand", conv, q], enabled: adding, queryFn: async () => ((await db.rpc("class_group_candidates", { _conv: conv, _q: q })).data ?? []) as Row[] });
  const run = async (fn: string, args: Record<string, unknown>, ok: string) => {
    setBusy(true); const { error } = await db.rpc(fn, { _conv: conv, ...args }); setBusy(false);
    if (error) return void toast.error(arabicError(error));
    toast.success(ok); onChanged(); cand.refetch();
  };
  const active = (m.data ?? []).filter((x) => !x["removed"] && (!q.trim() || String(x["full_name"]).includes(q.trim())));
  const removed = (m.data ?? []).filter((x) => x["removed"]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b p-3">
        <div className="flex items-center gap-2">
          <h3 className="flex-1 font-bold">أعضاء المجموعة <span className="text-xs font-normal text-muted-foreground">({active.length})</span></h3>
          <Button size="sm" variant={adding ? "secondary" : "outline"} onClick={() => setAdding(!adding)}>{adding ? "الأعضاء" : "إضافة موظف"}</Button>
          <Button size="icon" variant="ghost" className="md:hidden" aria-label="إغلاق" onClick={onClose}><X className="size-4" /></Button>
        </div>
        <div className="relative">
          <Search className="absolute start-2 top-2.5 size-4 text-muted-foreground" />
          <Input className="ps-8" placeholder="بحث بالاسم" aria-label="بحث بالاسم" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {adding ? (
          <ul className="divide-y">
            {(cand.data ?? []).map((c) => (
              <li key={c["user_id"]} className="flex items-center gap-2 p-3 text-sm">
                <span className="min-w-0 flex-1"><span className="block truncate">{c["full_name"]}</span><span className="text-[11px] text-muted-foreground">{c["label"]}</span></span>
                <Button size="sm" variant="outline" disabled={busy} onClick={async () => {
                  const r = await askText(`سبب إضافة ${c["full_name"]}`, { required: true });
                  if (r) run("class_group_add_member", { _user: c["user_id"], _reason: r }, "أُضيف العضو");
                }}>إضافة</Button>
              </li>))}
            {cand.data && !cand.data.length && <li className="p-3"><EmptyState title="لا يوجد موظفون متاحون" /></li>}
            <li className="p-3 text-[11px] text-muted-foreground">الطالب وولي الأمر يُضافان تلقائيًا من التسكين والعلاقة الموثقة فقط. العضوية اليدوية تمنح المحادثة فقط.</li>
          </ul>
        ) : m.isLoading ? <div className="p-3"><LoadingState /></div> : m.error ? <div className="p-3"><ErrorState message={arabicError(m.error)} onRetry={() => m.refetch()} /></div> : (
          <ul className="divide-y">
            {active.map((x) => (
              <li key={x["user_id"]} className="space-y-1 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="flex min-w-0 flex-1 items-center gap-2"><span className="truncate font-medium">{x["full_name"]}</span><PresenceBadge compact p={pres.data?.get(x["user_id"])} /></span>
                  {x["role"] === "moderator" && <span className="rounded-full bg-primary/10 px-2 text-[10px] text-primary">مشرف</span>}
                </div>
                <div className="flex flex-wrap gap-1">{(x["reasons"] as string[]).map((r) => <span key={r} className="rounded bg-muted px-1.5 text-[10px]">{REASON[r] ?? r}</span>)}</div>
                {!(x["reasons"] as string[]).includes("principal") && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => run("class_group_set_role", { _user: x["user_id"], _role: x["role"] === "moderator" ? "member" : "moderator" }, "حُفظ الدور")}>{x["role"] === "moderator" ? "إلغاء الإشراف" : "تعيين مشرفًا"}</Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" disabled={busy} onClick={async () => {
                      const r = await askText(`سبب إزالة ${x["full_name"]} من المجموعة`, { required: true });
                      if (r) run("class_group_remove_member", { _user: x["user_id"], _reason: r }, "أُزيل العضو؛ لن تعيده المزامنة");
                    }}>إزالة</Button>
                    {x["overridden"] && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy} onClick={() => run("class_group_restore_auto", { _user: x["user_id"] }, "استُعيدت العضوية التلقائية")}>استعادة التلقائي</Button>}
                  </div>)}
              </li>))}
            {removed.length > 0 && <li className="bg-muted/40 p-2 text-xs font-semibold">أزالهم المدير</li>}
            {removed.map((x) => (
              <li key={"r" + x["user_id"]} className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                <span className="min-w-0 flex-1"><span className="block truncate">{x["full_name"]}</span><span className="text-[11px]">السبب: {x["override_reason"]}</span></span>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => run("class_group_restore_auto", { _user: x["user_id"] }, "أُعيد العضو")}>إعادة</Button>
              </li>))}
          </ul>
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
          <h3 className="flex-1 font-bold">طلاب الشعبة <span className="text-xs font-normal text-muted-foreground">({r.data?.length ?? 0})</span></h3>
          <Button size="icon" variant="ghost" className="md:hidden" aria-label="إغلاق قائمة الطلاب" onClick={onClose}><X className="size-4" /></Button>
        </div>
        <div className="relative">
          <Search className="absolute start-2 top-2.5 size-4 text-muted-foreground" />
          <Input className="ps-8" placeholder="بحث في الطلاب" aria-label="بحث في الطلاب" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {r.isLoading ? <div className="p-3"><LoadingState /></div> : r.error ? <div className="p-3"><ErrorState message={arabicError(r.error)} onRetry={() => r.refetch()} /></div>
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
                {false && teacher && s["can_message"] && (
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
  const [busy, setBusy] = useState(false);
  const run = async (patch: Partial<{ post: string; replies: boolean; files: boolean }>) => { setBusy(true); await set(patch); setBusy(false); };
  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild><Button size="sm" variant="outline" disabled={busy}><Settings2 className="size-4" /> إعدادات المجموعة</Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">من يستطيع النشر</DropdownMenuLabel>
        {Object.entries(POST_LABEL).map(([k, l]) => <DropdownMenuCheckboxItem key={k} checked={conv["post_policy"] === k} onCheckedChange={() => run({ post: k })}>{l}</DropdownMenuCheckboxItem>)}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={!!conv["allow_replies"]} onCheckedChange={(v) => run({ replies: v })}>السماح بالردود</DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem checked={!!conv["allow_attachments"]} onCheckedChange={(v) => run({ files: v })}>السماح بالمرفقات</DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-[11px] text-muted-foreground">العضوية تلقائية من التسكين والتكليف والعلاقات، مع قرارات المدير.</p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
