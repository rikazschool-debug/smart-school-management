// Event uploads with progress. The server always creates the file record first (type/size/count checked there);
// the bytes go up afterwards, and a file only becomes part of an application when the saved answers reference it.
import { db } from "@/components/crud-page";
import { arabicError } from "@/lib/session";
import { preparePublicFile, prepareTrackFile } from "@/lib/events-public.functions";

export type Slot = { id: string; path: string; token?: string };
export type Uploader = (fieldId: string, file: File, onProgress: (pct: number) => void) => Promise<{ id: string }>;

const BASE = () => String(import.meta.env["VITE_SUPABASE_URL"] ?? "").replace(/\/$/, "");
const KEY = () => String(import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "");

function xhr(method: string, url: string, file: File, headers: Record<string, string>, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open(method, url);
    for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error("تعذر رفع الملف؛ أعد المحاولة.")));
    x.onerror = () => reject(new Error("انقطع الاتصال أثناء الرفع؛ أعد المحاولة."));
    x.send(file);
  });
}

const signedPut = (s: Slot, file: File, p: (n: number) => void) =>
  xhr("PUT", `${BASE()}/storage/v1/object/upload/sign/rikaz-files/${s.path}?token=${encodeURIComponent(s.token ?? "")}`, file,
    { "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" }, p);

function fail(r: Record<string, unknown>): never {
  const m: Record<string, string> = { rate: "محاولات رفع كثيرة؛ انتظر قليلًا.", closed: "التسجيل غير متاح الآن.", invalid: "الملف غير مقبول." };
  throw new Error(String(r["message"] ?? m[String(r["error"])] ?? "تعذر تجهيز الرفع."));
}

/** Public registration form (no account): the slot is bound to this form fill (clientKey). */
export const publicUploader = (token: string, clientKey: () => string): Uploader => async (field, file, p) => {
  const r = await preparePublicFile({ data: { token, clientKey: clientKey(), field, name: file.name, mime: file.type, size: file.size } });
  if (r["error"]) fail(r);
  await signedPut(r as unknown as Slot, file, p);
  return { id: String(r["id"]) };
};

/** Completing an application from the tracking link. */
export const trackUploader = (code: string): Uploader => async (field, file, p) => {
  const r = await prepareTrackFile({ data: { code, field, name: file.name, mime: file.type, size: file.size } });
  if (r["error"]) fail(r);
  await signedPut(r as unknown as Slot, file, p);
  return { id: String(r["id"]) };
};

/** Signed-in applicant: the upload uses the caller's own session (storage policy: own pending file only). */
export const accountUploader = (item: string, clientKey: string): Uploader => async (field, file, p) => {
  const { data, error } = await db.rpc("evt_file_prepare" as never, { _item: item, _client_key: clientKey, _field: field, _name: file.name, _mime: file.type, _size: file.size } as never);
  if (error) throw new Error(arabicError(error));
  const s = data as unknown as Slot;
  const { data: sess } = await db.auth.getSession();
  await xhr("POST", `${BASE()}/storage/v1/object/rikaz-files/${s.path}`, file,
    { Authorization: `Bearer ${sess.session?.access_token ?? ""}`, apikey: KEY(), "Content-Type": file.type || "application/octet-stream" }, p);
  return { id: s.id };
};

/** Staff attachment on an event/course/trip. */
export async function uploadItemFile(item: string, file: File, p: (n: number) => void) {
  const { data, error } = await db.rpc("create_evt_file" as never, { _item: item, _name: file.name, _mime: file.type || "application/octet-stream", _size: file.size } as never);
  if (error) throw new Error(arabicError(error));
  const s = (data as unknown as { id: string; storage_path: string }[])[0]!;
  const { data: sess } = await db.auth.getSession();
  await xhr("POST", `${BASE()}/storage/v1/object/rikaz-files/${s.storage_path}`, file,
    { Authorization: `Bearer ${sess.session?.access_token ?? ""}`, apikey: KEY(), "Content-Type": file.type || "application/octet-stream" }, p);
}
