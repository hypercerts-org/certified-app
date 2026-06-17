import { describe, it, expect } from "vitest"
import {
  normalizeText,
  tokenize,
  lexicalRelevance,
  totalBoost,
  scoreCandidate,
  rankBy,
  dedupeBy,
  mergePeopleByDid,
  MIN_QUERY_LEN,
  MAX_TOTAL_BOOST,
  type RankInput,
} from "../rank"

describe("normalizeText", () => {
  it("folds diacritics and lowercases", () => {
    expect(normalizeText("Bioacústico")).toBe("bioacustico")
    expect(normalizeText("MONITOREO de Aves")).toBe("monitoreo de aves")
  })
  it("collapses whitespace and trims", () => {
    expect(normalizeText("  the   hearth  ")).toBe("the hearth")
  })
})

describe("tokenize", () => {
  it("splits on punctuation and whitespace", () => {
    expect(tokenize("Floofy Clarke, PhD")).toEqual(["floofy", "clarke", "phd"])
  })
  it("returns a single token for no-whitespace scripts", () => {
    expect(tokenize("シモクラシー")).toHaveLength(1)
  })
  it("returns [] for empty/punctuation-only", () => {
    expect(tokenize("   ")).toEqual([])
    expect(tokenize("—")).toEqual([])
  })
})

describe("lexicalRelevance", () => {
  it("scores an exact primary match 1.0", () => {
    expect(lexicalRelevance("Floofy Clarke", "Floofy Clarke")).toBe(1)
  })
  it("is accent-insensitive", () => {
    expect(lexicalRelevance("bioacustico", "Bioacústico")).toBe(1)
  })
  it("scores a contiguous primary prefix at least 0.85", () => {
    // "edgewood" is a prefix of "Edgewood Labs" but not a multi-token
    // reorder, so this isolates the prefix signal.
    expect(lexicalRelevance("edgewood", "Edgewood Labs")).toBeGreaterThanOrEqual(0.85)
  })
  it("scores last-name-only and reordered tokens as word-prefix 0.9", () => {
    expect(lexicalRelevance("clarke", "Floofy Clarke")).toBeCloseTo(0.9)
    expect(lexicalRelevance("clarke floofy", "Floofy Clarke")).toBeCloseTo(0.9)
  })
  it("ranks an exact-name person above a cert that only mentions the term in its description", () => {
    const person = lexicalRelevance("hearth", "The Hearth")
    const cert = lexicalRelevance(
      "hearth",
      "Traveling Documentary Project",
      "we gather around the hearth to share stories",
    )
    expect(person).toBeGreaterThan(cert)
  })
  it("weights secondary-field overlap below primary", () => {
    const secondaryOnly = lexicalRelevance("governance", "Some Title", "live governance workflows")
    expect(secondaryOnly).toBeGreaterThan(0)
    expect(secondaryOnly).toBeLessThanOrEqual(0.3)
  })
  it("returns 0 for no match and empty query", () => {
    expect(lexicalRelevance("zzz", "Floofy Clarke")).toBe(0)
    expect(lexicalRelevance("", "Floofy Clarke")).toBe(0)
  })
})

describe("totalBoost", () => {
  it("sums and clamps to MAX_TOTAL_BOOST", () => {
    expect(totalBoost({ owner: 0.05, quality: 0.1 })).toBeCloseTo(0.15)
    expect(totalBoost({ owner: 0.05, quality: 0.5 })).toBe(MAX_TOTAL_BOOST)
    expect(totalBoost(undefined)).toBe(0)
  })
})

describe("scoreCandidate", () => {
  it("prefers serverScore over lexical when present", () => {
    const input: RankInput = { primary: "irrelevant", serverScore: 0.42 }
    expect(scoreCandidate("anything", input)).toBeCloseTo(0.42)
  })
  it("boosts never let a weak lexical match jump a strong one", () => {
    // substring (0.3) + max boost (0.15) = 0.45 must stay below a clean
    // word-prefix (0.9) with no boost.
    const weakBoosted = scoreCandidate("clarke", {
      primary: "declarke holdings",
      boosts: { owner: 0.05, quality: 0.1 },
    })
    const strong = scoreCandidate("clarke", { primary: "Floofy Clarke" })
    expect(strong).toBeGreaterThan(weakBoosted)
  })
})

describe("rankBy", () => {
  const items = [
    { id: "a", title: "Restore Rainforest" },
    { id: "b", title: "Simocracy at Edge" },
    { id: "c", title: "Simocracy 3D Print" },
  ]
  it("re-orders by relevance, descending", () => {
    const ranked = rankBy("simocracy", items, (i) => ({ primary: i.title }))
    expect(ranked.map((i) => i.id).slice(0, 2)).toEqual(["b", "c"])
    expect(ranked[2].id).toBe("a")
  })
  it("preserves server order for queries below MIN_QUERY_LEN", () => {
    expect("s".length).toBeLessThan(MIN_QUERY_LEN)
    const ranked = rankBy("s", items, (i) => ({ primary: i.title }))
    expect(ranked.map((i) => i.id)).toEqual(["a", "b", "c"])
  })
  it("is stable for ties (keeps original order)", () => {
    const tied = [
      { id: "x", title: "Edge" },
      { id: "y", title: "Edge" },
    ]
    const ranked = rankBy("edge", tied, (i) => ({ primary: i.title }))
    expect(ranked.map((i) => i.id)).toEqual(["x", "y"])
  })
})

describe("dedupeBy", () => {
  it("keeps the first occurrence per key", () => {
    const rows = [
      { uri: "at://1", n: 1 },
      { uri: "at://2", n: 2 },
      { uri: "at://1", n: 3 },
    ]
    expect(dedupeBy(rows, (r) => r.uri).map((r) => r.n)).toEqual([1, 2])
  })
})

describe("mergePeopleByDid", () => {
  // Both sources are normalized to one Actor shape before merge, so the
  // two arrays share a type (handle/description optional on each).
  interface Person {
    did: string
    displayName: string
    handle?: string
    description?: string
  }
  it("unions fields across sources (handle from one, bio from the other)", () => {
    const certified: Person[] = [
      { did: "did:plc:a", displayName: "Alice", description: "eco" },
    ]
    const bsky: Person[] = [
      { did: "did:plc:a", displayName: "Alice", handle: "alice.eco" },
    ]
    const merged = mergePeopleByDid(certified, bsky)
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({
      did: "did:plc:a",
      displayName: "Alice",
      description: "eco",
      handle: "alice.eco",
    })
  })
  it("appends DIDs only present in the secondary source, preserving order", () => {
    const certified: Person[] = [{ did: "did:plc:a", displayName: "Alice" }]
    const bsky: Person[] = [
      { did: "did:plc:a", displayName: "Alice", handle: "alice.eco" },
      { did: "did:plc:b", displayName: "Bob", handle: "bob.eco" },
    ]
    const merged = mergePeopleByDid(certified, bsky)
    expect(merged.map((m) => m.did)).toEqual(["did:plc:a", "did:plc:b"])
  })
  it("earlier source wins on a non-empty conflict", () => {
    const certified: Person[] = [
      { did: "did:plc:a", displayName: "Certified Name" },
    ]
    const bsky: Person[] = [{ did: "did:plc:a", displayName: "Bsky Name" }]
    expect(mergePeopleByDid(certified, bsky)[0].displayName).toBe("Certified Name")
  })
})
