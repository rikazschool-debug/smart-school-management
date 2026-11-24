import { Fragment, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bus, Clock, Pencil, Trash2, Wallet } from "lucide-react";
import { SF_KEY, TRANSPORT_LABEL, money, num } from "@/lib/student-finance/labels";
import { formatAcademicYear } from "@/lib/academic-year";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { ask, askText } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { ErrorState, LoadingState } from "@/components/states";
import { db, type Row } from "@/components/crud-page";
import { KIND_ONE, TagChip, pp, useTags, type PersonKind, type Tag } from "./shared";

type Note = { id: string; body: string; school: string | null; by: string; at: string; edited: boolean; updated_at: string; can_edit: boolean };
type Ev = { at: string; type: string; title: string; by: string; status: string; link?: string };
type Card = {
  kind: PersonKind; id: string; full_name: string; display_name: string | null; status: string | null;
  schools: { id: string; name: string }[]; has_login: boolean; account: { school: string; role: string; active: boolean }[] | null;
  categories: { school: string; title: string | null; category: string | null }[] | null;
  tags: { id: string; name: string; color: string }[]; notes: Note[] | null; events: Ev[];
  caps: { notes_view: boolean; notes_add: boolean; note_schools: { id: string; name: string }[]; tags_assign: boolean };
};
const STATUS: Record<string, string> = { active: "نشط", inactive: "موقوف", ended: "منتهي الخدمة", suspended: "موقوف", graduated: "متخرج", transferred: "منقول" };
const EV_TITLE: Record<string, string> = { student_placement: "تسكين الطالب", account_setup_completed: "إكمال خطوة الدخول الأولى", account_staged: "تجهيز حساب الدخول", account_created: "إنشاء حساب الدخول", guardian_link: "ربط ولي أمر", student_transfer: "نقل الطالب" };
const when = (s: string) => new Date(s).toLocaleString("ar-SA-u-nu-latn", { dateStyle: "medium", timeStyle: "short" });

/** Side card for one person. Everything shown comes from pp_card, which applies the viewer's scope on the server. */
export function PersonCard({ kind, id, org, onClose }: { kind: PersonKind; id: string | null; org: string | null | undefined; onClose: () => void }) {
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="left" dir="rtl" className="w-full overflow-y-auto sm:max-w-md">
        {id && <Body kind={kind} id={id} org={org} />}
      </SheetContent>
    </Sheet>
  );
}

function Body({ kind, id, org }: { kind: PersonKind; id: string; org: string | null | undefined }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["pp-card", kind, id], queryFn: () => pp<Card>("pp_card", { _kind: kind, _id: id }) });
  const c = q.data;
  const tags = useTags(org, !!c?.caps.tags_assign);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["pp-card", kind, id] }); void qc.invalidateQueries({ queryKey: ["pp-tag-ids"] }); void qc.invalidateQueries({ queryKey: ["pp-row-tags"] }); };
  if (q.isLoading) return <LoadingState />;
  if (q.error || !c) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const free = (tags.data ?? []).filter((t: Tag) => t.active && t.kinds.includes(kind) && !c.tags.some((x) => x.id === t.id));
  async function tag(t: string, on: boolean) {
    try { await pp("pp_tag_set", { _kind: kind, _id: id, _tag: t, _on: on }); refresh(); } catch (e) { toast.error(arabicError(e)); }
  }
  return (
    <div className="space-y-4">
      <SheetHeader className="text-start">
        <SheetTitle>{c.display_name || c.full_name}</SheetTitle>
        <SheetDescription>{c.full_name} · {KIND_ONE[kind]}{c.status ? ` · ${STATUS[c.status] ?? c.status}` : ""}</SheetDescription>
      </SheetHeader>
      {kind === "student" && <FinanceSummary id={id} />}

      <section className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
        <h3 className="text-sm font-bold">البيانات الأساسية</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
          <dt className="text-muted-foreground">المدرسة</dt><dd className="font-medium">{c.schools.map((s) => s.name).join("، ") || "—"}</dd>
          {c.categories?.map((x, i) => <Fragment key={i}><dt className="text-muted-foreground">{x.school}</dt><dd>{x.category ?? "بلا تصنيف"}{x.title ? ` — ${x.title}` : ""}</dd></Fragment>)}
          {kind === "student" && <StudyInfo id={id} />}
          <dt className="text-muted-foreground">حساب الدخول</dt>
          <dd><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${c.has_login && c.account?.some((a) => a.active) !== false ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{!c.has_login ? "غير مرتبط" : c.account?.length ? c.account.map((a) => `${a.active ? "نشط" : "موقوف"}`).join("، ") : "مرتبط"}</span></dd>
        </dl>
        <p className="text-xs text-muted-foreground">حالة الحساب مستقلة عن حالة السجل؛ إيقاف الدخول لا ينهي الخدمة ولا يسحب التسجيل.</p>
        <div className="flex flex-wrap gap-2 text-xs">
          {kind === "employee" && <Link className="text-primary hover:underline" to="/app/hr">الملف في الموارد البشرية</Link>}
          {kind === "teacher" && <Link className="text-primary hover:underline" to="/app/teachers">سجل المعلمين</Link>}
          {kind === "student" && <Link className="text-primary hover:underline" to="/app/students">سجل الطلاب</Link>}
          {kind === "guardian" && <Link className="text-primary hover:underline" to="/app/guardians">سجل أولياء الأمور</Link>}
        </div>
      </section>

      {(kind === "guardian" || kind === "student") && <Relations kind={kind} id={id} />}

      <section className="space-y-2 rounded-2xl border bg-card p-4">
        <h3 className="text-sm font-bold">الوسوم <span className="text-xs font-normal text-muted-foreground">(داخلية لا تظهر لصاحب الحساب)</span></h3>
        <div className="flex flex-wrap gap-1">
          {c.tags.length ? c.tags.map((t) => <TagChip key={t.id} t={t} onRemove={c.caps.tags_assign ? async () => { if (await ask(`إزالة الوسم «${t.name}»؟`)) void tag(t.id, false); } : undefined} />) : <span className="text-xs text-muted-foreground">لا وسوم</span>}
        </div>
        {c.caps.tags_assign && free.length > 0 && (
          <select aria-label="إسناد وسم" className={selectCls("w-full")} value="" onChange={(e) => e.target.value && void tag(e.target.value, true)}>
            <option value="">+ إسناد وسم…</option>
            {free.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {c.caps.tags_assign && tags.isSuccess && free.length === 0 && c.tags.length === 0 && (
          <p className="text-xs text-muted-foreground">لا توجد وسوم مخصّصة لهذا النوع بعد. يضيفها مالك المؤسسة من صفحة المدارس ← قاموس الوسوم.</p>
        )}
      </section>

      {c.caps.notes_view && <Notes c={c} kind={kind} id={id} onChange={refresh} />}

      <section className="space-y-2 rounded-2xl border bg-card p-4">
        <h3 className="flex items-center gap-1 text-sm font-bold"><Clock className="size-4" /> سجل الأحداث</h3>
        {c.events.length === 0 ? <p className="text-xs text-muted-foreground">لا أحداث متاحة لك.</p> : (
          <ol className="space-y-2 border-s ps-3">
            {c.events.map((e, i) => (
              <li key={i} className="text-sm">
                <div className="font-medium">{e.link ? <Link className="text-primary hover:underline" to={e.link}>{EV_TITLE[e.title] ?? e.title}</Link> : (EV_TITLE[e.title] ?? e.title)}</div>
                <div className="text-xs text-muted-foreground">{when(e.at)} · {e.by}{e.status ? ` · ${e.status}` : ""}</div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Notes({ c, kind, id, onChange }: { c: Card; kind: PersonKind; id: string; onChange: () => void }) {
  const [body, setBody] = useState("");
  const [school, setSchool] = useState(c.caps.note_schools[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    try { await pp("pp_note_add", { _kind: kind, _id: id, _school: school || null, _body: body }); setBody(""); toast.success("أُضيفت الملاحظة"); onChange(); }
    catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  async function edit(n: Note) {
    const v = await askText("تعديل الملاحظة (يُحفظ النص السابق في السجل)", { initial: n.body, long: true, ok: "حفظ" });
    if (v == null) return;
    try { await pp("pp_note_edit", { _note: n.id, _body: v }); onChange(); } catch (e) { toast.error(arabicError(e)); }
  }
  async function remove(n: Note) {
    const r = await askText("سبب إزالة الملاحظة", { ok: "إزالة", required: true });
    if (r == null) return;
    try { await pp("pp_note_edit", { _note: n.id, _body: null, _remove: true, _reason: r }); onChange(); } catch (e) { toast.error(arabicError(e)); }
  }
  return (
    <section className="space-y-2 rounded-2xl border bg-card p-4">
      <h3 className="text-sm font-bold">ملاحظات داخلية <span className="text-xs font-normal text-muted-foreground">(للإدارة فقط)</span></h3>
      {c.caps.notes_add && (
        <div className="space-y-2 rounded-lg border p-2">
          <Textarea aria-label="نص الملاحظة" rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="اكتب ملاحظة داخلية…" />
          <div className="flex gap-2">
            {c.caps.note_schools.length > 1 && (
              <select aria-label="مدرسة الملاحظة" className={selectCls("flex-1")} value={school} onChange={(e) => setSchool(e.target.value)}>
                {c.caps.note_schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
            <Button size="sm" disabled={busy || !body.trim()} onClick={() => void add()}>إضافة</Button>
          </div>
        </div>
      )}
      {(c.notes ?? []).length === 0 ? <p className="text-xs text-muted-foreground">لا ملاحظات.</p> : (
        <ul className="space-y-2">
          {c.notes!.map((n) => (
            <li key={n.id} className="rounded-lg border bg-muted/30 p-2 text-sm">
              <p className="whitespace-pre-wrap">{n.body}</p>
              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <span className="flex-1">{n.by} · {when(n.at)}{n.school ? ` · ${n.school}` : ""}{n.edited ? " · معدّلة" : ""}</span>
                {n.can_edit && <>
                  <Button variant="ghost" size="icon" className="size-7" aria-label="تعديل الملاحظة" onClick={() => void edit(n)}><Pencil className="size-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="size-7" aria-label="إزالة الملاحظة" onClick={() => void remove(n)}><Trash2 className="size-3.5 text-destructive" /></Button>
                </>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Opens the side card from screens that are not CrudTable lists (e.g. an HR employee file). */
export function PersonCardButton({ kind, id, org, label = "البطاقة والملاحظات" }: { kind: PersonKind; id: string; org: string | null | undefined; label?: string }) {
  const [open, setOpen] = useState(false);
  return (<>
    <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>{label}</Button>
    <PersonCard kind={kind} id={open ? id : null} org={org} onClose={() => setOpen(false)} />
  </>);
}

const REL: Record<string, string> = { father: "الأب", mother: "الأم", brother: "الأخ", sister: "الأخت", other: "أخرى" };
/** Linked children (guardian card) or linked guardians (student card); read through the viewer's RLS. */
function Relations({ kind, id }: { kind: "guardian" | "student"; id: string }) {
  const g = kind === "guardian";
  const q = useQuery({ queryKey: ["pp-rel", kind, id], queryFn: async () => {
    const sel = g ? "id, relationship, can_follow, can_pickup, verified, students(id, full_name, national_id, csmart_no, status, gender, enrollments(status, sections(name, grades(name, stages(name)))))" : "id, relationship, can_follow, can_pickup, verified, guardians(id, full_name, national_id, phone, email, user_id)";
    const { data, error } = await db.from("student_guardians").select(sel).eq(g ? "guardian_id" : "student_id", id);
    if (error) throw error; return data as unknown as Row[];
  } });
  const F = ({ k, v, ltr }: { k: string; v: unknown; ltr?: boolean }) => <div><span className="block text-[11px] text-muted-foreground">{k}</span><span className="font-medium" dir={ltr ? "ltr" : undefined}>{(v as string) || "—"}</span></div>;
  return (
    <section className="space-y-2 rounded-2xl border bg-card p-4">
      <h3 className="text-sm font-bold">{g ? "الأبناء المرتبطون" : "أولياء الأمور المرتبطون"} {q.data && <span className="text-xs font-normal text-muted-foreground">({q.data.length})</span>}</h3>
      {q.isLoading ? <p className="text-xs text-muted-foreground">جارٍ التحميل…</p> : q.error ? <p className="text-xs text-destructive">{arabicError(q.error)}</p> : !q.data?.length ? <p className="text-xs text-muted-foreground">{g ? "لا يوجد أبناء مرتبطون." : "لا يوجد ولي أمر مرتبط."}</p> : (
        <ul className="space-y-2">{q.data.map((l) => {
          const flags = <div className="flex flex-wrap gap-1 text-[11px]"><span className="rounded-full bg-muted px-2 py-0.5">{REL[l["relationship"]] ?? l["relationship"] ?? "—"}</span>{l["verified"] && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">موثّق</span>}{l["can_follow"] && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">متابعة</span>}{l["can_pickup"] && <span className="rounded-full bg-secondary px-2 py-0.5">استلام</span>}</div>;
          if (g) { const s = l["students"] ?? {}; const e = (s["enrollments"] as Row[] | undefined)?.find((x) => x["status"] === "active"); const sec = e?.["sections"];
            return <li key={l["id"]} className="space-y-2 rounded-lg border p-3 text-sm"><div className="font-bold">{s["full_name"]}</div>{flags}<div className="grid grid-cols-2 gap-2 text-xs"><F k="المرحلة" v={sec?.grades?.stages?.name} /><F k="الصف" v={sec?.grades?.name} /><F k="الشعبة" v={sec?.name ?? (e ? "" : "غير مسكّن")} /><F k="الحالة" v={STATUS[s["status"]] ?? s["status"]} /><F k="الهوية" v={s["national_id"]} ltr /><F k="رقم C‑Smart" v={s["csmart_no"]} ltr /></div></li>; }
          const p = l["guardians"] ?? {};
          return <li key={l["id"]} className="space-y-2 rounded-lg border p-3 text-sm"><div className="font-bold">{p["full_name"]}</div>{flags}<div className="grid grid-cols-2 gap-2 text-xs"><F k="الهوية" v={p["national_id"]} ltr /><F k="الجوال" v={p["phone"]} ltr /><F k="البريد" v={p["email"]} ltr /><F k="الحساب" v={p["user_id"] ? "له حساب" : "بلا حساب"} /></div></li>;
        })}</ul>)}
    </section>
  );
}

/** Quick fee summary from sf_get (server balances only); hidden when the viewer has no finance access. */
function FinanceSummary({ id }: { id: string }) {
  // Current academic year of the student's branch + previous balances carried into it (same sf_get as the finance tab).
  const q = useQuery({ queryKey: [...SF_KEY, "student-card", id], queryFn: async () => {
    const st = await db.from("students").select("school_id").eq("id", id).maybeSingle(); if (st.error) throw st.error;
    const y = st.data ? await db.from("academic_years").select("id").eq("school_id", st.data["school_id"]).order("is_current", { ascending: false }).order("start_date", { ascending: false }).limit(1).maybeSingle() : null;
    const { data, error } = await db.rpc("sf_get", { _student: id, _year: y?.data?.["id"] ?? null }); if (error) throw error; return data as { summary: Record<string, Row>; previous?: { obligation: { balance: Row } }[]; transport?: Row[]; obligations?: Row[] }; }, retry: false });
  if (q.isLoading || q.error || !q.data) return null;
  const a = q.data.summary["annual"] ?? {}; const net = num(a["net"]), paid = num(a["recorded"]);
  const prev = (q.data.previous ?? []).reduce((s, p) => s + num(p.obligation.balance["remaining"]), 0); const rem = num(a["remaining"]) + prev;
  const pct = net > 0 ? Math.min(100, Math.round((paid * 100) / net)) : 0;
  return <section className="space-y-3 rounded-2xl border bg-card p-4">
    <h3 className="flex items-center gap-1 text-sm font-bold"><Wallet className="size-4" /> ملخص الرسوم</h3>
    <div className="grid grid-cols-3 gap-2 text-center">
      {([["الرسوم الحالية", net, ""], ["المسدد", paid, "text-primary"], ["المتبقي", rem, rem > 0 ? "text-destructive" : "text-primary"]] as const).map(([l, v, c]) => (
        <div key={l} className="rounded-xl bg-muted/50 p-2"><div className="text-[11px] text-muted-foreground">{l}</div><div className={`mt-0.5 text-sm font-bold tabular-nums ${c}`}>{money(v)}</div></div>))}
    </div>
    <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
    <p className="text-xs text-muted-foreground">{net > 0 ? `سُدد ${pct}% من رسوم العام الحالي` : "لم تُنشأ رسوم العام الحالي لهذا الطالب بعد"}{prev > 0 ? ` · المتبقي يشمل رصيدًا سابقًا ${money(prev)}` : ""}</p>
    <BusStatus transport={q.data.transport ?? []} obligations={q.data.obligations ?? []} />
  </section>;
}

/** Current placement (year, stage, grade, section) read through the viewer's own access to enrollments. */
function StudyInfo({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["pp-study", id], queryFn: async () => {
    const r = await db.from("enrollments").select("status, start_date, academic_years(name), sections(name, grades(name, stages(name)))").eq("student_id", id).order("status", { ascending: true }).order("start_date", { ascending: false }).limit(1).maybeSingle();
    if (r.error) throw r.error; return r.data as Row | null; }, retry: false });
  if (q.isLoading) return null;
  const e = q.data; const sec = e?.["sections"]; const gr = sec?.["grades"];
  const items: [string, string][] = e ? [["العام الدراسي", e["academic_years"]?.["name"] ? formatAcademicYear(String(e["academic_years"]["name"])) : "—"], ["المرحلة", gr?.["stages"]?.["name"] ?? "—"], ["الصف", gr?.["name"] ?? "—"], ["الفصل (الشعبة)", sec?.["name"] ?? "—"]] : [["التسكين", "غير مسكّن"]];
  if (e && e["status"] !== "active") items.push(["حالة التسكين", "منتهٍ"]);
  return <>{items.map(([l, v]) => <Fragment key={l}><dt className="text-muted-foreground">{l}</dt><dd className="font-medium">{v}</dd></Fragment>)}</>;
}

/** Bus subscription per term from sf_get, laid out like the tuition summary: type, bus, three amount boxes, progress bar. */
function BusStatus({ transport, obligations }: { transport: Row[]; obligations: Row[] }) {
  const live = transport.filter((t) => t["active"] || t["exempt"]);
  if (!live.length) return <p className="rounded-xl bg-muted/50 p-2 text-xs text-muted-foreground">النقل المدرسي: غير مشترك في الباص</p>;
  return <div className="space-y-3 border-t pt-3">
    <h4 className="flex items-center gap-1 text-sm font-bold"><Bus className="size-4" /> رسوم الباص <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">مشترك</span></h4>
    {[...live].sort((a, b) => num(a["term"]) - num(b["term"])).map((t) => {
      const o = obligations.find((x) => x["kind"] === "transport" && x["term"] === t["term"] && x["status"] !== "void"); const b = o?.["balance"] ?? {};
      const net = num(b["net"]), paid = num(b["recorded"]), rem = num(b["remaining"]);
      const exempt = t["exempt"] || o?.["status"] === "exempt";
      const st = exempt ? "معفى" : !o ? "لم تُنشأ الرسوم" : rem <= 0 ? "مسدد" : paid > 0 ? "مسدد جزئيًا" : "غير مسدد";
      const pct = net > 0 ? Math.min(100, Math.round((paid * 100) / net)) : 0;
      return <div key={String(t["id"])} className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"><b>{t["term"] === 1 ? "الفصل الأول" : "الفصل الثاني"}</b><span className="text-muted-foreground">· {TRANSPORT_LABEL[String(t["transport_type"])] ?? "—"}{t["bus"]?.["code"] ? ` · باص ${t["bus"]["code"]}` : ""}</span>
          <span className={`ms-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${st === "مسدد" || st === "معفى" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>{st}</span></div>
        {o && !exempt && <>
          <div className="grid grid-cols-3 gap-2 text-center">
            {([["رسوم الباص", net, ""], ["المسدد", paid, "text-primary"], ["المتبقي", rem, rem > 0 ? "text-destructive" : "text-primary"]] as const).map(([l, v, c]) => (
              <div key={l} className="rounded-xl bg-muted/50 p-2"><div className="text-[11px] text-muted-foreground">{l}</div><div className={`mt-0.5 text-sm font-bold tabular-nums ${c}`}>{money(v)}</div></div>))}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
          <p className="text-xs text-muted-foreground">سُدد {pct}% من رسوم الباص لهذا الفصل</p>
        </>}
      </div>; })}
  </div>;
}
