// Arabic amount in words (riyals + halalas) for internal receipts.
const ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

function below1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100, parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]!);
  if (r) parts.push(r < 20 ? ONES[r]! : (r % 10 ? `${ONES[r % 10]} و${TENS[Math.floor(r / 10)]}` : TENS[Math.floor(r / 10)]!));
  return parts.join(" و");
}
function scale(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one; if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${below1000(n)} ${few}`;
  return `${below1000(n)} ${many}`;
}
export function intToWords(n: number): string {
  if (n === 0) return "صفر";
  const m = Math.floor(n / 1_000_000), t = Math.floor((n % 1_000_000) / 1000), r = n % 1000, parts: string[] = [];
  if (m) parts.push(scale(m, "مليون", "مليونان", "ملايين", "مليون"));
  if (t) parts.push(scale(t, "ألف", "ألفان", "آلاف", "ألف"));
  if (r) parts.push(below1000(r));
  return parts.join(" و");
}
const unit = (n: number, one: string, two: string, few: string, many: string) => n === 1 ? one : n === 2 ? two : n % 100 >= 3 && n % 100 <= 10 ? few : many;
/** e.g. 2500.50 → «ألفان وخمسمائة ريال وخمسون هللة فقط لا غير» */
export function amountInWords(value: number | string): string {
  const cents = Math.round(Number(value) * 100);
  if (!Number.isFinite(cents) || cents < 0) return "";
  const r = Math.floor(cents / 100), h = cents % 100, parts: string[] = [];
  if (r || !h) parts.push(r === 1 ? "ريال واحد" : r === 2 ? "ريالان" : `${intToWords(r)} ${unit(r, "ريال", "ريالان", "ريالات", "ريال")}`);
  if (h) parts.push(h === 1 ? "هللة واحدة" : h === 2 ? "هللتان" : `${intToWords(h)} ${unit(h, "هللة", "هللتان", "هللات", "هللة")}`);
  return `${parts.join(" و")} فقط لا غير`;
}
