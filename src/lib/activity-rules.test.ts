import { describe, expect, it } from "vitest";
import { datesInOrder, isShare, looksLikeHandle } from "./activity-rules";
import { characters } from "./form-rules";

describe("activity rules", () => {
  it("counts characters as a reader does", () => {
    expect(characters("café")).toBe(4);
    expect(characters("👩‍🌾 farm")).toBe(6);
  });

  it("accepts a share above zero only", () => {
    expect(isShare("1")).toBe(true);
    expect(isShare("0.25")).toBe(true);
    expect(isShare("0")).toBe(false);
    expect(isShare("-1")).toBe(false);
    expect(isShare("1,5")).toBe(false);
  });

  it("tells a handle from a name", () => {
    expect(looksLikeHandle("alice.bsky.social")).toBe(true);
    expect(looksLikeHandle("@alice.bsky.social")).toBe(true);
    expect(looksLikeHandle("Village volunteers")).toBe(false);
    expect(looksLikeHandle("Dr. Smith")).toBe(false);
  });

  it("keeps the end on or after the start", () => {
    expect(datesInOrder("2026-01-01", "2026-01-01")).toBe(true);
    expect(datesInOrder("2026-02-01", "2026-01-01")).toBe(false);
    expect(datesInOrder("", "2026-01-01")).toBe(true);
  });
});
