import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, UserRound, X } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { arabicError } from "@/lib/session";

export const GUARDIAN_REL: Record<string, string> = { father: "الأب", mother: "الأم", brother: "الأخ", sister: "الأخت", other: "أخرى" };
const clean = (s: string) => s.replace(/[,()*%\\]/g, " ").trim();

/** Linked guardians of one student + add another (father and mother each keep their own record/login). */
export function StudentGuardianLinks({ schoolId, studentId, onLinked }: { schoolId: string; studentId: string; onLinked?: () => void }) {
  const qc = useQueryClient();
  const links = useQuery({ queryKey: ["sg-links", studentId], queryFn: async () => { const { data, error } = await db.from("student_guardians").select("id, guardian_id, relationship, can_follow, can_pickup, guardians(full_name, national_id, user_id)").eq("student_id", studentId); if (error) throw error; return data as Row[]; } });
  const [q, setQ] = useState(""); const [pick, setPick] = useState<Row | null>(null);
  const [rel, setRel] = useState(""); const [follow, setFollow] = useState(true); const [pickup, setPickup] = useState(false); const [busy, setBusy] = useState(false);
  const linked = new Set((links.data ?? []).map((l) => l["guardian_id"] as string));
  const cands = useQuery({ enabled: clean(q).length >= 2, queryKey: ["sg-cands", schoolId, clean(q)], queryFn: async () => { const t = clean(q); const { data, error } = await db.from("guardians").select("id, full_name, national_id, phone").eq("school_id", schoolId).or(`full_name.ilike.*${t}*,national_id.ilike.${t}*`).order("full_name").limit(15); if (error) throw error; return data as Row[]; } });
  async function add() {
    if (!pick || !rel) return;
    setBusy(true);
    const { error } = await db.from("student_guardians").insert({ student_id: studentId, guardian_id: pick["id"], school_id: schoolId, relationship: rel, can_follow: follow, can_pickup: pickup });
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    toast.success(`تم ربط ${pick["full_name"]}`); setPick(null); setQ(""); setRel("");
    await qc.invalidateQueries(); onLinked?.();
  }
  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h3 className="text-sm font-bold">أولياء الأمور المرتبطون</h3>
        {links.isLoading ? <p className="text-xs text-muted-foreground">جارٍ التحميل…</p> : links.error ? <p className="text-xs text-destructive">{arabicError(links.error)}</p> : !links.data?.length ? <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">لا يوجد ولي أمر مرتبط بعد</p> : (
          <ul className="divide-y rounded-lg border">{links.data.map((l) => (
            <li key={l["id"]} className="flex items-center gap-3 p-3 text-sm">
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><UserRound className="size-4" /></span>
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{l["guardians"]?.full_name}</span><span className="block text-xs text-muted-foreground">{GUARDIAN_REL[l["relationship"]] ?? l["relationship"]}{l["guardians"]?.national_id ? <> · <span dir="ltr">{l["guardians"].national_id}</span></> : null}</span></span>
              <span className="flex shrink-0 flex-wrap gap-1 text-xs">{l["can_follow"] && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">متابعة</span>}{l["can_pickup"] && <span className="rounded-full bg-secondary px-2 py-0.5">استلام</span>}<span className={`rounded-full px-2 py-0.5 ${l["guardians"]?.user_id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{l["guardians"]?.user_id ? "له حساب" : "بلا حساب"}</span></span>
            </li>))}</ul>)}
      </section>
      <section className="space-y-2 rounded-lg border bg-muted/30 p-3">
        <h3 className="text-sm font-bold">إضافة ولي أمر آخر</h3>
        <p className="text-xs text-muted-foreground">لكل ولي أمر (الأب، الأم…) سجلّه وحسابه المستقل.</p>
        {pick ? (
          <div className="flex items-center justify-between rounded-md border bg-background p-2 text-sm"><span>{pick["full_name"]} {pick["national_id"] && <span dir="ltr" className="text-xs text-muted-foreground">{pick["national_id"]}</span>}</span><Button variant="ghost" size="icon" aria-label="تغيير ولي الأمر" onClick={() => setPick(null)}><X className="size-4" /></Button></div>
        ) : (<>
          <div className="relative"><Search className="absolute start-3 top-2.5 size-4 text-muted-foreground" /><Input aria-label="ابحث عن ولي أمر" className="ps-9" placeholder="ابحث بالاسم أو رقم الهوية…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {cands.data && <ul className="max-h-40 divide-y overflow-y-auto rounded-md border bg-background">{cands.data.length === 0 && <li className="p-2 text-xs text-muted-foreground">لا يوجد ولي أمر مطابق — أضفه أولًا من «ولي الأمر» أو صفحة أولياء الأمور.</li>}{cands.data.map((g) => (
            <li key={g["id"]}><button type="button" disabled={linked.has(g["id"])} className="w-full p-2 text-start text-sm hover:bg-muted disabled:opacity-50" onClick={() => setPick(g)}>{g["full_name"]} {g["national_id"] && <span dir="ltr" className="text-xs text-muted-foreground">{g["national_id"]}</span>}{linked.has(g["id"]) && <span className="text-xs text-muted-foreground"> · مرتبط</span>}</button></li>))}</ul>}
        </>)}
        <div className="flex flex-wrap items-center gap-3">
          <select aria-label="صلة القرابة" className={selectCls("w-auto")} value={rel} onChange={(e) => setRel(e.target.value)}><option value="">صلة القرابة</option>{Object.entries(GUARDIAN_REL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={follow} onChange={(e) => setFollow(e.target.checked)} />متابعة الطالب</label>
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="size-4 accent-primary" checked={pickup} onChange={(e) => setPickup(e.target.checked)} />مفوّض بالاستلام</label>
          <Button className="ms-auto" disabled={busy || !pick || !rel} onClick={() => void add()}><Plus className="size-4" />ربط</Button>
        </div>
      </section>
    </div>
  );
}

/** Pick one or more students (with relationship each) for one guardian. */
export function StudentMultiPick({ schoolId, value, onChange }: { schoolId: string; value: { id: string; name: string; rel: string }[]; onChange: (v: { id: string; name: string; rel: string }[]) => void }) {
  const [q, setQ] = useState("");
  const res = useQuery({ enabled: clean(q).length >= 2, queryKey: ["sg-stu", schoolId, clean(q)], queryFn: async () => { const t = clean(q); const { data, error } = await db.from("students").select("id, full_name, national_id").eq("school_id", schoolId).or(`full_name.ilike.*${t}*,national_id.ilike.${t}*`).order("full_name").limit(15); if (error) throw error; return data as Row[]; } });
  const has = new Set(value.map((v) => v.id));
  return (
    <div className="space-y-2">
      {value.length > 0 && <ul className="space-y-1">{value.map((v, i) => (
        <li key={v.id} className="flex items-center gap-2 rounded-md border bg-background p-2 text-sm"><span className="min-w-0 flex-1 truncate">{v.name}</span>
          <select aria-label={`صلة القرابة بـ ${v.name}`} className={selectCls("w-auto")} value={v.rel} onChange={(e) => onChange(value.map((x, j) => j === i ? { ...x, rel: e.target.value } : x))}>{Object.entries(GUARDIAN_REL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <Button variant="ghost" size="icon" aria-label={`إزالة ${v.name}`} onClick={() => onChange(value.filter((x) => x.id !== v.id))}><X className="size-4" /></Button></li>))}</ul>}
      <div className="relative"><Search className="absolute start-3 top-2.5 size-4 text-muted-foreground" /><Input aria-label="ابحث عن طالب" className="ps-9" placeholder="ابحث عن الأبناء بالاسم أو الهوية…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {res.data && <ul className="max-h-40 divide-y overflow-y-auto rounded-md border bg-background">{res.data.length === 0 && <li className="p-2 text-xs text-muted-foreground">لا يوجد طالب مطابق.</li>}{res.data.map((s) => (
        <li key={s["id"]}><button type="button" disabled={has.has(s["id"])} className="w-full p-2 text-start text-sm hover:bg-muted disabled:opacity-50" onClick={() => { onChange([...value, { id: s["id"], name: s["full_name"], rel: "father" }]); setQ(""); }}>{s["full_name"]} {s["national_id"] && <span dir="ltr" className="text-xs text-muted-foreground">{s["national_id"]}</span>}</button></li>))}</ul>}
    </div>
  );
}
