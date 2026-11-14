import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ErrorState, LoadingState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SchoolLogo } from "@/components/school-logo";
import { arabicError } from "@/lib/session";

type S = { id: string; name: string; city: string | null; stage_type: string | null; code: string | null; address: string | null; phone: string | null };

/** School profile shown to the group owner while inside a school; address/phone saved via school_profile_save. */
export function SchoolProfile({ schoolId }: { schoolId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["school-profile", schoolId],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("schools").select("id, name, city, stage_type, code, address, phone").eq("id", schoolId).single();
      if (error) throw error;
      return data as S;
    },
  });
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data) { setAddress(q.data.address ?? ""); setPhone(q.data.phone ?? ""); } }, [q.data]);

  async function save() {
    setBusy(true);
    const { error } = await (supabase as any).rpc("school_profile_save", { _school: schoolId, _address: address, _phone: phone });
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    toast.success("تم حفظ بيانات المدرسة");
    void qc.invalidateQueries({ queryKey: ["school-profile", schoolId] });
    void qc.invalidateQueries({ queryKey: ["schools-overview"] });
  }

  const s = q.data;
  return (
    <>
      <PageHeader title="ملف المدرسة" desc="بيانات المدرسة كما تظهر في إدارة المدارس لدى مالك المجموعة." />
      {q.isLoading ? <LoadingState /> : q.error ? <ErrorState message={arabicError(q.error)} onRetry={() => q.refetch()} /> : s && (
        <div className="max-w-2xl rounded-2xl border bg-card p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-4">
            <SchoolLogo schoolId={s.id} className="size-20 rounded-2xl border" fallback={<span className="grid size-20 place-items-center rounded-2xl bg-primary/10 text-primary"><Building2 className="size-9" /></span>} />
            <div>
              <p className="font-display text-xl">{s.name}</p>
              <p className="text-sm text-muted-foreground">{[s.city, s.stage_type, s.code].filter(Boolean).join(" · ") || "—"}</p>
            </div>
          </div>
          <div className="grid gap-4">
            <label className="grid gap-1.5 text-sm"><span className="font-medium">العنوان</span>
              <Input value={address} maxLength={300} onChange={(e) => setAddress(e.target.value)} placeholder="الحي، الشارع، المدينة" /></label>
            <label className="grid gap-1.5 text-sm"><span className="font-medium">رقم الهاتف</span>
              <Input value={phone} dir="ltr" className="text-right" inputMode="tel" maxLength={16} onChange={(e) => setPhone(e.target.value)} placeholder="0112345678" /></label>
            <div><Button onClick={save} disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ"}</Button></div>
          </div>
        </div>
      )}
    </>
  );
}
