import { all, allRpc, db, inPeriod, lbl, rday, within, type Def, type Row } from "@/components/reports/core";
import { groupCount } from "@/lib/report-builder";
import { DAY_STATUS, KIND as PICK_KIND, MOVE_KIND, PICKUP_STATUS } from "@/lib/attendance";
import { SUB_STATUS } from "@/lib/homework";
import { FAMILY_REQUEST_KINDS } from "@/components/family/requests";
import { PRIORITY as ADM_PRIORITY, REQ_STATUS, TASK_STATUS } from "@/components/admin/shared";
import { STATUS as AD_STATUS } from "@/components/admissions/shared";
import { PRIORITY as MT_PRIORITY, STATUS as MT_STATUS } from "@/components/maintenance/shared";
import { R_KIND, R_STATUS } from "@/components/procurement/requests";
import { PRIO as SP_PRIO, STATUS as SP_STATUS } from "@/components/support/support";

const SUBST: Record<string, string> = { active: "نافذ", assigned: "مُسند", cancelled: "ملغى" };
const FAM: Record<string, string> = { processing: "جارٍ المعالجة", accepted: "مقبول", rejected: "مرفوض" };
const CIRC: Record<string, string> = { draft: "مسودة", published: "منشور", archived: "مؤرشف" };
const CORR: Record<string, string> = { pending: "بانتظار القرار", approved: "معتمد", rejected: "مرفوض" };
const POST: Record<string, string> = { draft: "مسودة", published: "منشور", archived: "مؤرشف", hidden: "مخفي" };
const CV: Record<string, string> = { draft: "مسودة", submitted: "مرسلة", approved: "معتمدة", returned: "معادة", final: "نهائية" };
const yes = (v: unknown) => (v ? "نعم" : "لا");
const n = (v: unknown) => (v == null || v === "" ? "" : Number(v));

export const MORE_REPORTS: Record<string, Def> = {
  sections_capacity: {
    group: "الطلاب", label: "إشغال الشعب والسعة", summary: "حسب الصف والشعبة", note: "المقيدون حاليًا مقابل سعة الشعبة",
    run: async (p) => {
      const secs = await all((a, b) => db.from("sections").select("id, name, capacity, grades(name, sort_order)").eq("school_id", p.school).range(a, b));
      const enr = await all((a, b) => db.from("enrollments").select("section_id").eq("school_id", p.school).eq("status", "active").range(a, b));
      const cnt = new Map<string, number>(); for (const e of enr) cnt.set(e["section_id"], (cnt.get(e["section_id"]) ?? 0) + 1);
      const sorted = [...secs].sort((x, y) => (x["grades"]?.sort_order ?? 0) - (y["grades"]?.sort_order ?? 0) || String(x["name"]).localeCompare(String(y["name"]), "ar"));
      const rows = sorted.map((s) => { const c = cnt.get(s["id"]) ?? 0; const cap = Number(s["capacity"] ?? 0); return [s["grades"]?.name ?? "", s["name"], c, cap || "", cap ? `${Math.round((c / cap) * 100)}%` : "", cap ? Math.max(cap - c, 0) : ""]; });
      const tc = rows.reduce((t, r) => t + Number(r[2]), 0), tcap = sorted.reduce((t, s) => t + Number(s["capacity"] ?? 0), 0);
      return { headers: ["الصف", "الشعبة", "المقيدون", "السعة", "نسبة الإشغال", "المقاعد المتاحة"], rows: rows.length ? [...rows, ["الإجمالي", "", tc, tcap || "", tcap ? `${Math.round((tc / tcap) * 100)}%` : "", tcap ? Math.max(tcap - tc, 0) : ""]] : [] };
    },
  },
  authorized_pickups: {
    group: "الطلاب", label: "المفوّضون بالاستلام", summary: "حسب صلة القرابة والحالة", note: "حسب تاريخ الإضافة",
    run: async (p, detail) => {
      const rows = await all((a, b) => within(db.from("authorized_pickups").select("full_name, relationship, phone, active, created_at, students(full_name)").eq("school_id", p.school), "created_at", p).range(a, b));
      if (detail) return { headers: ["المفوّض", "الطالب", "الصلة", "الجوال", "نشط", "تاريخ الإضافة"], rows: rows.map((r) => [r["full_name"], r["students"]?.full_name, r["relationship"], r["phone"], yes(r["active"]), rday(r["created_at"])]) };
      return groupCount(rows, ["الصلة", "نشط"], (r) => [r["relationship"] ?? "", yes(r["active"])]);
    },
  },
  family_requests: {
    group: "الطلاب", label: "طلبات أولياء الأمور", summary: "حسب النوع والحالة", note: "حسب تاريخ تقديم الطلب",
    run: async (p, detail) => {
      const rows = await all((a, b) => within(db.from("family_requests").select("ref, kind, status, created_at, decided_at, students(full_name)").eq("school_id", p.school), "created_at", p).order("created_at").range(a, b));
      if (detail) return { headers: ["رقم الطلب", "الطالب", "النوع", "الحالة", "تاريخ التقديم", "تاريخ القرار"], rows: rows.map((r) => [r["ref"], r["students"]?.full_name, lbl(FAMILY_REQUEST_KINDS, r["kind"]), lbl(FAM, r["status"]), rday(r["created_at"]), rday(r["decided_at"])]) };
      return groupCount(rows, ["النوع", "الحالة"], (r) => [lbl(FAMILY_REQUEST_KINDS, r["kind"]), lbl(FAM, r["status"])]);
    },
  },
  admissions: {
    group: "الطلاب", label: "طلبات القبول والتسجيل", summary: "حسب الحالة والصف", note: "حسب تاريخ التقديم — طلبات هذا الفرع ضمن صلاحيتك",
    run: async (p, detail) => {
      const { data, error } = await db.rpc("ad_list", { _org: p.org, _f: { school: p.school, from: p.from ?? "", to: p.to ?? "", export: true }, _limit: 5000, _offset: 0 });
      if (error) throw error;
      const rows = ((data as { rows?: Row[] } | null)?.rows ?? []).filter((r) => inPeriod(r["submitted_at"], p));
      if (detail) return { headers: ["رقم الطلب", "الطالب", "ولي الأمر", "المرحلة", "الصف", "الحالة", "المسؤول", "تاريخ التقديم"], rows: rows.map((r) => [r["ref"], r["student_name"], r["guardian_name"], r["stage"] ?? "", r["grade"] ?? "", lbl(AD_STATUS, r["status"]), r["assignee_name"] ?? "غير مسند", rday(r["submitted_at"])]) };
      return groupCount(rows, ["الحالة", "الصف"], (r) => [lbl(AD_STATUS, r["status"]), r["grade"] ?? "غير محدد"]);
    },
  },

  attendance_corrections: {
    group: "الحضور والغياب", label: "طلبات تصحيح الحضور", summary: "حسب الحالة", note: "حسب تاريخ الطلب",
    run: async (p, detail) => {
      const rows = await all((a, b) => within(db.from("attendance_corrections").select("status, old_status, new_status, reason, requested_at, decided_at").eq("school_id", p.school), "requested_at", p).order("requested_at").range(a, b));
      if (detail) return { headers: ["تاريخ الطلب", "من", "إلى", "السبب", "الحالة", "تاريخ القرار"], rows: rows.map((r) => [rday(r["requested_at"]), lbl(DAY_STATUS, r["old_status"]), lbl(DAY_STATUS, r["new_status"]), r["reason"], lbl(CORR, r["status"]), rday(r["decided_at"])]) };
      return groupCount(rows, ["الحالة", "التصحيح إلى"], (r) => [lbl(CORR, r["status"]), lbl(DAY_STATUS, r["new_status"])]);
    },
  },
  pickups: {
    group: "الحضور والغياب", label: "الاستئذان والاستلام", summary: "حسب النوع والحالة", note: "حسب تاريخ الطلب",
    run: async (p, detail) => {
      const rows = await all((a, b) => within(db.from("pickup_requests").select("req_date, kind, status, reason, pickup_name, created_at, handed_at, students(full_name)").eq("school_id", p.school), "req_date", p, false).order("req_date").range(a, b));
      if (detail) return { headers: ["التاريخ", "الطالب", "النوع", "الحالة", "المستلم", "السبب", "وقت التسليم"], rows: rows.map((r) => [r["req_date"], r["students"]?.full_name, lbl(PICK_KIND, r["kind"]), lbl(PICKUP_STATUS, r["status"]), r["pickup_name"], r["reason"], r["handed_at"] ? new Date(r["handed_at"]).toLocaleTimeString("ar-SA", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" }) : ""]) };
      return groupCount(rows, ["النوع", "الحالة"], (r) => [lbl(PICK_KIND, r["kind"]), lbl(PICKUP_STATUS, r["status"])]);
    },
  },
  gate: {
    group: "الحضور والغياب", label: "حركة البوابة", summary: "حسب نوع الحركة", note: "حسب تاريخ الحركة",
    run: async (p, detail) => {
      const rows = await all((a, b) => within(db.from("gate_movements").select("date, kind, at, note, students(full_name)").eq("school_id", p.school), "date", p, false).order("at").range(a, b));
      if (detail) return { headers: ["التاريخ", "الوقت", "الطالب", "الحركة", "ملاحظة"], rows: rows.map((r) => [r["date"], r["at"] ? new Date(r["at"]).toLocaleTimeString("ar-SA", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" }) : "", r["students"]?.full_name, lbl(MOVE_KIND, r["kind"]), r["note"]]) };
      return groupCount(rows, ["الحركة"], (r) => [lbl(MOVE_KIND, r["kind"])]);
    },
  },

  teacher_absences: {
    group: "المعلمون والجدول", label: "غياب المعلمين", summary: "حسب المعلم", note: "حسب يوم الغياب",
    run: async (p, detail) => {
      const rows = await all((a, b) => within(db.from("teacher_absences").select("date, note, teachers(full_name)").eq("school_id", p.school), "date", p, false).order("date").range(a, b));
      if (detail) return { headers: ["التاريخ", "المعلم", "ملاحظة"], rows: rows.map((r) => [r["date"], r["teachers"]?.full_name, r["note"]]) };
      return groupCount(rows, ["المعلم"], (r) => [r["teachers"]?.full_name ?? ""]);
    },
  },
  substitutions: {
    group: "المعلمون والجدول", label: "حصص الانتظار (البديل)", summary: "حسب المعلم البديل والحالة", note: "حسب تاريخ الحصة",
    run: async (p, detail) => {
      const rows = await all((a, b) => within(db.from("substitutions").select("date, status, reason, teachers:substitute_teacher_id(full_name)").eq("school_id", p.school), "date", p, false).order("date").range(a, b));
      if (detail) return { headers: ["التاريخ", "المعلم البديل", "الحالة", "السبب"], rows: rows.map((r) => [r["date"], r["teachers"]?.full_name ?? "غير مسند", lbl(SUBST, r["status"]), r["reason"]]) };
      return groupCount(rows, ["المعلم البديل", "الحالة"], (r) => [r["teachers"]?.full_name ?? "غير مسند", lbl(SUBST, r["status"])]);
    },
  },
  assignments: {
    group: "المعلمون والجدول", label: "إسناد المواد للمعلمين", summary: "حسب المعلم", note: "الإسنادات السارية خلال الفترة",
    run: async (p, detail) => {
      const rows = (await all((a, b) => db.from("teacher_assignments").select("status, start_date, end_date, teachers(full_name), courses(weekly_periods, subjects(name), sections(name, grades(name)))").eq("school_id", p.school).eq("status", "approved").range(a, b)))
        .filter((r) => (!p.to || !r["start_date"] || r["start_date"] <= p.to) && (!p.from || !r["end_date"] || r["end_date"] >= p.from));
      if (detail) return { headers: ["المعلم", "المادة", "الصف", "الشعبة", "الحصص الأسبوعية", "من", "إلى"], rows: rows.map((r) => [r["teachers"]?.full_name, r["courses"]?.subjects?.name, r["courses"]?.sections?.grades?.name, r["courses"]?.sections?.name, n(r["courses"]?.weekly_periods), r["start_date"] ?? "", r["end_date"] ?? "مفتوح"]) };
      const by = new Map<string, { c: number; w: number }>();
      for (const r of rows) { const k = r["teachers"]?.full_name ?? ""; const v = by.get(k) ?? { c: 0, w: 0 }; v.c += 1; v.w += Number(r["courses"]?.weekly_periods ?? 0); by.set(k, v); }
      const list = [...by.entries()].sort((a, b) => a[0].localeCompare(b[0], "ar")).map(([k, v]) => [k, v.c, v.w]);
      return { headers: ["المعلم", "عدد المواد/الشعب", "الحصص الأسبوعية"], rows: list.length ? [...list, ["الإجمالي", rows.length, list.reduce((t, r) => t + Number(r[2]), 0)]] : [] };
    },
  },
  class_visits: {
    group: "المعلمون والجدول", label: "الزيارات الصفية", summary: "حسب نوع الزيارة والحالة", note: "حسب تاريخ الزيارة",
    run: async (p, detail) => {
      const rows = (await allRpc(async () => db.rpc("cv_list" as never, { _school: p.school } as never), 100000)).filter((r) => inPeriod(r["visit_date"] ?? r["created_at"], p));
      if (detail) return { headers: ["التاريخ", "المعلم", "المادة", "الشعبة", "نوع الزيارة", "الحالة"], rows: rows.map((r) => [rday(r["visit_date"]), r["teacher_name"] ?? "", r["subject"] ?? "", r["section"] ?? "", r["visit_type"] ?? "", lbl(CV, r["status"])]) };
      return groupCount(rows, ["نوع الزيارة", "الحالة"], (r) => [String(r["visit_type"] ?? ""), lbl(CV, r["status"])]);
    },
  },

  submissions: {
    group: "الشؤون التعليمية", label: "تسليمات الطلاب للواجبات", summary: "حسب حالة التسليم", note: "حسب آخر تسليم",
    run: async (p, detail) => {
      const rows = await all((a, b) => within(db.from("homework_submissions").select("status, attempt_count, last_submitted_at, students(full_name), homework(title)").eq("school_id", p.school), "last_submitted_at", p).order("last_submitted_at").range(a, b));
      if (detail) return { headers: ["الواجب", "الطالب", "الحالة", "عدد المحاولات", "آخر تسليم"], rows: rows.map((r) => [r["homework"]?.title, r["students"]?.full_name, lbl(SUB_STATUS, r["status"]), n(r["attempt_count"]), rday(r["last_submitted_at"])]) };
      return groupCount(rows, ["الحالة"], (r) => [lbl(SUB_STATUS, r["status"])]);
    },
  },
  class_posts: {
    group: "الشؤون التعليمية", label: "منشورات الفصول الافتراضية", summary: "حسب الحالة", note: "حسب تاريخ الإنشاء",
    run: async (p, detail) => {
      const rows = await all((a, b) => within(db.from("classroom_posts").select("title, status, pinned, created_at").eq("school_id", p.school), "created_at", p).order("created_at").range(a, b));
      if (detail) return { headers: ["العنوان", "الحالة", "مثبت", "تاريخ الإنشاء"], rows: rows.map((r) => [r["title"], lbl(POST, r["status"]), yes(r["pinned"]), rday(r["created_at"])]) };
      return groupCount(rows, ["الحالة"], (r) => [lbl(POST, r["status"])]);
    },
  },

  circulars: {
    group: "التواصل", label: "التعاميم", summary: "حسب الحالة ووجوب الإقرار", note: "حسب تاريخ الإنشاء",
    run: async (p, detail) => {
      const rows = await all((a, b) => within(db.from("circulars").select("title, status, priority, requires_ack, published_at, created_at").eq("school_id", p.school), "created_at", p).order("created_at").range(a, b));
      if (detail) return { headers: ["العنوان", "الحالة", "يتطلب إقرارًا", "تاريخ النشر", "تاريخ الإنشاء"], rows: rows.map((r) => [r["title"], lbl(CIRC, r["status"]), yes(r["requires_ack"]), rday(r["published_at"]), rday(r["created_at"])]) };
      return groupCount(rows, ["الحالة", "يتطلب إقرارًا"], (r) => [lbl(CIRC, r["status"]), yes(r["requires_ack"])]);
    },
  },

  admin_tasks: {
    group: "إدارة المدرسة", label: "التكليفات الإدارية", summary: "حسب الحالة والأولوية", note: "حسب تاريخ الاستحقاق — ما تستطيع رؤيته",
    run: async (p, detail) => {
      const rows = (await allRpc((l, o) => db.rpc("adm_task_list", { _school: p.school, _scope: "all", _q: null, _status: null, _priority: null, _assignee: null, _dept: null, _from: null, _to: null, _limit: l, _offset: o }))).filter((r) => inPeriod(r["due_date"] ?? r["created_at"], p));
      if (detail) return { headers: ["التكليف", "المكلَّف", "المكلِّف", "الحالة", "الأولوية", "الاستحقاق", "الإنجاز"], rows: rows.map((r) => [r["title"], r["assignee_name"], r["assigner_name"], lbl(TASK_STATUS, r["status"]), lbl(ADM_PRIORITY, r["priority"]), r["due_date"] ?? "", `${r["progress"] ?? 0}%`]) };
      return groupCount(rows, ["الحالة", "الأولوية"], (r) => [lbl(TASK_STATUS, r["status"]), lbl(ADM_PRIORITY, r["priority"])]);
    },
  },
  admin_requests: {
    group: "إدارة المدرسة", label: "الطلبات الإدارية (النماذج)", summary: "حسب النموذج والحالة", note: "حسب تاريخ التقديم — ما تستطيع رؤيته",
    run: async (p, detail) => {
      const rows = (await allRpc((l, o) => db.rpc("adm_request_list", { _school: p.school, _scope: "all", _q: null, _status: null, _form: null, _limit: l, _offset: o }))).filter((r) => inPeriod(r["submitted_at"], p));
      if (detail) return { headers: ["النموذج", "مقدم الطلب", "المعالج", "الحالة", "تاريخ التقديم"], rows: rows.map((r) => [r["form_name"], r["submitted_by"], r["handler"], lbl(REQ_STATUS, r["status"]), rday(r["submitted_at"])]) };
      return groupCount(rows, ["النموذج", "الحالة"], (r) => [r["form_name"] ?? "", lbl(REQ_STATUS, r["status"])]);
    },
  },

  maint_school: {
    group: "الموارد والخدمات", label: "طلبات صيانة المدارس", summary: "حسب الحالة والأولوية", note: "حسب تاريخ الطلب — هذا الفرع ضمن صلاحيتك",
    run: (p, detail) => maint("school", p, detail),
  },
  maint_bus: {
    group: "الموارد والخدمات", label: "طلبات صيانة الباصات", summary: "حسب الحالة والأولوية", note: "حسب تاريخ الطلب — هذا الفرع ضمن صلاحيتك",
    run: (p, detail) => maint("bus", p, detail),
  },
  procurement: {
    group: "الموارد والخدمات", label: "طلبات المشتريات والعهد", summary: "حسب النوع والحالة", note: "حسب تاريخ الطلب — كل ما تسمح به صلاحيتك في المؤسسة",
    run: async (p, detail) => {
      const rows = (await allRpc((l, o) => db.rpc("pc_request_list", { _org: p.org, _kind: null, _status: null, _q: null, _custody: null, _from: p.from, _to: p.to, _limit: l, _offset: o }))).filter((r) => inPeriod(r["created_at"], p));
      if (detail) return { headers: ["المرجع", "النوع", "مقدّم الطلب", "الغرض", "المبلغ", "الحالة", "التاريخ"], rows: rows.map((r) => [r["ref"], lbl(R_KIND, r["kind"]), r["creator"], r["purpose"], n(r["amount"]), lbl(R_STATUS, r["status"]), rday(r["created_at"])]) };
      return groupCount(rows, ["النوع", "الحالة"], (r) => [lbl(R_KIND, r["kind"]), lbl(R_STATUS, r["status"])]);
    },
  },
  support: {
    group: "الموارد والخدمات", label: "تذاكر الدعم", summary: "حسب الحالة والأولوية", note: "حسب تاريخ الإنشاء — التذاكر التي تديرها أو قدّمتها",
    run: async (p, detail) => {
      const call = (box: string) => allRpc((l, o) => db.rpc("support_list", { _box: box, _school: p.school, _q: null, _status: null, _priority: null, _category: null, _from: p.from, _to: p.to, _limit: l, _offset: o, _assignee: null, _dept: null } as never));
      let rows: Row[]; try { rows = await call("manage"); } catch { rows = await call("mine"); }
      rows = rows.filter((r) => inPeriod(r["created_at"], p));
      if (detail) return { headers: ["الرقم", "العنوان", "الحالة", "الأولوية", "التصنيف", "مقدم الطلب", "المسؤول", "الإنشاء", "متأخرة"], rows: rows.map((r) => [r["ref"], r["title"], lbl(SP_STATUS, r["status"]), lbl(SP_PRIO, r["priority"]), r["category"], r["requester_name"], r["assignee_name"], rday(r["created_at"]), r["overdue"] ? "نعم" : ""]) };
      return groupCount(rows, ["الحالة", "الأولوية"], (r) => [lbl(SP_STATUS, r["status"]), lbl(SP_PRIO, r["priority"])]);
    },
  },
};

async function maint(kind: "school" | "bus", p: Parameters<Def["run"]>[0], detail: boolean) {
  const rows = (await allRpc((l, o) => db.rpc("mt_list", { _org: p.org, _f: { kind, school: p.school, from: p.from ?? "", to: p.to ?? "", limit: l, offset: o } }))).filter((r) => inPeriod(r["created_at"], p));
  if (detail) return { headers: ["المرجع", "العنوان", "التصنيف", "المكان", "الأولوية", "الحالة", "المسند إليه", "مقدم الطلب", "التاريخ"], rows: rows.map((r) => [r["ref"], r["title"], r["category"], r["place"], lbl(MT_PRIORITY, r["priority"]), lbl(MT_STATUS, r["status"]), r["assignee"] ?? "—", r["requester"], rday(r["created_at"])]) };
  return groupCount(rows, ["الحالة", "الأولوية"], (r) => [lbl(MT_STATUS, r["status"]), lbl(MT_PRIORITY, r["priority"])]);
}
