import { describe, expect, it } from "vitest";
import { isReviewHost } from "./review-host";
describe("demo accounts visibility", () => {
  it("shown in preview", () => expect(isReviewHost("id-preview--45bfe8fb-92a3-482f-bb8a-47942fa599de.lovable.app")).toBe(true));
  it("hidden on the published site", () => expect(isReviewHost("kalmalki.lovable.app")).toBe(false));
});
