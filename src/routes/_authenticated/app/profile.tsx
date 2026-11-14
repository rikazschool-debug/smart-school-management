import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, UserCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { arabicError, useSession } from "@/lib/session";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { useOpsStaff } from "@/lib/ops-staff";
import { useOwnerInSchool } from "@/lib/owner-scope";
import { SchoolProfile } from "@/components/school-profile";

export const Route = createFileRoute("/_authenticated/app/profile")({
  head: () => ({ meta: [{ title: "الملف الشخصي — ركاز" }, { name: "robots", content: "noindex" }] }),
  component: Page,
});

type P = { full_name?: string; phone?: string; email?: string; avatar_path?: string | null; national_id?: string; specialization?: string; department?: string; stages?: string[]; section?: string; children?: string[] };

/** Saudi mobile shown as 966XXXXXXXXX. */
function phone966(v?: string | null) {
  const d = String(v ?? "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("966")) return d;
  if (d.startsWith("05")) return "966" + d.slice(1);
  if (d.startsWith("5") && d.length === 9) return "966" + d;
  return d;
}

function Page() {
  const { active, user } = useSession();
  const qc = useQueryClient();
  const ops = useOpsStaff(active ?? null, user?.id);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const S = active?.schoolId ?? null;
  const q = useQuery({
    queryKey: ["my-profile", S, user.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_profile" as never, { _school: S } as never);
      if (error) throw error;
      const p = data as unknown as P;
      let photo: string | null = null;
      if (p.avatar_path) photo = (await supabase.storage.from("avatars").createSignedUrl(p.avatar_path, 3600)).data?.signedUrl ?? null;
      return { ...p, photo };
    },
  });
  const inSchool = useOwnerInSchool();
  if (!active) return <EmptyState title="لا يوجد حساب نشط" />;
  if (active.role === "org_owner" && inSchool && active.schoolId) return <SchoolProfile schoolId={active.schoolId} />;
  const role = active.role as Role;

  async function upload(f: File) {
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) return void toast.error("الصورة يجب أن تكون PNG أو JPG أو WEBP");
    if (f.size > 2 * 1024 * 1024) return void toast.error("الحد الأقصى للصورة 2 ميجابايت");
    setBusy(true);
    const path = `${user.id}/avatar-${Date.now()}.${f.type.split("/")[1]}`;
    const up = await supabase.storage.from("avatars").upload(path, f, { contentType: f.type });
    if (up.error) { setBusy(false); return void toast.error(arabicError(up.error)); }
    const old = q.data?.avatar_path;
    const { error } = await supabase.rpc("set_my_avatar" as never, { _path: path } as never);
    if (!error && old) await supabase.storage.from("avatars").remove([old]);
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    toast.success("تم تحديث الصورة");
    qc.invalidateQueries({ queryKey: ["my-profile"] }); qc.invalidateQueries({ queryKey: ["my-avatar"] });
  }

  const p = q.data;
  const rows: [string, string | null | undefined][] = p ? [
    ["الاسم", p.full_name],
    ["الحساب", `${ops.title ?? ROLE_LABELS[role]} — ${active.role === "org_owner" && !inSchool ? active.orgName : active.schoolName}`],
    ["رقم الهوية", p.national_id],
    ["الجوال", phone966(p.phone)],
    ["البريد", p.email && !p.email.endsWith(".local") ? p.email : null],
    ...(role === "teacher" || p.specialization ? [["التخصص", p.specialization] as [string, string | undefined]] : []),
    ...(p.department ? [["القسم", p.department] as [string, string]] : []),
    ...(role === "teacher" || role === "vice_principal" ? [["المرحلة الدراسية", p.stages?.length ? p.stages.join("، ") : null] as [string, string | null]] : []),
    ...(role === "student" ? [["المرحلة / الصف / الشعبة", p.section] as [string, string | undefined]] : []),
    ...(role === "guardian" ? [["الأبناء", p.children?.length ? p.children.join("، ") : null] as [string, string | null]] : []),
  ] : [];

  return (
    <>
      <PageHeader title="الملف الشخصي" desc="بياناتك كما سجلتها المدرسة. لتصحيح أي بيان تواصل مع إدارة المدرسة." />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : p && (
        <div className="max-w-2xl rounded-2xl border bg-card p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-4">
            {p.photo ? <img src={p.photo} alt={p.full_name ?? "الصورة الشخصية"} className="size-24 rounded-full border object-cover" />
              : <span className="grid size-24 place-items-center rounded-full bg-secondary text-secondary-foreground"><UserCircle className="size-14" /></span>}
            <div>
              <p className="font-display text-xl">{p.full_name ?? "—"}</p>
              <p className="text-sm text-muted-foreground">{ops.title ?? ROLE_LABELS[role]}</p>
              <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} />
              <Button size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => file.current?.click()}><Camera className="size-4" />{busy ? "جارٍ الرفع…" : p.photo ? "تغيير الصورة" : "إضافة صورة"}</Button>
            </div>
          </div>
          <dl className="divide-y">
            {rows.map(([k, v]) => (
              <div key={k} className="grid grid-cols-3 gap-2 py-2.5 text-sm">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="col-span-2 font-medium" dir={/الهوية|الجوال|البريد/.test(k) ? "ltr" : undefined} style={/الهوية|الجوال|البريد/.test(k) ? { textAlign: "right" } : undefined}>{v || <span className="text-muted-foreground">غير مسجل</span>}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </>
  );
}
