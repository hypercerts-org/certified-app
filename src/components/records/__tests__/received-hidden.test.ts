import { describe, it, expect } from "vitest"
import { isHiddenEndorsement } from "../received-endorsements"
import type { ReceivedEndorsement } from "@/hooks/use-received-endorsements"

const e = (uri: string, responseState: ReceivedEndorsement["responseState"]) =>
  ({ uri, responseState }) as ReceivedEndorsement

const states = (map: Record<string, "accepted" | "rejected" | "unknown">) =>
  ({ resolve: (uri: string) => ({ state: map[uri] ?? "unknown" }) }) as unknown as Parameters<
    typeof isHiddenEndorsement
  >[1]

describe("isHiddenEndorsement", () => {
  it("follows your own response once it is known", () => {
    expect(isHiddenEndorsement(e("a", null), states({ a: "rejected" }))).toBe(true)
    expect(isHiddenEndorsement(e("a", "rejected"), states({ a: "accepted" }))).toBe(false)
  })

  it("falls back to the stored state while your responses load", () => {
    expect(isHiddenEndorsement(e("a", "rejected"), states({}))).toBe(true)
    expect(isHiddenEndorsement(e("a", null), states({}))).toBe(false)
  })
})
