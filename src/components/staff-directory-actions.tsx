import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { arabicError } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";

export type StaffTag = { id: string; name: string; active: boolean; assignable: boolean };
export type StaffTools = { tag_view: boolean; tags: StaffTag[]; employees: Record<string, { assignment_edit: boolean; tags_edit: boolean; tags: string[] }> };

export function StaffDirectoryAction({ mode, schoolId, ids, tags, initial, onClose }: {
  mode: "assignment" | "tags"; schoolId: string; ids: string[]; tags: StaffTag[]; initial: string; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState(initial);
  const [reason, setReason] = useState("");
  const [tag, setTag] = useState("");
  const [operation, setOperation] = useState<"tag_add" | "tag_remove">("tag_add");
  const assignment = mode === "assignment";
  const choices = tags.filter((t) => operation === "tag_remove" || (t.active && t.assignable));
  const valid = assignment ? reason.trim().length >= 3 : choices.some((t) => t.id === tag);
  const m = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("staff_directory_update", {
        _school: schoolId, _ids: ids, _action: assignment ? "assignment" : operation,
        ...(assignment ? { _value: value.trim(), _reason: reason.trim() } : { _tag: tag }),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (count) => {
      for (const key of ["staff-directory", "staff-directory-tools", "staff-extra", "hr-emp", "hr-list", "pp-tags", "pp-tag-ids", "pp-card"]) void qc.invalidateQueries({ queryKey: [key] });
      toast.success(`حُفظ التغيير لـ ${count} من الكادر`);
      onClose();
    },
    onError: (error) => toast.error(arabicError(error)),
  });
  return <Dialog open onOpenChange={(open) => { if (!open && !m.isPending) onClose(); }}>
    <DialogContent dir="rtl">
      <DialogHeader className="sm:text-start">
        <DialogTitle>{assignment ? "تعديل الإسناد" : "إدارة الوسوم"}</DialogTitle>
        <DialogDescription>{ids.length} من الكادر المحدد{assignment ? " · يُستبدل الإسناد الحالي. اتركه فارغًا لمسحه." : ""}</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (valid && !m.isPending) m.mutate(); }}>
        {assignment ? <>
          <div className="space-y-1.5"><Label htmlFor="staff-assignment">الإسناد الجديد</Label><Input id="staff-assignment" maxLength={500} value={value} onChange={(e) => setValue(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="staff-action-reason">سبب التعديل</Label><Input id="staff-action-reason" required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </> : <>
          <div className="space-y-1.5"><Label htmlFor="staff-tag-action">الإجراء</Label><select id="staff-tag-action" className={selectCls("w-full")} value={operation} onChange={(e) => { setOperation(e.target.value === "tag_remove" ? "tag_remove" : "tag_add"); setTag(""); }}><option value="tag_add">إضافة وسم</option><option value="tag_remove">إزالة وسم</option></select></div>
          <div className="space-y-1.5"><Label htmlFor="staff-tag-value">الوسم</Label><select id="staff-tag-value" className={selectCls("w-full")} value={tag} onChange={(e) => setTag(e.target.value)}><option value="">{choices.length ? "اختر الوسم" : "لا توجد وسوم متاحة"}</option>{choices.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
        </>}
        <div className="flex gap-2"><Button disabled={!valid || m.isPending}>{m.isPending ? "جارٍ الحفظ…" : "حفظ"}</Button><Button type="button" variant="outline" disabled={m.isPending} onClick={onClose}>إلغاء</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
