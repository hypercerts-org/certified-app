import { describe, expect, it } from "vitest";
import { isRkey, returnPath } from "./validate";

describe("isRkey", () => {
  it("accepts valid AT Protocol record keys and rejects dot segments and invalid characters", () => {
    expect(isRkey("3msind56wn22t")).toBe(true);
    expect(isRkey("self")).toBe(true);
    expect(isRkey("a_b:c~d-e.f")).toBe(true);
    for (const bad of ["", ".", "..", "a/b", "a b", "x".repeat(513)]) {
      expect(isRkey(bad)).toBe(false);
    }
  });
});

describe("returnPath", () => {
  it("keeps paths on this site", () => {
    expect(returnPath("/did:plc:abc/edit")).toBe("/did:plc:abc/edit");
    expect(returnPath("/explore?q=earth")).toBe("/explore?q=earth");
  });

  it("refuses anything a browser could resolve to another origin", () => {
    for (const value of [
      "//evil.example",
      "/\\evil.example",
      "https://evil.example",
      "evil",
      "",
      42,
    ]) {
      expect(returnPath(value)).toBe("/");
    }
  });
});
