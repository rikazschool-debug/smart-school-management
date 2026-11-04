import type { Role } from "./roles";

// Demo accounts for the development preview only (the login buttons are hidden in production builds).
export const DEMO_PASSWORD = "Demo-Rikaz-2026";

export const DEMO_ACCOUNTS: { role: Role; email: string; name: string; label?: string; template?: string }[] = [
  { role: "platform_admin", email: "demo-admin@rikaz.demo", name: "أدمن المنصة" },
  { role: "org_owner", email: "demo-owner@rikaz.demo", name: "مالك المجموعة" },
  { role: "principal", email: "demo-principal@rikaz.demo", name: "مدير المدرسة" },
  { role: "vice_principal", email: "demo-vice@rikaz.demo", name: "الوكيل" },
  { role: "dept_head", email: "demo-depthead@rikaz.demo", name: "رئيس قسم الرياضيات" },
  { role: "supervisor", email: "demo-supervisor@rikaz.demo", name: "المشرف التربوي" },
  { role: "student_affairs", email: "demo-affairs@rikaz.demo", name: "شؤون الطلاب" },
  { role: "teacher", email: "demo-teacher@rikaz.demo", name: "أ. خالد العتيبي" },
  { role: "guardian", email: "demo-guardian@rikaz.demo", name: "محمد الأحمد" },
  { role: "student", email: "demo-student@rikaz.demo", name: "سارة محمد" },
  { role: "counselor", email: "demo-counselor@rikaz.demo", name: "المرشد الطلابي" },
  { role: "nurse", email: "demo-nurse@rikaz.demo", name: "ممرض المدرسة" },
  { role: "security", email: "demo-security@rikaz.demo", name: "الأمن والاستقبال" },
  // Maintenance staff: membership role teacher + an owner-assigned permission template (scripts/seed-maint-demo.ts).
  { role: "teacher", email: "demo-maint-school@rikaz.demo", name: "مدير صيانة المدارس", label: "مدير صيانة المدارس", template: "مسؤول صيانة مدارس" },
  { role: "teacher", email: "demo-maint-bus@rikaz.demo", name: "مدير صيانة الباصات", label: "مدير صيانة الباصات", template: "مسؤول صيانة باصات" },
  { role: "teacher", email: "demo-follow-school@rikaz.demo", name: "متابعة صيانة المدارس", label: "متابعة صيانة المدارس", template: "مسؤول متابعة صيانة المدارس" },
  { role: "teacher", email: "demo-procurement@rikaz.demo", name: "مسؤول المشتريات", label: "مسؤول المشتريات", template: "مسؤول مشتريات" },
  { role: "teacher", email: "demo-follow-bus@rikaz.demo", name: "متابعة صيانة الباصات", label: "متابعة صيانة الباصات", template: "مسؤول متابعة صيانة الباصات" },
  { role: "teacher", email: "demo-admissions@rikaz.demo", name: "مسؤول القبول والتسجيل", label: "مسؤول القبول والتسجيل", template: "مسؤول القبول والتسجيل" },
];
