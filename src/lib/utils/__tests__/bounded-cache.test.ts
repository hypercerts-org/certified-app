import { describe, it, expect } from "vitest"
import { createBoundedCache } from "../bounded-cache"

describe("createBoundedCache", () => {
  it("behaves as a normal Map below the cap", () => {
    const cache = createBoundedCache<string, number>(3)
    cache.set("a", 1)
    cache.set("b", 2)
    expect(cache.size).toBe(2)
    expect(cache.get("a")).toBe(1)
    expect(cache.get("b")).toBe(2)
    expect(cache.has("a")).toBe(true)
  })

  it("evicts the oldest (first-inserted) key when a new key overflows the cap", () => {
    const cache = createBoundedCache<string, number>(3)
    cache.set("a", 1)
    cache.set("b", 2)
    cache.set("c", 3)
    expect(cache.size).toBe(3)
    // Inserting a 4th distinct key evicts the oldest, "a".
    cache.set("d", 4)
    expect(cache.size).toBe(3)
    expect(cache.has("a")).toBe(false)
    expect([...cache.keys()]).toEqual(["b", "c", "d"])
  })

  it("evicts in insertion order across repeated overflow", () => {
    const cache = createBoundedCache<string, number>(2)
    cache.set("a", 1)
    cache.set("b", 2)
    cache.set("c", 3) // evicts "a"
    cache.set("d", 4) // evicts "b"
    expect([...cache.keys()]).toEqual(["c", "d"])
    expect(cache.has("a")).toBe(false)
    expect(cache.has("b")).toBe(false)
  })

  it("does not evict when updating an existing key at the cap", () => {
    const cache = createBoundedCache<string, number>(2)
    cache.set("a", 1)
    cache.set("b", 2)
    // "a" already present: this is an update, not a new key, so no eviction.
    cache.set("a", 99)
    expect(cache.size).toBe(2)
    expect(cache.get("a")).toBe(99)
    expect(cache.has("b")).toBe(true)
    expect([...cache.keys()]).toEqual(["a", "b"])
  })

  it("defaults the cap to 500 entries", () => {
    const cache = createBoundedCache<number, number>()
    for (let i = 0; i < 600; i++) cache.set(i, i)
    expect(cache.size).toBe(500)
    // The first 100 keys (0..99) were evicted; 100..599 remain.
    expect(cache.has(0)).toBe(false)
    expect(cache.has(99)).toBe(false)
    expect(cache.has(100)).toBe(true)
    expect(cache.has(599)).toBe(true)
  })

  it("returns the map from set so chaining-style usage keeps working", () => {
    const cache = createBoundedCache<string, number>(2)
    expect(cache.set("a", 1)).toBe(cache)
  })
})
