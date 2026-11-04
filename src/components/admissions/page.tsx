import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3, FileDown, GraduationCap, Plus, Printer, Settings2, UserPlus, Users } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { ErrorState, ForbiddenState, LoadingState, PageHeader, EmptyState } from "@/components/states";
import { SectionLocked } from "@/components/owner-portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { askText } from "@/components/confirm";
import { Field, Pager, Panel, SearchBox, Stat, StatGrid, TableCard, Toolbar, TD, TH, TRC, TR } from "@/components/procurement/ui";
import { exportXlsx, printReport } from "@/lib/export";
import { arabicError, useSession } from "@/lib/session";
import { ACTION, CHANNEL, ENR, OUTCOME, STATUS, hasAdmissions, tone, useAdMe, type AdMe, type Sch } from "@/components/admissions/shared";

export type AdSearch = { tab?: "summary" | "apps" | "students" | "settings"; r?: string; new?: "1"; status?: string; assignee?: string; due?: string; pending?: string; linked?: string };
export function validateAdSearch(s: Record<string, unknown>): AdSearch {
  const str = (k: string) => (typeof s[k] === "string" && s[k] ? { [k]: s[k] as string } : {});
  const tabs = ["summary", "apps", "students", "settings"];
  return { ...(tabs.includes(s["tab"] as string) ? { tab: s["tab"] as NonNullable<AdSearch["tab"]> } : {}), ...str("r"), ...(s["new"] === "1" || s["new"] === 1 ? { new: "1" as const } : {}),
    ...str("status"), ...str("assignee"), ...str("due"), ...str("pending"), ...str("linked") };
}

const fmt = (v: unknown) => (v ? new Date(String(v)).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" }) : "—");
const day = (v: unknown) => (v ? String(v).slice(0, 10) : "—");
const Pill = ({ s }: { s: string }) => <span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-semibold " + tone(s)}>{STATUS[s] ?? s}</span>;
const uniq = (a: Sch[][]) => [...new Map(a.flat().map((s) => [s.id, s])).values()];

export function AdmissionsPage({ sp, go }: { sp: AdSearch; go: (s: AdSearch) => void }) {
  const { active } = useSession();
  const me = useAdMe(active?.orgId ?? null);
  if (!active) return null;
  if (me.isLoading) return <LoadingState />;
  if (me.error) return <ErrorState message={arabicError(me.error)} onRetry={() => void me.refetch()} />;
  if (!me.data?.enabled) return <><PageHeader title="القبول والتسجيل" /><SectionLocked /></>;
  const c = me.data.caps!;
  const canStudents = c.students.length > 0 || !!me.data.owner;
  const canSettings = !!me.data.org_level || c.settings.length > 0;
  if (!hasAdmissions(me.data) && !canStudents) return <ForbiddenState />;
  const tabs: [NonNullable<AdSearch["tab"]>, string, typeof Users][] = [["summary", "الملخص والأعداد", BarChart3], ["apps", "الطلاب المحتملون", UserPlus],
    ...(canStudents ? [["students", "الطلاب الحاليون", GraduationCap] as [NonNullable<AdSearch["tab"]>, string, typeof Users]] : []),
    ...(canSettings ? [["settings", "الإعدادات والربط", Settings2] as [NonNullable<AdSearch["tab"]>, string, typeof Users]] : [])];
  const tab = sp.r || sp.new ? "apps" : sp.tab && tabs.some((t) => t[0] === sp.tab) ? sp.tab : "summary";
  const orgId = active.orgId!;
  let body: React.ReactNode;
  if (sp.r) body = <AppDetail id={sp.r} back={() => go({ tab: "apps" })} />;
  else if (sp.new) body = <NewApp orgId={orgId} schools={c.create} done={(id) => go({ r: id })} cancel={() => go({ tab: "apps" })} />;
  else if (tab === "summary") body = <Summary orgId={orgId} me={me.data} go={go} />;
  else if (tab === "apps") body = <AppList key={JSON.stringify(sp)} orgId={orgId} orgName={active.orgName ?? ""} me={me.data} sp={sp} go={go} />;
  else if (tab === "students") body = <Students orgId={orgId} orgName={active.orgName ?? ""} me={me.data} />;
  else body = <SettingsTab orgId={orgId} />;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow="القبول والتسجيل" title="القبول والتسجيل" desc="مرحلة قبول مستقلة: قبول الطلب لا ينشئ سجل طالب أو حسابًا أو حجز مقعد. إضافة الطالب تتم يدويًا من قسم الطلاب." />
      {!sp.r && !sp.new && (
        <div role="tablist" className="flex flex-wrap gap-1 rounded-xl border bg-card p-1">
          {tabs.map(([k, label, Icon]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => go({ tab: k })}
              className={"flex min-h-9 items-center gap-2 rounded-lg px-4 text-sm " + (tab === k ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted")}><Icon className="size-4" />{label}</button>
          ))}
        </div>
      )}
      {body}
    </div>
  );
}

function Summary({ orgId, me, go }: { orgId: string; me: AdMe; go: (s: AdSearch) => void }) {
  const [school, setSchool] = useState("");
  const schools = uniq([me.caps!.view, me.caps!.view_branch, me.caps!.students]);
  const q = useQuery({ queryKey: ["ad-summary", orgId, school], queryFn: async () => { const { data, error } = await db.rpc("ad_summary", { _org: orgId, _school: school || null }); if (error) throw error; return data as Row; } });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => void q.refetch()} />;
  const d = q.data!;
  const open = (s: AdSearch) => go({ tab: "apps", ...s });
  const K = ({ l, v, s, t }: { l: string; v: unknown; s: AdSearch; t?: "warn" | "danger" }) => (
    <button className="text-start" onClick={() => open(s)}><Stat label={l} value={Number(v ?? 0)} tone={t === "danger" ? "bad" : t === "warn" ? "warn" : "default"} /></button>);
  const st = d["students"] as Row | null;
  return (
    <div className="space-y-4">
      {schools.length > 1 && <Toolbar><Field label="الفرع"><select className={selectCls("w-56", true)} value={school} onChange={(e) => setSchool(e.target.value)}><option value="">كل الفروع ضمن نطاقك</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field></Toolbar>}
      <StatGrid cols={4}>
        <K l="طلبات جديدة" v={d["new"]} s={{ status: "new" }} />
        <K l="غير مسندة" v={d["unassigned"]} s={{ assignee: "none" }} t="warn" />
        <K l="المسندة إليّ" v={d["mine"]} s={{ assignee: "me" }} />
        <K l="جارٍ المتابعة" v={d["following"]} s={{ status: "following" }} />
        <K l="غير مكتملة" v={d["incomplete"]} s={{ status: "incomplete" }} t="warn" />
        <K l="قيد التقييم" v={d["evaluating"]} s={{ status: "evaluating" }} />
        <K l="قائمة انتظار" v={d["waitlist"]} s={{ status: "waitlist" }} />
        <K l="مقبولة" v={d["accepted"]} s={{ status: "accepted" }} />
        <K l="غير مقبولة" v={d["rejected"]} s={{ status: "rejected" }} />
        <K l="متابعات مستحقة اليوم" v={d["due"]} s={{ due: "due" }} t="warn" />
        <K l="متابعات متأخرة" v={d["overdue"]} s={{ due: "overdue" }} t="danger" />
        <K l="مرتبطة بسجل طالب" v={d["linked"]} s={{ linked: "1" }} />
        {me.org_level && <K l="بانتظار تحديد الفرع" v={d["pending_branch"]} s={{ pending: "1" }} t="warn" />}
      </StatGrid>
      <div className="grid gap-4 lg:grid-cols-3">
        {(["by_branch", "by_stage", "by_source"] as const).map((k) => (
          <Panel key={k} title={{ by_branch: "حسب الفرع", by_stage: "حسب المرحلة", by_source: "حسب المصدر" }[k]}>
            <ul className="space-y-1 text-sm">{(d[k] as Row[]).length ? (d[k] as Row[]).map((r) => <li key={r["name"]} className="flex justify-between"><span>{r["name"] === "manual" ? "إضافة يدوية" : r["name"] === "wordpress" ? "نموذج الموقع" : r["name"]}</span><b className="tabular-nums">{r["n"]}</b></li>) : <li className="text-muted-foreground">لا طلبات بعد.</li>}</ul>
          </Panel>
        ))}
      </div>
      <Panel title="أزمنة المعالجة">
        <p className="text-sm">متوسط زمن الاستلام: <b>{d["avg_take_h"] ?? "—"}</b> ساعة · أول تواصل: <b>{d["avg_contact_h"] ?? "—"}</b> ساعة · الوصول للقرار: <b>{d["avg_decide_d"] ?? "—"}</b> يوم</p>
      </Panel>
      {st && (
        <Panel title="الطلاب الحاليون (من سجل الطلاب الأكاديمي)">
          <p className="mb-2 text-xs text-muted-foreground">عدد الطلبات ليس عدد الطلاب: الطلب المقبول لا يُحسب طالبًا ولا يُخصم من السعة.</p>
          <StatGrid cols={4}>
            <Stat label="طالب مسجل" value={Number(st["total"] ?? 0)} />
            <Stat label="مقيدون في العام الحالي" value={Number(st["enrolled"] ?? 0)} />
            <Stat label="سعة الشعب" value={Number(st["missing_capacity"]) > 0 ? "غير مكتملة" : Number(st["capacity"] ?? 0)} hint={Number(st["missing_capacity"]) > 0 ? `${st["missing_capacity"]} شعبة بلا سعة` : undefined} />
            <Stat label="المتبقي" value={Number(st["missing_capacity"]) > 0 ? "—" : Math.max(0, Number(st["capacity"]) - Number(st["enrolled"]))} />
          </StatGrid>
        </Panel>
      )}
    </div>
  );
}

const HEAD = ["رقم الطلب", "الطالب", "ولي الأمر", "الجوال", "الفرع", "المرحلة", "الصف", "الحالة", "المسؤول", "المتابعة", "تاريخ التقديم", "المصدر", "مرتبط بطالب"];
const rowCells = (r: Row) => [r["ref"], r["student_name"], r["guardian_name"], r["guardian_phone"], r["school_name"] ?? "بانتظار تحديد الفرع", r["stage"] ?? "غير محدد", r["grade"] ?? "غير محدد", STATUS[r["status"]] ?? r["status"], r["assignee_name"] ?? "غير مسند", day(r["next_follow"]), day(r["submitted_at"]), r["source"] === "manual" ? "يدوي" : "الموقع", r["student_id"] ? "نعم" : "لا"];

function AppList({ orgId, orgName, me, sp, go }: { orgId: string; orgName: string; me: AdMe; sp: AdSearch; go: (s: AdSearch) => void }) {
  const [q, setQ] = useState(""); const [status, setStatus] = useState(sp.status ?? ""); const [school, setSchool] = useState(""); const [page, setPage] = useState(1);
  const schools = uniq([me.caps!.view, me.caps!.view_branch]);
  const f: Row = { ...(q ? { q } : {}), ...(status ? { status } : {}), ...(school ? { school } : {}), ...(sp.assignee ? { assignee: sp.assignee } : {}), ...(sp.due ? { due: sp.due } : {}), ...(sp.pending ? { pending: "1" } : {}), ...(sp.linked ? { linked: sp.linked } : {}) };
  const list = useQuery({ queryKey: ["ad-list", orgId, f, page], queryFn: async () => { const { data, error } = await db.rpc("ad_list", { _org: orgId, _f: f, _limit: 25, _offset: (page - 1) * 25 }); if (error) throw error; return data as { total: number; rows: Row[] }; } });
  const canExport = me.caps!.export.length > 0 || !!me.org_level;
  async function doExport(kind: "x" | "p") {
    const { data, error } = await db.rpc("ad_list", { _org: orgId, _f: { ...f, export: true }, _limit: 5000, _offset: 0 });
    if (error) { toast.error(arabicError(error)); return; }
    const rows = (data as { rows: Row[] }).rows.map(rowCells);
    const meta = { title: "طلبات القبول", school: orgName, filters: [status && `الحالة: ${STATUS[status] ?? status}`, school && `الفرع: ${schools.find((s) => s.id === school)?.name}`, q && `بحث: ${q}`, sp.assignee && "حسب المسؤول", sp.due && "المتابعات"].filter(Boolean) as string[] };
    if (kind === "x") exportXlsx(meta, HEAD, rows); else printReport(meta, HEAD, rows);
  }
  const chips = [sp.assignee === "me" && "المسندة إليّ", sp.assignee === "none" && "غير مسندة", sp.due === "due" && "متابعات مستحقة", sp.due === "overdue" && "متابعات متأخرة", sp.pending && "بانتظار تحديد الفرع", sp.linked === "1" && "مرتبطة بطالب"].filter(Boolean) as string[];
  return (
    <div className="space-y-3">
      <Toolbar actions={<>
        {canExport && <><Button variant="outline" size="sm" onClick={() => void doExport("x")}><FileDown className="size-4" />Excel</Button><Button variant="outline" size="sm" onClick={() => void doExport("p")}><Printer className="size-4" />PDF</Button></>}
        {me.caps!.create.length > 0 && <Button size="sm" onClick={() => go({ new: "1" })}><Plus className="size-4" />طلب جديد</Button>}
      </>}>
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="الاسم أو الجوال أو رقم الطلب" />
        <Field label="الحالة"><select className={selectCls("w-44", true)} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">الكل</option><option value="open">المفتوحة</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        {schools.length > 1 && <Field label="الفرع"><select className={selectCls("w-44", true)} value={school} onChange={(e) => { setSchool(e.target.value); setPage(1); }}><option value="">الكل</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        {chips.length > 0 && <div className="flex items-center gap-2 text-xs">{chips.map((c) => <span key={c} className="rounded-full bg-primary/10 px-2 py-1 text-primary">{c}</span>)}<button className="underline" onClick={() => go({ tab: "apps" })}>إزالة</button></div>}
      </Toolbar>
      {list.isLoading ? <LoadingState /> : list.error ? <ErrorState message={arabicError(list.error)} /> : !list.data!.rows.length ? <EmptyState title="لا طلبات مطابقة" hint="الطلبات المعروضة هي المسندة إليك أو ضمن فروعك فقط." /> : (
        <TableCard caption={`${list.data!.total} طلب`}>
          <table className="w-full text-sm"><thead><tr>{["رقم الطلب", "الطالب", "ولي الأمر", "الفرع", "المرحلة", "الحالة", "المسؤول", "المتابعة"].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
            <tbody>{list.data!.rows.map((r) => (
              <tr key={r["id"]} className={TRC} onClick={() => go({ r: r["id"] })}>
                <td className={TD}><bdi dir="ltr">{r["ref"]}</bdi></td><td className={TD + " font-semibold"}>{r["student_name"]}{r["student_id"] && <span className="ms-1 text-[11px] text-success">· مرتبط</span>}</td>
                <td className={TD}>{r["guardian_name"] ?? "—"}<div className="text-xs text-muted-foreground"><bdi dir="ltr">{r["guardian_phone"]}</bdi></div></td>
                <td className={TD}>{r["school_name"] ?? <span className="text-warning-foreground">بانتظار تحديد الفرع</span>}</td><td className={TD}>{r["stage"] ?? "غير محدد"}</td>
                <td className={TD}><Pill s={r["status"]} /></td><td className={TD}>{r["assignee_name"] ?? <span className="text-muted-foreground">غير مسند</span>}</td>
                <td className={TD + (r["overdue"] ? " font-semibold text-destructive" : "")}>{day(r["next_follow"])}</td>
              </tr>))}</tbody></table>
          <Pager page={page} total={list.data!.total} size={25} setPage={setPage} />
        </TableCard>
      )}
    </div>
  );
}

function NewApp({ orgId, schools, done, cancel }: { orgId: string; schools: Sch[]; done: (id: string) => void; cancel: () => void }) {
  const [key] = useState(() => crypto.randomUUID());
  const [d, setD] = useState<Row>({ school: schools[0]?.id ?? "" });
  const m = useMutation({ mutationFn: async () => { const { school, ...rest } = d; const { data, error } = await db.rpc("ad_create", { _org: orgId, _school: school, _d: rest, _key: key }); if (error) throw error; return data as string; },
    onSuccess: (id) => { toast.success("أُضيف الطلب"); done(id); }, onError: (e) => toast.error(arabicError(e)) });
  const F = (k: string, l: string, ph?: string) => <Field label={l}><Input value={d[k] ?? ""} placeholder={ph} onChange={(e) => setD({ ...d, [k]: e.target.value })} /></Field>;
  return (
    <Panel title="طلب قبول جديد (إضافة يدوية)">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="الفرع"><select className={selectCls()} value={d["school"]} onChange={(e) => setD({ ...d, school: e.target.value })}>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        {F("student_name", "اسم الطالب *")}{F("guardian_name", "اسم ولي الأمر")}{F("guardian_phone", "جوال ولي الأمر *", "05xxxxxxxx")}{F("email", "البريد الإلكتروني")}
        {F("stage", "المرحلة")}{F("grade", "الصف", "اتركه فارغًا إن لم يُحدد")}{F("year_label", "العام الدراسي", "مثال 1448/1449")}
        <Field label="ملاحظات" className="sm:col-span-2"><Textarea value={d["notes"] ?? ""} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">لا يُنشأ سجل طالب أو حساب أو حجز مقعد من هذا الطلب.</p>
      <div className="mt-3 flex gap-2"><Button disabled={m.isPending} onClick={() => m.mutate()}>حفظ الطلب</Button><Button variant="outline" onClick={cancel}>إلغاء</Button></div>
    </Panel>
  );
}

function AppDetail({ id, back }: { id: string; back: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ad-get", id], queryFn: async () => { const { data, error } = await db.rpc("ad_get", { _id: id }); if (error) throw error; return data as Row; } });
  const [contact, setContact] = useState<Row>({ channel: "call", outcome: "reached" });
  const [linkQ, setLinkQ] = useState("");
  const act = useMutation({
    mutationFn: async ({ action, p }: { action: string; p: Row }) => { const { data, error } = await db.rpc("ad_act", { _id: id, _rev: q.data!["app"]["rev"], _action: action, _p: p, _key: crypto.randomUUID() }); if (error) throw error; return data as Row; },
    onSuccess: (data) => { qc.setQueryData(["ad-get", id], data); void qc.invalidateQueries({ queryKey: ["ad-list"] }); void qc.invalidateQueries({ queryKey: ["ad-summary"] }); toast.success("تم الحفظ"); },
    onError: (e) => { toast.error(arabicError(e)); void q.refetch(); },
  });
  const cands = useQuery({ queryKey: ["ad-cand", id, linkQ], enabled: linkQ.trim().length >= 2 && !!q.data?.["caps"]?.["link"], queryFn: async () => { const { data, error } = await db.rpc("ad_link_candidates", { _id: id, _q: linkQ }); if (error) throw error; return data as Row[]; } });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={back} />;
  const a = q.data!["app"] as Row; const c = q.data!["caps"] as Record<string, boolean>; const ev = q.data!["events"] as Row[];
  const closed = ["accepted", "rejected", "withdrawn", "closed"].includes(a["status"]);
  const run = (action: string, p: Row = {}) => act.mutate({ action, p });
  const withReason = async (action: string, msg: string, p: Row = {}) => { const r = await askText(msg, { required: true }); if (r) run(action, { ...p, reason: r }); };
  const info: [string, React.ReactNode][] = [["الطالب", a["student_name"]], ["ولي الأمر", a["guardian_name"] ?? "—"], ["الجوال", <bdi dir="ltr" key="p">{a["guardian_phone"] ?? "—"}</bdi>], ["البريد", a["email"] ?? "—"],
    ["الفرع", a["school_name"] ?? `بانتظار تحديد الفرع (${a["raw_school"] ?? "—"})`], ["المرحلة", a["stage"] ?? "غير محدد"], ["الصف", a["grade"] ?? "غير محدد"], ["العام الدراسي", a["year_label"] ?? "غير محدد"],
    ["المصدر", a["source"] === "manual" ? "إضافة يدوية" : "نموذج الموقع"], ["تاريخ التقديم", fmt(a["submitted_at"])], ["تاريخ الاستقبال", fmt(a["received_at"])], ["المسؤول", a["assignee_name"] ?? "غير مسند"],
    ["موعد المتابعة", day(a["next_follow"])], ["الربط بسجل طالب", a["student_label"] ?? "غير مرتبط"]];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4">
        <Button variant="ghost" size="sm" onClick={back}>→ الطلبات</Button>
        <h2 className="text-lg font-bold">{a["student_name"]}</h2><bdi dir="ltr" className="text-sm text-muted-foreground">{a["ref"]}</bdi><Pill s={a["status"]} />
        {a["missing"] && <span className="text-sm text-warning-foreground">الناقص: {a["missing"]}</span>}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="بيانات الطلب" className="lg:col-span-2">
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">{info.map(([k, v]) => <div key={k} className="flex gap-2"><dt className="w-28 shrink-0 text-muted-foreground">{k}</dt><dd>{v}</dd></div>)}</dl>
          {a["notes"] && <p className="mt-3 rounded-lg bg-muted/50 p-2 text-sm">ملاحظات الطلب: {a["notes"]}</p>}
          {a["decision_note"] && <p className="mt-2 text-sm">ملاحظة القرار: {a["decision_note"]}</p>}
        </Panel>
        <Panel title="الإجراءات">
          <div className="flex flex-col gap-2">
            {a["status"] === "new" && c["contact"] && <Button size="sm" onClick={() => run("receive")}>استلام الطلب</Button>}
            {!a["assignee"] && c["contact"] && a["school_id"] && <Button size="sm" variant="outline" onClick={() => run("claim")}>إسناده لي</Button>}
            {c["edit"] && !closed && <>
              <select aria-label="تحديث الحالة" className={selectCls("", true)} value="" onChange={async (e) => {
                const s = e.target.value; if (!s) return;
                if (s === "incomplete") { const m = await askText("ما البيانات أو المستندات الناقصة؟", { required: true }); if (m) run("status", { status: s, missing: m }); }
                else if (s === "withdrawn" || s === "closed") void withReason("status", "سبب " + STATUS[s], { status: s });
                else run("status", { status: s });
              }}><option value="">تحديث الحالة…</option>{["following", "incomplete", "evaluating", "waitlist", "withdrawn", "closed"].map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}</select>
            </>}
            {c["decide"] && !closed && <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={async () => { const n = await askText("ملاحظة القرار (اختياري)"); if (n !== null) run("decide", { decision: "accepted", note: n }); }}>قبول</Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => void withReason("decide", "سبب عدم القبول", { decision: "rejected" })}>عدم قبول</Button></div>}
            {closed && (c["edit"] || c["decide"]) && <Button size="sm" variant="outline" onClick={() => void withReason("reopen", "سبب إعادة الفتح")}>إعادة فتح</Button>}
            {c["assign"] && <select aria-label="إسناد" className={selectCls("", true)} value="" onChange={(e) => { if (e.target.value) run("assign", { user: e.target.value === "-" ? null : e.target.value }); }}>
              <option value="">إسناد إلى…</option>{(q.data!["assignees"] as Row[]).map((u) => <option key={u["id"]} value={u["id"]}>{u["name"]}</option>)}<option value="-">إلغاء الإسناد</option></select>}
            {c["transfer"] && <select aria-label="تحويل" className={selectCls("", true)} value="" onChange={(e) => { if (e.target.value) void withReason("transfer", "سبب التحويل", { school: e.target.value }); }}>
              <option value="">تحويل إلى فرع…</option>{(q.data!["branches"] as Row[]).map((s) => <option key={s["id"]} value={s["id"]}>{s["name"]}</option>)}</select>}
            {c["set_branch"] && <select aria-label="تحديد الفرع" className={selectCls("", true)} value="" onChange={(e) => { if (e.target.value) run("set_branch", { school: e.target.value }); }}>
              <option value="">تحديد الفرع…</option>{(q.data!["branches"] as Row[]).map((s) => <option key={s["id"]} value={s["id"]}>{s["name"]}</option>)}</select>}
            {c["edit"] && <Button size="sm" variant="ghost" onClick={async () => {
              const g = await askText("الصف (يُترك فارغًا إن لم يُحدد)"); if (g === null) return; const y = await askText("العام الدراسي"); if (y === null) return;
              run("edit", { grade: g, year_label: y });
            }}>استكمال الصف والعام</Button>}
          </div>
        </Panel>
      </div>
      {c["contact"] && (
        <Panel title="تسجيل تواصل أو متابعة">
          <div className="grid gap-2 sm:grid-cols-4">
            <Field label="الوسيلة"><select className={selectCls("", true)} value={contact["channel"]} onChange={(e) => setContact({ ...contact, channel: e.target.value })}>{Object.entries(CHANNEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="النتيجة"><select className={selectCls("", true)} value={contact["outcome"]} onChange={(e) => setContact({ ...contact, outcome: e.target.value })}>{Object.entries(OUTCOME).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="موعد المتابعة التالية"><Input type="date" className="h-9" value={contact["next_follow"] ?? ""} onChange={(e) => setContact({ ...contact, next_follow: e.target.value })} /></Field>
            <Field label="ملاحظة"><Input className="h-9" value={contact["note"] ?? ""} onChange={(e) => setContact({ ...contact, note: e.target.value })} /></Field>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" disabled={act.isPending} onClick={() => { run("contact", contact); setContact({ channel: "call", outcome: "reached" }); }}>تسجيل التواصل</Button>
            <Button size="sm" variant="outline" onClick={async () => { const n = await askText("ملاحظة داخلية (لا تظهر لأي جهة خارجية)", { required: true }); if (n) run("note", { note: n }); }}>ملاحظة داخلية</Button>
          </div>
        </Panel>
      )}
      {c["link"] && (
        <Panel title="الربط بسجل طالب حالي">
          <p className="mb-2 text-xs text-muted-foreground">بعد إضافة الطالب يدويًا من «الطلاب»، اربطه هنا بعد مراجعة البيانات. الربط لا يغير القرار ولا بيانات الطالب أو حساباته، ولا يتم تلقائيًا.</p>
          <div className="flex flex-wrap gap-2">
            <Input className="h-9 w-64" placeholder="ابحث باسم الطالب في الفرع" value={linkQ} onChange={(e) => setLinkQ(e.target.value)} />
            {a["student_id"] && <Button size="sm" variant="outline" onClick={() => void withReason("unlink", "سبب فك الربط")}>فك الربط</Button>}
          </div>
          <ul className="mt-2 space-y-1 text-sm">{(cands.data ?? []).map((s) => <li key={s["id"]} className="flex items-center gap-2">{s["name"]} {s["national_id"] && <span className="text-xs text-muted-foreground">{s["national_id"]}</span>}
            <Button size="sm" variant="ghost" onClick={async () => { if (a["student_id"]) void withReason("link", "سبب تصحيح الربط", { student: s["id"] }); else run("link", { student: s["id"] }); }}>ربط</Button></li>)}</ul>
        </Panel>
      )}
      <Panel title="الخط الزمني" count={ev.length}>
        <ol className="space-y-2 text-sm">{ev.map((e) => (
          <li key={e["id"]} className="border-s-2 border-primary/30 ps-3">
            <div className="flex flex-wrap gap-2"><b>{ACTION[e["action"]] ?? e["action"]}</b>
              {e["channel"] && <span>{CHANNEL[e["channel"]]} · {OUTCOME[e["outcome"]]}</span>}
              {e["after"]?.["status"] && <span>← {STATUS[e["after"]["status"]]}</span>}
              {e["after"]?.["assignee"] !== undefined && <span>← {e["after"]["assignee"] ?? "غير مسند"}</span>}
              {e["after"]?.["school"] && <span>← {e["after"]["school"]}</span>}
              {e["after"]?.["student"] && <span>← {e["after"]["student"]}</span>}
              {e["after"]?.["next_follow"] && <span>متابعة {e["after"]["next_follow"]}</span>}
              <span className="text-xs text-muted-foreground">{e["actor"] ?? "النظام"} · {fmt(e["at"])}</span></div>
            {e["body"] && <p className="text-muted-foreground">{e["body"]}</p>}
            {e["action"] === "edit" && e["before"] && <p className="text-xs text-muted-foreground">قبل: {Object.entries(e["before"] as Row).filter(([k, v]) => v !== (e["after"] as Row)?.[k]).map(([k, v]) => `${k}=${v ?? "—"}`).join("، ") || "—"}</p>}
          </li>))}</ol>
      </Panel>
    </div>
  );
}

function Students({ orgId, orgName, me }: { orgId: string; orgName: string; me: AdMe }) {
  const [q, setQ] = useState(""); const [school, setSchool] = useState(""); const [status, setStatus] = useState(""); const [page, setPage] = useState(1);
  const f: Row = { ...(q ? { q } : {}), ...(school ? { school } : {}), ...(status ? { status } : {}) };
  const l = useQuery({ queryKey: ["ad-students", orgId, f, page], queryFn: async () => { const { data, error } = await db.rpc("ad_students", { _org: orgId, _f: f, _limit: 25, _offset: (page - 1) * 25 }); if (error) throw error; return data as { total: number; rows: Row[] }; } });
  const H = ["الطالب", "الفرع", "العام", "المرحلة", "الصف", "الشعبة", "حالة القيد", "حساب الدخول", "طلب القبول المرتبط"];
  const cells = (r: Row) => [r["full_name"], r["school_name"], r["year_name"] ?? "—", r["stage_name"] ?? "—", r["grade_name"] ?? "—", r["section_name"] ?? "—", ENR[r["enr_status"] ?? "none"] ?? r["enr_status"], r["has_login"] ? "مفعّل" : "بدون حساب", r["app_ref"] ?? "—"];
  async function exp(kind: "x" | "p") {
    const { data, error } = await db.rpc("ad_students", { _org: orgId, _f: { ...f, export: true }, _limit: 5000, _offset: 0 });
    if (error) { toast.error(arabicError(error)); return; }
    const meta = { title: "الطلاب الحاليون", school: orgName, filters: [q && `بحث: ${q}`, status && `القيد: ${ENR[status]}`].filter(Boolean) as string[] };
    const rows = (data as { rows: Row[] }).rows.map(cells); if (kind === "x") exportXlsx(meta, H, rows); else printReport(meta, H, rows);
  }
  const canExp = me.caps!.export.length > 0 || !!me.owner;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">قراءة فقط من سجل الطلاب الأكاديمي — الإضافة والتعديل من قسم «الطلاب والتسكين» حسب صلاحيتك.</p>
      <Toolbar actions={canExp ? <><Button variant="outline" size="sm" onClick={() => void exp("x")}><FileDown className="size-4" />Excel</Button><Button variant="outline" size="sm" onClick={() => void exp("p")}><Printer className="size-4" />PDF</Button></> : undefined}>
        <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="اسم الطالب" />
        {me.caps!.students.length > 1 && <Field label="الفرع"><select className={selectCls("w-44", true)} value={school} onChange={(e) => { setSchool(e.target.value); setPage(1); }}><option value="">الكل</option>{me.caps!.students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>}
        <Field label="حالة القيد"><select className={selectCls("w-40", true)} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">الكل</option>{Object.entries(ENR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      </Toolbar>
      {l.isLoading ? <LoadingState /> : l.error ? <ErrorState message={arabicError(l.error)} /> : !l.data!.rows.length ? <EmptyState title="لا طلاب مطابقون" /> : (
        <TableCard caption={`${l.data!.total} طالب`}>
          <table className="w-full text-sm"><thead><tr>{H.map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
            <tbody>{l.data!.rows.map((r) => <tr key={r["id"]} className={TR}>{cells(r).map((v, i) => <td key={i} className={TD}>{v}</td>)}</tr>)}</tbody></table>
          <Pager page={page} total={l.data!.total} size={25} setPage={setPage} />
        </TableCard>
      )}
    </div>
  );
}

const FORM_SCHOOLS = ["قناديل الشرق", "أجيال المعالي", "الضاحية (بنات)", "الضاحية (بنين)"];
function SettingsTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ad-settings", orgId], queryFn: async () => { const { data, error } = await db.rpc("ad_settings_get", { _org: orgId }); if (error) throw error; return data as Row; } });
  const [defs, setDefs] = useState<Row | null>(null); const [map, setMap] = useState<Row | null>(null); const [year, setYear] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: async () => { const org = q.data!["org_level"]; const { error } = await db.rpc("ad_settings_save", { _org: orgId, _defaults: defs ?? {}, _school_map: org ? map ?? cur["school_map"] ?? {} : null, _stage_map: null, _year: org ? year ?? cur["year_label"] ?? "" : null }); if (error) throw error; },
    onSuccess: () => { toast.success("حُفظت الإعدادات"); void qc.invalidateQueries({ queryKey: ["ad-settings", orgId] }); }, onError: (e) => toast.error(arabicError(e)) });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <ErrorState message={arabicError(q.error)} />;
  const cur = (q.data!["settings"] ?? {}) as Row; const schools = q.data!["schools"] as Row[];
  const d = defs ?? cur["defaults"] ?? {}; const m = map ?? cur["school_map"] ?? {};
  return (
    <div className="space-y-4">
      <Panel title="المسؤول الافتراضي لكل فرع">
        <p className="mb-2 text-xs text-muted-foreground">تُسند الطلبات الجديدة إليه تلقائيًا؛ عند غيابه أو سحب صلاحيته تبقى في قائمة «غير مسندة». يظهر هنا فقط من يملك صلاحية القبول في الفرع.</p>
        <div className="grid gap-2 sm:grid-cols-2">{schools.map((s) => (
          <Field key={s["id"]} label={s["name"]}><select disabled={!s["editable"]} className={selectCls("", true)} value={d[s["id"]] ?? ""} onChange={(e) => setDefs({ ...d, [s["id"]]: e.target.value })}>
            <option value="">بدون (قائمة غير مسندة)</option>{(s["staff"] as Row[]).map((u) => <option key={u["id"]} value={u["id"]}>{u["name"]}</option>)}</select></Field>))}</div>
      </Panel>
      {q.data!["org_level"] && (
        <Panel title="ربط نموذج الموقع (WordPress)">
          <p className="mb-2 text-xs text-muted-foreground">اربط قيم «المدرسة» في نموذج التسجيل بفروع المؤسسة. القيمة غير المربوطة تُحفظ في «بانتظار تحديد الفرع». أنشئ الربط من «اتصال الموقع» أدناه ثم ثبّت إضافة ركاز في الموقع.</p>
          <div className="grid gap-2 sm:grid-cols-2">{FORM_SCHOOLS.map((k) => (
            <Field key={k} label={`«${k}»`}><select className={selectCls("", true)} value={m[k] ?? ""} onChange={(e) => setMap({ ...m, [k]: e.target.value })}>
              <option value="">غير مربوط</option>{schools.map((s) => <option key={s["id"]} value={s["id"]}>{s["name"]}</option>)}</select></Field>))}
            <Field label="العام الدراسي للطلبات الواردة"><Input className="h-9" placeholder="يُترك فارغًا = غير محدد" value={year ?? cur["year_label"] ?? ""} onChange={(e) => setYear(e.target.value)} /></Field>
          </div>
        </Panel>
      )}
      <Button disabled={save.isPending} onClick={() => save.mutate()}>حفظ الإعدادات</Button>
      {q.data!["org_level"] && <Connections orgId={orgId} />}
    </div>
  );
}

/** Website connections: the signing key is shown once (create/rotate) and never again; the owner pastes it into the WordPress plugin. */
function Connections({ orgId }: { orgId: string }) {
  const l = useQuery({ queryKey: ["ad-sources", orgId], queryFn: async () => { const { data, error } = await db.rpc("ad_source_list", { _org: orgId }); if (error) throw error; return data as Row[]; } });
  const [shown, setShown] = useState<{ id: string; secret: string } | null>(null);
  const endpoint = `${typeof window === "undefined" ? "" : window.location.origin}/api/public/admissions/wordpress`;
  async function create() {
    const n = await askText("اسم الربط (مثال: موقع المالكي)", { required: true }); if (!n) return;
    const { data, error } = await db.rpc("ad_source_create", { _org: orgId, _name: n }); if (error) { toast.error(arabicError(error)); return; }
    setShown(data as { id: string; secret: string }); void l.refetch();
  }
  async function rotate(id: string) {
    const { data, error } = await db.rpc("ad_source_rotate", { _id: id }); if (error) { toast.error(arabicError(error)); return; }
    setShown(data as { id: string; secret: string }); void l.refetch();
  }
  async function toggle(id: string, on: boolean) { const { error } = await db.rpc("ad_source_set_active", { _id: id, _active: on }); if (error) toast.error(arabicError(error)); void l.refetch(); }
  return (
    <Panel title="اتصال الموقع" actions={<Button size="sm" variant="outline" onClick={() => void create()}><Plus className="size-4" />ربط جديد</Button>}>
      <p className="mb-2 text-xs text-muted-foreground">عنوان الاستقبال: <bdi dir="ltr" className="font-mono">{endpoint}</bdi> — يُنشر بعد نشر التطبيق على عنوانه المنشور.</p>
      {shown && (
        <div role="alert" className="mb-3 rounded-xl border border-warning/50 bg-warning/10 p-3 text-sm">
          <p className="font-bold">انسخ القيمتين الآن إلى إعدادات الإضافة — لن يظهر المفتاح مرة أخرى.</p>
          <p>معرّف الربط: <bdi dir="ltr" className="select-all font-mono">{shown.id}</bdi></p>
          <p className="break-all">المفتاح السري: <bdi dir="ltr" className="select-all font-mono">{shown.secret}</bdi></p>
          <Button size="sm" variant="ghost" onClick={() => setShown(null)}>نسختهما — إخفاء</Button>
        </div>
      )}
      {l.isLoading ? <LoadingState /> : !l.data?.length ? <p className="text-sm text-muted-foreground">لا يوجد ربط بعد.</p> : (
        <ul className="divide-y text-sm">{l.data.map((s) => (
          <li key={s["id"]} className="flex flex-wrap items-center gap-2 py-2">
            <b>{s["name"]}</b><span className={s["is_active"] ? "text-success" : "text-muted-foreground"}>{s["is_active"] ? "مفعّل" : "موقوف"}</span>
            <span className="text-muted-foreground">المفتاح {s["secret_hint"]} · وصل {s["received"]} طلب · آخر استقبال {fmt(s["last_seen_at"])}</span>
            {s["last_error"] && <span className="text-destructive">{s["last_error"]}</span>}
            <span className="ms-auto flex gap-1"><Button size="sm" variant="ghost" onClick={() => void rotate(s["id"])}>تغيير المفتاح</Button>
              <Button size="sm" variant="ghost" onClick={() => void toggle(s["id"], !s["is_active"])}>{s["is_active"] ? "إيقاف" : "تفعيل"}</Button></span>
          </li>))}</ul>
      )}
    </Panel>
  );
}
