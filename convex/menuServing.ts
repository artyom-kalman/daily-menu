import { kstHourMinuteFromMs } from "./dates";
import {
  isFreshForServing,
  isWaitingForTodaysMenu,
  type MenuSource,
} from "./refreshPolicy";
import type { Dish } from "./types";

type CachedMenu = {
  date: string;
  source: MenuSource;
  dishes: Dish[];
  fetchedAt: number;
} | null;

type TodaySnapshot = { date: string; peony: CachedMenu; azilea: CachedMenu };

export async function getCachedTodayMenus(deps: {
  readToday: () => Promise<TodaySnapshot>;
  requestRefresh: () => Promise<unknown>;
  nowMs?: number;
}): Promise<TodaySnapshot> {
  const stored = await deps.readToday();
  const { hour, minute } = kstHourMinuteFromMs(deps.nowMs ?? Date.now());
  if (isWaitingForTodaysMenu({ ...stored, hour, minute })) return stored;
  if (isFreshForServing(stored.peony) && isFreshForServing(stored.azilea))
    return stored;

  try {
    await deps.requestRefresh();
  } catch (err) {
    console.error(`Could not schedule menu refresh: ${(err as Error).message}`);
  }
  return stored;
}
