export const HALL_PREFS = ["both", "peony", "azilea"] as const;
export type HallPref = (typeof HALL_PREFS)[number];
export type HallId = "peony" | "azilea";

export const DEFAULT_HALL_PREF: HallPref = "both";

export const HALL_PEONY_CALLBACK = "hall_peony";
export const HALL_AZILEA_CALLBACK = "hall_azilea";

export function isHallPref(value: string): value is HallPref {
  return (HALL_PREFS as readonly string[]).includes(value);
}

/** Missing or unknown stored values mean both halls. */
export function parseHallPref(value: string | null | undefined): HallPref {
  if (value && isHallPref(value)) return value;
  return DEFAULT_HALL_PREF;
}

export function includesHall(pref: HallPref, hall: HallId): boolean {
  return pref === "both" || pref === hall;
}

export function hallCallback(hall: HallId): string {
  return hall === "peony" ? HALL_PEONY_CALLBACK : HALL_AZILEA_CALLBACK;
}

export function hallFromCallback(data: string | undefined): HallId | null {
  if (data === HALL_PEONY_CALLBACK) return "peony";
  if (data === HALL_AZILEA_CALLBACK) return "azilea";
  return null;
}

/**
 * Flip one hall. Turning the last remaining hall off is rejected so the
 * menu is never empty.
 */
export function toggleHall(
  pref: HallPref,
  hall: HallId,
): { pref: HallPref; changed: boolean } {
  const peonyOn = includesHall(pref, "peony");
  const azileaOn = includesHall(pref, "azilea");
  const nextPeony = hall === "peony" ? !peonyOn : peonyOn;
  const nextAzilea = hall === "azilea" ? !azileaOn : azileaOn;
  if (!nextPeony && !nextAzilea) {
    return { pref, changed: false };
  }
  const next: HallPref =
    nextPeony && nextAzilea ? "both" : nextPeony ? "peony" : "azilea";
  return { pref: next, changed: next !== pref };
}
