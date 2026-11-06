import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { arabicError, type AppContext } from "@/lib/session";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { PRIO, useCategories } from "@/components/support/support";
import { RoutePicker, useRouteDepts, type RouteCand } from "@/components/support/route-picker";
import { DraftFiles, type DraftFile } from "@/components/support/draft-files";

// Internal ticket opened by the org owner / principal for one branch: branch → department (optional) → person (optional) + attachments.
// support_open re-checks branch/department/assignee/files and is idempotent by client key.
export function InternalTicket({ ctx, onDone, onCancel, onOwn }: { ctx: AppContext; onDone: (id: string) => void; onCancel: () => void; onOwn: () => void }) {
  const owner = ctx.role === "org_owner";
  const [school, setSchool] = useState<string>(owner ? "" : ctx.schoolId ?? "");
  const [title, setTitle] = useState(""); const [body, setBody] = useState("");
  const [prio, setPrio] = useState("normal"); const [cat, setCat] = useState("");
  const [dept, setDept] = useState(""); const [who, setWho] = useState<RouteCand | null>(null);
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [review, setReview] = useState(false); const [busy, setBusy] = useState(false);
  const key = useMemo(() => crypto.randomUUID(), []);
  const cats = useCategories("school", ctx.orgId);
  const depts = useRouteDepts(school);
  const branches = useQuery({ enabled: owner && !!ctx.orgId, queryKey: ["support-branches", ctx.orgId], queryFn: async () => ((await db.from("schools").select("id, name").eq("org_id", ctx.orgId!).eq("is_active", true).order("name")).data ?? []) as { id: string; name: string }[] });
  const schoolName = owner ? branches.data?.find((s) => s.id === school)?.name : ctx.schoolName;
  const uploading = files.some((f) => f.state === "uploading"), failed = files.some((f) => f.state === "failed");

  async function changeSchool(v: string) {
    for (const f of files) if (f.id) await db.rpc("support_release_file", { _file: f.id });
    setSchool(v); setDept(""); setWho(null); setFiles([]);
    if (who) toast.message("أُزيل المسؤول المختار؛ اختره من جديد في الفرع الجديد");
  }
  function check() {
    if (!school) return void toast.error("اختر المدرسة أو الفرع أولًا");
    if (title.trim().length < 3) return void toast.error("اكتب عنوانًا واضحًا");
    if (body.trim().length < 5) return void toast.error("اكتب وصفًا للمشكلة");
    if (uploading || failed) return void toast.error("انتظر اكتمال رفع الملفات أو أزل الفاشل منها");
    setReview(true);
  }
  async function submit() {
    setBusy(true);
    const { data, error } = await db.rpc("support_open" as never, { _school: school, _title: title, _body: body, _priority: prio, _category: cat || null, _assignee: who?.user_id ?? null, _client_key: key, _dept: dept || null, _files: files.filter((f) => f.id).map((f) => f.id) } as never);
    setBusy(false);
    if (error) { setReview(false); return void toast.error(arabicError(error)); }
    toast.success(who ? `أُنشئت التذكرة وأُسندت إلى ${who.name}` : "أُنشئت التذكرة في قائمة غير المسندة");
    onDone(data as unknown as string);
  }
  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2"><p className="flex-1 font-semibold">تذكرة داخلية لفرع</p><Button size="sm" variant="ghost" onClick={onOwn}>{owner ? "تذكرة لدعم المنصة" : "تذكرة أخرى"}</Button></div>
      <div className="space-y-1"><Label htmlFor="it-school">المدرسة / الفرع</Label>
        {owner ? <select id="it-school" className={selectCls()} value={school} disabled={review} onChange={(e) => void changeSchool(e.target.value)}><option value="">اختر</option>{(branches.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          : <Input id="it-school" readOnly value={ctx.schoolName} />}
      </div>
      <fieldset disabled={review} className="space-y-4">
        <div className="space-y-1"><Label htmlFor="it-title">العنوان</Label><Input id="it-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="it-body">الوصف</Label><Textarea id="it-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="it-cat">تصنيف المشكلة</Label><select id="it-cat" className={selectCls()} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">بدون</option>{(cats.data ?? []).filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="space-y-1"><Label htmlFor="it-prio">الأولوية</Label><select id="it-prio" className={selectCls()} value={prio} onChange={(e) => setPrio(e.target.value)}>{Object.entries(PRIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        </div>
        <RoutePicker school={school} dept={dept} onDept={setDept} who={who} onWho={setWho} />
      </fieldset>
      {!review && <DraftFiles school={school} files={files} setFiles={setFiles} />}
      {review ? (
        <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-sm" aria-label="ملخص التذكرة">
          <p className="font-semibold">راجع قبل الحفظ</p>
          <p>الفرع: <b>{schoolName ?? "—"}</b></p>
          <p>القسم الموجّه إليه: <b>{depts.data?.find((d) => d.id === dept)?.name ?? "بدون قسم"}</b></p>
          <p>المسؤول: <b>{who ? `${who.name} · ${ROLE_LABELS[who.role as Role] ?? who.role}` : "بلا مسؤول (قائمة غير المسندة)"}</b></p>
          <p>المرفقات: <b>{files.length ? files.map((f) => f.file.name).join("، ") : "لا يوجد"}</b></p>
          <div className="flex flex-wrap gap-2 pt-1"><Button disabled={busy} onClick={submit}>تأكيد وإنشاء التذكرة</Button><Button variant="outline" disabled={busy} onClick={() => setReview(false)}>تعديل</Button></div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={uploading || failed} onClick={check}>متابعة للمراجعة</Button><Button variant="outline" onClick={onCancel}>إلغاء</Button>
          {(uploading || failed) && <span className="text-xs text-muted-foreground">{uploading ? "بانتظار اكتمال رفع الملفات" : "أعد رفع الملف الفاشل أو أزله"}</span>}
        </div>
      )}
    </div>
  );
}
