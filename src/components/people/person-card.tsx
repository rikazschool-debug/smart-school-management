import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, Pencil, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { ask, askText } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { ErrorState, LoadingState } from "@/components/states";
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
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["pp-card", kind, id] }); void qc.invalidateQueries({ queryKey: ["pp-tag-ids"] }); };
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
      <section className="space-y-1 text-sm">
        <div><span className="text-muted-foreground">المدرسة: </span>{c.schools.map((s) => s.name).join("، ") || "—"}</div>
        {c.categories?.map((x, i) => <div key={i} className="text-xs"><span className="text-muted-foreground">{x.school}: </span>{x.category ?? "بلا تصنيف"}{x.title ? ` — ${x.title}` : ""}</div>)}
        <div><span className="text-muted-foreground">حساب الدخول: </span>{!c.has_login ? "غير مرتبط" : c.account?.length ? c.account.map((a) => `${a.school}: ${a.active ? "نشط" : "موقوف"}`).join("، ") : "مرتبط"}</div>
        <p className="text-xs text-muted-foreground">حالة الحساب مستقلة عن حالة السجل؛ إيقاف الدخول لا ينهي الخدمة ولا يسحب التسجيل.</p>
        <div className="flex flex-wrap gap-2 pt-1 text-xs">
          {kind === "employee" && <Link className="text-primary hover:underline" to="/app/hr">الملف في الموارد البشرية</Link>}
          {kind === "teacher" && <Link className="text-primary hover:underline" to="/app/teachers">سجل المعلمين</Link>}
          {kind === "student" && <Link className="text-primary hover:underline" to="/app/students">سجل الطلاب</Link>}
          {kind === "guardian" && <Link className="text-primary hover:underline" to="/app/guardians">سجل أولياء الأمور</Link>}
        </div>
      </section>

      <section className="space-y-2">
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
      </section>

      {c.caps.notes_view && <Notes c={c} kind={kind} id={id} onChange={refresh} />}

      <section className="space-y-2">
        <h3 className="flex items-center gap-1 text-sm font-bold"><Clock className="size-4" /> سجل الأحداث</h3>
        {c.events.length === 0 ? <p className="text-xs text-muted-foreground">لا أحداث متاحة لك.</p> : (
          <ol className="space-y-2 border-s ps-3">
            {c.events.map((e, i) => (
              <li key={i} className="text-sm">
                <div className="font-medium">{e.link ? <Link className="text-primary hover:underline" to={e.link}>{e.title}</Link> : e.title}</div>
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
    <section className="space-y-2">
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
