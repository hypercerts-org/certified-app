import { describe, it, expect } from "vitest"
import {
  buildVariables,
  parseRecipients,
  selectQuery,
  OPERATIONS,
  AGGREGATED_OPERATIONS,
  MAX_RECIPIENTS,
} from "../operations"

const DID_A = "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa"
const DID_B = "did:plc:bbbbbbbbbbbbbbbbbbbbbbbb"

describe("notifications operations — flag OFF (default / production)", () => {
  const OFF = false

  it("parseRecipients always returns null, even with valid DIDs", () => {
    expect(parseRecipients([DID_A, DID_B], OFF)).toBeNull()
  })

  it("buildVariables(notifications) never includes recipients", () => {
    const v = buildVariables("notifications", { first: 10, recipients: [DID_A] }, OFF)
    expect(v).toEqual({ first: 10, after: null })
    expect(v).not.toHaveProperty("recipients")
  })

  it("buildVariables(unreadNotificationCount) is empty", () => {
    expect(buildVariables("unreadNotificationCount", { recipients: [DID_A] }, OFF)).toEqual({})
  })

  it("selectQuery picks the BASE (non-recipients) query", () => {
    const v = buildVariables("notifications", { first: 10, recipients: [DID_A] }, OFF)!
    expect(selectQuery("notifications", v)).toBe(OPERATIONS.notifications)
    expect(selectQuery("notifications", v)).not.toContain("recipients")
  })
})

describe("notifications operations — flag ON", () => {
  const ON = true

  it("parseRecipients keeps valid DIDs, deduped + capped", () => {
    expect(parseRecipients([DID_A, DID_A, DID_B], ON)).toEqual([DID_A, DID_B])
    // did:plc identifiers are 24 chars of base32 [a-z2-7]; vary two
    // positions so the generated set is both valid and distinct.
    const b32 = "abcdefghijklmnopqrstuvwxyz234567"
    const many = Array.from(
      { length: MAX_RECIPIENTS + 5 },
      (_, i) => `did:plc:${"a".repeat(22)}${b32[i % 32]}${b32[Math.floor(i / 32) % 32]}`,
    )
    expect(parseRecipients(many, ON)).toHaveLength(MAX_RECIPIENTS)
  })

  it("parseRecipients rejects malformed DIDs and non-strings", () => {
    expect(parseRecipients(["not-a-did", 42, null, "did:bogus"], ON)).toBeNull()
  })

  it("parseRecipients returns null for an empty array", () => {
    expect(parseRecipients([], ON)).toBeNull()
  })

  it("buildVariables(notifications) includes recipients when present", () => {
    const v = buildVariables("notifications", { first: 5, recipients: [DID_A, DID_B] }, ON)
    expect(v).toEqual({ first: 5, after: null, recipients: [DID_A, DID_B] })
  })

  it("buildVariables omits recipients when none survive validation", () => {
    const v = buildVariables("notifications", { first: 5, recipients: ["bad"] }, ON)
    expect(v).not.toHaveProperty("recipients")
  })

  it("selectQuery picks the AGGREGATED variant once recipients are present", () => {
    const v = buildVariables("notifications", { first: 5, recipients: [DID_A] }, ON)!
    expect(selectQuery("notifications", v)).toBe(AGGREGATED_OPERATIONS.notifications)
    expect(selectQuery("notifications", v)).toContain("recipient")
  })

  it("clamps first to [1,100]", () => {
    expect(buildVariables("notifications", { first: 9999 }, ON)).toMatchObject({ first: 100 })
    expect(buildVariables("notifications", { first: -3 }, ON)).toMatchObject({ first: 1 })
  })
})
