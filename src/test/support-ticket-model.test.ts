import { describe, expect, it } from "vitest";
import { contactSchema, SUPPORT_TOPICS } from "@/components/support/ticket-model";
describe("support ticket contact and classification", () => {
  it.each(SUPPORT_TOPICS)("accepts every child of $id", topic => {
    for (const subtopic of topic.children) expect(contactSchema.safeParse({ contact_name: "صاحب التواصل", contact_phone: "0500000000", topic: topic.id, subtopic }).success).toBe(true);
  });
  it("rejects a child belonging to a different parent", () => expect(contactSchema.safeParse({ contact_name: "", contact_phone: "", topic: "academic", subtopic: "طلب خروج مبكر" }).success).toBe(false));
  it("rejects selecting a parent without a child", () => expect(contactSchema.safeParse({ contact_name: "", contact_phone: "", topic: "academic", subtopic: "" }).success).toBe(false));
  it("validates phone rather than accepting arbitrary text", () => expect(contactSchema.safeParse({ contact_name: "", contact_phone: "javascript:alert(1)", topic: "", subtopic: "" }).success).toBe(false));
  it("keeps unclassified tickets and optional contact compatible", () => expect(contactSchema.safeParse({ contact_name: "", contact_phone: "", topic: "", subtopic: "" }).success).toBe(true));
});