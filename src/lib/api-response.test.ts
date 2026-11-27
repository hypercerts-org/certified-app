import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logError: vi.fn(),
}));

class MockSessionUnavailableError extends Error {}

vi.mock("@/lib/auth/dal", () => ({
  SessionUnavailableError: MockSessionUnavailableError,
}));
vi.mock("@/lib/log", () => ({ logError: mocks.logError }));

const { apiUnavailable } = await import("./api-response");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("apiUnavailable", () => {
  it("logs unexpected upstream failures and returns an uncached 503", async () => {
    const err = new Error("upstream down");
    const res = apiUnavailable("[api/test] failed", err, {
      error: "TestUnavailable",
      context: { id: "123" },
    });
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ error: "TestUnavailable" });
    expect(mocks.logError).toHaveBeenCalledWith("[api/test] failed", err, { id: "123" });
  });

  it("suppresses duplicate logging when the session store outage was already logged", async () => {
    const res = apiUnavailable("[api/test] failed", new MockSessionUnavailableError("valkey down"));
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({ error: "Unavailable" });
    expect(mocks.logError).not.toHaveBeenCalled();
  });
});
