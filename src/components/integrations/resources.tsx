import { Fragment, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { askText } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { selectCls } from "@/components/ui/native-select";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { act, Badge, Card, fmt, OP_LABEL, useDirectory, type CatField, type Row } from "./shared";

const AREA: Record<string, string> = { school: "المدارس", central: "الإدارة المركزية" };

/** API resource management: what each resource exposes, how it is protected, whether it is switched on for this group, and section coverage. */
export function ResourcesTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const q = useDirectory(orgId);
  const [s, setS] = useState(""); const [area, setArea] = useState(""); const [view, setView] = useState<"res" | "cov">("res");
  const [open, setOpen] = useState<string | null>(null);
  const res = (q.data?.["resources"] ?? []) as Row[];
  const cov = (q.data?.["coverage"] ?? []) as Row[];
  const unreg = (q.data?.["unregistered"] ?? []) as Row[];
  const events = (q.data?.["events"] ?? []) as Row[];
  const label = useMemo(() => Object.fromEntries(res.map((r) => [r["key"], r["label"]])), [res]);
  const list = res.filter((r) => (!area || r["area"] === area) && (!s.trim() || [r["label"], r["menu"], r["sub"], r["key"]].some((x) => String(x ?? "").includes(s.trim()))));
  if (q.isLoading) return <LoadingState rows={4} />;
  if (q.error) return <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} />;
  const toggle = async (r: Row) => {
    const on = r["enabled"] !== false;
    const reason = await askText(on ? `سبب إيقاف «${r["label"]}» للتكامل (تتوقف كل المفاتيح عن الوصول إليه):` : `سبب إعادة تفعيل «${r["label"]}»:`, { required: true, ok: on ? "إيقاف" : "تفعيل" });
    if (!reason) return;
    if (await act("api_resource_set", { _org: orgId, _resource: r["key"], _enabled: !on, _reason: reason }, on ? "أوقف المورد" : "فُعّل المورد")) qc.invalidateQueries({ queryKey: ["api"] });
  };
  const nCov = cov.filter((c) => c["status"] === "covered").length;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[["الموارد المتاحة", res.length], ["موارد المدارس", res.filter((r) => r["area"] === "school").length], ["موارد الإدارة المركزية", res.filter((r) => r["area"] === "central").length], ["أقسام المنصة", `مغطاة ${nCov} · مستبعدة ${cov.length - nCov}`]].map(([l, v]) => (
          <div key={String(l)} className="rounded-xl border bg-card p-3 shadow-sm"><div className="text-xs text-muted-foreground">{l}</div><div className="font-display text-xl font-bold">{v}</div></div>
        ))}
      </div>
      {unreg.length > 0 && (
        <Card title="أقسام جديدة في المنصة لم تُسجَّل في دليل API">
          <p className="mb-2 text-xs text-muted-foreground">لا تظهر هذه الأقسام في المفاتيح حتى تُراجع وتُضاف مواردها أو يُوثَّق سبب استبعادها.</p>
          <div className="flex flex-wrap gap-1.5">{unreg.map((u) => <Badge key={u["section"]} cls="bg-warning/15 text-warning-foreground">{u["label"] ?? u["section"]}</Badge>)}</div>
        </Card>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border bg-card p-1">
          {([["res", "الموارد"], ["cov", "تغطية أقسام المنصة"]] as const).map(([k, l]) => <button key={k} onClick={() => setView(k)} className={`rounded-md px-3 py-1 text-xs ${view === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>{l}</button>)}
        </div>
        {view === "res" && <>
          <div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute start-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={s} onChange={(e) => setS(e.target.value)} placeholder="ابحث عن مورد أو قسم…" className="ps-8" /></div>
          <select className={selectCls()} value={area} onChange={(e) => setArea(e.target.value)}><option value="">كل المناطق</option><option value="school">المدارس</option><option value="central">الإدارة المركزية</option></select>
        </>}
      </div>
      {view === "res" ? (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["المورد", "القسم", "نقطة الوصول", "العمليات", "الحقول", "الحساسية", "المفاتيح", "الحالة", ""].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {list.map((r) => {
                const f = (r["fields"] ?? []) as CatField[];
                const ops = Object.entries((r["ops"] ?? {}) as Record<string, boolean>).filter(([, v]) => v).map(([k]) => k);
                const on = r["enabled"] !== false;
                return (
                  <Fragment key={r["key"]}>
                    <tr className="border-t align-top">
                      <td className="px-3 py-2"><button className="text-start font-medium hover:underline" onClick={() => setOpen(open === r["key"] ? null : r["key"])}>{r["label"]}</button><div className="text-[11px] text-muted-foreground">{AREA[r["area"]]}</div></td>
                      <td className="px-3 py-2 text-xs">{r["menu"]}<div className="text-muted-foreground">{r["sub"]}</div></td>
                      <td className="px-3 py-2 font-mono text-[11px]" dir="ltr">{r["endpoint"]}</td>
                      <td className="px-3 py-2"><div className="flex flex-wrap gap-1">{ops.map((o) => <Badge key={o} cls={o === "read" ? undefined : "bg-primary/10 text-primary"}>{o === "create" && r["create_mode"] === "approval" ? "إضافة باعتماد" : OP_LABEL[o]}</Badge>)}</div></td>
                      <td className="px-3 py-2 text-xs">{f.length}{f.some((x) => x.s) ? ` · ${f.filter((x) => x.s).length} ●` : ""}</td>
                      <td className="px-3 py-2 text-xs">{r["sens"] ?? "عام"}</td>
                      <td className="px-3 py-2 text-xs">{r["keys_using"]}</td>
                      <td className="px-3 py-2"><Badge cls={on ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}>{on ? "متاح" : "موقوف"}</Badge>{!on && r["disabled_reason"] && <div className="mt-1 max-w-[160px] text-[11px] text-muted-foreground">{r["disabled_reason"]}</div>}{r["section_on"] === false && <div className="mt-1"><Badge cls="bg-warning/15 text-warning-foreground">القسم غير مفعّل للمجموعة</Badge></div>}</td>
                      <td className="px-3 py-2"><Button size="sm" variant="outline" onClick={() => toggle(r)}>{on ? "إيقاف" : "تفعيل"}</Button></td>
                    </tr>
                    {open === r["key"] && (
                      <tr className="border-t bg-muted/20"><td colSpan={9} className="px-3 py-3 text-xs">
                        <div className="grid gap-3 md:grid-cols-3">
                          <div><b>الحقول</b><div className="mt-1 flex flex-wrap gap-1">{f.map((x) => <Badge key={x.k} cls={x.s ? "bg-warning/15 text-warning-foreground" : undefined}>{x.s ? "● " : ""}{x.l} <span dir="ltr" className="ms-1 font-mono opacity-60">{x.k}</span></Badge>)}</div></div>
                          <div className="space-y-1">
                            <div><b>الاعتماد: </b>{r["approval"] ?? (ops.some((o) => o !== "read") ? "—" : "قراءة فقط؛ لا كتابة")}</div>
                            <div><b>البحث: </b>{r["search"] ?? "—"} · <b>التاريخ: </b>{r["date"] ?? "—"}</div>
                            <div><b>الفلاتر: </b>{((r["filters"] ?? []) as string[]).join("، ") || "—"}</div>
                            {r["note"] && <div><b>ملاحظة: </b>{r["note"]}</div>}
                          </div>
                          <div className="space-y-1">
                            <div><b>أقسام المنصة: </b>{((r["sections"] ?? []) as string[]).map((x) => cov.find((c) => c["section"] === x)?.["label"] ?? x).join("، ") || "—"}</div>
                            <div><b>التوثيق: </b>يُولَّد تلقائيًا من الدليل (تبويب التوثيق)</div>
                            <div><b>الاختبار: </b>القراءة مختبرة لكل الموارد مع منع الحقول الحساسة غير الممنوحة</div>
                            <div><b>الحذف: </b>غير متاح عبر API</div>
                          </div>
                        </div>
                      </td></tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["القسم في المنصة", "الحالة", "الموارد / سبب الاستبعاد"].map((h) => <th key={h} className="px-3 py-2 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {cov.map((c) => (
                <tr key={c["section"]} className="border-t">
                  <td className="px-3 py-2">{c["label"]}</td>
                  <td className="px-3 py-2"><Badge cls={c["status"] === "covered" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}>{c["status"] === "covered" ? "مغطى" : "مستبعد"}</Badge></td>
                  <td className="px-3 py-2 text-xs">{c["status"] === "covered" ? ((c["resources"] ?? []) as string[]).map((k) => label[k] ?? k).join("، ") : c["excluded"]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Card title="سجل إيقاف وتفعيل الموارد">
        {!events.length ? <p className="text-xs text-muted-foreground">لا تغييرات بعد.</p> : (
          <ul className="space-y-1 text-xs">{events.map((e, i) => <li key={i} className="flex flex-wrap justify-between gap-2 border-b py-1 last:border-0"><span><b>{label[e["resource"]] ?? e["resource"]}</b> — {e["enabled"] ? "تفعيل" : "إيقاف"}: {e["reason"]}</span><span className="text-muted-foreground">{fmt(e["at"])} — {e["actor"]}</span></li>)}</ul>
        )}
      </Card>
    </div>
  );
}
