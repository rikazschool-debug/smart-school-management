import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, CalendarX, FolderOpen, Inbox, Info, MessageSquareWarning, Send } from "lucide-react";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { ErrorState, LoadingState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { EDU_PRIORITY } from "@/components/education/model";
import { REF_STATUS } from "./model";

type Item = { id: string; kind: "case" | "referral"; ref_no: string; status: string; record_date: string; due_date: string | null; priority: string; person: string; reason: string };
type Board = { new_referrals: number; in_triage: number; needs_info: number; accepted: number; open_cases: number; due_today: number; overdue: number; urgent: number; today: string; items: Item[] };
const REASON: Record<string, string> = { new: "إحالة جديدة", triage: "بانتظار قرار الفرز", overdue: "موعد متأخر", today: "موعد اليوم", urgent: "أولوية مرتفعة" };
const CASE_STATUS: Record<string, string> = { open: "مفتوحة", following: "قيد المتابعة" };

export function GuidanceBoard({ school, go }: { school: string; go: (tab: "referrals" | "cases", opts?: { status?: string; id?: string }) => void }) {
  const b = useQuery({ queryKey: ["guidance-board", school], queryFn: async () => { const r = await db.rpc("edu_guidance_board", { _school: school }); if (r.error) throw r.error; return r.data as Board; } });
  if (b.isLoading) return <LoadingState />; if (b.error || !b.data) return <ErrorState message={arabicError(b.error)} onRetry={() => b.refetch()} />;
  const s = b.data; const empty = !s.new_referrals && !s.in_triage && !s.needs_info && !s.accepted && !s.open_cases && !s.items.length;
  const kpis = [
    { icon: Inbox, label: "إحالات جديدة", n: s.new_referrals, def: "إحالات أرسلها المعلمون ولم يبدأ فرزها", on: () => go("referrals", { status: "sent" }) },
    { icon: Send, label: "قيد الفرز", n: s.in_triage, def: "إحالات بدأ فرزها دون قرار بعد", on: () => go("referrals", { status: "triage" }) },
    { icon: MessageSquareWarning, label: "تنتظر استكمال المعلم", n: s.needs_info, def: "طُلب من المعلم استكمال بياناتها", on: () => go("referrals", { status: "needs_info" }) },
    { icon: FolderOpen, label: "حالات مفتوحة", n: s.open_cases, def: "حالات خاصة حالتها مفتوحة أو قيد المتابعة", on: () => go("cases") },
    { icon: CalendarClock, label: "مواعيد اليوم", n: s.due_today, def: "إحالات أو حالات موعد مراجعتها اليوم", on: () => go("cases") },
    { icon: CalendarX, label: "مواعيد متأخرة", n: s.overdue, def: "موعد المراجعة مضى ولم تُغلق", on: () => go("cases") },
  ];
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{kpis.map((k) => <button key={k.label} type="button" onClick={k.on} className="rounded-xl border bg-card p-4 text-start hover:border-primary/50"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{k.label}</span><k.icon className="size-4 text-primary" /></div><p className="mt-1 text-3xl font-bold">{k.n}</p><p className="mt-1 text-xs text-muted-foreground">{k.def}</p></button>)}</div>
    {empty ? <section className="rounded-2xl border border-dashed bg-card/50 p-6"><h3 className="mb-3 font-semibold">ابدأ العمل</h3><ol className="list-decimal space-y-2 ps-5 text-sm leading-7"><li>المعلمون يرسلون إحالات طلابهم من تبويب «الإحالات الطلابية».</li><li>تفرز الإحالة: قبول للمتابعة، أو طلب استكمال، أو إغلاق بسبب، أو فتح حالة عند الحاجة.</li><li>تتابع الحالات المفتوحة ومواعيد مراجعتها من هذه اللوحة.</li></ol><Button className="mt-4" variant="outline" onClick={() => go("referrals", { status: "" })}>عرض الإحالات</Button></section>
      : <section className="rounded-2xl border bg-card p-5"><h3 className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle className="size-4 text-primary" />تحتاج إجراءً</h3><p className="mb-3 text-xs text-muted-foreground">إحالات جديدة أو قيد الفرز، وحالات موعدها اليوم أو متأخر أو أولويتها مرتفعة. لا تُعرض التصنيفات هنا.</p>
        {!s.items.length ? <p className="text-sm text-muted-foreground">لا يوجد ما يحتاج إجراءً الآن.</p> : <ul className="divide-y">{s.items.map((i) => <li key={i.id}><button type="button" onClick={() => go(i.kind === "case" ? "cases" : "referrals", { id: i.id })} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-3 text-start hover:bg-muted/30"><div className="min-w-0"><p className="truncate font-medium">{i.person}</p><p className="text-xs text-muted-foreground">{i.ref_no} · {i.kind === "case" ? CASE_STATUS[i.status] ?? i.status : REF_STATUS[i.status]}{i.due_date ? ` · الموعد ${i.due_date}` : ""}{i.priority !== "normal" ? ` · ${EDU_PRIORITY[i.priority]}` : ""}</p></div><span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-xs">{REASON[i.reason]}</span></button></li>)}</ul>}</section>}
    <p className="flex items-center gap-2 text-xs text-muted-foreground"><Info className="size-3.5" />الأعداد من سجلات التوجيه ضمن صلاحيتك فقط.</p>
  </div>;
}
