import * as activity from "@hypercerts-org/lexicon/org/hypercerts/claim/activity";
import * as defs from "@hypercerts-org/lexicon/org/hypercerts/defs";
import { describe, expect, it } from "vitest";
import { blobLimits, fieldOf, lexiconValidator, textLimit } from "./lexicon-fields";

describe("lexicon fields", () => {
  const title = fieldOf(activity.main.schema, "title");
  const summary = fieldOf(activity.main.schema, "shortDescription");
  const share = fieldOf(activity.contributor.schema, "contributionWeight");

  it("reads a field's limit in what the lexicon counts", () => {
    expect(textLimit(summary)).toEqual({ max: 300, unit: "graphemes" });
    expect(textLimit(title)).toEqual({ max: 256, unit: "bytes" });
    // Through an optional field's wrapper.
    expect(textLimit(share)).toEqual({ max: 100, unit: "bytes" });
  });

  it("reads a blob's accepted types and size", () => {
    const image = blobLimits(fieldOf(defs.smallImage.schema, "image"));
    expect(image.accept).toContain("image/png");
    expect(image.maxSize).toBe(5 * 1024 * 1024);
  });

  it("validates with the lexicon, in words people can act on", () => {
    const check = lexiconValidator(summary);
    expect(check({ value: "Planted 5,000 trees." })).toBeUndefined();
    expect(check({ value: "é".repeat(301) })).toBe("Use at most 300 characters.");
    expect(lexiconValidator(title)({ value: "x".repeat(257) })).toBe("This is too long.");
  });

  it("leaves an empty optional field alone", () => {
    expect(lexiconValidator(share)({ value: "" })).toBeUndefined();
  });

  it("throws for a field the schema doesn't have", () => {
    expect(() => fieldOf(activity.main.schema, "nope" as "title")).toThrow();
  });
});
