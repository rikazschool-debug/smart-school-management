import { z } from "zod";

export const SUPPORT_TOPICS = [
  { id: "academic", name: "شؤون أكاديمية", children: ["الاستفسار عن مستوى الطالب الأكاديمي أو السلوكي", "طلب مقابلة مع المعلم/المرشد", "السؤال عن الواجبات أو المشاريع", "الاعتراض على درجة أو تقييم", "طلب حصص تقوية أو متابعة خاصة"] },
  { id: "attendance", name: "الحضور والانصراف", children: ["الاستفسار عن تأخر أو غياب الطالب", "طلب خروج مبكر", "إشعار بغياب (ظرف صحي/عائلي)", "الاستفسار عن سياسة الغياب والتأخير"] },
  { id: "finance", name: "المالية", children: ["الاستفسار عن الرسوم ومواعيد السداد", "طلب تقسيط أو تأجيل الدفع", "الاستفسار عن خصومات أو منح", "شكوى بخصوص فاتورة"] },
  { id: "transport", name: "النقل والمواصلات", children: ["السؤال عن أوقات وخطوط الحافلة", "الإبلاغ عن تأخير أو مشكلة بالسائق", "طلب تغيير مكان النزول/الركوب"] },
  { id: "activities", name: "الأنشطة", children: ["الاستفسار عن الأنشطة اللاصفية", "السؤال عن الرحلات المدرسية", "طلب مشاركة الطالب في نشاط", "طلب إعفاء الطالب من نشاط"] },
  { id: "health", name: "الصحة والسلامة", children: ["الإبلاغ عن حالة صحية للطالب", "طلب إذن لإعطاء دواء", "الاستفسار عن الإسعافات أو التأمين", "الإبلاغ عن إصابة أو حادث"] },
  { id: "administrative", name: "إجراءات رسمية وإدارية", children: ["طلب شهادة أو تعريف رسمي", "الاستفسار عن النقل أو التحويل", "طلب تسجيل/قبول لأشقاء", "تحديث بيانات ولي الأمر أو الطالب"] },
  { id: "complaints", name: "الشكاوى والملاحظات", children: ["شكوى من معلم أو إداري", "شكوى من تعامل الطلاب الآخرين (تنمر، مضايقة)", "ملاحظات عامة عن بيئة المدرسة أو الخدمات"] },
] as const;

export const contactSchema = z.object({
  contact_name: z.string().trim().max(100, "اسم صاحب التواصل لا يتجاوز 100 حرف"),
  contact_phone: z.string().trim().refine(v => !v || /^\+?[0-9]{7,15}$/.test(v), "اكتب رقم هاتف صحيحًا من 7 إلى 15 رقمًا"),
  topic: z.string(), subtopic: z.string(),
}).superRefine((v, ctx) => {
  const topic = SUPPORT_TOPICS.find(t => t.id === v.topic);
  if (v.topic && !topic) ctx.addIssue({ code: "custom", path: ["topic"], message: "تصنيف غير صالح" });
  if ((v.topic && !v.subtopic) || (v.subtopic && !topic?.children.some(c => c === v.subtopic))) ctx.addIssue({ code: "custom", path: ["subtopic"], message: "اختر تصنيفًا فرعيًا تابعًا للتصنيف الرئيسي" });
});
export type TicketContact = z.infer<typeof contactSchema>;
export const EMPTY_CONTACT: TicketContact = { contact_name: "", contact_phone: "", topic: "", subtopic: "" };
export const topicName = (id: string) => SUPPORT_TOPICS.find(t => t.id === id)?.name ?? id;