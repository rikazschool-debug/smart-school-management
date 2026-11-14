import { Fragment } from "react";
import { toast } from "sonner";
import { db, type Row } from "@/components/crud-page";
import { arabicError } from "@/lib/session";

export const BUCKET = "rikaz-files";

export const KIND_LABEL: Record<string, string> = { family: "تواصل أسرة", direct: "محادثة داخلية", group: "مجموعة", student: "محادثة طالب" };
export const GROUP_TYPE_LABEL: Record<string, string> = { committee: "لجنة", department: "قسم", team: "فريق عمل", custom: "مجموعة مخصصة", section: "مجموعة فصل (قديمة)", class: "مجموعة الشعبة", course: "مجموعة مادة (مؤرشفة)" };
export const PRIORITY_LABEL: Record<string, string> = { normal: "عادي", important: "مهم", urgent: "عاجل" };
export const ROLE_AR: Record<string, string> = {
  org_owner: "مالك المجموعة", principal: "مدير المدرسة", vice_principal: "الوكيل", dept_head: "رئيس قسم", supervisor: "مشرف تربوي",
  student_affairs: "شؤون الطلاب", teacher: "معلم", guardian: "ولي أمر", student: "طالب", counselor: "مرشد", nurse: "المرشدة الصحية", security: "الأمن",
};

const URL_RE = /(https?:\/\/[^\s<>"']+)/g;
/** Renders user text safely: React escapes everything; only http(s) URLs become links (no HTML is ever interpreted). */
export function SafeText({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline" dir="ltr">{p}</a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </span>
  );
}

export function timeLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("ar", { day: "numeric", month: "short" });
}

/** Opens a stored file through a short-lived signed URL; access is re-checked by the server on every request. */
export async function openFile(f: Row) {
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(f["storage_path"], 60, { download: f["name"] });
  if (error || !data) return void toast.error("لا تملك صلاحية فتح هذا الملف أو لم يعد متاحًا");
  window.open(data.signedUrl, "_blank", "noopener");
}

export type PendingFile = { key: string; file: File; status: "uploading" | "ready" | "failed"; id?: string; path?: string; error?: string };

/** Step 1: server validates type/size and creates a pending record; step 2: upload bytes. The message only links ready files. */
export async function uploadMessageFile(conv: string, file: File): Promise<{ id: string; path: string }> {
  const { data, error } = await db.rpc("create_message_file", { _conv: conv, _name: file.name, _mime: file.type || "application/octet-stream", _size: file.size });
  if (error) throw new Error(arabicError(error));
  const rec = (data as Row[])[0]!;
  const up = await db.storage.from(BUCKET).upload(rec["storage_path"], file, { contentType: file.type });
  if (up.error) {
    await db.from("files").delete().eq("id", rec["id"]);
    throw new Error("تعذر رفع الملف؛ لم يُحفظ. أعد المحاولة.");
  }
  return { id: rec["id"], path: rec["storage_path"] };
}

export async function discardPendingFile(id: string, path: string) {
  await db.storage.from(BUCKET).remove([path]);
  await db.from("files").delete().eq("id", id).eq("source_type", "message_pending");
}

/** Safe cleanup: removes the caller's own pending attachments older than 1 hour that were never linked to a message. */
export async function cleanupStalePending() {
  const cutoff = new Date(Date.now() - 3600_000).toISOString();
  const { data } = await db.from("files").select("id, storage_path").eq("source_type", "message_pending").lt("created_at", cutoff).limit(50);
  for (const f of (data ?? []) as Row[]) await discardPendingFile(f["id"], f["storage_path"]);
}
