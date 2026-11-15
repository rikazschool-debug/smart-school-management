import { expect, it } from "vitest";
import { occasionsInMonth, type HealthOccasion } from "./calendar-model";
const row: HealthOccasion = { id: "1", title: "حملة", starts_on: "2026-10-01", ends_on: "2026-10-31", source_year: 2026, source_url: "https://www.moh.gov.sa", description: "", verified_at: "2026-11-15", recurrence_verified: false };
it("includes an entire official campaign month", () => expect(occasionsInMonth([row], 2026, 9)).toEqual([row]));
it("does not repeat an occasion in an unverified later year", () => expect(occasionsInMonth([row], 2027, 9)).toEqual([]));
it("excludes a campaign outside the month", () => expect(occasionsInMonth([row], 2026, 10)).toEqual([]));