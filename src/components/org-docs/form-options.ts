export const DOCUMENT_TYPES = [
  "السجل التجاري", "الرمز الموحد", "الترخيص التعليمي", "شهادة الدفاع المدني",
  "رخصة البلدية", "شهادة الزكاة والضريبة", "وثيقة تأمين", "هوية رقمية", "أخرى",
];

export const SERVICE_TYPES = ["المقصف", "الزي المدرسي", "النظافة", "الحراسة", "النقل", "الصيانة", "أخرى"];

export const ATTACHMENT_ACCEPT = "application/pdf,image/png,image/jpeg";

/** Editing an older record must not replace its category unless the user picks a new one. */
export function withSavedOption(options: readonly string[], saved?: string) {
  return saved && !options.includes(saved) ? [saved, ...options] : options;
}