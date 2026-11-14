import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { arabicError } from "@/lib/session";
import { ROLE_AR } from "@/lib/comm";

export type XbState = { mode: "off" | "all" | "scoped"; schools: string[]; roles: string[]; me: boolean; owner: boolean };

/** Cross-branch staff messaging state for the current org (server decides `me`). */
export function useXbranch(orgId: string | null | undefined) {
  return useQuery({
    enabled: !!orgId,
    queryKey: ["xb", orgId],
    queryFn: async () => {
      const { data, error } = await db.rpc("xb_get" as never, { _org: orgId } as never);
      if (error) throw error;
      return data as unknown as XbState;
    },
  });
}

const STAFF_ROLES = ["principal", "vice_principal", "dept_head", "supervisor", "student_affairs", "teacher", "counselor", "nurse", "security"];

/** Org-owner setting «التواصل بين الفروع». */
export function XbranchSettings({ orgId }: { orgId: string }) {
  const q = useXbranch(orgId);
  const schools = useQuery({
    queryKey: ["xb-schools", orgId],
    queryFn: async () => {
      const { data, error } = await db.from("schools").select("id, name").eq("org_id", orgId).order("name");
      if (error) throw error;
      return data as Row[];
    },
  });
  const [v, setV] = useState<XbState | null>(null);
  useEffect(() => { if (q.data) setV(q.data); }, [q.data]);
  const [busy, setBusy] = useState(false);
  if (!v) return <LoadingState />;
  const tog = (k: "schools" | "roles", id: string) => setV({ ...v, [k]: v[k].includes(id) ? v[k].filter((x) => x !== id) : [...v[k], id] });
  return (
    <form className="space-y-3 rounded-2xl border bg-card p-4 text-sm" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true);
      const { error } = await db.rpc("xb_save" as never, { _org: orgId, _mode: v.mode, _schools: v.mode === "scoped" ? v.schools : [], _roles: v.mode === "scoped" ? v.roles : [] } as never);
      setBusy(false);
      if (error) return void toast.error(arabicError(error));
      toast.success("حُفظ إعداد التواصل بين الفروع"); q.refetch();
    }}>
      <h3 className="font-semibold">التواصل بين الفروع</h3>
      <p className="text-xs text-muted-foreground">يسمح للموظفين والمعلمين بمراسلة زملائهم في فروع المجموعة الأخرى. المراسلة لا تمنح أي وصول لملفات الفرع الآخر أو بيانات طلابه، ولا تشمل الطلاب وأولياء الأمور.</p>
      <div className="flex flex-wrap gap-3">
        {([["off", "متوقف"], ["all", "لكل الموظفين"], ["scoped", "لفروع وأدوار محددة"]] as const).map(([k, l]) => (
          <label key={k} className="flex items-center gap-1"><input type="radio" name="xbmode" checked={v.mode === k} onChange={() => setV({ ...v, mode: k })} />{l}</label>
        ))}
      </div>
      {v.mode === "scoped" && (
        <>
          <fieldset><legend className="font-medium">الفروع المشمولة (بدون اختيار = كل الفروع)</legend>
            <div className="mt-1 flex flex-wrap gap-3">{(schools.data ?? []).map((s) => (
              <label key={s["id"]} className="flex items-center gap-1"><input type="checkbox" checked={v.schools.includes(s["id"])} onChange={() => tog("schools", s["id"])} />{s["name"]}</label>
            ))}</div>
          </fieldset>
          <fieldset><legend className="font-medium">الأدوار المشمولة (بدون اختيار = كل الأدوار)</legend>
            <div className="mt-1 flex flex-wrap gap-3">{STAFF_ROLES.map((r) => (
              <label key={r} className="flex items-center gap-1"><input type="checkbox" checked={v.roles.includes(r)} onChange={() => tog("roles", r)} />{ROLE_AR[r] ?? r}</label>
            ))}</div>
          </fieldset>
          <p className="text-xs text-muted-foreground">يُطبَّق النطاق على المرسل والمستلم معًا من الخادم.</p>
        </>
      )}
      <Button size="sm" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ"}</Button>
    </form>
  );
}
