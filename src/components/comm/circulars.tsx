import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Paperclip } from "lucide-react";
import { db, useOptions, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { arabicError, type AppContext } from "@/lib/session";
import { canManage } from "@/lib/roles";
import { BUCKET, PRIORITY_LABEL, ROLE_AR, SafeText, openFile } from "@/lib/comm";
import { MemberPicker } from "@/components/comm/member-picker";

const sel = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const STATUS: Record<string, string> = { draft: "مسودة", published: "منشور", archived: "مؤرشف" };
const SCOPE: Record<string, string> = { school: "مدرسة", branches: "فروع محددة", org: "المؤسسة" };
function useSchools(orgId: string | undefined) {
  return useQuery({ queryKey: ["org-schools", orgId], enabled: !!orgId, queryFn: async () => ((await db.from("schools").select("id, name").eq("org_id", orgId!).eq("is_active", true).order("name")).data ?? []) as Row[] });
}
function scopeText(c: Row, schools: Row[] | undefined) {
  const names = ((c["target_schools"] as string[]) ?? []).map((id) => schools?.find((s) => s["id"] === id)?.["name"]).filter(Boolean);
  return c["scope"] === "school" ? `مدرسة${names[0] ? `: ${names[0]}` : ""}` : `${SCOPE[c["scope"]]} (${names.length} فرع)`;
}

export function CircularsTab({ ctx, focus, onFocus }: { ctx: AppContext & { schoolId: string }; focus: string | undefined; onFocus: (id: string | undefined) => void }) {
  const manager = canManage(ctx.role);
  const [editing, setEditing] = useState<Row | null>(null);
  const q = useQuery({
    queryKey: ["circulars", ctx.schoolId],
    queryFn: async () => {
      const { data, error } = await db.from("circulars").select("*, circular_recipients(user_id, opened_at, ack_required_version, first_version), circular_acks(user_id, version)").or(`school_id.eq.${ctx.schoolId},target_schools.cs.{${ctx.schoolId}}`).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });
  const { data: auth } = useQuery({ queryKey: ["me"], queryFn: async () => (await db.auth.getUser()).data.user });
  const me = auth?.id;
  const schools = useSchools(ctx.orgId ?? undefined);
  const [f, setF] = useState({ q: "", status: "", scope: "", branch: "", from: "", to: "" });
  const list = (q.data ?? []).filter((c) => (!f.q || `${c["title"]} ${c["publisher_label"]}`.includes(f.q)) && (!f.status || c["status"] === f.status) && (!f.scope || c["scope"] === f.scope)
    && (!f.branch || (c["target_schools"] as string[] ?? []).includes(f.branch)) && (!f.from || (c["published_at"] ?? c["created_at"]) >= f.from) && (!f.to || (c["published_at"] ?? c["created_at"]).slice(0, 10) <= f.to));
  if (editing) return <CircularEditor ctx={ctx} initial={editing} onDone={() => { setEditing(null); q.refetch(); }} />;
  const current = focus ? q.data?.find((c) => c["id"] === focus) : undefined;
  if (current) return <CircularView c={current} me={me} manager={manager} onBack={() => onFocus(undefined)} onChanged={() => q.refetch()} onEdit={() => setEditing(current)} />;
  return (
    <div className="space-y-3">
      {manager && <Button size="sm" onClick={() => setEditing({})}>تعميم جديد</Button>}
      <div className="grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
        <Input aria-label="بحث في التعاميم" placeholder="بحث بالعنوان أو الجهة" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <select aria-label="الحالة" className={sel} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">كل الحالات</option>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select aria-label="نوع الاستهداف" className={sel} value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}><option value="">كل النطاقات</option>{Object.entries(SCOPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select aria-label="الفرع" className={sel} value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })}><option value="">كل الفروع</option>{(schools.data ?? []).map((s) => <option key={s["id"]} value={s["id"]}>{s["name"]}</option>)}</select>
        <Input aria-label="من تاريخ" type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <Input aria-label="إلى تاريخ" type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
      </div>
      {q.isLoading ? <LoadingState /> : q.error ? <div className="space-y-2"><ErrorState message={arabicError(q.error)} /><Button size="sm" variant="outline" onClick={() => q.refetch()}>إعادة المحاولة</Button></div> : !list.length ? <EmptyState title={q.data?.length ? "لا توجد تعاميم مطابقة للتصفية" : "لا توجد تعاميم"} /> : (
        <ul className="space-y-2">
          {list.map((c) => {
            const mine = (c["circular_recipients"] as Row[]).find((r) => r["user_id"] === me);
            const needAck = mine?.["ack_required_version"] && !(c["circular_acks"] as Row[]).some((a) => a["user_id"] === me && a["version"] >= mine?.["ack_required_version"]);
            return (
              <li key={c["id"]}>
                <button className="w-full rounded-xl border bg-card p-3 text-start hover:bg-muted" onClick={() => onFocus(c["id"])}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex-1 font-semibold">{c["title"]}</span>
                    {c["priority"] !== "normal" && <span className="rounded-full bg-destructive/10 px-2 text-xs text-destructive">{PRIORITY_LABEL[c["priority"]]}</span>}
                    {needAck && <span className="rounded-full bg-primary/10 px-2 text-xs text-primary">إقرار مطلوب</span>}
                    {mine && !mine?.["opened_at"] && <span className="size-2 rounded-full bg-primary" aria-label="غير مفتوح" />}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{c["publisher_label"]} • {scopeText(c, schools.data)} • {STATUS[c["status"]]}{c["requires_ack"] ? ` • إقرار${c["ack_due"] ? ` حتى ${c["ack_due"]}` : ""}` : ""}{c["version"] > 1 ? ` • الإصدار ${c["version"]}` : ""}{c["published_at"] ? ` • ${new Date(c["published_at"]).toLocaleDateString("ar")}` : ""}</p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function useFiles(id: string) {
  return useQuery({
    queryKey: ["circ-files", id],
    queryFn: async () => ((await db.from("files").select("*").eq("source_type", "circular").eq("source_id", id)).data ?? []) as Row[],
  });
}

function CircularView({ c, me, manager: schoolManager, onBack, onChanged, onEdit }: { c: Row; me: string | undefined; manager: boolean; onBack: () => void; onChanged: () => void; onEdit: () => void }) {
  const qc = useQueryClient();
  const perm = useQuery({ queryKey: ["circ-can", c["id"]], queryFn: async () => !!(await db.rpc("can_manage_circular", { _c: c["id"] })).data });
  const manager = !!perm.data;
  // the actual person behind the publishing body is shown only to those allowed to manage this circular
  const actual = useQuery({
    queryKey: ["circ-publisher", c["id"], c["version"]], enabled: manager && c["status"] !== "draft",
    queryFn: async () => {
      const { data: v } = await db.from("circular_versions").select("published_by").eq("circular_id", c["id"]).eq("version", c["version"]).maybeSingle();
      if (!v) return null;
      const { data: p } = await db.from("profiles").select("full_name, email").eq("id", (v as Row)["published_by"]).maybeSingle();
      return ((p as Row | null)?.["full_name"] || (p as Row | null)?.["email"]) ?? null;
    },
  });
  const [busy, setBusy] = useState(false);
  const files = useFiles(c["id"]);
  const mine = (c["circular_recipients"] as Row[]).find((r) => r["user_id"] === me);
  const acked = mine?.["ack_required_version"] ? (c["circular_acks"] as Row[]).find((a) => a["user_id"] === me && a["version"] >= mine?.["ack_required_version"]) : null;
  useEffect(() => {
    if (mine && !mine?.["opened_at"] && c["status"] !== "draft") db.rpc("open_circular", { _id: c["id"] }).then(onChanged);
  }, [c["id"]]); // eslint-disable-line react-hooks/exhaustive-deps
  const [rev, setRev] = useState<{ title: string; body: string; ack: boolean } | null>(null);
  return (
    <article className="space-y-3 rounded-2xl border bg-card p-4">
      <Button size="sm" variant="ghost" onClick={onBack}>→ كل التعاميم</Button>
      <h2 className="text-xl font-bold">{c["title"]}</h2>
      <p className="text-xs text-muted-foreground">{c["publisher_label"]}{actual.data ? ` (نشره: ${actual.data})` : ""} • {PRIORITY_LABEL[c["priority"]]} • {STATUS[c["status"]]} • الإصدار {c["version"] || "—"}{c["ack_due"] ? ` • موعد الإقرار ${c["ack_due"]}` : ""}</p>
      {mine && c["version"] > (mine["first_version"] ?? 1) && <p className="rounded-md bg-muted p-2 text-xs">تغيّر محتوى هذا التعميم منذ استلامك له (الإصدار الحالي {c["version"]}).{acked ? "" : mine["ack_required_version"] === c["version"] ? " هذا الإصدار يتطلب إقرارًا جديدًا." : ""}</p>}
      <div className="text-sm"><SafeText text={c["body"]} /></div>
      {files.data && files.data.length > 0 && (
        <ul className="flex flex-wrap gap-2">{files.data.map((f) => <li key={f["id"]}><button onClick={() => openFile(f)} className="flex items-center gap-1 rounded-full border px-3 py-1 text-xs hover:bg-muted"><Paperclip className="size-3" />{f["name"]}</button></li>)}</ul>
      )}
      {mine?.["ack_required_version"] && c["status"] === "published" && (acked ? (
        <p className="flex items-center gap-2 text-sm text-primary"><CheckCircle2 className="size-4" /> أقررت بالاطلاع على الإصدار {acked["version"]}</p>
      ) : (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
          <p>فتح التعميم لا يُعد إقرارًا. اضغط للإقرار بالاطلاع على الإصدار {c["version"]}.</p>
          <Button size="sm" className="mt-2" onClick={async () => {
            const { error } = await db.rpc("ack_circular", { _id: c["id"] });
            if (error) return void toast.error(arabicError(error));
            toast.success("سُجّل إقرارك"); onChanged(); qc.invalidateQueries({ queryKey: ["notif-unread"] });
          }}>أقر بالاطلاع</Button>
        </div>
      ))}
      {manager && (
        <div className="space-y-3 border-t pt-3">
          <div className="flex flex-wrap gap-2">
            {c["status"] === "draft" && <Button size="sm" variant="outline" onClick={onEdit}>تعديل المسودة</Button>}
            {c["status"] === "draft" && <Button size="sm" onClick={async () => {
              if (busy || !window.confirm("نشر التعميم للجمهور المحدد؟ يُحفظ الجمهور عند النشر.")) return;
              setBusy(true);
              const { data, error } = await db.rpc("publish_circular", { _id: c["id"] });
              setBusy(false);
              if (error) toast.error(arabicError(error)); else { toast.success(`نُشر إلى ${data} مستلم`); onChanged(); }
            }} disabled={busy}>{busy ? "جارٍ النشر…" : "نشر"}</Button>}
            {c["status"] === "published" && <Button size="sm" variant="outline" onClick={() => setRev({ title: c["title"], body: c["body"], ack: c["requires_ack"] })}>إصدار معدّل</Button>}
            {c["status"] === "published" && c["requires_ack"] && <Button size="sm" variant="outline" onClick={async () => {
              const { data, error } = await db.rpc("remind_circular_ack", { _id: c["id"] });
              if (error) toast.error(arabicError(error)); else toast.success(`أُرسل تذكير إلى ${data} (مرة واحدة يوميًا)`);
            }}>تذكير غير المقرّين</Button>}
            {c["status"] === "archived" && <Button size="sm" variant="outline" onClick={async () => { const { error } = await db.rpc("reopen_circular", { _id: c["id"] }); if (error) toast.error(arabicError(error)); else { toast.success("أُعيد فتح التعميم؛ الموعد والإقرارات كما هي ولم تُرسل تنبيهات"); onChanged(); } }}>إعادة الفتح</Button>}
            {c["status"] === "published" && <Button size="sm" variant="ghost" onClick={async () => { if (!window.confirm("الأرشفة توقف الإقرار والتذكير وتحفظ السجل. متابعة؟")) return; const { error } = await db.rpc("archive_circular", { _id: c["id"] }); if (error) toast.error(arabicError(error)); else onChanged(); }}>أرشفة</Button>}
          </div>
          {rev && (
            <form className="space-y-2 rounded-lg border p-3" onSubmit={async (e) => {
              e.preventDefault();
              const { data, error } = await db.rpc("revise_circular", { _id: c["id"], _title: rev.title, _body: rev.body, _requires_new_ack: rev.ack });
              if (error) return void toast.error(arabicError(error));
              toast.success(`نُشر الإصدار ${data}؛ النص السابق محفوظ`); setRev(null); onChanged();
            }}>
              <p className="text-xs text-muted-foreground">التعديل الجوهري ينشئ إصدارًا جديدًا لنفس المستلمين، ويُحفظ النص السابق كما أُقرّ به.</p>
              <Input aria-label="العنوان" value={rev.title} onChange={(e) => setRev({ ...rev, title: e.target.value })} />
              <Textarea aria-label="المحتوى" rows={5} value={rev.body} onChange={(e) => setRev({ ...rev, body: e.target.value })} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={rev.ack} onChange={(e) => setRev({ ...rev, ack: e.target.checked })} /> يتطلب إقرارًا جديدًا على هذا الإصدار</label>
              <div className="flex gap-2"><Button size="sm">نشر الإصدار</Button><Button size="sm" type="button" variant="ghost" onClick={() => setRev(null)}>إلغاء</Button></div>
            </form>
          )}
          {c["status"] !== "draft" && <Versions id={c["id"]} />}
        </div>
      )}
      {(manager || schoolManager) && c["status"] !== "draft" && <Stats id={c["id"]} title={c["title"]} />}
    </article>
  );
}

function Stats({ id, title }: { id: string; title: string }) {
  const q = useQuery({
    queryKey: ["circ-stats", id],
    queryFn: async () => {
      const { data, error } = await db.rpc("circular_stats", { _id: id });
      if (error) throw error;
      return data as Row[];
    },
  });
  const [f, setF] = useState({ branch: "", role: "", version: "" });
  if (q.isLoading) return <LoadingState />;
  if (q.error) return <div className="space-y-2"><ErrorState message={arabicError(q.error)} /><Button size="sm" variant="outline" onClick={() => q.refetch()}>إعادة المحاولة</Button></div>;
  const all = q.data ?? [];
  const branches = [...new Map(all.map((r) => [r["school_id"], r["school_name"]])).entries()];
  const rolesSet = [...new Set(all.flatMap((r) => String(r["role"] ?? "").split(",").filter(Boolean)))];
  const filtered = all.filter((r) => (!f.branch || r["school_id"] === f.branch) && (!f.role || String(r["role"] ?? "").split(",").includes(f.role)) && (!f.version || String(r["acked_version"] ?? "") === f.version));
  const rows = filtered.filter((r) => r["eligible"]);
  const gone = filtered.filter((r) => !r["eligible"]);
  const opened = rows.filter((r) => r["opened_at"]).length;
  const need = rows.filter((r) => r["ack_required_version"]);
  const acked = need.filter((r) => r["acked_version"] != null && r["acked_version"] >= r["ack_required_version"]).length;
  const ackText = (r: Row) => !r["ack_required_version"] ? "غير مطلوب" : r["acked_at"] ? `${new Date(r["acked_at"]).toLocaleString("ar")} (إ${r["acked_version"]})${r["acked_version"] < r["ack_required_version"] ? " — إصدار أقدم" : ""}` : "لم يقر";
  function exportCsv() {
    const esc = (x: unknown) => `"${String(x ?? "").replace(/"/g, '""')}"`;
    const lines = [["الاسم", "الفرع", "الدور", "مؤهل حاليًا", "طريقة الإضافة", "الفتح", "الإقرار"].map(esc).join(",")]
      .concat(filtered.map((r) => [r["full_name"], r["school_name"], r["role"], r["eligible"] ? "نعم" : "لا", r["added_reason"] === "manual" ? "إضافة لاحقة" : "عند النشر", r["opened_at"] ?? "", ackText(r)].map(esc).join(",")));
    const url = URL.createObjectURL(new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `تقرير-${title}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  return (
    <section className="space-y-2 border-t pt-3 text-sm">
      <h3 className="font-bold">المستهدفون المؤهلون: {rows.length} • شاهدوا: {opened}{need.length ? ` • أقروا: ${acked} • لم يقروا: ${need.length - acked}` : ""}{gone.length ? ` • زالت أهليتهم: ${gone.length}` : ""}</h3>
      <div className="flex flex-wrap gap-2">
        {branches.length > 1 && <select aria-label="تصفية حسب الفرع" className={sel + " w-auto"} value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })}><option value="">كل الفروع</option>{branches.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>}
        <select aria-label="تصفية حسب الدور" className={sel + " w-auto"} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="">كل الأدوار</option>{rolesSet.map((r) => <option key={r} value={r}>{ROLE_AR[r] ?? r}</option>)}</select>
        <select aria-label="تصفية حسب الإصدار المُقر به" className={sel + " w-auto"} value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })}><option value="">كل الإصدارات</option>{[...new Set(all.map((r) => r["acked_version"]).filter((x) => x != null))].map((v) => <option key={v} value={String(v)}>الإصدار {v}</option>)}</select>
        <Button size="sm" variant="outline" onClick={exportCsv}>تصدير CSV</Button>
      </div>
      <div className="max-h-72 overflow-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted"><tr><th className="p-2 text-start">الاسم</th><th className="p-2 text-start">الفرع</th><th className="p-2 text-start">الدور</th><th className="p-2 text-start">الفتح</th><th className="p-2 text-start">الإقرار</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r["user_id"]} className="border-t">
              <td className="p-2">{r["full_name"]}{r["added_reason"] === "manual" ? " (أضيف لاحقًا)" : ""}</td>
              <td className="p-2">{r["school_name"]}</td>
              <td className="p-2">{String(r["role"] ?? "").split(",").map((x) => ROLE_AR[x] ?? x).join("، ")}</td>
              <td className="p-2">{r["opened_at"] ? new Date(r["opened_at"]).toLocaleString("ar") : "—"}</td>
              <td className="p-2">{ackText(r)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {gone.length > 0 && <details><summary className="cursor-pointer text-muted-foreground">زالت أهليتهم ({gone.length}) — خارج نسبة المتابعة ولا يُذكَّرون</summary>
        <ul className="mt-1 list-disc ps-5 text-xs">{gone.map((r) => <li key={r["user_id"]}>{r["full_name"]} — {r["school_name"]} — {ackText(r)}</li>)}</ul></details>}
    </section>
  );
}

function Versions({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["circ-versions", id], queryFn: async () => ((await db.from("circular_versions").select("version, title, body, published_at, requires_ack, publisher_label").eq("circular_id", id).order("version", { ascending: false })).data ?? []) as Row[] });
  if (!q.data || q.data.length < 2) return null;
  return (
    <details className="text-sm"><summary className="cursor-pointer font-semibold">الإصدارات السابقة ({q.data.length})</summary>
      <ul className="mt-2 space-y-2">{q.data.map((v) => <li key={v["version"]} className="rounded border p-2"><b>الإصدار {v["version"]}</b> — {new Date(v["published_at"]).toLocaleString("ar")}{v["publisher_label"] ? ` — ${v["publisher_label"]}` : ""}<p className="font-semibold">{v["title"]}</p><p className="whitespace-pre-wrap text-muted-foreground">{v["body"]}</p></li>)}</ul>
    </details>
  );
}

function CircularEditor({ ctx, initial, onDone }: { ctx: AppContext & { schoolId: string }; initial: Row; onDone: () => void }) {
  const a = (initial["audience"] ?? {}) as Row;
  const [v, setV] = useState({ title: initial["title"] ?? "", body: initial["body"] ?? "", priority: initial["priority"] ?? "normal", requires_ack: !!initial["requires_ack"], ack_due: initial["ack_due"] ?? "" });
  const [roles, setRoles] = useState<string[]>(a["roles"] ?? []);
  const [depts, setDepts] = useState<string[]>(a["departments"] ?? []);
  const [groups, setGroups] = useState<string[]>(a["groups"] ?? []);
  const [users, setUsers] = useState<string[]>(a["users"] ?? []);
  const [id, setId] = useState<string | null>(initial["id"] ?? null);
  const [preview, setPreview] = useState<Row[] | null>(null);
  const isOwner = ctx.role === "org_owner";
  const [scope, setScope] = useState<string>(initial["scope"] ?? "school");
  const [targets, setTargets] = useState<string[]>(initial["scope"] === "branches" ? initial["target_schools"] ?? [] : []);
  const schools = useSchools(ctx.orgId ?? undefined);
  const deptOpts = useOptions("departments", "name", ctx.schoolId);
  const groupOpts = useQuery({ queryKey: ["circ-groups", ctx.schoolId], queryFn: async () => ((await db.from("conversations").select("id, title").eq("kind", "group").eq("school_id", ctx.schoolId).eq("status", "active")).data ?? []) as Row[] });
  const files = useFiles(id ?? "none");
  const audience = { roles, departments: depts, groups, users };
  const toggle = (arr: string[], set: (x: string[]) => void, x: string) => set(arr.includes(x) ? arr.filter((y) => y !== x) : [...arr, x]);
  async function save() {
    const { data, error } = await db.rpc("save_circular", { _id: id, _school: ctx.schoolId, _title: v.title, _body: v.body, _publisher: null, _priority: v.priority, _requires_ack: v.requires_ack, _ack_due: v.ack_due || null, _aud: audience, _scope: scope, _schools: scope === "branches" ? targets : null });
    if (error) { toast.error(arabicError(error)); return null; }
    setId(data); return data as string;
  }
  return (
    <div className="space-y-3 rounded-2xl border bg-card p-4 text-sm">
      <h2 className="font-bold">{id ? "تعديل مسودة تعميم" : "تعميم جديد"}</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="ct">العنوان</Label><Input id="ct" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></div>
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="cb">المحتوى</Label><Textarea id="cb" rows={6} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="cp">الجهة الناشرة</Label><Input id="cp" readOnly value={scope === "school" ? `إدارة المدرسة — ${ctx.schoolName}` : `إدارة المؤسسة — ${ctx.orgName}`} /><p className="text-xs text-muted-foreground">تُحدَّد تلقائيًا من النطاق، ولا يمكن النشر باسم جهة أخرى.</p></div>
        <div className="space-y-1"><Label htmlFor="cpr">الأولوية</Label><select id="cpr" className={sel} value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value })}>{Object.entries(PRIORITY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={v.requires_ack} onChange={(e) => setV({ ...v, requires_ack: e.target.checked })} /> يتطلب إقرار اطلاع</label>
        {v.requires_ack && <div className="space-y-1"><Label htmlFor="cd">موعد الإقرار</Label><Input id="cd" type="date" value={v.ack_due} onChange={(e) => setV({ ...v, ack_due: e.target.value })} /></div>}
      </div>
      <fieldset className="space-y-2 rounded-lg border p-3">
        <legend className="px-1 font-semibold">النطاق والفروع</legend>
        {isOwner ? (
          <div className="flex flex-wrap gap-3">{Object.entries(SCOPE).map(([k, l]) => <label key={k} className="flex items-center gap-1"><input type="radio" name="scope" checked={scope === k} onChange={() => setScope(k)} />{k === "school" ? "هذه المدرسة فقط" : k === "org" ? "كل فروع المؤسسة" : l}</label>)}</div>
        ) : <p className="text-muted-foreground">النشر داخل مدرستك فقط. النشر على عدة فروع لمالك المؤسسة.</p>}
        {scope === "branches" && <div className="flex flex-wrap gap-3">{(schools.data ?? []).map((s) => <label key={s["id"]} className="flex items-center gap-1"><input type="checkbox" checked={targets.includes(s["id"])} onChange={() => toggle(targets, setTargets, s["id"])} />{s["name"]}</label>)}</div>}
      </fieldset>
      <fieldset className="space-y-2 rounded-lg border p-3">
        <legend className="px-1 font-semibold">الجمهور (يُتحقق منه في الخادم ويُحفظ عند النشر)</legend>
        <p className="text-xs text-muted-foreground">كيف يُجمع الجمهور: يُختار الفرع أولًا، ثم داخل كل فرع يُضم كل من يطابق أيًّا من الاختيارات (دور أو قسم أو مجموعة أو فرد). من يملك أكثر من عضوية يُحسب مرة واحدة، والعضويات غير المفعّلة تُستبعد.{scope !== "school" ? " الأقسام والمجموعات والأفراد المعروضون هنا من مدرستك الحالية؛ الأدوار تُطبق على كل الفروع المختارة." : ""}</p>
        <div className="flex flex-wrap gap-3">{["teacher", "dept_head", "supervisor", "vice_principal", "student_affairs", "counselor", "nurse", "security", "guardian", "student"].map((r) => (
          <label key={r} className="flex items-center gap-1"><input type="checkbox" checked={roles.includes(r)} onChange={() => toggle(roles, setRoles, r)} />{ROLE_AR[r]}</label>
        ))}</div>
        {!!deptOpts.data?.length && <div className="flex flex-wrap gap-3"><span className="text-muted-foreground">أقسام:</span>{deptOpts.data.map((d) => <label key={d.value} className="flex items-center gap-1"><input type="checkbox" checked={depts.includes(d.value)} onChange={() => toggle(depts, setDepts, d.value)} />{d.label}</label>)}</div>}
        {!!groupOpts.data?.length && <div className="flex flex-wrap gap-3"><span className="text-muted-foreground">مجموعات:</span>{groupOpts.data.map((g) => <label key={g["id"]} className="flex items-center gap-1"><input type="checkbox" checked={groups.includes(g["id"])} onChange={() => toggle(groups, setGroups, g["id"])} />{g["title"]}</label>)}</div>}
        <details><summary className="cursor-pointer text-muted-foreground">أفراد محددون ({users.length})</summary><MemberPicker schoolId={ctx.schoolId} orgId={ctx.orgId} value={users} onChange={setUsers} /></details>
        <Button size="sm" variant="outline" type="button" onClick={async () => {
          const { data, error } = await db.rpc("preview_circular_audience", { _school: ctx.schoolId, _aud: audience, _scope: scope, _schools: scope === "branches" ? targets : null });
          if (error) return void toast.error(arabicError(error));
          setPreview(data as Row[]);
        }}>معاينة المستلمين</Button>
        {preview && <PreviewList rows={preview} />}
      </fieldset>
      {id && (
        <div className="space-y-1">
          <p className="font-semibold">المرفقات</p>
          <ul className="flex flex-wrap gap-2">{(files.data ?? []).map((f) => <li key={f["id"]} className="rounded-full border px-3 py-1 text-xs">{f["name"]}</li>)}</ul>
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-1 text-xs hover:bg-muted"><Paperclip className="size-3" /> إرفاق ملف
            <input type="file" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
              const { data, error } = await db.rpc("create_circular_file", { _circular: id, _name: f.name, _mime: f.type || "application/octet-stream", _size: f.size });
              if (error) return void toast.error(arabicError(error));
              const rec = (data as Row[])[0]!;
              const up = await db.storage.from(BUCKET).upload(rec["storage_path"], f, { contentType: f.type });
              if (up.error) { await db.from("files").delete().eq("id", rec["id"]); return void toast.error("تعذر رفع الملف؛ لم يُحفظ. أعد المحاولة."); }
              toast.success("أُرفق الملف"); files.refetch();
            }} />
          </label>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={async () => { if (await save()) toast.success("حُفظت المسودة"); }}>حفظ كمسودة</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>إغلاق</Button>
      </div>
      <p className="text-xs text-muted-foreground">بعد الحفظ يمكنك إرفاق الملفات، ثم فتح المسودة من القائمة لنشرها.</p>
    </div>
  );
}

function PreviewList({ rows }: { rows: Row[] }) {
  const inc = rows.filter((r) => r["included"]);
  const exc = rows.filter((r) => !r["included"]);
  const counts = new Map<string, number>();
  for (const r of inc) counts.set(r["school_name"], (counts.get(r["school_name"]) ?? 0) + 1);
  const byBranch = [...counts];
  return (
    <div className="space-y-1 text-xs">
      <p className="font-semibold">سيصل إلى {inc.length} مستلم{byBranch.length > 1 ? ` — ${byBranch.map(([n, c]) => `${n}: ${c}`).join("، ")}` : ""}</p>
      <ul className="max-h-48 overflow-auto rounded border p-2">{inc.map((r) => <li key={r["user_id"]}>{r["full_name"]} — {r["school_name"]} — {String(r["role"] ?? "").split(",").map((x) => ROLE_AR[x] ?? x).join("، ")}{r["reason"] ? ` (${r["reason"]})` : ""}</li>)}</ul>
      {exc.length > 0 && <details><summary className="cursor-pointer text-muted-foreground">مستبعدون ({exc.length})</summary><ul className="ps-4">{exc.map((r) => <li key={r["user_id"]}>{r["full_name"]} — {r["school_name"]}: {r["reason"]}</li>)}</ul></details>}
    </div>
  );
}
