import type React from "react";
import { useState } from "react";
import { COMP_KIND, KIND, PERIOD, V_STATUS, money, type CVersion } from "@/components/hr/contracts-shared";

export function VersionCard({ v, current }: { v: CVersion; current: boolean }) {
  const [open, setOpen] = useState(current || v.status === "draft" || v.status === "issued");
  const x = v.data;
  return (
    <li className={"rounded-lg border p-3 text-sm " + (current ? "border-primary" : "")}>
      <button type="button" className="flex w-full flex-wrap items-center gap-2 text-start" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="font-semibold">الإصدار {v.version}</span>
        <span className="rounded bg-secondary px-1.5 text-xs">{V_STATUS[v.status] ?? v.status}</span>
        <span className="text-xs text-muted-foreground">يسري من <bdi dir="ltr">{v.effective_from}</bdi></span>
        <span className="ms-auto text-xs text-primary">{open ? "إخفاء" : "عرض"}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          <dl className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {([["النوع", KIND[x.kind]], ["الوظيفة", x.job_title], ["البداية", x.start_date], ["النهاية", x.end_date ?? "غير محددة"], ["فترة التجربة", x.probation_days ? `${x.probation_days} يومًا` : null], ["القالب", x.template_name ? `${x.template_name} (نسخة ${x.template_version})` : null]] as [string, React.ReactNode][]).map(([a, b]) => <div key={a}><dt className="text-xs text-muted-foreground">{a}</dt><dd>{b || "—"}</dd></div>)}
          </dl>
          {x.probation_terms && <p><span className="text-xs text-muted-foreground">شروط التجربة: </span>{x.probation_terms}</p>}
          {x.terms && <p className="whitespace-pre-wrap"><span className="text-xs text-muted-foreground">شروط العمل: </span>{x.terms}</p>}
          {x.body && <p className="whitespace-pre-wrap rounded bg-secondary/40 p-2">{x.body}</p>}
          {v.comp_hidden ? <p className="text-xs text-muted-foreground">بنود التعويض مخفية (تحتاج صلاحية عرض التعويض).</p> : (x.comp ?? []).length === 0 ? <p className="text-xs text-muted-foreground">لا توجد بنود تعويض.</p> : (
            <ul className="space-y-1">{x.comp!.map((l, i) => <li key={i} className="flex flex-wrap justify-between gap-2 rounded bg-secondary/30 px-2 py-1"><span>{l.label} <span className="text-xs text-muted-foreground">({COMP_KIND[l.kind]} · {PERIOD[l.period]})</span></span><bdi dir="ltr">{money(l)}</bdi></li>)}</ul>
          )}
          <p className="text-xs text-muted-foreground">
            {[v.created_by && `أعدّه: ${v.created_by}`, v.issued_by && `اعتمده: ${v.issued_by}`, v.ack_at && `${v.status === "rejected" ? "رُفض" : "أُقر"} ${v.ack_source === "paper" ? "ورقيًا عبر " + (v.ack_by ?? "") : "من الموظف"}`, v.reason && `سبب التعديل: ${v.reason}`, v.ack_reason && `ملاحظة الإقرار: ${v.ack_reason}`].filter(Boolean).join(" · ")}
          </p>
          <p className="text-xs text-muted-foreground">الإقرار هنا إقرار داخلي في ركاز، وليس توقيعًا إلكترونيًا موثقًا من جهة خارجية.</p>
        </div>
      )}
    </li>
  );
}

