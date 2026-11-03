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
import { PeoplePicker } from "@/components/people-picker";

const sel = selectCls("w-full");

export function NewChatDialog({ ctx, open, onOpenChange, onCreated }: { ctx: AppContext & { schoolId: string }; open: boolean; onOpenChange: (v: boolean) => void; onCreated: (id: string) => void }) {
  const isGuardian = ctx.role === "guardian";
  const isTeacher = ctx.role === "teacher";
  const isFamilyAdmin = ["principal", "vice_principal", "student_affairs", "org_owner", "platform_admin"].includes(ctx.role);
  const [mode, setMode] = useState<"family" | "direct">(isGuardian ? "family" : isTeacher ? "family" : "direct");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>محادثة جديدة</DialogTitle></DialogHeader>
        {!isGuardian && (
          <div className="flex gap-2">
            {(isTeacher || isFamilyAdmin) && <Button size="sm" variant={mode === "family" ? "default" : "outline"} onClick={() => setMode("family")}>مع ولي أمر</Button>}
            <Button size="sm" variant={mode === "direct" ? "default" : "outline"} onClick={() => setMode("direct")}>مع زميل أو الإدارة</Button>
          </div>
        )}
        {isGuardian ? <GuardianStart ctx={ctx} onCreated={onCreated} /> : mode === "family" ? <StaffFamilyStart ctx={ctx} teacher={isTeacher} onCreated={onCreated} /> : <DirectStart ctx={ctx} onCreated={onCreated} />}
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

function GuardianStart({ ctx, onCreated }: { ctx: AppContext & { schoolId: string }; onCreated: (id: string) => void }) {
  const [who, setWho] = useState<"teacher" | "admin">("teacher");
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
  const shown = (contacts.data ?? []).filter((c) => c["kind"] === who);
  return (
    <div className="space-y-3">
      <div className="flex gap-2" role="radiogroup" aria-label="جهة التواصل">
        <Button size="sm" variant={who === "teacher" ? "default" : "outline"} onClick={() => { setWho("teacher"); setTo(""); }}>معلمو أبنائي</Button>
        <Button size="sm" variant={who === "admin" ? "default" : "outline"} onClick={() => { setWho("admin"); setTo(""); }}>إدارة المدرسة</Button>
      </div>
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
      {student && (contacts.isLoading ? <LoadingState /> : !shown.length ? <p className="text-sm text-muted-foreground">{who === "teacher" ? "لا يوجد معلمون حاليون متاحون لهذا الابن." : "لا توجد جهة إدارية مسموحة للأسرة حاليًا."}</p> : (
        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="gt">{who === "teacher" ? "معلم الابن الحالي" : "الجهة الإدارية المسموحة"}</label>
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

function DirectStart({ ctx, onCreated }: { ctx: AppContext & { schoolId: string }; onCreated: (id: string) => void }) {
  const [to, setTo] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">الدليل يعرض موظفي هذه المدرسة الساريين فقط، دون أرقام هواتف أو بريد.</p>
      <PeoplePicker purpose="direct" school={ctx.schoolId} org={ctx.orgId} label="الموظف" value={to} onChange={setTo} single />
      <Textarea aria-label="الرسالة الأولى" placeholder="الرسالة الأولى (اختياري)" value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
      <Button disabled={!to.length || busy} onClick={async () => {
        setBusy(true);
        const { data, error } = await db.rpc("start_direct_conversation", { _school: ctx.schoolId, _other: to[0] });
        if (error) { setBusy(false); return void toast.error(arabicError(error)); }
        await firstMessage(data, body, key);
        setBusy(false); onCreated(data);
      }}>{busy ? "جارٍ الإنشاء…" : "بدء المحادثة"}</Button>
    </div>
  );
}
