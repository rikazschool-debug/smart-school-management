import type { Role } from "./roles";

// Demo accounts for the development preview only (the login buttons are hidden in production builds).
export const DEMO_PASSWORD = "Demo-Rikaz-2026";

export const DEMO_ACCOUNTS: { role: Role; email: string; name: string }[] = [
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
];
