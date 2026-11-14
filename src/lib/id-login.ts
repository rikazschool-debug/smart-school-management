// Browser-safe helpers for ID sign-in: generic messages (never reveal which record is missing) and phone masking.
const CONTACT = "إن استمرت المشكلة فتواصل مع إدارة المدرسة لتحديث بياناتك.";

export function idLoginMessage(key: string): string {
  switch (key) {
    case "invalid": return "أدخل رقم هوية أو إقامة صحيحًا من 10 أرقام.";
    case "cooldown": return "انتظر دقيقة قبل طلب رمز جديد.";
    case "too_many": return "تجاوزت عدد طلبات الرمز. حاول بعد 15 دقيقة.";
    case "wrong": return "الرمز غير صحيح.";
    case "expired": return "انتهت صلاحية الرمز. اطلب رمزًا جديدًا.";
    case "used": return "هذا الرمز لم يعد صالحًا. اطلب رمزًا جديدًا.";
    case "locked": return "تجاوزت عدد المحاولات. حاول بعد 15 دقيقة.";
    case "send_failed": return "تعذر إرسال الرمز الآن. حاول لاحقًا. " + CONTACT;
    case "student_mismatch": return "تعذر الدخول بالبيانات المدخلة. تأكد من رقم الهوية ورقم الطالب.";
    case "not_found": case "no_account": case "no_phone": case "conflict_account": case "conflict_phone":
      return "تعذر إرسال رمز لهذا الرقم. " + CONTACT;
    default: return "حدث خطأ غير متوقع. حاول مرة أخرى.";
  }
}

export function maskPhone(p: string): string {
  const d = p.replace(/\D/g, "");
  return d.length < 4 ? "••••" : `••••••${d.slice(-3)}`;
}
