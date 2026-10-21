import React from "react"
import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"

const created: Array<{ amount: string }> = []

vi.mock("@/lib/atproto/funding-receipt-record", async (orig) => {
  const real = await orig<typeof import("@/lib/atproto/funding-receipt-record")>()
  return {
    ...real,
    createFundingReceipt: vi.fn(async (record: { amount: string }) => {
      created.push(record)
      return { uri: "at://x/y/z", cid: "c" }
    }),
  }
})
vi.mock("@/components/explore-page/funding-receipt-parts", () => ({
  HydratedIdentityRow: () => <span>identity</span>,
}))

beforeAll(() => {
  // jsdom lacks <dialog>.showModal / close
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "")
  }
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open")
  }
})

import FundingReceiptFormModal from "@/components/funding/funding-receipt-form-modal"

function renderModal() {
  render(
    <FundingReceiptFormModal
      writerDid="did:plc:writer"
      writerIsGroup={false}
      canRecordAsRecipient={false}
      isEvaluator={false}
      activityAuthorDid="did:plc:author"
      forActivity={{ uri: "at://did:plc:author/org.hypercerts.claim.activity/1", cid: "bafy" }}
      onClose={() => {}}
    />,
  )
  return document.getElementById("funding-amount") as HTMLInputElement
}

describe("funding amount normalisation", () => {
  beforeEach(() => {
    created.length = 0
  })

  it("accepts comma-grouped thousands", async () => {
    const amount = renderModal()
    fireEvent.change(amount, { target: { value: "1,000.50" } })
    fireEvent.submit(amount.closest("form")!)
    await waitFor(() => expect(created.length).toBe(1))
    expect(created[0].amount).toBe("1000.50")
  })

  it.each(["12,50", "1.000,50"])("rejects decimal-comma input %s instead of recording a wrong value", async (value) => {
    const amount = renderModal()
    fireEvent.change(amount, { target: { value } })
    fireEvent.submit(amount.closest("form")!)
    expect(await screen.findByText(/using a dot for decimals/)).toBeTruthy()
    expect(created.length).toBe(0)
  })
})
