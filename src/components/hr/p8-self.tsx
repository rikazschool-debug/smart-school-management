// Employee self-service for HR extensions: own housing, own insurance coverage, own published performance results.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState, Section } from "@/components/states";
import { arabicError } from "@/lib/session";
import { rpc } from "@/components/hr/shared";
import { Pill, sar } from "@/components/hr/money";

const REL: Record<string, string> = { spouse: "زوج/زوجة", son: "ابن", daughter: "ابنة", father: "أب", mother: "أم", other: "أخرى" };
const IN_ST: Record<string, string> = { active: "سارية", expiring: "تقترب من الانتهاء", pending: "لم تبدأ", expired: "انتهت الوثيقة", ended: "منتهية" };

export function MyHousing({ org }: { org: string }) {
  const q = useQuery({ queryKey: ["hr-hs-my", org], refetchInterval: 30_000, queryFn: () => rpc<{ enabled: boolean; stays: { property: string; address: string | null; unit: string; start_date: string; end_date: string | null; end_kind: string | null }[] }>("hr_hs_my", { _org: org }) });
  if (q.isLoading) return <LoadingState rows={2} />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data!;
  if (!d.enabled) return <EmptyState title="خدمة السكن غير مفعّلة في مؤسستك" />;
  if (!d.stays.length) return <EmptyState title="لا يوجد تسكين مسجّل لك" />;
  return (
    <Section title="سكني" desc="بيانات تسكينك فقط كما سجّلتها الموارد البشرية.">
      <ul className="space-y-2">{d.stays.map((s, i) => <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-sm">
        <span className="flex-1"><b>{s.property}</b> — وحدة {s.unit}<span className="block text-xs text-muted-foreground">{s.address ?? ""} · من {s.start_date}{s.end_date ? ` إلى ${s.end_date}` : ""}</span></span>
        <Pill tone={s.end_date ? "muted" : "ok"}>{s.end_date ? (s.end_kind === "moved" ? "نُقلت" : "أُخليت") : "ساري"}</Pill></li>)}</ul>
    </Section>
  );
}

export function MyInsurance({ org }: { org: string }) {
  const q = useQuery({ queryKey: ["hr-in-my", org], refetchInterval: 30_000, queryFn: () => rpc<{ enabled: boolean; items: { id: string; kind: string; dep_name: string | null; dep_relation: string | null; dep_national_id: string | null; company: string; policy_no: string; class: string; coverage: string | null; annual_limit: number | null; start_date: string; end_date: string; status: string; member_no: string | null }[] }>("hr_in_my", { _org: org }) });
  if (q.isLoading) return <LoadingState rows={2} />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data!;
  if (!d.enabled) return <EmptyState title="خدمة التأمين الطبي غير مفعّلة في مؤسستك" />;
  if (!d.items.length) return <EmptyState title="لا توجد تغطية مسجّلة لك" />;
  return (
    <Section title="تأميني الطبي" desc="تغطيتك وتغطية تابعيك. أرقام الهوية والعضوية تظهر مختصرة.">
      <ul className="space-y-2">{d.items.map((m) => <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-sm">
        <span className="flex-1"><b>{m.kind === "employee" ? "أنا" : `${m.dep_name} (${REL[m.dep_relation ?? ""] ?? ""})`}</b> — {m.company} · فئة {m.class}
          <span className="block text-xs text-muted-foreground">{m.coverage ?? ""}{m.annual_limit ? ` · الحد السنوي ${sar(m.annual_limit)}` : ""} · {m.start_date} ← {m.end_date}{m.member_no ? <> · عضوية <bdi dir="ltr">{m.member_no}</bdi></> : null}</span></span>
        <Pill tone={m.status === "active" ? "ok" : m.status === "ended" || m.status === "expired" ? "muted" : "wait"}>{IN_ST[m.status] ?? m.status}</Pill></li>)}</ul>
    </Section>
  );
}

type Mine = { id: string; cycle: string; period_start: string; period_end: string; criteria: { key: string; label: string; weight: number; max: number }[]; scores: Record<string, number> | null; total: number | null; comments: string | null; published_at: string; status: string; objection: string | null; resolution: string | null; resolution_note: string | null; final_total: number | null };
export function MyPerformance({ org }: { org: string }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["hr-pf-my", org], refetchInterval: 30_000, queryFn: () => rpc<{ enabled: boolean; items: Mine[] }>("hr_pf_my", { _org: org }) });
  const [obj, setObj] = useState<{ id: string; text: string } | null>(null);
  const m = useMutation({ mutationFn: (a: { id: string; ack: boolean; text: string | null }) => rpc("hr_pf_respond", { _id: a.id, _ack: a.ack, _text: a.text }), onSuccess: (_d, a) => { toast.success(a.ack ? "سُجّل إقرارك" : "أُرسل اعتراضك"); setObj(null); qc.invalidateQueries({ queryKey: ["hr-pf-my"] }); }, onError: (e) => toast.error(arabicError(e)) });
  if (q.isLoading) return <LoadingState rows={2} />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const d = q.data!;
  if (!d.enabled) return <EmptyState title="تقييم الأداء الوظيفي غير مفعّل في مؤسستك" />;
  if (!d.items.length) return <EmptyState title="لا توجد نتيجة منشورة لك" hint="تظهر النتيجة هنا بعد مراجعتها ونشرها." />;
  return (
    <div className="space-y-3">{d.items.map((r) => <Section key={r.id} title={`${r.cycle}: ${r.total ?? "—"} / 100`} desc={`${r.period_start} ← ${r.period_end} · نُشرت ${new Date(r.published_at).toLocaleDateString("ar-SA-u-nu-latn")}`}>
      <table className="w-full text-sm"><tbody>{r.criteria.map((c) => <tr key={c.key} className="border-t"><td className="py-1">{c.label}</td><td className="text-center">{r.scores?.[c.key] != null ? `${r.scores[c.key]} / ${c.max}` : "—"}</td></tr>)}</tbody></table>
      {r.comments && <p className="mt-2 rounded bg-secondary/40 p-2 text-sm">{r.comments}</p>}
      {r.status === "acknowledged" && <p className="mt-2 text-sm text-success">أقررت بالنتيجة.</p>}
      {r.objection && <p className="mt-2 text-sm"><b>اعتراضك:</b> {r.objection}</p>}
      {r.status === "objected" && <p className="text-xs text-muted-foreground">الاعتراض قيد البت.</p>}
      {r.resolution && <p className="mt-1 text-sm"><b>نتيجة الاعتراض:</b> {r.resolution === "amended" ? `عُدّلت النتيجة إلى ${r.final_total}` : "ثُبّتت النتيجة"} — {r.resolution_note}</p>}
      {r.status === "published" && (obj?.id === r.id ? (
        <form aria-label="اعتراض على التقييم" className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); if (!m.isPending) m.mutate({ id: r.id, ack: false, text: obj.text }); }}>
          <textarea aria-label="أسباب الاعتراض" className="w-full rounded-md border bg-background p-2 text-sm" rows={3} value={obj.text} onChange={(e) => setObj({ ...obj, text: e.target.value })} />
          <div className="flex gap-2"><Button size="sm" type="submit" disabled={m.isPending}>إرسال الاعتراض</Button><Button size="sm" type="button" variant="ghost" onClick={() => setObj(null)}>إلغاء</Button></div>
        </form>) : (
        <div className="mt-2 flex gap-2"><Button size="sm" disabled={m.isPending} onClick={() => m.mutate({ id: r.id, ack: true, text: null })}>إقرار بالنتيجة</Button><Button size="sm" variant="outline" onClick={() => setObj({ id: r.id, text: "" })}>اعتراض</Button></div>))}
    </Section>)}</div>
  );
}
