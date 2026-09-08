import { describe, expect, it } from "vitest";
import { inMorningPushWindow } from "../convex/refreshPolicy";

describe("inMorningPushWindow", () => {
  it("is false before 09:00 KST", () => {
    expect(inMorningPushWindow(8, 59)).toBe(false);
  });

  it("is true at 09:00 KST", () => {
    expect(inMorningPushWindow(9, 0)).toBe(true);
  });

  it("is true at 12:30 KST (last fetch attempt)", () => {
    expect(inMorningPushWindow(12, 30)).toBe(true);
  });

  it("is false after 12:30 KST", () => {
    expect(inMorningPushWindow(12, 31)).toBe(false);
  });

  it("is false in the evening", () => {
    expect(inMorningPushWindow(20, 0)).toBe(false);
  });
});
