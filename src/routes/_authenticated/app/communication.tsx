import { useSchoolPerms } from "@/lib/school-perms";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { selectCls } from "@/components/ui/native-select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { MessagesSquare, BellOff, Archive, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { RequireSchool } from "@/components/require-school";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { arabicError, useSession, type AppContext } from "@/lib/session";
import { commTabs, commTabLabel, commTitle, type CommTab } from "@/lib/roles";
import { KIND_LABEL, timeLabel } from "@/lib/comm";
import { Thread, hasDraft } from "@/components/comm/thread";
import { NewChatDialog } from "@/components/comm/new-chat";
import { CircularsTab } from "@/components/comm/circulars";
import { ManageTab } from "@/components/comm/manage";
import { ClassesTab } from "@/components/comm/classes";
import { MeetingsTab } from "@/components/comm/meetings-tab";

type Search = { tab?: CommTab; c?: string; circular?: string };

export const Route = createFileRoute("/_authenticated/app/communication")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const out: Search = {};
    if (typeof s["tab"] === "string") out.tab = s["tab"] as CommTab;
    if (typeof s["c"] === "string") out.c = s["c"];
    if (typeof s["circular"] === "string") out.circular = s["circular"];
    return out;
  },
  head: () => ({ meta: [{ title: "التواصل — ركاز" }] }),
  component: Page,
});


function Page() {
  return <RequireSchool nav="communication">{(ctx) => <Comm ctx={ctx} />}</RequireSchool>;
}

function Comm({ ctx }: { ctx: AppContext & { schoolId: string } }) {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/app/communication" });
  // Sidebar sections: «التواصل» = chats only; «المجموعات» (?tab=groups|classes) and «إدارة المجموعات» (?tab=manage) are separate;
  // circulars and meetings have their own pages. Old links (?tab=circulars|meetings) still open here.
  const sp = useSchoolPerms(ctx.schoolId);
  const base = commTabs(ctx.role);
  const all = sp?.["groups.create"] && !base.includes("manage") ? [...base, "manage" as CommTab] : base;
  const section: "groups" | "manage" | "chat" = search.tab === "manage" ? "manage" : search.tab === "groups" || search.tab === "classes" ? "groups" : "chat";
  const tabs = section === "manage" ? all.filter((t) => t === "manage")
    : section === "groups" ? all.filter((t) => t === "groups" || t === "classes")
    : all.filter((t) => t === "inbox" || t === "mine" || t === "archive" || ((t === "circulars" || t === "meetings") && search.tab === t) || (t === "classes" && !all.includes("groups")));
  const tab: CommTab = search.tab && tabs.includes(search.tab) ? search.tab : search.c ? "inbox" : tabs[0]!;
  const go = (s: Search) => navigate({ search: s, replace: false });
  const head = section === "groups" ? { title: "المجموعات", description: "مجموعاتك الإدارية ومجموعات المواد." } : section === "manage" ? { title: "إدارة المجموعات", description: "إنشاء المجموعات وأعضاؤها وإعدادات التواصل." } : commTitle(ctx.role);
  return (
    <>
      <PageHeader {...head} />
      {tabs.length > 1 && <div className="mb-5 flex w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1 sm:w-fit" role="tablist">
        {tabs.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => go({ tab: t })}
            className={`min-h-9 shrink-0 rounded-lg px-4 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tab === t ? "bg-card font-semibold text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{commTabLabel(ctx.role, t)}</button>
        ))}
      </div>}
      {tab === "circulars" ? <CircularsTab ctx={ctx} focus={search.circular} onFocus={(id) => go(id ? { tab: "circulars", circular: id } : { tab: "circulars" })} />
        : tab === "manage" ? <ManageTab ctx={ctx} />
        : tab === "classes" ? <ClassesTab ctx={ctx} />
        : tab === "meetings" ? <MeetingsTab />
        : <Conversations ctx={ctx} tab={tab} selected={search.c} onSelect={(c) => go(c ? { tab, c } : { tab })} />}
    </>
  );
}

function Conversations({ ctx, tab, selected, onSelect }: { ctx: AppContext & { schoolId: string }; tab: CommTab; selected: string | undefined; onSelect: (c: string | undefined) => void }) {
  const qc = useQueryClient();
  const [allSchools, setAllSchools] = useState(false);
  const [kind, setKind] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [q, setQ] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [child, setChild] = useState("");
  const { user } = useSession();
  const school = allSchools ? null : ctx.schoolId;
  const convs = useQuery({
    queryKey: ["convs", school],
    queryFn: async () => {
      const { data, error } = await db.rpc("my_conversations", { _school: school });
      if (error) throw error;
      return data as Row[];
    },
  });
  const hits = useQuery({
    queryKey: ["msg-search", q, school],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const { data, error } = await db.rpc("search_messages", { _q: q, _school: school });
      if (error) throw error;
      return data as Row[];
    },
  });
  // membership changes (added/removed) refresh the list; RLS limits events to my own rows
  useEffect(() => {
    const ch = supabase.channel(`my-members-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_members" }, () => qc.invalidateQueries({ queryKey: ["convs"] }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => qc.invalidateQueries({ queryKey: ["convs"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["convs"] });
  const list = useMemo(() => (convs.data ?? []).filter((c) => {
    const archived = c["archived"] || c["status"] === "archived";
    if (tab === "archive" ? !archived : archived) return false;
    if (tab === "mine" && c["kind"] === "group") return false;
    if (tab === "groups" && c["kind"] !== "group") return false;
    // subject/section groups live in their own tab; students' inbox holds only chats with their teachers
    if (tab !== "archive" && c["kind"] === "group" && (c["group_type"] === "course" || c["group_type"] === "section" || c["group_type"] === "class")) return false;
    if (ctx.role === "student" && c["kind"] !== "student" && c["kind"] !== "group") return false;
    if (kind && c["kind"] !== kind) return false;
    if (child && c["student_name"] !== child) return false;
    if (unreadOnly && !c["unread"]) return false;
    if (q.trim() && !`${c["title"]} ${c["student_name"] ?? ""}`.includes(q.trim()) && !hits.data?.some((h) => h["conversation_id"] === c["id"])) return false;
    return true;
  }), [convs.data, tab, kind, unreadOnly, q, hits.data, child]);
  // guardian with several children: filter the inbox per child (names come from the family conversations themselves)
  const children = ctx.role === "guardian" ? [...new Set((convs.data ?? []).filter((c) => c["kind"] === "family" && c["student_name"]).map((c) => c["student_name"] as string))] : [];
  const current = (convs.data ?? []).find((c) => c["id"] === selected);
  const canStart = ctx.role !== "student" && tab !== "groups";

  return (
    <div className="grid h-[calc(100dvh-14rem)] min-h-[26rem] overflow-hidden rounded-2xl border bg-card shadow-sm md:grid-cols-[21rem_1fr]">
      <aside className={`flex min-h-0 min-w-0 flex-col border-e ${selected ? "hidden md:flex" : "flex"}`}>
        <div className="space-y-2 border-b p-3">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute start-2 top-2.5 size-4 text-muted-foreground" />
              <Input className="ps-8" placeholder="بحث في المحادثات والرسائل" aria-label="بحث" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {canStart && <Button size="icon" aria-label="محادثة جديدة" title="محادثة جديدة" onClick={() => setNewOpen(true)}><Plus className="size-4" /></Button>}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select aria-label="النوع" className={selectCls(undefined, true)} value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">كل الأنواع</option>{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {children.length > 1 && (
              <select aria-label="الابن" className={selectCls(undefined, true)} value={child} onChange={(e) => setChild(e.target.value)}>
                <option value="">كل الأبناء</option>{children.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            )}
            <button type="button" aria-pressed={unreadOnly} onClick={() => setUnreadOnly(!unreadOnly)} className={`min-h-8 rounded-full border px-3 font-medium ${unreadOnly ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>غير المقروء</button>
            <button type="button" aria-pressed={allSchools} onClick={() => setAllSchools(!allSchools)} className={`min-h-8 rounded-full border px-3 font-medium ${allSchools ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted"}`}>كل مدارسي</button>
            {(kind || child || unreadOnly || allSchools || q) && <button type="button" className="min-h-8 px-2 text-primary underline-offset-2 hover:underline" onClick={() => { setKind(""); setChild(""); setUnreadOnly(false); setAllSchools(false); setQ(""); }}>مسح</button>}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {convs.isLoading ? <div className="p-3"><LoadingState /></div> : convs.error ? (
            <div className="space-y-2 p-3"><ErrorState message={arabicError(convs.error)} onRetry={() => convs.refetch()} /></div>
          ) : !list.length ? (
            <div className="p-3"><EmptyState title={tab === "archive" ? "الأرشيف فارغ" : "لا توجد محادثات"} hint={canStart && tab !== "archive" ? "ابدأ محادثة جديدة من زر +" : undefined} /></div>
          ) : (
            <ul className="divide-y">
              {list.map((c) => (
                <li key={c["id"]}>
                  <button onClick={() => onSelect(c["id"])} aria-current={selected === c["id"] ? "true" : undefined} className={`relative flex w-full min-w-0 items-start gap-3 p-3 text-start transition-colors hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none ${selected === c["id"] ? "bg-sidebar-accent before:absolute before:inset-y-2 before:right-0 before:w-1 before:rounded-l-full before:bg-primary" : ""}`}>
                    <span aria-hidden className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold ${c["kind"] === "group" ? "bg-secondary text-secondary-foreground" : "bg-primary/10 text-primary"}`}>{String(c["title"] ?? "؟").trim().charAt(0)}</span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex w-full min-w-0 items-center gap-2">
                      <span className={`min-w-0 flex-1 truncate ${c["unread"] ? "font-bold" : "font-medium"}`}>{c["title"]}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{timeLabel(c["last_at"])}</span>
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {KIND_LABEL[c["kind"]]}{c["student_name"] ? ` • ${c["student_name"]}` : ""}{allSchools && c["school_name"] ? ` • ${c["school_name"]}` : ""}
                    </span>
                    <span className="flex w-full min-w-0 items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{c["last_body"] ?? "لا رسائل بعد"}</span>
                      {hasDraft(user.id, c["id"]) && selected !== c["id"] && <span className="shrink-0 rounded bg-accent px-1 text-[10px] text-accent-foreground">مسودة</span>}
                      {c["muted"] && <BellOff className="size-3 shrink-0 text-muted-foreground" aria-label="مكتومة" />}
                      {(c["archived"] || c["status"] === "archived") && <Archive className="size-3 shrink-0 text-muted-foreground" aria-label="مؤرشفة" />}
                      {c["unread"] > 0 && <span className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-bold leading-4 text-primary-foreground" aria-label={`${c["unread"]} غير مقروءة`}>{c["unread"]}</span>}
                    </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim().length >= 2 && !!hits.data?.length && (
            <div className="border-t p-3 text-xs">
              <p className="mb-1 font-semibold">رسائل مطابقة</p>
              <ul className="space-y-1">{hits.data.slice(0, 10).map((h) => <li key={h["message_id"]}><button className="w-full truncate text-start hover:underline" onClick={() => onSelect(h["conversation_id"])}>{h["conv_title"]}: {h["body"]}</button></li>)}</ul>
            </div>
          )}
        </div>
      </aside>
      <section className={`min-h-0 min-w-0 ${selected ? "flex flex-col" : "hidden md:flex md:flex-col"}`}>
        {current ? <Thread key={current["id"]} conv={current} onBack={() => onSelect(undefined)} onChanged={refresh} />
          : selected && convs.isLoading ? <LoadingState />
          : selected ? <div className="p-6"><EmptyState title="المحادثة غير متاحة" hint="ربما أُزلت منها أو لم تعد العلاقة سارية." /><Button className="mt-2 md:hidden" size="sm" onClick={() => onSelect(undefined)}>رجوع</Button></div>
          : <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-muted/30 p-6 text-center text-sm text-muted-foreground"><MessagesSquare className="size-10 opacity-40" />اختر محادثة من القائمة لعرض الرسائل</div>}
      </section>
      <NewChatDialog ctx={ctx} open={newOpen} onOpenChange={setNewOpen} onCreated={(id) => { setNewOpen(false); refresh(); onSelect(id); }} />
    </div>
  );
}
