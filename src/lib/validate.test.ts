import { describe, expect, it } from "vitest";
import { returnPath } from "./validate";

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
