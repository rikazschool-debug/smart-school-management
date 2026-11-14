import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { canManageUsers, type Role } from "@/lib/roles";
import { arabicError } from "@/lib/session";

/** Login account for an academic record. The owner invites directly; everyone else only files a request to the owner
 *  (request_account) — adding a teacher/student/guardian record never grants a membership by itself. */
export function AccountButton({ role, kind, recordId, email, schoolId, label = "دعوة" }: { role: Role; kind: "teacher" | "guardian" | "student"; recordId: string; email: string; schoolId: string; label?: string }) {
  const owner = canManageUsers(role);
  return (
    <Button variant="ghost" size="sm" onClick={async () => {
      const { error } = owner
        ? await supabase.rpc("invite_member", { _email: email, _school: schoolId, _role: kind })
        : await supabase.rpc("request_account", { _kind: kind, _record: recordId });
      if (error) toast.error(arabicError(error));
      else toast.success(owner ? "أُنشئت الدعوة: يدخل صاحب الحساب ببريده ليرتبط حسابه" : "أُرسل طلب الحساب إلى مالك المؤسسة للمراجعة");
    }}>
      <Send className="size-4" /> {owner ? label : "طلب حساب من المالك"}
    </Button>
  );
}
