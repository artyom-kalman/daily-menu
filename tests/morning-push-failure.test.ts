import { afterEach, describe, expect, it, vi } from "vitest";
import { runMorningPush } from "../convex/morningPushRun";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runMorningPush", () => {
  it("resolves when runPush succeeds", async () => {
    const sendAlert = vi.fn(async () => {});
    await expect(
      runMorningPush(async () => undefined, sendAlert),
    ).resolves.toBeUndefined();
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it("rejects after logging when runPush fails (does not swallow)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sendAlert = vi.fn(async (_text: string) => {});
    const boom = new Error("telegram down");

    await expect(
      runMorningPush(async () => {
        throw boom;
      }, sendAlert),
    ).rejects.toBe(boom);

    expect(errorSpy).toHaveBeenCalledWith("morning push failed: telegram down");
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert.mock.calls[0]?.[0]).toContain("telegram down");
  });

  it("still rejects the original error if the admin alert fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new Error("push failed");

    await expect(
      runMorningPush(
        async () => {
          throw boom;
        },
        async () => {
          throw new Error("alert failed");
        },
      ),
    ).rejects.toBe(boom);
  });
});
