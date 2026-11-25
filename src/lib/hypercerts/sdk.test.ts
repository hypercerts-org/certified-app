import {
  PartialWriteError,
  WriteOutcomeUnknownError,
  WriteRejectedError,
  WriteResultMismatchError,
} from "@hypercerts-org/sdk/social";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertWritesAllowed } from "@/lib/atproto/app-key";
import { SessionUnavailableError } from "@/lib/auth/dal";
import { writeFailure } from "./sdk";

vi.mock("server-only", () => ({}));
const logError = vi.fn();
vi.mock("@/lib/log", () => ({ logError: (...args: unknown[]) => logError(...args) }));

afterEach(() => {
  vi.unstubAllEnvs();
  logError.mockClear();
});

describe("writeFailure", () => {
  it("classifies unknown, partial, and result-mismatch errors as unknown and logs them", () => {
    expect(writeFailure(new WriteOutcomeUnknownError("op", []), "op")).toBe("unknown");
    expect(
      writeFailure(
        new PartialWriteError("op", {
          written: [],
          failed: { uri: "at://did:plc:x/col/1", cid: "bafy1" },
          failure: new Error("502"),
          notAttempted: [],
        }),
        "op",
      ),
    ).toBe("unknown");
    expect(writeFailure(new WriteResultMismatchError("op", [], []), "op")).toBe("unknown");
    expect(logError).toHaveBeenCalledTimes(3);
  });

  it("maps WriteRejectedError statuses accurately (401/403 forbidden, 408/429/InvalidSwap unavailable, 4xx invalid)", () => {
    expect(
      writeFailure(new WriteRejectedError("op", [], { status: 401, code: undefined }), "op"),
    ).toBe("forbidden");
    expect(
      writeFailure(new WriteRejectedError("op", [], { status: 403, code: undefined }), "op"),
    ).toBe("forbidden");
    expect(
      writeFailure(new WriteRejectedError("op", [], { status: 408, code: undefined }), "op"),
    ).toBe("unavailable");
    expect(
      writeFailure(new WriteRejectedError("op", [], { status: 429, code: undefined }), "op"),
    ).toBe("unavailable");
    expect(
      writeFailure(new WriteRejectedError("op", [], { status: 400, code: "InvalidSwap" }), "op"),
    ).toBe("unavailable");
    expect(
      writeFailure(new WriteRejectedError("op", [], { status: 400, code: "InvalidRecord" }), "op"),
    ).toBe("invalid");
  });

  it("maps TypeError to invalid, SessionUnavailableError to unavailable without logging, and logs unexpected errors", () => {
    expect(writeFailure(new TypeError("bad input"), "op")).toBe("invalid");
    expect(logError).not.toHaveBeenCalled();

    expect(writeFailure(new SessionUnavailableError(), "op")).toBe("unavailable");
    expect(logError).not.toHaveBeenCalled();

    expect(writeFailure(new Error("unexpected"), "op")).toBe("unavailable");
    expect(logError).toHaveBeenCalledTimes(1);
  });
});

describe("assertWritesAllowed", () => {
  it("blocks writes on Vercel preview deployments and *.vercel.app hosts", () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(() => assertWritesAllowed()).toThrow(/Preview deployments/);

    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("PUBLIC_URL", "https://certified-app-git-v2.vercel.app");
    expect(() => assertWritesAllowed()).toThrow(/preview host/);
  });

  it("allows loopback development and canonical https PUBLIC_URL", () => {
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("PUBLIC_URL", "");
    expect(() => assertWritesAllowed()).not.toThrow();

    vi.stubEnv("PUBLIC_URL", "https://certified.app");
    expect(() => assertWritesAllowed()).not.toThrow();
  });
});
