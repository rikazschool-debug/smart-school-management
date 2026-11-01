import { useEffect, useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";

/** Shared Rikaz confirmation / reason dialog (replaces browser confirm/prompt: RTL, Cairo, large touch targets).
 *  ask() resolves true/false; askText() resolves the typed text or null when cancelled. */
type Req = { message: string; input?: { label: string; required?: boolean } ; destructive?: boolean; ok?: string; resolve: (v: string | boolean | null) => void };
let push: ((r: Req) => void) | null = null;

export function ask(message: string, opts: { destructive?: boolean; ok?: string } = {}): Promise<boolean> {
  return new Promise((resolve) => { if (!push) return resolve(window.confirm(message)); push({ message, ...opts, resolve: (v) => resolve(v === true) }); });
}
export function askText(message: string, opts: { required?: boolean; ok?: string } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    if (!push) return resolve(window.prompt(message));
    push({ message, input: { label: message, required: opts.required ?? false }, ok: opts.ok, resolve: (v) => resolve(typeof v === "string" ? v : null) });
  });
}

export function ConfirmHost() {
  const [req, setReq] = useState<Req | null>(null);
  const [text, setText] = useState("");
  useEffect(() => { push = (r) => { setText(""); setReq(r); }; return () => { push = null; }; }, []);
  const close = (v: string | boolean | null) => { req?.resolve(v); setReq(null); };
  const blocked = !!req?.input?.required && text.trim().length < 3;
  return (
    <AlertDialog open={!!req} onOpenChange={(o) => { if (!o) close(req?.input ? null : false); }}>
      <AlertDialogContent dir="rtl" className="max-w-[calc(100vw-2rem)] sm:max-w-md">
        <AlertDialogHeader className="text-start sm:text-start">
          <AlertDialogTitle>{req?.input ? "مطلوب توضيح" : "تأكيد الإجراء"}</AlertDialogTitle>
          <AlertDialogDescription>{req?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        {req?.input && (
          <div className="space-y-1">
            <Input autoFocus aria-label={req.input.label} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
            {req.input.required && <p className="text-xs text-muted-foreground">ثلاثة أحرف على الأقل.</p>}
          </div>
        )}
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <AlertDialogCancel className="min-h-10" onClick={() => close(req?.input ? null : false)}>إلغاء</AlertDialogCancel>
          <AlertDialogAction className={buttonVariants({ variant: req?.destructive ? "destructive" : "default", className: "min-h-10" })} disabled={blocked}
            onClick={(e) => { if (blocked) { e.preventDefault(); return; } close(req?.input ? text.trim() : true); }}>{req?.ok ?? "تأكيد"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
