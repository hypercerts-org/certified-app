import { describe, expect, it } from "vitest";
import { sortBadges, toBadgeCard } from "./views";

// The rules for which awards show as badges, and in what order.

const ISSUER = "did:plc:issuer";

function award(
  definition: Record<string, unknown>,
  options: { response?: string; record?: Record<string, unknown>; author?: string } = {},
) {
  return {
    uri: `at://${options.author ?? ISSUER}/app.certified.badge.award/${Math.random()}`,
    cid: "bafy",
    did: options.author ?? ISSUER,
    indexedAt: null,
    author: { did: options.author ?? ISSUER, profile: null, organization: null },
    record: {
      createdAt: "2026-06-12T00:00:00Z",
      subject: { did: "did:plc:me" },
      ...options.record,
    },
    badge: {
      uri: `at://${ISSUER}/app.certified.badge.definition/1`,
      cid: "bafy",
      did: ISSUER,
      indexedAt: null,
      record: { badgeType: "certification", title: "Good Market Approved", ...definition },
    },
    responseStatus: options.response ?? "accepted",
    recipientResponse: null,
  } as unknown as Parameters<typeof toBadgeCard>[0];
}

const NOW = new Date("2026-11-19T00:00:00Z").getTime();

describe("toBadgeCard", () => {
  it("shows a badge with its own title, type and issuer", () => {
    const card = toBadgeCard(award({}, { record: { note: "Reviewed" } }), NOW);
    expect(card).toMatchObject({
      title: "Good Market Approved",
      type: "Certification",
      note: "Reviewed",
      status: "accepted",
      expired: false,
    });
    expect(card?.issuer.did).toBe(ISSUER);
  });

  it("leaves plain endorsements to the Endorsements section, not other endorsement badges", () => {
    expect(toBadgeCard(award({ badgeType: "endorsement", title: "Endorsement" }), NOW)).toBeNull();
    expect(
      toBadgeCard(award({ badgeType: "endorsement", title: "Trusted Evaluator" }), NOW)?.title,
    ).toBe("Trusted Evaluator");
  });

  it("never shows a rejected award", () => {
    expect(toBadgeCard(award({}, { response: "rejected" }), NOW)).toBeNull();
  });

  it("keeps an award awaiting a response apart", () => {
    expect(toBadgeCard(award({}, { response: "unanswered" }), NOW)?.status).toBe("unanswered");
  });

  it("drops an award from an issuer the definition doesn't allow", () => {
    const definition = { allowedIssuers: [{ did: "did:plc:someone-else" }] };
    expect(toBadgeCard(award(definition), NOW)).toBeNull();
    expect(toBadgeCard(award({ allowedIssuers: [{ did: ISSUER }] }), NOW)).not.toBeNull();
  });

  it("marks a badge past its validity as expired", () => {
    const card = toBadgeCard(award({}, { record: { validUntil: "2025-03-01T00:00:00Z" } }), NOW);
    expect(card).toMatchObject({ expired: true, validUntil: "Mar 2025" });
  });
});

describe("sortBadges", () => {
  it("puts badges in force first, by weight then newest, and expired ones last", () => {
    const at = (date: string, extra: Record<string, unknown> = {}) => {
      const card = toBadgeCard(
        award({ title: date }, { record: { createdAt: date, ...extra } }),
        NOW,
      );
      if (!card) throw new Error("expected a badge");
      return card;
    };
    const expired = at("2026-09-01T00:00:00Z", { validUntil: "2026-10-01T00:00:00Z" });
    const older = at("2026-01-01T00:00:00Z");
    const newer = at("2026-08-01T00:00:00Z");
    const weighted = { ...at("2025-01-01T00:00:00Z"), weight: 5 };
    expect(sortBadges([expired, older, newer, weighted]).map((card) => card.title)).toEqual([
      "2025-01-01T00:00:00Z",
      "2026-08-01T00:00:00Z",
      "2026-01-01T00:00:00Z",
      "2026-09-01T00:00:00Z",
    ]);
  });
});
