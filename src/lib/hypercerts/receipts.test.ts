import { describe, expect, it } from "vitest";
import { formatMoney, toReceipt, totalsByCurrency } from "./views";

const view = (record: Record<string, unknown>) => ({
  uri: "at://did:plc:maearth/org.hypercerts.funding.receipt/1",
  did: "did:plc:maearth",
  record: { createdAt: "2026-11-19T08:50:13Z", to: { did: "did:plc:org" }, ...record },
});

describe("formatMoney", () => {
  it("shows ISO currencies as money and tokens by ticker", () => {
    expect(formatMoney("100.00", "USD")).toBe("$100.00");
    expect(formatMoney("10000", "JPY")).toBe("¥10,000");
    expect(formatMoney("0.05", "USDC")).toBe("0.05 USDC");
    expect(formatMoney("1", null)).toBe("1");
  });
});

describe("toReceipt", () => {
  it("reads a platform's donation: sender, recipient, platform, project", () => {
    const receipt = toReceipt(
      view({
        amount: "100.00",
        currency: "USD",
        type: "donation",
        from: { $type: "app.certified.defs#did", did: "did:plc:donor" },
        via: { did: "did:plc:maearth" },
        for: { uri: "at://did:plc:org/org.hypercerts.collection/p1", cid: "x" },
        occurredAt: "2026-11-19T08:42:42Z",
      }),
    );
    expect(receipt).toMatchObject({
      amount: "$100.00",
      type: "Donation",
      from: { kind: "account", did: "did:plc:donor" },
      to: { kind: "account", did: "did:plc:org" },
      viaDid: "did:plc:maearth",
      forUri: "at://did:plc:org/org.hypercerts.collection/p1",
      date: "19 Nov 2026",
    });
  });

  it("keeps an anonymous sender and a wallet address apart", () => {
    expect(toReceipt(view({})).from).toEqual({ kind: "anonymous" });
    expect(toReceipt(view({ from: { value: "0xef48" } })).from).toEqual({
      kind: "text",
      value: "0xef48",
    });
  });

  it("links an onchain transaction to its explorer", () => {
    const hash = `0x${"ab".repeat(32)}`;
    const receipt = toReceipt(
      view({ amount: "1", currency: "USDC", paymentNetwork: "celo", transactionId: hash }),
    );
    expect(receipt.network).toBe("Celo");
    expect(receipt.transaction).toEqual({
      id: hash,
      short: "0xabab…abab",
      href: `https://celoscan.io/tx/${hash}`,
    });
  });

  it("links nothing it can't verify", () => {
    const receipt = toReceipt(view({ paymentNetwork: "stripe", transactionId: "pi_123" }));
    expect(receipt.transaction).toEqual({ id: "pi_123", short: "pi_123", href: null });
  });
});

describe("totalsByCurrency", () => {
  it("adds up each currency, largest first", () => {
    const receipts = [
      toReceipt(view({ amount: "100", currency: "USD" })),
      toReceipt(view({ amount: "25.5", currency: "USD" })),
      toReceipt(view({ amount: "1", currency: "USDC" })),
      toReceipt(view({})),
    ];
    expect(totalsByCurrency(receipts)).toEqual([
      { currency: "USD", amount: "$125.50" },
      { currency: "USDC", amount: "1 USDC" },
    ]);
  });
});
