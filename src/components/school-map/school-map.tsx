import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bath, Briefcase, Building2, Coffee, Cpu, Dumbbell, FlaskConical, ImagePlus, Landmark, Library, Package, Pencil, Phone, Plus, Presentation,
  School, Search, Square, Stethoscope, Trash2, UserRound, UtensilsCrossed, Wrench, Lock, CheckCircle2, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState, ErrorState, ForbiddenState, LoadingState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { selectCls } from "@/components/ui/native-select";
import { ask } from "@/components/confirm";
import { PeoplePicker, rolesLabel } from "@/components/people-picker";
import { rpc } from "@/components/hr/shared";
import { db } from "@/components/crud-page";
import { uploadObject } from "@/components/classroom-posts";
import { arabicError, useSession } from "@/lib/session";
import { CATS, CAT_ORDER, ROOM_STATUS, filterRooms, floorLabel, floorsOf, mapStats, roomProblems, type Building, type Caps, type MapData, type Room, type RoomCat } from "./model";

const ICON: Record<RoomCat, LucideIcon> = {
  classroom: School, lab: FlaskConical, workshop: Cpu, hall: Presentation, library: Library, office: Briefcase, staff: Coffee, clinic: Stethoscope,
  prayer: Landmark, sports: Dumbbell, canteen: UtensilsCrossed, storage: Package, restroom: Bath, other: Square,
};
const STATUS_ICON: Record<string, LucideIcon> = { ready: CheckCircle2, maintenance: Wrench, closed: Lock };

function StatusTag({ s }: { s: string }) {
  const I = STATUS_ICON[s] ?? CheckCircle2;
  const tone = s === "ready" ? "bg-primary/10 text-primary" : s === "maintenance" ? "bg-accent text-accent-foreground" : "bg-destructive/10 text-destructive";
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${tone}`}><I className="size-3" aria-hidden />{ROOM_STATUS[s] ?? s}</span>;
}

async function signedUrl(fileId: string): Promise<string | null> {
  const { data: f } = await db.from("files").select("storage_path").eq("id", fileId).maybeSingle();
  const row = f as { storage_path: string } | null;
  if (!row) return null;
  const { data } = await db.storage.from("rikaz-files").createSignedUrl(row.storage_path, 300);
  return data?.signedUrl ?? null;
}

export function SchoolMap() {
  const { active } = useSession();
  const org = active?.orgId ?? null;
  const caps = useQuery({ queryKey: ["fm-caps", org], enabled: !!org, queryFn: () => rpc<Caps>("fm_caps", { _org: org }) });
  const visible = (caps.data?.schools ?? []).filter((s) => s.view);
  const [school, setSchool] = useState("");
  useEffect(() => {
    if (!visible.length || visible.some((s) => s.id === school)) return;
    setSchool(visible.find((s) => s.id === active?.schoolId)?.id ?? visible[0]!.id);
  }, [visible, school, active?.schoolId]);
  if (!org) return <EmptyState title="اختر المجموعة أولًا" />;
  if (caps.isLoading) return <LoadingState />;
  if (caps.error || !caps.data) return <ErrorState message={arabicError(caps.error)} />;
  if (!visible.length) return <ForbiddenState />;
  const cap = visible.find((s) => s.id === school);
  return (
    <div>
      <PageHeader eyebrow="إدارة المدرسة" title="الخريطة المدرسية" desc="مباني الفرع وأدوارها وكل غرفها مصنّفة، مع المسؤول المخوَّل عن كل غرفة. الصلاحيات نفسها التي تحكم «الوثائق والعقود» لكل فرع."
        action={visible.length > 1 ? <select aria-label="الفرع" className={selectCls("w-56")} value={school} onChange={(e) => setSchool(e.target.value)}>{visible.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select> : undefined} />
      {cap && <Board org={org} school={cap.id} canCreate={cap.create} canEdit={cap.edit} />}
    </div>
  );
}

function Board({ org, school, canCreate, canEdit }: { org: string; school: string; canCreate: boolean; canEdit: boolean }) {
  const q = useQuery({ queryKey: ["fm", org, school], queryFn: () => rpc<MapData>("fm_get", { _org: org, _school: school }) });
  const [bid, setBid] = useState("");
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("");
  const [status, setStatus] = useState("");
  const [editB, setEditB] = useState<Partial<Building> | null>(null);
  const [editR, setEditR] = useState<Partial<Room> | null>(null);
  const [view, setView] = useState<Room | null>(null);
  const data = q.data;
  useEffect(() => { if (data && !data.buildings.some((b) => b.id === bid)) setBid(data.buildings[0]?.id ?? ""); }, [data, bid]);
  const building = data?.buildings.find((b) => b.id === bid);
  const inBuilding = useMemo(() => (data?.rooms ?? []).filter((r) => r.building_id === bid), [data, bid]);
  const shown = useMemo(() => filterRooms(inBuilding, search, cat, status), [inBuilding, search, cat, status]);
  const stats = useMemo(() => mapStats(data?.rooms ?? []), [data]);
  if (q.isLoading) return <LoadingState />;
  if (q.error || !data) return <ErrorState message={arabicError(q.error)} onRetry={() => void q.refetch()} />;

  return (
    <div className="space-y-5">
      <StatsPanel stats={stats} buildings={data.buildings.length} onCat={(c) => setCat(c === cat ? "" : c)} cat={cat} />
      {!data.buildings.length ? (
        <EmptyState title="لا توجد مبانٍ مسجّلة لهذا الفرع" hint={canCreate ? "ابدأ بإضافة المبنى وعدد أدواره، ثم أضف الغرف." : "لم تُسجَّل خريطة الفرع بعد."}
          action={canCreate ? <Button onClick={() => setEditB({ floors: 1, has_basement: false })}><Plus className="size-4" />إضافة مبنى</Button> : undefined} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {data.buildings.map((b) => <Button key={b.id} size="sm" variant={b.id === bid ? "default" : "outline"} onClick={() => setBid(b.id)}><Building2 className="size-4" />{b.name}</Button>)}
              {canCreate && <Button size="sm" variant="ghost" onClick={() => setEditB({ floors: 1, has_basement: false })}><Plus className="size-4" />مبنى</Button>}
              <span className="ms-auto" />
              {canCreate && building && <Button size="sm" onClick={() => setEditR({ building_id: building.id, category: "classroom", floor: 0, status: "ready" })}><Plus className="size-4" />إضافة غرفة</Button>}
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-48 flex-1"><Search className="absolute start-3 top-3 size-4 text-muted-foreground" /><Input aria-label="بحث في الغرف" className="ps-9" placeholder="اسم الغرفة أو رقمها أو المسؤول" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
              <select aria-label="التصنيف" className={selectCls("w-44")} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">كل التصنيفات</option>{CAT_ORDER.map((k) => <option key={k} value={k}>{CATS[k]}</option>)}</select>
              <select aria-label="الحالة" className={selectCls("w-36")} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">كل الحالات</option>{Object.entries(ROOM_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </div>
            {building && <FloorMap building={building} rooms={shown} filtered={shown.length !== inBuilding.length} onOpen={setView} />}
          </div>
          {building && <BuildingPanel org={org} school={school} building={building} rooms={inBuilding} canEdit={canEdit} onEdit={() => setEditB(building)} />}
        </div>
      )}
      {editB && <BuildingDialog org={org} school={school} init={editB} onClose={() => setEditB(null)} onSaved={(id) => { setBid(id); setEditB(null); }} />}
      {editR && data.buildings.length > 0 && <RoomDialog org={org} school={school} buildings={data.buildings} init={editR} onClose={() => setEditR(null)} />}
      {view && <RoomView room={view} building={data.buildings.find((b) => b.id === view.building_id)} canEdit={canEdit} org={org} school={school}
        onClose={() => setView(null)} onEdit={() => { setEditR(view); setView(null); }} />}
    </div>
  );
}

function StatsPanel({ stats, buildings, cat, onCat }: { stats: ReturnType<typeof mapStats>; buildings: number; cat: string; onCat: (c: string) => void }) {
  const tiles: [string, string, (string | undefined)?][] = [
    ["المباني", String(buildings)], ["الغرف", String(stats.rooms)],
    ["السعة المسجّلة", stats.withCapacity ? `${stats.capacity} مقعد` : "لم تُسجَّل", stats.withCapacity && stats.withCapacity < stats.rooms ? `من ${stats.withCapacity} غرفة فقط` : undefined],
    ["بلا مسؤول", String(stats.noResp)], ["تحت الصيانة", String(stats.maintenance)], ["مغلقة", String(stats.closed)],
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map(([l, v, h]) => <div key={l} className="rounded-xl border bg-card p-3"><div className="text-xs text-muted-foreground">{l}</div><div className="mt-1 text-xl font-bold">{v}</div>{h && <div className="text-[11px] text-muted-foreground">{h}</div>}</div>)}
      </div>
      {stats.byCat.length > 0 && <div className="flex flex-wrap gap-2" aria-label="الغرف حسب التصنيف">
        {stats.byCat.map((c) => { const I = ICON[c.cat]; return (
          <button key={c.cat} type="button" aria-pressed={cat === c.cat} onClick={() => onCat(c.cat)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${cat === c.cat ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"}`}>
            <I className="size-3.5" aria-hidden />{CATS[c.cat]} <b>{c.count}</b>
          </button>); })}
      </div>}
    </div>
  );
}

function FloorMap({ building, rooms, filtered, onOpen }: { building: Building; rooms: Room[]; filtered: boolean; onOpen: (r: Room) => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      {floorsOf(building).map((f) => {
        const list = rooms.filter((r) => r.floor === f);
        return (
          <section key={f} className="grid border-b last:border-b-0 sm:grid-cols-[110px_1fr]" aria-label={floorLabel(f)}>
            <div className="flex items-center gap-2 bg-muted/60 px-3 py-2 text-sm font-semibold sm:flex-col sm:items-start sm:justify-center">
              {floorLabel(f)}<span className="text-xs font-normal text-muted-foreground">{list.length} غرفة</span>
            </div>
            <div className="flex min-h-20 flex-wrap content-start gap-2 p-3">
              {!list.length && <span className="self-center text-xs text-muted-foreground">{filtered ? "لا نتائج في هذا الدور" : "لا توجد غرف مسجّلة"}</span>}
              {list.map((r) => { const I = ICON[r.category] ?? Square; return (
                <button key={r.id} type="button" onClick={() => onOpen(r)}
                  className={`group w-40 rounded-xl border p-2.5 text-start transition hover:border-primary hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${r.status === "ready" ? "bg-background" : "bg-muted/50 border-dashed"}`}>
                  <div className="flex items-center gap-2"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary"><I className="size-4" aria-hidden /></span>
                    <div className="min-w-0"><div className="truncate text-sm font-semibold">{r.name}</div><div className="truncate text-[11px] text-muted-foreground">{CATS[r.category]}{r.code ? ` · ${r.code}` : ""}</div></div></div>
                  <div className="mt-2 flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
                    <span className="flex min-w-0 items-center gap-1 truncate"><UserRound className="size-3 shrink-0" aria-hidden />{r.resp_name ?? r.resp_title ?? "بلا مسؤول"}</span>
                    {r.status !== "ready" ? <StatusTag s={r.status} /> : r.capacity != null && <span>{r.capacity} مقعد</span>}
                  </div>
                </button>); })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function BuildingPanel({ org, school, building, rooms, canEdit, onEdit }: { org: string; school: string; building: Building; rooms: Room[]; canEdit: boolean; onEdit: () => void }) {
  const qc = useQueryClient();
  const img = useQuery({ queryKey: ["fm-img", building.image_file_id], enabled: !!building.image_file_id, queryFn: () => signedUrl(building.image_file_id!), staleTime: 240_000 });
  const up = useMutation({
    mutationFn: async (f: File) => {
      if (!["image/png", "image/jpeg"].includes(f.type)) throw new Error("ارفع صورة PNG أو JPEG");
      const id = await uploadImage(org, school, f);
      await rpc("fm_save_building", { _org: org, _p: { ...building, school_id: school, image_file_id: id } });
    },
    onSuccess: () => { toast.success("حُفظت صورة المبنى"); void qc.invalidateQueries({ queryKey: ["fm"] }); },
    onError: (e) => toast.error(arabicError(e)),
  });
  const s = mapStats(rooms);
  return (
    <aside className="space-y-3">
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="aspect-[4/3] bg-muted">
          {building.image_file_id
            ? img.data ? <a href={img.data} target="_blank" rel="noopener"><img src={img.data} alt={`صورة ${building.name}`} className="size-full object-cover" /></a> : <div className="grid size-full place-items-center text-xs text-muted-foreground">{img.isLoading ? "جارٍ تحميل الصورة…" : "تعذّر عرض الصورة"}</div>
            : <div className="grid size-full place-items-center gap-1 p-4 text-center text-xs text-muted-foreground"><Building2 className="size-8" aria-hidden />لا توجد صورة للمبنى</div>}
        </div>
        {canEdit && <label className="flex cursor-pointer items-center justify-center gap-2 border-t p-2 text-sm text-primary hover:bg-muted">
          <ImagePlus className="size-4" aria-hidden />{up.isPending ? "جارٍ الرفع…" : building.image_file_id ? "تغيير الصورة" : "رفع صورة المبنى"}
          <input type="file" accept="image/png,image/jpeg" className="sr-only" disabled={up.isPending} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) up.mutate(f); }} />
        </label>}
      </div>
      <div className="space-y-2 rounded-2xl border bg-card p-4 text-sm">
        <div className="flex items-center justify-between"><b>{building.name}</b>{canEdit && <Button size="icon" variant="ghost" aria-label="تعديل المبنى" onClick={onEdit}><Pencil className="size-4" /></Button>}</div>
        <div className="text-muted-foreground">{building.floors} {building.floors === 1 ? "دور" : "أدوار"}{building.has_basement ? " + قبو" : ""} · {s.rooms} غرفة</div>
        {building.notes && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{building.notes}</p>}
        {s.byCat.length > 0 && <ul className="space-y-1 border-t pt-2">{s.byCat.map((c) => { const I = ICON[c.cat]; return <li key={c.cat} className="flex items-center gap-2 text-xs"><I className="size-3.5 text-primary" aria-hidden />{CATS[c.cat]}<span className="ms-auto font-semibold">{c.count}</span></li>; })}</ul>}
      </div>
    </aside>
  );
}

async function uploadImage(org: string, school: string, f: File): Promise<string> {
  if (f.size > 20 * 1048576) throw new Error("حجم الصورة يتجاوز 20 ميغابايت");
  const d = await rpc<{ id: string; storage_path: string }[]>("od_draft_file", { _org: org, _school: school, _name: f.name, _mime: f.type, _size: f.size });
  const rec = d[0]!;
  if ((await uploadObject(rec.storage_path, f, new AbortController().signal)) !== "ok") throw new Error("فشل رفع الصورة، حاول مرة أخرى");
  return rec.id;
}

function BuildingDialog({ org, school, init, onClose, onSaved }: { org: string; school: string; init: Partial<Building>; onClose: () => void; onSaved: (id: string) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ name: init.name ?? "", floors: String(init.floors ?? 1), has_basement: !!init.has_basement, notes: init.notes ?? "" });
  const save = useMutation({
    mutationFn: () => rpc<string>("fm_save_building", { _org: org, _p: { id: init.id ?? null, school_id: school, name: f.name, floors: Number(f.floors), has_basement: f.has_basement, notes: f.notes, image_file_id: init.image_file_id ?? null } }),
    onSuccess: (id) => { toast.success("حُفظ المبنى"); void qc.invalidateQueries({ queryKey: ["fm"] }); onSaved(id); },
    onError: (e) => toast.error(arabicError(e)),
  });
  const del = useMutation({
    mutationFn: () => rpc("fm_delete", { _org: org, _kind: "building", _id: init.id }),
    onSuccess: () => { toast.success("حُذف المبنى"); void qc.invalidateQueries({ queryKey: ["fm"] }); onClose(); },
    onError: (e) => toast.error(arabicError(e)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl"><DialogHeader><DialogTitle>{init.id ? "تعديل المبنى" : "إضافة مبنى"}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="space-y-1"><Label htmlFor="fb-n">اسم المبنى</Label><Input id="fb-n" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="المبنى الرئيسي" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label htmlFor="fb-f">عدد الأدوار (مع الأرضي)</Label><Input id="fb-f" type="number" min={1} max={30} value={f.floors} onChange={(e) => setF({ ...f, floors: e.target.value })} /></div>
            <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={f.has_basement} onChange={(e) => setF({ ...f, has_basement: e.target.checked })} />يوجد قبو</label>
          </div>
          <div className="space-y-1"><Label htmlFor="fb-no">ملاحظات</Label><Textarea id="fb-no" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="المداخل، المخارج، نقاط التجمع…" /></div>
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending}>حفظ</Button><Button type="button" variant="outline" onClick={onClose}>إلغاء</Button>
            {init.id && <Button type="button" variant="ghost" className="ms-auto text-destructive" onClick={async () => { if (await ask("حذف المبنى؟ يجب أن يكون بلا غرف.", { destructive: true })) del.mutate(); }}><Trash2 className="size-4" />حذف</Button>}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RoomDialog({ org, school, buildings, init, onClose }: { org: string; school: string; buildings: Building[]; init: Partial<Room>; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    building_id: init.building_id ?? buildings[0]!.id, category: (init.category ?? "classroom") as RoomCat, name: init.name ?? "", code: init.code ?? "",
    floor: init.floor ?? 0, capacity: init.capacity != null ? String(init.capacity) : "", area: init.area != null ? String(init.area) : "", status: init.status ?? "ready",
    resp_user: init.resp_user ?? "", resp_title: init.resp_title ?? "", resp_phone: init.resp_phone ?? "", resp_notes: init.resp_notes ?? "", equipment: init.equipment ?? "", notes: init.notes ?? "",
  });
  const b = buildings.find((x) => x.id === f.building_id);
  const problems = roomProblems(f, b);
  const [tried, setTried] = useState(false);
  const save = useMutation({
    mutationFn: () => rpc("fm_save_room", { _org: org, _p: { ...f, id: init.id ?? null, resp_user: f.resp_user || null } }),
    onSuccess: () => { toast.success("حُفظت الغرفة"); void qc.invalidateQueries({ queryKey: ["fm"] }); onClose(); },
    onError: (e) => toast.error(arabicError(e)),
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{init.id ? "تعديل الغرفة" : "إضافة غرفة"}</DialogTitle></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); setTried(true); if (!problems.length) save.mutate(); }}>
          <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-2 text-sm font-semibold">بيانات الغرفة</legend>
            <div className="space-y-1"><Label htmlFor="fr-c">التصنيف</Label><select id="fr-c" className={selectCls("w-full")} value={f.category} onChange={set("category")}>{CAT_ORDER.map((k) => <option key={k} value={k}>{CATS[k]}</option>)}</select></div>
            <div className="space-y-1"><Label htmlFor="fr-n">اسم الغرفة</Label><Input id="fr-n" value={f.name} onChange={set("name")} placeholder="مختبر العلوم 1" /></div>
            <div className="space-y-1"><Label htmlFor="fr-code">الرقم أو الرمز</Label><Input id="fr-code" value={f.code} onChange={set("code")} placeholder="A-104" /></div>
            <div className="space-y-1"><Label htmlFor="fr-s">الحالة</Label><select id="fr-s" className={selectCls("w-full")} value={f.status} onChange={set("status")}>{Object.entries(ROOM_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div className="space-y-1"><Label htmlFor="fr-b">المبنى</Label><select id="fr-b" className={selectCls("w-full")} value={f.building_id} onChange={(e) => setF({ ...f, building_id: e.target.value, floor: 0 })}>{buildings.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
            <div className="space-y-1"><Label htmlFor="fr-f">الدور</Label><select id="fr-f" className={selectCls("w-full")} value={f.floor} onChange={(e) => setF({ ...f, floor: Number(e.target.value) })}>{b && floorsOf(b).slice().reverse().map((x) => <option key={x} value={x}>{floorLabel(x)}</option>)}</select></div>
            <div className="space-y-1"><Label htmlFor="fr-cap">السعة (مقاعد)</Label><Input id="fr-cap" inputMode="numeric" value={f.capacity} onChange={set("capacity")} placeholder="اتركها فارغة إن لم تُعرف" /></div>
            <div className="space-y-1"><Label htmlFor="fr-a">المساحة (م²)</Label><Input id="fr-a" inputMode="decimal" value={f.area} onChange={set("area")} /></div>
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="fr-eq">التجهيزات</Label><Textarea id="fr-eq" rows={2} value={f.equipment} onChange={set("equipment")} placeholder="سبورة تفاعلية، 24 جهاز حاسب، خزانة مواد…" /></div>
          </fieldset>
          <fieldset className="grid gap-3 rounded-xl border p-3 sm:grid-cols-2"><legend className="px-1 text-sm font-semibold">المسؤول المخوَّل</legend>
            <div className="sm:col-span-2"><PeoplePicker purpose="facility_resp" school={school} single compact label="من منسوبي الفرع" value={f.resp_user ? [f.resp_user] : []} onChange={(v) => setF({ ...f, resp_user: v[0] ?? "" })} /></div>
            <div className="space-y-1"><Label htmlFor="fr-rt">صفته أو مسمّاه</Label><Input id="fr-rt" value={f.resp_title} onChange={set("resp_title")} placeholder="محضّر المختبر" /></div>
            <div className="space-y-1"><Label htmlFor="fr-rp">هاتف التواصل</Label><Input id="fr-rp" dir="ltr" inputMode="tel" value={f.resp_phone} onChange={set("resp_phone")} placeholder="05xxxxxxxx" /></div>
            <div className="space-y-1 sm:col-span-2"><Label htmlFor="fr-rn">تفاصيل التخويل</Label><Textarea id="fr-rn" rows={2} value={f.resp_notes} onChange={set("resp_notes")} placeholder="أوقات التواجد، من يُسلَّم المفتاح، البديل عند الغياب…" /></div>
          </fieldset>
          <div className="space-y-1"><Label htmlFor="fr-no">ملاحظات</Label><Textarea id="fr-no" rows={2} value={f.notes} onChange={set("notes")} /></div>
          {tried && problems.length > 0 && <ul role="alert" className="list-inside list-disc rounded-md bg-destructive/10 p-2 text-sm text-destructive">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
          <div className="flex gap-2"><Button type="submit" disabled={save.isPending}>حفظ</Button><Button type="button" variant="outline" onClick={onClose}>إلغاء</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RoomView({ org, room, building, canEdit, onClose, onEdit }: { org: string; school: string; room: Room; building: Building | undefined; canEdit: boolean; onClose: () => void; onEdit: () => void }) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: () => rpc("fm_delete", { _org: org, _kind: "room", _id: room.id }),
    onSuccess: () => { toast.success("حُذفت الغرفة"); void qc.invalidateQueries({ queryKey: ["fm"] }); onClose(); },
    onError: (e) => toast.error(arabicError(e)),
  });
  const I = ICON[room.category] ?? Square;
  const row = (l: string, v: ReactNode) => v ? <div className="flex gap-3 py-1.5 text-sm"><span className="w-28 shrink-0 text-muted-foreground">{l}</span><span className="min-w-0 whitespace-pre-wrap">{v}</span></div> : null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl"><DialogHeader><DialogTitle className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"><I className="size-4" /></span>{room.name}</DialogTitle></DialogHeader>
        <div className="divide-y">
          {row("التصنيف", CATS[room.category])}{row("الرقم", room.code)}{row("المكان", `${building?.name ?? ""} — ${floorLabel(room.floor)}`)}
          {row("الحالة", <StatusTag s={room.status} />)}{row("السعة", room.capacity != null ? `${room.capacity} مقعد` : "لم تُسجَّل")}{row("المساحة", room.area != null ? `${room.area} م²` : null)}
          {row("التجهيزات", room.equipment)}
        </div>
        <div className="rounded-xl border bg-muted/40 p-3">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold"><UserRound className="size-4" />المسؤول المخوَّل</div>
          {!room.resp_user && !room.resp_title ? <p className="text-sm text-muted-foreground">لم يُحدَّد مسؤول لهذه الغرفة.</p> : <>
            {room.resp_name && <div className="text-sm"><b>{room.resp_name}</b>{room.resp_roles.length > 0 && <span className="text-muted-foreground"> — {rolesLabel(room.resp_roles)}</span>}</div>}
            {room.resp_title && <div className="text-sm">{room.resp_title}</div>}
            {room.resp_phone && <a dir="ltr" className="inline-flex items-center gap-1 text-sm text-primary" href={`tel:${room.resp_phone}`}><Phone className="size-3.5" />{room.resp_phone}</a>}
            {room.resp_notes && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{room.resp_notes}</p>}
          </>}
        </div>
        {room.notes && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{room.notes}</p>}
        {canEdit && <div className="flex gap-2"><Button onClick={onEdit}><Pencil className="size-4" />تعديل</Button>
          <Button variant="ghost" className="ms-auto text-destructive" onClick={async () => { if (await ask(`حذف «${room.name}» من الخريطة؟`, { destructive: true })) del.mutate(); }}><Trash2 className="size-4" />حذف</Button></div>}
      </DialogContent>
    </Dialog>
  );
}
