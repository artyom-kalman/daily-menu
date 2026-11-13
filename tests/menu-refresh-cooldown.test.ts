import { describe, expect, it } from "vitest";
import { canRequestStudentRefresh } from "../convex/refreshPolicy";

const now = Date.parse("2026-11-13T04:00:00Z");

describe("background menu refresh cooldown", () => {
  it("allows the first refresh when the existing config has no timestamp", () => {
    expect(canRequestStudentRefresh(undefined, now)).toBe(true);
  });

  it("rejects repeated requests throughout the five-minute cooldown", () => {
    expect(canRequestStudentRefresh(now, now)).toBe(false);
    expect(canRequestStudentRefresh(now, now + 1)).toBe(false);
    expect(canRequestStudentRefresh(now, now + 299_999)).toBe(false);
  });

  it("allows recovery again at the five-minute boundary", () => {
    expect(canRequestStudentRefresh(now, now + 300_000)).toBe(true);
    expect(canRequestStudentRefresh(now, now + 300_001)).toBe(true);
  });
});
