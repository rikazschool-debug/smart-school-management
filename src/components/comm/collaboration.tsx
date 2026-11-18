import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { Thread } from "@/components/comm/thread";
import { uploadObject } from "@/components/classroom-posts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { selectCls } from "@/components/ui/native-select";
import { ask } from "@/components/confirm";
import { arabicError, useSession } from "@/lib/session";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { MaterialFileViewer } from "./material-file-viewer";
import { SupervisionShelf } from "@/components/supervision/res";
const categories: Record<string, string> = { activities: "أنشطة", teaching: "مواد تعليمية", worksheets: "أوراق عمل", notes: "مذكرات", summaries: "ملخصات", courses: "دورات" };
export function Collaboration() {
  const { active, contexts, setActive } = useSession();
  const tab = useRouterState({ select: (r) => (r.location.search as Record<string, unknown>)["tab"] === "library" ? "library" : "community" });
  const ok = useQuery({ queryKey: ["co-access", active?.orgId, active?.role, active?.schoolId], enabled: !!active?.orgId, queryFn: async () => { const { data, error } = await db.rpc("_co_ok", { _org: active?.orgId }); if (error) throw error; return !!data; } });
  if (active?.role === "platform_admin") return <div className="space-y-5"><PageHeader title="التعاون" /><select aria-label="المجموعة والفرع" className={selectCls()} value="" onChange={(e) => { if (e.target.value) setActive(e.target.value); }}><option value="">اختر المجموعة والفرع</option>{contexts.filter((c) => c.role === "org_owner" && c.orgId && c.schoolId).map((c) => <option key={c.key} value={c.key}>{c.orgName} — {c.schoolName}</option>)}</select><EmptyState title="اختر مجموعة لفتح المجتمع المهني والمكتبة الرقمية" /></div>;
  if (ok.isLoading) return <LoadingState />; if (ok.error) return <ErrorState message={arabicError(ok.error)} />; if (!ok.data || !active?.orgId) return <ForbiddenState />;
  return <div className="space-y-5"><PageHeader title={tab === "library" ? "المكتبة الرقمية" : "المجتمع المهني"} />{tab === "library" ? <Library org={active.orgId} school={active.schoolId} /> : <Community org={active.orgId} />}</div>;
}
function Community({ org }: { org: string }) {
  const q = useQuery({ queryKey: ["co-community", org], queryFn: async () => { const { data, error } = await db.rpc("co_community", { _org: org }); if (error) throw error; return data as Row; } });
  if (q.isLoading) return <LoadingState />; if (q.error) return <ErrorState message={arabicError(q.error)} />;
  return q.data ? <Thread conv={{ ...q.data, my_role: "member", professional: true }} onBack={() => undefined} onChanged={() => undefined} /> : null;
}
function Library({ org, school }: { org: string; school: string | null }) {
  const { user, active } = useSession(); const qc = useQueryClient(); const [category, setCategory] = useState("activities"); const [search, setSearch] = useState(""); const [editing, setEditing] = useState<Row | null>(null); const [creating, setCreating] = useState(false); const [page, setPage] = useState(0); const [branch, setBranch] = useState("");
  const q = useQuery({ queryKey: ["co-materials", org, category, search, page, branch], enabled: category !== "supervision", queryFn: async () => { let query = db.from("co_materials").select("*, schools(name), co_reactions(*)", { count: "exact" }).eq("org_id", org).eq("category", category); if (branch) query = query.eq("author_branch", branch); if (search) query = query.ilike("title", `%${search.replace(/[,()*%\\]/g, " ")}%`); const { data, error, count } = await query.order("created_at", { ascending: false }).order("id").range(page * 24, page * 24 + 23); if (error) throw error; return { rows: data as Row[], count: Number(count) }; } });
  const remove = async (r: Row) => { if (!(await ask("حذف المادة من المكتبة؟"))) return; const { error } = await db.from("co_materials").delete().eq("id", r["id"]); if (error) { toast.error(arabicError(error)); return; } void qc.invalidateQueries({ queryKey: ["co-materials"] }); };
  const react = async (r: Row, emoji: string) => { const own = (r["co_reactions"] as Row[]).find((x) => x["user_id"] === user.id); const query = own?.["emoji"] === emoji ? db.from("co_reactions").delete().eq("material_id", r["id"]).eq("user_id", user.id) : db.from("co_reactions").upsert({ material_id: r["id"], user_id: user.id, emoji }, { onConflict: "material_id,user_id" }); const { error } = await query; if (error) toast.error(arabicError(error)); else void qc.invalidateQueries({ queryKey: ["co-materials"] }); };
  return <div className="space-y-5"><div className="flex flex-wrap gap-2"><div className="relative min-w-48 flex-1"><Search className="absolute start-3 top-3 size-4 text-muted-foreground" /><Input aria-label="البحث في المكتبة" className="ps-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="عنوان المادة" /></div><Input aria-label="تصفية باسم الفرع" className="w-auto" placeholder="اسم الفرع" value={branch} onChange={(e) => { setBranch(e.target.value); setPage(0); }} />{school && <Button onClick={() => setCreating(true)}><Plus className="size-4" />مشاركة مادة</Button>}</div><Tabs value={category} onValueChange={(c) => { setCategory(c); setPage(0); }} dir="rtl"><TabsList className="h-auto flex-wrap">{Object.entries(categories).map(([k, v]) => <TabsTrigger key={k} value={k}>{v}</TabsTrigger>)}<TabsTrigger value="supervision">الإشراف التربوي</TabsTrigger></TabsList></Tabs>
    {category === "supervision" ? <SupervisionShelf org={org} /> : q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : !q.data?.rows.length ? <EmptyState title="لا توجد مشاركات بعد" /> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{q.data.rows.map((r) => <article key={r["id"]} className="space-y-3 rounded-lg border bg-card p-4"><div className="flex items-start gap-3"><BookOpen className="size-5 shrink-0 text-primary" /><Button variant="link" className="h-auto whitespace-normal p-0 text-start" onClick={() => setEditing(r)}>{r["title"]}</Button></div><p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{r["description"]}</p><p className="text-xs text-muted-foreground">{r["author_name"]} · {ROLE_LABELS[r["author_role"] as Role] ?? r["author_role"]} · {r["author_branch"]} · {new Date(r["created_at"]).toLocaleDateString("ar-SA")}</p><MaterialFiles id={r["id"]} /><div className="flex flex-wrap gap-1">{["👍", "❤️", "👏", "💡", "🎉"].map((emoji) => <Button key={emoji} size="sm" variant="outline" aria-label={`تفاعل ${emoji}`} onClick={() => void react(r, emoji)}>{emoji} {(r["co_reactions"] as Row[]).filter((x) => x["emoji"] === emoji).length || ""}</Button>)}{(r["author"] === user.id || active?.role === "org_owner") && <Button variant="ghost" size="icon" aria-label="حذف المادة" onClick={() => void remove(r)}><Trash2 className="size-4" /></Button>}</div></article>)}</div>}
    {category !== "supervision" && <div className="flex justify-end gap-2"><Button variant="outline" disabled={!page} onClick={() => setPage((p) => p - 1)}>السابق</Button><Button variant="outline" disabled={(page + 1) * 24 >= (q.data?.count ?? 0)} onClick={() => setPage((p) => p + 1)}>التالي</Button></div>}
    <Dialog open={creating || !!editing} onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null); } }}><DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>{editing ? "المادة" : "مشاركة مادة"}</DialogTitle></DialogHeader><MaterialEditor key={editing?.["id"] ?? "new"} row={editing} org={org} school={school} category={category} done={(r) => { setCreating(false); setEditing(r); void qc.invalidateQueries({ queryKey: ["co-materials"] }); }} /></DialogContent></Dialog>
  </div>;
}
function MaterialFiles({ id, editable = false }: { id: string; editable?: boolean }) { const qc = useQueryClient(); const q = useQuery({ queryKey: ["co-files", id], queryFn: async () => { const { data, error } = await db.from("files").select("*").eq("source_type", "co_material").eq("source_id", id); if (error) throw error; return data as Row[]; } });
 const remove = async (f: Row) => { if (!(await ask("حذف المرفق؟"))) return; const {error} = await db.rpc("co_remove_file", {_id:f["id"]}); if(error) toast.error(arabicError(error)); else void qc.invalidateQueries({queryKey:["co-files",id]}); };
 return q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} /> : <>{(q.data ?? []).map((f) => <MaterialFileViewer key={f["id"]} file={f} onRemove={editable ? () => void remove(f) : undefined} />)}</>; }

function MaterialEditor({ row, org, school, category, done }: { row: Row | null; org: string; school: string | null; category: string; done: (r: Row) => void }) {
  const { user } = useSession(); const qc = useQueryClient();
  const [title, setTitle] = useState<string>(row?.["title"] ?? ""); const [description, setDescription] = useState<string>(row?.["description"] ?? ""); const [cat, setCat] = useState<string>(row?.["category"] ?? category);
  const [stage, setStage] = useState<string>(row?.["stage_name"] ?? ""); const [grade, setGrade] = useState<string>(row?.["grade_name"] ?? "");
  const [queued, setQueued] = useState<File[]>([]);
  const [busy, setBusy] = useState(false); const canEdit = !row || row["author"] === user.id;
  // optional stage/grade lists come from the current branch's academic setup; stored as names because the library is group-wide
  const levels = useQuery({ queryKey: ["co-levels", school], enabled: !!school, queryFn: async () => {
    const [st, gr] = await Promise.all([db.from("stages").select("id, name").eq("school_id", school).order("sort_order"), db.from("grades").select("name, stage_id").eq("school_id", school).order("sort_order")]);
    return { stages: (st.data ?? []) as Row[], grades: (gr.data ?? []) as Row[] };
  } });
  const stageId = levels.data?.stages.find((x) => x["name"] === stage)?.["id"];
  const gradeOpts = [...new Set((levels.data?.grades ?? []).filter((g) => !stageId || g["stage_id"] === stageId).map((g) => g["name"] as string))];
  const save = async () => {
    setBusy(true);
    try {
      const fields = { title: title.trim(), description, category: cat, stage_name: stage || null, grade_name: grade || null };
      const query = row ? db.from("co_materials").update(fields).eq("id", row["id"]) : db.from("co_materials").insert({ ...fields, org_id: org, school_id: school, author: user.id });
      const { data, error } = await query.select().single(); if (error) throw error;
      let failed = 0;
      for (const f of queued) {
        const rec = await db.rpc("co_add_file", { _material: (data as Row)["id"], _name: f.name, _mime: f.type, _size: f.size });
        if (rec.error) { failed++; toast.error(`${f.name}: ${arabicError(rec.error)}`); continue; }
        const r = rec.data as { id: string; storage_path: string };
        const up = await uploadObject(r.storage_path, f, new AbortController().signal);
        if (up !== "ok") { failed++; await db.rpc("co_remove_file", { _id: r.id }); toast.error(`تعذّر رفع ${f.name}`); }
      }
      setQueued([]); void qc.invalidateQueries({ queryKey: ["co-files", (data as Row)["id"]] });
      toast.success(failed ? "حُفظت المادة، وبعض المرفقات لم تُرفع" : "حُفظت المادة"); done(data as Row);
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  };
  const lab = "text-sm font-medium"; const hint = "text-xs text-muted-foreground";
  return <div className="space-y-4">
    {row && <p className="text-sm text-muted-foreground">{row["author_name"]} · {ROLE_LABELS[row["author_role"] as Role] ?? row["author_role"]} · {row["author_branch"]}</p>}
    {!row && <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-secondary-foreground">شارك مادة مع زملائك في المجموعة: اكتب عنوانًا واضحًا ووصفًا مختصرًا، واختر التصنيف، ثم أرفق الملفات إن وُجدت. المرحلة والصف والمرفقات اختيارية.</p>}
    <div className="space-y-1"><label className={lab} htmlFor="co-title">عنوان المادة <span className="text-destructive">*</span></label><Input id="co-title" value={title} disabled={!canEdit} maxLength={200} placeholder="مثال: ورقة عمل الكسور العشرية" onChange={(e) => setTitle(e.target.value)} /><p className={hint}>حرفان على الأقل.</p></div>
    <div className="space-y-1"><label className={lab} htmlFor="co-desc">الشرح / الوصف</label><Textarea id="co-desc" rows={4} value={description} disabled={!canEdit} placeholder="ما الذي تحتويه المادة، ولمن تناسب، وكيف تُستخدم؟" onChange={(e) => setDescription(e.target.value)} /></div>
    <div className="space-y-1"><label className={lab} htmlFor="co-cat">التصنيف</label><select id="co-cat" className={selectCls()} disabled={!canEdit} value={cat} onChange={(e) => setCat(e.target.value)}>{Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1"><label className={lab} htmlFor="co-stage">المرحلة <span className="font-normal text-muted-foreground">(اختياري)</span></label><select id="co-stage" className={selectCls()} disabled={!canEdit} value={stage} onChange={(e) => { setStage(e.target.value); setGrade(""); }}><option value="">— غير محددة —</option>{(levels.data?.stages ?? []).map((x) => <option key={x["id"]} value={x["name"]}>{x["name"]}</option>)}{stage && !levels.data?.stages.some((x) => x["name"] === stage) && <option value={stage}>{stage}</option>}</select></div>
      <div className="space-y-1"><label className={lab} htmlFor="co-grade">الصف <span className="font-normal text-muted-foreground">(اختياري)</span></label><select id="co-grade" className={selectCls()} disabled={!canEdit} value={grade} onChange={(e) => setGrade(e.target.value)}><option value="">— غير محدد —</option>{gradeOpts.map((x) => <option key={x} value={x}>{x}</option>)}{grade && !gradeOpts.includes(grade) && <option value={grade}>{grade}</option>}</select></div>
    </div>
    <p className={hint}>تحديد المرحلة والصف غير إلزامي، ويساعد الزملاء في الوصول للمادة المناسبة.</p>
    {canEdit && <div className="space-y-2 rounded-lg border border-dashed p-3">
      <p className={lab}>المرفقات <span className="font-normal text-muted-foreground">(اختياري)</span></p>
      <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"><Plus className="size-4" /> إضافة ملفات<input type="file" multiple className="hidden" disabled={busy} onChange={(e) => { const l = [...(e.target.files ?? [])]; e.target.value = ""; setQueued((q) => [...q, ...l]); }} /></label>
      {queued.length > 0 && <ul className="space-y-1 text-sm">{queued.map((f, n) => <li key={n} className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{f.name}</span><Button type="button" variant="ghost" size="icon" aria-label={`إزالة ${f.name}`} onClick={() => setQueued((q) => q.filter((_, k) => k !== n))}><Trash2 className="size-4" /></Button></li>)}</ul>}
      <p className={hint}>تُرفع الملفات المختارة عند الحفظ.</p>
    </div>}
    {canEdit && <Button disabled={busy || title.trim().length < 2} onClick={() => void save()}>{busy ? "جارٍ الحفظ…" : "حفظ"}</Button>}
    {row && <MaterialFiles id={row["id"]} editable={canEdit} />}
  </div>;
}
