import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { waitForIndex } = await import("./index-wait");

afterEach(() => vi.useRealTimers());

describe("waitForIndex", () => {
  it("resolves true once the index shows the write", async () => {
    vi.useFakeTimers();
    let checks = 0;
    const done = waitForIndex(async () => ++checks === 3);
    await vi.runAllTimersAsync();
    expect(await done).toBe(true);
    expect(checks).toBe(3);
  });

  it("gives up after about 3 seconds", async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const done = waitForIndex(async () => false);
    await vi.runAllTimersAsync();
    expect(await done).toBe(false);
    expect(Date.now() - start).toBeLessThanOrEqual(3_000);
  });

  it("treats a failing check as not yet", async () => {
    vi.useFakeTimers();
    let checks = 0;
    const done = waitForIndex(async () => {
      if (++checks === 1) throw new Error("index unavailable");
      return true;
    });
    await vi.runAllTimersAsync();
    expect(await done).toBe(true);
  });
});
