// HR extensions (recruitment, performance, insurance, housing): one owner switch each, read through hr_ext_list.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/states";
import { askText } from "@/components/confirm";
import { arabicError } from "@/lib/session";
import { rpc } from "@/components/hr/shared";
import { Pill } from "@/components/hr/money";

type Caps = Record<string, boolean>;
export type Ext = {
  owner: boolean; hr: boolean;
  items: { ext: string; enabled: boolean; reason: string | null; by: string | null; at: string }[];
  recruit: Caps; recruit_schools: { id: string; name: string }[];
  housing: Caps; housing_schools: { id: string; name: string }[];
  insurance: Caps; insurance_schools: { id: string; name: string }[];
  performance: Caps;
};
export const EXT_L: Record<string, string> = { recruit: "التوظيف", performance: "الأداء الوظيفي", insurance: "التأمين الطبي", housing: "السكن" };
export type Person = { id: string; name: string; employee_no: string; job_title: string | null };

export function useExt(org: string | null) {
  return useQuery({ queryKey: ["hr-ext", org], enabled: !!org, queryFn: () => rpc<Ext>("hr_ext_list", { _org: org }) });
}
export function usePeople(school: string, ext: string) {
  return useQuery({ queryKey: ["hr-ext-people", school, ext], enabled: !!school, queryFn: () => rpc<Person[]>("hr_ext_people", { _school: school, _ext: ext }) });
}
export const today = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);

export function Extensions({ org, d }: { org: string; d: Ext }) {
  const qc = useQueryClient();
  const m = useMutation({ mutationFn: (a: { ext: string; on: boolean; reason: string }) => rpc("hr_ext_set", { _org: org, _ext: a.ext, _on: a.on, _reason: a.reason }), onSuccess: () => { toast.success("حُفظ القرار"); qc.invalidateQueries({ queryKey: ["hr-ext"] }); }, onError: (e) => toast.error(arabicError(e)) });
  return (
    <Section title="امتدادات الموارد البشرية" desc="لكل امتداد علم تفعيل مستقل بقرار المالك. الامتداد الموقوف لا يظهر لأحد ولا تعمل عملياته.">
      <ul className="grid gap-2 sm:grid-cols-2">{d.items.map((i) => (
        <li key={i.ext} className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-sm"><span className="flex-1 font-bold">{EXT_L[i.ext]}</span>
          <Pill tone={i.enabled ? "ok" : "muted"}>{i.enabled ? "مفعّل" : "موقوف"}</Pill>
          <Button size="sm" variant="outline" disabled={m.isPending} onClick={async () => { const r = await askText(i.enabled ? "سبب الإيقاف" : "سبب التفعيل", { required: true }); if (r) m.mutate({ ext: i.ext, on: !i.enabled, reason: r }); }}>{i.enabled ? "إيقاف" : "تفعيل"}</Button>
          {i.reason && <p className="w-full text-xs text-muted-foreground">آخر قرار: {i.by} — {i.reason}</p>}</li>
      ))}</ul>
    </Section>
  );
}
