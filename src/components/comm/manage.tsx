import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ask, askText } from "@/components/confirm";
import { selectCls } from "@/components/ui/native-select";
import { useState } from "react";
import { toast } from "sonner";
import { db, useOptions, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { arabicError, type AppContext } from "@/lib/session";
import { GROUP_TYPE_LABEL, ROLE_AR } from "@/lib/comm";
import { PeoplePicker, usePeopleByIds } from "@/components/people-picker";
import { GroupPanel } from "@/components/comm/group-panel";
import { canCreateGroup } from "@/lib/roles";

const sel = selectCls("w-full");

export function ManageTab({ ctx }: { ctx: AppContext & { schoolId: string } }) {
  const [view, setView] = useState<"groups" | "new" | "settings" | "reports">("groups");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {([["groups", "المجموعات"], ...(canCreateGroup(ctx.role) ? [["new", "إنشاء مجموعة"]] as const : []), ["reports", "البلاغات"], ["settings", "إعدادات التواصل"]] as const).map(([k, l]) => (
          <Button key={k} size="sm" variant={view === k ? "default" : "outline"} onClick={() => setView(k)}>{l}</Button>
        ))}
      </div>
      {view === "groups" && <GroupsList ctx={ctx} />}
      {view === "new" && canCreateGroup(ctx.role) && <GroupWizard ctx={ctx} onDone={() => setView("groups")} />}
      {view === "settings" && <CommSettings schoolId={ctx.schoolId} />}
      {view === "reports" && <Reports ctx={ctx} />}
    </div>
  );
}

function GroupsList({ ctx }: { ctx: AppContext & { schoolId: string } }) {
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["admin-groups", ctx.schoolId, ctx.orgId],
    queryFn: async () => {
      const { data, error } = await db.from("conversations").select("id, title, group_type, membership_mode, status, school_id, created_at").eq("kind", "group").or(`school_id.eq.${ctx.schoolId},and(school_id.is.null,org_id.eq.${ctx.orgId})`).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <EmptyState title="لا توجد مجموعات بعد" hint={canCreateGroup(ctx.role) ? "أنشئ لجنة أو فريق عمل من «إنشاء مجموعة»." : "إنشاء المجموعات لمالك المؤسسة أو مدير المدرسة."} />;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">تظهر لك هنا بيانات المجموعات وأعضاؤها للإدارة. محتوى الرسائل لا يظهر إلا إذا كنت عضوًا فيها.</p>
      {q.data.map((g) => (
        <div key={g["id"]} className="rounded-xl border bg-card">
          <button className="flex w-full flex-wrap items-center gap-2 p-3 text-start" onClick={() => setOpen(open === g["id"] ? null : g["id"])}>
            <span className="flex-1 font-semibold">{g["title"]}</span>
            <span className="text-xs text-muted-foreground">{GROUP_TYPE_LABEL[g["group_type"]]} • {g["membership_mode"] === "derived" ? "مشتقة" : "يدوية"} • {g["school_id"] ? "المدرسة" : "عابرة للفروع"} • {g["status"] === "archived" ? "مؤرشفة" : "نشطة"}</span>
          </button>
          {open === g["id"] && <div className="border-t p-3"><GroupPanel convId={g["id"]} myRole={null} onChanged={() => q.refetch()} /></div>}
        </div>
      ))}
    </div>
  );
}

function GroupWizard({ ctx, onDone }: { ctx: AppContext & { schoolId: string }; onDone: () => void }) {
  const qc = useQueryClient();
  const canCross = ctx.role === "org_owner"; // principals stay inside their own school (server: _can_create_group)
  const [step, setStep] = useState(1);
  const [key] = useState(() => crypto.randomUUID());
  const [v, setV] = useState({ title: "", description: "", scope: "school" as "school" | "org", group_type: "committee", membership_mode: "manual", department: "", post_policy: "all", allow_attachments: true, history_policy: "from_join", expires_at: "", year: "" });
  const [members, setMembers] = useState<string[]>([]);
  const [mods, setMods] = useState<string[]>([]);
  const [owner, setOwner] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const depts = useOptions("departments", "name", ctx.schoolId);
  const years = useOptions("academic_years", "name", ctx.schoolId);
  const schoolScope = v.scope === "school" ? ctx.schoolId : null;
  const picked = usePeopleByIds({ purpose: "group", school: schoolScope, org: ctx.orgId }, [...owner, ...mods, ...members]);
  const nameOf = (id: string) => picked.data?.get(id)?.full_name ?? "—";
  const derivedPreview = useQuery({
    queryKey: ["derived-preview", v.department],
    enabled: v.membership_mode === "derived" && !!v.department,
    queryFn: async () => {
      const { data } = await db.from("teachers").select("full_name, user_id").eq("department_id", v.department).eq("status", "active").not("user_id", "is", null);
      return (data ?? []) as Row[];
    },
  });
  const set = (p: Partial<typeof v>) => setV({ ...v, ...p });
  const steps = ["البيانات", "النطاق والنوع", "الأعضاء", "السياسات", "المعاينة"];
  const needsDept = v.scope === "school" && (v.membership_mode === "derived" || v.group_type === "department");
  const blockReason =
    step === 1 && v.title.trim().length < 2 ? "اكتب اسمًا للمجموعة (حرفان على الأقل)."
    : step === 2 && needsDept && !v.department ? "اختر القسم للعضوية المشتقة."
    : step === 3 && v.membership_mode === "manual" && members.length + mods.length === 0 ? "اختر عضوًا أو مشرفًا واحدًا على الأقل."
    : null;
  const canNext = !blockReason;
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-4">
      <ol className="flex flex-wrap gap-2 text-xs">{steps.map((s, i) => <li key={s} className={`rounded-full px-3 py-1 ${step === i + 1 ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{i + 1}. {s}</li>)}</ol>
      {step === 1 && (
        <div className="grid gap-3">
          <div className="space-y-1"><Label htmlFor="wn">اسم المجموعة</Label><Input id="wn" placeholder="مثال: لجنة الاختبارات" value={v.title} onChange={(e) => set({ title: e.target.value })} /></div>
          <div className="space-y-1"><Label htmlFor="wd">الوصف والغرض</Label><Input id="wd" value={v.description} onChange={(e) => set({ description: e.target.value })} /></div>
        </div>
      )}
      {step === 2 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="ws">النطاق</Label>
            <select id="ws" className={sel} value={v.scope} onChange={(e) => { set({ scope: e.target.value as "school" | "org", membership_mode: "manual" }); setMembers([]); setMods([]); setOwner([]); }}>
              <option value="school">{ctx.schoolName} فقط</option>{canCross && <option value="org">كل فروع {ctx.orgName}</option>}
            </select></div>
          <div className="space-y-1"><Label htmlFor="wt">النوع</Label>
            <select id="wt" className={sel} value={v.group_type} onChange={(e) => set({ group_type: e.target.value })}>{Object.entries(GROUP_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          {v.scope === "school" && (
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="wm">طريقة العضوية</Label>
              <select id="wm" className={sel} value={v.membership_mode} onChange={(e) => set({ membership_mode: e.target.value })}>
                <option value="manual">يدوية: الأشخاص الذين تختارهم، ولا تتغير بتغير أقسامهم</option>
                <option value="derived">مشتقة: معلمو قسم محدد، تتحدث تلقائيًا عند تغير القسم</option>
              </select></div>
          )}
          {(v.membership_mode === "derived" || v.group_type === "department") && v.scope === "school" && (
            <div className="space-y-1"><Label htmlFor="wdp">القسم</Label>
              <select id="wdp" className={sel} value={v.department} onChange={(e) => set({ department: e.target.value })}><option value="">— اختر —</option>{depts.data?.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></div>
          )}
          <div className="space-y-1"><Label htmlFor="wy">ربط بعام دراسي (اختياري)</Label>
            <select id="wy" className={sel} value={v.year} onChange={(e) => set({ year: e.target.value })}><option value="">—</option>{years.data?.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="we">تاريخ انتهاء (اختياري)</Label><Input id="we" type="date" value={v.expires_at} onChange={(e) => set({ expires_at: e.target.value })} /></div>
        </div>
      )}
      {step === 3 && (
        <div className="space-y-4">
          <div><h4 className="mb-1 text-sm font-semibold">المالك (افتراضيًا أنت)</h4><PeoplePicker purpose="group" school={schoolScope} org={ctx.orgId} label="المالك" value={owner} onChange={setOwner} single compact /></div>
          <div><h4 className="mb-1 text-sm font-semibold">المشرفون</h4><PeoplePicker purpose="group" school={schoolScope} org={ctx.orgId} label="المشرفون" exclude={owner} value={mods} onChange={setMods} compact /></div>
          {v.membership_mode === "manual" ? (
            <div><h4 className="mb-1 text-sm font-semibold">الأعضاء</h4><PeoplePicker purpose="group" school={schoolScope} org={ctx.orgId} label="الأعضاء" exclude={[...owner, ...mods]} value={members} onChange={setMembers} /></div>
          ) : (
            <p className="rounded-lg bg-muted p-3 text-sm">الأعضاء يُحسبون تلقائيًا: {derivedPreview.data?.length ?? 0} معلم في القسم حاليًا{derivedPreview.data?.length ? ` (${derivedPreview.data.map((t) => t["full_name"]).join("، ")})` : ""}.</p>
          )}
        </div>
      )}
      {step === 4 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="wp">من ينشر</Label><select id="wp" className={sel} value={v.post_policy} onChange={(e) => set({ post_policy: e.target.value })}><option value="all">كل الأعضاء</option><option value="moderators">المشرفون فقط</option></select></div>
          <div className="space-y-1"><Label htmlFor="wh">ماذا يرى العضو الجديد</Label><select id="wh" className={sel} value={v.history_policy} onChange={(e) => set({ history_policy: e.target.value })}><option value="from_join">الرسائل من تاريخ انضمامه (الافتراضي)</option><option value="full">التاريخ السابق كاملًا</option></select></div>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={v.allow_attachments} onChange={(e) => set({ allow_attachments: e.target.checked })} /> السماح بالمرفقات (النوع والحجم حسب سياسة ملفات المدرسة){v.scope === "org" && " — يُحفظ كل مرفق ضمن فرع رافعه ويتبع سياسته"}</label>
        </div>
      )}
      {step === 5 && (
        <div className="space-y-2 text-sm">
          <p><b>{v.title}</b> — {GROUP_TYPE_LABEL[v.group_type]} — {v.scope === "school" ? ctx.schoolName : `كل فروع ${ctx.orgName}`}</p>
          {v.description && <p className="text-muted-foreground">{v.description}</p>}
          <p>المالك: {owner[0] ? nameOf(owner[0]) : "أنت"} • المشرفون: {mods.map(nameOf).join("، ") || "—"}</p>
          <p>الأعضاء: {v.membership_mode === "derived" ? `مشتقة من القسم (${derivedPreview.data?.length ?? 0} حاليًا)` : `${members.length}: ${members.map(nameOf).join("، ") || "—"}`}</p>
          <p>النشر: {v.post_policy === "all" ? "الجميع" : "المشرفون"} • العضو الجديد يرى: {v.history_policy === "full" ? "التاريخ كاملًا" : "من الانضمام"} • المرفقات: {v.allow_attachments ? "مسموحة" : "لا"}{v.expires_at ? ` • تنتهي ${v.expires_at}` : ""}</p>
        </div>
      )}
      {blockReason && <p className="text-xs text-muted-foreground" role="status">{blockReason}</p>}
      <div className="flex gap-2">
        {step > 1 && <Button variant="outline" onClick={() => setStep(step - 1)}>السابق</Button>}
        {step < 5 ? <Button disabled={!canNext} onClick={() => setStep(step + 1)}>التالي</Button> : (
          <Button disabled={busy} onClick={async () => {
            setBusy(true);
            const { error } = await db.rpc("create_group", {
              _org: ctx.orgId, _school: schoolScope, _title: v.title, _description: v.description, _group_type: v.group_type, _membership_mode: v.membership_mode,
              _department: v.department || null, _post_policy: v.post_policy, _allow_attachments: v.allow_attachments, _history_policy: v.history_policy,
              _expires_at: v.expires_at || null, _year: v.year || null, _members: members, _moderators: mods, _owner: owner[0] ?? null, _request_key: key,
            });
            setBusy(false);
            if (error) return void toast.error(arabicError(error));
            toast.success("أُنشئت المجموعة وأُشعر أعضاؤها");
            qc.invalidateQueries({ queryKey: ["admin-groups"] }); qc.invalidateQueries({ queryKey: ["convs"] });
            onDone();
          }}>{busy ? "جارٍ الإنشاء…" : "تأكيد الإنشاء"}</Button>
        )}
      </div>
    </div>
  );
}

function CommSettings({ schoolId }: { schoolId: string }) {
  const q = useQuery({
    queryKey: ["comm-settings", schoolId],
    queryFn: async () => {
      const { data } = await db.from("comm_settings").select("*").eq("school_id", schoolId).maybeSingle();
      return (data ?? { staff_direct_enabled: true, edit_window_minutes: 15, dept_head_groups: false, family_admin_roles: ["principal", "vice_principal", "student_affairs"] }) as Row;
    },
  });
  const [v, setV] = useState<Row | null>(null);
  const cur = v ?? q.data;
  if (!cur) return <LoadingState />;
  const roles = ["principal", "vice_principal", "student_affairs", "counselor"];
  return (
    <form className="space-y-3 rounded-2xl border bg-card p-4 text-sm" onSubmit={async (e) => {
      e.preventDefault();
      const { error } = await db.from("comm_settings").upsert({ school_id: schoolId, staff_direct_enabled: cur["staff_direct_enabled"], edit_window_minutes: Number(cur["edit_window_minutes"]), dept_head_groups: cur["dept_head_groups"], family_admin_roles: cur["family_admin_roles"], updated_at: new Date().toISOString() });
      if (error) return void toast.error(arabicError(error));
      toast.success("حُفظت إعدادات التواصل"); q.refetch(); setV(null);
    }}>
      <label className="flex items-center gap-2"><input type="checkbox" checked={cur["staff_direct_enabled"]} onChange={(e) => setV({ ...cur, staff_direct_enabled: e.target.checked })} /> السماح بالرسائل الخاصة بين الموظفين (مجموعات العمل تبقى متاحة دائمًا)</label>
      <div className="flex items-center gap-2"><Label htmlFor="ew">مهلة تعديل/حذف الرسالة لصاحبها (دقائق)</Label><Input id="ew" type="number" min={0} max={1440} className="w-24" value={cur["edit_window_minutes"]} onChange={(e) => setV({ ...cur, edit_window_minutes: e.target.value })} /></div>
      <fieldset><legend className="font-medium">الجهات الإدارية التي يستطيع ولي الأمر مراسلتها</legend>
        <div className="mt-1 flex flex-wrap gap-3">{roles.map((r) => (
          <label key={r} className="flex items-center gap-1"><input type="checkbox" checked={(cur["family_admin_roles"] as string[]).includes(r)} onChange={(e) => setV({ ...cur, family_admin_roles: e.target.checked ? [...cur["family_admin_roles"], r] : (cur["family_admin_roles"] as string[]).filter((x) => x !== r) })} />{ROLE_AR[r]}</label>
        ))}</div>
      </fieldset>
      <p className="text-xs text-muted-foreground">سياسة الخصوصية: عضوية الإدارة لا تمنح قراءة المحادثات الخاصة. الاطلاع الاستثنائي الوحيد هو على الرسالة المُبلَّغ عنها عند مراجعة بلاغ، ويُسجَّل في سجل التدقيق.</p>
      <Button size="sm">حفظ</Button>
    </form>
  );
}

function Reports({ ctx }: { ctx: AppContext & { schoolId: string } }) {
  const q = useQuery({
    queryKey: ["reports", ctx.schoolId],
    queryFn: async () => {
      const { data, error } = await db.from("message_reports").select("*").eq("school_id", ctx.schoolId).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  if (!q.data?.length) return <EmptyState title="لا توجد بلاغات" />;
  return <ul className="space-y-2">{q.data.map((r) => <ReportItem key={r["id"]} r={r} onDone={() => q.refetch()} />)}</ul>;
}

function ReportItem({ r, onDone }: { r: Row; onDone: () => void }) {
  const [detail, setDetail] = useState<Row | null>(null);
  const [decision, setDecision] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <li className="rounded-xl border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1">السبب: {r["reason"]}</span>
        <span className="text-xs text-muted-foreground">{new Date(r["created_at"]).toLocaleString("ar")} • {r["status"] === "open" ? "مفتوح" : r["status"] === "resolved" ? "عولج" : "مرفوض"}</span>
      </div>
      {r["decision"] && <p className="mt-1 text-xs">القرار: {r["decision"]}</p>}
      {!detail ? (
        <Button size="sm" variant="outline" className="mt-2" onClick={async () => {
          const { data, error } = await db.rpc("report_detail", { _id: r["id"] });
          if (error) return void toast.error(arabicError(error));
          setDetail((data as Row[])[0] ?? {});
        }}>عرض الرسالة المُبلَّغ عنها (يُسجَّل الاطلاع)</Button>
      ) : (
        <div className="mt-2 space-y-2 rounded-lg bg-muted/50 p-2">
          <p className="text-xs text-muted-foreground">{detail["sender"]} • {detail["conversation_title"]} • {detail["sent_at"] && new Date(detail["sent_at"]).toLocaleString("ar")}{detail["deleted"] ? " • مخفية/محذوفة" : ""}</p>
          <p className="whitespace-pre-wrap">{detail["body"]}</p>
          {r["status"] === "open" && (
            <>
              <Input placeholder="سبب القرار (إلزامي، يُسجل في التدقيق)" aria-label="القرار" value={decision} onChange={(e) => setDecision(e.target.value)} />
              {decision.trim().length < 3 && <p className="text-xs text-muted-foreground" role="status">اكتب سبب القرار قبل اختيار الإجراء.</p>}
              <div className="flex flex-wrap gap-2">
                {[["resolved", true, "إخفاء الرسالة وإغلاق"], ["resolved", false, "إغلاق دون إخفاء"], ["dismissed", false, "رفض البلاغ"]].map(([s, h, l]) => (
                  <Button key={String(l)} size="sm" className="min-h-10" variant={h ? "destructive" : "outline"} disabled={busy || decision.trim().length < 3} onClick={async () => {
                    if (!(await ask(`تأكيد: ${String(l)}؟ لا يمكن تكرار القرار بعد حفظه.`, { destructive: !!h, ok: String(l) }))) return;
                    setBusy(true);
                    const { error } = await db.rpc("decide_report", { _id: r["id"], _status: s, _decision: decision.trim(), _hide: h });
                    setBusy(false);
                    if (error) toast.error(arabicError(error)); else { toast.success("حُفظ القرار وأُبلغ مقدم البلاغ بالنتيجة"); onDone(); }
                  }}>{busy ? "جارٍ الحفظ…" : String(l)}</Button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </li>
  );
}
