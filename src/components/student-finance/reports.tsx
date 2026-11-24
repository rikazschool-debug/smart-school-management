import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileBarChart, Search } from "lucide-react";
import { db, type Row } from "@/components/crud-page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { selectCls } from "@/components/ui/native-select";
import { LoadingState, ErrorState } from "@/components/states";
import { arabicError } from "@/lib/session";
import { formatAcademicYear } from "@/lib/academic-year";
import { exportPdf, exportXlsx, printReport } from "@/lib/export";
import { KIND_LABEL, METHOD_LABEL, SF_KEY, TERM_LABEL, TRANSPORT_LABEL, money, num } from "@/lib/student-finance/labels";
import { StudentFinance } from "./student-finance";
import { SEARCH_HINT, useStudentSearch } from "./search";

type Cell = string | number;
type Src = "ob" | "col" | "disc" | "tr" | "bus" | "adj" | "rcpt" | "pend";
/** One report line; the standard fields drive the shared filters, cells are what is shown/exported. */
type O<T> = T | undefined;
type Rec = { sid?: O<string>; name?: O<string>; grade?: O<string>; stage?: O<string>; term?: O<number>; kind?: O<string>; date?: O<string>; method?: O<string>; actor?: O<string>; pay?: O<string>; amount: number; cells: Cell[] };
type Rep = { key: string; group: string; title: string; src: Src; headers: string[]; build: (d: Row[]) => Rec[]; total?: string };

const RPC: Record<Src, string> = { ob: "sf_obligation_lines", col: "sf_collection_lines", disc: "sf_discount_list", tr: "sf_transport_accounts", bus: "sf_bus_occupancy", adj: "sf_adjustments", rcpt: "sf_receipts", pend: "sf_pending_creation" };
const B = (r: Row) => (r["balance"] ?? {}) as Row;
const cls = (r: Row) => (r["cls"] ?? {}) as Row;
const yr = (v: unknown) => (v ? formatAcademicYear(String(v)) : "—");
const payState = (r: Row) => { const b = B(r); if (r["status"] === "exempt" || r["exempt"]) return "معفى"; if (num(b["credit"]) > 0) return "رصيد دائن"; if (num(b["net"]) === 0) return "معفى"; if (num(b["remaining"]) <= 0) return "مسدد"; if (num(b["recorded"]) > 0) return "مسدد جزئيًا"; return "غير مسدد"; };
const live = (d: Row[]) => d.filter((r) => r["status"] !== "void");
const base = (r: Row): Omit<Rec, "amount" | "cells"> => ({ sid: String(r["student_id"] ?? ""), name: String(r["name"] ?? ""), grade: String(cls(r)["grade"] ?? ""), stage: String(cls(r)["stage"] ?? ""), term: num(r["term"]) || undefined, kind: r["kind"] ? String(r["kind"]) : r["fee_kind"] ? String(r["fee_kind"]) : undefined });

const OB_H = ["الطالب", "الصف", "العام", "الفصل", "النوع", "الرسوم", "الخصم", "الصافي", "المسدد", "المتبقي", "الحالة"];
const obRec = (r: Row): Rec => { const b = B(r); return { ...base(r), pay: payState(r), amount: num(b["remaining"]), cells: [String(r["name"]), [cls(r)["grade"], cls(r)["section"]].filter(Boolean).join(" / "), yr(r["year"]), TERM_LABEL(num(r["term"])), KIND_LABEL[String(r["kind"])] ?? "", money(b["gross"]), money(b["discount"]), money(b["net"]), money(b["recorded"]), money(b["remaining"]), payState(r)] }; };
const obs = (f: (r: Row) => boolean) => (d: Row[]) => live(d).filter(f).map(obRec);
/** per-student totals from obligation lines (one row per student) */
const perStudent = (d: Row[], f: (t: { rem: number; credit: number; rec: number; net: number; exempt: boolean; overdue: boolean; prev: number; r: Row }) => boolean): Rec[] => {
  const m = new Map<string, { rem: number; credit: number; rec: number; net: number; exempt: boolean; overdue: boolean; prev: number; r: Row }>();
  for (const r of live(d)) { const k = String(r["student_id"]); const t = m.get(k) ?? { rem: 0, credit: 0, rec: 0, net: 0, exempt: false, overdue: false, prev: 0, r }; const b = B(r); t.rem += num(b["remaining"]); t.credit += num(b["credit"]); t.rec += num(b["recorded"]); t.net += num(b["net"]); t.exempt ||= r["status"] === "exempt"; t.overdue ||= !!r["overdue"]; if (r["previous"]) t.prev += num(b["remaining"]); m.set(k, t); }
  return [...m.values()].filter(f).map((t) => ({ ...base(t.r), kind: undefined, term: undefined, amount: t.rem, cells: [String(t.r["name"]), [cls(t.r)["grade"], cls(t.r)["section"]].filter(Boolean).join(" / "), t.r["placed"] ? "مسكّن" : "غير مسكّن", money(t.net), money(t.rec), money(t.rem), money(t.prev), money(t.credit)] }));
};
const ST_H = ["الطالب", "الصف", "التسكين", "الصافي", "المسدد", "المتبقي", "منه أرصدة سابقة", "رصيد دائن"];
/** grouped totals (no student rows) */
const grouped = (label: string, key: (r: Row) => string, val: (r: Row) => number) => (d: Row[]): Rec[] => {
  const m = new Map<string, { n: number; v: number }>(); for (const r of d) { const k = key(r) || "—"; const t = m.get(k) ?? { n: 0, v: 0 }; t.n++; t.v += val(r); m.set(k, t); }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, t]) => ({ amount: t.v, cells: [k, t.n, money(t.v)] })).map((x) => ({ ...x, name: label }));
};
const G_H = (l: string) => [l, "العدد", "المبلغ"];
const COL_H = ["التاريخ", "رقم السند", "الطالب", "الصف", "البند", "عام المستحق", "طريقة السداد", "الموظف", "المبلغ"];
const okCol = (d: Row[]) => d.filter((r) => r["status"] !== "reversed");
const colRec = (r: Row): Rec => ({ ...base(r), date: String(r["paid_at"]), method: String(r["method"]), actor: String(r["actor"]), amount: num(r["amount"]), cells: [String(r["paid_at"]), String(r["receipt"] ?? "—"), String(r["name"]), [cls(r)["grade"], cls(r)["section"]].filter(Boolean).join(" / "), `${KIND_LABEL[String(r["kind"])] ?? ""} — ${TERM_LABEL(num(r["term"]))}`, `${yr(r["year"])}${r["previous"] ? " (رصيد سابق)" : ""}`, METHOD_LABEL[String(r["method"])] ?? String(r["method"]), String(r["actor"] || "—"), money(r["amount"])] });
const DISC_H = ["الطالب", "الصف", "العام", "الفصل", "الخصم", "نوع الرسوم", "القيمة", "المصدر", "الحالة"];
const discRec = (r: Row): Rec => ({ ...base(r), amount: num(r["amount"]), cells: [String(r["name"]), String(cls(r)["grade"] ?? ""), yr(r["year"]), TERM_LABEL(num(r["term"])), String(r["discount"]), KIND_LABEL[String(r["fee_kind"])] ?? "", money(r["amount"]), r["automatic"] ? "تلقائي" : "يدوي", r["active"] ? "نشط" : r["manual_override"] ? "مستثنى" : "ملغى"] });
const TR_H = ["الطالب", "الصف", "الباص", "الفصل", "نوع الاشتراك", "الرسوم", "الخصم", "المسدد", "المتبقي", "الحالة"];
const trRec = (r: Row): Rec => { const b = B(r); return { ...base(r), kind: "transport", amount: num(b["remaining"]), cells: [String(r["name"]), String(cls(r)["grade"] ?? ""), String(r["bus"] ?? "—"), TERM_LABEL(num(r["term"])), r["active"] ? TRANSPORT_LABEL[String(r["transport_type"])] ?? "—" : "غير مشترك", money(b["gross"]), money(b["discount"]), money(b["recorded"]), money(b["remaining"]), `${r["exempt"] ? "معفى" : payState(r)}${r["overdue"] ? " · متأخر" : ""}`] }; };
const ADJ_H = ["الرقم", "التاريخ", "الطالب", "النوع", "قبل", "بعد", "المستخدم", "السبب"];
const ADJ: Record<string, string> = { reprice: "تعديل سعر الرسوم", discount_edit: "تعديل خصم", discount_remove: "إلغاء خصم", exception_clear: "إعادة تقييم خصم", transport_edit: "تعديل رسوم النقل", transport_exempt: "إعفاء من رسوم النقل", transport_cancel: "إلغاء مستحقات النقل", collection_reverse: "عكس سداد", credit_apply: "استخدام رصيد دائن", credit_refund: "استرداد رصيد دائن", carry_apply: "ترحيل أرصدة" };
const adj = (f: (r: Row) => boolean) => (d: Row[]): Rec[] => d.filter(f).map((r) => ({ ...base(r), date: String(r["created_at"]).slice(0, 10), actor: String(r["actor"]), amount: num(r["new"]), cells: [String(r["number"]), String(r["created_at"]).slice(0, 10), String(r["name"] ?? "—"), ADJ[String(r["action"])] ?? String(r["action"]), r["old"] == null ? "—" : money(r["old"]), r["new"] == null ? "—" : money(r["new"]), String(r["actor"] || "—"), String(r["reason"] ?? "—")] }));
const RC_H = ["رقم السند", "تاريخ السداد", "الطالب", "المبلغ", "الطريقة", "المرجع", "الحالة"];
const rc = (f: (r: Row) => boolean) => (d: Row[]): Rec[] => d.filter(f).map((r) => { const s = (r["snapshot"] ?? {}) as Row; return { sid: String(r["student_id"] ?? s["student"]?.id ?? ""), name: String(s["student"]?.name ?? ""), date: String(s["paid_at"]), method: String(s["method"]), actor: String(s["actor"] ?? ""), amount: r["status"] === "cancelled" ? 0 : num(s["amount"]), cells: [String(r["number"]), String(s["paid_at"]), String(s["student"]?.name ?? ""), money(s["amount"]), METHOD_LABEL[String(s["method"])] ?? "", String(s["ref"] || "—"), r["status"] === "cancelled" ? "ملغى" : "ساري"] }; });

const T = "tuition", TR = "transport";
export const REPORTS: Rep[] = [
  // 1 fees & obligations
  { key: "fees_tuition", group: "الرسوم والمستحقات", title: "تقرير الرسوم الدراسية", src: "ob", headers: OB_H, build: obs((r) => !r["previous"] && r["kind"] === T) },
  { key: "fees_transport", group: "الرسوم والمستحقات", title: "تقرير رسوم النقل", src: "ob", headers: OB_H, build: obs((r) => !r["previous"] && r["kind"] === TR) },
  { key: "fees_net", group: "الرسوم والمستحقات", title: "صافي الرسوم بعد الخصومات", src: "ob", headers: OB_H, build: obs((r) => !r["previous"]) },
  { key: "dues", group: "الرسوم والمستحقات", title: "المستحقات المالية", src: "ob", headers: OB_H, build: obs((r) => num(B(r)["remaining"]) > 0) },
  { key: "overdue", group: "الرسوم والمستحقات", title: "المتأخرات", src: "ob", headers: [...OB_H, "أيام التأخير"], build: (d) => live(d).filter((r) => r["overdue"]).map((r) => { const x = obRec(r); x.cells.push(num(r["days_late"])); return x; }) },
  { key: "dues_stage", group: "الرسوم والمستحقات", title: "المستحقات حسب المرحلة", src: "ob", headers: G_H("المرحلة"), build: (d) => grouped("", (r) => String(cls(r)["stage"] ?? ""), (r) => num(B(r)["remaining"]))(live(d)) },
  { key: "dues_grade", group: "الرسوم والمستحقات", title: "المستحقات حسب الصف", src: "ob", headers: G_H("الصف"), build: (d) => grouped("", (r) => String(cls(r)["grade"] ?? ""), (r) => num(B(r)["remaining"]))(live(d)) },
  { key: "dues_term", group: "الرسوم والمستحقات", title: "المستحقات حسب الفصل", src: "ob", headers: G_H("الفصل"), build: (d) => grouped("", (r) => `${yr(r["year"])} — ${TERM_LABEL(num(r["term"]))}`, (r) => num(B(r)["remaining"]))(live(d)) },
  { key: "pending", group: "الرسوم والمستحقات", title: "طلاب لم تُنشأ مستحقاتهم", src: "pend", headers: ["الطالب", "الصف", "الشعبة", "السبب"], build: (d) => d.map((r) => ({ sid: String(r["student_id"]), name: String(r["name"]), amount: 0, cells: [String(r["name"]), String(r["grade"] ?? ""), String(r["section"] ?? ""), r["reason"] === "no_price" ? "لا توجد رسوم معتمدة لصفه" : String(r["reason"] ?? "")] })) },
  { key: "no_due", group: "الرسوم والمستحقات", title: "مستحقات بلا تاريخ استحقاق", src: "ob", headers: OB_H, build: obs((r) => r["status"] === "pending" && !r["due_date"] && num(B(r)["remaining"]) > 0) },
  // 2 collections
  { key: "col_all", group: "التحصيل", title: "تفاصيل التحصيل", src: "col", headers: COL_H, build: (d) => okCol(d).map(colRec) },
  { key: "col_day", group: "التحصيل", title: "التحصيل اليومي", src: "col", headers: G_H("اليوم"), build: (d) => grouped("", (r) => String(r["paid_at"]), (r) => num(r["amount"]))(okCol(d)) },
  { key: "col_month", group: "التحصيل", title: "التحصيل الشهري", src: "col", headers: G_H("الشهر"), build: (d) => grouped("", (r) => String(r["paid_at"]).slice(0, 7), (r) => num(r["amount"]))(okCol(d)) },
  { key: "col_year", group: "التحصيل", title: "التحصيل السنوي (حسب عام المستحق)", src: "col", headers: G_H("العام"), build: (d) => grouped("", (r) => yr(r["year"]), (r) => num(r["amount"]))(okCol(d)) },
  { key: "col_stage", group: "التحصيل", title: "التحصيل حسب المرحلة", src: "col", headers: G_H("المرحلة"), build: (d) => grouped("", (r) => String(cls(r)["stage"] ?? ""), (r) => num(r["amount"]))(okCol(d)) },
  { key: "col_grade", group: "التحصيل", title: "التحصيل حسب الصف", src: "col", headers: G_H("الصف"), build: (d) => grouped("", (r) => String(cls(r)["grade"] ?? ""), (r) => num(r["amount"]))(okCol(d)) },
  { key: "col_term", group: "التحصيل", title: "التحصيل حسب الفصل", src: "col", headers: G_H("الفصل"), build: (d) => grouped("", (r) => TERM_LABEL(num(r["term"])), (r) => num(r["amount"]))(okCol(d)) },
  { key: "col_kind", group: "التحصيل", title: "التحصيل حسب نوع الرسوم", src: "col", headers: G_H("النوع"), build: (d) => grouped("", (r) => KIND_LABEL[String(r["kind"])] ?? "", (r) => num(r["amount"]))(okCol(d)) },
  { key: "col_method", group: "التحصيل", title: "التحصيل حسب طريقة السداد", src: "col", headers: G_H("الطريقة"), build: (d) => grouped("", (r) => METHOD_LABEL[String(r["method"])] ?? "", (r) => num(r["amount"]))(okCol(d)) },
  { key: "col_actor", group: "التحصيل", title: "التحصيل حسب الموظف المسؤول", src: "col", headers: G_H("الموظف"), build: (d) => grouped("", (r) => String(r["actor"] ?? ""), (r) => num(r["amount"]))(okCol(d)) },
  { key: "col_cur", group: "التحصيل", title: "تحصيل الرسوم الحالية", src: "col", headers: COL_H, build: (d) => okCol(d).filter((r) => !r["previous"]).map(colRec) },
  { key: "col_prev", group: "التحصيل", title: "تحصيل الأرصدة السابقة", src: "col", headers: COL_H, build: (d) => okCol(d).filter((r) => r["previous"]).map(colRec) },
  // 3 student states
  { key: "st_paid", group: "حالات الطلاب", title: "الطلاب المسددون بالكامل", src: "ob", headers: ST_H, build: (d) => perStudent(d, (t) => t.net > 0 && t.rem <= 0) },
  { key: "st_partial", group: "حالات الطلاب", title: "الطلاب المسددون جزئيًا", src: "ob", headers: ST_H, build: (d) => perStudent(d, (t) => t.rec > 0 && t.rem > 0) },
  { key: "st_unpaid", group: "حالات الطلاب", title: "الطلاب غير المسددين", src: "ob", headers: ST_H, build: (d) => perStudent(d, (t) => t.rec <= 0 && t.rem > 0) },
  { key: "st_exempt", group: "حالات الطلاب", title: "الطلاب المعفيون", src: "ob", headers: ST_H, build: (d) => perStudent(d, (t) => t.exempt) },
  { key: "st_overdue", group: "حالات الطلاب", title: "الطلاب الذين لديهم متأخرات", src: "ob", headers: ST_H, build: (d) => perStudent(d, (t) => t.overdue) },
  { key: "st_prev", group: "حالات الطلاب", title: "الطلاب الذين لديهم أرصدة سابقة", src: "ob", headers: ST_H, build: (d) => perStudent(d, (t) => t.prev > 0) },
  { key: "st_credit", group: "حالات الطلاب", title: "الطلاب الذين لديهم أرصدة دائنة", src: "ob", headers: ST_H, build: (d) => perStudent(d, (t) => t.credit > 0) },
  { key: "st_left", group: "حالات الطلاب", title: "طلاب غير مسكّنين لديهم مستحقات", src: "ob", headers: ST_H, build: (d) => perStudent(d, (t) => !t.r["placed"] && t.rem > 0) },
  // 4 discounts
  { key: "d_all", group: "الخصومات", title: "الخصومات المطبقة", src: "disc", headers: DISC_H, build: (d) => d.filter((r) => r["active"]).map(discRec) },
  { key: "d_tuition", group: "الخصومات", title: "الخصومات الدراسية", src: "disc", headers: DISC_H, build: (d) => d.filter((r) => r["active"] && r["fee_kind"] === T).map(discRec) },
  { key: "d_transport", group: "الخصومات", title: "خصومات النقل", src: "disc", headers: DISC_H, build: (d) => d.filter((r) => r["active"] && r["fee_kind"] === TR).map(discRec) },
  { key: "d_sibling", group: "الخصومات", title: "خصم الإخوة", src: "disc", headers: DISC_H, build: (d) => d.filter((r) => r["active"] && r["sibling"]).map(discRec) },
  { key: "d_auto", group: "الخصومات", title: "الخصومات التلقائية", src: "disc", headers: DISC_H, build: (d) => d.filter((r) => r["active"] && r["automatic"]).map(discRec) },
  { key: "d_manual", group: "الخصومات", title: "الخصومات اليدوية", src: "disc", headers: DISC_H, build: (d) => d.filter((r) => r["active"] && !r["automatic"]).map(discRec) },
  { key: "d_edited", group: "الخصومات", title: "الخصومات المعدلة", src: "disc", headers: DISC_H, build: (d) => d.filter((r) => r["edited"]).map(discRec) },
  { key: "d_off", group: "الخصومات", title: "الخصومات الملغاة", src: "disc", headers: DISC_H, build: (d) => d.filter((r) => !r["active"]).map(discRec) },
  { key: "d_exc", group: "الخصومات", title: "استثناءات الخصومات", src: "disc", headers: DISC_H, build: (d) => d.filter((r) => r["manual_override"]).map(discRec) },
  // 5 transport
  { key: "t_subs", group: "النقل المدرسي", title: "المشتركون في النقل", src: "tr", headers: TR_H, build: (d) => d.filter((r) => r["active"]).map(trRec) },
  { key: "t_type", group: "النقل المدرسي", title: "المشتركون حسب نوع الاشتراك", src: "tr", headers: G_H("نوع الاشتراك"), build: (d) => grouped("", (r) => TRANSPORT_LABEL[String(r["transport_type"])] ?? "", (r) => num(B(r)["net"]))(d.filter((r) => r["active"])) },
  { key: "t_fees", group: "النقل المدرسي", title: "رسوم النقل وتحصيلها", src: "tr", headers: TR_H, build: (d) => d.map(trRec) },
  { key: "t_late", group: "النقل المدرسي", title: "متأخرات النقل", src: "tr", headers: TR_H, build: (d) => d.filter((r) => r["overdue"]).map(trRec) },
  { key: "t_exempt", group: "النقل المدرسي", title: "المعفيون من رسوم النقل", src: "tr", headers: TR_H, build: (d) => d.filter((r) => r["exempt"]).map(trRec) },
  { key: "t_bus", group: "النقل المدرسي", title: "إشغال الباصات والسعة المتبقية", src: "bus", headers: ["الباص", "السعة", "الطلاب", "ذهاب وعودة", "ذهاب فقط", "عودة فقط", "متاح للذهاب", "متاح للعودة", "الإشغال"], build: (d) => d.map((b) => ({ amount: 0, cells: [String(b["code"]), num(b["capacity"]), num(b["students"]), num(b["round_trip"]), num(b["outbound"]), num(b["return"]), num(b["free_out"]), num(b["free_ret"]), `${num(b["occupancy"])}%`] })) },
  { key: "t_roster", group: "النقل المدرسي", title: "كشف طلاب كل باص", src: "tr", headers: TR_H, build: (d) => d.filter((r) => r["active"]).sort((a, b) => String(a["bus"]).localeCompare(String(b["bus"]))).map(trRec) },
  // 6 previous balances
  { key: "p_debit", group: "الأرصدة السابقة", title: "الأرصدة المدينة", src: "ob", headers: OB_H, build: obs((r) => !!r["previous"] && num(B(r)["remaining"]) > 0) },
  { key: "p_credit", group: "الأرصدة السابقة", title: "الأرصدة الدائنة", src: "ob", headers: [...OB_H, "الرصيد الدائن"], build: (d) => live(d).filter((r) => num(B(r)["credit"]) > 0).map((r) => { const x = obRec(r); x.amount = num(B(r)["credit"]); x.cells.push(money(B(r)["credit"])); return x; }) },
  { key: "p_carried", group: "الأرصدة السابقة", title: "الأرصدة المرحلة", src: "ob", headers: OB_H, build: obs((r) => !!r["previous"] && !!r["carried"]) },
  { key: "p_not", group: "الأرصدة السابقة", title: "الأرصدة غير المرحلة", src: "ob", headers: OB_H, build: obs((r) => !!r["previous"] && !r["carried"]) },
  { key: "p_year", group: "الأرصدة السابقة", title: "الأرصدة حسب العام الأصلي", src: "ob", headers: G_H("العام الأصلي"), build: (d) => grouped("", (r) => yr(r["year"]), (r) => num(B(r)["remaining"]))(live(d).filter((r) => r["previous"])) },
  { key: "p_col", group: "الأرصدة السابقة", title: "تحصيل الأرصدة السابقة", src: "col", headers: COL_H, build: (d) => okCol(d).filter((r) => r["previous"]).map(colRec) },
  { key: "p_use", group: "الأرصدة السابقة", title: "استخدام الأرصدة الدائنة", src: "adj", headers: ADJ_H, build: adj((r) => r["action"] === "credit_apply") },
  { key: "p_ref", group: "الأرصدة السابقة", title: "استرداد الأرصدة الدائنة", src: "adj", headers: ADJ_H, build: adj((r) => r["action"] === "credit_refund") },
  // 7 documents & control
  { key: "r_all", group: "المستندات والرقابة", title: "سندات القبض", src: "rcpt", headers: RC_H, build: rc(() => true) },
  { key: "r_off", group: "المستندات والرقابة", title: "سندات القبض الملغاة", src: "rcpt", headers: RC_H, build: rc((r) => r["status"] === "cancelled") },
  { key: "c_rev", group: "المستندات والرقابة", title: "عمليات السداد الملغاة", src: "adj", headers: ADJ_H, build: adj((r) => r["action"] === "collection_reverse") },
  { key: "c_fee", group: "المستندات والرقابة", title: "تعديلات الرسوم", src: "adj", headers: ADJ_H, build: adj((r) => r["action"] === "reprice") },
  { key: "c_tr", group: "المستندات والرقابة", title: "تعديلات رسوم النقل", src: "adj", headers: ADJ_H, build: adj((r) => r["action"] === "transport_edit" || r["action"] === "transport_exempt") },
  { key: "c_trc", group: "المستندات والرقابة", title: "رسوم النقل الملغاة", src: "adj", headers: ADJ_H, build: adj((r) => r["action"] === "transport_cancel") },
  { key: "c_adj", group: "المستندات والرقابة", title: "التسويات المالية", src: "adj", headers: ADJ_H, build: adj(() => true) },
];
const GROUPS = [...new Set(REPORTS.map((r) => r.group))];

/** «التقارير المالية»: grouped catalog; every report is computed from the same sf_* lines (no report-only balances). */
export function ReportsCatalog({ schoolId, yearId }: { schoolId: string; yearId: string }) {
  const [q, setQ] = useState(""); const [open, setOpen] = useState<Rep | null>(null);
  if (open) return <ReportView rep={open} schoolId={schoolId} yearId={yearId} onBack={() => setOpen(null)} />;
  const list = REPORTS.filter((r) => !q || r.title.includes(q) || r.group.includes(q));
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center gap-3"><div><h2 className="text-lg font-bold">التقارير المالية</h2><p className="text-xs text-muted-foreground">{REPORTS.length} تقريرًا في {GROUPS.length} مجموعات، من مصدر الحسابات المالية نفسه.</p></div>
      <div className="relative ms-auto w-72"><Search className="absolute end-2 top-2.5 size-4 text-muted-foreground" /><Input placeholder="بحث باسم التقرير" value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
    {GROUPS.map((g) => { const items = list.filter((r) => r.group === g); return items.length ? <div key={g} className="space-y-2"><h3 className="text-sm font-semibold text-primary">{g}</h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{items.map((r) => <button key={r.key} type="button" onClick={() => setOpen(r)} className="flex items-center gap-2 rounded-xl border bg-card p-3 text-start text-sm transition-colors hover:border-primary hover:bg-muted/40"><FileBarChart className="size-4 shrink-0 text-primary" />{r.title}</button>)}</div></div> : null; })}
    {!list.length && <p className="text-sm text-muted-foreground">لا يوجد تقرير بهذا الاسم.</p>}
  </section>;
}

function ReportView({ rep, schoolId, yearId, onBack }: { rep: Rep; schoolId: string; yearId: string; onBack: () => void }) {
  const [term, setTerm] = useState(1);
  const args: Record<string, unknown> = rep.src === "rcpt" ? { _school: schoolId, _q: null, _from: null, _to: null, _method: null } : rep.src === "bus" ? { _school: schoolId, _year: yearId, _term: term } : { _school: schoolId, _year: yearId || null };
  const d = useQuery({ queryKey: [...SF_KEY, "rep", rep.src, schoolId, yearId, rep.src === "bus" ? term : 0], queryFn: async () => { const { data, error } = await db.rpc(RPC[rep.src], args); if (error) throw error; return data as Row[]; }, retry: false });
  const match = useStudentSearch(schoolId);
  const [f, setF] = useState({ s: "", stage: "", grade: "", term: "", kind: "", pay: "", method: "", actor: "", from: "", to: "" });
  const [open, setOpen] = useState<Rec | null>(null);
  const recs = useMemo(() => rep.build(d.data ?? []), [rep, d.data]);
  const rows = recs.filter((r) => (!f.s || (r.sid ? match(f.s, r.sid, r.name, ...r.cells) : r.cells.join(" ").includes(f.s))) && (!f.stage || r.stage === f.stage) && (!f.grade || r.grade === f.grade) && (!f.term || String(r.term) === f.term) && (!f.kind || r.kind === f.kind) && (!f.pay || r.pay === f.pay)
    && (!f.method || r.method === f.method) && (!f.actor || r.actor === f.actor) && (!f.from || (r.date ?? "") >= f.from) && (!f.to || (r.date ?? "9") <= f.to));
  const opts = (k: keyof Rec) => [...new Set(recs.map((r) => r[k]).filter(Boolean).map(String))].sort();
  const sel = (k: keyof typeof f, label: string, o: [string, string][]) => o.length > 1 ? <select aria-label={label} className={selectCls("min-w-28", true)} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}><option value="">{label}: الكل</option>{o.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select> : null;
  const total = rows.reduce((a, r) => a + r.amount, 0);
  const meta = { title: rep.title, filters: Object.values(f).filter(Boolean) };
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="ghost" onClick={onBack}>→ كل التقارير</Button><h2 className="text-lg font-bold">{rep.title}</h2><span className="text-xs text-muted-foreground">{rep.group}</span></div>
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
      <Input className="w-64" placeholder={SEARCH_HINT} value={f.s} onChange={(e) => setF({ ...f, s: e.target.value })} />
      {rep.src === "bus" && <select aria-label="الفصل" className={selectCls("min-w-28", true)} value={term} onChange={(e) => setTerm(Number(e.target.value))}><option value={1}>الفصل الأول</option><option value={2}>الفصل الثاني</option></select>}
      {sel("stage", "المرحلة", opts("stage").map((x) => [x, x]))}{sel("grade", "الصف", opts("grade").map((x) => [x, x]))}{sel("term", "الفصل", opts("term").map((x) => [x, TERM_LABEL(Number(x))]))}
      {sel("kind", "نوع الرسوم", opts("kind").map((x) => [x, KIND_LABEL[x] ?? x]))}{sel("pay", "حالة السداد", opts("pay").map((x) => [x, x]))}{sel("method", "طريقة السداد", opts("method").map((x) => [x, METHOD_LABEL[x] ?? x]))}{sel("actor", "الموظف", opts("actor").map((x) => [x, x]))}
      {recs.some((r) => r.date) && <><Input type="date" aria-label="من تاريخ" className="w-36" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /><Input type="date" aria-label="إلى تاريخ" className="w-36" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></>}
      <span className="ms-auto flex gap-1"><Button size="sm" variant="outline" onClick={() => void exportPdf(meta, rep.headers, rows.map((r) => r.cells)).catch((e) => toast.error(arabicError(e)))}>PDF</Button><Button size="sm" variant="outline" onClick={() => exportXlsx(meta, rep.headers, rows.map((r) => r.cells))}>Excel</Button><Button size="sm" variant="outline" onClick={() => printReport(meta, rep.headers, rows.map((r) => r.cells))}>طباعة</Button></span></div>
    {d.isLoading ? <LoadingState /> : d.error ? <ErrorState message={arabicError(d.error)} onRetry={() => d.refetch()} /> : <>
      <p className="text-sm">عدد النتائج: <b>{rows.length}</b>{total ? <> · الإجمالي: <b>{money(total)}</b></> : null}</p>
      <div className="overflow-x-auto rounded-2xl border bg-card"><table className="w-full text-xs"><thead className="bg-muted/50"><tr>{rep.headers.map((h) => <th key={h} className="whitespace-nowrap p-2 text-start">{h}</th>)}<th className="p-2" /></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t hover:bg-muted/30">{r.cells.map((c, j) => <td key={j} className="p-2">{c}</td>)}<td className="p-2">{r.sid && <Button size="sm" variant="outline" onClick={() => setOpen(r)}>ملف الطالب</Button>}</td></tr>)}</tbody></table>
        {!rows.length && <p className="p-6 text-center text-sm text-muted-foreground">لا توجد بيانات لهذا التقرير في النطاق المحدد.</p>}</div></>}
    <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}><DialogContent dir="rtl" className="max-h-[92vh] w-[96vw] max-w-6xl overflow-y-auto sm:max-w-6xl"><DialogHeader><DialogTitle>{open?.name}</DialogTitle></DialogHeader>{open?.sid && <StudentFinance studentId={open.sid} />}</DialogContent></Dialog>
  </section>;
}
