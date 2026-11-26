// Message channels of a notify/reminder step (phase E). Channel readiness, approved WATI templates and the variables
// come from the engine (au_channels_info / au_wa_templates_list / registry); _au_check_channels on save is the only judge.
// Real WhatsApp sending stays off until explicitly approved: messages are recorded as simulations.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { selectCls } from "@/components/ui/native-select";
import { rpc, type Any } from "../lib";

const CH: [string, string][] = [["internal", "إشعار داخلي في ركاز"], ["whatsapp", "واتساب (قالب معتمد عبر WATI)"], ["email", "البريد الإلكتروني"]];
const inp = "w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm";

export function ChannelsEditor({ data, set, org, vars, fam }: { data: Record<string, unknown>; set: (d: Record<string, unknown>) => void; org: string; vars: Any[]; fam: boolean }) {
  const info = useQuery({ queryKey: ["au-channels", org], enabled: !!org, staleTime: 60_000, queryFn: () => rpc<Any>("au_channels_info", { _org: org }) });
  const [q, setQ] = useState("");
  const tpls = useQuery({ queryKey: ["au-wa-tpls", org], enabled: !!org, staleTime: 60_000, queryFn: () => rpc<Any>("au_wa_templates_list", { _org: org, _q: null }) });
  const ch = (data["channels"] as string[] | undefined) ?? ["internal"];
  const wa = (data["wa"] as { template?: string; params?: Record<string, string> } | undefined) ?? {};
  const ready = (c: string) => ((info.data?.channels ?? []) as Any[]).find((x) => x.code === c);
  const usable = ((tpls.data?.items ?? []) as Any[]).filter((t) => t.usable);
  const shown = usable.filter((t) => !q.trim() || `${t.name} ${t.body}`.includes(q.trim()));
  const tpl = usable.find((t) => t.name === wa.template);
  const allowedVars = vars.filter((v) => v.type !== "uuid" && (!fam || ((v.flags ?? []) as string[]).includes("family")));
  const toggle = (c: string) => {
    const next = ch.includes(c) ? ch.filter((x) => x !== c) : [...ch, c];
    const d = { ...data }; if (!next.length) return;
    if (next.length === 1 && next[0] === "internal") delete d["channels"]; else d["channels"] = next;
    if (!next.includes("whatsapp")) delete d["wa"];
    set(d);
  };
  const pickTpl = (name: string) => {
    const t = usable.find((x) => x.name === name);
    set({ ...data, wa: t ? { template: t.name, params: Object.fromEntries(((t.params ?? []) as string[]).map((p) => [p, wa.params?.[p] ?? ""])) } : {} });
  };
  const preview = useMemo(() => {
    if (!tpl) return "";
    const label = (s: string) => s.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (_, k: string) => `«${vars.find((v) => v.key === k)?.label ?? k}»`);
    return String(tpl.body ?? "").replace(/\{\{\s*([^{}\s]+)\s*\}\}/g, (_m, k: string) => {
      const value = wa.params?.[k];
      return value ? label(value) : `[${k}]`;
    });
  }, [tpl, wa.params, vars]);
  return (
    <div className="space-y-2 rounded-md border p-2">
      <div className="text-sm font-semibold">قنوات الإرسال</div>
      {CH.map(([c, l]) => { const r = ready(c); const off = r?.readiness === "not_ready"; return (
        <label key={c} className={`flex items-center gap-2 text-sm ${off ? "opacity-60" : ""}`}>
          <input type="checkbox" disabled={off} checked={ch.includes(c)} onChange={() => toggle(c)} />{l}
          {off && <span className="text-xs text-muted-foreground">— {r?.note ?? "غير جاهز"}</span>}
          {r?.readiness === "simulation" && <span className="rounded-full bg-warning/15 px-2 text-[11px] text-warning-foreground">محاكاة فقط</span>}
        </label>); })}
      {ch.includes("whatsapp") && (
        <div className="space-y-2 border-t pt-2">
          <p className="text-xs text-muted-foreground">تُستخدم قوالب WATI المعتمدة من نوع «تشغيلي» فقط. يُتحقق لحظة التنفيذ من رقم الجوال المسجل والموافقة على التواصل، ولا تظهر الأرقام في أي قائمة. الإرسال الحقيقي معطّل حتى موافقتك الصريحة.</p>
          <input className={inp} placeholder="ابحث في القوالب المعتمدة…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className={selectCls("w-full")} value={wa.template ?? ""} onChange={(e) => pickTpl(e.target.value)}>
            <option value="">اختر قالبًا ({usable.length})</option>
            {shown.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
          </select>
          {tpls.data && usable.length === 0 && <p className="text-xs text-destructive">لا توجد قوالب معتمدة مزامنة. حدّث القوالب من تبويب «القنوات والرسائل».</p>}
          {tpl && ((tpl.params ?? []) as string[]).map((p) => (
            <label key={p} className="block space-y-1 text-xs"><span className="font-semibold">متغير القالب {`{{${p}}}`}</span>
              <select className={selectCls("w-full")} value={wa.params?.[p] ?? ""} onChange={(e) => set({ ...data, wa: { template: tpl.name, params: { ...(wa.params ?? {}), [p]: e.target.value } } })}>
                <option value="">—</option>{allowedVars.map((v) => <option key={v.key} value={`{{${v.key}}}`}>{v.label}</option>)}
              </select>
            </label>))}
          {fam && <p className="text-xs text-muted-foreground">لرسائل أولياء الأمور تظهر الحقول المسموح بها للأسر فقط، ويُستخدم اسم ولي الأمر المستلم نفسه.</p>}
          {tpl && <div className="whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs leading-5">{preview}</div>}
          {tpl && <p className="text-[11px] text-muted-foreground">المعاينة بالقيم الفعلية تظهر في «المحاكاة» قبل الاعتماد.</p>}
        </div>
      )}
    </div>
  );
}
