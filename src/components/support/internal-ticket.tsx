import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { arabicError, type AppContext } from "@/lib/session";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { PRIO, useCategories } from "@/components/support/support";

// Internal ticket opened by the org owner / principal for one branch, optionally assigned at once.
// Who may be assigned comes only from support_new_candidates; support_open re-checks it and is idempotent by client key.
type Cand = { user_id: string; name: string; role: string; school_name: string };
export function InternalTicket({ ctx, onDone, onCancel, onOwn }: { ctx: AppContext; onDone: (id: string) => void; onCancel: () => void; onOwn: () => void }) {
  const owner = ctx.role === "org_owner";
  const [school, setSchool] = useState<string>(owner ? "" : ctx.schoolId ?? "");
  const [title, setTitle] = useState(""); const [body, setBody] = useState("");
  const [prio, setPrio] = useState("normal"); const [cat, setCat] = useState("");
  const [q, setQ] = useState(""); const [who, setWho] = useState<Cand | null>(null); const [busy, setBusy] = useState(false);
  const key = useMemo(() => crypto.randomUUID(), []);
  const cats = useCategories("school", ctx.orgId);
  const branches = useQuery({ enabled: owner && !!ctx.orgId, queryKey: ["support-branches", ctx.orgId], queryFn: async () => ((await db.from("schools").select("id, name").eq("org_id", ctx.orgId!).eq("is_active", true).order("name")).data ?? []) as { id: string; name: string }[] });
  const cands = useQuery({ enabled: !!school && q.trim().length >= 2, queryKey: ["support-new-cands", school, q], queryFn: async () => { const { data, error } = await db.rpc("support_new_candidates" as never, { _school: school, _q: q.trim() } as never); if (error) throw error; return data as unknown as Cand[]; } });
  async function submit() {
    if (!school) return void toast.error("اختر المدرسة أو الفرع أولًا");
    setBusy(true);
    const { data, error } = await db.rpc("support_open" as never, { _school: school, _title: title, _body: body, _priority: prio, _category: cat || null, _assignee: who?.user_id ?? null, _client_key: key } as never);
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    toast.success(who ? `أُنشئت التذكرة وأُسندت إلى ${who.name}` : "أُنشئت التذكرة في قائمة الانتظار");
    onDone(data as unknown as string);
  }
  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2"><p className="flex-1 font-semibold">تذكرة داخلية لفرع</p><Button size="sm" variant="ghost" onClick={onOwn}>{owner ? "تذكرة لدعم المنصة" : "تذكرة أخرى"}</Button></div>
      <div className="space-y-1"><Label htmlFor="it-school">المدرسة / الفرع</Label>
        {owner ? <select id="it-school" className={selectCls()} value={school} onChange={(e) => { setSchool(e.target.value); setWho(null); }}><option value="">اختر</option>{(branches.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          : <Input id="it-school" readOnly value={ctx.schoolName} />}
      </div>
      <div className="space-y-1"><Label htmlFor="it-title">العنوان</Label><Input id="it-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="space-y-1"><Label htmlFor="it-body">الوصف</Label><Textarea id="it-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="it-cat">التصنيف</Label><select id="it-cat" className={selectCls()} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">بدون</option>{(cats.data ?? []).filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="it-prio">الأولوية</Label><select id="it-prio" className={selectCls()} value={prio} onChange={(e) => setPrio(e.target.value)}>{Object.entries(PRIO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
      </div>
      <div className="space-y-2"><Label htmlFor="it-who">المسؤول (اختياري — بدون مسؤول تدخل قائمة الانتظار)</Label>
        {who ? <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm">{who.name} · {ROLE_LABELS[who.role as Role] ?? who.role} · {who.school_name}<button type="button" aria-label="إزالة المسؤول" onClick={() => setWho(null)}><X className="size-3" /></button></span> : <>
          <Input id="it-who" disabled={!school} placeholder={school ? "ابحث بالاسم (حرفان على الأقل)" : "اختر الفرع أولًا"} value={q} onChange={(e) => setQ(e.target.value)} />
          {(cands.data ?? []).length > 0 && <ul className="max-h-56 overflow-auto rounded-lg border text-sm">{cands.data!.map((c) => <li key={c.user_id}><button type="button" className="flex w-full gap-2 border-b p-2 text-start hover:bg-muted" onClick={() => { setWho(c); setQ(""); }}><span className="flex-1">{c.name}</span><span className="text-xs text-muted-foreground">{ROLE_LABELS[c.role as Role] ?? c.role} · {c.school_name}</span></button></li>)}</ul>}
          {q.trim().length >= 2 && cands.data?.length === 0 && <p className="text-xs text-muted-foreground">لا يوجد مؤهلون بهذا الاسم.</p>}</>}
      </div>
      <p className="text-xs text-muted-foreground">المرفقات تُضاف من صفحة التذكرة بعد إنشائها.</p>
      <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={submit}>إنشاء التذكرة</Button><Button variant="outline" onClick={onCancel}>إلغاء</Button></div>
    </div>
  );
}
