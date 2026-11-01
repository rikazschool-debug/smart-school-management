import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { arabicError, useSession } from "@/lib/session";
import { GROUP_TYPE_LABEL } from "@/lib/comm";
import { MemberPicker } from "@/components/comm/member-picker";

const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
const ACTION: Record<string, string> = {
  group_create: "إنشاء المجموعة", member_add: "إضافة عضو", member_remove: "إزالة عضو", member_leave: "مغادرة عضو", role_change: "تغيير دور",
  owner_transfer: "نقل الملكية", group_archive: "أرشفة", group_reopen: "إعادة فتح", settings_update: "تعديل الإعدادات", derived_add: "إضافة تلقائية من القسم",
  derived_remove: "إزالة تلقائية (خرج من القسم)", moderate_delete: "حذف رسالة بالإشراف",
};

export function GroupPanel({ convId, myRole, onChanged }: { convId: string; myRole: string | null; onChanged: () => void }) {
  const qc = useQueryClient();
  const { user, active } = useSession();
  const conv = useQuery({
    queryKey: ["conv", convId],
    queryFn: async () => {
      const { data, error } = await db.from("conversations").select("*, departments(name)").eq("id", convId).single();
      if (error) throw error;
      return data as Row;
    },
  });
  const people = useQuery({
    queryKey: ["people", convId],
    queryFn: async () => {
      const { data, error } = await db.rpc("conversation_people", { _conv: convId });
      if (error) throw error;
      return data as Row[];
    },
  });
  const audit = useQuery({
    queryKey: ["audit", convId],
    queryFn: async () => {
      const { data } = await db.from("comm_audit").select("id, action, details, created_at, actor").eq("conversation_id", convId).order("created_at", { ascending: false }).limit(50);
      return (data ?? []) as Row[];
    },
  });
  const [adding, setAdding] = useState<string[]>([]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["conv", convId] }); qc.invalidateQueries({ queryKey: ["people", convId] }); qc.invalidateQueries({ queryKey: ["audit", convId] }); onChanged(); };
  const call = async (fn: string, args: Row, ok: string) => {
    const { error } = await db.rpc(fn, args);
    if (error) toast.error(arabicError(error)); else { toast.success(ok); refresh(); }
  };
  if (conv.isLoading || people.isLoading) return <LoadingState />;
  if (conv.error) return <ErrorState message={arabicError(conv.error)} />;
  const c = conv.data!;
  const isAdmin = myRole === "owner" || myRole === "moderator" || myRole === null;
  const isOwner = myRole === "owner" || myRole === null;
  // Adding members by hand is administrative (owner of the organization, or the principal of this school) — mirrors add_group_members.
  const canAddMembers = !!active && (active.role === "org_owner" ? active.orgId === c["org_id"] : active.role === "principal" && !!c["school_id"] && active.schoolId === c["school_id"]);
  const names = Object.fromEntries((people.data ?? []).map((p) => [p["user_id"], p["full_name"]]));

  return (
    <div className="space-y-5 text-sm">
      <section className="rounded-xl border bg-card p-3">
        <h3 className="font-bold">{c["title"]}</h3>
        {c["description"] && <p className="mt-1 text-muted-foreground">{c["description"]}</p>}
        <ul className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <li>النوع: {GROUP_TYPE_LABEL[c["group_type"]] ?? "—"}</li>
          <li>العضوية: {c["membership_mode"] === "derived" ? `مشتقة تلقائيًا من قسم ${c["departments"]?.name ?? ""}` : "يدوية (لا تتغير بتغير القسم)"}</li>
          <li>النشر: {c["post_policy"] === "all" ? "كل الأعضاء" : "المشرفون فقط"}</li>
          <li>العضو الجديد يرى: {c["history_policy"] === "full" ? "التاريخ كاملًا" : "الرسائل من تاريخ انضمامه فقط"}</li>
          <li>المرفقات: {c["allow_attachments"] ? "مسموحة (حسب سياسة الملفات)" : "غير مسموحة"}</li>
          <li>الحالة: {c["status"] === "archived" ? "مؤرشفة" : "نشطة"}{c["expires_at"] ? ` • تنتهي ${c["expires_at"]}` : ""}</li>
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          {myRole && myRole !== "owner" && c["membership_mode"] === "manual" && <Button size="sm" variant="outline" onClick={() => window.confirm("مغادرة المجموعة؟") && call("leave_group", { _conv: convId }, "غادرت المجموعة")}>مغادرة</Button>}
          {isOwner && <Button size="sm" variant="outline" onClick={() => call("set_group_status", { _conv: convId, _status: c["status"] === "archived" ? "active" : "archived" }, c["status"] === "archived" ? "أُعيد فتح المجموعة" : "أُرشفت المجموعة")}>{c["status"] === "archived" ? "إعادة فتح" : "أرشفة المجموعة"}</Button>}
        </div>
      </section>

      {isAdmin && <Settings c={c} onSaved={refresh} />}

      <section>
        <h3 className="mb-2 font-bold">الأعضاء ({people.data?.length ?? 0})</h3>
        <ul className="divide-y rounded-xl border bg-card">
          {(people.data ?? []).map((p) => (
            <li key={p["user_id"]} className="flex flex-wrap items-center gap-2 p-2">
              <span className="min-w-0 flex-1 truncate">{p["full_name"]} {p["user_id"] === user.id && "(أنت)"}</span>
              <span className="text-xs text-muted-foreground">{p["role"] === "owner" ? "المالك" : p["role"] === "moderator" ? "مشرف" : "عضو"}{p["source"] === "derived" ? " • تلقائي" : ""}</span>
              {isOwner && p["role"] !== "owner" && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => call("set_group_role", { _conv: convId, _user: p["user_id"], _role: p["role"] === "moderator" ? "member" : "moderator" }, "تم تحديث الدور")}>{p["role"] === "moderator" ? "إلغاء الإشراف" : "تعيين مشرفًا"}</Button>
                  <Button size="sm" variant="ghost" onClick={() => window.confirm(`نقل ملكية المجموعة إلى ${p["full_name"]}؟`) && call("transfer_group_owner", { _conv: convId, _user: p["user_id"] }, "نُقلت الملكية")}>نقل الملكية</Button>
                </>
              )}
              {isAdmin && p["role"] !== "owner" && p["source"] !== "derived" && p["user_id"] !== user.id && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => window.confirm(`إزالة ${p["full_name"]}؟ يتوقف وصوله فورًا للرسائل والبحث وطلبات التنزيل الجديدة.`) && call("remove_group_member", { _conv: convId, _user: p["user_id"] }, "أُزيل العضو")}>إزالة</Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {canAddMembers && c["membership_mode"] === "manual" && c["status"] === "active" && (
        <section className="space-y-2 rounded-xl border bg-card p-3">
          <h3 className="font-bold">إضافة أعضاء</h3>
          <p className="text-xs text-muted-foreground">تظهر فقط الحسابات السارية ضمن نطاق المجموعة. {c["history_policy"] === "full" ? "سيرى المضافون التاريخ كاملًا." : "سيرى المضافون الرسائل من لحظة إضافتهم فقط."}</p>
          <MemberPicker schoolId={c["school_id"]} orgId={c["org_id"]} exclude={(people.data ?? []).map((p) => p["user_id"])} value={adding} onChange={setAdding} />
          <Button size="sm" disabled={!adding.length} onClick={async () => { await call("add_group_members", { _conv: convId, _users: adding }, `أُضيف ${adding.length}`); setAdding([]); }}>إضافة {adding.length || ""}</Button>
        </section>
      )}

      {isAdmin && (
        <section>
          <h3 className="mb-2 font-bold">سجل العضوية والإعدادات</h3>
          {!audit.data?.length ? <p className="text-xs text-muted-foreground">لا توجد سجلات.</p> : (
            <ul className="space-y-1 text-xs">
              {audit.data.map((a) => <li key={a["id"]} className="rounded bg-muted/50 px-2 py-1">{new Date(a["created_at"]).toLocaleString("ar")} — {ACTION[a["action"]] ?? a["action"]}{a["details"]?.user ? `: ${names[a["details"].user] ?? "مستخدم"}` : ""}</li>)}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function Settings({ c, onSaved }: { c: Row; onSaved: () => void }) {
  const [v, setV] = useState({ title: c["title"], description: c["description"] ?? "", post_policy: c["post_policy"], allow_attachments: c["allow_attachments"], history_policy: c["history_policy"], expires_at: c["expires_at"] ?? "" });
  const [open, setOpen] = useState(false);
  if (!open) return <Button size="sm" variant="outline" onClick={() => setOpen(true)}>تعديل الإعدادات</Button>;
  return (
    <form className="grid gap-2 rounded-xl border bg-card p-3 sm:grid-cols-2" onSubmit={async (e) => {
      e.preventDefault();
      const { error } = await db.rpc("update_group_settings", { _conv: c["id"], _expected: c["updated_at"], _title: v.title, _description: v.description, _post_policy: v.post_policy, _allow_attachments: v.allow_attachments, _history_policy: v.history_policy, _expires_at: v.expires_at || null });
      if (error) return void toast.error(arabicError(error));
      toast.success("حُفظت الإعدادات"); setOpen(false); onSaved();
    }}>
      <div className="space-y-1"><Label htmlFor="gt">الاسم</Label><Input id="gt" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor="ge">تاريخ الانتهاء (اختياري)</Label><Input id="ge" type="date" value={v.expires_at} onChange={(e) => setV({ ...v, expires_at: e.target.value })} /></div>
      <div className="space-y-1 sm:col-span-2"><Label htmlFor="gd">الوصف</Label><Input id="gd" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor="gp">من ينشر</Label><select id="gp" className={sel} value={v.post_policy} onChange={(e) => setV({ ...v, post_policy: e.target.value })}><option value="all">كل الأعضاء</option><option value="moderators">المشرفون فقط</option></select></div>
      <div className="space-y-1"><Label htmlFor="gh">تاريخ العضو الجديد</Label><select id="gh" className={sel} value={v.history_policy} onChange={(e) => setV({ ...v, history_policy: e.target.value })}><option value="from_join">من تاريخ الانضمام</option><option value="full">التاريخ كاملًا (اختيار صريح)</option></select></div>
      <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" checked={v.allow_attachments} onChange={(e) => setV({ ...v, allow_attachments: e.target.checked })} /> السماح بالمرفقات</label>
      <p className="text-xs text-muted-foreground sm:col-span-2">تغيير «التاريخ كاملًا» ينطبق على من يُضاف بعد الحفظ. إذا عدّل مسؤول آخر الإعدادات في الوقت نفسه سيُرفض الحفظ لتعيد المحاولة على أحدث نسخة.</p>
      <div className="flex gap-2 sm:col-span-2"><Button size="sm">حفظ</Button><Button size="sm" type="button" variant="ghost" onClick={() => setOpen(false)}>إلغاء</Button></div>
    </form>
  );
}

