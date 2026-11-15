import { describe, expect, it } from "vitest"
import { formatGift } from "../format"

describe("formatGift", () => {
  it("reads a dollar gift like the totals: no cents when there are none", () => {
    expect(formatGift("50.00", "USD")).toBe("$50")
    expect(formatGift("1250", "usd")).toBe("$1,250")
    expect(formatGift("5.5", "USD")).toBe("$5.50")
  })

  it("keeps another currency's code", () => {
    expect(formatGift("12.5", "USDC")).toBe("12.5 USDC")
    expect(formatGift("0.0021", "ETH")).toBe("0.0021 ETH")
  })

  it("shows a bare number without a currency, and nothing for no number", () => {
    expect(formatGift("20", null)).toBe("20")
    expect(formatGift("abc", "USD")).toBeNull()
    expect(formatGift(null, "USD")).toBeNull()
  })
})
