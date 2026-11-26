import { describe, expect, it } from "vitest";
import { fitsList } from "./lists";

const at = (collection: string) => `at://did:plc:abc/${collection}/r1`;

describe("fitsList", () => {
  it("takes only what each kind of list holds", () => {
    expect(fitsList("list:certs", at("org.hypercerts.claim.activity"), {})).toBe(true);
    expect(fitsList("list:certs", at("org.hypercerts.collection"), { type: "project" })).toBe(
      false,
    );
    expect(fitsList("list:projects", at("org.hypercerts.collection"), { type: "project" })).toBe(
      true,
    );
    expect(fitsList("list:projects", at("org.hypercerts.claim.activity"), {})).toBe(false);
    expect(fitsList("list:accounts", at("app.certified.actor.profile"), null)).toBe(true);
    expect(fitsList("list:accounts", at("app.bsky.actor.profile"), null)).toBe(true);
    expect(fitsList("list:endorsements", at("app.certified.badge.award"), {})).toBe(true);
    expect(fitsList("list:endorsements", at("app.certified.actor.profile"), null)).toBe(false);
  });

  it("keeps other lists out of a projects list", () => {
    expect(fitsList("list:projects", at("org.hypercerts.collection"), { type: "list:certs" })).toBe(
      false,
    );
  });

  it("lets a list type it doesn't know take anything", () => {
    expect(fitsList("list:other", at("org.hypercerts.claim.activity"), {})).toBe(true);
  });
});
