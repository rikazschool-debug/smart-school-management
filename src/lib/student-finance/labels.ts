/** Presentation helpers for sf_* RPC results. Amounts are always computed by the server; these only label them. */
export const SF_KEY = ["sf"] as const;
export type Balance = { gross: number; discount: number; net: number; recorded: number; remaining: number; credit: number };
export type Obligation = { id: string; term: number; kind: "tuition" | "transport"; status: "pending" | "exempt" | "void"; original: number; amount: number; manual_override: boolean; year_id: string; balance: Balance };

export const KIND_LABEL: Record<string, string> = { tuition: "الرسوم الدراسية", transport: "رسوم النقل", both: "الدراسية والنقل" };
export const TRANSPORT_TYPES = [
  { value: "round_trip", label: "ذهاب وعودة" },
  { value: "outbound", label: "ذهاب فقط" },
  { value: "return", label: "عودة فقط" },
] as const;
export const TRANSPORT_LABEL: Record<string, string> = Object.fromEntries(TRANSPORT_TYPES.map((t) => [t.value, t.label]));
export const METHODS = [
  { value: "cash", label: "نقدًا" }, { value: "bank", label: "تحويل بنكي" }, { value: "mada", label: "مدى" },
  { value: "credit_card", label: "بطاقة ائتمانية" }, { value: "electronic", label: "دفع إلكتروني" }, { value: "other", label: "أخرى" },
] as const;
export const METHOD_LABEL: Record<string, string> = Object.fromEntries(METHODS.map((t) => [t.value, t.label]));
export const PRICE_STATUS: Record<string, string> = { draft: "مسودة", approved: "معتمدة", inactive: "معطلة" };
export const DISCOUNT_STATUS: Record<string, string> = { active: "نشط", scheduled: "مجدول", expired: "منتهي", disabled: "معطل" };
export const COLLECTION_STATUS: Record<string, string> = { pending_accounting: "مسجلة — بانتظار الاعتماد المحاسبي", reversed: "ملغاة" };
export const TERM_LABEL = (t: number) => (t === 1 ? "الفصل الأول" : "الفصل الثاني");

export const num = (v: unknown) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };
export const money = (v: unknown) => `${num(v).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;

/** One status per obligation; exempt is distinct from fully paid. */
export function paymentState(o: Pick<Obligation, "status" | "balance"> | null | undefined): string {
  if (!o) return "الرسوم غير مهيأة";
  if (o.status === "exempt") return "معفى من الرسوم";
  if (o.status === "void") return "ملغى";
  const b = o.balance;
  if (num(b.credit) > 0) return "يوجد رصيد دائن";
  if (num(b.net) === 0) return "معفى من الرسوم";
  if (num(b.remaining) === 0) return "مسدد بالكامل";
  if (num(b.recorded) > 0) return "مسدد جزئيًا";
  return "غير مسدد";
}

/** Payment rows the collect form may send: positive, two decimals, not above what remains. */
export function validAllocation(amount: number, remaining: number) {
  return Number.isFinite(amount) && amount > 0 && Math.round(amount * 100) === amount * 100 && amount <= remaining;
}
