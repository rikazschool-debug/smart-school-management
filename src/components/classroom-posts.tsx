import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip, Pin } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { arabicError, useSession } from "@/lib/session";

const BUCKET = "rikaz-files";
const STATUS: Record<string, string> = { draft: "مسودة", published: "منشور", archived: "مؤرشف" };

/** Upload to Storage with a cancel signal (the SDK upload has none). Same storage RLS applies via the user's token. */
export async function uploadObject(path: string, f: File, signal: AbortSignal): Promise<"ok" | "aborted" | "failed"> {
  const { data: s } = await db.auth.getSession();
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string;
  const base = (import.meta.env["VITE_SUPABASE_URL"] as string).replace(/\/+$/, "");
  try {
    const r = await fetch(`${base}/storage/v1/object/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`, {
      method: "POST", body: f, signal,
      headers: { apikey: key, Authorization: `Bearer ${s.session?.access_token ?? ""}`, "Content-Type": f.type || "application/octet-stream", "x-upsert": "false" },
    });
    return r.ok ? "ok" : "failed";
  } catch (e) {
    return signal.aborted || (e as Error)?.name === "AbortError" ? "aborted" : "failed";
  }
}

export function ClassroomPosts({ classroom, courseId }: { classroom: string; courseId: string }) {
  const qc = useQueryClient();
  const { active, user } = useSession();
  const isTeacher = useQuery({
    queryKey: ["is-course-teacher", courseId],
    queryFn: async () => ((await db.rpc("is_course_teacher", { _course: courseId })).data as boolean) ?? false,
  });
  const posts = useQuery({
    queryKey: ["posts", classroom],
    queryFn: async () => {
      const { data, error } = await db.from("classroom_posts").select("*").eq("classroom_id", classroom).order("pinned", { ascending: false }).order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (data as Row[]).map((p) => p["id"]);
      const { data: files } = await db.from("files").select("*").eq("source_type", "post").in("source_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      return { posts: data as Row[], files: (files ?? []) as Row[] };
    },
  });
  const [draft, setDraft] = useState({ title: "", body: "" });
  const refresh = () => qc.invalidateQueries({ queryKey: ["posts", classroom] });
  const teacher = !!isTeacher.data;
  const visible = (posts.data?.posts ?? []).filter((p) => teacher || p["author_user_id"] === user.id || p["status"] === "published");

  return (
    <div className="space-y-4">
      {teacher && (
        <form className="space-y-2 rounded-2xl border bg-card p-4" onSubmit={async (e) => {
          e.preventDefault();
          if (!draft.title.trim()) return void toast.error("العنوان مطلوب");
          const { error } = await db.from("classroom_posts").insert({ classroom_id: classroom, school_id: active?.schoolId, title: draft.title.trim(), body: draft.body });
          if (error) return void toast.error(arabicError(error));
          toast.success("حُفظت المسودة. انشرها حين تكون جاهزة."); setDraft({ title: "", body: "" }); refresh();
        }}>
          <h3 className="font-bold">منشور جديد</h3>
          <Input aria-label="العنوان" placeholder="العنوان" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <Textarea aria-label="النص" placeholder="النص" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          <Button size="sm">حفظ كمسودة</Button>
        </form>
      )}
      {posts.isLoading ? <LoadingState /> : posts.error ? <ErrorState message={arabicError(posts.error)} onRetry={() => posts.refetch()} /> : !visible.length ? <EmptyState title="لا توجد منشورات بعد" /> :
        visible.map((p) => <Post key={p["id"]} p={p} files={posts.data!.files.filter((f) => f["source_id"] === p["id"])} canEdit={teacher && p["author_user_id"] === user.id} showComments={active?.role !== "guardian"} onChange={refresh} />)}
    </div>
  );
}

function Post({ p, files, canEdit, showComments, onChange }: { p: Row; files: Row[]; canEdit: boolean; showComments: boolean; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const upd = async (v: Row, ok: string) => {
    const { error } = await db.from("classroom_posts").update(v).eq("id", p["id"]);
    if (error) toast.error(arabicError(error)); else { toast.success(ok); onChange(); }
  };
  async function upload(f: File) {
    setBusy(true);
    const { data, error } = await db.rpc("create_post_file", { _post: p["id"], _name: f.name, _mime: f.type || "application/octet-stream", _size: f.size });
    if (error) { setBusy(false); return void toast.error(arabicError(error)); }
    const rec = (data as Row[])[0]!;
    const ac = new AbortController(); ctrl.current = ac;
    const res = await uploadObject(rec["storage_path"], f, ac.signal);
    ctrl.current = null;
    if (res !== "ok") {
      // never leave a half-saved attachment: remove the record (and any partial object)
      await db.storage.from(BUCKET).remove([rec["storage_path"]]).catch(() => undefined);
      await db.from("files").delete().eq("id", rec["id"]);
      setBusy(false);
      return void (res === "aborted" ? toast.info("أُلغي الرفع ولم يُحفظ الملف.") : toast.error("تعذر رفع الملف، لم يُحفظ. حاول مجددًا."));
    }
    setBusy(false); toast.success("رُفع الملف"); onChange();
  }
  async function open(f: Row) {
    const { data, error } = await db.storage.from(BUCKET).createSignedUrl(f["storage_path"], 60, { download: f["name"] });
    if (error || !data) return void toast.error("لا تملك صلاحية فتح هذا الملف أو لم يعد متاحًا");
    window.open(data.signedUrl, "_blank", "noopener");
  }
  return (
    <article className={`rounded-2xl border bg-card p-4 ${p["status"] !== "published" ? "border-dashed" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-bold">{p["pinned"] && <Pin className="size-4 text-primary" aria-label="مثبت" />}{p["title"]}</h3>
        <span className="text-xs text-muted-foreground">{STATUS[p["status"]]} {p["audience"] === "students_guardians" ? "• للطلاب والأسر" : "• للطلاب"}</span>
      </div>
      {p["body"] && <p className="mt-2 whitespace-pre-wrap text-sm">{p["body"]}</p>}
      {files.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {files.map((f) => (
            <li key={f["id"]}><button onClick={() => open(f)} className="flex items-center gap-1 rounded-full border px-3 py-1 text-xs hover:bg-muted"><Paperclip className="size-3" />{f["name"]} ({Math.ceil(f["size_bytes"] / 1024)} ك.ب)</button></li>
          ))}
        </ul>
      )}
      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-1 border-t pt-3">
          {p["status"] !== "published" && <Button size="sm" onClick={() => upd({ status: "published" }, "نُشر المنشور")}>نشر</Button>}
          {p["status"] === "published" && <Button size="sm" variant="outline" onClick={() => upd({ status: "archived" }, "أُرشف")}>أرشفة</Button>}
          <Button size="sm" variant="ghost" onClick={() => upd({ pinned: !p["pinned"] }, p["pinned"] ? "أُلغي التثبيت" : "ثُبّت")}>{p["pinned"] ? "إلغاء التثبيت" : "تثبيت"}</Button>
          <Button size="sm" variant="ghost" onClick={() => upd({ comments_enabled: !p["comments_enabled"] }, "تم")}>{p["comments_enabled"] ? "إغلاق التعليقات" : "فتح التعليقات"}</Button>
          <Button size="sm" variant="ghost" onClick={() => upd({ audience: p["audience"] === "students" ? "students_guardians" : "students" }, "تم تحديث الجمهور")}>{p["audience"] === "students" ? "إظهار للأسر أيضًا" : "للطلاب فقط"}</Button>
          <label className="inline-flex cursor-pointer items-center gap-1 rounded-md px-3 text-sm hover:bg-muted">
            <Paperclip className="size-4" /> {busy ? "جارٍ الرفع…" : "إرفاق ملف"}
            <input type="file" className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f); }} />
          </label>
          {busy && <Button size="sm" variant="outline" onClick={() => ctrl.current?.abort()}>إلغاء الرفع</Button>}
        </div>
      )}
      {showComments && p["status"] === "published" && <Comments post={p} />}
    </article>
  );
}

function Comments({ post }: { post: Row }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const q = useQuery({
    queryKey: ["comments", post["id"]],
    queryFn: async () => {
      const { data, error } = await db.from("post_comments").select("id, body, created_at, author_user_id").eq("post_id", post["id"]).order("created_at");
      if (error) throw error;
      return data as Row[];
    },
  });
  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      {q.data?.map((c) => <p key={c["id"]} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">{c["body"]} <span className="text-xs text-muted-foreground">— {new Date(c["created_at"]).toLocaleString("ar")}</span></p>)}
      {post["comments_enabled"] ? (
        <form className="flex gap-2" onSubmit={async (e) => {
          e.preventDefault();
          if (!body.trim()) return;
          const { error } = await db.from("post_comments").insert({ post_id: post["id"], school_id: post["school_id"], body: body.trim() });
          if (error) return void toast.error(arabicError(error));
          setBody(""); qc.invalidateQueries({ queryKey: ["comments", post["id"]] });
        }}>
          <Input aria-label="تعليق" placeholder="اكتب تعليقًا" value={body} onChange={(e) => setBody(e.target.value)} />
          <Button size="sm">إرسال</Button>
        </form>
      ) : <p className="text-xs text-muted-foreground">التعليقات مغلقة.</p>}
    </div>
  );
}
