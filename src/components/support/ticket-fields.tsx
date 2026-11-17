import { BookOpen, CalendarCheck, Wallet, Bus, Sparkles, HeartPulse, FileText, MessageSquareWarning, UserRound, Phone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectCls } from "@/components/ui/native-select";
import { SUPPORT_TOPICS, type TicketContact } from "./ticket-model";

const ICONS = [BookOpen, CalendarCheck, Wallet, Bus, Sparkles, HeartPulse, FileText, MessageSquareWarning];
export function TicketFields({ value, onChange, prefix }: { value: TicketContact; onChange: (v: TicketContact) => void; prefix: string }) {
  const topic = SUPPORT_TOPICS.find(t => t.id === value.topic);
  const Icon = ICONS[SUPPORT_TOPICS.findIndex(t => t.id === value.topic)] ?? FileText;
  return <div className="space-y-4 border-y py-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1"><Label htmlFor={`${prefix}-topic`}><Icon className="inline size-4" /> التصنيف الرئيسي</Label><select id={`${prefix}-topic`} className={selectCls()} value={value.topic} onChange={e => onChange({ ...value, topic: e.target.value, subtopic: "" })}><option value="">بدون تصنيف</option>{SUPPORT_TOPICS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor={`${prefix}-subtopic`}>التصنيف الفرعي</Label><select id={`${prefix}-subtopic`} className={selectCls()} value={value.subtopic} disabled={!topic} onChange={e => onChange({ ...value, subtopic: e.target.value })}><option value="">اختر التصنيف الفرعي</option>{topic?.children.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor={`${prefix}-contact-name`}><UserRound className="inline size-4" /> اسم صاحب التواصل</Label><Input id={`${prefix}-contact-name`} maxLength={100} autoComplete="off" value={value.contact_name} onChange={e => onChange({ ...value, contact_name: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor={`${prefix}-contact-phone`}><Phone className="inline size-4" /> رقم الهاتف</Label><Input id={`${prefix}-contact-phone`} type="tel" dir="ltr" maxLength={16} autoComplete="off" value={value.contact_phone} onChange={e => onChange({ ...value, contact_phone: e.target.value })} /></div>
    </div>
  </div>;
}