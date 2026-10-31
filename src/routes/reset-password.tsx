import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { arabicError } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "تعيين كلمة مرور جديدة — ركاز" },
      { name: "description", content: "تعيين كلمة مرور جديدة لحسابك في ركاز." },
      { property: "og:title", content: "تعيين كلمة مرور جديدة — ركاز" },
      { property: "og:description", content: "تعيين كلمة مرور جديدة لحسابك في ركاز." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Reset,
});

function Reset() {
  const [pw, setPw] = useState("");
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form
        className="w-full max-w-sm space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (pw.length < 8) return toast.error("كلمة المرور 8 أحرف على الأقل");
          const { error } = await supabase.auth.updateUser({ password: pw });
          if (error) return toast.error(arabicError(error));
          toast.success("تم تغيير كلمة المرور");
          navigate({ to: "/app" });
        }}
      >
        <h1 className="font-display text-2xl">كلمة مرور جديدة</h1>
        <div className="space-y-1.5">
          <Label htmlFor="pw">كلمة المرور</Label>
          <Input id="pw" type="password" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <Button className="w-full">حفظ</Button>
      </form>
    </div>
  );
}
