import { describe, expect, it } from "vitest";
import { setHallsWrite } from "../convex/chatPrefsPolicy";
import {
  DEFAULT_HALL_PREF,
  HALL_AZILEA_CALLBACK,
  HALL_PEONY_CALLBACK,
  hallCallback,
  hallFromCallback,
  includesHall,
  parseHallPref,
  toggleHall,
} from "../convex/halls";

describe("hall preference helpers", () => {
  it("treats missing and unknown values as both", () => {
    expect(parseHallPref(null)).toBe(DEFAULT_HALL_PREF);
    expect(parseHallPref(undefined)).toBe("both");
    expect(parseHallPref("")).toBe("both");
    expect(parseHallPref("kitchen")).toBe("both");
    expect(parseHallPref("peony")).toBe("peony");
    expect(parseHallPref("azilea")).toBe("azilea");
    expect(parseHallPref("both")).toBe("both");
  });

  it("parses hall callbacks", () => {
    expect(hallFromCallback(hallCallback("peony"))).toBe("peony");
    expect(hallFromCallback(hallCallback("azilea"))).toBe("azilea");
    expect(hallFromCallback(HALL_PEONY_CALLBACK)).toBe("peony");
    expect(hallFromCallback(HALL_AZILEA_CALLBACK)).toBe("azilea");
    expect(hallFromCallback("today_menu")).toBe(null);
  });

  it("toggles one hall and refuses an empty selection", () => {
    expect(toggleHall("both", "azilea")).toEqual({
      pref: "peony",
      changed: true,
    });
    expect(toggleHall("both", "peony")).toEqual({
      pref: "azilea",
      changed: true,
    });
    expect(toggleHall("peony", "azilea")).toEqual({
      pref: "both",
      changed: true,
    });
    expect(toggleHall("peony", "peony")).toEqual({
      pref: "peony",
      changed: false,
    });
    expect(toggleHall("azilea", "azilea")).toEqual({
      pref: "azilea",
      changed: false,
    });
    expect(includesHall("peony", "peony")).toBe(true);
    expect(includesHall("peony", "azilea")).toBe(false);
    expect(includesHall("both", "azilea")).toBe(true);
  });

  it("writes halls onto a new or existing chatPrefs row", () => {
    expect(setHallsWrite(null, "peony", 1000)).toEqual({
      created: true,
      halls: "peony",
      insert: {
        locale: "ru",
        halls: "peony",
        createdAt: 1000,
        updatedAt: 1000,
      },
    });
    expect(setHallsWrite({ locale: "en", halls: "both" }, "azilea", 2000)).toEqual(
      {
        created: false,
        halls: "azilea",
        patch: { halls: "azilea", updatedAt: 2000 },
      },
    );
  });
});
