import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { db } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { askText } from "@/components/confirm";
import { arabicError } from "@/lib/session";

/** Invitation reply via adm_meeting_rsvp: accept, reject or excuse (reason required for the last two). Replying is not attendance. */
export function RsvpActions({ meetingId, current, compact, onDone }: { meetingId: string; current: string | null | undefined; compact?: boolean; onDone?: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function send(rsvp: "accepted" | "rejected" | "declined") {
    let note: string | null = null;
    if (rsvp !== "accepted") {
      note = await askText(rsvp === "rejected" ? "سبب رفض الدعوة (يصل للمنظم)" : "سبب الاعتذار (يصل للمنظم)", { required: true, ok: rsvp === "rejected" ? "رفض الدعوة" : "إرسال الاعتذار" });
      if (!note?.trim()) return;
    }
    setBusy(true);
    const { error } = await db.rpc("adm_meeting_rsvp" as never, { _id: meetingId, _rsvp: rsvp, _note: note } as never);
    setBusy(false);
    if (error) return void toast.error(arabicError(error));
    toast.success(rsvp === "accepted" ? "سُجّل قبولك" : rsvp === "rejected" ? "سُجّل رفضك" : "سُجّل اعتذارك");
    for (const k of ["comm-meetings", "adm-meeting", "adm-meetings", "adm-calendar"]) qc.invalidateQueries({ queryKey: [k] });
    onDone?.();
  }
  const cls = compact ? "min-h-10" : "w-full";
  return (
    <div className={compact ? "flex flex-wrap gap-2" : "space-y-2"}>
      {current !== "accepted" && <Button size={compact ? "sm" : "default"} className={cls} disabled={busy} onClick={() => send("accepted")}>قبول الدعوة</Button>}
      {current !== "rejected" && <Button size={compact ? "sm" : "default"} variant="outline" className={cls} disabled={busy} onClick={() => send("rejected")}>رفض</Button>}
      {current !== "declined" && <Button size={compact ? "sm" : "default"} variant="outline" className={cls} disabled={busy} onClick={() => send("declined")}>اعتذار</Button>}
    </div>
  );
}
