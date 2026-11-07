import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { selectCls } from "@/components/ui/native-select";
import { LoadingState, Section } from "@/components/states";
import { arabicError } from "@/lib/session";

type Bank = { bank: string; holder: string; iban: string };
type PayLink = { label: string; url: string };
const ERR: Record<string, string> = {
  invalid_iban: "رقم الآيبان يجب أن يبدأ بـ SA ويليه 22 رقمًا.", invalid_url: "رابط السداد يجب أن يبدأ بـ https://",
  bank_required: "اكتب اسم البنك واسم صاحب الحساب.", label_required: "اكتب اسمًا لرابط السداد.", not_allowed: "هذا الإعداد لمالك المجموعة فقط.",
};
const msg = (e: unknown) => { const m = String((e as Error)?.message ?? ""); const k = Object.keys(ERR).find((x) => m.includes(x)); return k ? ERR[k]! : arabicError(e); };

/** Branch bank accounts & payment links (owner only; fin_pay_save validates and logs). Shown to guardians per child's school. */
export function FinPaySettings({ orgId }: { orgId: string }) {
  const schools = useQuery({
    queryKey: ["org-schools", orgId],
    queryFn: async () => {
      const { data, error } = await db.from("schools").select("id, name").eq("org_id", orgId).eq("is_active", true).order("name");
      if (error) throw error;
      return data as Row[];
    },
  });
  const [school, setSchool] = useState("");
  useEffect(() => { if (!school && schools.data?.[0]) setSchool(schools.data[0]["id"]); }, [schools.data, school]);
  return (
    <Section title="الحسابات البنكية وروابط السداد" desc="تظهر لأولياء الأمور بحسب مدرسة كل ابن. تأكيد الدفع يأتي من النظام المالي فقط، لا من فتح الرابط.">
      {schools.isLoading ? <LoadingState rows={2} /> : (
        <div className="space-y-4 rounded-2xl border bg-card p-5">
          <div className="space-y-1">
            <Label htmlFor="fp-school">الفرع</Label>
            <select id="fp-school" className={selectCls("w-full max-w-sm")} value={school} onChange={(e) => setSchool(e.target.value)}>
              {schools.data?.map((s) => <option key={s["id"]} value={s["id"]}>{s["name"]}</option>)}
            </select>
          </div>
          {school && <Editor key={school} school={school} />}
        </div>
      )}
    </Section>
  );
}

function Editor({ school }: { school: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["fin-pay", school],
    queryFn: async () => {
      const { data, error } = await db.rpc("fin_pay_get", { _school: school });
      if (error) throw error;
      return data as { banks: Bank[]; links: PayLink[]; note: string | null; updated_at: string | null };
    },
  });
  const [banks, setBanks] = useState<Bank[]>([]);
  const [links, setLinks] = useState<PayLink[]>([]);
  const [note, setNote] = useState("");
  useEffect(() => { if (q.data) { setBanks(q.data.banks); setLinks(q.data.links); setNote(q.data.note ?? ""); } }, [q.data]);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("fin_pay_save", { _school: school, _p: { banks, links, note } });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("حُفظت إعدادات السداد للفرع"); qc.invalidateQueries({ queryKey: ["fin-pay", school] }); },
    onError: (e) => toast.error(msg(e)),
  });
  if (q.isLoading) return <LoadingState rows={2} />;
  const setB = (i: number, k: keyof Bank, v: string) => setBanks((b) => b.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const setL = (i: number, k: keyof PayLink, v: string) => setLinks((b) => b.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="font-semibold">الحسابات البنكية</p>
        {banks.map((b, i) => (
          <div key={i} className="grid gap-2 md:grid-cols-[1fr_1fr_1.4fr_auto]">
            <Input aria-label="اسم البنك" placeholder="اسم البنك" value={b.bank} onChange={(e) => setB(i, "bank", e.target.value)} />
            <Input aria-label="اسم صاحب الحساب" placeholder="اسم صاحب الحساب" value={b.holder} onChange={(e) => setB(i, "holder", e.target.value)} />
            <Input aria-label="رقم الآيبان" placeholder="SA…" dir="ltr" value={b.iban} onChange={(e) => setB(i, "iban", e.target.value)} />
            <Button variant="ghost" size="icon" aria-label="حذف الحساب" onClick={() => setBanks((x) => x.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
          </div>
        ))}
        {banks.length < 5 && <Button variant="outline" size="sm" onClick={() => setBanks((x) => [...x, { bank: "", holder: "", iban: "" }])}><Plus className="size-4" />إضافة حساب</Button>}
      </div>
      <div className="space-y-2">
        <p className="font-semibold">روابط السداد</p>
        {links.map((l, i) => (
          <div key={i} className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
            <Input aria-label="اسم الرابط" placeholder="مثال: سداد الرسوم" value={l.label} onChange={(e) => setL(i, "label", e.target.value)} />
            <Input aria-label="رابط السداد" placeholder="https://" dir="ltr" value={l.url} onChange={(e) => setL(i, "url", e.target.value)} />
            <Button variant="ghost" size="icon" aria-label="حذف الرابط" onClick={() => setLinks((x) => x.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
          </div>
        ))}
        {links.length < 5 && <Button variant="outline" size="sm" onClick={() => setLinks((x) => [...x, { label: "", url: "" }])}><Plus className="size-4" />إضافة رابط</Button>}
      </div>
      <div className="space-y-1">
        <Label htmlFor="fp-note">ملاحظة لأولياء الأمور (اختياري)</Label>
        <Textarea id="fp-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "جارٍ الحفظ…" : "حفظ إعدادات الفرع"}</Button>
    </div>
  );
}
