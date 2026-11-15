import { describe, expect, it } from "vitest";
import { filterPeople, insertMention, mentionQuery, splitMentions } from "@/lib/mentions";

const people = [{ user_id: "1", full_name: "أحمد علي" }, { user_id: "2", full_name: "سارة محمد" }, { user_id: "me", full_name: "أنا" }];
describe("mentions", () => {
  it("typing @ opens the list", () => expect(mentionQuery("مرحبا @", 7)).toEqual({ start: 6, q: "" }));
  it("@ inside a word (email) does not open", () => expect(mentionQuery("a@b", 3)).toBeNull());
  it("lists only conversation people, not me, matching the query", () => {
    expect(filterPeople(people, "", "me").map((p) => p.user_id)).toEqual(["1", "2"]);
    expect(filterPeople(people, "احمد", "me").map((p) => p.user_id)).toEqual(["1"]);
  });
  it("picking inserts @name", () => expect(insertMention("hi @اح", { start: 3 }, 6, "أحمد علي").body).toBe("hi @أحمد علي "));
  it("known mentions are highlighted", () => expect(splitMentions("شكرا @أحمد علي!", ["أحمد علي"])).toEqual([{ t: "شكرا ", m: false }, { t: "@أحمد علي", m: true }, { t: "!", m: false }]));
});
