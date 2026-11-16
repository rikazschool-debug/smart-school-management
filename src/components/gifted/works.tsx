import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, Download, ExternalLink, FileText, Paperclip, Pencil, Plus, Printer, RotateCw, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { ask, askText } from "@/components/confirm";
import { rotated, type Page } from "@/components/education/plan-evidence";
import { GT_DOMAINS, VERIFY, WORK_KIND, WORK_LEVEL, workStats, type GtMe, type Program, type Work } from "./model";
import { progQuery } from "./programs";
import { gtToday } from "./nomination-wizard";

const BUCKET = "rikaz-files"; const TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const workQuery = (school: string) => ({ queryKey: ["gt-works", school], queryFn: async () => { const r = await db.rpc("gt_work_list", { _school: school }); if (r.error) throw r.error; return r.data as Work[]; } });
async function signed(path: string, name: string, download: boolean) { const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 60, download ? { download: name } : undefined); if (error || !data) { toast.error("لا تملك صلاحية فتح هذا الملف أو لم يعد متاحًا"); return null; } return data.signedUrl; }

export function Works({ school, me, openId, onSel }: { school: string; me: GtMe; openId?: string | undefined; onSel: (id: string | null) => void }) {
  const qc = useQueryClient(); const list = useQuery(workQuery(school)); const [edit, setEdit] = useState<Work | "new" | null>(null); const [k, setK] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["gt-works", school] });
  if (edit) return <WorkForm school={school} row={edit === "new" ? undefined : edit} close={(id) => { setEdit(null); refresh(); if (id) onSel(id); }} />;
  if (list.isLoading) return <LoadingState />; if (list.error) return <ErrorState message={arabicError(list.error)} onRetry={() => list.refetch()} />;
  const all = list.data ?? []; const rows = all.filter((w) => !k || w.kind === k); const open = all.find((w) => w.id === openId); const st = workStats(all);
  return <div className="space-y-4">
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{[["مشروعات", st.projects], ["مشاركات", st.participations], ["إنجازات", st.achievements], ["إنجازات متحقَّقة", st.verified], ["طلبة لهم إنجاز", st.students]].map(([l, v]) => <div key={l} className="rounded-xl border bg-card p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-2xl font-bold">{v}</p></div>)}</div>
    <p className="text-xs text-muted-foreground">الإنجاز الجماعي يُحسب إنجازًا واحدًا، و«طلبة لهم إنجاز» يعدّ كل طالب مرة واحدة. المشاركة لا تُحسب فوزًا.</p>
    <div className="flex flex-wrap gap-2"><select aria-label="النوع" className={selectCls()} value={k} onChange={(e) => setK(e.target.value)}><option value="">كل الأنواع</option>{Object.entries(WORK_KIND).map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select><span className="flex-1" />{me.coord && <Button onClick={() => setEdit("new")}><Plus className="size-4" />توثيق مشروع أو مشاركة أو إنجاز</Button>}</div>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
      <section>{!rows.length ? <EmptyState title="لا توجد أعمال موثقة" hint={me.coord ? "وثّق مشروعًا أو مشاركة أو إنجازًا مع شاهده." : undefined} /> :
        <ul className="space-y-2">{rows.map((w) => <li key={w.id}><button type="button" onClick={() => onSel(w.id)} className={`w-full rounded-xl border bg-card p-3 text-start ${open?.id === w.id ? "border-primary ring-1 ring-primary" : ""}`}>
          <div className="flex justify-between gap-2"><b className="truncate">{w.title}</b><span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${w.verify === "verified" ? "bg-primary/15 text-primary" : "bg-secondary"}`}>{VERIFY[w.verify]}</span></div>
          <p className="mt-1 text-xs text-muted-foreground">{WORK_KIND[w.kind]} · {w.members.length > 1 ? `جماعي (${w.members.length})` : w.members[0]?.name} · {w.event_date ?? ""}{w.level ? ` · ${WORK_LEVEL[w.level]}` : ""}</p>
        </button></li>)}</ul>}</section>
      <section>{!open ? <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">{openId ? "هذا السجل غير متاح لحسابك." : "اختر سجلًا لعرضه."}</div> : <WorkDetail w={open} me={me} onEdit={() => setEdit(open)} onDone={refresh} />}</section>
    </div>
  </div>;
}

function WorkDetail({ w, me, onEdit, onDone }: { w: Work; me: GtMe; onEdit: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false); const [preview, setPreview] = useState<{ url: string; mime: string; name: string } | null>(null);
  async function verify(v: "verified" | "rejected") { let note: string | null = null; if (v === "rejected") { note = await askText("سبب عدم التحقق"); if (!note?.trim()) return; } setBusy(true); try { const r = await db.rpc("gt_work_verify", { _id: w.id, _rev: w.rev, _verify: v, _note: note }); if (r.error) throw r.error; toast.success("حُفظ التحقق"); onDone(); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }
  async function show(f: Work["files"][number]) { const u = await signed(f.path, f.name, false); if (u) setPreview({ url: u, mime: f.mime, name: f.name }); }
  return <div className="space-y-4 rounded-2xl border bg-card p-5">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-lg font-bold">{w.title}</h3><p className="text-xs text-muted-foreground">{WORK_KIND[w.kind]} · {GT_DOMAINS[w.domain]} · وثّقه {w.by}</p></div><span className="rounded-full bg-secondary px-2.5 py-1 text-xs">{VERIFY[w.verify]}</span></div>
    {w.kind !== "project" && <dl className="grid gap-2 text-sm sm:grid-cols-3"><div><dt className="text-muted-foreground">الفعالية</dt><dd>{w.event_name}</dd></div><div><dt className="text-muted-foreground">الجهة</dt><dd>{w.organizer}</dd></div><div><dt className="text-muted-foreground">التاريخ</dt><dd>{w.event_date}</dd></div>{w.level && <div><dt className="text-muted-foreground">المستوى</dt><dd>{WORK_LEVEL[w.level]}</dd></div>}{w.result && <div className="sm:col-span-2"><dt className="text-muted-foreground">النتيجة</dt><dd>{w.result}</dd></div>}</dl>}
    {w.description && <p className="text-sm">{w.description}</p>}
    {w.kind === "project" && <div className="text-sm">{w.supervisor && <p><b>المشرف: </b>{w.supervisor}</p>}{w.stages.length > 0 && <ol className="mt-1 list-inside list-decimal">{w.stages.map((s, i) => <li key={i}>{s.title}{s.done ? " ✓" : ""}</li>)}</ol>}{w.outputs && <p className="mt-1"><b>المخرجات: </b>{w.outputs}</p>}</div>}
    {w.program && <p className="text-sm"><b>ضمن برنامج: </b>{w.program}</p>}
    <div><h4 className="mb-1 text-sm font-semibold">الطلبة وأدوارهم</h4><ul className="flex flex-wrap gap-1.5 text-sm">{w.members.map((m) => <li key={m.student_id} className="rounded-full bg-secondary px-2.5 py-1">{m.name}{m.role ? ` — ${m.role}` : ""}</li>)}</ul></div>
    <div><h4 className="mb-1 text-sm font-semibold">الشواهد ({w.files.length + w.links.length})</h4>
      <ul className="space-y-1.5 text-sm">{w.files.map((f) => <li key={f.id} className="flex items-center gap-2 rounded-lg border p-2"><FileText className="size-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{f.title || f.name}</span><Button size="sm" variant="ghost" onClick={() => show(f)}>معاينة</Button><Button size="icon" variant="ghost" aria-label={`تنزيل ${f.name}`} onClick={async () => { const u = await signed(f.path, f.name, true); if (u) window.open(u, "_blank", "noopener"); }}><Download className="size-4" /></Button></li>)}
        {w.links.map((l, i) => <li key={i}><a className="inline-flex items-center gap-1 text-primary underline" href={l.url} target="_blank" rel="noreferrer">{l.title || l.url}<ExternalLink className="size-3" /></a></li>)}</ul>
      {preview && <div className="mt-2 space-y-2 rounded-lg border p-2"><div className="flex justify-between"><b className="text-sm">{preview.name}</b><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => { const win = window.open(preview.url, "_blank", "noopener"); if (win) setTimeout(() => win.print(), 800); }}><Printer className="size-4" />طباعة</Button><Button size="sm" variant="ghost" onClick={() => setPreview(null)}>إغلاق</Button></div></div>{preview.mime === "application/pdf" ? <iframe title={preview.name} src={preview.url} className="h-96 w-full rounded" /> : <img src={preview.url} alt={preview.name} className="max-h-96 w-full object-contain" />}</div>}
    </div>
    {w.verify_note && <p className="rounded-lg bg-muted/40 p-2 text-sm">{w.verify_note}</p>}{w.verifier && <p className="text-xs text-muted-foreground">تحقق: {w.verifier} — {new Date(w.verified_at!).toLocaleDateString("ar-SA")}</p>}
    {me.coord && <><Attach w={w} onDone={onDone} /><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={onEdit}><Pencil className="size-4" />تعديل</Button>{w.verify !== "verified" && <Button disabled={busy} onClick={() => verify("verified")}><CheckCircle2 className="size-4" />تأكيد التحقق</Button>}{w.verify === "pending" && <Button variant="outline" disabled={busy} onClick={() => verify("rejected")}><XCircle className="size-4" />غير متحقَّق</Button>}</div></>}
    <p className="text-xs text-muted-foreground">الملفات خاصة وتُفتح برابط مؤقت لمن يملك الصلاحية. لا تُنشر صور الطلبة أو أعمالهم في أي معرض مشترك.</p>
  </div>;
}

function Attach({ w, onDone }: { w: Work; onDone: () => void }) {
  const [pages, setPages] = useState<(Page & { title: string })[]>([]); const [busy, setBusy] = useState(false);
  useEffect(() => () => pages.forEach((p) => URL.revokeObjectURL(p.url)), [pages]);
  function add(files: FileList | null) { const ok = [...(files ?? [])].filter((f) => TYPES.includes(f.type)); if ((files?.length ?? 0) > ok.length) toast.error("يُقبل الصور وملفات PDF فقط"); setPages((ps) => [...ps, ...ok.map((file) => ({ key: crypto.randomUUID(), file, rot: 0, url: URL.createObjectURL(file), title: "" }))].slice(0, 20)); }
  async function save() {
    setBusy(true); try {
      const prep = await Promise.all(pages.map(rotated));
      const r = await db.rpc("gt_work_attach", { _id: w.id, _files: prep.map((x, i) => ({ name: x.name, mime: x.mime, size: x.blob.size, title: pages[i]!.title })) }); if (r.error) throw r.error;
      let failed = 0; for (const [i, f] of (r.data as { files: { path: string }[] }).files.entries()) { const up = await db.storage.from(BUCKET).upload(f.path, prep[i]!.blob, { contentType: prep[i]!.mime }); if (up.error) failed++; }
      if (failed) toast.error(`تعذر رفع ${failed} ملف؛ أعد المحاولة`); else toast.success("أُضيفت الشواهد"); setPages([]); onDone();
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  return <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
    <div className="flex flex-wrap gap-2">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"><Camera className="size-4" />تصوير بالجوال<input type="file" accept="image/*" capture="environment" className="sr-only" aria-label="تصوير شاهد بالكاميرا" onChange={(e) => { add(e.target.files); e.target.value = ""; }} /></label>
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"><Paperclip className="size-4" />صور أو PDF أو شهادة<input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" aria-label="اختيار صور أو PDF" onChange={(e) => { add(e.target.files); e.target.value = ""; }} /></label>
    </div>
    {pages.length > 0 && <><ol className="grid gap-2 sm:grid-cols-4">{pages.map((p, i) => <li key={p.key} className="space-y-1 rounded-md border bg-background p-2"><div className="flex h-24 items-center justify-center overflow-hidden rounded bg-muted">{p.file.type.startsWith("image/") ? <img src={p.url} alt={`ملف ${i + 1}`} className="max-h-24 object-contain" style={{ transform: `rotate(${p.rot}deg)` }} /> : <FileText className="size-8 text-muted-foreground" />}</div>
      <Input aria-label={`عنوان الملف ${i + 1}`} placeholder="عنوان (شهادة، صورة العمل…)" value={p.title} onChange={(e) => setPages(pages.map((x) => (x.key === p.key ? { ...x, title: e.target.value } : x)))} />
      <div className="flex justify-between"><Button type="button" size="icon" variant="ghost" aria-label={`تدوير ${i + 1}`} disabled={!p.file.type.startsWith("image/")} onClick={() => setPages(pages.map((x) => (x.key === p.key ? { ...x, rot: x.rot + 90 } : x)))}><RotateCw className="size-4" /></Button><Button type="button" size="icon" variant="ghost" aria-label={`حذف ${i + 1}`} onClick={() => setPages(pages.filter((x) => x.key !== p.key))}><Trash2 className="size-4" /></Button></div></li>)}</ol>
      <Button size="sm" disabled={busy} onClick={save}>{busy ? "جارٍ الرفع…" : "حفظ الشواهد"}</Button></>}
  </div>;
}

type Draft = { kind: string; title: string; domain: string; description: string; supervisor: string; stages: { title: string; done?: boolean }[]; outputs: string; event_name: string; organizer: string; event_date: string; level: string; result: string; program_id: string; links: { title: string; url: string }[]; members: { student_id: string; role: string }[] };
function WorkForm({ school, row, close }: { school: string; row?: Work | undefined; close: (id?: string) => void }) {
  const [d, setD] = useState<Draft>({ kind: row?.kind ?? "achievement", title: row?.title ?? "", domain: row?.domain ?? "scientific", description: row?.description ?? "", supervisor: row?.supervisor ?? "", stages: row?.stages ?? [], outputs: row?.outputs ?? "", event_name: row?.event_name ?? "", organizer: row?.organizer ?? "", event_date: row?.event_date ?? "", level: row?.level ?? "school", result: row?.result ?? "", program_id: row?.program_id ?? "", links: row?.links ?? [], members: row?.members.map((m) => ({ student_id: m.student_id, role: m.role ?? "" })) ?? [] });
  const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false);
  const studs = useQuery({ queryKey: ["gt-students", school], queryFn: async () => { const r = await db.rpc("gt_students", { _school: school }); if (r.error) throw r.error; return r.data as { id: string; name: string }[]; } });
  const progs = useQuery(progQuery(school));
  const set = (p: Partial<Draft>) => { setDirty(true); setD({ ...d, ...p }); };
  const names = new Map([...(studs.data ?? []).map((s) => [s.id, s.name] as const), ...(row?.members ?? []).map((m) => [m.student_id, m.name] as const)]);
  async function save() { setBusy(true); try { const r = await db.rpc("gt_work_save", { _school: school, _id: row?.id ?? null, _rev: row?.rev ?? null, _p: d }); if (r.error) throw r.error; toast.success("حُفظ السجل"); close(r.data as string); } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); } }
  const inp = (k: keyof Draft, label: string, type = "text") => <div className="space-y-1"><Label htmlFor={`wk-${k}`}>{label}</Label><Input id={`wk-${k}`} type={type} max={type === "date" && d.kind === "achievement" ? gtToday() : undefined} value={d[k] as string} onChange={(e) => set({ [k]: e.target.value } as Partial<Draft>)} /></div>;
  const ev = d.kind !== "project";
  return <div className="mx-auto max-w-3xl space-y-4 pb-10">
    <div className="flex items-center justify-between"><h2 className="text-xl font-bold">{row ? "تعديل السجل" : "توثيق عمل"}</h2><Button variant="ghost" onClick={async () => { if (!dirty || (await ask("ستفقد التغييرات غير المحفوظة. هل تريد الخروج؟"))) close(); }}>إلغاء</Button></div>
    <div className="grid grid-cols-3 gap-2">{Object.entries(WORK_KIND).map(([k, v]) => <button key={k} type="button" disabled={!!row} aria-pressed={d.kind === k} onClick={() => set({ kind: k })} className={`rounded-xl border p-3 text-sm font-semibold ${d.kind === k ? "border-primary bg-primary/5" : ""}`}>{v}</button>)}</div>
    {row && row.verify === "verified" && <p className="rounded-lg bg-accent/20 p-2 text-sm">تعديل سجل متحقَّق يعيده إلى «بانتظار التحقق».</p>}
    <section className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2">
      <div className="sm:col-span-2">{inp("title", "العنوان")}</div>
      <div className="space-y-1"><Label htmlFor="wk-dom">المجال</Label><select id="wk-dom" className={selectCls("w-full")} value={d.domain} onChange={(e) => set({ domain: e.target.value })}>{Object.entries(GT_DOMAINS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor="wk-prog">ضمن برنامج (اختياري)</Label><select id="wk-prog" className={selectCls("w-full")} value={d.program_id} onChange={(e) => set({ program_id: e.target.value })}><option value="">—</option>{(progs.data ?? []).map((p: Program) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
      {ev && <>{inp("event_name", "اسم الفعالية")}{inp("organizer", "الجهة")}{inp("event_date", "التاريخ", "date")}</>}
      {d.kind === "achievement" && <><div className="space-y-1"><Label htmlFor="wk-lvl">المستوى</Label><select id="wk-lvl" className={selectCls("w-full")} value={d.level} onChange={(e) => set({ level: e.target.value })}>{Object.entries(WORK_LEVEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div><div className="sm:col-span-2">{inp("result", "النتيجة (مثل: المركز الثاني)")}</div></>}
      {d.kind === "project" && <>{inp("supervisor", "المشرف")}{inp("outputs", "المخرجات")}<div className="space-y-1 sm:col-span-2"><div className="flex justify-between"><Label>مراحل المشروع</Label><Button size="sm" variant="ghost" onClick={() => set({ stages: [...d.stages, { title: "" }] })}><Plus className="size-4" />مرحلة</Button></div>{d.stages.map((s, i) => <div key={i} className="flex items-center gap-2"><input type="checkbox" aria-label={`اكتملت المرحلة ${i + 1}`} checked={!!s.done} onChange={(e) => set({ stages: d.stages.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x)) })} /><Input aria-label={`المرحلة ${i + 1}`} value={s.title} onChange={(e) => set({ stages: d.stages.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} /><Button size="icon" variant="ghost" aria-label="حذف المرحلة" onClick={() => set({ stages: d.stages.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button></div>)}</div></>}
      <div className="space-y-1 sm:col-span-2"><Label htmlFor="wk-desc">الوصف</Label><Textarea id="wk-desc" rows={3} value={d.description} onChange={(e) => set({ description: e.target.value })} /></div>
    </section>
    <section className="space-y-2 rounded-2xl border bg-card p-4"><h3 className="font-semibold">الطلبة ({d.members.length}){d.members.length > 1 ? " — عمل جماعي" : ""}</h3>
      {d.members.map((m, i) => <div key={m.student_id} className="flex items-center gap-2"><span className="w-40 truncate text-sm">{names.get(m.student_id) ?? "طالب"}</span><Input aria-label={`دور ${names.get(m.student_id)}`} placeholder="الدور (مثل: مبرمج الفريق)" value={m.role} onChange={(e) => set({ members: d.members.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)) })} /><Button size="icon" variant="ghost" aria-label="إزالة" onClick={() => set({ members: d.members.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button></div>)}
      <div className="flex flex-wrap gap-1.5">{(studs.data ?? []).filter((s) => !d.members.some((m) => m.student_id === s.id)).map((s) => <button key={s.id} type="button" className="rounded-full border px-2.5 py-1 text-sm hover:bg-muted" onClick={() => set({ members: [...d.members, { student_id: s.id, role: "" }] })}><Plus className="inline size-3" /> {s.name}</button>)}</div>
      {!studs.data?.length && <p className="text-xs text-muted-foreground">يظهر هنا طلبة سجل الرعاية فقط.</p>}
    </section>
    <section className="space-y-2 rounded-2xl border bg-card p-4"><div className="flex justify-between"><h3 className="font-semibold">روابط (اختياري)</h3><Button size="sm" variant="ghost" onClick={() => set({ links: [...d.links, { title: "", url: "" }] })}><Plus className="size-4" />رابط</Button></div>
      {d.links.map((l, i) => <div key={i} className="flex gap-2"><Input aria-label={`عنوان الرابط ${i + 1}`} placeholder="العنوان" value={l.title} onChange={(e) => set({ links: d.links.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} /><Input aria-label={`الرابط ${i + 1}`} dir="ltr" placeholder="https://" value={l.url} onChange={(e) => set({ links: d.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} /><Button size="icon" variant="ghost" aria-label="حذف الرابط" onClick={() => set({ links: d.links.filter((_, j) => j !== i) })}><Trash2 className="size-4" /></Button></div>)}
      <p className="text-xs text-muted-foreground">الصور وPDF والشهادات تُرفع بعد الحفظ من صفحة السجل.</p></section>
    <div className="flex justify-end"><Button disabled={busy || d.title.trim().length < 3 || !d.members.length} onClick={save}>حفظ</Button></div>
  </div>;
}
