import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { ask, askText } from "@/components/confirm";
import { LoadingState } from "@/components/states";
import { fmt } from "@/components/admin/shared";
import { arabicError } from "@/lib/session";
import { usePcForms, type Row } from "@/components/procurement/shared";
import { useInvalidate } from "@/components/procurement/custody";

const TYPES: Record<string, string> = { text: "نص قصير", longtext: "نص طويل", number: "رقم", date: "تاريخ", choice: "قائمة اختيار", file: "مرفق" };
const move = <T,>(a: T[], i: number, d: number) => { const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return a; [b[i], b[j]] = [b[j]!, b[i]!]; return b; };

/** Invoice form versions: edit a draft (order, labels, help, required, extra fields), preview, then publish. Financial fields stay protected on the server. */
export function FormBuilder({ orgId }: { orgId: string }) {
  const forms = usePcForms(orgId);
  const inv = useInvalidate();
  const [core, setCore] = useState<Row[]>([]);
  const [fields, setFields] = useState<Row[]>([]);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const draft = forms.data?.versions.find((v) => v.status === "draft");
  const pub = forms.data?.versions.find((v) => v.status === "published");
  useEffect(() => {
    if (!forms.data) return;
    const base = draft ?? pub;
    setCore(base?.core ?? forms.data.default_core);
    setFields((base?.fields ?? []).map((f: Row) => ({ ...f, optionsText: (f.options ?? []).join("، ") })));
  }, [forms.data, draft?.id, pub?.id]);
  if (forms.isLoading || !forms.data) return <LoadingState />;
  const body = () => fields.map((f) => ({ key: f.key, label: f.label, help: f.help, type: f.type, required: f.required, options: f.type === "choice" ? String(f.optionsText ?? "").split(/[،,]/).map((x: string) => x.trim()).filter(Boolean) : [] }));
  async function save() {
    setBusy(true);
    const { error } = await db.rpc("pc_form_save", { _org: orgId, _core: core.map((c) => ({ key: c.key, label: c.label, help: c.help, required: c.required, hidden: !!c.hidden })), _fields: body(), _note: null });
    setBusy(false);
    if (error) toast.error(arabicError(error)); else { toast.success("حُفظت المسودة"); inv(); }
  }
  async function publish() {
    const why = await askText("سبب النشر (يُحفظ في السجل). يؤثر في الفواتير الجديدة فقط.", { required: true }); if (!why) return;
    setBusy(true);
    const s = await db.rpc("pc_form_save", { _org: orgId, _core: core.map((c) => ({ key: c.key, label: c.label, help: c.help, required: c.required, hidden: !!c.hidden })), _fields: body(), _note: null });
    const { error } = s.error ? s : await db.rpc("pc_form_publish", { _org: orgId, _reason: why });
    setBusy(false);
    if (error) toast.error(arabicError(error)); else { toast.success("نُشر الإصدار الجديد"); inv(); }
  }
  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5 lg:col-span-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold">نموذج إدخال الفواتير</h3>
        <span className="text-xs text-muted-foreground">{pub ? `المنشور: الإصدار ${pub.version} (${fmt(pub.published_at)} — ${pub.published_by})` : "لا يوجد إصدار منشور — يُستخدم النموذج الافتراضي"}{draft ? ` · مسودة الإصدار ${draft.version}` : ""}</span>
        <span className="ms-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setPreview(!preview)}>{preview ? "إخفاء المعاينة" : "معاينة"}</Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void save()}>حفظ مسودة</Button>
          <Button size="sm" disabled={busy} onClick={() => void publish()}>نشر</Button>
          {draft && <Button size="sm" variant="ghost" onClick={async () => { if (await ask("حذف المسودة؟ الإصدار المنشور لا يتأثر.")) { const { error } = await db.rpc("pc_form_discard", { _org: orgId }); if (error) toast.error(arabicError(error)); else inv(); } }}>حذف المسودة</Button>}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">الحقول المالية والروابط (البيان، المورد، تاريخ الشراء، البنود، الضريبة، الفرع المستفيد) محمية: يمكن تسميتها وترتيبها ووصفها فقط، وباقي الحقول يمكن حذفها من النموذج أو إعادتها، ويمكن إضافة حقول جديدة. لا تُقبل الرموز أو الصيغ. النموذج لا يمنح صلاحيات ولا يتجاوز الاعتماد.</p>
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">الحقول الأساسية</h4>
        {core.map((c, i) => (
          <div key={c.key} className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 ${c.hidden ? "opacity-50" : ""}`}>
            <span className="flex flex-col"><Button size="icon" variant="ghost" aria-label="أعلى" onClick={() => setCore(move(core, i, -1))}><ArrowUp className="size-3" /></Button><Button size="icon" variant="ghost" aria-label="أسفل" onClick={() => setCore(move(core, i, 1))}><ArrowDown className="size-3" /></Button></span>
            <Input className="w-44" value={c.label} onChange={(e) => setCore(core.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label="التسمية" />
            <Input className="min-w-40 flex-1" placeholder="وصف مساعد" value={c.help ?? ""} onChange={(e) => setCore(core.map((x, j) => (j === i ? { ...x, help: e.target.value } : x)))} aria-label="الوصف" />
            {c.protected ? <span className="text-xs text-muted-foreground">محمي</span>
              : <>{!c.hidden && <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!c.required} onChange={(e) => setCore(core.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} /> إلزامي</label>}
                <Button size="sm" variant="ghost" onClick={() => setCore(core.map((x, j) => (j === i ? { ...x, hidden: !x.hidden, required: false } : x)))}>{c.hidden ? <><Plus className="size-4" />إعادة الحقل</> : <><Trash2 className="size-4" />حذف من النموذج</>}</Button></>}
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">حقول إضافية</h4>
        {fields.map((f, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
            <span className="flex flex-col"><Button size="icon" variant="ghost" aria-label="أعلى" onClick={() => setFields(move(fields, i, -1))}><ArrowUp className="size-3" /></Button><Button size="icon" variant="ghost" aria-label="أسفل" onClick={() => setFields(move(fields, i, 1))}><ArrowDown className="size-3" /></Button></span>
            <Input className="w-44" placeholder="اسم الحقل" value={f.label} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label="اسم الحقل" />
            <select className={selectCls("w-32")} value={f.type} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, type: e.target.value } : x)))} aria-label="النوع">{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            {f.type === "choice" && <Input className="w-48" placeholder="الخيارات مفصولة بفاصلة" value={f.optionsText ?? ""} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, optionsText: e.target.value } : x)))} aria-label="الخيارات" />}
            <Input className="min-w-32 flex-1" placeholder="وصف مساعد" value={f.help ?? ""} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, help: e.target.value } : x)))} aria-label="الوصف" />
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={!!f.required} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} /> إلزامي</label>
            <Button size="icon" variant="ghost" aria-label="حذف الحقل" onClick={() => setFields(fields.filter((_, j) => j !== i))}><Trash2 className="size-4" /></Button>
          </div>
        ))}
        {fields.length < 20 && <Button size="sm" variant="outline" onClick={() => setFields([...fields, { label: "", type: "text", required: false, help: "" }])}><Plus className="size-4" />حقل</Button>}
      </div>
      {preview && (
        <div className="space-y-2 rounded-xl border border-dashed p-4">
          <p className="text-xs font-semibold text-muted-foreground">معاينة (كما يراها مسجّل الفاتورة)</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {core.filter((c) => !c.hidden).map((c) => <div key={c.key}><Label>{c.label}{c.required && !c.protected ? " *" : ""}</Label><Input disabled placeholder={c.key === "lines" ? "بنود ومبالغ…" : ""} />{c.help && <p className="text-xs text-muted-foreground">{c.help}</p>}</div>)}
            {fields.map((f, i) => <div key={i}><Label>{f.label || "—"}{f.required ? " *" : ""}</Label>{f.type === "choice" ? <select disabled className={selectCls()}><option>{String(f.optionsText ?? "").split(/[،,]/)[0] ?? ""}</option></select> : <Input disabled placeholder={TYPES[f.type]} />}{f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}</div>)}
          </div>
        </div>
      )}
      {forms.data.versions.filter((v) => v.status !== "draft").length > 0 && (
        <details className="text-sm"><summary className="cursor-pointer">الإصدارات السابقة</summary>
          <ul className="mt-1 space-y-0.5">{forms.data.versions.filter((v) => v.status !== "draft").map((v) => <li key={v.id}>الإصدار {v.version} — {v.status === "published" ? "منشور" : "مؤرشف"} · {fmt(v.published_at)} · {v.fields.length} حقل إضافي</li>)}</ul>
        </details>
      )}
    </section>
  );
}
