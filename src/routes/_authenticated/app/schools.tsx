import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link2, PauseCircle, PencilLine, PlayCircle, Plus, Users } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { ask, askText } from "@/components/confirm";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader, Section } from "@/components/states";
import { useSchoolsOverview } from "@/components/owner-portal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { arabicError, useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/app/schools")({
  validateSearch: (s: Record<string, unknown>): { new?: boolean } => (s["new"] === true || s["new"] === "true" ? { new: true } : {}),
  head: () => ({ meta: [{ title: "المدارس والفروع — ركاز" }, { name: "description", content: "إضافة المدارس وتعديلها وتفعيل الفروع وربط الموظفين." }] }),
  component: Page,
});

/** Staff roles linkable from this page (department heads need a department → members page). */
const LINK_ROLES: Role[] = ["principal", "vice_principal", "supervisor", "student_affairs", "teacher", "counselor", "nurse", "security"];

const ACTIONS: Record<string, string> = { school_create: "إضافة مدرسة", school_update: "تعديل بيانات", school_suspend: "إيقاف فرع", school_activate: "تفعيل فرع" };

type Draft = { id?: string; name: string; code: string; city: string; stage_type: string };

function Page() {
  const { active, contexts, setActive, refresh } = useSession();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const orgId = active?.orgId ?? null;
  const allowed = !!active && (active.role === "org_owner" || active.role === "platform_admin");
  const q = useSchoolsOverview(allowed ? orgId : null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [link, setLink] = useState<Row | null>(null);

  useEffect(() => {
    if (search.new) { setDraft({ name: "", code: "", city: "", stage_type: "" }); navigate({ to: "/app/schools", search: {}, replace: true }); }
  }, [search.new, navigate]);

  const log = useQuery({
    queryKey: ["school-log", orgId],
    enabled: allowed && !!orgId,
    queryFn: async () => {
      const { data, error } = await db.from("access_audit").select("id, action, school_id, reason, before, after, created_at").eq("org_id", orgId).like("action", "school_%").order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data as Row[];
    },
  });

  const done = () => { qc.invalidateQueries({ queryKey: ["schools-overview"] }); qc.invalidateQueries({ queryKey: ["school-log"] }); refresh(); };

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const { error } = await db.rpc("org_school_save", { _org: orgId, _id: d.id ?? null, _name: d.name, _code: d.code, _city: d.city, _stage_type: d.stage_type });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("تم حفظ بيانات المدرسة"); setDraft(null); done(); },
    onError: (e) => toast.error(arabicError(e)),
  });

  async function toggle(s: Row) {
    if (s["is_active"]) {
      const reason = await askText(`إيقاف «${s["name"]}» يوقف دخول جميع موظفيه وطلابه وأولياء أموره حتى تعيد تفعيله. بياناته تبقى محفوظة. اكتب سبب الإيقاف:`, { required: true, ok: "إيقاف الفرع" });
      if (!reason) return;
      const { data, error } = await db.rpc("org_school_set_active", { _id: s["id"], _active: false, _reason: reason });
      if (error) return void toast.error(arabicError(error));
      toast.success(`أُوقف الفرع، وعُلّق ${data ?? 0} حساب`);
    } else {
      if (!(await ask(`إعادة تفعيل «${s["name"]}» تعيد الدخول لمن أُوقفوا بسبب إيقاف الفرع فقط. متابعة؟`, { ok: "تفعيل" }))) return;
      const { data, error } = await db.rpc("org_school_set_active", { _id: s["id"], _active: true, _reason: null });
      if (error) return void toast.error(arabicError(error));
      toast.success(`فُعّل الفرع، وعاد ${data ?? 0} حساب`);
    }
    done();
  }

  function openMembers(schoolId: string) {
    const c = contexts.find((x) => x.role === active?.role && x.orgId === orgId && x.schoolId === schoolId);
    if (c) setActive(c.key);
    navigate({ to: "/app/members" });
  }

  if (!allowed) return <ForbiddenState />;
  if (!orgId) return <EmptyState title="اختر مؤسسة من شريط السياق" />;
  const names = Object.fromEntries((q.data ?? []).map((s) => [s["id"], s["name"]]));

  return (
    <>
      <PageHeader title="المدارس والفروع" desc={active.orgName}
        action={<Button onClick={() => setDraft({ name: "", code: "", city: "", stage_type: "" })}><Plus className="size-4" /> مدرسة جديدة</Button>} />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : !q.data?.length ? <EmptyState title="لا توجد مدارس" hint="أضف أول مدرسة أو فرع للمؤسسة." /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {q.data.map((s) => {
            const staff = Object.entries((s["staff"] ?? {}) as Record<string, number>);
            return (
              <article key={s["id"]} className={"flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm " + (s["is_active"] ? "" : "border-dashed")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-bold">{s["name"]}</h2>
                    <p className="text-sm text-muted-foreground">{[s["city"], s["stage_type"], s["code"]].filter(Boolean).join(" · ") || "لا توجد بيانات إضافية"}</p>
                  </div>
                  <span className={"shrink-0 rounded-full px-2 py-0.5 text-xs " + (s["is_active"] ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>{s["is_active"] ? "نشطة" : "موقوفة"}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  <span className="rounded-full bg-secondary px-2 py-1">{s["staff_total"]} موظف</span>
                  <span className="rounded-full bg-secondary px-2 py-1">{s["students"]} طالب</span>
                  {Number(s["pending_invites"]) > 0 && <span className="rounded-full bg-warning/15 px-2 py-1">{s["pending_invites"]} دعوة معلقة</span>}
                  {!s["is_active"] && Number(s["paused"]) > 0 && <span className="rounded-full bg-muted px-2 py-1">{s["paused"]} حساب معلّق بسبب الإيقاف</span>}
                </div>
                {staff.length > 0 && (
                  <p className="text-xs text-muted-foreground">{staff.map(([r, n]) => `${ROLE_LABELS[r as Role] ?? r}: ${n}`).join(" · ")}</p>
                )}
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  <Button size="sm" variant="outline" onClick={() => setDraft({ id: s["id"], name: s["name"] ?? "", code: s["code"] ?? "", city: s["city"] ?? "", stage_type: s["stage_type"] ?? "" })}><PencilLine className="size-4" />تعديل</Button>
                  <Button size="sm" variant="outline" disabled={!s["is_active"]} onClick={() => setLink(s)}><Link2 className="size-4" />ربط موظف</Button>
                  <Button size="sm" variant="ghost" disabled={!s["is_active"]} onClick={() => openMembers(s["id"])}><Users className="size-4" />موظفو المدرسة</Button>
                  <Button size="sm" variant={s["is_active"] ? "ghost" : "default"} onClick={() => toggle(s)}>
                    {s["is_active"] ? <><PauseCircle className="size-4" />إيقاف الفرع</> : <><PlayCircle className="size-4" />تفعيل الفرع</>}
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Section title="سجل التغييرات" desc="كل إضافة أو تعديل أو إيقاف مع المنفّذ والسبب." className="mt-8">
        {log.isLoading ? <LoadingState rows={2} /> : !log.data?.length ? <p className="text-sm text-muted-foreground">لا توجد تغييرات بعد.</p> : (
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {log.data.map((l) => (
              <li key={l["id"]} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
                <span className="font-semibold">{ACTIONS[l["action"]] ?? l["action"]}</span>
                <span>{names[l["school_id"]] ?? l["after"]?.name ?? "—"}</span>
                {l["reason"] && <span className="text-muted-foreground">السبب: {l["reason"]}</span>}
                <time className="ms-auto text-xs text-muted-foreground" dir="ltr">{new Date(l["created_at"]).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}</time>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>{draft?.id ? "تعديل بيانات المدرسة" : "مدرسة جديدة"}</DialogTitle></DialogHeader>
          {draft && (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(draft); }}>
              {([["name", "اسم المدرسة أو الفرع"], ["code", "الرمز"], ["city", "المدينة"], ["stage_type", "المراحل (مثال: متوسط وثانوي)"]] as const).map(([k, l]) => (
                <div key={k} className="space-y-1.5">
                  <Label htmlFor={`sc-${k}`}>{l}{k === "name" && " *"}</Label>
                  <Input id={`sc-${k}`} value={draft[k]} required={k === "name"} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
                </div>
              ))}
              {!draft.id && <p className="text-xs text-muted-foreground">تُضاف المدرسة نشطة. اربط مديرها وموظفيها بعد الحفظ من «ربط موظف».</p>}
              <div className="flex gap-2 pt-1">
                <Button disabled={save.isPending}>{save.isPending ? "جارٍ الحفظ…" : "حفظ"}</Button>
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>إلغاء</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <LinkStaffDialog school={link} onClose={() => setLink(null)} onDone={done} />
    </>
  );
}

function LinkStaffDialog({ school, onClose, onDone }: { school: Row | null; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("teacher");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (school) { setEmail(""); setRole("teacher"); } }, [school]);
  return (
    <Dialog open={!!school} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader><DialogTitle>ربط موظف بـ «{school?.["name"]}»</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const { error } = await db.rpc("invite_member", { _email: email.trim(), _school: school?.["id"], _role: role });
          setBusy(false);
          if (error) return void toast.error(arabicError(error));
          toast.success("أُرسلت دعوة الربط. يرتبط الحساب عند دخول صاحبه ببريده المؤكد.");
          onDone(); onClose();
        }}>
          <div className="space-y-1.5">
            <Label htmlFor="ls-email">البريد الإلكتروني للموظف *</Label>
            <Input id="ls-email" type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ls-role">الدور في هذه المدرسة</Label>
            <select id="ls-role" className={selectCls("w-full")} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {LINK_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">إن كان للموظف حساب في مدرسة أخرى بالمؤسسة يُضاف له دور هنا دون أن يفقد دوره هناك. رئيس القسم يُربط من «موظفو المدرسة» لاختيار قسمه.</p>
          <div className="flex gap-2 pt-1">
            <Button disabled={busy}>{busy ? "جارٍ…" : "إرسال دعوة الربط"}</Button>
            <Button type="button" variant="ghost" onClick={onClose}>إلغاء</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
