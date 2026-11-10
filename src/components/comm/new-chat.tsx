import { useOwnerInSchool } from "@/lib/owner-scope";
import { useQuery } from "@tanstack/react-query";
import { ask, askText } from "@/components/confirm";
import { selectCls } from "@/components/ui/native-select";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { arabicError, type AppContext } from "@/lib/session";
import { PeoplePicker, usePeopleByIds } from "@/components/people-picker";
import { useXbranch } from "@/components/comm/xbranch";

const sel = selectCls("w-full");

export function NewChatDialog({ ctx, open, onOpenChange, onCreated }: { ctx: AppContext & { schoolId: string }; open: boolean; onOpenChange: (v: boolean) => void; onCreated: (id: string) => void }) {
  const isGuardian = ctx.role === "guardian";
  const isStudent = ctx.role === "student";
  const isTeacher = ctx.role === "teacher";
  const isFamilyAdmin = ["principal", "vice_principal", "student_affairs", "org_owner", "platform_admin"].includes(ctx.role);
  const [mode, setMode] = useState<"family" | "direct">(isGuardian ? "family" : "direct");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>محادثة جديدة</DialogTitle></DialogHeader>
        {!isGuardian && !isStudent && (
          <div className="flex gap-2">
            {isFamilyAdmin && <Button size="sm" variant={mode === "family" ? "default" : "outline"} onClick={() => setMode("family")}>مع ولي أمر</Button>}
            <Button size="sm" variant={mode === "direct" ? "default" : "outline"} onClick={() => setMode("direct")}>مع زميل أو الإدارة</Button>
          </div>
        )}
        {isTeacher && <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">المحادثات الخاصة مع الطلاب وأولياء الأمور متوقفة. التواصل العام عبر «مجموعة الفصل» داخل الفصل الرقمي، والأمور الفردية مع إدارة المدرسة أو الوكيل أو المرشد الطلابي.</p>}
        {isStudent ? <StudentStart onCreated={onCreated} /> : isGuardian ? <GuardianStart ctx={ctx} onCreated={onCreated} /> : mode === "family" && !isTeacher ? <AdminFamilyStart ctx={ctx} onCreated={onCreated} /> : mode === "family" ? <StaffFamilyStart ctx={ctx} teacher={isTeacher} onCreated={onCreated} /> : <DirectStart ctx={ctx} onCreated={onCreated} />}
      </DialogContent>
    </Dialog>
  );
}

async function firstMessage(conv: string, body: string, key: string) {
  if (!body.trim()) return;
  const { error } = await db.rpc("send_message", { _conv: conv, _body: body, _client_id: key });
  if (error) toast.error("فُتحت المحادثة لكن تعذر إرسال الرسالة: " + arabicError(error));
}

function StaffFamilyStart({ ctx, teacher, onCreated }: { ctx: AppContext & { schoolId: string }; teacher: boolean; onCreated: (id: string) => void }) {
  const [student, setStudent] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const students = useQuery({
    queryKey: ["fam-students", ctx.schoolId, teacher],
    queryFn: async () => {
      if (teacher) {
        const { data, error } = await db.rpc("teacher_students", { _school: ctx.schoolId });
        if (error) throw error;
        return (data as Row[]).map((r) => ({ id: r["student_id"], label: `${r["full_name"]} — شعبة ${r["section"]} (${r["subject"]})` }));
      }
      const { data, error } = await db.from("students").select("id, full_name").eq("school_id", ctx.schoolId).eq("status", "active").order("full_name").limit(500);
      if (error) throw error;
      return (data as Row[]).map((r) => ({ id: r["id"], label: r["full_name"] }));
    },
  });
  const uniq = [...new Map((students.data ?? []).map((s) => [s.id, s])).values()];
  const guardians = useQuery({
    queryKey: ["fam-guardians", student, teacher],
    enabled: !!student,
    queryFn: async () => {
      if (teacher) {
        const { data, error } = await db.rpc("family_contacts", { _student: student });
        if (error) throw error;
        return data as Row[];
      }
      const { data, error } = await db.from("student_guardians").select("relationship, guardians(id, full_name, user_id)").eq("student_id", student).eq("verified", true).eq("can_follow", true);
      if (error) throw error;
      return (data as Row[]).filter((r) => r["guardians"]?.user_id).map((r) => ({ guardian_id: r["guardians"].id, full_name: r["guardians"].full_name, relationship: r["relationship"] }));
    },
  });
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="fs">الطالب {teacher && <span className="text-xs text-muted-foreground">(من طلاب تكليفك الساري فقط)</span>}</label>
        {students.isLoading ? <LoadingState /> : !uniq.length ? <EmptyState title="لا يوجد طلاب ضمن تكليفك الساري" /> : (
          <select id="fs" className={sel} value={student} onChange={(e) => { setStudent(e.target.value); setPicked([]); }}>
            <option value="">— اختر الطالب —</option>{uniq.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        )}
      </div>
      {student && (guardians.isLoading ? <LoadingState /> : !guardians.data?.length ? <p className="text-sm text-muted-foreground">لا يوجد ولي أمر موثّق ومخوّل بالمتابعة ولديه حساب لهذا الطالب.</p> : (
        <fieldset className="space-y-1">
          <legend className="text-sm font-medium">المستلمون (اختر صراحة؛ لكل ولي أمر محادثة خاصة مستقلة)</legend>
          {guardians.data.map((g) => (
            <label key={g["guardian_id"]} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={picked.includes(g["guardian_id"])} onChange={() => setPicked((x) => x.includes(g["guardian_id"]) ? x.filter((y) => y !== g["guardian_id"]) : [...x, g["guardian_id"]])} />
              {g["full_name"]} <span className="text-xs text-muted-foreground">({g["relationship"]})</span>
            </label>
          ))}
        </fieldset>
      ))}
      <Textarea aria-label="الرسالة الأولى" placeholder="الرسالة الأولى (اختياري)" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
      <Button disabled={!picked.length || busy} onClick={async () => {
        setBusy(true);
        const { data: auth } = await db.auth.getUser();
        let last = "";
        for (const g of picked) {
          const { data, error } = await db.rpc("start_family_conversation", { _student: student, _guardian: g, _staff_user: auth.user.id });
          if (error) { toast.error(arabicError(error)); continue; }
          last = data; await firstMessage(data, body, picked.length > 1 ? crypto.randomUUID() : key);
        }
        setBusy(false);
        if (last) onCreated(last);
      }}>{busy ? "جارٍ الإنشاء…" : "بدء المحادثة"}</Button>
    </div>
  );
}

/** School administration: choose the guardian first, then which child the conversation is about (each chat is tied to one child). */
function AdminFamilyStart({ ctx, onCreated }: { ctx: AppContext & { schoolId: string }; onCreated: (id: string) => void }) {
  const [guardian, setGuardian] = useState("");
  const [student, setStudent] = useState("");
  const [q, setQ] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const list = useQuery({
    queryKey: ["fam-guardians-admin", ctx.schoolId],
    queryFn: async () => {
      const { data, error } = await db.from("student_guardians")
        .select("student_id, relationship, students!inner(full_name, status), guardians!inner(id, full_name, user_id)")
        .eq("school_id", ctx.schoolId).eq("verified", true).eq("can_follow", true).eq("students.status", "active").not("guardians.user_id", "is", null).limit(2000);
      if (error) throw error;
      const m = new Map<string, { id: string; name: string; kids: { id: string; name: string; rel: string }[] }>();
      for (const r of data as Row[]) {
        const g = r["guardians"]; const e = m.get(g.id) ?? { id: g.id as string, name: g.full_name as string, kids: [] as { id: string; name: string; rel: string }[] };
        e.kids.push({ id: r["student_id"], name: r["students"]?.full_name, rel: r["relationship"] }); m.set(g.id, e);
      }
      return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "ar"));
    },
  });
  const shown = (list.data ?? []).filter((g) => !q.trim() || g.name.includes(q.trim()) || g.kids.some((k) => k.name?.includes(q.trim())));
  const g = list.data?.find((x) => x.id === guardian);
  useEffect(() => { setStudent(g?.kids.length === 1 ? g.kids[0]!.id : ""); }, [guardian]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="fg">ولي الأمر</label>
        <input aria-label="بحث عن ولي أمر" className={sel} placeholder="ابحث باسم ولي الأمر أو الابن…" value={q} onChange={(e) => setQ(e.target.value)} />
        {list.isLoading ? <LoadingState /> : !list.data?.length ? <EmptyState title="لا يوجد أولياء أمور موثّقون لديهم حساب في هذه المدرسة" /> : (
          <select id="fg" className={sel} value={guardian} onChange={(e) => setGuardian(e.target.value)}>
            <option value="">— اختر ولي الأمر —</option>
            {shown.map((x) => <option key={x.id} value={x.id}>{x.name} — {x.kids.map((k) => k.name).join("، ")}</option>)}
          </select>
        )}
      </div>
      {g && g.kids.length > 1 && (
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="fgk">بخصوص أي ابن؟</label>
          <select id="fgk" className={sel} value={student} onChange={(e) => setStudent(e.target.value)}>
            <option value="">— اختر —</option>{g.kids.map((k) => <option key={k.id} value={k.id}>{k.name} ({k.rel})</option>)}
          </select>
        </div>
      )}
      {g && student && <p className="text-xs font-semibold text-primary">بخصوص: {g.kids.find((k) => k.id === student)?.name}</p>}
      <Textarea aria-label="الرسالة الأولى" placeholder="الرسالة الأولى (اختياري)" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
      <Button disabled={!guardian || !student || busy} onClick={async () => {
        setBusy(true);
        const { data: auth } = await db.auth.getUser();
        const { data, error } = await db.rpc("start_family_conversation", { _student: student, _guardian: guardian, _staff_user: auth.user.id });
        if (error) { setBusy(false); return void toast.error(arabicError(error)); }
        await firstMessage(data, body, key);
        setBusy(false); onCreated(data);
      }}>{busy ? "جارٍ الإنشاء…" : "بدء المحادثة"}</Button>
    </div>
  );
}

function GuardianStart({ ctx, onCreated }: { ctx: AppContext & { schoolId: string }; onCreated: (id: string) => void }) {
  const [student, setStudent] = useState("");
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const kids = useQuery({
    queryKey: ["my-kids", ctx.schoolId],
    queryFn: async () => {
      const { data: auth } = await db.auth.getUser();
      const { data, error } = await db.from("student_guardians").select("student_id, guardian_id, students(full_name), guardians!inner(user_id)").eq("school_id", ctx.schoolId).eq("guardians.user_id", auth.user.id).eq("verified", true).eq("can_follow", true);
      if (error) throw error;
      return data as Row[];
    },
  });
  const contacts = useQuery({
    queryKey: ["g-contacts", student],
    enabled: !!student,
    queryFn: async () => {
      const { data, error } = await db.rpc("guardian_contacts", { _student: student });
      if (error) throw error;
      return data as Row[];
    },
  });
  const link = kids.data?.find((k) => k["student_id"] === student);
  // one child → preselected; several → the guardian must choose explicitly
  useEffect(() => { if (kids.data?.length === 1 && !student) setStudent(kids.data[0]!["student_id"]); }, [kids.data, student]);
  // server returns only the permitted administration (incl. the student counselor) of the chosen child's school — never teachers
  const shown = (contacts.data ?? []).filter((c) => c["kind"] === "admin");
  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">التواصل مع المدرسة عبر <b>إدارة المدرسة</b> والمرشد الطلابي. للتواصل مع المعلمين استخدم «مجموعة الفصل» داخل الفصل الافتراضي.</p>
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="gk">الابن/الابنة</label>
        {kids.isLoading ? <LoadingState /> : !kids.data?.length ? <EmptyState title="لا يوجد أبناء موثّقون في هذه المدرسة" /> : (
          <select id="gk" className={sel} value={student} onChange={async (e) => {
            const next = e.target.value;
            if (body.trim() && !(await ask("تغيير الابن يحذف نص الرسالة المكتوب حتى لا يصل لجهة تخص ابنًا آخر. متابعة؟", { ok: "تبديل الابن" }))) return;
            setStudent(next); setTo(""); setBody(""); }}>
            <option value="">— اختر —</option>{kids.data.map((k) => <option key={k["student_id"]} value={k["student_id"]}>{k["students"]?.full_name}</option>)}
          </select>
        )}
      </div>
      {student && (contacts.isLoading ? <LoadingState /> : !shown.length ? <p className="text-sm text-muted-foreground">لا توجد جهة إدارية مسموحة في مدرسة هذا الابن حاليًا.</p> : (
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="gt">إدارة المدرسة</label>
          <select id="gt" className={sel} value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">— اختر —</option>{shown.map((c) => <option key={c["user_id"]} value={c["user_id"]}>{c["full_name"]} — {c["label"]}</option>)}
          </select>
        </div>
      ))}
      {link && <p className="text-xs font-semibold text-primary" aria-live="polite">بخصوص: {link["students"]?.full_name}</p>}
      <Textarea aria-label="الرسالة الأولى" placeholder="الرسالة الأولى (اختياري)" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
      <Button disabled={!to || !link || busy} onClick={async () => {
        setBusy(true);
        const { data, error } = await db.rpc("start_family_conversation", { _student: student, _guardian: link!["guardian_id"], _staff_user: to });
        if (error) { setBusy(false); return void toast.error(arabicError(error)); }
        await firstMessage(data, body, key);
        setBusy(false); onCreated(data);
      }}>{busy ? "جارٍ الإنشاء…" : "بدء التواصل"}</Button>
    </div>
  );
}

/** Student: permitted administration / counselor of the school they are currently enrolled in (server derives the school). */
function StudentStart({ onCreated }: { onCreated: (id: string) => void }) {
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  const contacts = useQuery({
    queryKey: ["student-contacts"],
    queryFn: async () => {
      const { data, error } = await db.rpc("student_contacts");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const school = contacts.data?.[0]?.["school_name"] as string | undefined;
  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">راسل إدارة مدرستك أو المرشد الطلابي. للتواصل مع المعلمين استخدم «مجموعة الفصل» داخل فصلك الافتراضي.</p>
      {contacts.isLoading ? <LoadingState /> : !contacts.data?.length ? <EmptyState title="لا توجد جهة إدارية متاحة في مدرستك حاليًا" /> : (
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="st-to">إدارة المدرسة{school ? ` — ${school}` : ""}</label>
          <select id="st-to" className={sel} value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">— اختر —</option>{contacts.data.map((c) => <option key={c["user_id"]} value={c["user_id"]}>{c["full_name"]} — {c["label"]}</option>)}
          </select>
        </div>
      )}
      <Textarea aria-label="الرسالة الأولى" placeholder="الرسالة الأولى (اختياري)" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
      <Button disabled={!to || busy} onClick={async () => {
        setBusy(true);
        const { data, error } = await db.rpc("start_student_admin_conversation", { _staff: to });
        if (error) { setBusy(false); return void toast.error(arabicError(error)); }
        await firstMessage(data, body, key);
        setBusy(false); onCreated(data);
      }}>{busy ? "جارٍ الإنشاء…" : "بدء التواصل"}</Button>
    </div>
  );
}

function DirectStart({ ctx, onCreated }: { ctx: AppContext & { schoolId: string }; onCreated: (id: string) => void }) {
  const [to, setTo] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  // group owner on the group account: directory of every branch; the chat belongs to the chosen person's branch
  const inSchool = useOwnerInSchool();
  const orgWide = ctx.role === "org_owner" && !inSchool;
  const xb = useXbranch(ctx.orgId);
  const [cross, setCross] = useState(false);
  const csMe = useQuery({ queryKey: ["cs-comm-me", ctx.orgId], queryFn: async () => { const r = await db.rpc("cs_comm_me" as never, { _org: ctx.orgId } as never); return !r.error && r.data === true; } });
  const [cs, setCs] = useState(false);
  const csMode = cs && !!csMe.data;
  const xMode = !csMode && cross && !orgWide && !!xb.data?.me;
  const scope = csMode ? { purpose: "cs_contact" as const, school: null, org: ctx.orgId } : xMode ? { purpose: "xbranch" as const, school: null, org: ctx.orgId } : { purpose: "direct" as const, school: orgWide ? null : ctx.schoolId, org: ctx.orgId };
  const chosen = usePeopleByIds(scope, to);
  const chatSchool = orgWide ? chosen.data?.get(to[0] ?? "")?.school_id : ctx.schoolId;
  return (
    <div className="space-y-3">
      {csMe.data && (
        <div className="flex gap-2">
          <Button size="sm" variant={!cs ? "secondary" : "ghost"} onClick={() => { setCs(false); setTo([]); }}>المراسلة المعتادة</Button>
          <Button size="sm" variant={cs ? "secondary" : "ghost"} onClick={() => { setCs(true); setTo([]); }}>خدمة العملاء — أي مدرسة وأي شخص</Button>
        </div>
      )}
      {csMode && <p className="text-xs text-muted-foreground">ابحث بالاسم واختر الفرع والدور؛ يشمل الموظفين وأولياء الأمور في المدارس المصرح لك بها.</p>}
      {!csMode && !orgWide && xb.data?.me && (
        <div className="flex gap-2">
          <Button size="sm" variant={!cross ? "secondary" : "ghost"} onClick={() => { setCross(false); setTo([]); }}>زملاء هذه المدرسة</Button>
          <Button size="sm" variant={cross ? "secondary" : "ghost"} onClick={() => { setCross(true); setTo([]); }}>زميل في فرع آخر</Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">{xMode ? "ابحث بالاسم واختر الفرع؛ يظهر بجوار كل اسم الدور والفرع. المراسلة لا تمنح وصولًا لبيانات الفرع الآخر." : orgWide ? "الدليل يعرض موظفي جميع فروع المجموعة الساريين، دون أرقام هواتف أو بريد." : "الدليل يعرض موظفي هذه المدرسة الساريين فقط، دون أرقام هواتف أو بريد."}</p>
      <PeoplePicker {...scope} label={csMode ? "الشخص" : "الموظف"} value={to} onChange={setTo} single showBranch={orgWide || xMode || csMode} />
      <Textarea aria-label="الرسالة الأولى" placeholder="الرسالة الأولى (اختياري)" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
      <Button disabled={!to.length || (!xMode && !csMode && !chatSchool) || busy} onClick={async () => {
        setBusy(true);
        const { data, error } = csMode
          ? await db.rpc("cs_start_conversation" as never, { _org: ctx.orgId, _other: to[0] } as never) as unknown as { data: string; error: { message: string } | null }
          : xMode
          ? await db.rpc("start_xbranch_conversation" as never, { _org: ctx.orgId, _other: to[0] } as never) as unknown as { data: string; error: { message: string } | null }
          : await db.rpc("start_direct_conversation", { _school: chatSchool, _other: to[0] });
        if (error) { setBusy(false); return void toast.error(arabicError(error)); }
        await firstMessage(data, body, key);
        setBusy(false); onCreated(data);
      }}>{busy ? "جارٍ الإنشاء…" : "بدء المحادثة"}</Button>
    </div>
  );
}
