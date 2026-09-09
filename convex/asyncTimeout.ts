/** Reject a hanging promise so a batch can continue past a stalled await. */

export class TimeoutError extends Error {
  override name = "TimeoutError";
  constructor(message: string) {
    super(message);
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message = `timed out after ${ms}ms`,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(message));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export function abortSignalForTimeout(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

export function isTimeoutError(err: unknown): boolean {
  const e = err as { name?: string; message?: string };
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return true;
  return typeof e?.message === "string" && /timed out|timeout|aborted/i.test(e.message);
}
