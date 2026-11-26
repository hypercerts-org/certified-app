import { describe, expect, it } from "vitest";
import { goRow, mergeAccounts, normalize, rank, relevance, type SearchRow } from "./search";

const row = (id: string): SearchRow => ({
  id,
  kind: "account",
  href: `/${id}`,
  title: id,
  meta: null,
  imageUrl: null,
  round: true,
});

describe("relevance", () => {
  it("orders exact, prefix, word, contains, then description matches", () => {
    expect(relevance("forest", "Forest")).toBe(5);
    expect(relevance("forest", "Forest restoration")).toBe(4);
    expect(relevance("forest", "Kenya forest corridor")).toBe(3);
    expect(relevance("forest", "Rainforests")).toBe(2);
    expect(relevance("forest", "Mangroves", "Next to the forest")).toBe(1);
    expect(relevance("forest", "Mangroves", "Coastline")).toBe(0);
  });

  it("folds accents and case", () => {
    expect(normalize("  Bioacústico  Sur ")).toBe("bioacustico sur");
    expect(relevance("bioacustico", "Bioacústico")).toBe(5);
  });
});

describe("rank", () => {
  it("puts the best match first and keeps newest-first among equals", () => {
    const items = ["Old rainforest", "Forest", "New rainforest", "Unrelated"];
    expect(rank("forest", items, (t) => ({ primary: t }))).toEqual([
      "Forest",
      "Old rainforest",
      "New rainforest",
      "Unrelated",
    ]);
  });
});

describe("mergeAccounts", () => {
  it("lists Certified accounts first and Bluesky ones only once", () => {
    const merged = mergeAccounts(
      [row("a"), row("b")],
      [
        { ...row("b-bsky"), did: "did:b" },
        { ...row("c"), did: "did:c" },
      ],
      new Set(["did:a", "did:b"]),
    );
    expect(merged.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("goRow", () => {
  it("leads a handle, a DID, a record address and a Certified link to their pages", () => {
    expect(goRow("@maearth.com")?.href).toBe("/maearth.com");
    expect(goRow("did:plc:abc123")?.href).toBe("/did:plc:abc123");
    expect(goRow("at://did:plc:abc123/org.hypercerts.claim.activity/3k2a")?.href).toBe(
      "/did:plc:abc123/activity/3k2a",
    );
    expect(goRow("https://certified.app/maearth.com/project/3k2a")?.href).toBe(
      "/maearth.com/project/3k2a",
    );
  });

  it("leaves plain words alone", () => {
    expect(goRow("forest")).toBeNull();
    expect(goRow("solar power")).toBeNull();
  });
});
