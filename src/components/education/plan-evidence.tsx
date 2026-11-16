import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Camera, FileText, Link2, Paperclip, RotateCw, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";
import { schoolTime } from "@/lib/homework";
import type { EduRecord, Evidence } from "./model";

const BUCKET = "rikaz-files"; const TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
type Page = { key: string; file: File; rot: number; url: string };
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> { const r = await db.rpc(name, args); if (r.error) throw r.error; return r.data as T; }

/** Applies the chosen rotation to an image page before upload (PDF pages are uploaded as-is). */
async function rotated(p: Page): Promise<{ blob: Blob; mime: string; name: string }> {
  if (!p.file.type.startsWith("image/") || p.rot % 360 === 0) return { blob: p.file, mime: p.file.type, name: p.file.name };
  const img = await createImageBitmap(p.file); const c = document.createElement("canvas"); const q = ((p.rot % 360) + 360) % 360;
  c.width = q % 180 ? img.height : img.width; c.height = q % 180 ? img.width : img.height; const x = c.getContext("2d")!;
  x.translate(c.width / 2, c.height / 2); x.rotate((q * Math.PI) / 180); x.drawImage(img, -img.width / 2, -img.height / 2);
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("تعذر تجهيز الصورة"))), "image/jpeg", 0.9));
  return { blob, mime: "image/jpeg", name: p.file.name.replace(/\.\w+$/, "") + ".jpg" };
}
export async function openEvidenceFile(path: string, name: string) {
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 60, { download: name });
  if (error || !data) return void toast.error("لا تملك صلاحية فتح هذا الملف أو لم يعد متاحًا");
  window.open(data.signedUrl, "_blank", "noopener");
}

export function EvidenceTab({ r, canAdd, refresh }: { r: EduRecord; canAdd: boolean; refresh: () => Promise<void> }) {
  const ev = r.evidence ?? []; const [mode, setMode] = useState<"upload" | "link">("upload"); const [busy, setBusy] = useState(false);
  const [v, setV] = useState({ title: "", goal_index: "", session_id: "", note: "", link: "" }); const [pages, setPages] = useState<Page[]>([]);
  useEffect(() => () => pages.forEach((p) => URL.revokeObjectURL(p.url)), [pages]);
  const links = useQuery({ queryKey: ["edu-links", r.id], enabled: canAdd && mode === "link", queryFn: () => rpc<{ id: string; title: string; type: string }[]>("edu_evidence_links", { _id: r.id }) });
  function add(files: FileList | null) {
    const ok = [...(files ?? [])].filter((f) => TYPES.includes(f.type)); if ((files?.length ?? 0) > ok.length) toast.error("يُقبل الصور وملفات PDF فقط");
    setPages((ps) => [...ps, ...ok.map((file) => ({ key: crypto.randomUUID(), file, rot: 0, url: URL.createObjectURL(file) }))].slice(0, 20));
  }
  const move = (i: number, d: number) => setPages((ps) => { const n = [...ps]; const j = i + d; if (j < 0 || j >= n.length) return ps; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });
  async function save() {
    setBusy(true);
    try {
      const prepared = mode === "upload" ? await Promise.all(pages.map(rotated)) : [];
      const base = { title: v.title, note: v.note, goal_index: v.goal_index === "" ? null : Number(v.goal_index), session_id: v.session_id || null };
      const p = mode === "upload" ? { ...base, kind: "upload", files: prepared.map((x) => ({ name: x.name, mime: x.mime, size: x.blob.size })) } : { ...base, kind: "link", link_type: links.data?.find((l) => l.id === v.link)?.type, link_id: v.link };
      const res = await rpc<{ id: string; files: { id: string; path: string }[] }>("edu_evidence_add", { _id: r.id, _p: p });
      let failed = 0;
      for (const [i, f] of res.files.entries()) { const up = await db.storage.from(BUCKET).upload(f.path, prepared[i]!.blob, { contentType: prepared[i]!.mime }); if (up.error) failed++; }
      if (failed) toast.error(`تعذر رفع ${failed} صفحة؛ أضف الدليل مرة أخرى`); else toast.success("أُضيف الدليل");
      setPages([]); setV({ title: "", goal_index: v.goal_index, session_id: "", note: "", link: "" }); await refresh();
    } catch (e) { toast.error(arabicError(e)); } finally { setBusy(false); }
  }
  const ready = v.title.trim().length >= 2 && (mode === "upload" ? pages.length > 0 : !!v.link);
  return <div className="space-y-3">
    {canAdd && <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap gap-2"><Button size="sm" variant={mode === "upload" ? "default" : "outline"} onClick={() => setMode("upload")}><Upload className="size-4" />تصوير أو رفع</Button><Button size="sm" variant={mode === "link" ? "default" : "outline"} onClick={() => setMode("link")}><Link2 className="size-4" />ربط واجب أو اختبار من ركاز</Button></div>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1"><Label htmlFor="ev-title" className="text-xs">عنوان الدليل</Label><Input id="ev-title" maxLength={200} placeholder="مثال: ورقة الاختبار القصير" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="ev-goal" className="text-xs">الهدف</Label><select id="ev-goal" className={selectCls("w-full")} value={v.goal_index} onChange={(e) => setV({ ...v, goal_index: e.target.value })}><option value="">الخطة عامة</option>{r.goals.map((g, i) => <option key={i} value={i}>{i + 1}. {g.slice(0, 50)}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="ev-ses" className="text-xs">الجلسة (اختياري)</Label><select id="ev-ses" className={selectCls("w-full")} value={v.session_id} onChange={(e) => setV({ ...v, session_id: e.target.value })}><option value="">بدون جلسة</option>{(r.sessions ?? []).map((s) => <option key={s.id} value={s.id}>{s.session_date} · {s.activity.slice(0, 40)}</option>)}</select></div>
      </div>
      {mode === "upload" ? <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"><Camera className="size-4" />تصوير بالكاميرا<input type="file" accept="image/*" capture="environment" className="sr-only" aria-label="تصوير صفحة بالكاميرا" onChange={(e) => { add(e.target.files); e.target.value = ""; }} /></label>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm"><Paperclip className="size-4" />اختيار صور أو PDF<input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="sr-only" aria-label="اختيار صور أو PDF" onChange={(e) => { add(e.target.files); e.target.value = ""; }} /></label>
        </div>
        {pages.length > 0 && <ol className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4" aria-label="صفحات الدليل">{pages.map((p, i) => <li key={p.key} className="space-y-1 rounded-md border bg-background p-2">
          <div className="flex h-36 items-center justify-center overflow-hidden rounded bg-muted">{p.file.type.startsWith("image/") ? <img src={p.url} alt={`صفحة ${i + 1}`} className="max-h-36 max-w-full object-contain transition-transform" style={{ transform: `rotate(${p.rot}deg)` }} /> : <FileText className="size-10 text-muted-foreground" />}</div>
          <p className="truncate text-xs">{i + 1}. {p.file.name}</p>
          <div className="flex justify-between"><Button type="button" size="icon" variant="ghost" aria-label={`تدوير الصفحة ${i + 1}`} disabled={!p.file.type.startsWith("image/")} onClick={() => setPages(pages.map((x) => (x.key === p.key ? { ...x, rot: x.rot + 90 } : x)))}><RotateCw className="size-4" /></Button><Button type="button" size="icon" variant="ghost" aria-label={`تقديم الصفحة ${i + 1}`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></Button><Button type="button" size="icon" variant="ghost" aria-label={`تأخير الصفحة ${i + 1}`} disabled={i === pages.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></Button><Button type="button" size="icon" variant="ghost" aria-label={`حذف الصفحة ${i + 1}`} onClick={() => setPages(pages.filter((x) => x.key !== p.key))}><Trash2 className="size-4" /></Button></div>
        </li>)}</ol>}
      </div> : <div className="space-y-1"><Label htmlFor="ev-link" className="text-xs">الواجب أو الاختبار</Label><select id="ev-link" className={selectCls("w-full sm:w-96")} value={v.link} onChange={(e) => setV({ ...v, link: e.target.value })}><option value="">{links.isLoading ? "جارٍ التحميل…" : links.data?.length ? "اختر" : "لا توجد واجبات أو اختبارات منشورة في هذا المقرر"}</option>{links.data?.map((l) => <option key={l.id} value={l.id}>{l.type === "exam" ? "اختبار" : "واجب"}: {l.title}</option>)}</select><p className="text-xs text-muted-foreground">الربط مرجع فقط؛ لا يغيّر الدرجة ولا يعيد رصدها.</p></div>}
      <Input aria-label="ملاحظة على الدليل" placeholder="ملاحظة (اختياري)" maxLength={2000} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
      <Button disabled={busy || !ready} onClick={() => void save()}>{busy ? "جارٍ الحفظ…" : "حفظ الدليل"}</Button>
      <p className="text-xs text-muted-foreground">تُحفظ الملفات في تخزين خاص، ولا تُفتح إلا لمن يملك صلاحية الخطة عبر رابط مؤقت.</p>
    </div>}
    {!ev.length ? <p className="text-sm text-muted-foreground">لا توجد أدلة بعد.</p> : <ul className="space-y-2">{[...ev].reverse().map((e: Evidence) => <li key={e.id} className="rounded-lg border p-3 text-sm"><p className="font-medium">{e.title}{e.shared && <span className="ms-2 text-xs text-primary">· مشترك مع ولي الأمر</span>}</p><p className="text-xs text-muted-foreground">{e.goal_index === null ? "الخطة عامة" : `الهدف ${e.goal_index + 1}`}{e.session_id ? ` · جلسة ${(r.sessions ?? []).find((s) => s.id === e.session_id)?.session_date ?? ""}` : ""} · {e.actor_name} · {schoolTime(e.created_at)}</p>
      {e.kind === "link" ? <p className="mt-1 flex items-center gap-1"><Link2 className="size-4" />{e.link_type === "exam" ? "اختبار" : "واجب"}: {e.link_title ?? "—"}</p> : <div className="mt-2 flex flex-wrap gap-2">{e.files.map((f, i) => <Button key={f.id} size="sm" variant="outline" onClick={() => void openEvidenceFile(f.path, f.name)}><FileText className="size-4" />صفحة {i + 1}</Button>)}</div>}
      {e.note && <p className="mt-1 text-muted-foreground">{e.note}</p>}{canAdd && r.kind === "student_plan" && r.shared && <label className="mt-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={e.shared} disabled={busy} onChange={async (x) => { setBusy(true); try { await rpc("edu_evidence_share", { _ev: e.id, _shared: x.target.checked }); await refresh(); } catch (err) { toast.error(arabicError(err)); } finally { setBusy(false); } }} />مشاركة هذا الدليل مع ولي الأمر</label>}</li>)}</ul>}
  </div>;
}
