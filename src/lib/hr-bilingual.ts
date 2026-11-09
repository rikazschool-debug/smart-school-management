// Arabic / English labels for the HR employee form, plus a display-only English hint for translatable values.
// The hint is never saved: the original Arabic value is stored and used (e.g. job title → login role mapping).
import { norm } from "@/lib/hr-fields";

/** English label per field key (form + profile fields). */
export const EN_LABEL: Record<string, string> = {
  employee_no: "Employee No.", full_name: "Full Official Name", name_en: "Full Name (English)", display_name: "Display Name",
  job_title: "Job Title", school: "Branch", department: "Department", team: "Team", manager: "Direct Manager",
  manager_name: "Direct Manager Name", manager_no: "Direct Manager No.", phone: "Mobile", login_phone: "Login Mobile",
  email: "Work Email", gender: "Gender", marital_status: "Marital Status", nationality: "Nationality", address: "Address",
  birth_date: "Date of Birth", national_id: "ID / Iqama No.", id_expiry: "ID Expiry Date", passport_no: "Passport No.",
  passport_expiry: "Passport Expiry Date", religion: "Religion", education: "Education", specialization: "Specialization",
  assignment_note: "Assignment", pay_method: "Payment Method", iban: "Bank IBAN", bank_name: "Bank Name",
  mid_iban: "Intermediary IBAN", mid_bank: "Intermediary Bank", mid_name: "Intermediary Name", mid_id: "Intermediary ID No.",
  sponsor_name: "Sponsor Name", sponsor_no: "Sponsor No.", category: "Job Category", hire_date: "Start Date",
  status: "Status", end_date: "End of Service Date", login_role: "Login Role", account: "Existing Account", teacher: "Linked Teacher Record",
};
/** «عربي / English» label; Arabic only when no English label is known. */
export const bi = (key: string, ar: string) => (EN_LABEL[key] ? `${ar} / ${EN_LABEL[key]}` : ar);

/** Fields whose values are never translated (names of people, contact, IDs, dates, numbers). */
const NO_HINT = new Set(["full_name", "name_en", "display_name", "manager", "manager_name", "manager_no", "employee_no", "phone", "login_phone", "email",
  "national_id", "passport_no", "iban", "mid_iban", "mid_id", "mid_name", "sponsor_name", "sponsor_no", "birth_date", "id_expiry", "passport_expiry", "hire_date", "end_date", "address"]);
export const hasHint = (key: string) => !NO_HINT.has(key);

const DICT: Record<string, string> = {
  // job titles
  "معلم": "Teacher", "معلمه": "Teacher", "مدير": "Manager", "مدير المدرسه": "School Principal", "مدير مدرسه": "School Principal", "مديره": "Manager",
  "وكيل": "Vice Principal", "وكيله": "Vice Principal", "وكيل المدرسه": "Vice Principal", "مرشد طلابي": "Student Counselor", "مرشده طلابيه": "Student Counselor",
  "مرشد": "Counselor", "مشرف": "Supervisor", "مشرفه": "Supervisor", "محاسب": "Accountant", "محاسبه": "Accountant", "سكرتير": "Secretary", "سكرتيره": "Secretary",
  "اداري": "Administrator", "اداريه": "Administrator", "مساعد اداري": "Administrative Assistant", "مساعده اداريه": "Administrative Assistant",
  "حارس": "Security Guard", "حارس امن": "Security Guard", "سائق": "Driver", "عامل": "Worker", "عامله": "Worker", "عامل نظافه": "Cleaner", "عامله نظافه": "Cleaner",
  "ممرض": "Nurse", "ممرضه": "Nurse", "امين مكتبه": "Librarian", "فني": "Technician", "فني صيانه": "Maintenance Technician", "مسؤول صيانه": "Maintenance Officer",
  "مسؤول مشتريات": "Procurement Officer", "مسؤول القبول والتسجيل": "Admissions Officer", "مدير الموارد البشريه": "HR Manager", "مدير اداره الموارد البشريه": "HR Director",
  "موارد بشريه": "Human Resources", "الموارد البشريه": "Human Resources", "رئيس قسم": "Head of Department", "منسق": "Coordinator", "منسقه": "Coordinator",
  "مدرب": "Trainer", "مدربه": "Trainer", "مالك المجموعه": "Group Owner", "مشرف نقل": "Transport Supervisor", "مسؤول حركه النقل": "Transport Officer",
  // marital status
  "اعزب": "Single", "عزباء": "Single", "متزوج": "Married", "متزوجه": "Married", "مطلق": "Divorced", "مطلقه": "Divorced", "ارمل": "Widowed", "ارمله": "Widowed",
  // gender / status
  "ذكر": "Male", "انثى": "Female", "انثي": "Female", "نشط": "Active", "موقوف": "Suspended", "منتهي": "Ended", "منتهيه الخدمه": "Ended",
  // nationality
  "سعودي": "Saudi", "سعوديه": "Saudi", "مصري": "Egyptian", "مصريه": "Egyptian", "اردني": "Jordanian", "اردنيه": "Jordanian", "سوداني": "Sudanese", "سودانيه": "Sudanese",
  "سوري": "Syrian", "سوريه": "Syrian", "يمني": "Yemeni", "يمنيه": "Yemeni", "فلسطيني": "Palestinian", "فلسطينيه": "Palestinian", "لبناني": "Lebanese", "لبنانيه": "Lebanese",
  "مغربي": "Moroccan", "مغربيه": "Moroccan", "تونسي": "Tunisian", "تونسيه": "Tunisian", "جزائري": "Algerian", "جزائريه": "Algerian", "عراقي": "Iraqi", "عراقيه": "Iraqi",
  "باكستاني": "Pakistani", "باكستانيه": "Pakistani", "هندي": "Indian", "هنديه": "Indian", "فلبيني": "Filipino", "فلبينيه": "Filipino", "بنغلاديشي": "Bangladeshi",
  // religion
  "مسلم": "Muslim", "مسلمه": "Muslim", "الاسلام": "Islam", "مسيحي": "Christian", "مسيحيه": "Christian",
  // education
  "بكالوريوس": "Bachelor's", "ماجستير": "Master's", "دكتوراه": "PhD", "دبلوم": "Diploma", "ثانوي": "High School", "ثانويه عامه": "High School", "متوسط": "Intermediate", "ابتدائي": "Primary",
  // specialization / department
  "رياضيات": "Mathematics", "الرياضيات": "Mathematics", "لغه عربيه": "Arabic Language", "اللغه العربيه": "Arabic Language", "لغه انجليزيه": "English Language",
  "اللغه الانجليزيه": "English Language", "علوم": "Science", "العلوم": "Science", "فيزياء": "Physics", "كيمياء": "Chemistry", "احياء": "Biology", "حاسب الي": "Computer Science",
  "الحاسب الالي": "Computer Science", "دراسات اسلاميه": "Islamic Studies", "الدراسات الاسلاميه": "Islamic Studies", "اجتماعيات": "Social Studies", "تربيه بدنيه": "Physical Education",
  "تربيه فنيه": "Art Education", "رياض اطفال": "Kindergarten", "محاسبه": "Accounting", "اداره اعمال": "Business Administration", "تعليم": "Education", "الاداره": "Administration",
  "الشؤون التعليميه": "Academic Affairs", "شؤون الطلاب": "Student Affairs", "الماليه": "Finance", "الصيانه": "Maintenance", "النقل": "Transport", "المشتريات": "Procurement",
  // payment / banks
  "تحويل بنكي": "Bank Transfer", "نقدي": "Cash", "نقدا": "Cash", "شيك": "Cheque", "مصرف الراجحي": "Al Rajhi Bank", "الراجحي": "Al Rajhi Bank", "البنك الاهلي": "Saudi National Bank",
  "الاهلي": "Saudi National Bank", "بنك الرياض": "Riyad Bank", "بنك البلاد": "Bank Albilad", "بنك الانماء": "Alinma Bank", "مصرف الانماء": "Alinma Bank", "البنك السعودي الفرنسي": "Banque Saudi Fransi",
  "البنك العربي الوطني": "Arab National Bank", "بنك الجزيره": "Bank AlJazira", "البنك السعودي للاستثمار": "Saudi Investment Bank", "ساب": "SAB",
};
const DN = new Map(Object.entries(DICT).map(([k, v]) => [norm(k), v]));

/** English display hint for a typed/selected Arabic value of a translatable field; "" when none (never guessed). */
export function enHint(key: string, value: string | null | undefined): string {
  if (!value || !hasHint(key)) return "";
  const n = norm(value);
  if (!n || !/[\u0600-\u06FF]/.test(n)) return "";
  return DN.get(n) ?? DN.get(n.replace(/^ال/, "")) ?? "";
}
